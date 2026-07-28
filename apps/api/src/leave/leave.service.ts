import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { LeaveStatus, NotificationType } from 'db';
import {
    CreateLeaveRequestDto, ReviewLeaveRequestDto, LeaveBalanceUpsertDto,
    LeaveQueryDto, UpsertLeavePolicyDto, ApplyLeavePolicyDto,
    UpdateLeaveSettingsDto, UpdateDeptMinHeadcountDto,
} from './dto/leave.dto';
import { NotificationsService } from 'src/notifications/notifications.service';

const ALL_LEAVE_TYPES = [
    'ANNUAL', 'SICK', 'SICK_EMERGENCY', 'PRE_ADOPTIVE',
    'UNPAID', 'MATERNITY', 'PATERNITY', 'COMPASSIONATE', 'STUDY',
];

function calcWorkingDays(start: Date, end: Date, workingDays: number[]): number {
    const daysSet = new Set(workingDays.length > 0 ? workingDays : [1, 2, 3, 4, 5]);
    let days = 0;
    const cur = new Date(start);
    while (cur <= end) {
        if (daysSet.has(cur.getDay())) days++;
        cur.setDate(cur.getDate() + 1);
    }
    return Math.max(1, days);
}

@Injectable()
export class LeaveService {
    constructor(
        private prisma: PrismaService,
        private notifications: NotificationsService,
    ) {}

    // ── Settings ─────────────────────────────────────────────────────────────

    async getLeaveSettings(organizationId: string) {
        const settings = await (this.prisma as any).leaveSettings.findUnique({
            where: { organizationId },
        });
        if (!settings) {
            return {
                organizationId,
                workingDays: [1, 2, 3, 4, 5],
                enabledTypes: [] as string[],
                customLeaveTypes: [] as { code: string; name: string }[],
            };
        }
        return {
            ...settings,
            customLeaveTypes: Array.isArray(settings.customLeaveTypes) ? settings.customLeaveTypes : [],
        };
    }

    async updateLeaveSettings(organizationId: string, dto: UpdateLeaveSettingsDto) {
        return (this.prisma as any).leaveSettings.upsert({
            where: { organizationId },
            create: {
                organizationId,
                workingDays:      dto.workingDays      ?? [1, 2, 3, 4, 5],
                enabledTypes:     dto.enabledTypes     ?? [],
                customLeaveTypes: dto.customLeaveTypes ?? [],
            },
            update: {
                ...(dto.workingDays      !== undefined ? { workingDays:      dto.workingDays }      : {}),
                ...(dto.enabledTypes     !== undefined ? { enabledTypes:     dto.enabledTypes }     : {}),
                ...(dto.customLeaveTypes !== undefined ? { customLeaveTypes: dto.customLeaveTypes } : {}),
            },
        });
    }

    async updateDeptMinHeadcount(deptId: string, organizationId: string, dto: UpdateDeptMinHeadcountDto) {
        const dept = await this.prisma.department.findFirst({
            where: { id: deptId, organizationId },
        });
        if (!dept) throw new NotFoundException('Department not found');
        return (this.prisma.department as any).update({
            where: { id: deptId },
            data: { minLeaveHeadcount: dto.minLeaveHeadcount },
        });
    }

    async getDepartments(organizationId: string) {
        return (this.prisma.department as any).findMany({
            where: { organizationId },
            select: { id: true, name: true, minLeaveHeadcount: true },
            orderBy: { name: 'asc' },
        });
    }

    // ── Submit ────────────────────────────────────────────────────────────────

