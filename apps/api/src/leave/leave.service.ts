import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { LeaveStatus, LeaveType } from 'db';
import { CreateLeaveRequestDto, ReviewLeaveRequestDto, LeaveBalanceUpsertDto, LeaveQueryDto, UpsertLeavePolicyDto, ApplyLeavePolicyDto } from './dto/leave.dto';

@Injectable()
export class LeaveService {
    constructor(private prisma: PrismaService) {}

    async submitRequest(
        userId: string,
        organizationId: string,
        dto: CreateLeaveRequestDto,
    ) {
        const employee = await this.prisma.employee.findFirst({
            where: { userId, organizationId },
            select: { id: true },
        });
        if (!employee) throw new NotFoundException('Employee record not found');

        const start = new Date(dto.startDate);
        const end = new Date(dto.endDate);
        if (end < start) throw new BadRequestException('endDate must be after startDate');

        // Validate leave balance before creating the request
        const year = start.getFullYear();
        const balance = await this.prisma.leaveBalance.findUnique({
            where: { employeeId_year_type: { employeeId: employee.id, year, type: dto.type } },
        });

        if (!balance) {
            throw new BadRequestException(
                `No ${dto.type.toLowerCase().replace(/_/g, ' ')} allocation found for ${year}. Please contact HR to set up your leave balance.`,
            );
        }

        const remaining = balance.allocated - balance.used;
        if (dto.days > remaining) {
            throw new BadRequestException(
                `Insufficient balance. You requested ${dto.days} day${dto.days !== 1 ? 's' : ''} but only have ${remaining} remaining.`,
            );
        }

        if (dto.handoverEmployeeId) {
            const handover = await this.prisma.employee.findFirst({
                where: { id: dto.handoverEmployeeId, organizationId },
                select: { id: true },
            });
            if (!handover) throw new BadRequestException('Handover employee not found in this organisation');
        }

        const request = await this.prisma.leaveRequest.create({
            data: {
                employeeId: employee.id,
                organizationId,
                type: dto.type,
                startDate: start,
                endDate: end,
                days: dto.days,
                reason: dto.reason,
                handoverEmployeeId: dto.handoverEmployeeId ?? null,
                handoverNotes: dto.handoverNotes ?? null,
            },
            include: {
                employee: { select: { id: true, firstName: true, lastName: true } },
                handoverEmployee: { select: { id: true, firstName: true, lastName: true, jobTitle: true } },
            },
        });

        // Check who else is on leave during the same period (excluding this employee)
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

        return { request, overlapping };
    }

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

    async listRequests(organizationId: string, roleLevel: string, userId: string, query: LeaveQueryDto) {
        const isReviewer = ['SUPER_ADMIN', 'ADMIN', 'HR', 'HOD'].includes(roleLevel);

        const where: any = { organizationId };

        if (!isReviewer) {
            const employee = await this.prisma.employee.findFirst({
                where: { userId, organizationId },
                select: { id: true },
            });
            if (!employee) return [];
            where.employeeId = employee.id;
        } else if (query.employeeId) {
            where.employeeId = query.employeeId;
        }

        if (query.status) where.status = query.status;

        return this.prisma.leaveRequest.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            include: {
                employee: { select: { id: true, firstName: true, lastName: true, jobTitle: true } },
                handoverEmployee: { select: { id: true, firstName: true, lastName: true, jobTitle: true } },
            },
        });
    }

    async getRequest(id: string, organizationId: string) {
        const req = await this.prisma.leaveRequest.findFirst({
            where: { id, organizationId },
            include: {
                employee: { select: { id: true, firstName: true, lastName: true, jobTitle: true } },
                handoverEmployee: { select: { id: true, firstName: true, lastName: true, jobTitle: true } },
                reviewedBy: { select: { id: true, name: true } },
            },
        });
        if (!req) throw new NotFoundException('Leave request not found');
        return req;
    }

    async reviewRequest(
        id: string,
        organizationId: string,
        reviewerId: string,
        dto: ReviewLeaveRequestDto,
    ) {
        const req = await this.prisma.leaveRequest.findFirst({
            where: { id, organizationId },
        });
        if (!req) throw new NotFoundException('Leave request not found');
        if (req.status !== LeaveStatus.PENDING) {
            throw new BadRequestException('Only PENDING requests can be reviewed');
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

        // Deduct from balance on approval
        if (dto.status === LeaveStatus.APPROVED) {
            const year = new Date(req.startDate).getFullYear();
            await this.prisma.leaveBalance.upsert({
                where: { employeeId_year_type: { employeeId: req.employeeId, year, type: req.type } },
                create: { employeeId: req.employeeId, year, type: req.type, allocated: 0, used: req.days },
                update: { used: { increment: req.days } },
            });
        }

        return updated;
    }

    async cancelRequest(id: string, organizationId: string, userId: string) {
        const employee = await this.prisma.employee.findFirst({
            where: { userId, organizationId },
            select: { id: true },
        });

        const req = await this.prisma.leaveRequest.findFirst({
            where: { id, organizationId },
        });
        if (!req) throw new NotFoundException('Leave request not found');
        if (req.employeeId !== employee?.id) throw new ForbiddenException('Not your request');
        if (req.status === LeaveStatus.APPROVED) {
            throw new BadRequestException('Cannot cancel an already approved request');
        }

        return this.prisma.leaveRequest.update({
            where: { id },
            data: { status: LeaveStatus.CANCELLED },
        });
    }

    async getMyBalance(userId: string, organizationId: string) {
        const employee = await this.prisma.employee.findFirst({
            where: { userId, organizationId },
            select: { id: true },
        });
        if (!employee) return [];

        const year = new Date().getFullYear();
        return this.prisma.leaveBalance.findMany({
            where: { employeeId: employee.id, year },
        });
    }

    async getEmployeeBalance(employeeId: string, organizationId: string) {
        const employee = await this.prisma.employee.findFirst({
            where: { id: employeeId, organizationId },
        });
        if (!employee) throw new NotFoundException('Employee not found');

        const year = new Date().getFullYear();
        return this.prisma.leaveBalance.findMany({
            where: { employeeId, year },
        });
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

    async getSummary(organizationId: string) {
        const [pending, approved, rejected] = await Promise.all([
            this.prisma.leaveRequest.count({ where: { organizationId, status: LeaveStatus.PENDING } }),
            this.prisma.leaveRequest.count({ where: { organizationId, status: LeaveStatus.APPROVED } }),
            this.prisma.leaveRequest.count({ where: { organizationId, status: LeaveStatus.REJECTED } }),
        ]);
        return { pending, approved, rejected };
    }
}
