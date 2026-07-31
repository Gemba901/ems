import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateKaizenDto, UpdateKaizenDto, VerifyKaizenDto } from './dto/kaizen.dto';
import { Role } from 'src/common/enum/role.enum';
import { NotificationsService } from 'src/notifications/notifications.service';
import { KaizenStatus } from 'db';

const employeeSelect = {
    id: true,
    firstName: true,
    lastName: true,
    department: { select: { id: true, name: true } },
};

const kaizenInclude = {
    employee: { select: employeeSelect },
    department: { select: { id: true, name: true } },
    verifiedBy: { select: { id: true, firstName: true, lastName: true } },
    reviews: {
        orderBy: { createdAt: 'asc' as const },
        include: { reviewer: { select: { id: true, firstName: true, lastName: true } } },
    },
};

@Injectable()
export class KaizenService {
    constructor(
        private prisma: PrismaService,
        private notifications: NotificationsService
    ) { }

    private async resolveEmployee(userId: string, organizationId?: string) {
        const employee = await this.prisma.employee.findFirst({
            where: { userId, ...(organizationId && { organizationId }) },
            select: { id: true, departmentId: true, organizationId: true },
        });
        if (!employee) throw new ForbiddenException('No employee profile linked to your account');
        return employee;
    }

    private async getUserRoles(userId: string, organizationId: string) {
        const userOrgs = await this.prisma.userOrganization.findMany({
            where: { userId, organizationId },
            include: { role: true },
        });
        return userOrgs.map((uo) => uo.role.name);
    }

    private async findKaizenOrThrow(kaizenId: string, organizationId: string) {
        const kaizen = await this.prisma.kaizen.findFirst({
            where: { id: kaizenId, organizationId },
            include: kaizenInclude,
        });
        if (!kaizen) throw new NotFoundException('Kaizen not found');
        return kaizen;
    }

    // get departmental hods - private function
    private async findDepartmentHODs(departmentId: string, organizationId: string) {
        const hods = await this.prisma.employee.findMany({
            where: {
                departmentId,
                organizationId,
                user: {
                    organizations: {
                        some: {
                            organizationId,
                            role: { name: Role.HOD }
                        }
                    }
                }
            },
            select: { id: true }
        });

        return hods.map((h) => h.id);
    }

    private async createKaizenRecord(employee: { id: string; departmentId: string | null }, dto: CreateKaizenDto, organizationId: string) {
        if (!employee.departmentId) {
            throw new BadRequestException('Employee profile has no department assigned');
        }

        const { startImprovement, ...rest } = dto
        return this.prisma.kaizen.create({
            data: {
                ...rest,
                employeeId: employee.id,
                departmentId: employee.departmentId,
                organizationId,
                status: startImprovement ? 'IN_PROGRESS' : 'DRAFT'
            }

        })
    }

    // create kaizen
    async createKaizen(userId: string, dto: CreateKaizenDto, organizationId: string) {
        const employee = await this.resolveEmployee(userId, organizationId);
        return this.createKaizenRecord(employee, dto, organizationId);
    }

    // create kaizen on behalf of another employee (e.g. a SIMS suggestion's original submitter)
    async createKaizenForEmployee(employeeId: string, dto: CreateKaizenDto, organizationId: string) {
        const employee = await this.prisma.employee.findFirst({
            where: { id: employeeId, organizationId },
            select: { id: true, departmentId: true },
        });
        if (!employee) throw new NotFoundException('Employee not found');
        return this.createKaizenRecord(employee, dto, organizationId);
    }

    // get all kaizens
    async getAllKaizens(organizationId: string) {
        return this.prisma.kaizen.findMany({
            where: {
                organizationId
            },
            include: kaizenInclude,
            orderBy: { createdAt: 'asc' }
        })
    }

    // get user's kaizens
    async getMyKaizens(userId: string, organizationId: string) {
        const employee = await this.resolveEmployee(userId, organizationId);
        return this.prisma.kaizen.findMany({
            where: {
                organizationId,
                employeeId: employee.id
            },
            include: kaizenInclude,
            orderBy: { createdAt: 'asc' }
        })
    }

    // get departmental Kaizen
    async getDepartmentalKaizen(departmentId: string, userId: string, organizationId: string) {
        const employee = await this.resolveEmployee(userId, organizationId);
        const roles = await this.getUserRoles(userId, organizationId);
        const isPrivileged = roles.some((r) => [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT].includes(r as Role));

        if (!isPrivileged && employee.departmentId !== departmentId) {
            throw new ForbiddenException("You can only view your own department's kaizens");
        }

        return this.prisma.kaizen.findMany({
            where: {
                organizationId,
                departmentId
            },
            include: kaizenInclude,
            orderBy: { createdAt: 'asc' }
        })
    }