    async submitRequest(
        userId: string,
        organizationId: string,
        dto: CreateLeaveRequestDto,
    ) {
        const employee = await this.prisma.employee.findFirst({
            where: { userId, organizationId },
            select: { id: true, gender: true },
        });
        if (!employee) throw new NotFoundException('Employee record not found');

        // Gender check for maternity / paternity
        const type = dto.type as string;
        if (type === 'MATERNITY' && employee.gender !== 'FEMALE') {
            throw new BadRequestException('Maternity leave is available for female employees only.');
        }
        if (type === 'PATERNITY' && employee.gender !== 'MALE') {
            throw new BadRequestException('Paternity leave is available for male employees only.');
        }

        // Leave type enabled check
        const settings = await this.getLeaveSettings(organizationId);
        if (settings.enabledTypes.length > 0 && !settings.enabledTypes.includes(type)) {
            throw new BadRequestException(`${type} leave is not enabled for this organisation.`);
        }

        const start = new Date(dto.startDate);
        const end = new Date(dto.endDate);
        if (end < start) throw new BadRequestException('endDate must be after startDate');

        const days = calcWorkingDays(start, end, settings.workingDays);

        // Validate leave balance
        const year = start.getFullYear();
        const balance = await this.prisma.leaveBalance.findUnique({
            where: { employeeId_year_type: { employeeId: employee.id, year, type: dto.type } },
        });

        if (!balance) {
            throw new BadRequestException(
                `No ${type.toLowerCase().replace(/_/g, ' ')} allocation found for ${year}. Please contact HR to set up your leave balance.`,
            );
        }

        const remaining = balance.allocated - balance.used;
        if (days > remaining) {
            throw new BadRequestException(
                `Insufficient balance. You requested ${days} day${days !== 1 ? 's' : ''} but only have ${remaining} remaining.`,
            );
        }

        // Validate handover employees
        if (dto.handoverEmployeeId) {
            const handover = await this.prisma.employee.findFirst({
                where: { id: dto.handoverEmployeeId, organizationId },
                select: { id: true },
            });
            if (!handover) throw new BadRequestException('First cover person not found in this organisation');
        }

        if (dto.handoverEmployee2Id) {
            const handover2 = await this.prisma.employee.findFirst({
                where: { id: dto.handoverEmployee2Id, organizationId },
                select: { id: true },
            });
            if (!handover2) throw new BadRequestException('Second cover person not found in this organisation');
        }

        const request = await (this.prisma.leaveRequest as any).create({
            data: {
                employeeId: employee.id,
                organizationId,
                type: dto.type,
                startDate: start,
                endDate: end,
                days,
                reason: dto.reason,
                handoverEmployeeId:  dto.handoverEmployeeId  ?? null,
                handoverNotes:       dto.handoverNotes       ?? null,
                handoverEmployee2Id: dto.handoverEmployee2Id ?? null,
                handoverNotes2:      dto.handoverNotes2      ?? null,
            },
            include: {
                employee:          { select: { id: true, firstName: true, lastName: true } },
                handoverEmployee:  { select: { id: true, firstName: true, lastName: true, jobTitle: true } },
                handoverEmployee2: { select: { id: true, firstName: true, lastName: true, jobTitle: true } },
            },
        });

        // Check overlaps (for notification context only)
        const overlapping = await this.prisma.leaveRequest.findMany({
            where: {
                organizationId,
                employeeId: { not: employee.id },
                status: { in: [LeaveStatus.PENDING, LeaveStatus.APPROVED] },
                startDate: { lte: end },
                endDate: { gte: start },
            },
            select: {
                employee: { select: { firstName: true, lastName: true } },
                status: true,
            },
            take: 10,
        });

        const requesterName = `${request.employee.firstName} ${request.employee.lastName}`;
        const leaveLabel = type.charAt(0) + type.slice(1).toLowerCase().replace(/_/g, ' ');
        const dateRange = `${start.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} – ${end.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`;

        const reviewerEmployees = await this.prisma.employee.findMany({
            where: {
                organizationId,
                id: { not: employee.id },
                userId: { not: null },
                user: {
                    organizations: {
                        some: {
                            organizationId,
                            role: { name: { in: ['HR', 'HOD', 'ADMIN', 'SUPER_ADMIN'] } },
                        },
                    },
                },
            },
            select: { id: true },
        });

        if (reviewerEmployees.length > 0) {
            await this.notifications.createMany(
                reviewerEmployees.map((r) => ({
                    employeeId: r.id,
                    type: NotificationType.ACTION_REQUIRED,
                    module: 'LEAVE',
                    title: 'Leave request pending review',
                    message: `${requesterName} has requested ${request.days} day${request.days !== 1 ? 's' : ''} of ${leaveLabel} leave (${dateRange}).`,
                    actionUrl: '/leave/manage',
                })),
            );
        }

        if (request.handoverEmployee) {
            await this.notifications.create({
                employeeId: request.handoverEmployee.id,
                type: NotificationType.INFO,
                module: 'LEAVE',
                title: 'You have been assigned as cover',
                message: `${requesterName} has listed you as their first cover person for ${leaveLabel} leave (${dateRange}, ${request.days} day${request.days !== 1 ? 's' : ''}).`,
                actionUrl: '/leave',
            });
        }

        if (request.handoverEmployee2) {
            await this.notifications.create({
                employeeId: request.handoverEmployee2.id,
                type: NotificationType.INFO,
                module: 'LEAVE',
                title: 'You have been assigned as cover',
                message: `${requesterName} has listed you as their second cover person for ${leaveLabel} leave (${dateRange}, ${request.days} day${request.days !== 1 ? 's' : ''}).`,
                actionUrl: '/leave',
            });
        }

        return { request, overlapping };
    }

