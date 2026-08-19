import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { Role } from 'src/common/enum/role.enum';

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

@Injectable()
export class AuthService {
    constructor(
        private prisma: PrismaService,
        private jwtService: JwtService,
    ) { }

    private hashToken(raw: string): string {
        return crypto.createHash('sha256').update(raw).digest('hex');
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

            if (decoded.purpose !== 'FIRST_TIME_SETUP') {
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

    async getMyOrg(organizationId: string) {
        return this.prisma.organization.findUnique({
            where: { id: organizationId },
            select: { id: true, name: true, status: true, modules: true, logoUrl: true, primaryColor: true, isAdminOrg: true },
        });
    }
}
