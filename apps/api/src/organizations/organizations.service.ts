import {
    Injectable,
    NotFoundException,
    ConflictException,
    BadRequestException,
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

        return this.prisma.$transaction(async (tx) => {
            const org = await tx.organization.create({
                data: {
                    name:     dto.name,
                    logoUrl:  dto.logoUrl,
                    industry: dto.industry,
                    email:    dto.email,
                    phone:    dto.phone,
                    address:  dto.address,
                    modules:  dto.modules ?? [],
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
                ...(dto.logoUrl      !== undefined && { logoUrl:      dto.logoUrl }),
                ...(dto.industry     !== undefined && { industry:     dto.industry }),
                ...(dto.email        !== undefined && { email:        dto.email }),
                ...(dto.phone        !== undefined && { phone:        dto.phone }),
                ...(dto.address      !== undefined && { address:      dto.address }),
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

    async delete(id: string) {
        const org = await this.findOrFail(id);

        if (org.status !== OrgStatus.INACTIVE) {
            throw new BadRequestException(
                'Only INACTIVE organizations can be permanently deleted. Set status to INACTIVE first.',
            );
        }

        await this.prisma.$transaction(async (tx) => {
            // 1. Suggestion audit trail
            await tx.suggestionReview.deleteMany({ where: { suggestion: { organizationId: id } } });
            // 2. Suggestions
            await tx.suggestion.deleteMany({ where: { organizationId: id } });
            // 3. Employees (must come before users due to userId FK)
            await tx.employee.deleteMany({ where: { organizationId: id } });
            // 4. Organization memberships
            await tx.userOrganization.deleteMany({ where: { organizationId: id } });
            // 5. Orphaned users
            await tx.user.deleteMany({ where: { organizations: { none: {} } } });
            // 6. Departments
            await tx.department.deleteMany({ where: { organizationId: id } });
            // 7. Organization itself (roles are global, not deleted)
            await tx.organization.delete({ where: { id } });
        });

        return { message: `Organization "${org.name}" permanently deleted` };
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