    // ── Colleagues ────────────────────────────────────────────────────────────

    async getColleagues(userId: string, organizationId: string) {
        const me = await this.prisma.employee.findFirst({
            where: { userId, organizationId },
            select: { id: true },
        });

        return this.prisma.employee.findMany({
            where: {
                organizationId,
                ...(me ? { id: { not: me.id } } : {}),
            },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                jobTitle: true,
                department: { select: { name: true } },
            },
            orderBy: { firstName: 'asc' },
        });
    }

    // ── Overlap check ─────────────────────────────────────────────────────────

    async checkOverlap(organizationId: string, startDate: string, endDate: string, excludeUserId?: string) {
        const start = new Date(startDate);
        const end = new Date(endDate);

        let excludeEmployeeId: string | undefined;
        if (excludeUserId) {
            const emp = await this.prisma.employee.findFirst({
                where: { userId: excludeUserId, organizationId },
                select: { id: true },
            });
            excludeEmployeeId = emp?.id;
        }

        const overlapping = await this.prisma.leaveRequest.findMany({
            where: {
                organizationId,
                ...(excludeEmployeeId ? { employeeId: { not: excludeEmployeeId } } : {}),
                status: { in: [LeaveStatus.PENDING, LeaveStatus.APPROVED] },
                startDate: { lte: end },
                endDate: { gte: start },
            },
            select: {
                status: true,
                startDate: true,
                endDate: true,
                employee: { select: { firstName: true, lastName: true, jobTitle: true, department: { select: { name: true } } } },
            },
            orderBy: { startDate: 'asc' },
        });

        return { count: overlapping.length, colleagues: overlapping };
    }

    // ── List requests ─────────────────────────────────────────────────────────

    async listRequests(organizationId: string, roleLevel: string, userId: string, query: LeaveQueryDto) {
        const isAdmin = ['SUPER_ADMIN', 'ADMIN', 'HR'].includes(roleLevel);
        const isHod   = roleLevel === 'HOD';
        const isMgmt  = roleLevel === 'MANAGEMENT';
        const isReviewer = isAdmin || isHod || isMgmt;

        const where: any = { organizationId };

        if (!isReviewer) {
            // Employees see only their own requests
            const employee = await this.prisma.employee.findFirst({
                where: { userId, organizationId },
                select: { id: true },
            });
            if (!employee) return [];
            where.employeeId = employee.id;
        } else if (isHod) {
            // HOD sees: own department employees + all other HODs
            const hodEmployee = await this.prisma.employee.findFirst({
                where: { userId, organizationId },
                select: { id: true, departmentId: true },
            });

            if (hodEmployee) {
                const peerHodIds = await this.prisma.employee.findMany({
                    where: {
                        organizationId,
                        userId: { not: null },
                        user: {
                            organizations: {
                                some: { organizationId, role: { name: 'HOD' } },
                            },
                        },
                    },
                    select: { id: true },
                });

                where.OR = [
                    ...(hodEmployee.departmentId
                        ? [{ employee: { departmentId: hodEmployee.departmentId } }]
                        : []),
                    { employeeId: { in: peerHodIds.map((e) => e.id) } },
                ];
            }
        } else if (isMgmt) {
            // MANAGEMENT sees: peer managers + their direct reports
            const mgmtEmployee = await this.prisma.employee.findFirst({
                where: { userId, organizationId },
                select: { id: true },
            });

            if (mgmtEmployee) {
                const [directReports, peerMgmtIds] = await Promise.all([
                    this.prisma.employee.findMany({
                        where: { organizationId, reportingManagerId: mgmtEmployee.id },
                        select: { id: true },
                    }),
                    this.prisma.employee.findMany({
                        where: {
                            organizationId,
                            userId: { not: null },
                            user: {
                                organizations: {
                                    some: { organizationId, role: { name: 'MANAGEMENT' } },
                                },
                            },
                        },
                        select: { id: true },
                    }),
                ]);

                const visibleIds = new Set([
                    ...directReports.map((e) => e.id),
                    ...peerMgmtIds.map((e) => e.id),
                    mgmtEmployee.id,
                ]);
                where.employeeId = { in: Array.from(visibleIds) };
            }
        }
        // isAdmin: no extra filter — see all

        if (query.employeeId && (isAdmin || isHod || isMgmt)) {
            where.employeeId = query.employeeId;
        }

        if (query.status) where.status = query.status;

        if (query.year) {
            const y = Number(query.year);
            where.startDate = { gte: new Date(`${y}-01-01`), lte: new Date(`${y}-12-31`) };
        }

        return (this.prisma.leaveRequest as any).findMany({
            where,
            orderBy: { createdAt: 'desc' },
            include: {
                employee: {
                    select: {
                        id: true, firstName: true, lastName: true, jobTitle: true,
                        department: { select: { id: true, name: true } },
                    },
                },
                handoverEmployee:  { select: { id: true, firstName: true, lastName: true, jobTitle: true } },
                handoverEmployee2: { select: { id: true, firstName: true, lastName: true, jobTitle: true } },
            },
        });
    }

    // ── Get single request ────────────────────────────────────────────────────

    async getRequest(id: string, organizationId: string) {
        const req = await (this.prisma.leaveRequest as any).findFirst({
            where: { id, organizationId },
            include: {
                employee: {
                    select: {
                        id: true, firstName: true, lastName: true, jobTitle: true,
                        department: { select: { id: true, name: true } },
                    },
                },
                handoverEmployee:  { select: { id: true, firstName: true, lastName: true, jobTitle: true } },
                handoverEmployee2: { select: { id: true, firstName: true, lastName: true, jobTitle: true } },
                reviewedBy: { select: { id: true, name: true } },
            },
        });
        if (!req) throw new NotFoundException('Leave request not found');
        return req;
    }

    // ── Review (approve / reject) ─────────────────────────────────────────────

    async reviewRequest(
        id: string,
        organizationId: string,
        reviewerId: string,
        dto: ReviewLeaveRequestDto,
    ) {
        const req = await this.prisma.leaveRequest.findFirst({
            where: { id, organizationId },
            include: {
                employee: { select: { departmentId: true } },
            },
        });
        if (!req) throw new NotFoundException('Leave request not found');
        if (req.status !== LeaveStatus.PENDING) {
            throw new BadRequestException('Only PENDING requests can be reviewed');
        }

        // Dept minimum headcount check on approval
        if (dto.status === 'APPROVED' && req.employee?.departmentId) {
            const dept = await (this.prisma.department as any).findUnique({
                where: { id: req.employee.departmentId },
                select: { minLeaveHeadcount: true },
            });

            if (dept && dept.minLeaveHeadcount > 0) {
                const [deptTotal, alreadyOnLeave] = await Promise.all([
                    this.prisma.employee.count({
                        where: { departmentId: req.employee.departmentId, organizationId },
                    }),
                    this.prisma.leaveRequest.count({
                        where: {
                            id: { not: req.id },
                            employee: { departmentId: req.employee.departmentId },
                            status: LeaveStatus.APPROVED,
                            startDate: { lte: req.endDate },
                            endDate:   { gte: req.startDate },
                        },
                    }),
                ]);

                const remaining = deptTotal - alreadyOnLeave - 1; // -1 for the person being approved
                if (remaining < dept.minLeaveHeadcount) {
                    throw new BadRequestException(
                        `Cannot approve: only ${remaining} employee${remaining !== 1 ? 's' : ''} would remain in the department during this period, below the minimum of ${dept.minLeaveHeadcount}.`,
                    );
                }
            }
        }

        const updated = await this.prisma.leaveRequest.update({
            where: { id },
            data: {
                status: dto.status as LeaveStatus,
                reviewedById: reviewerId,
                reviewedAt: new Date(),
                reviewNote: dto.reviewNote,
            },
        });

        if (dto.status === LeaveStatus.APPROVED) {
            const year = new Date(req.startDate).getFullYear();
            await this.prisma.leaveBalance.upsert({
                where: { employeeId_year_type: { employeeId: req.employeeId, year, type: req.type } },
                create: { employeeId: req.employeeId, year, type: req.type, allocated: 0, used: req.days },
                update: { used: { increment: req.days } },
            });
        }

        const type = req.type as string;
        const leaveLabel = type.charAt(0) + type.slice(1).toLowerCase().replace(/_/g, ' ');
        const start = new Date(req.startDate);
        const end = new Date(req.endDate);
        const dateRange = `${start.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} – ${end.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`;
        const isApproved = dto.status === LeaveStatus.APPROVED;
        const noteClause = dto.reviewNote ? ` Note: ${dto.reviewNote}` : '';

        await this.notifications.create({
            employeeId: req.employeeId,
            type: NotificationType.INFO,
            module: 'LEAVE',
            title: `Leave request ${isApproved ? 'approved' : 'rejected'}`,
            message: `Your ${leaveLabel} leave request (${dateRange}, ${req.days} day${req.days !== 1 ? 's' : ''}) has been ${isApproved ? 'approved' : 'rejected'}.${noteClause}`,
            actionUrl: '/leave',
        });

        return updated;
    }

    // ── Cancel ────────────────────────────────────────────────────────────────

    async cancelRequest(id: string, organizationId: string, userId: string) {
        const employee = await this.prisma.employee.findFirst({
            where: { userId, organizationId },
            select: { id: true },
        });

        const req = await this.prisma.leaveRequest.findFirst({ where: { id, organizationId } });
        if (!req) throw new NotFoundException('Leave request not found');
        if (req.employeeId !== employee?.id) throw new ForbiddenException('Not your request');
        if (req.status === LeaveStatus.CANCELLED) throw new BadRequestException('Request is already cancelled');
        if (req.status === LeaveStatus.REJECTED) throw new BadRequestException('Rejected requests cannot be cancelled');
        if (req.status === LeaveStatus.APPROVED && new Date(req.startDate) <= new Date()) {
            throw new BadRequestException('Cannot cancel leave that has already started');
        }

        const cancelled = await this.prisma.leaveRequest.update({
            where: { id },
            data: { status: LeaveStatus.CANCELLED },
        });

        if (req.status === LeaveStatus.APPROVED) {
            const year = new Date(req.startDate).getFullYear();
            await this.prisma.leaveBalance.updateMany({
                where: { employeeId: req.employeeId, year, type: req.type },
                data: { used: { decrement: req.days } },
            });
        }

        return cancelled;
    }

    // ── Balance ───────────────────────────────────────────────────────────────

    async getMyBalance(userId: string, organizationId: string) {
        const employee = await this.prisma.employee.findFirst({
            where: { userId, organizationId },
            select: { id: true },
        });
        if (!employee) return [];

        const year = new Date().getFullYear();
        const balances = await this.prisma.leaveBalance.findMany({
            where: { employeeId: employee.id, year },
        });

        // Filter to only active (enabled) leave types
        const settings = await this.getLeaveSettings(organizationId);
        const enabledSet = new Set(settings.enabledTypes);
        const activeBalances = settings.enabledTypes.length === 0
            ? balances
            : balances.filter((b) => enabledSet.has(b.type));

        // Pro-rata: months elapsed in the year so far (1–12)
        const monthsElapsed = new Date().getMonth() + 1;
        return activeBalances.map((b) => ({
            ...b,
            accumulated: Math.round((monthsElapsed / 12) * b.allocated),
        }));
    }

    async getEmployeeBalance(employeeId: string, organizationId: string) {
        const employee = await this.prisma.employee.findFirst({
            where: { id: employeeId, organizationId },
        });
        if (!employee) throw new NotFoundException('Employee not found');

        const year = new Date().getFullYear();
        const balances = await this.prisma.leaveBalance.findMany({ where: { employeeId, year } });
        const monthsElapsed = new Date().getMonth() + 1;
        return balances.map((b) => ({
            ...b,
            accumulated: Math.round((monthsElapsed / 12) * b.allocated),
        }));
    }

    async getBalanceSummary(organizationId: string, year: number) {
        const agg = await this.prisma.leaveBalance.aggregate({
            where: { year, employee: { organizationId } },
            _sum: { allocated: true, used: true },
        });
        const allocated = agg._sum.allocated ?? 0;
        const used = agg._sum.used ?? 0;
        return { year, allocated, used, remaining: allocated - used };
    }

    async upsertBalance(employeeId: string, organizationId: string, dto: LeaveBalanceUpsertDto) {
        const employee = await this.prisma.employee.findFirst({
            where: { id: employeeId, organizationId },
        });
        if (!employee) throw new NotFoundException('Employee not found');

        const year = dto.year ?? new Date().getFullYear();
        return this.prisma.leaveBalance.upsert({
            where: { employeeId_year_type: { employeeId, year, type: dto.type } },
            create: { employeeId, year, type: dto.type, allocated: dto.allocated, used: 0 },
            update: { allocated: dto.allocated },
        });
    }

    // ── Policy ────────────────────────────────────────────────────────────────

    async getPolicy(organizationId: string, year: number) {
        return this.prisma.leavePolicy.findMany({
            where: { organizationId, year },
            orderBy: { type: 'asc' },
        });
    }

    async upsertPolicy(organizationId: string, dto: UpsertLeavePolicyDto) {
        return Promise.all(
            dto.entries.map(({ type, allocated }) =>
                this.prisma.leavePolicy.upsert({
                    where: { organizationId_year_type: { organizationId, year: dto.year, type } },
                    create: { organizationId, year: dto.year, type, allocated },
                    update: { allocated },
                }),
            ),
        );
    }

    async applyPolicy(organizationId: string, dto: ApplyLeavePolicyDto) {
        const policies = await this.prisma.leavePolicy.findMany({
            where: { organizationId, year: dto.year },
        });
        if (policies.length === 0) {
            throw new BadRequestException(`No leave policy set for ${dto.year}`);
        }

        const employees = await this.prisma.employee.findMany({
            where: { organizationId },
            select: { id: true },
        });

        await Promise.all(
            employees.flatMap((emp) =>
                policies.map((policy) =>
                    this.prisma.leaveBalance.upsert({
                        where: { employeeId_year_type: { employeeId: emp.id, year: dto.year, type: policy.type } },
                        create: { employeeId: emp.id, year: dto.year, type: policy.type, allocated: policy.allocated, used: 0 },
                        update: { allocated: policy.allocated },
                    }),
                ),
            ),
        );

        return { applied: employees.length, leaveTypes: policies.length, year: dto.year };
    }

    // ── Coverage alerts ───────────────────────────────────────────────────────
    // Reuses the same min-headcount check applied on approval (see reviewRequest)
    // to surface departments already below threshold today.

    async getCoverageAlerts(organizationId: string, roleLevel: string, userId: string) {
        let departmentIds: string[] | undefined;

        if (roleLevel === 'HOD') {
            const hodEmployee = await this.prisma.employee.findFirst({
                where: { userId, organizationId },
                select: { departmentId: true },
            });
            if (!hodEmployee?.departmentId) return [];
            departmentIds = [hodEmployee.departmentId];
        }

        const departments = await (this.prisma.department as any).findMany({
            where: { organizationId, ...(departmentIds ? { id: { in: departmentIds } } : {}) },
            select: { id: true, name: true, minLeaveHeadcount: true },
        });

        const today = new Date();
        const alerts = await Promise.all(
            departments
                .filter((dept) => dept.minLeaveHeadcount > 0)
                .map(async (dept) => {
                    const [total, onLeaveToday] = await Promise.all([
                        this.prisma.employee.count({ where: { departmentId: dept.id, organizationId } }),
                        this.prisma.leaveRequest.count({
                            where: {
                                employee: { departmentId: dept.id },
                                status: LeaveStatus.APPROVED,
                                startDate: { lte: today },
                                endDate: { gte: today },
                            },
                        }),
                    ]);
                    const remaining = total - onLeaveToday;
                    return {
                        departmentId: dept.id,
                        departmentName: dept.name,
                        total,
                        onLeaveToday,
                        remaining,
                        minLeaveHeadcount: dept.minLeaveHeadcount,
                    };
                }),
        );

        return alerts.filter((a) => a.remaining < a.minLeaveHeadcount);
    }

    // ── Summary / Analytics ───────────────────────────────────────────────────

    async getSummary(organizationId: string, year?: string) {
        const yearFilter = year
            ? { startDate: { gte: new Date(`${Number(year)}-01-01`), lte: new Date(`${Number(year)}-12-31`) } }
            : {};
        const [pending, approved, rejected] = await Promise.all([
            this.prisma.leaveRequest.count({ where: { organizationId, status: LeaveStatus.PENDING, ...yearFilter } }),
            this.prisma.leaveRequest.count({ where: { organizationId, status: LeaveStatus.APPROVED, ...yearFilter } }),
            this.prisma.leaveRequest.count({ where: { organizationId, status: LeaveStatus.REJECTED, ...yearFilter } }),
        ]);
        return { pending, approved, rejected };
    }

    async getYearlyAnalytics(organizationId: string) {
        const requests = await this.prisma.leaveRequest.findMany({
            where: { organizationId },
            select: { status: true, startDate: true, days: true, type: true },
        });

        const yearMap = new Map<number, { year: number; pending: number; approved: number; rejected: number; totalDays: number }>();
        for (const r of requests) {
            const y = new Date(r.startDate).getFullYear();
            if (!yearMap.has(y)) yearMap.set(y, { year: y, pending: 0, approved: 0, rejected: 0, totalDays: 0 });
            const entry = yearMap.get(y)!;
            if (r.status === 'PENDING')  entry.pending++;
            if (r.status === 'APPROVED') { entry.approved++; entry.totalDays += r.days; }
            if (r.status === 'REJECTED') entry.rejected++;
        }
        return Array.from(yearMap.values()).sort((a, b) => a.year - b.year);
    }
}
