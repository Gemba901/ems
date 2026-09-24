import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import {
    CreateSgaDto,
    UpdateSgaReasonDto,
    UpdateSgaInfoDto,
    UpdateSgaImpactDto,
    UpdateSgaTeamDto,
    UpdateSgaMeetingPlanDto,
    UpdateSgaResourcesDto,
    SubmitSgaHodApprovalDto,
    UpdateSgaConditionDto,
    UpdateSgaRootCauseDto,
    CreateSgaMeetingReportDto,
    UpdateSgaMeetingReportDto,
    UpdateSgaActionPlanDto,
    UpdateSgaActionItemStatusDto,
    UpdateSgaImplementationDto,
    UpdateSgaResultsDto,
    UpdateSgaBenefitsDto,
    UpdateSgaVerifyingDepartmentDto,
    SubmitSgaVerificationStageDto,
} from './dto/sga.dto';
import { Role } from 'src/common/enum/role.enum';
import { NotificationsService } from 'src/notifications/notifications.service';
import { Prisma, SgaStatus, SgaVerificationStage } from 'db';

const employeeSelect = {
    id: true,
    firstName: true,
    lastName: true,
    department: { select: { id: true, name: true } },
};

const sgaInclude = {
    employee: { select: employeeSelect },
    mainDepartment: { select: { id: true, name: true } },
    otherDepartments: { select: { id: true, name: true } },
    owner: { select: { id: true, firstName: true, lastName: true } },
    teamMembers: { select: { id: true, firstName: true, lastName: true } },
    hodDecisionBy: { select: { id: true, firstName: true, lastName: true } },
    verifyingDepartment: { select: { id: true, name: true } },
    departmentRep: { select: { id: true, firstName: true, lastName: true } },
    qcdsmtImpacts: true,
    wasteImpacts: true,
    measures: true,
    fishboneCauses: true,
    whyWhyChains: true,
    meetingReports: { orderBy: { meetingNumber: 'asc' as const } },
    actionItems: {
        include: { responsiblePerson: { select: { id: true, firstName: true, lastName: true } } },
    },
    qcdsmtBenefits: true,
    verifications: {
        include: { verifiedBy: { select: { id: true, firstName: true, lastName: true } } },
    },
    reviews: {
        orderBy: { createdAt: 'asc' as const },
        include: { reviewer: { select: { id: true, firstName: true, lastName: true } } },
    },
};

export type SgaWithInclude = Prisma.SgaGetPayload<{ include: typeof sgaInclude }>;

const DRAFT_EDITABLE_STATUSES: SgaStatus[] = ['DRAFT', 'RETURNED_FOR_REVISION'];

// `step` matches the guided draft wizard on the web (1 Problem, 2 Improve, 3 Team & meetings),
// so the client can link each missing item to where it is filled in.
export interface SgaDraftMissingItem {
    key: string;
    label: string;
    step: number;
}

export function getDraftMissingItems(sga: SgaWithInclude): SgaDraftMissingItem[] {
    const missing: SgaDraftMissingItem[] = [];
    if (!sga.title) missing.push({ key: 'title', label: 'Title', step: 1 });
    if (!sga.problemDescription) missing.push({ key: 'problemDescription', label: 'Problem description', step: 1 });
    if (!sga.startingReason) missing.push({ key: 'startingReason', label: 'Why this SGA was started', step: 1 });
    if (sga.startingReason === 'OTHER' && !sga.startingReasonOther?.trim()) {
        missing.push({ key: 'startingReasonOther', label: 'Explain the "Other" reason', step: 1 });
    }
    if (!sga.mainDepartmentId) missing.push({ key: 'mainDepartmentId', label: 'Main department', step: 1 });
    if (!sga.startDate) missing.push({ key: 'startDate', label: 'Start date', step: 1 });
    if (!sga.targetCompletionDate) missing.push({ key: 'targetCompletionDate', label: 'Target completion date', step: 1 });
    if (sga.qcdsmtImpacts.length === 0) missing.push({ key: 'impacts', label: 'At least one thing that will improve', step: 2 });
    if (!sga.ownerId) missing.push({ key: 'ownerId', label: 'SGA leader', step: 3 });
    if (!sga.meetingFrequency) missing.push({ key: 'meetingFrequency', label: 'How often the team meets', step: 3 });
    return missing;
}

const TEAM_EDITABLE_STATUSES: SgaStatus[] = ['IN_PROGRESS', 'RETURNED_FOR_REWORK'];

@Injectable()
export class SgaService {
    constructor(
        private prisma: PrismaService,
        private notifications: NotificationsService,
    ) {}

