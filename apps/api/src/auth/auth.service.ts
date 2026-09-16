import { HttpException, HttpStatus, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { Role } from 'src/common/enum/role.enum';
import { EmailService } from 'src/notifications/channels/email.service';
import type { AccessTokenPayload } from './access-token-payload';
import { OrgStatus, Prisma } from 'db';
import type { TenantContext } from 'src/tenancy/tenant-context';

// Retain the additional fields already used by the frontend.
export interface JwtPayload extends AccessTokenPayload {
    phone: string;
    organizationName: string;
    organizationSlug: string | null;
    organizationUrl: string | null;
    organizationTimeZone: string;
    jobTitle: string | null;
    departmentId: string | null;
}

type UserOrganizationRelation = {
    organizationId: string;
    roleId: number;
    organization: { slug?: string | null; status: OrgStatus; name: string; logoUrl: string | null; isAdminOrg: boolean; timeZone: string };
    role: { name: string };
};

type UserWithOrganizationOnly = {
    id: string;
    email: string | null;
    phone: string;
    password: string | null;
    name: string;
    organizations: Array<Pick<UserOrganizationRelation, 'organizationId' | 'organization'>>;
};

type UserOrganizationMembership = UserOrganizationRelation & {
    user: { id: string; email: string | null; phone: string; name: string };
};

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

@Injectable()
export class AuthService {
    constructor(
        private prisma: PrismaService,
        private jwtService: JwtService,
        private config: ConfigService,
        private emailService: EmailService,
        @Inject(CACHE_MANAGER) private cache: Cache,
    ) { }

    private hashToken(raw: string): string {
        return crypto.createHash('sha256').update(raw).digest('hex');
    }

    private get webAppUrl(): string {
        return this.config.get<string>('WEB_APP_URL') || 'http://localhost:3000';
    }

    // Best-effort in-memory rate limit (per API instance) — the reset token itself is the real
    // security boundary (256-bit random, hashed at rest); this just blunts spam/brute-force noise.
    private async checkRateLimit(key: string, max: number, windowMs: number): Promise<void> {
        const current = (await this.cache.get<number>(key)) ?? 0;
        if (current >= max) {
            throw new HttpException('Too many requests. Please try again later.', HttpStatus.TOO_MANY_REQUESTS);
        }
        await this.cache.set(key, current + 1, windowMs);
    }

    // Kept in sync with COUNTRY_CODES in apps/web/components/auth/IdentifierStep.tsx
    private static readonly SUPPORTED_COUNTRY_CODES = ['254', '255', '256', '250', '251', '91'];

    private phoneVariants(raw: string): string[] {
        const digits = raw.replace(/\D/g, '');
        const variants = new Set([digits, `+${digits}`]);
        if (digits.startsWith('0')) {
            // Legacy fallback for numbers stored/typed without a country code — assumes Kenya.
            const intl = '254' + digits.slice(1);
            variants.add(intl);
            variants.add(`+${intl}`);
        } else {
            const countryCode = AuthService.SUPPORTED_COUNTRY_CODES.find((code) => digits.startsWith(code));
            if (countryCode) variants.add('0' + digits.slice(countryCode.length));
        }
        return [...variants];
    }

    private generateRawRefreshToken(): string {
        return crypto.randomBytes(64).toString('hex');
    }

    // Employee codes are only guaranteed unique within one organization (see the
    // @@unique([employeeCode, organizationId]) constraint on Employee), so the same code can
    // legitimately belong to different people at different companies. We deliberately don't
    // disambiguate by showing which companies matched — that would leak one tenant's identity
    // to someone who merely typed in a matching code at another tenant. Instead we point the
    // user at their phone/email, which is inherently scoped to their own account.
    private async getUserIdByEmployeeCode(
        employeeCode: string,
        organizationId?: string,
    ): Promise<string> {
        const employees = await this.prisma.employee.findMany({
            where: {
                employeeCode: employeeCode.trim(),
                userId: { not: null },

                // Company login searches only the resolved organization.
                // Existing central flows can still use the unscoped lookup.
                ...(organizationId ? { organizationId } : {}),
            },
            select: { userId: true },
        });

        const userIds = [
            ...new Set(
                employees
                    .map((employee) => employee.userId)
                    .filter((id): id is string => id !== null),
            ),
        ];

        if (userIds.length === 0) {
            throw new UnauthorizedException('Invalid credentials');
        }

        if (userIds.length > 1) {
            throw new UnauthorizedException(
                'This employee code is registered at more than one company. ' +
                'Please log in using your phone number or email instead.',
            );
        }

        return userIds[0];
    }


    private async authenticateUser(
        phoneOrEmail: string | undefined,
        password: string,
        employeeCode?: string,
        organizationId?: string,
    ) {
        let user: {
            id: string;
            email: string | null;
            phone: string;
            password: string | null;
            name: string;
        } | null;

        // Apply membership filtering to company email/phone lookups too.
        const membershipFilter = organizationId
            ? { organizations: { some: { organizationId } } }
            : {};

        if (employeeCode?.trim()) {
            const userId = await this.getUserIdByEmployeeCode(
                employeeCode,
                organizationId,
            );

            user = await this.prisma.user.findUnique({
                where: { id: userId },
            });
        } else {
            const identifier = phoneOrEmail?.trim();

            // LoginDto currently permits both identifiers to be absent.
            // Reject this cleanly instead of calling includes() on undefined.
            if (!identifier) {
                throw new UnauthorizedException('Invalid credentials');
            }

            if (identifier.includes('@')) {
                user = await this.prisma.user.findFirst({
                    where: {
                        email: identifier.toLowerCase(),
                        ...membershipFilter,
                    },
                });
            } else {
                const candidates = await this.prisma.user.findMany({
                    where: {
                        phone: { in: this.phoneVariants(identifier) },
                        ...membershipFilter,
                    },
                });

                // Preserve the current handling of legacy phone formats.
                user =
                    candidates.find((candidate) => candidate.password) ??
                    candidates[0] ??
                    null;
            }
        }

        // Use the same failure message for unknown users and invalid passwords.
        if (!user?.password) {
            throw new UnauthorizedException('Invalid credentials');
        }

        const matches = await bcrypt.compare(password, user.password);

        if (!matches) {
            throw new UnauthorizedException('Invalid credentials');
        }

        return user;
    }


    private async buildJwt(
        user: { id: string; email: string | null; phone: string; name: string },
        membership: { organizationId: string; roleId: number; role: { name: string }; organization: { slug?: string | null; status: OrgStatus; name: string; logoUrl: string | null; isAdminOrg: boolean; timeZone: string } },

        // Normal login uses PrismaService.
        // Refresh passes its transaction so token creation can roll back.
        db: Prisma.TransactionClient = this.prisma,
    ) {
        if (membership.organization.status !== OrgStatus.ACTIVE) {
            throw new UnauthorizedException('Company access denied.');
        }
        if (!Object.values(Role).includes(membership.role.name as Role)) {
            throw new UnauthorizedException('Unsupported company role.');
        }
        const employee = await db.employee.findFirst({
            where: {
                userId: user.id,
                organizationId: membership.organizationId,
            },
            select: {
                jobTitle: true,
                departmentId: true,
            },
        });

        const payload: JwtPayload = {
            tokenType: 'ACCESS',

            userId: user.id,
            organizationId: membership.organizationId,
            roleId: membership.roleId,
            roleLevel: membership.role.name.toUpperCase().replace(/\s+/g, '_') as Role,
            email: user.email,
            phone: user.phone,
            organizationName: membership.organization.name,
            organizationSlug: membership.organization.slug ?? null,
            organizationUrl: membership.organization.logoUrl,
            organizationTimeZone: membership.organization.timeZone,
            isAdminOrg: membership.organization.isAdminOrg,
            jobTitle: employee?.jobTitle ?? null,
            departmentId: employee?.departmentId ?? null,
        };

        const accessToken = this.jwtService.sign(payload);

        const rawRefreshToken = this.generateRawRefreshToken();
        const tokenHash = this.hashToken(rawRefreshToken);
        const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

        await db.refreshToken.create({
            data: { tokenHash, userId: user.id, organizationId: membership.organizationId, expiresAt },
        });

        return {
            accessToken,
            refreshToken: rawRefreshToken,
            user: { name: user.name, ...payload },
        };
    }

    async login(phoneOrEmail: string | undefined, password: string, employeeCode?: string) {
        const user = await this.authenticateUser(
            phoneOrEmail,
            password,
            employeeCode,
        );

        // Fetch memberships separately to get only valid (org still exists) rows
        const memberships = await this.prisma.userOrganization.findMany({
            where: { userId: user.id },
            include: { organization: true, role: true },
        }) as unknown as UserOrganizationRelation[];

        const validMemberships = memberships.filter(
            (m) => m.organization?.status === OrgStatus.ACTIVE && m.role != null,
        );

        if (validMemberships.length === 0) {
            throw new UnauthorizedException('No active organization found for this account.');
        }

        if (validMemberships.length === 1) {
            return this.buildJwt(user, validMemberships[0]);
        }

        // multiple orgs — return a short-lived selection token and the org list
        const selectionToken = this.jwtService.sign(
            { userId: user.id, purpose: 'ORG_SELECTION' },
            { expiresIn: '10m' },
        );

        return {
            requiresOrgSelection: true,
            selectionToken,
            organizations: validMemberships.map((m) => ({
                id: m.organizationId,
                name: m.organization.name,
                organizationUrl: m.organization.logoUrl,
            })),
        };
    }

    async loginForTenant(
        tenant: TenantContext,
        phoneOrEmail: string | undefined,
        password: string,
        employeeCode?: string,
    ) {
        // Fail closed if a caller has not supplied resolved company context.
        if (!tenant?.organizationId) {
            throw new UnauthorizedException('Company context is required.');
        }

        const user = await this.authenticateUser(
            phoneOrEmail,
            password,
            employeeCode,
            tenant.organizationId,
        );

        // A correct password does not grant access to every company.
        const membership = await this.prisma.userOrganization.findUnique({
            where: {
                userId_organizationId: {
                    userId: user.id,
                    organizationId: tenant.organizationId,
                },
            },
            include: {
                organization: true,
                role: true,
            },
        });

        if (
            !membership ||
            membership.organization.status !== OrgStatus.ACTIVE
        ) {
            throw new UnauthorizedException('Company access denied.');
        }

        // Match the role rules already enforced by TenantGuard.
        if (!Object.values(Role).includes(membership.role.name as Role)) {
            throw new UnauthorizedException('Unsupported company role.');
        }

        // Issue tokens directly for this company.
        // Company login never returns an organization-selection token.
        return this.buildJwt(user, membership);
    }

    async selectOrg(selectionToken: string, organizationId: string) {
        let decoded: any;
        try {
            decoded = this.jwtService.verify(selectionToken);
        } catch {
            throw new UnauthorizedException('Invalid or expired selection token');
        }

        if (decoded.purpose !== 'ORG_SELECTION') {
            throw new UnauthorizedException('Invalid selection token');
        }

        const membership = await this.prisma.userOrganization.findUnique({
            where: { userId_organizationId: { userId: decoded.userId, organizationId } },
            include: { user: true, organization: true, role: true },
        }) as UserOrganizationMembership | null;

        if (!membership) throw new UnauthorizedException('You are not a member of this organization');

        return this.buildJwt(membership.user, {
            organizationId: membership.organizationId,
            roleId: membership.roleId,
            role: membership.role,
            organization: membership.organization,
        });
    }

    // Existing central endpoint retains its current service signature.
    // The stored refresh token determines which organization it refreshes.
    async refresh(rawRefreshToken: string) {
        return this.rotateRefreshToken(rawRefreshToken);
    }

    // Company endpoints must supply context resolved by the trusted guard.
    async refreshForTenant(
        tenant: TenantContext,
        rawRefreshToken: string,
    ) {
        if (!tenant?.organizationId) {
            throw new UnauthorizedException('Company context is required.');
        }

        return this.rotateRefreshToken(
            rawRefreshToken,
            tenant.organizationId,
        );
    }

    private async rotateRefreshToken(
        rawRefreshToken: string,
        expectedOrganizationId?: string,
    ) {
        if (
            typeof rawRefreshToken !== 'string' ||
            !rawRefreshToken.trim()
        ) {
            throw new UnauthorizedException('Invalid or expired refresh token');
        }

        const tokenHash = this.hashToken(rawRefreshToken);

        return this.prisma.$transaction(
            async (tx) => {
                const stored = await tx.refreshToken.findUnique({
                    where: { tokenHash },
                });

                if (!stored) {
                    throw new UnauthorizedException(
                        'Invalid or expired refresh token',
                    );
                }

                // Check company ownership before changing the stored token.
                // A token presented to another company must remain untouched.
                if (
                    expectedOrganizationId !== undefined &&
                    stored.organizationId !== expectedOrganizationId
                ) {
                    throw new UnauthorizedException(
                        'Invalid or expired refresh token',
                    );
                }

                if (stored.expiresAt.getTime() <= Date.now()) {
                    throw new UnauthorizedException(
                        'Invalid or expired refresh token',
                    );
                }

                // Recheck membership on every refresh.
                // Previously issued tokens do not prove current access.
                const membership = await tx.userOrganization.findUnique({
                    where: {
                        userId_organizationId: {
                            userId: stored.userId,
                            organizationId: stored.organizationId,
                        },
                    },
                    include: {
                        user: true,
                        organization: true,
                        role: true,
                    },
                });

                if (
                    !membership ||
                    membership.organization.status !== OrgStatus.ACTIVE
                ) {
                    throw new UnauthorizedException('Company access denied.');
                }

                if (
                    !Object.values(Role).includes(
                        membership.role.name as Role,
                    )
                ) {
                    throw new UnauthorizedException(
                        'Unsupported company role.',
                    );
                }

                // Consume the token conditionally.
                // Concurrent refresh requests may both read it, but only one
                // can delete it successfully and proceed to issue a replacement.
                const consumed = await tx.refreshToken.deleteMany({
                    where: {
                        tokenHash,
                        userId: stored.userId,
                        organizationId: stored.organizationId,
                        expiresAt: { gt: new Date() },
                    },
                });

                if (consumed.count !== 1) {
                    throw new UnauthorizedException(
                        'Invalid or expired refresh token',
                    );
                }

                // Use the SAME transaction for the replacement token.
                // If this fails, the deletion above is rolled back.
                return this.buildJwt(
                    membership.user,
                    membership,
                    tx,
                );
            },
            {
                isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
            },
        );
    }

    async revokeRefreshTokenForTenant(tenant: TenantContext, raw: string) {
        if (!tenant?.organizationId) throw new UnauthorizedException('Company context is required.');
        if (typeof raw !== 'string' || !raw.trim()) return;
        await this.prisma.refreshToken.deleteMany({
            where: { tokenHash: this.hashToken(raw), organizationId: tenant.organizationId },
        });
    }

    async revokeRefreshToken(rawRefreshToken: string) {
        const tokenHash = this.hashToken(rawRefreshToken);
        await this.prisma.refreshToken.deleteMany({ where: { tokenHash } });
    }

    async verifyFirstTimeUser(phoneOrEmail?: string, employeeCode?: string, organizationId?: string) {
        if (!employeeCode?.trim() && !phoneOrEmail?.trim()) throw new UnauthorizedException('Account not found');
        const membershipWhere = { ...(organizationId ? { organizationId } : {}), organization: { status: OrgStatus.ACTIVE } };
        const membershipFilter = { organizations: { some: membershipWhere } };
        const include = { organizations: { where: membershipWhere, include: { organization: true } } };
        let user: UserWithOrganizationOnly | null;

        if (employeeCode) {
            const userId = await this.getUserIdByEmployeeCode(employeeCode, organizationId);
            user = await this.prisma.user.findUnique({
                where: { id: userId, ...membershipFilter },
                include,
            }) as UserWithOrganizationOnly | null;
        } else {
            const isEmail = phoneOrEmail!.includes('@');
            if (isEmail) {
                const normalized = phoneOrEmail!.trim().toLowerCase();
                user = await this.prisma.user.findFirst({
                    where: { email: normalized, ...membershipFilter },
                    include,
                }) as UserWithOrganizationOnly | null;
            } else {
                const variants = this.phoneVariants(phoneOrEmail!);
                const candidates = await this.prisma.user.findMany({
                    where: { phone: { in: variants }, ...membershipFilter },
                    include,
                }) as UserWithOrganizationOnly[];
                user = candidates.find(u => u.password) ?? candidates[0] ?? null;
            }
        }

        if (!user) {
            throw new UnauthorizedException('Account not found! Please contact your administrator.');
        }

        const hasPassword = !!user.password;

        const responseData = {
            identifier: employeeCode ?? phoneOrEmail,
            hasPassword,
            name: user.name,
            organizations: user.organizations.map((m) => ({
                id: m.organizationId,
                name: m.organization.name,
                organizationUrl: m.organization.logoUrl,
            })),
        };

        if (hasPassword) return responseData;

        // Looking up an identifier is not proof of account ownership.
        // The existing reset-password email flow provides single-use ownership proof.
        return { ...responseData, verificationRequired: true };

    }

    async verifyFirstTimeForTenant(tenant: TenantContext, phoneOrEmail?: string, employeeCode?: string) {
        if (!tenant?.organizationId) throw new UnauthorizedException('Company context is required.');
        return this.verifyFirstTimeUser(phoneOrEmail, employeeCode, tenant.organizationId);
    }

    async createPasswordForTenant(tenant: TenantContext, token: string, password: string) {
        if (!tenant?.organizationId) throw new UnauthorizedException('Company context is required.');
        let decoded: { userId?: string };
        try { decoded = this.jwtService.verify(token); } catch { throw new UnauthorizedException('Invalid setup token'); }
        if (!decoded.userId || !await this.prisma.userOrganization.findUnique({ where: { userId_organizationId: { userId: decoded.userId, organizationId: tenant.organizationId } } })) {
            throw new UnauthorizedException('Company access denied.');
        }
        return this.createPassword(token, password);
    }

    async createPassword(setupToken: string, newPassword: string) {
        try {
            const decoded = this.jwtService.verify(setupToken);

            if (decoded.purpose !== 'PASSWORD_RESET_SETUP') {
                throw new UnauthorizedException('Invalid setup token');
            }

            const user = await this.prisma.user.findUnique({ where: { id: decoded.userId } });
            if (!user) throw new UnauthorizedException('User not found');
            if (user.password) throw new UnauthorizedException('Password already set. Please login.');

            const hashedPassword = await bcrypt.hash(newPassword, 10);

            const changed = await this.prisma.user.updateMany({
                where: { id: decoded.userId, password: null },
                data: { password: hashedPassword },
            });
            if (changed.count !== 1) throw new UnauthorizedException('Password already set');

            return { message: 'Password created successfully! You can now login.' };
        } catch (error) {
            throw new UnauthorizedException('Invalid or expired setup token! Please try again.');
        }
    }

    async forgotPassword(email: string, ip: string) {
        const normalized = email.trim().toLowerCase();

        await this.checkRateLimit(`pwreset:req:email:${normalized}`, 5, 60 * 60 * 1000);
        await this.checkRateLimit(`pwreset:req:ip:${ip}`, 20, 60 * 60 * 1000);

        const user = await this.prisma.user.findFirst({ where: { email: normalized } });

        // Always the same response whether or not the account exists, so this endpoint can't be
        // used to enumerate registered emails.
        if (user) {
            const rawToken = crypto.randomBytes(32).toString('hex');
            const tokenHash = this.hashToken(rawToken);
            const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

            await this.prisma.passwordResetToken.create({
                data: { tokenHash, userId: user.id, expiresAt },
            });

            const resetUrl = `${this.webAppUrl}/reset-password?token=${rawToken}`;

            await this.emailService.send({
                to: user.email!,
                subject: 'Reset your Gemba PMS password',
                title: 'Reset your password',
                message: `We received a request to reset the password for your account, ${user.name}. This link expires in 30 minutes and can only be used once. If you didn't request this, you can safely ignore this email — your password won't change.`,
                actionUrl: resetUrl,
                actionLabel: 'Reset Password',
            }, { requireDelivery: true });
        }

        return { message: 'If an account with that email exists, a reset link has been sent to it.' };
    }

    async resetPassword(rawToken: string, newPassword: string, ip: string) {
        await this.checkRateLimit(`pwreset:attempt:ip:${ip}`, 10, 15 * 60 * 1000);

        const tokenHash = this.hashToken(rawToken);
        const stored = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });

        if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
            throw new UnauthorizedException('Invalid or expired reset link. Please request a new one.');
        }

        const user = await this.prisma.user.findUnique({ where: { id: stored.userId } });
        if (!user) throw new UnauthorizedException('Account not found');

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await this.prisma.$transaction(async tx => {
            const consumed = await tx.passwordResetToken.updateMany({ where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
            if (consumed.count !== 1) throw new UnauthorizedException('Reset link already used or expired');
            await tx.user.update({ where: { id: user.id }, data: { password: hashedPassword } });
            await tx.refreshToken.deleteMany({ where: { userId: user.id } });
        });

        if (user.email) {
            await this.emailService.send({
                to: user.email,
                subject: 'Your Gemba PMS password was changed',
                title: 'Password changed',
                message: `The password for your account was just changed. If this wasn't you, contact your administrator immediately.`,
            });
        }

        return { message: 'Password reset successfully. You can now log in.' };
    }

    // Alphanumeric, minus visually ambiguous characters (0/O, 1/l/I) — meant to be read aloud or
    // typed by hand by an admin relaying it to an employee out-of-band.
    private static readonly TEMP_PASSWORD_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

    private generateReadableSecret(length: number): string {
        let out = '';
        for (let i = 0; i < length; i++) {
            out += AuthService.TEMP_PASSWORD_ALPHABET[crypto.randomInt(AuthService.TEMP_PASSWORD_ALPHABET.length)];
        }
        return out;
    }

    // Admin-driven password recovery: generates a short-lived, single-use password for one
    // employee. The plaintext is returned once (for the admin to relay out-of-band, e.g. by
    // phone) and only its hash is stored — same PasswordResetToken table the self-service
    // email-link flow uses, since both are "a hashed, expiring, single-use secret tied to a user".
    async generateTempPassword(userId: string) {
        const rawPassword = this.generateReadableSecret(10);
        const tokenHash = this.hashToken(rawPassword);
        const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

        // Only the newest temp password for a user should work.
        await this.prisma.passwordResetToken.deleteMany({ where: { userId, usedAt: null } });
        await this.prisma.passwordResetToken.create({ data: { tokenHash, userId, expiresAt } });

        return { tempPassword: rawPassword, expiresInMinutes: Math.round(RESET_TOKEN_TTL_MS / 60000) };
    }

    // Employee-facing redemption of an admin-issued temp password. On success the employee's
    // real password is cleared and every session killed (so the temp password itself is never a
    // usable login credential), then a setup token is issued for them to pick a new password.
    async verifyTempPassword(tempPassword: string, ip: string) {
        await this.checkRateLimit(`temppwd:attempt:ip:${ip}`, 10, 15 * 60 * 1000);

        const tokenHash = this.hashToken(tempPassword.trim());
        const stored = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });

        if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
            throw new UnauthorizedException('Invalid or expired temporary password.');
        }

        await this.prisma.$transaction(async tx => {
            const consumed = await tx.passwordResetToken.updateMany({ where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
            if (consumed.count !== 1) throw new UnauthorizedException('Temporary password already used or expired');
            await tx.user.update({ where: { id: stored.userId }, data: { password: null } });
            await tx.refreshToken.deleteMany({ where: { userId: stored.userId } });
        });

        const setupToken = this.jwtService.sign(
            { userId: stored.userId, purpose: 'PASSWORD_RESET_SETUP' },
            { expiresIn: '15m' },
        );

        return { setupToken, message: 'Temporary password verified. Please set a new password.' };
    }

    async getMyOrg(organizationId: string) {
        return this.prisma.organization.findUnique({
            where: { id: organizationId },
            select: { id: true, name: true, status: true, modules: true, logoUrl: true, primaryColor: true, isAdminOrg: true, timeZone: true },
        });
    }
}