    // get specific kaizen
    async getSpecificKaizen(kaizenId: string, userId: string, organizationId: string) {
        const kaizen = await this.findKaizenOrThrow(kaizenId, organizationId);
        const employee = await this.resolveEmployee(userId, organizationId);
        const roles = await this.getUserRoles(userId, organizationId);

        const isOwner = kaizen.employeeId === employee.id;
        const isDepartmentHOD = roles.includes(Role.HOD) && employee.departmentId === kaizen.departmentId;
        const isPrivileged = roles.some((r) => [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT].includes(r as Role));

        if (!isOwner && !isDepartmentHOD && !isPrivileged) {
            throw new ForbiddenException('You do not have access to this kaizen');
        }

        return kaizen;
    }

    // get review/status history for a kaizen
    async getKaizenHistory(kaizenId: string, userId: string, organizationId: string) {
        await this.getSpecificKaizen(kaizenId, userId, organizationId);

        return this.prisma.kaizenReview.findMany({
            where: { kaizenId },
            orderBy: { createdAt: 'asc' },
            include: {
                reviewer: { select: { id: true, firstName: true, lastName: true } }
            }
        });
    }

    // update kaizen
    async updateKaizen(kaizenId: string, userId: string, dto: UpdateKaizenDto, organizationId: string) {
        const kaizen = await this.findKaizenOrThrow(kaizenId, organizationId);
        const employee = await this.resolveEmployee(userId, organizationId);

        if (kaizen.employeeId !== employee.id) {
            throw new ForbiddenException('You can only edit your own kaizen');
        }

        if (['SUBMITTED_FOR_VERIFICATION', 'VERIFIED_CLOSED', 'MOVED_TO_SGA'].includes(kaizen.status)) {
            throw new BadRequestException('This kaizen can no longer be edited')
        }

        const { submitForVerification, ...rest } = dto

        await this.prisma.kaizen.update({
            where: { id: kaizenId },
            data: {
                ...rest,
                ...(submitForVerification && { status: 'SUBMITTED_FOR_VERIFICATION' as const }),
            },
        })

        const updated = await this.prisma.kaizen.findFirst({ where: { id: kaizenId, organizationId }, include: kaizenInclude });

        if (submitForVerification) {
            const hodIds = await this.findDepartmentHODs(kaizen.departmentId, organizationId);
            await this.notifications.createMany(
                hodIds
                    .filter((id) => id !== employee.id)
                    .map((hodId) => ({
                        employeeId: hodId,
                        type: 'ACTION_REQUIRED' as const,
                        module: 'KAIZEN',
                        title: 'Kaizen submitted for verifications',
                        message: `A kaizen "${kaizen.problem.slice(0, 60)}" is awaiting your verification.`,
                        actionUrl: `/kaizen/${kaizenId}`,
                        metadata: { kaizenId }
                    }))
            )
        }

        return updated;
    }

    async verifyKaizen(kaizenId: string, userId: string, dto: VerifyKaizenDto, organizationId: string) {
        const kaizen = await this.findKaizenOrThrow(kaizenId, organizationId);
        if (kaizen.status !== 'SUBMITTED_FOR_VERIFICATION') {
            throw new BadRequestException('Only kaizens submitted for verification can be reviewed');
        }

        const verifier = await this.resolveEmployee(userId, organizationId);
        const roles = await this.getUserRoles(userId, organizationId);

        const isDepartmentHOD = roles.includes(Role.HOD) && verifier.departmentId === kaizen.departmentId;
        const isPrivileged = roles.some((r) => [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT].includes(r as Role));

        if (!isDepartmentHOD && !isPrivileged) {
            throw new ForbiddenException('Only a department HOD or admin can verify this kaizen');
        }

        const newStatus = dto.disposition as KaizenStatus

        const review = await this.prisma.$transaction(async (tx) => {
            await tx.kaizen.update({
                where: { id: kaizenId },
                data: {
                    status: newStatus,
                    verifiedById: verifier.id,
                    verificationComment: dto.verificationComment,
                    standardUpdated: dto.standardUpdated,
                },
            });

            return tx.kaizenReview.create({
                data: {
                    kaizenId,
                    reviewerId: verifier.id,
                    statusChanged: newStatus,
                    note: dto.verificationComment
                },
                include: {
                    reviewer: { select: { id: true, firstName: true, lastName: true } }
                },
            });
        });
        await this.notifications.create({
            employeeId: kaizen.employeeId,
            type: newStatus === 'FURTHER_IMPROVEMENT_REQUIRED' ? 'ACTION_REQUIRED' : 'INFO',
            module: 'KAIZEN',
            title: `Your kaizen was ${newStatus.toLowerCase().replace(/_/g, ' ')}`,
            message: dto.verificationComment
                ? `Reviewer note: ${dto.verificationComment}`
                : `Your kaizen "${kaizen.problem.slice(0, 60)}" has been reviewed.`,
            actionUrl: `/kaizen/${kaizenId}`,
            metadata: { kaizenId, newStatus },
        });

        return review;
    }

}
