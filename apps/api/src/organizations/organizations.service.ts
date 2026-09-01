import {
    Injectable,
    NotFoundException,
    ConflictException,
    BadRequestException,
    ForbiddenException,
    Inject,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import type { Prisma } from 'db';
import { PrismaService } from 'src/prisma/prisma.service';
import { OrgStatus, ModuleType } from 'db';
import {
    CreateOrganizationDto,
    UpdateOrganizationDto,
    OrgPaginationDto,
    OrgEmployeePaginationDto,
} from './dto/organizations.dto';

const CACHE_KEYS = {
    PLATFORM_STATS: 'platform:stats',
    ORG_LIST: 'org:list',
} as const;

@Injectable()
export class OrganizationsService {
    constructor(
        private prisma: PrismaService,
        @Inject(CACHE_MANAGER) private cache: Cache,
    ) {}

    // ── Platform-wide stats ──────────────────────────────────────────────────

    async getPlatformStats() {
        const cached = await this.cache.get(CACHE_KEYS.PLATFORM_STATS);
        if (cached) return cached;

        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        const [
            organizationCount,
            employeeCount,
            departmentCount,
            suggestionCount,
            activeCount,
            suspendedCount,
            inactiveCount,
            recentOrgs,
            recentEmployees,
            suggestionsByStatus,
            simsCount,
            emsCount,
            calendarCount,
        ] = await Promise.all([
            this.prisma.organization.count(),
            this.prisma.employee.count(),
            this.prisma.department.count(),
            this.prisma.suggestion.count(),
            this.prisma.organization.count({ where: { status: OrgStatus.ACTIVE } }),
            this.prisma.organization.count({ where: { status: OrgStatus.SUSPENDED } }),
            this.prisma.organization.count({ where: { status: OrgStatus.INACTIVE } }),
            this.prisma.organization.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
            this.prisma.employee.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
            this.prisma.suggestion.groupBy({
                by: ['status'],
                _count: { id: true },
            }),
            this.prisma.organization.count({ where: { modules: { has: ModuleType.SIMS } } }),
            this.prisma.organization.count({ where: { modules: { has: ModuleType.EMS } } }),
            this.prisma.organization.count({ where: { modules: { has: ModuleType.CALENDAR } } }),
        ]);

        const suggestionMap = Object.fromEntries(
            suggestionsByStatus.map((s) => [s.status, s._count.id]),
        );

        const implemented = suggestionMap['IMPLEMENTED'] ?? 0;
        const implementationRate =
            suggestionCount > 0 ? Math.round((implemented / suggestionCount) * 100) : 0;

        const result = {
            organizationCount,
            employeeCount,
            departmentCount,
            suggestionCount,
            implementationRate,
            byStatus: {
                active: activeCount,
                suspended: suspendedCount,
                inactive: inactiveCount,
            },
            last30Days: {
                newOrganizations: recentOrgs,
                newEmployees: recentEmployees,
            },
            suggestionsByStatus: suggestionMap,
            moduleUsage: {
                SIMS: simsCount,
                EMS: emsCount,
                CALENDAR: calendarCount,
            },
        };

        await this.cache.set(CACHE_KEYS.PLATFORM_STATS, result, 60_000);
        return result;
    }

    // ── List all organizations ───────────────────────────────────────────────

    async listAll(dto: OrgPaginationDto) {
        const page  = dto.page  ?? 1;
        const limit = dto.limit ?? 20;
        const skip  = (page - 1) * limit;

        const [organizations, total] = await Promise.all([
            this.prisma.organization.findMany({
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    _count: {
                        select: {
                            employees:        true,
                            departments:      true,
                            userOrganizations: true,
                            suggestions:      true,
                        },
                    },
                },
            }),
            this.prisma.organization.count(),
        ]);

        return {
            data: organizations,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
            },
        };
    }

    // ── Get single organization ──────────────────────────────────────────────

    async getById(id: string) {
        const org = await this.prisma.organization.findUnique({
            where: { id },
            include: {
                departments: {
                    include: {
                        _count: { select: { employees: true } },
                    },
                    orderBy: { name: 'asc' },
                },
                _count: {
                    select: {
                        employees:         true,
                        departments:       true,
                        userOrganizations: true,
                        suggestions:       true,
                    },
                },
            },
        });

        if (!org) throw new NotFoundException('Organization not found');
        return org;
    }

    // ── Per-org aggregate stats ──────────────────────────────────────────────

    async getOrgStats(id: string) {
        await this.findOrFail(id);

        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        const [counts, suggestionsByStatus, suggestionsByCategory, newEmployees, recentSuggestions] =
            await Promise.all([
                this.prisma.organization.findUnique({
                    where: { id },
                    include: {
                        _count: {
                            select: {
                                employees:         true,
                                departments:       true,
                                userOrganizations: true,
                                suggestions:       true,
                            },
                        },
                    },
                }),
                this.prisma.suggestion.groupBy({
                    by: ['status'],
                    where: { organizationId: id },
                    _count: { id: true },
                }),
                this.prisma.suggestion.findMany({
                    where: { organizationId: id },
                    select: { categories: true },
                }),
                this.prisma.employee.count({
                    where: { organizationId: id, createdAt: { gte: thirtyDaysAgo } },
                }),
                this.prisma.suggestion.count({
                    where: { organizationId: id, createdAt: { gte: thirtyDaysAgo } },
                }),
            ]);

        const statusMap   = Object.fromEntries(suggestionsByStatus.map((s) => [s.status, s._count.id]));
        const categoryMap: Record<string, number> = {};
        for (const s of suggestionsByCategory) {
            for (const cat of s.categories) {
                categoryMap[cat] = (categoryMap[cat] ?? 0) + 1;
            }
        }

        const totalSuggestions = counts!._count.suggestions;
        const implemented      = statusMap['IMPLEMENTED'] ?? 0;
        const approved         = (statusMap['APPROVED'] ?? 0) + implemented;
        const implementationRate =
            totalSuggestions > 0 ? Math.round((implemented / totalSuggestions) * 100) : 0;
        const approvalRate =
            totalSuggestions > 0 ? Math.round((approved / totalSuggestions) * 100) : 0;

        return {
            employeeCount:   counts!._count.employees,
            departmentCount: counts!._count.departments,
            userCount:       counts!._count.userOrganizations,
            suggestionCount: totalSuggestions,
            implementationRate,
            approvalRate,
            last30Days: {
                newEmployees,
                newSuggestions: recentSuggestions,
            },
            suggestionsByStatus:   statusMap,
            suggestionsByCategory: categoryMap,
        };
    }

    // ── Departments ──────────────────────────────────────────────────────────

    async getDepartments(id: string) {
        await this.findOrFail(id);

        return this.prisma.department.findMany({
            where: { organizationId: id },
            include: {
                _count: { select: { employees: true } },
            },
            orderBy: { name: 'asc' },
        });
    }

    // ── Employees ────────────────────────────────────────────────────────────

    async getEmployees(id: string, dto: OrgEmployeePaginationDto) {
        await this.findOrFail(id);

        const page  = dto.page  ?? 1;
        const limit = dto.limit ?? 20;
        const skip  = (page - 1) * limit;

        const where: Record<string, unknown> = { organizationId: id };
        if (dto.departmentId) where.departmentId = dto.departmentId;

        const [employees, total] = await Promise.all([
            this.prisma.employee.findMany({
                where,
                include: {
                    department: true,
                    user: {
                        include: {
                            organizations: {
                                where: { organizationId: id },
                                include: { role: true },
                            },
                        },
                    },
                },
                skip,
                take: limit,
                orderBy: { lastName: 'asc' },
            }),
            this.prisma.employee.count({ where }),
        ]);

        return {
            data: employees,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        };
    }

    // ── Suggestions ──────────────────────────────────────────────────────────

    async getSuggestions(id: string, dto: OrgPaginationDto) {
        await this.findOrFail(id);

        const page  = dto.page  ?? 1;
        const limit = dto.limit ?? 20;
        const skip  = (page - 1) * limit;

        const [suggestions, total] = await Promise.all([
            this.prisma.suggestion.findMany({
                where: { organizationId: id },
                include: {
                    employee: {
                        select: { id: true, firstName: true, lastName: true, department: true },
                    },
                    reviews: {
                        orderBy: { createdAt: 'desc' },
                        take: 1,
                        include: {
                            reviewer: { select: { id: true, firstName: true, lastName: true } },
                        },
                    },
                },
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
            }),
            this.prisma.suggestion.count({ where: { organizationId: id } }),
        ]);

        return {
            data: suggestions,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        };
    }

    // ── Roles (global) ──────────────────────────────────────────────────────────

    async getRoles(id: string) {
        await this.findOrFail(id);

        // Return all global roles (no longer per-organization)
        const roleCountSelect: Prisma.RoleCountOutputTypeSelect = { userOrganizations: true };

        return this.prisma.role.findMany({
            include: {
                _count: { select: roleCountSelect },
                permissions: { include: { permission: true } },
            },
            orderBy: { id: 'asc' },
        });
    }

    // ── GembaPMS platform team ───────────────────────────────────────────────
    // Existing users who hold SUPER_ADMIN in any org — candidates for the
    // GembaPMS platform-team department every client org gets.

    async getPlatformSuperAdmins() {
        const memberships = await this.prisma.userOrganization.findMany({
            where: { role: { name: 'SUPER_ADMIN' } },
            distinct: ['userId'],
            select: {
                user: { select: { id: true, name: true, email: true, phone: true } },
            },
        });
        return memberships.map((m) => m.user);
    }

    private async addGembaTeam(
        tx: Prisma.TransactionClient,
        organizationId: string,
        userIds: string[],
    ) {
        if (userIds.length === 0) return;

        const department = await tx.department.create({
            data: { name: 'GembaPMS', organizationId, isPlatformTeam: true },
        });

        const superAdminRole = await tx.role.findUniqueOrThrow({ where: { name: 'SUPER_ADMIN' } });
        const users = await tx.user.findMany({ where: { id: { in: userIds } } });

        for (const user of users) {
            await tx.userOrganization.upsert({
                where: { userId_organizationId: { userId: user.id, organizationId } },
                create: { userId: user.id, organizationId, roleId: superAdminRole.id },
                update: { roleId: superAdminRole.id },
            });

            const [firstName, ...rest] = user.name.split(' ');
            await tx.employee.create({
                data: {
                    firstName,
                    lastName: rest.join(' ') || firstName,
                    email: user.email,
                    phone: user.phone,
                    organizationId,
                    userId: user.id,
                    departmentId: department.id,
                },
            });
        }
    }

    // ── Create organization ──────────────────────────────────────────────────

    async create(dto: CreateOrganizationDto) {
        // Check for duplicate org name (case-insensitive)
        const existing = await this.prisma.organization.findFirst({
            where: { name: { equals: dto.name, mode: 'insensitive' } },
        });
        if (existing) throw new ConflictException('An organization with this name already exists');

        // Check admin email is not already in use
        const existingUser = await this.prisma.user.findUnique({
            where: { email: dto.adminEmail },
        });
        if (existingUser) throw new ConflictException('A user with this email already exists');

        const gembaTeamUserIds =
            dto.gembaTeamUserIds ?? (await this.getPlatformSuperAdmins()).map((u) => u.id);

        return this.prisma.$transaction(async (tx) => {
            const org = await (tx.organization as any).create({
                data: {
                    name:      dto.name,
                    shortName: dto.shortName,
                    logoUrl:   dto.logoUrl,
                    industry:  dto.industry,
                    email:     dto.email,
                    phone:     dto.phone,
                    address:   dto.address,
                    ...(dto.timeZone !== undefined && { timeZone: dto.timeZone }),
                    modules:   dto.modules ?? [],
                },
            });

            const adminRole = await tx.role.findUniqueOrThrow({ where: { name: 'ADMIN' } });

            const user = await tx.user.create({
                data: {
                    name:  `${dto.adminFirstName} ${dto.adminLastName}`,
                    email: dto.adminEmail,
                    phone: dto.adminPhone,
                },
            });

            await tx.userOrganization.create({
                data: {
                    userId:         user.id,
                    organizationId: org.id,
                    roleId:         adminRole.id,
                },
            });

            await tx.employee.create({
                data: {
                    firstName:      dto.adminFirstName,
                    lastName:       dto.adminLastName,
                    email:          dto.adminEmail,
                    phone:          dto.adminPhone,
                    organizationId: org.id,
                    userId:         user.id,
                },
            });

            await this.addGembaTeam(tx, org.id, gembaTeamUserIds);

                await this.cache.del(CACHE_KEYS.PLATFORM_STATS);
            await this.cache.del(CACHE_KEYS.ORG_LIST);

            // Re-fetch with _count so the response matches the list shape
            return tx.organization.findUniqueOrThrow({
                where: { id: org.id },
                include: {
                    _count: {
                        select: {
                            employees:         true,
                            departments:       true,
                            userOrganizations: true,
                            suggestions:       true,
                        },
                    },
                },
            });
        });
    }

    // ── Update organization details ──────────────────────────────────────────

    async update(id: string, dto: UpdateOrganizationDto) {
        await this.findOrFail(id);

        // Prevent duplicate name if name is being changed
        if (dto.name) {
            const duplicate = await this.prisma.organization.findFirst({
                where: { name: { equals: dto.name, mode: 'insensitive' }, NOT: { id } },
            });
            if (duplicate) throw new ConflictException('An organization with this name already exists');
        }

        return (this.prisma.organization as any).update({
            where: { id },
            data: {
                ...(dto.name         !== undefined && { name:         dto.name }),
                ...(dto.shortName    !== undefined && { shortName:    dto.shortName }),
                ...(dto.logoUrl      !== undefined && { logoUrl:      dto.logoUrl }),
                ...(dto.industry     !== undefined && { industry:     dto.industry }),
                ...(dto.email        !== undefined && { email:        dto.email }),
                ...(dto.phone        !== undefined && { phone:        dto.phone }),
                ...(dto.address      !== undefined && { address:      dto.address }),
                ...(dto.timeZone     !== undefined && { timeZone:     dto.timeZone }),
                ...(dto.modules      !== undefined && { modules:      dto.modules }),
                ...(dto.primaryColor !== undefined && { primaryColor: dto.primaryColor }),
            },
        });
    }

    // ── Update status (ACTIVE / SUSPENDED / INACTIVE) ────────────────────────

    async updateStatus(id: string, status: OrgStatus) {
        const org = await this.findOrFail(id);

        if (org.status === status) {
            throw new BadRequestException(`Organization is already ${status}`);
        }

        const updated = await this.prisma.organization.update({
            where: { id },
            data: { status },
        });

        await this.cache.del(CACHE_KEYS.PLATFORM_STATS);
        await this.cache.del(CACHE_KEYS.ORG_LIST);

        return {
            message: `Organization status updated to ${status}`,
            organization: updated,
        };
    }

    // ── Delete organization ──────────────────────────────────────────────────
    // Hard delete: only allowed when org is INACTIVE to prevent accidental data loss.
    // Deletes all dependent records in safe order inside a transaction.

    async delete(id: string, confirmName?: string) {
        const org = await this.findOrFail(id);

        if (org.isAdminOrg) {
            throw new ForbiddenException(
                'The platform admin organization cannot be deleted.',
            );
        }

        if (confirmName !== org.name) {
            throw new BadRequestException(
                'Organization name confirmation is required before permanent deletion.',
            );
        }

        if (org.status !== OrgStatus.INACTIVE) {
            throw new BadRequestException(
                'Only INACTIVE organizations can be permanently deleted. Set status to INACTIVE first.',
            );
        }

        // Collect user IDs before the transaction to avoid a long-running read inside it
        const memberships = await this.prisma.userOrganization.findMany({
            where: { organizationId: id },
            select: { userId: true },
        });
        const userIds = memberships.map((m) => m.userId);

        let orphanUserIds: string[] = [];
        if (userIds.length > 0) {
            // Users who belong to no other org — their only membership is this one
            const orphanUsers = await this.prisma.user.findMany({
                where: {
                    id: { in: userIds },
                    organizations: { none: { organizationId: { not: id } } },
                },
                select: { id: true },
            });
            orphanUserIds = orphanUsers.map((u) => u.id);
        }

        await this.prisma.$transaction(async (tx) => {
            await (tx as any).visitMonthPlan.deleteMany({ where: { clientOrgId: id } });
            await tx.consultancyVisit.deleteMany({ where: { clientOrgId: id } });
            await tx.visitRequest.deleteMany({ where: { organizationId: id } });
            await tx.steeringCommitteeMember.deleteMany({
                where: { committee: { organizationId: id } },
            });
            await tx.steeringCommittee.deleteMany({ where: { organizationId: id } });
            await tx.notification.deleteMany({ where: { employee: { organizationId: id } } });
            await tx.suggestionReview.deleteMany({ where: { suggestion: { organizationId: id } } });
            await tx.suggestionReview.deleteMany({ where: { reviewer: { organizationId: id } } });
            await tx.suggestion.deleteMany({ where: { organizationId: id } });
            await tx.employee.deleteMany({ where: { organizationId: id } });
            await tx.userOrganization.deleteMany({ where: { organizationId: id } });
            if (orphanUserIds.length > 0) {
                await tx.refreshToken.deleteMany({ where: { userId: { in: orphanUserIds } } });
                await tx.calendarBlock.deleteMany({ where: { createdById: { in: orphanUserIds } } });
                await tx.visitRequest.deleteMany({ where: { createdById: { in: orphanUserIds } } });
                await tx.consultancyVisit.deleteMany({ where: { createdById: { in: orphanUserIds } } });
                await tx.user.deleteMany({ where: { id: { in: orphanUserIds } } });
            }
            await tx.department.deleteMany({ where: { organizationId: id } });
            await tx.organization.delete({ where: { id } });
        }, { timeout: 30000 });

        return { message: `Organization "${org.name}" permanently deleted` };
    }

    // ── Orphan user cleanup ───────────────────────────────────────────────────
    // Removes User records that have no org memberships and no linked employees.
    // These accumulate when the org delete bug left users behind.

    async deleteOrphanUsers() {
        // 1. Remove UserOrganization rows whose org no longer exists (stale join rows left
        //    behind when orgs were deleted without going through the proper delete flow)
        const staleRows = (await this.prisma.$queryRaw`
            SELECT "userId", "organizationId"
            FROM "UserOrganization"
            WHERE "organizationId" NOT IN (SELECT id FROM "Organization")
        `) as Array<{ userId: string; organizationId: string }>;

        if (staleRows.length > 0) {
            const staleOrgIds = [...new Set(staleRows.map((r) => r.organizationId))];
            await this.prisma.userOrganization.deleteMany({
                where: { organizationId: { in: staleOrgIds } },
            });
        }

        // 2. Remove User rows that now have no memberships and no linked employees
        const orphans = await this.prisma.user.findMany({
            where: {
                organizations: { none: {} },
                employees:     { none: {} },
            },
            select: { id: true },
        });

        if (orphans.length === 0 && staleRows.length === 0) {
            return { deleted: 0, staleMembershipsRemoved: 0, message: 'Nothing to clean up.' };
        }

        const ids = orphans.map((u) => u.id);
        if (ids.length > 0) {
            await this.prisma.$transaction(async (tx) => {
                // Nullify Employee.userId so employee records are not lost
                await tx.employee.updateMany({
                    where: { userId: { in: ids } },
                    data:  { userId: null },
                });
                // Delete all tables with a non-cascading FK to User
                await tx.userOrganization.deleteMany({ where: { userId: { in: ids } } });
                await tx.refreshToken.deleteMany({ where: { userId: { in: ids } } });
                await tx.calendarBlock.deleteMany({ where: { createdById: { in: ids } } });
                await tx.visitRequest.deleteMany({ where: { createdById: { in: ids } } });
                await tx.consultancyVisit.deleteMany({ where: { createdById: { in: ids } } });
                await tx.user.deleteMany({ where: { id: { in: ids } } });
            });
        }

        return {
            deleted: ids.length,
            staleMembershipsRemoved: staleRows.length,
            message: `Removed ${staleRows.length} stale membership(s) and ${ids.length} orphan user(s).`,
        };
    }

    // ── Set admin org ────────────────────────────────────────────────────────
    // Only one organization can be the platform company at any time.
    // Calling this unsets any previous admin org, then marks the given org.

    async setAdminOrg(id: string) {
        await this.findOrFail(id);

        await this.prisma.$transaction(async (tx) => {
            await (tx.organization as any).updateMany({
                where: { isAdminOrg: true },
                data:  { isAdminOrg: false },
            });
            await (tx.organization as any).update({
                where: { id },
                data:  { isAdminOrg: true },
            });
        });

        await this.cache.del(CACHE_KEYS.ORG_LIST);

        const org = await this.prisma.organization.findUniqueOrThrow({ where: { id } });
        return { message: `"${org.name}" is now the platform company`, organization: org };
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    private async findOrFail(id: string) {
        const org = await this.prisma.organization.findUnique({ where: { id } });
        if (!org) throw new NotFoundException('Organization not found');
        return org;
    }
}