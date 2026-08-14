import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  CreateKaizenReasonDto,
  UpdateKaizenReferenceDto,
  UpdateKaizenConditionDto,
  UpdateKaizenBasicInfoDto,
  UpdateKaizenQcdsmtImpactDto,
  UpdateKaizenWasteDto,
  UpdateKaizenImplementationPlanDto,
  SubmitHodPreReviewDto,
  UpdateKaizenImplementationDto,
  SubmitVerificationStageDto,
} from './dto/kaizen.dto';
import { Role } from 'src/common/enum/role.enum';
import { NotificationsService } from 'src/notifications/notifications.service';
import { KaizenStatus, KaizenVerificationStage } from 'db';

const employeeSelect = {
    id: true,
    firstName: true,
    lastName: true,
    department: { select: { id: true, name: true } },
};

const kaizenInclude = {
    employee: { select: employeeSelect },
    department: { select: { id: true, name: true } },
    kaizenOwner: { select: { id: true, firstName: true, lastName: true } },
    hodPreReviewBy: { select: { id: true, firstName: true, lastName: true } },
    teamMembers: { select: { id: true, firstName: true, lastName: true } },
    qcdsmtImpacts: true,
    wasteImpacts: true,
    verifications: {
        include: { verifiedBy: { select: { id: true, firstName: true, lastName: true } } },
    },
    reviews: {
        orderBy: { createdAt: 'asc' as const },
        include: { reviewer: { select: { id: true, firstName: true, lastName: true } } },
    },
};

