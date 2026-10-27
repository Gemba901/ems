import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger, OnModuleInit } from '@nestjs/common';
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
import { Prisma, RecurrenceUnit, SgaActionStatus, SgaStatus, SgaVerificationStage, SgaWeekday, TaskFrequency, TaskSourceModule, TaskStatus } from 'db';
import { DwmsTaskBridge, DwmsTaskSourceInput } from 'src/dwms/services/dwms-task-bridge.service';
import { DwmsTaskEvents, DwmsTaskStatusChange } from 'src/dwms/services/dwms-task-events.service';
import { recurrenceFrequency } from 'src/dwms/utils/taskSchedule';

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
    sourceSuggestion: { select: { id: true, title: true, status: true } },
    sourceKaizen: { select: { id: true, title: true, status: true } },
    sourceAlert: { select: { id: true, title: true, isAbnormality: true } },
    sourceFiveSAction: { select: { id: true, reference: true, finding: true } },
    // Join 12: current 5S standards written from this improvement
    fiveSStandards: {
        where: { status: { not: 'SUPERSEDED' as const } },
        orderBy: { createdAt: 'asc' as const },
        select: { id: true, title: true, status: true, revision: true, area: { select: { id: true, name: true } } },
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

// DWMS recurrence weekdays: 0 = Sunday ... 6 = Saturday
const SGA_WEEKDAY_NUMBERS: Record<SgaWeekday, number> = {
    SUNDAY: 0,
    MONDAY: 1,
    TUESDAY: 2,
    WEDNESDAY: 3,
    THURSDAY: 4,
    FRIDAY: 5,
    SATURDAY: 6,
};

// What a DWMS status means for an SGA action item. Statuses not listed (awaiting approval,
// not applicable) leave the item as it is.
const ACTION_STATUS_FOR_TASK: Partial<Record<TaskStatus, SgaActionStatus>> = {
    [TaskStatus.DONE]: SgaActionStatus.DONE,
    [TaskStatus.IN_PROGRESS]: SgaActionStatus.IN_PROGRESS,
    [TaskStatus.PARTLY_DONE]: SgaActionStatus.IN_PROGRESS,
    [TaskStatus.LESS_THAN_50]: SgaActionStatus.IN_PROGRESS,
    [TaskStatus.PENDING]: SgaActionStatus.OPEN,
};

@Injectable()
export class SgaService implements OnModuleInit {
    private readonly logger = new Logger(SgaService.name);

    constructor(
        private prisma: PrismaService,
        private notifications: NotificationsService,
        private dwmsTasks: DwmsTaskBridge,
        private dwmsTaskEvents: DwmsTaskEvents,
    ) {}

    onModuleInit() {
        this.dwmsTaskEvents.onStatusChange(TaskSourceModule.SGA, (change) => this.updateActionItemFromDwms(change));
    }

    // DWMS -> SGA: ticking an action item's task on the DWMS list updates the item, while the team can
    // still update actions. A meeting task (SGA_MEETING) needs a written report, so it doesn't flow back.
    async updateActionItemFromDwms(change: DwmsTaskStatusChange) {
        const status = ACTION_STATUS_FOR_TASK[change.toStatus];
        if (!status) return;
        const item = await this.prisma.sgaActionItem.findUnique({
            where: { id: change.sourceId },
            select: { id: true, status: true, completedAt: true, sga: { select: { status: true } } },
        });
        if (!item || item.status === status || !TEAM_EDITABLE_STATUSES.includes(item.sga.status)) return;
        // Back to pending only reopens a finished item; it doesn't undo work that was under way.
        if (status === SgaActionStatus.OPEN && item.status !== SgaActionStatus.DONE) return;

        await this.prisma.sgaActionItem.update({
            where: { id: item.id },
            data: {
                status,
                completedAt: status === SgaActionStatus.DONE ? (item.completedAt ?? new Date()) : null,
            },
        });
    }

    // SGA -> DWMS: each action item becomes a task for its responsible person, and the meeting plan a
    // recurring task for the owner. Runs after the SGA is saved and never fails the request; the sync
    // is idempotent, so the next save repairs anything a failure left behind.
    private async syncDwmsTasks(sgaId: string, action: (bridge: DwmsTaskBridge) => Promise<unknown>) {
        try {
            await action(this.dwmsTasks);
        } catch (error) {
            this.logger.error(`DWMS task sync failed for SGA ${sgaId}`, error instanceof Error ? error.stack : error);
        }
    }

    // Items without a responsible person or any due date (own or the SGA's target) get no task;
    // items already DONE are closed rather than (re)created.
    private syncActionItemTasks(sga: SgaWithInclude, assignedById: string) {
        const sgaTitle = sga.title ?? 'Untitled SGA';
        const inputs: DwmsTaskSourceInput[] = [];
        const closedIds: string[] = [];
        for (const item of sga.actionItems) {
            if (item.status === 'DONE') {
                closedIds.push(item.id);
                continue;
            }
            const dueDate = item.dueDate ?? sga.targetCompletionDate;
            if (!item.responsiblePersonId || !dueDate) continue;
            inputs.push({
                sourceModule: TaskSourceModule.SGA,
                sourceId: item.id,
                sourceParentId: sga.id,
                sourceRef: `SGA · ${sgaTitle}`,
                ownerId: item.responsiblePersonId,
                title: `SGA action: ${item.improvementAction}`,
                description: `Root cause: ${item.confirmedRootCause}`,
                departmentId: sga.mainDepartmentId,
                assignedById,
                frequency: TaskFrequency.PLANNED,
                dueDate,
            });
        }
        return this.syncDwmsTasks(sga.id, (bridge) => bridge.syncParentFromSource(
            { sourceModule: TaskSourceModule.SGA, sourceParentId: sga.id },
            inputs,
            closedIds,
        ));
    }

    // The meeting plan as a recurring task for the owner, from approval (or the start date if later).
    // CUSTOM plans, and weekly plans without a day, have no schedule DWMS can generate.
    private syncMeetingTask(sga: SgaWithInclude, assignedById: string) {
        if (!sga.ownerId || !sga.meetingFrequency) return;
        const weekday = sga.meetingDay ? SGA_WEEKDAY_NUMBERS[sga.meetingDay] : null;
        const schedule: Partial<Record<NonNullable<SgaWithInclude['meetingFrequency']>, { unit: RecurrenceUnit; interval: number; weekdays: number[] } | null>> = {
            DAILY: { unit: RecurrenceUnit.DAY, interval: 1, weekdays: [] },
            WEEKLY: weekday === null ? null : { unit: RecurrenceUnit.WEEK, interval: 1, weekdays: [weekday] },
            BIWEEKLY: weekday === null ? null : { unit: RecurrenceUnit.WEEK, interval: 2, weekdays: [weekday] },
            MONTHLY: { unit: RecurrenceUnit.MONTH, interval: 1, weekdays: [] },
        };
        const rule = schedule[sga.meetingFrequency];
        if (!rule) return;

        const today = new Date();
        const startsOn = sga.startDate && sga.startDate > today ? sga.startDate : today;
        const time = [sga.meetingTime, sga.meetingEndTime].filter(Boolean).join('–');
        const description = [time && `Time: ${time}`, sga.meetingLocation && `Location: ${sga.meetingLocation}`]
            .filter(Boolean)
            .join('\n');
        const sgaTitle = sga.title ?? 'Untitled SGA';

        return this.syncDwmsTasks(sga.id, (bridge) => bridge.upsertFromSource({
            sourceModule: TaskSourceModule.SGA_MEETING,
            sourceId: sga.id,
            sourceParentId: sga.id,
            sourceRef: `SGA · ${sgaTitle}`,
            ownerId: sga.ownerId!,
            title: `SGA meeting: ${sgaTitle}`,
            description: description || null,
            departmentId: sga.mainDepartmentId,
            assignedById,
            frequency: recurrenceFrequency(rule.unit, rule.interval),
            recurrenceUnit: rule.unit,
            recurrenceInterval: rule.interval,
            recurrenceWeekdays: rule.weekdays,
            recurrenceStartsOn: startsOn,
        }));
    }

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
        return this.createSgaRecord(employee, dto, organizationId);
    }

    // create an SGA draft on behalf of another employee (e.g. the SIMS responsible person when a
    // suggestion is SELECTED_FOR_SGA). They become the raiser and owner, so they can edit the
    // draft as if they'd started it. The caller stores the link on its own record
    // (Suggestion.linkedSgaId).
    async createSgaForEmployee(
        employeeId: string,
        dto: CreateSgaDto & { ownerId?: string; sourceAlertId?: string; sourceFiveSActionId?: string },
        organizationId: string,
    ) {
        const employee = await this.prisma.employee.findFirst({
            where: { id: employeeId, organizationId },
            select: { id: true, departmentId: true },
        });
        if (!employee) throw new NotFoundException('Employee not found');
        return this.createSgaRecord(employee, dto, organizationId, dto.ownerId ?? employee.id, {
            sourceAlertId: dto.sourceAlertId,
            sourceFiveSActionId: dto.sourceFiveSActionId,
        });
    }

    private async createSgaRecord(
        employee: { id: string; departmentId: string | null },
        dto: CreateSgaDto,
        organizationId: string,
        ownerId?: string,
        links: { sourceAlertId?: string; sourceFiveSActionId?: string } = {},
    ) {
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
                ownerId,
                startingReason: dto.startingReason,
                title,
                problemDescription,
                mainDepartmentId,
                workArea: dto.workArea?.trim() || undefined,
                beforeFileUrls: dto.beforeFileUrls ?? [],
                startDate: new Date(),
                meetingFrequency: 'WEEKLY',
                status: 'DRAFT',
                sourceAlertId: links.sourceAlertId,
                sourceFiveSActionId: links.sourceFiveSActionId,
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

        if (newStatus === 'IN_PROGRESS') {
            await this.syncMeetingTask(updated, reviewer.id);
            await this.syncActionItemTasks(updated, reviewer.id);
        }

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

        const saved = await this.findSgaOrThrow(sgaId, organizationId);
        await this.syncActionItemTasks(saved, employee.id);
        return saved;
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

        const key = { sourceModule: TaskSourceModule.SGA, sourceId: itemId };
        if (dto.status === 'DONE' && item.status !== 'DONE') {
            await this.syncDwmsTasks(sgaId, (bridge) => bridge.closeFromSource(key));
        } else if (dto.status !== 'DONE' && item.status === 'DONE') {
            await this.syncDwmsTasks(sgaId, (bridge) => bridge.reopenFromSource(key));
        }
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

        const updated = await this.prisma.$transaction(async (tx) => {
            const stageApplicability: Record<SgaVerificationStage, boolean> = {
                // Closure is signed off by the HOD, the Steering Committee and the Finance HOD only.
                AFFECTED_DEPARTMENT: false,
                HOD: true,
                STEERING_COMMITTEE: true,
                FINANCE: true, // the Finance HOD signs off every SGA, not only cost-saving ones
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
        const committeeMemberIds = await this.getSteeringCommitteeMemberIds(organizationId);
        const financeHodIds = await this.findFinanceDepartmentHODs(organizationId);

        await this.notifications.createMany(
            [...new Set([...hodIds, ...committeeMemberIds, ...financeHodIds])]
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
        if (!existingStage || existingStage.decision === 'NOT_APPLICABLE' || dto.stage === 'AFFECTED_DEPARTMENT') {
            throw new BadRequestException('This verification stage is not applicable to this SGA');
        }

        const isMainDeptHod = roles.includes(Role.HOD) && verifier.departmentId === sga.mainDepartmentId;

        if (dto.stage === 'HOD') {
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

        const { updated, implementedSuggestion } = await this.prisma.$transaction(async (tx) => {
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
            // AFFECTED_DEPARTMENT is no longer part of closure; ignore it on SGAs submitted before that change.
            const applicable = stages.filter(
                (s) => s.stage !== 'AFFECTED_DEPARTMENT' && (s.decision !== 'NOT_APPLICABLE' || s.stage === dto.stage),
            );
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
            let implementedSuggestion: Awaited<ReturnType<SgaService['closeLinkedSuggestion']>> = null;
            if (newStatus !== sga.status) {
                result = await tx.sga.update({
                    where: { id: sgaId },
                    data: { status: newStatus },
                    include: sgaInclude,
                });
                await this.recordReview(sgaId, verifier.id, newStatus, dto.remarks);
                if (newStatus === 'VERIFIED_CLOSED') {
                    implementedSuggestion = await this.closeLinkedSuggestion(tx, sgaId, verifier.id);
                }
            } else {
                result = await tx.sga.findFirstOrThrow({ where: { id: sgaId }, include: sgaInclude });
            }
            return { updated: result, implementedSuggestion };
        });

        const closed = updated.status === 'VERIFIED_CLOSED';
        if (closed) {
            await this.syncDwmsTasks(sgaId, async (bridge) => {
                await bridge.closeFromSource({ sourceModule: TaskSourceModule.SGA, sourceParentId: sgaId });
                await bridge.deactivateFromSource({ sourceModule: TaskSourceModule.SGA_MEETING, sourceId: sgaId });
            });
        }

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

        if (implementedSuggestion) {
            await this.notifications.create({
                employeeId: implementedSuggestion.employeeId,
                type: 'INFO',
                module: 'SIMS',
                title: 'Your suggestion has been implemented',
                message: `Suggestion "${implementedSuggestion.title}" was implemented through SGA "${updated.title}", which has now been verified and closed.`,
                actionUrl: `/sims/${implementedSuggestion.id}`,
                metadata: { suggestionId: implementedSuggestion.id, sgaId },
            });
        }

        return updated;
    }

    // Join 2: once an SGA reaches VERIFIED_CLOSED, move the suggestion it was raised from (if any)
    // to IMPLEMENTED (implementationStatus stays SHIFTED_TO_SGA) and record it in the suggestion's
    // review trail. Updates Prisma directly because SgaModule can't import SimsModule (SimsModule
    // already imports SgaModule). Returns the suggestion so the caller can notify its submitter.
    private async closeLinkedSuggestion(
        tx: Prisma.TransactionClient,
        sgaId: string,
        verifierId: string,
    ) {
        const suggestion = await tx.suggestion.findUnique({
            where: { linkedSgaId: sgaId },
            select: { id: true, title: true, status: true, employeeId: true },
        });
        if (!suggestion || suggestion.status !== 'SELECTED_FOR_SGA') return null;

        await tx.suggestion.update({
            where: { id: suggestion.id },
            data: { status: 'IMPLEMENTED' },
        });
        await tx.suggestionReview.create({
            data: {
                suggestionId: suggestion.id,
                reviewerId: verifierId,
                statusChanged: 'IMPLEMENTED',
                note: 'Implemented through SGA (verified and closed)',
            },
        });
        return suggestion;
    }
}
