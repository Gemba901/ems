import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
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
}

type UserOrganizationRelation = {
    organizationId: string;
    roleId: number;
    organization: { name: string; logoUrl: string | null };
    role: { name: string };
};

type UserWithOrganizations = {
    id: string;
    email: string | null;
    phone: string;
    password: string | null;
    name: string;
    organizations: UserOrganizationRelation[];
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

@Injectable()
export class AuthService {
    constructor(
        private prisma: PrismaService,
        private jwtService: JwtService,
    ) { }

    private buildJwt(user: { id: string; email: string | null; phone: string; name: string }, membership: { organizationId: string; roleId: number; role: { name: string }; organization: { name: string; logoUrl: string | null } }) {
        const payload: JwtPayload = {
            userId: user.id,
            organizationId: membership.organizationId,
            roleId: membership.roleId,
            roleLevel: membership.role.name.toUpperCase().replace(/\s+/g, '_') as Role,
            email: user.email,
            phone: user.phone,
            organizationName: membership.organization.name,
            organizationUrl: membership.organization.logoUrl,
        };
        return {
            accessToken: this.jwtService.sign(payload),
            user: { name: user.name, ...payload },
        };
    }

    async login(phoneOrEmail: string, password: string) {
        const user = await this.prisma.user.findFirst({
            where: { OR: [{ email: phoneOrEmail }, { phone: phoneOrEmail }] },
            include: {
                organizations: {
                    include: { organization: true, role: true },
                },
            },
        }) as UserWithOrganizations | null;

        if (!user) throw new UnauthorizedException('Invalid credentials');

        const isMatch = await bcrypt.compare(password, user.password!);
        if (!isMatch) throw new UnauthorizedException('Invalid credentials');

        if (user.organizations.length === 1) {
            return this.buildJwt(user, user.organizations[0]);
        }

        // multiple orgs — return a short-lived selection token and the org list
        const selectionToken = this.jwtService.sign(
            { userId: user.id, purpose: 'ORG_SELECTION' },
            { expiresIn: '10m' },
        );

        return {
            requiresOrgSelection: true,
            selectionToken,
            organizations: user.organizations.map((m) => ({
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

    async verifyFirstTimeUser(phoneOrEmail: string) {
        const user = await this.prisma.user.findFirst({
            where: { OR: [{ email: phoneOrEmail }, { phone: phoneOrEmail }] },
            include: {
                organizations: { include: { organization: true } },
            },
        }) as UserWithOrganizationOnly | null;

        if (!user) {
            throw new UnauthorizedException('Account not found! Please contact your administrator.');
        }

        const hasPassword = !!user.password;

        const responseData = {
            identifier: phoneOrEmail,
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