const EDITABLE_STATUSES: KaizenStatus[] = ['DRAFT', 'RETURNED_FOR_REVISION'];

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

    private isPrivileged(roles: string[]) {
        return roles.some((r) => [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT].includes(r as Role));
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

    // finance department is identified by name, no dedicated role exists
    private async findFinanceDepartmentHODs(organizationId: string) {
        const financeDept = await this.prisma.department.findFirst({
            where: { organizationId, name: 'Finance' },
            select: { id: true },
        });
        if (!financeDept) return [];
        return this.findDepartmentHODs(financeDept.id, organizationId);
    }

    private async isSteeringCommitteeMember(employeeId: string, organizationId: string) {
        const organization = await this.prisma.organization.findUnique({
            where: { id: organizationId },
            select: { sgaCommitteeId: true },
        });
        if (!organization?.sgaCommitteeId) return false;
        const membership = await this.prisma.steeringCommitteeMember.findUnique({
            where: { committeeId_employeeId: { committeeId: organization.sgaCommitteeId, employeeId } },
        });
        return !!membership;
    }

    private assertEditable(kaizen: { status: KaizenStatus; employeeId: string }, employeeId: string) {
        if (kaizen.employeeId !== employeeId) {
            throw new ForbiddenException('You can only edit your own kaizen');
        }
        if (!EDITABLE_STATUSES.includes(kaizen.status)) {
            throw new BadRequestException('This section can no longer be edited');
        }
    }

    private async recordReview(kaizenId: string, reviewerId: string, statusChanged: KaizenStatus, note?: string | null) {
        return this.prisma.kaizenReview.create({
            data: { kaizenId, reviewerId, statusChanged, note },
        });
    }

    // Part 1: create a kaizen from just the reason
    async createKaizen(userId: string, dto: CreateKaizenReasonDto, organizationId: string) {
        const employee = await this.resolveEmployee(userId, organizationId);
        return this.createKaizenRecord(employee, dto, organizationId);
    }

    private async createKaizenRecord(
        employee: { id: string; departmentId: string | null },
        dto: CreateKaizenReasonDto,
        organizationId: string,
        overrides?: Partial<{
            status: KaizenStatus;
            kaizenOwnerId: string;
            conditionDescription: string;
            conditionEvidenceUrls: string[];
            title: string;
            startDate: string;
            targetCompletionDate: string;
        }>,
    ) {
        if (!employee.departmentId) {
            throw new BadRequestException('Employee profile has no department assigned');
        }

        const kaizen = await this.prisma.kaizen.create({
            data: {
                trigger: dto.trigger,
                triggerOther: dto.triggerOther,
                conditionDescription: overrides?.conditionDescription ?? '',
                conditionEvidenceUrls: overrides?.conditionEvidenceUrls ?? [],
                title: overrides?.title,
                startDate: overrides?.startDate ? new Date(overrides.startDate) : undefined,
                targetCompletionDate: overrides?.targetCompletionDate ? new Date(overrides.targetCompletionDate) : undefined,
                employeeId: employee.id,
                departmentId: employee.departmentId,
                organizationId,
                status: overrides?.status ?? 'DRAFT',
                kaizenOwnerId: overrides?.kaizenOwnerId,
            },
        });

        return kaizen;
    }

    // create kaizen on behalf of another employee (e.g. a SIMS suggestion's original submitter)
    async createKaizenForEmployee(
        employeeId: string,
        dto: CreateKaizenReasonDto & {
            conditionDescription: string;
            conditionEvidenceUrls?: string[];
            title?: string;
            startDate?: string;
            targetCompletionDate?: string;
            kaizenOwnerId?: string;
            status?: KaizenStatus;
        },
        organizationId: string,
    ) {
        const employee = await this.prisma.employee.findFirst({
            where: { id: employeeId, organizationId },
            select: { id: true, departmentId: true },
        });
        if (!employee) throw new NotFoundException('Employee not found');
        return this.createKaizenRecord(employee, dto, organizationId, {
            status: dto.status,
            kaizenOwnerId: dto.kaizenOwnerId ?? employeeId,
            conditionDescription: dto.conditionDescription,
            conditionEvidenceUrls: dto.conditionEvidenceUrls,
            title: dto.title,
            startDate: dto.startDate,
            targetCompletionDate: dto.targetCompletionDate,
        });
    }

    // get all kaizens
    async getAllKaizens(organizationId: string) {
        return this.prisma.kaizen.findMany({
            where: { organizationId },
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
                OR: [{ employeeId: employee.id }, { kaizenOwnerId: employee.id }],
            },
            include: kaizenInclude,
            orderBy: { createdAt: 'asc' }
        })
    }

    // get departmental Kaizen
    async getDepartmentalKaizen(departmentId: string, userId: string, organizationId: string) {
        const employee = await this.resolveEmployee(userId, organizationId);
        const roles = await this.getUserRoles(userId, organizationId);

        if (!this.isPrivileged(roles) && employee.departmentId !== departmentId) {
            throw new ForbiddenException("You can only view your own department's kaizens");
        }

        return this.prisma.kaizen.findMany({
            where: { organizationId, departmentId },
            include: kaizenInclude,
            orderBy: { createdAt: 'asc' }
        })
    }

    // kaizens awaiting the current user's part-9 verification action (steering committee / finance)
    async getPendingVerification(userId: string, organizationId: string) {
        const employee = await this.resolveEmployee(userId, organizationId);
        const roles = await this.getUserRoles(userId, organizationId);

        const isCommitteeMember = await this.isSteeringCommitteeMember(employee.id, organizationId);
        const financeHodIds = employee.departmentId ? await this.findFinanceDepartmentHODs(organizationId) : [];
        const isFinanceHod = financeHodIds.includes(employee.id);
        const isDeptHod = roles.includes(Role.HOD);

        if (!isCommitteeMember && !isFinanceHod && !isDeptHod && !this.isPrivileged(roles)) {
            return [];
        }

        return this.prisma.kaizen.findMany({
            where: {
                organizationId,
                status: 'PENDING_VERIFICATION',
                ...(!this.isPrivileged(roles) && !isCommitteeMember && !isFinanceHod
                    ? { departmentId: employee.departmentId ?? undefined }
                    : {}),
            },
            include: kaizenInclude,
            orderBy: { createdAt: 'asc' },
        });
    }

    // get specific kaizen
    async getSpecificKaizen(kaizenId: string, userId: string, organizationId: string) {
        const kaizen = await this.findKaizenOrThrow(kaizenId, organizationId);
        const employee = await this.resolveEmployee(userId, organizationId);
        const roles = await this.getUserRoles(userId, organizationId);

        const isOwner = kaizen.employeeId === employee.id || kaizen.kaizenOwnerId === employee.id;
        const isDepartmentHOD = roles.includes(Role.HOD) && employee.departmentId === kaizen.departmentId;
        const isCommitteeMember = await this.isSteeringCommitteeMember(employee.id, organizationId);
        const financeHodIds = await this.findFinanceDepartmentHODs(organizationId);
        const isFinanceHod = financeHodIds.includes(employee.id);

        if (!isOwner && !isDepartmentHOD && !isCommitteeMember && !isFinanceHod && !this.isPrivileged(roles)) {
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

    // Part 2: related reference
    async updateReference(kaizenId: string, userId: string, dto: UpdateKaizenReferenceDto, organizationId: string) {
        const kaizen = await this.findKaizenOrThrow(kaizenId, organizationId);
        const employee = await this.resolveEmployee(userId, organizationId);
        this.assertEditable(kaizen, employee.id);

        return this.prisma.kaizen.update({
            where: { id: kaizenId },
            data: {
                referenceValue: dto.referenceValue,
                referenceApplicability: dto.referenceValue
                    ? 'APPLICABLE'
                    : dto.referenceApplicability,
            },
            include: kaizenInclude,
        });
    }

    // Part 3: condition or opportunity
    async updateCondition(kaizenId: string, userId: string, dto: UpdateKaizenConditionDto, organizationId: string) {
        const kaizen = await this.findKaizenOrThrow(kaizenId, organizationId);
        const employee = await this.resolveEmployee(userId, organizationId);
        this.assertEditable(kaizen, employee.id);

        return this.prisma.kaizen.update({
            where: { id: kaizenId },
            data: {
                conditionDescription: dto.conditionDescription,
                conditionEvidenceUrls: dto.conditionEvidenceUrls,
            },
            include: kaizenInclude,
        });
    }

    // Part 4: basic daily kaizen information
    async updateBasicInfo(kaizenId: string, userId: string, dto: UpdateKaizenBasicInfoDto, organizationId: string) {
        const kaizen = await this.findKaizenOrThrow(kaizenId, organizationId);
        const employee = await this.resolveEmployee(userId, organizationId);
        this.assertEditable(kaizen, employee.id);

        const start = new Date(dto.startDate);
        const target = new Date(dto.targetCompletionDate);
        const diffDays = (target.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
        if (diffDays < 0 || diffDays > 30) {
            throw new BadRequestException('Target completion date must be within 30 days of the start date');
        }

        const updated = await this.prisma.kaizen.update({
            where: { id: kaizenId },
            data: {
                title: dto.title,
                startDate: new Date(dto.startDate),
                targetCompletionDate: new Date(dto.targetCompletionDate),
                kaizenOwnerId: dto.kaizenOwnerId,
                ...(dto.teamMemberIds && {
                    teamMembers: { set: dto.teamMemberIds.map((id) => ({ id })) },
                }),
            },
            include: kaizenInclude,
        });

        if (dto.teamMemberIds?.length) {
            await this.notifications.createMany(
                dto.teamMemberIds
                    .filter((id) => id !== employee.id)
                    .map((memberId) => ({
                        employeeId: memberId,
                        type: 'INFO' as const,
                        module: 'KAIZEN',
                        title: 'Added to a kaizen team',
                        message: `You were added as a team member on the kaizen "${dto.title}".`,
                        actionUrl: `/kaizen/${kaizenId}`,
                        metadata: { kaizenId },
                    }))
            );
        }

        return updated;
    }

    // Part 5: QCDSMT impact and result
    async updateQcdsmtImpact(kaizenId: string, userId: string, dto: UpdateKaizenQcdsmtImpactDto, organizationId: string) {
        const kaizen = await this.findKaizenOrThrow(kaizenId, organizationId);
        const employee = await this.resolveEmployee(userId, organizationId);
        this.assertEditable(kaizen, employee.id);

        await this.prisma.$transaction(async (tx) => {
            await tx.kaizenQcdsmtImpact.deleteMany({ where: { kaizenId } });
            if (dto.impacts.length) {
                await tx.kaizenQcdsmtImpact.createMany({
                    data: dto.impacts.map((impact) => ({ ...impact, kaizenId })),
                });
            }
        });

        return this.findKaizenOrThrow(kaizenId, organizationId);
    }

    // Part 6: waste being reduced
    async updateWaste(kaizenId: string, userId: string, dto: UpdateKaizenWasteDto, organizationId: string) {
        const kaizen = await this.findKaizenOrThrow(kaizenId, organizationId);
        const employee = await this.resolveEmployee(userId, organizationId);
        this.assertEditable(kaizen, employee.id);

        const wastes = dto.impacts.map((i) => i.waste);
        if (wastes.includes('NOT_APPLICABLE') && wastes.length > 1) {
            throw new BadRequestException('"Not Applicable" cannot be combined with other wastes');
        }

        await this.prisma.$transaction(async (tx) => {
            await tx.kaizenWasteImpact.deleteMany({ where: { kaizenId } });
            if (dto.impacts.length) {
                await tx.kaizenWasteImpact.createMany({
                    data: dto.impacts.map((impact) => ({ ...impact, kaizenId })),
                });
            }
        });

        return this.findKaizenOrThrow(kaizenId, organizationId);
    }

    // Part 7: required materials and estimated cost
    async updateImplementationPlan(kaizenId: string, userId: string, dto: UpdateKaizenImplementationPlanDto, organizationId: string) {
        const kaizen = await this.findKaizenOrThrow(kaizenId, organizationId);
        const employee = await this.resolveEmployee(userId, organizationId);
        this.assertEditable(kaizen, employee.id);

        return this.prisma.kaizen.update({
            where: { id: kaizenId },
            data: {
                requiredMaterials: dto.requiredMaterials,
                estimatedCost: dto.estimatedCost ?? null,
                estimatedCostCurrency: dto.estimatedCostCurrency ?? null,
            },
            include: kaizenInclude,
        });
    }

    // submit parts 1-7 for HOD pre-implementation review
    async submitForHodPreReview(kaizenId: string, userId: string, organizationId: string) {
        const kaizen = await this.findKaizenOrThrow(kaizenId, organizationId);
        const employee = await this.resolveEmployee(userId, organizationId);
        this.assertEditable(kaizen, employee.id);

        if (!kaizen.title || !kaizen.startDate || !kaizen.targetCompletionDate || !kaizen.kaizenOwnerId || !kaizen.requiredMaterials) {
            throw new BadRequestException('Complete parts 1-7 before submitting for HOD review');
        }

        const updated = await this.prisma.$transaction(async (tx) => {
            const result = await tx.kaizen.update({
                where: { id: kaizenId },
                data: { status: 'PENDING_HOD_PRE_REVIEW', hodPreReviewDecision: 'PENDING' },
                include: kaizenInclude,
            });
            await this.recordReview(kaizenId, employee.id, 'PENDING_HOD_PRE_REVIEW');
            return result;
        });

        const hodIds = await this.findDepartmentHODs(kaizen.departmentId, organizationId);
        await this.notifications.createMany(
            hodIds
                .filter((id) => id !== employee.id)
                .map((hodId) => ({
                    employeeId: hodId,
                    type: 'ACTION_REQUIRED' as const,
                    module: 'KAIZEN',
                    title: 'Kaizen awaiting your pre-implementation review',
                    message: `A kaizen "${kaizen.title}" is awaiting your review before implementation.`,
                    actionUrl: `/kaizen/${kaizenId}`,
                    metadata: { kaizenId },
                }))
        );

        return updated;
    }

    // Part 8: HOD review before implementation
    async submitHodPreReview(kaizenId: string, userId: string, dto: SubmitHodPreReviewDto, organizationId: string) {
        const kaizen = await this.findKaizenOrThrow(kaizenId, organizationId);
        if (kaizen.status !== 'PENDING_HOD_PRE_REVIEW') {
            throw new BadRequestException('This kaizen is not awaiting HOD pre-review');
        }

        const reviewer = await this.resolveEmployee(userId, organizationId);
        const roles = await this.getUserRoles(userId, organizationId);
        const isDepartmentHOD = roles.includes(Role.HOD) && reviewer.departmentId === kaizen.departmentId;

        if (!isDepartmentHOD && !this.isPrivileged(roles)) {
            throw new ForbiddenException('Only the department HOD or admin can review this kaizen');
        }

        const statusByDecision: Record<typeof dto.decision, KaizenStatus> = {
            APPROVE: 'IN_IMPLEMENTATION',
            RETURN: 'RETURNED_FOR_REVISION',
            REJECT: 'REJECTED',
            MOVE_TO_SGA: 'MOVED_TO_SGA',
        };
        const newStatus = statusByDecision[dto.decision];

        const updated = await this.prisma.$transaction(async (tx) => {
            const result = await tx.kaizen.update({
                where: { id: kaizenId },
                data: {
                    status: newStatus,
                    hodPreReviewDecision: dto.decision,
                    hodPreReviewRemarks: dto.remarks,
                    hodPreReviewById: reviewer.id,
                    hodPreReviewAt: new Date(),
                },
                include: kaizenInclude,
            });
            await this.recordReview(kaizenId, reviewer.id, newStatus, dto.remarks);
            return result;
        });

        await this.notifications.create({
            employeeId: kaizen.employeeId,
            type: dto.decision === 'APPROVE' ? 'INFO' : 'ACTION_REQUIRED',
            module: 'KAIZEN',
            title: `Your kaizen was ${dto.decision.toLowerCase().replace(/_/g, ' ')}d by the HOD`,
            message: dto.remarks ?? `Your kaizen "${kaizen.title}" pre-implementation review is complete.`,
            actionUrl: `/kaizen/${kaizenId}`,
            metadata: { kaizenId, newStatus },
        });

        return updated;
    }

    // Part 9: implementation and evidence
    async updateImplementation(kaizenId: string, userId: string, dto: UpdateKaizenImplementationDto, organizationId: string) {
        const kaizen = await this.findKaizenOrThrow(kaizenId, organizationId);
        const employee = await this.resolveEmployee(userId, organizationId);

        if (kaizen.kaizenOwnerId !== employee.id) {
            throw new ForbiddenException('Only the kaizen owner can record implementation details');
        }
        if (!['IN_IMPLEMENTATION', 'RETURNED_FOR_REWORK'].includes(kaizen.status)) {
            throw new BadRequestException('This kaizen is not ready for implementation details');
        }

        return this.prisma.kaizen.update({
            where: { id: kaizenId },
            data: {
                actionTaken: dto.actionTaken,
                afterPhotoUrls: dto.afterPhotoUrls,
                resultSaving: dto.resultSaving,
            },
            include: kaizenInclude,
        });
    }

    // submit part 9 for the three-stage part 10 verification
    async submitForVerification(kaizenId: string, userId: string, organizationId: string) {
        const kaizen = await this.findKaizenOrThrow(kaizenId, organizationId);
        const employee = await this.resolveEmployee(userId, organizationId);

        if (kaizen.kaizenOwnerId !== employee.id) {
            throw new ForbiddenException('Only the kaizen owner can submit for verification');
        }
        if (!['IN_IMPLEMENTATION', 'RETURNED_FOR_REWORK'].includes(kaizen.status)) {
            throw new BadRequestException('This kaizen is not ready for verification');
        }
        if (!kaizen.actionTaken) {
            throw new BadRequestException('Complete part 9 before submitting for verification');
        }

        const financeApplicable = kaizen.qcdsmtImpacts.some((i) => i.category === 'COST');

        const updated = await this.prisma.$transaction(async (tx) => {
            const stages: KaizenVerificationStage[] = ['HOD', 'STEERING_COMMITTEE', 'FINANCE'];
            for (const stage of stages) {
                await tx.kaizenVerification.upsert({
                    where: { kaizenId_stage: { kaizenId, stage } },
                    create: {
                        kaizenId,
                        stage,
                        decision: stage === 'FINANCE' && !financeApplicable ? 'NOT_APPLICABLE' : 'PENDING',
                    },
                    update: {
                        decision: stage === 'FINANCE' && !financeApplicable ? 'NOT_APPLICABLE' : 'PENDING',
                        remarks: null,
                        verifiedById: null,
                        verifiedAt: null,
                    },
                });
            }

            const result = await tx.kaizen.update({
                where: { id: kaizenId },
                data: { status: 'PENDING_VERIFICATION' },
                include: kaizenInclude,
            });
            await this.recordReview(kaizenId, employee.id, 'PENDING_VERIFICATION');
            return result;
        });

        const hodIds = await this.findDepartmentHODs(kaizen.departmentId, organizationId);
        const committeeMemberIds = await this.getSteeringCommitteeMemberIds(organizationId);
        const financeHodIds = financeApplicable ? await this.findFinanceDepartmentHODs(organizationId) : [];

        await this.notifications.createMany(
            [...new Set([...hodIds, ...committeeMemberIds, ...financeHodIds])]
                .filter((id) => id !== employee.id)
                .map((recipientId) => ({
                    employeeId: recipientId,
                    type: 'ACTION_REQUIRED' as const,
                    module: 'KAIZEN',
                    title: 'Kaizen awaiting closure verification',
                    message: `A kaizen "${kaizen.title}" is awaiting your closure verification.`,
                    actionUrl: `/kaizen/${kaizenId}`,
                    metadata: { kaizenId },
                }))
        );

        return updated;
    }

    private async getSteeringCommitteeMemberIds(organizationId: string) {
        const organization = await this.prisma.organization.findUnique({
            where: { id: organizationId },
            select: { sgaCommitteeId: true },
        });
        if (!organization?.sgaCommitteeId) return [];
        const members = await this.prisma.steeringCommitteeMember.findMany({
            where: { committeeId: organization.sgaCommitteeId },
            select: { employeeId: true },
        });
        return members.map((m) => m.employeeId);
    }

    // Part 10: verification and closure
    async submitVerificationStage(kaizenId: string, userId: string, dto: SubmitVerificationStageDto, organizationId: string) {
        const kaizen = await this.findKaizenOrThrow(kaizenId, organizationId);
        if (kaizen.status !== 'PENDING_VERIFICATION') {
            throw new BadRequestException('This kaizen is not awaiting verification');
        }

        const verifier = await this.resolveEmployee(userId, organizationId);
        const roles = await this.getUserRoles(userId, organizationId);

        const existingStage = kaizen.verifications.find((v) => v.stage === dto.stage);
        if (!existingStage || existingStage.decision === 'NOT_APPLICABLE') {
            throw new BadRequestException('This verification stage is not applicable to this kaizen');
        }

        if (dto.stage === 'HOD') {
            const isDepartmentHOD = roles.includes(Role.HOD) && verifier.departmentId === kaizen.departmentId;
            if (!isDepartmentHOD && !this.isPrivileged(roles)) {
                throw new ForbiddenException('Only the department HOD or admin can submit the HOD verification');
            }
        } else if (dto.stage === 'STEERING_COMMITTEE') {
            const isCommitteeMember = await this.isSteeringCommitteeMember(verifier.id, organizationId);
            if (!isCommitteeMember && !this.isPrivileged(roles)) {
                throw new ForbiddenException('Only a steering committee member or admin can submit this verification');
            }
        } else if (dto.stage === 'FINANCE') {
            const financeHodIds = await this.findFinanceDepartmentHODs(organizationId);
            if (!financeHodIds.includes(verifier.id) && !this.isPrivileged(roles)) {
                throw new ForbiddenException('Only the Finance HOD or admin can submit the Finance verification');
            }
        }

        const updated = await this.prisma.$transaction(async (tx) => {
            await tx.kaizenVerification.update({
                where: { kaizenId_stage: { kaizenId, stage: dto.stage } },
                data: {
                    decision: dto.decision,
                    remarks: dto.remarks,
                    verifiedById: verifier.id,
                    verifiedAt: new Date(),
                    ...(dto.stage === 'FINANCE' && dto.decision === 'VERIFIED' && {
                        verifiedBenefitAmount: dto.verifiedBenefitAmount ?? null,
                        verifiedBenefitCurrency: dto.verifiedBenefitCurrency ?? null,
                    }),
                },
            });

            const stages = await tx.kaizenVerification.findMany({ where: { kaizenId } });
            const applicable = stages.filter((s) => s.decision !== 'NOT_APPLICABLE' || s.stage === dto.stage);
            const anyReturned = applicable.some((s) => (s.stage === dto.stage ? dto.decision : s.decision) === 'RETURN');
            const allVerified = applicable.every((s) => (s.stage === dto.stage ? dto.decision : s.decision) === 'VERIFIED');

            let newStatus: KaizenStatus = kaizen.status;
            if (anyReturned) {
                newStatus = 'RETURNED_FOR_REWORK';
                await tx.kaizenVerification.updateMany({
                    where: { kaizenId, decision: { in: ['PENDING', 'VERIFIED'] } },
                    data: { decision: 'PENDING' },
                });
            } else if (allVerified) {
                newStatus = 'VERIFIED_CLOSED';
            }

            let result = kaizen;
            if (newStatus !== kaizen.status) {
                result = await tx.kaizen.update({
                    where: { id: kaizenId },
                    data: { status: newStatus },
                    include: kaizenInclude,
                });
                await this.recordReview(kaizenId, verifier.id, newStatus, dto.remarks);
            } else {
                result = await tx.kaizen.findFirstOrThrow({ where: { id: kaizenId }, include: kaizenInclude });
            }
            return result;
        });

        await this.notifications.create({
            employeeId: kaizen.kaizenOwnerId ?? kaizen.employeeId,
            type: dto.decision === 'RETURN' ? 'ACTION_REQUIRED' : 'INFO',
            module: 'KAIZEN',
            title: `${dto.stage.replace(/_/g, ' ')} verification ${dto.decision === 'RETURN' ? 'returned' : 'recorded'}`,
            message: dto.remarks ?? `Your kaizen "${kaizen.title}" received a ${dto.stage.toLowerCase()} verification decision.`,
            actionUrl: `/kaizen/${kaizenId}`,
            metadata: { kaizenId, stage: dto.stage, decision: dto.decision },
        });

        return updated;
    }
}