    private async resolveEmployee(userId: string, organizationId: string) {
        const employee = await this.prisma.employee.findFirst({
            where: { userId, organizationId },
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

    private async findSgaOrThrow(sgaId: string, organizationId: string) {
        const sga = await this.prisma.sga.findFirst({
            where: { id: sgaId, organizationId },
            include: sgaInclude,
        });
        if (!sga) throw new NotFoundException('SGA not found');
        return sga as SgaWithInclude;
    }

    private async findDepartmentHODs(departmentId: string, organizationId: string) {
        const hods = await this.prisma.employee.findMany({
            where: {
                departmentId,
                organizationId,
                user: {
                    organizations: {
                        some: {
                            organizationId,
                            role: { name: Role.HOD },
                        },
                    },
                },
            },
            select: { id: true },
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

    // Steps 1-2: raiser only, while DRAFT or RETURNED_FOR_REVISION
    private assertDraftEditable(sga: { status: SgaStatus; employeeId: string }, employeeId: string) {
        if (sga.employeeId !== employeeId) {
            throw new ForbiddenException('You can only edit your own SGA');
        }
        if (!DRAFT_EDITABLE_STATUSES.includes(sga.status)) {
            throw new BadRequestException('This section can no longer be edited');
        }
    }

    // Steps 3-5: raiser, owner or any team member, only once HOD-approved (IN_PROGRESS / RETURNED_FOR_REWORK)
    private assertTeamEditable(sga: SgaWithInclude, employeeId: string) {
        const isTeam = sga.employeeId === employeeId
            || sga.ownerId === employeeId
            || sga.teamMembers.some((m) => m.id === employeeId);
        if (!isTeam) {
            throw new ForbiddenException('Only the raiser, owner or team members can edit this SGA');
        }
        if (!TEAM_EDITABLE_STATUSES.includes(sga.status)) {
            throw new BadRequestException('This SGA is not in a stage where this section can be edited');
        }
    }

    // Step 4 §11 implementation: owner only, same status gate as team-editable sections
    private assertOwnerEditable(sga: SgaWithInclude, employeeId: string) {
        if (sga.ownerId !== employeeId) {
            throw new ForbiddenException('Only the SGA owner can record implementation details');
        }
        if (!TEAM_EDITABLE_STATUSES.includes(sga.status)) {
            throw new BadRequestException('This SGA is not in a stage where implementation can be recorded');
        }
    }

    private async recordReview(sgaId: string, reviewerId: string, statusChanged: SgaStatus, note?: string | null) {
        return this.prisma.sgaReview.create({
            data: { sgaId, reviewerId, statusChanged, note },
        });
    }

    // Step 1 §1: create draft
    // Quick start: the draft is only created once the raiser has described the problem,
    // with sensible defaults so the guided steps start partly filled in.
    async createSga(userId: string, dto: CreateSgaDto, organizationId: string) {
        const employee = await this.resolveEmployee(userId, organizationId);

        const mainDepartmentId = dto.mainDepartmentId || employee.departmentId || undefined;
        if (dto.mainDepartmentId) {
            const dept = await this.prisma.department.findFirst({ where: { id: dto.mainDepartmentId, organizationId } });
            if (!dept) throw new BadRequestException('Main department not found in this organization');
        }

        // The wizard creates an empty draft on "New SGA"; the problem and title are filled in step 1.
        const problemDescription = dto.problemDescription?.trim() || undefined;
        const title = dto.title?.trim() || problemDescription?.slice(0, 60).trim() || undefined;

        return this.prisma.sga.create({
            data: {
                organizationId,
                employeeId: employee.id,
                startingReason: dto.startingReason,
                title,
                problemDescription,
                mainDepartmentId,
                workArea: dto.workArea?.trim() || undefined,
                beforeFileUrls: dto.beforeFileUrls ?? [],
                startDate: new Date(),
                meetingFrequency: 'WEEKLY',
                status: 'DRAFT',
            },
            include: sgaInclude,
        });
    }

    // Raiser (or admin/management) can discard an SGA that was never submitted
    async deleteSga(sgaId: string, userId: string, organizationId: string) {
        const sga = await this.findSgaOrThrow(sgaId, organizationId);
        const employee = await this.resolveEmployee(userId, organizationId);
        const roles = await this.getUserRoles(userId, organizationId);

        if (sga.employeeId !== employee.id && !this.isPrivileged(roles)) {
            throw new ForbiddenException('You can only delete your own SGA');
        }
        if (sga.status !== 'DRAFT') {
            throw new BadRequestException('Only drafts that have not been submitted can be deleted');
        }

        await this.prisma.sga.delete({ where: { id: sgaId } });
        return { id: sgaId };
    }

    async getAllSgas(organizationId: string) {
        return this.prisma.sga.findMany({
            where: { organizationId },
            include: sgaInclude,
            orderBy: { createdAt: 'asc' },
        });
    }

    async getMySgas(userId: string, organizationId: string) {
        const employee = await this.resolveEmployee(userId, organizationId);
        return this.prisma.sga.findMany({
            where: {
                organizationId,
                OR: [
                    { employeeId: employee.id },
                    { ownerId: employee.id },
                    { teamMembers: { some: { id: employee.id } } },
                ],
            },
            include: sgaInclude,
            orderBy: { createdAt: 'asc' },
        });
    }

    async getDepartmentalSgas(departmentId: string, userId: string, organizationId: string) {
        const employee = await this.resolveEmployee(userId, organizationId);
        const roles = await this.getUserRoles(userId, organizationId);

        if (!this.isPrivileged(roles) && employee.departmentId !== departmentId) {
            throw new ForbiddenException("You can only view your own department's SGAs");
        }

        return this.prisma.sga.findMany({
            where: {
                organizationId,
                mainDepartmentId: departmentId,
                OR: [
                    { NOT: { status: { in: DRAFT_EDITABLE_STATUSES } } },
                    { employeeId: employee.id },
                ],
            },
            include: sgaInclude,
            orderBy: { createdAt: 'asc' },
        });
    }

    // SGAs awaiting the current user's step-6 verification action (any applicable stage)
    async getPendingVerification(userId: string, organizationId: string) {
        const employee = await this.resolveEmployee(userId, organizationId);
        const roles = await this.getUserRoles(userId, organizationId);

        const isCommitteeMember = await this.isSteeringCommitteeMember(employee.id, organizationId);
        const financeHodIds = await this.findFinanceDepartmentHODs(organizationId);
        const isFinanceHod = financeHodIds.includes(employee.id);
        const isDeptHod = roles.includes(Role.HOD);
        const privileged = this.isPrivileged(roles);

        if (!isCommitteeMember && !isFinanceHod && !isDeptHod && !privileged) {
            return [];
        }

        if (privileged) {
            return this.prisma.sga.findMany({
                where: { organizationId, status: { in: ['PENDING_HOD_APPROVAL', 'PENDING_VERIFICATION'] } },
                include: sgaInclude,
                orderBy: { createdAt: 'asc' },
            });
        }

        const orConditions: Array<Record<string, unknown>> = [];

        if (isCommitteeMember || isFinanceHod) {
            orConditions.push({ status: 'PENDING_VERIFICATION' });
        }
        if (isDeptHod) {
            orConditions.push({ status: 'PENDING_VERIFICATION', mainDepartmentId: employee.departmentId ?? undefined });
            orConditions.push({ status: 'PENDING_VERIFICATION', verifyingDepartmentId: employee.departmentId ?? undefined });
            orConditions.push({ status: 'PENDING_HOD_APPROVAL', mainDepartmentId: employee.departmentId ?? undefined });
        }

        if (orConditions.length === 0) return [];

        return this.prisma.sga.findMany({
            where: { organizationId, OR: orConditions },
            include: sgaInclude,
            orderBy: { createdAt: 'asc' },
        });
    }

    async getSpecificSga(sgaId: string, userId: string, organizationId: string) {
        const sga = await this.findSgaOrThrow(sgaId, organizationId);
        const employee = await this.resolveEmployee(userId, organizationId);
        const roles = await this.getUserRoles(userId, organizationId);

        const isTeam = sga.employeeId === employee.id
            || sga.ownerId === employee.id
            || sga.teamMembers.some((m) => m.id === employee.id);
        const isMainDeptHod = roles.includes(Role.HOD) && employee.departmentId === sga.mainDepartmentId;
        const isVerifyingDeptHod = roles.includes(Role.HOD) && employee.departmentId === sga.verifyingDepartmentId;
        const isDepartmentRep = sga.departmentRepId === employee.id;
        const isCommitteeMember = await this.isSteeringCommitteeMember(employee.id, organizationId);
        const financeHodIds = await this.findFinanceDepartmentHODs(organizationId);
        const isFinanceHod = financeHodIds.includes(employee.id);

        if (!isTeam && !isMainDeptHod && !isVerifyingDeptHod && !isDepartmentRep && !isCommitteeMember && !isFinanceHod && !this.isPrivileged(roles)) {
            throw new ForbiddenException('You do not have access to this SGA');
        }

        return sga;
    }

    async getSgaHistory(sgaId: string, userId: string, organizationId: string) {
        await this.getSpecificSga(sgaId, userId, organizationId);

        return this.prisma.sgaReview.findMany({
            where: { sgaId },
            orderBy: { createdAt: 'asc' },
            include: { reviewer: { select: { id: true, firstName: true, lastName: true } } },
        });
    }

    // Step 1 §1
    async updateReason(sgaId: string, userId: string, dto: UpdateSgaReasonDto, organizationId: string) {
        const sga = await this.findSgaOrThrow(sgaId, organizationId);
        const employee = await this.resolveEmployee(userId, organizationId);
        this.assertDraftEditable(sga, employee.id);

        return this.prisma.sga.update({
            where: { id: sgaId },
            data: {
                ...(dto.startingReason && {
                    startingReason: dto.startingReason,
                    startingReasonOther: dto.startingReason === 'OTHER' ? dto.startingReasonOther : null,
                }),
                referenceApplicability: dto.referenceApplicability,
                referenceType: dto.referenceApplicability === 'APPLICABLE' ? dto.referenceType : null,
                referenceNumber: dto.referenceApplicability === 'APPLICABLE' ? dto.referenceNumber : null,
            },
            include: sgaInclude,
        });
    }

    // Step 1 §2
    async updateInfo(sgaId: string, userId: string, dto: UpdateSgaInfoDto, organizationId: string) {
        const sga = await this.findSgaOrThrow(sgaId, organizationId);
        const employee = await this.resolveEmployee(userId, organizationId);
        this.assertDraftEditable(sga, employee.id);

        if (dto.mainDepartmentId) {
            const dept = await this.prisma.department.findFirst({ where: { id: dto.mainDepartmentId, organizationId } });
            if (!dept) throw new BadRequestException('Main department not found in this organization');
        }
        if (dto.otherDepartmentIds?.length) {
            const count = await this.prisma.department.count({ where: { id: { in: dto.otherDepartmentIds }, organizationId } });
            if (count !== dto.otherDepartmentIds.length) {
                throw new BadRequestException('One or more other departments were not found in this organization');
            }
        }
        const startDate = dto.startDate ?? sga.startDate?.toISOString();
        const targetCompletionDate = dto.targetCompletionDate ?? sga.targetCompletionDate?.toISOString();
        if (startDate && targetCompletionDate && new Date(targetCompletionDate) < new Date(startDate)) {
            throw new BadRequestException('Target completion date cannot be before the start date');
        }

        return this.prisma.sga.update({
            where: { id: sgaId },
            data: {
                title: dto.title,
                problemDescription: dto.problemDescription,
                startDate: dto.startDate ? new Date(dto.startDate) : undefined,
                targetCompletionDate: dto.targetCompletionDate ? new Date(dto.targetCompletionDate) : undefined,
                mainDepartmentId: dto.mainDepartmentId,
                workArea: dto.workArea,
                beforeFileUrls: dto.beforeFileUrls ?? undefined,
                ...(dto.otherDepartmentIds && {
                    otherDepartments: { set: dto.otherDepartmentIds.map((id) => ({ id })) },
                }),
            },
            include: sgaInclude,
        });
    }

    // Step 1 §3
    async updateImpact(sgaId: string, userId: string, dto: UpdateSgaImpactDto, organizationId: string) {
        const sga = await this.findSgaOrThrow(sgaId, organizationId);
        const employee = await this.resolveEmployee(userId, organizationId);
        this.assertDraftEditable(sga, employee.id);

        const categories = dto.impacts.map((i) => i.category);
        if (new Set(categories).size !== categories.length) {
            throw new BadRequestException('Each QCDSMT category can only be listed once');
        }
        const wastes = dto.wasteImpacts?.map((w) => w.waste) ?? [];
        if (new Set(wastes).size !== wastes.length) {
            throw new BadRequestException('Each waste can only be listed once');
        }
        if (wastes.includes('NOT_APPLICABLE') && wastes.length > 1) {
            throw new BadRequestException('"Not Applicable" cannot be combined with other wastes');
        }
        for (const w of dto.wasteImpacts ?? []) {
            if (w.waste !== 'NOT_APPLICABLE' && !w.whatIsMeasured?.trim()) {
                throw new BadRequestException('Every selected waste needs a measurement description');
            }
        }

        await this.prisma.$transaction(async (tx) => {
            await tx.sgaQcdsmtImpact.deleteMany({ where: { sgaId } });
            if (dto.impacts.length) {
                await tx.sgaQcdsmtImpact.createMany({
                    data: dto.impacts.map((impact) => ({ ...impact, sgaId })),
                });
            }
            await tx.sgaWasteImpact.deleteMany({ where: { sgaId } });
            if (dto.wasteImpacts?.length) {
                await tx.sgaWasteImpact.createMany({
                    data: dto.wasteImpacts.map((w) => ({
                        sgaId,
                        waste: w.waste,
                        description: w.description,
                        whatIsMeasured: w.waste === 'NOT_APPLICABLE' ? '' : (w.whatIsMeasured ?? '').trim(),
                        baselineValue: w.baselineValue,
                        targetValue: w.targetValue,
                        unit: w.unit ?? 'PIECES',
                        otherUnitLabel: w.unit === 'OTHER' ? w.otherUnitLabel : undefined,
                        currency: w.currency,
                        expectedBenefit: w.expectedBenefit,
                    })),
                });
            }
        });

        return this.findSgaOrThrow(sgaId, organizationId);
    }

    // Step 2 §4: employees eligible to be picked as owner/team member — anyone in the
    // SGA's main department or any of its "other departments involved" (Step 1 §2).
    // `pendingDepartmentIds`, when provided, overrides the persisted departments so the
    // picker can reflect a department chosen in Step 1.2 that hasn't been saved yet.
    async getTeamCandidates(sgaId: string, userId: string, organizationId: string, pendingDepartmentIds?: string[]) {
        const sga = await this.findSgaOrThrow(sgaId, organizationId);
        const employee = await this.resolveEmployee(userId, organizationId);
        this.assertDraftEditable(sga, employee.id);

        let departmentIds: string[];
        if (pendingDepartmentIds) {
            const count = await this.prisma.department.count({ where: { id: { in: pendingDepartmentIds }, organizationId } });
            if (count !== pendingDepartmentIds.length) {
                throw new BadRequestException('One or more departments were not found in this organization');
            }
            departmentIds = pendingDepartmentIds;
        } else {
            departmentIds = [sga.mainDepartmentId, ...sga.otherDepartments.map((d) => d.id)].filter(
                (id): id is string => !!id,
            );
        }
        if (departmentIds.length === 0) return [];

        return this.prisma.employee.findMany({
            where: { organizationId, departmentId: { in: departmentIds } },
            select: { id: true, firstName: true, lastName: true, jobTitle: true },
            orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        });
    }

    // Step 2 §4
    async updateTeam(sgaId: string, userId: string, dto: UpdateSgaTeamDto, organizationId: string) {
        const ids = [...new Set([dto.ownerId, ...(dto.teamMemberIds ?? [])].filter((id): id is string => !!id))];
        if (await this.prisma.employee.count({ where: { id: { in: ids }, organizationId } }) !== ids.length) {
            throw new BadRequestException('SGA team members must belong to this organization');
        }

        const sga = await this.findSgaOrThrow(sgaId, organizationId);
        const employee = await this.resolveEmployee(userId, organizationId);
        this.assertDraftEditable(sga, employee.id);

        return this.prisma.sga.update({
            where: { id: sgaId },
            data: {
                ownerId: dto.ownerId,
                ...(dto.teamMemberIds && {
                    teamMembers: { set: dto.teamMemberIds.map((id) => ({ id })) },
                }),
            },
            include: sgaInclude,
        });
    }

    // Step 2 §5
    async updateMeetingPlan(sgaId: string, userId: string, dto: UpdateSgaMeetingPlanDto, organizationId: string) {
        const sga = await this.findSgaOrThrow(sgaId, organizationId);
        const employee = await this.resolveEmployee(userId, organizationId);
        this.assertDraftEditable(sga, employee.id);

        let durationMinutes = dto.meetingDurationMinutes;
        if (dto.meetingTime && dto.meetingEndTime) {
            const [sh, sm] = dto.meetingTime.split(':').map(Number);
            const [eh, em] = dto.meetingEndTime.split(':').map(Number);
            const diff = (eh * 60 + em) - (sh * 60 + sm);
            durationMinutes = diff > 0 ? diff : diff + 24 * 60;
        }

        return this.prisma.sga.update({
            where: { id: sgaId },
            data: {
                meetingFrequency: dto.meetingFrequency,
                meetingFrequencyCustomText: dto.meetingFrequency === 'CUSTOM' ? dto.meetingFrequencyCustomText : null,
                meetingDay: dto.meetingFrequency === 'DAILY' ? null : dto.meetingDay,
                meetingTime: dto.meetingTime,
                meetingEndTime: dto.meetingEndTime,
                meetingDurationMinutes: durationMinutes,
                meetingLocation: dto.meetingLocation,
            },
            include: sgaInclude,
        });
    }

    // Step 2 §6 (resources/investment only, not the HOD decision)
    async updateResources(sgaId: string, userId: string, dto: UpdateSgaResourcesDto, organizationId: string) {
        const sga = await this.findSgaOrThrow(sgaId, organizationId);
        const employee = await this.resolveEmployee(userId, organizationId);
        this.assertDraftEditable(sga, employee.id);

        return this.prisma.sga.update({
            where: { id: sgaId },
            data: {
                requiredResources: dto.requiredResources,
                expectedBenefitSummary: dto.expectedBenefitSummary,
                approximateInvestmentAmount: dto.approximateInvestmentAmount,
                approximateInvestmentCurrency: dto.approximateInvestmentCurrency,
            },
            include: sgaInclude,
        });
    }

    // submit steps 1-2 for HOD approval
    async submitForHodApproval(sgaId: string, userId: string, organizationId: string) {
        const sga = await this.findSgaOrThrow(sgaId, organizationId);
        const employee = await this.resolveEmployee(userId, organizationId);
        this.assertDraftEditable(sga, employee.id);

        const missing = getDraftMissingItems(sga);
        if (missing.length) {
            throw new BadRequestException({
                statusCode: 400,
                error: 'Bad Request',
                message: 'Complete the missing items before submitting for HOD approval',
                missing,
            });
        }

        const updated = await this.prisma.$transaction(async (tx) => {
            const result = await tx.sga.update({
                where: { id: sgaId },
                data: {
                    status: 'PENDING_HOD_APPROVAL',
                    hodDecision: 'PENDING',
                    hodRemarks: null,
                    hodDecisionById: null,
                    hodDecisionAt: null,
                },
                include: sgaInclude,
            });
            await this.recordReview(sgaId, employee.id, 'PENDING_HOD_APPROVAL');
            return result;
        });

        // getDraftMissingItems guarantees a main department at this point
        const hodIds = await this.findDepartmentHODs(sga.mainDepartmentId!, organizationId);
        await this.notifications.createMany(
            hodIds
                .filter((id) => id !== employee.id)
                .map((hodId) => ({
                    employeeId: hodId,
                    type: 'ACTION_REQUIRED' as const,
                    module: 'SGA',
                    title: 'SGA awaiting your approval',
                    message: `An SGA "${sga.title}" is awaiting your approval before the team can proceed.`,
                    actionUrl: `/sga/${sgaId}`,
                    metadata: { sgaId },
                }))
        );

        return updated;
    }

    // Step 2 §6 HOD decision
    async submitHodApproval(sgaId: string, userId: string, dto: SubmitSgaHodApprovalDto, organizationId: string) {
        const sga = await this.findSgaOrThrow(sgaId, organizationId);
        if (sga.status !== 'PENDING_HOD_APPROVAL') {
            throw new BadRequestException('This SGA is not awaiting HOD approval');
        }

        const reviewer = await this.resolveEmployee(userId, organizationId);
        const roles = await this.getUserRoles(userId, organizationId);
        const isMainDeptHod = roles.includes(Role.HOD) && reviewer.departmentId === sga.mainDepartmentId;

        if (!isMainDeptHod && !this.isPrivileged(roles)) {
            throw new ForbiddenException('Only the department HOD or admin can approve this SGA');
        }

        const statusByDecision: Record<typeof dto.decision, SgaStatus> = {
            APPROVED: 'IN_PROGRESS',
            RETURNED: 'RETURNED_FOR_REVISION',
            REJECTED: 'REJECTED',
        };
        const newStatus = statusByDecision[dto.decision];

        const updated = await this.prisma.$transaction(async (tx) => {
            const result = await tx.sga.update({
                where: { id: sgaId },
                data: {
                    status: newStatus,
                    hodDecision: dto.decision,
                    hodRemarks: dto.remarks,
                    hodDecisionById: reviewer.id,
                    hodDecisionAt: new Date(),
                },
                include: sgaInclude,
            });
            await this.recordReview(sgaId, reviewer.id, newStatus, dto.remarks);
            return result;
        });

        const recipientIds = [...new Set([sga.employeeId, sga.ownerId].filter((id): id is string => !!id))];
        await this.notifications.createMany(
            recipientIds
                .filter((id) => id !== reviewer.id)
                .map((employeeId) => ({
                    employeeId,
                    type: dto.decision === 'APPROVED' ? ('INFO' as const) : ('ACTION_REQUIRED' as const),
                    module: 'SGA',
                    title: `Your SGA was ${dto.decision.toLowerCase()} by the HOD`,
                    message: dto.remarks ?? `Your SGA "${sga.title}" approval decision is in.`,
                    actionUrl: `/sga/${sgaId}`,
                    metadata: { sgaId, newStatus },
                }))
        );

        return updated;
    }

    // Step 3 §7
    async updateCondition(sgaId: string, userId: string, dto: UpdateSgaConditionDto, organizationId: string) {
        const sga = await this.findSgaOrThrow(sgaId, organizationId);
        const employee = await this.resolveEmployee(userId, organizationId);
        this.assertTeamEditable(sga, employee.id);

        await this.prisma.$transaction(async (tx) => {
            await tx.sga.update({
                where: { id: sgaId },
                data: {
                    evidenceSource: dto.evidenceSource,
                    immediateControlNeeded: dto.immediateControlNeeded,
                },
            });
            if (dto.measures) {
                await tx.sgaMeasure.deleteMany({ where: { sgaId } });
                if (dto.measures.length) {
                    await tx.sgaMeasure.createMany({
                        data: dto.measures.map(({ id: _id, ...m }) => ({ ...m, sgaId })),
                    });
                }
            }
        });

        return this.findSgaOrThrow(sgaId, organizationId);
    }

    // Step 3 §8
    async updateRootCause(sgaId: string, userId: string, dto: UpdateSgaRootCauseDto, organizationId: string) {
        const sga = await this.findSgaOrThrow(sgaId, organizationId);
        const employee = await this.resolveEmployee(userId, organizationId);
        this.assertTeamEditable(sga, employee.id);

        await this.prisma.$transaction(async (tx) => {
            await tx.sga.update({
                where: { id: sgaId },
                data: {
                    rootCauseTools: dto.rootCauseTools ?? undefined,
                    otherAnalysisNotes: dto.otherAnalysisNotes,
                    otherAnalysisFileUrls: dto.otherAnalysisFileUrls ?? undefined,
                },
            });
            if (dto.fishboneCauses) {
                await tx.sgaFishboneCause.deleteMany({ where: { sgaId } });
                if (dto.fishboneCauses.length) {
                    await tx.sgaFishboneCause.createMany({
                        data: dto.fishboneCauses.map(({ id: _id, ...c }) => ({ ...c, sgaId })),
                    });
                }
            }
            if (dto.whyWhyChains) {
                await tx.sgaWhyWhyChain.deleteMany({ where: { sgaId } });
                if (dto.whyWhyChains.length) {
                    await tx.sgaWhyWhyChain.createMany({
                        data: dto.whyWhyChains.map(({ id: _id, ...c }) => ({ ...c, sgaId, whys: c.whys ?? [] })),
                    });
                }
            }
        });

        return this.findSgaOrThrow(sgaId, organizationId);
    }

    // Step 3 §9
    async createMeetingReport(sgaId: string, userId: string, dto: CreateSgaMeetingReportDto, organizationId: string) {
        const sga = await this.findSgaOrThrow(sgaId, organizationId);
        const employee = await this.resolveEmployee(userId, organizationId);
        this.assertTeamEditable(sga, employee.id);

        const existing = await this.prisma.sgaMeetingReport.findUnique({
            where: { sgaId_meetingNumber: { sgaId, meetingNumber: dto.meetingNumber } },
        });
        if (existing) {
            throw new BadRequestException(`Meeting #${dto.meetingNumber} has already been logged`);
        }

        await this.prisma.sgaMeetingReport.create({
            data: {
                sgaId,
                meetingNumber: dto.meetingNumber,
                meetingDate: new Date(dto.meetingDate),
                durationMinutes: dto.durationMinutes,
                attendeeIds: dto.attendeeIds ?? [],
                notes: dto.notes,
            },
        });

        return this.findSgaOrThrow(sgaId, organizationId);
    }

    async updateMeetingReport(sgaId: string, reportId: string, userId: string, dto: UpdateSgaMeetingReportDto, organizationId: string) {
        const sga = await this.findSgaOrThrow(sgaId, organizationId);
        const employee = await this.resolveEmployee(userId, organizationId);
        this.assertTeamEditable(sga, employee.id);

        const report = await this.prisma.sgaMeetingReport.findFirst({ where: { id: reportId, sgaId } });
        if (!report) throw new NotFoundException('Meeting report not found');

        await this.prisma.sgaMeetingReport.update({
            where: { id: reportId },
            data: {
                meetingDate: dto.meetingDate ? new Date(dto.meetingDate) : undefined,
                durationMinutes: dto.durationMinutes,
                attendeeIds: dto.attendeeIds,
                notes: dto.notes,
            },
        });

        return this.findSgaOrThrow(sgaId, organizationId);
    }

    async deleteMeetingReport(sgaId: string, reportId: string, userId: string, organizationId: string) {
        const sga = await this.findSgaOrThrow(sgaId, organizationId);
        const employee = await this.resolveEmployee(userId, organizationId);
        this.assertTeamEditable(sga, employee.id);

        const report = await this.prisma.sgaMeetingReport.findFirst({ where: { id: reportId, sgaId } });
        if (!report) throw new NotFoundException('Meeting report not found');

        await this.prisma.sgaMeetingReport.delete({ where: { id: reportId } });
        return this.findSgaOrThrow(sgaId, organizationId);
    }

    // Step 4 §10
    async updateActionPlan(sgaId: string, userId: string, dto: UpdateSgaActionPlanDto, organizationId: string) {
        const sga = await this.findSgaOrThrow(sgaId, organizationId);
        const employee = await this.resolveEmployee(userId, organizationId);
        this.assertTeamEditable(sga, employee.id);

        const responsibleIds = [...new Set(dto.actionItems.map((i) => i.responsiblePersonId).filter((id): id is string => !!id))];
        if (responsibleIds.length && await this.prisma.employee.count({ where: { id: { in: responsibleIds }, organizationId } }) !== responsibleIds.length) {
            throw new BadRequestException('Responsible persons must belong to this organization');
        }

        // Items are rewritten on save; carry each kept item's id and progress over so
        // ticking an action off is not lost when someone edits the plan.
        const existing = new Map(sga.actionItems.map((a) => [a.id, a]));
        await this.prisma.$transaction(async (tx) => {
            await tx.sgaActionItem.deleteMany({ where: { sgaId } });
            if (dto.actionItems.length) {
                await tx.sgaActionItem.createMany({
                    data: dto.actionItems.map(({ id, dueDate, ...item }) => {
                        const kept = id ? existing.get(id) : undefined;
                        return {
                            ...item,
                            ...(kept && { id: kept.id, status: kept.status, completedAt: kept.completedAt }),
                            sgaId,
                            dueDate: dueDate ? new Date(dueDate) : undefined,
                        };
                    }),
                });
            }
        });

        return this.findSgaOrThrow(sgaId, organizationId);
    }

    // Step 4 §10: the team or the person responsible can move one action along
    async updateActionItemStatus(sgaId: string, itemId: string, userId: string, dto: UpdateSgaActionItemStatusDto, organizationId: string) {
        const sga = await this.findSgaOrThrow(sgaId, organizationId);
        const employee = await this.resolveEmployee(userId, organizationId);
        const item = sga.actionItems.find((a) => a.id === itemId);
        if (!item) throw new NotFoundException('Action item not found');
        if (item.responsiblePersonId !== employee.id) {
            this.assertTeamEditable(sga, employee.id);
        } else if (!TEAM_EDITABLE_STATUSES.includes(sga.status)) {
            throw new BadRequestException('This SGA is not in a stage where actions can be updated');
        }

        await this.prisma.sgaActionItem.update({
            where: { id: itemId },
            data: {
                status: dto.status,
                completedAt: dto.status === 'DONE' ? (item.completedAt ?? new Date()) : null,
            },
        });
        return this.findSgaOrThrow(sgaId, organizationId);
    }

    // Step 4 §11: owner only
    async updateImplementation(sgaId: string, userId: string, dto: UpdateSgaImplementationDto, organizationId: string) {
        const sga = await this.findSgaOrThrow(sgaId, organizationId);
        const employee = await this.resolveEmployee(userId, organizationId);
        this.assertOwnerEditable(sga, employee.id);

        return this.prisma.sga.update({
            where: { id: sgaId },
            data: {
                implementationSummary: dto.implementationSummary,
                afterFileUrls: dto.afterFileUrls ?? undefined,
                actualImplementationCost: dto.actualImplementationCost ?? null,
                actualImplementationCostCurrency: dto.actualImplementationCostCurrency ?? null,
                implementationStatus: dto.implementationStatus,
            },
            include: sgaInclude,
        });
    }

    // Step 5 §12: finalize measures (baseline/target rows created in Step 3 §7)
    async updateResults(sgaId: string, userId: string, dto: UpdateSgaResultsDto, organizationId: string) {
        const sga = await this.findSgaOrThrow(sgaId, organizationId);
        const employee = await this.resolveEmployee(userId, organizationId);
        this.assertTeamEditable(sga, employee.id);

        const existingIds = new Set(sga.measures.map((m) => m.id));
        for (const item of dto.measures) {
            if (item.id && !existingIds.has(item.id)) {
                throw new BadRequestException('One or more measures do not belong to this SGA');
            }
        }

        await this.prisma.$transaction(async (tx) => {
            for (const { id, ...item } of dto.measures) {
                if (id) {
                    await tx.sgaMeasure.update({ where: { id }, data: item });
                } else {
                    await tx.sgaMeasure.create({ data: { ...item, sgaId } });
                }
            }
        });

        return this.findSgaOrThrow(sgaId, organizationId);
    }

    // Step 5 §13
    async updateBenefits(sgaId: string, userId: string, dto: UpdateSgaBenefitsDto, organizationId: string) {
        const sga = await this.findSgaOrThrow(sgaId, organizationId);
        const employee = await this.resolveEmployee(userId, organizationId);
        this.assertTeamEditable(sga, employee.id);

        const categories = dto.qcdsmtBenefits?.map((b) => b.category) ?? [];
        if (new Set(categories).size !== categories.length) {
            throw new BadRequestException('Each QCDSMT category can only be listed once');
        }

        await this.prisma.$transaction(async (tx) => {
            await tx.sga.update({
                where: { id: sgaId },
                data: {
                    wasteReductionAchieved: dto.wasteReductionAchieved,
                    financialLossBeforeImprovement: dto.financialLossBeforeImprovement ?? null,
                    verifiedGrossBenefit: dto.verifiedGrossBenefit ?? null,
                    benefitPeriod: dto.benefitPeriod,
                    effectivenessConfirmationPeriod: dto.effectivenessConfirmationPeriod,
                    sopUpdated: dto.sopUpdated,
                    employeesTrained: dto.employeesTrained,
                    followUpCheckPlanned: dto.followUpCheckPlanned,
                    appliedElsewhere: dto.appliedElsewhere,
                    lessonsLearned: dto.lessonsLearned,
                },
            });
            if (dto.qcdsmtBenefits) {
                await tx.sgaQcdsmtBenefit.deleteMany({ where: { sgaId } });
                if (dto.qcdsmtBenefits.length) {
                    await tx.sgaQcdsmtBenefit.createMany({
                        data: dto.qcdsmtBenefits.map((b) => ({ ...b, sgaId })),
                    });
                }
            }
        });

        return this.findSgaOrThrow(sgaId, organizationId);
    }

    // Step 6 §14: select the affected department + rep before submitting for verification
    async updateVerifyingDepartment(sgaId: string, userId: string, dto: UpdateSgaVerifyingDepartmentDto, organizationId: string) {
        const sga = await this.findSgaOrThrow(sgaId, organizationId);
        const employee = await this.resolveEmployee(userId, organizationId);
        this.assertTeamEditable(sga, employee.id);

        const dept = await this.prisma.department.findFirst({ where: { id: dto.verifyingDepartmentId, organizationId } });
        if (!dept) throw new BadRequestException('Verifying department not found in this organization');

        if (dto.departmentRepId) {
            const rep = await this.prisma.employee.findFirst({ where: { id: dto.departmentRepId, organizationId } });
            if (!rep) throw new BadRequestException('Department representative not found in this organization');
        }

        return this.prisma.sga.update({
            where: { id: sgaId },
            data: {
                verifyingDepartmentId: dto.verifyingDepartmentId,
                departmentRepId: dto.departmentRepId,
            },
            include: sgaInclude,
        });
    }

    // submit steps 3-5 for the four-stage step-6 verification
    async submitForVerification(sgaId: string, userId: string, organizationId: string) {
        const sga = await this.findSgaOrThrow(sgaId, organizationId);
        const employee = await this.resolveEmployee(userId, organizationId);

        const isRaiserOrOwner = sga.employeeId === employee.id || sga.ownerId === employee.id;
        if (!isRaiserOrOwner) {
            throw new ForbiddenException('Only the raiser or owner can submit this SGA for verification');
        }
        if (!TEAM_EDITABLE_STATUSES.includes(sga.status)) {
            throw new BadRequestException('This SGA is not ready for verification');
        }
        if (!sga.implementationSummary) {
            throw new BadRequestException('Complete steps 3-5 before submitting for verification');
        }

        const financeApplicable = sga.qcdsmtImpacts.some((i) => i.category === 'COST');
        const affectedDeptApplicable = !!sga.verifyingDepartmentId;

        const updated = await this.prisma.$transaction(async (tx) => {
            const stageApplicability: Record<SgaVerificationStage, boolean> = {
                AFFECTED_DEPARTMENT: affectedDeptApplicable,
                HOD: true,
                STEERING_COMMITTEE: true,
                FINANCE: financeApplicable,
            };
            const stages: SgaVerificationStage[] = ['AFFECTED_DEPARTMENT', 'HOD', 'STEERING_COMMITTEE', 'FINANCE'];
            for (const stage of stages) {
                await tx.sgaVerification.upsert({
                    where: { sgaId_stage: { sgaId, stage } },
                    create: { sgaId, stage, decision: stageApplicability[stage] ? 'PENDING' : 'NOT_APPLICABLE' },
                    update: {
                        decision: stageApplicability[stage] ? 'PENDING' : 'NOT_APPLICABLE',
                        remarks: null,
                        verifiedById: null,
                        verifiedAt: null,
                    },
                });
            }

            const result = await tx.sga.update({
                where: { id: sgaId },
                data: { status: 'PENDING_VERIFICATION' },
                include: sgaInclude,
            });
            await this.recordReview(sgaId, employee.id, 'PENDING_VERIFICATION');
            return result;
        });

        const hodIds = await this.findDepartmentHODs(sga.mainDepartmentId!, organizationId);
        const verifyingDeptHodIds = affectedDeptApplicable ? await this.findDepartmentHODs(sga.verifyingDepartmentId!, organizationId) : [];
        const committeeMemberIds = await this.getSteeringCommitteeMemberIds(organizationId);
        const financeHodIds = financeApplicable ? await this.findFinanceDepartmentHODs(organizationId) : [];
        const departmentRepIds = sga.departmentRepId ? [sga.departmentRepId] : [];

        await this.notifications.createMany(
            [...new Set([...hodIds, ...verifyingDeptHodIds, ...committeeMemberIds, ...financeHodIds, ...departmentRepIds])]
                .filter((id) => id !== employee.id)
                .map((recipientId) => ({
                    employeeId: recipientId,
                    type: 'ACTION_REQUIRED' as const,
                    module: 'SGA',
                    title: 'SGA awaiting closure verification',
                    message: `An SGA "${sga.title}" is awaiting your closure verification.`,
                    actionUrl: `/sga/${sgaId}`,
                    metadata: { sgaId },
                }))
        );

        return updated;
    }

    // Step 6 §14: per-stage decision
    async submitVerificationStage(sgaId: string, userId: string, dto: SubmitSgaVerificationStageDto, organizationId: string) {
        const sga = await this.findSgaOrThrow(sgaId, organizationId);
        if (sga.status !== 'PENDING_VERIFICATION') {
            throw new BadRequestException('This SGA is not awaiting verification');
        }

        const verifier = await this.resolveEmployee(userId, organizationId);
        const roles = await this.getUserRoles(userId, organizationId);
        const privileged = this.isPrivileged(roles);

        const existingStage = sga.verifications.find((v) => v.stage === dto.stage);
        if (!existingStage || existingStage.decision === 'NOT_APPLICABLE') {
            throw new BadRequestException('This verification stage is not applicable to this SGA');
        }

        const isMainDeptHod = roles.includes(Role.HOD) && verifier.departmentId === sga.mainDepartmentId;

        if (dto.stage === 'AFFECTED_DEPARTMENT') {
            const isVerifyingDeptHod = roles.includes(Role.HOD) && verifier.departmentId === sga.verifyingDepartmentId;
            const isDepartmentRep = sga.departmentRepId === verifier.id;
            if (!isVerifyingDeptHod && !isDepartmentRep && !privileged) {
                throw new ForbiddenException('Only the verifying department HOD, the designated representative, or admin can submit this verification');
            }
        } else if (dto.stage === 'HOD') {
            if (!isMainDeptHod && !privileged) {
                throw new ForbiddenException('Only the department HOD or admin can submit the HOD verification');
            }
        } else if (dto.stage === 'STEERING_COMMITTEE') {
            const isCommitteeMember = await this.isSteeringCommitteeMember(verifier.id, organizationId);
            if (!isCommitteeMember && !isMainDeptHod && !privileged) {
                throw new ForbiddenException('Only a steering committee member, the department HOD, or admin can submit this verification');
            }
        } else if (dto.stage === 'FINANCE') {
            const financeHodIds = await this.findFinanceDepartmentHODs(organizationId);
            if (!financeHodIds.includes(verifier.id) && !isMainDeptHod && !privileged) {
                throw new ForbiddenException('Only the Finance HOD, the department HOD, or admin can submit the Finance verification');
            }
        }

        const updated = await this.prisma.$transaction(async (tx) => {
            await tx.sgaVerification.update({
                where: { sgaId_stage: { sgaId, stage: dto.stage } },
                data: {
                    decision: dto.decision,
                    remarks: dto.remarks,
                    verifiedById: verifier.id,
                    verifiedAt: new Date(),
                },
            });

            const stages = await tx.sgaVerification.findMany({ where: { sgaId } });
            const applicable = stages.filter((s) => s.decision !== 'NOT_APPLICABLE' || s.stage === dto.stage);
            const anyReturned = applicable.some((s) => (s.stage === dto.stage ? dto.decision : s.decision) === 'RETURN');
            const allVerified = applicable.every((s) => (s.stage === dto.stage ? dto.decision : s.decision) === 'VERIFIED');

            let newStatus: SgaStatus = sga.status;
            if (anyReturned) {
                newStatus = 'RETURNED_FOR_REWORK';
                await tx.sgaVerification.updateMany({
                    where: { sgaId, decision: { in: ['PENDING', 'VERIFIED'] } },
                    data: { decision: 'PENDING' },
                });
            } else if (allVerified) {
                newStatus = 'VERIFIED_CLOSED';
            }

            let result = sga;
            if (newStatus !== sga.status) {
                result = await tx.sga.update({
                    where: { id: sgaId },
                    data: { status: newStatus },
                    include: sgaInclude,
                });
                await this.recordReview(sgaId, verifier.id, newStatus, dto.remarks);
            } else {
                result = await tx.sga.findFirstOrThrow({ where: { id: sgaId }, include: sgaInclude });
            }
            return result;
        });

        const closed = updated.status === 'VERIFIED_CLOSED';
        const recipientIds = [...new Set([sga.employeeId, sga.ownerId].filter((id): id is string => !!id))];
        await this.notifications.createMany(
            recipientIds
                .filter((id) => id !== verifier.id)
                .map((employeeId) => ({
                    employeeId,
                    type: dto.decision === 'RETURN' ? ('ACTION_REQUIRED' as const) : ('INFO' as const),
                    module: 'SGA',
                    title: closed
                        ? 'SGA verified and closed'
                        : `${dto.stage.replace(/_/g, ' ')} verification ${dto.decision === 'RETURN' ? 'returned' : 'recorded'}`,
                    message: closed
                        ? `Your SGA "${sga.title}" has passed all verification stages and is now closed.`
                        : (dto.remarks ?? `Your SGA "${sga.title}" received a ${dto.stage.toLowerCase()} verification decision.`),
                    actionUrl: `/sga/${sgaId}`,
                    metadata: { sgaId, stage: dto.stage, decision: dto.decision, closed },
                }))
        );

        return updated;
    }
}
