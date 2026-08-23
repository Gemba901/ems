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

export interface JwtPayload {
    userId: string;
    organizationId: string | null;
    roleId: number;
    email: string | null;
    phone: string;
    organizationName: string;
    organizationUrl: string | null;
    roleLevel: Role;
    isAdminOrg: boolean;
    jobTitle: string | null;
    departmentId: string | null;
}

type UserOrganizationRelation = {
    organizationId: string;
    roleId: number;
    organization: { name: string; logoUrl: string | null; isAdminOrg: boolean };
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
    private async getUserIdByEmployeeCode(employeeCode: string): Promise<string> {
        const employees = await this.prisma.employee.findMany({
            where: { employeeCode: employeeCode.trim(), userId: { not: null } },
            select: { userId: true },
        });

        const userIds = [...new Set(employees.map((e) => e.userId as string))];

        if (userIds.length === 0) {
            throw new UnauthorizedException('Account not found! Please contact your administrator.');
        }

        if (userIds.length > 1) {
            throw new UnauthorizedException('This employee code is registered at more than one company. Please log in using your phone number or email instead.');
        }

        return userIds[0];
    }

    private async buildJwt(
        user: { id: string; email: string | null; phone: string; name: string },
        membership: { organizationId: string; roleId: number; role: { name: string }; organization: { name: string; logoUrl: string | null; isAdminOrg: boolean } },
    ) {
        const employee = await this.prisma.employee.findFirst({
            where: { userId: user.id, organizationId: membership.organizationId },
            select: { jobTitle: true, departmentId: true },
        });

        const payload: JwtPayload = {
            userId: user.id,
            organizationId: membership.organizationId,
            roleId: membership.roleId,
            roleLevel: membership.role.name.toUpperCase().replace(/\s+/g, '_') as Role,
            email: user.email,
            phone: user.phone,
            organizationName: membership.organization.name,
            organizationUrl: membership.organization.logoUrl,
            isAdminOrg: membership.organization.isAdminOrg,
            jobTitle: employee?.jobTitle ?? null,
            departmentId: employee?.departmentId ?? null,
        };

        const accessToken = this.jwtService.sign(payload);

        const rawRefreshToken = this.generateRawRefreshToken();
        const tokenHash = this.hashToken(rawRefreshToken);
        const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

        await this.prisma.refreshToken.create({
            data: { tokenHash, userId: user.id, organizationId: membership.organizationId, expiresAt },
        });

        return {
            accessToken,
            refreshToken: rawRefreshToken,
            user: { name: user.name, ...payload },
        };
    }

    async login(phoneOrEmail: string | undefined, password: string, employeeCode?: string) {
        let user: { id: string; email: string | null; phone: string; password: string | null; name: string } | null;

        if (employeeCode) {
            const userId = await this.getUserIdByEmployeeCode(employeeCode);
            user = await this.prisma.user.findUnique({ where: { id: userId } });
        } else {
            const isEmail = phoneOrEmail!.includes('@');
            if (isEmail) {
                const normalized = phoneOrEmail!.trim().toLowerCase();
                user = await this.prisma.user.findFirst({ where: { email: normalized } });
            } else {
                const variants = this.phoneVariants(phoneOrEmail!);
                const candidates = await this.prisma.user.findMany({ where: { phone: { in: variants } } });
                user = candidates.find(u => u.password) ?? candidates[0] ?? null;
            }
        }

        if (!user) throw new UnauthorizedException('Invalid credentials');

        if (!user.password) throw new UnauthorizedException('Password not set. Please complete your account setup first.');

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) throw new UnauthorizedException('Invalid credentials');

        // Fetch memberships separately to get only valid (org still exists) rows
        const memberships = await this.prisma.userOrganization.findMany({
            where: { userId: user.id },
            include: { organization: true, role: true },
        }) as unknown as UserOrganizationRelation[];

        const validMemberships = memberships.filter(
            (m) => m.organization != null && m.role != null,
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

    async refresh(rawRefreshToken: string) {
        const tokenHash = this.hashToken(rawRefreshToken);

        const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

        if (!stored || stored.expiresAt < new Date()) {
            if (stored) await this.prisma.refreshToken.delete({ where: { tokenHash } });
            throw new UnauthorizedException('Invalid or expired refresh token');
        }

        const membership = await this.prisma.userOrganization.findUnique({
            where: { userId_organizationId: { userId: stored.userId, organizationId: stored.organizationId } },
            include: { user: true, organization: true, role: true },
        }) as UserOrganizationMembership | null;

        if (!membership) throw new UnauthorizedException('User membership not found');

        // Rotate: delete old token before issuing new one
        await this.prisma.refreshToken.delete({ where: { tokenHash } });

        return this.buildJwt(membership.user, {
            organizationId: membership.organizationId,
            roleId: membership.roleId,
            role: membership.role,
            organization: membership.organization,
        });
    }

    async revokeRefreshToken(rawRefreshToken: string) {
        const tokenHash = this.hashToken(rawRefreshToken);
        await this.prisma.refreshToken.deleteMany({ where: { tokenHash } });
    }

    async verifyFirstTimeUser(phoneOrEmail?: string, employeeCode?: string) {
        let user: UserWithOrganizationOnly | null;

        if (employeeCode) {
            const userId = await this.getUserIdByEmployeeCode(employeeCode);
            user = await this.prisma.user.findUnique({
                where: { id: userId },
                include: { organizations: { include: { organization: true } } },
            }) as UserWithOrganizationOnly | null;
        } else {
            const isEmail = phoneOrEmail!.includes('@');
            if (isEmail) {
                const normalized = phoneOrEmail!.trim().toLowerCase();
                user = await this.prisma.user.findFirst({
                    where: { email: normalized },
                    include: { organizations: { include: { organization: true } } },
                }) as UserWithOrganizationOnly | null;
            } else {
                const variants = this.phoneVariants(phoneOrEmail!);
                const candidates = await this.prisma.user.findMany({
                    where: { phone: { in: variants } },
                    include: { organizations: { include: { organization: true } } },
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

        const setupToken = this.jwtService.sign(
            { userId: user.id, purpose: 'FIRST_TIME_SETUP' },
            { expiresIn: '15m' },
        );

        return { ...responseData, setupToken };
    }

    async createPassword(setupToken: string, newPassword: string) {
        try {
            const decoded = this.jwtService.verify(setupToken);

            if (decoded.purpose !== 'FIRST_TIME_SETUP' && decoded.purpose !== 'PASSWORD_RESET_SETUP') {
                throw new UnauthorizedException('Invalid setup token');
            }

            const user = await this.prisma.user.findUnique({ where: { id: decoded.userId } });
            if (!user) throw new UnauthorizedException('User not found');
            if (user.password) throw new UnauthorizedException('Password already set. Please login.');

            const hashedPassword = await bcrypt.hash(newPassword, 10);

            await this.prisma.user.update({
                where: { id: decoded.userId },
                data: { password: hashedPassword },
            });

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
            });
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

        await this.prisma.$transaction([
            this.prisma.user.update({ where: { id: user.id }, data: { password: hashedPassword } }),
            this.prisma.passwordResetToken.update({ where: { tokenHash }, data: { usedAt: new Date() } }),
            // Kill every existing session — if an attacker was already inside, this locks them out too.
            this.prisma.refreshToken.deleteMany({ where: { userId: user.id } }),
        ]);

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

        await this.prisma.$transaction([
            this.prisma.passwordResetToken.update({ where: { tokenHash }, data: { usedAt: new Date() } }),
            this.prisma.user.update({ where: { id: stored.userId }, data: { password: null } }),
            this.prisma.refreshToken.deleteMany({ where: { userId: stored.userId } }),
        ]);

        const setupToken = this.jwtService.sign(
            { userId: stored.userId, purpose: 'PASSWORD_RESET_SETUP' },
            { expiresIn: '15m' },
        );

        return { setupToken, message: 'Temporary password verified. Please set a new password.' };
    }

    async getMyOrg(organizationId: string) {
        return this.prisma.organization.findUnique({
            where: { id: organizationId },
            select: { id: true, name: true, status: true, modules: true, logoUrl: true, primaryColor: true, isAdminOrg: true },
        });
    }
}
