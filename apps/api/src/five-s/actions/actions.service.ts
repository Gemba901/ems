import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { FiveSActionEventType, FiveSActionSource, FiveSActionStatus, Prisma } from 'db';
import type { AccessTokenPayload } from 'src/auth/access-token-payload';
import { PrismaService } from 'src/prisma/prisma.service';
import { addDays, toDbDate } from 'src/work/work-date';
import {
    ActionListQueryDto,
    CorrectiveActionInputDto,
    CreateActionDto,
    SubmitActionDto,
    UpdateActionDto,
    UpdateCorrectiveActionDto,
    VerifyActionDto,
} from '../dto/five-s.dto';
import { FiveSAccessService, FiveSActor } from '../five-s-access.service';
import { PERSON_SELECT, dateOnly, nextReference, person } from '../five-s-records';
import { overdueActionWhere } from '../five-s-summary';
import { PRACTICE_LABELS } from '../five-s-template';

// Improvement actions. Closing or verifying an action never changes the audit it came from:
// audit results are a snapshot written at submission.
//
// Each action is a plan made of corrective actions (steps). Steps have their own owner and due
// date and are ticked done one by one; the plan owner can only request verification once every
// step is done. Steps can only change while the plan is open.

const CORRECTIVE_ACTION_SELECT = {
    id: true,
    sortOrder: true,
    description: true,
    ownerId: true,
    dueDate: true,
    completedAt: true,
    owner: { select: PERSON_SELECT },
    completedBy: { select: PERSON_SELECT },
} satisfies Prisma.FiveSCorrectiveActionSelect;

const ACTION_SELECT = {
    id: true,
    reference: true,
    areaId: true,
    source: true,
    auditId: true,
    checkpointNo: true,
    practice: true,
    locationCount: true,
    checkpointText: true,
    finding: true,
    ownerId: true,
    dueDate: true,
    status: true,
    completionDescription: true,
    completionEvidenceUrls: true,
    submittedAt: true,
    verifiedAt: true,
    verificationRemarks: true,
    createdAt: true,
    updatedAt: true,
    area: { select: { id: true, name: true, departmentId: true, ownerId: true } },
    audit: { select: { id: true, reference: true, auditDate: true } },
    owner: { select: PERSON_SELECT },
    verifiedBy: { select: PERSON_SELECT },
    createdBy: { select: PERSON_SELECT },
    correctiveActions: { orderBy: { sortOrder: 'asc' }, select: CORRECTIVE_ACTION_SELECT },
} satisfies Prisma.FiveSActionSelect;

type ActionRow = Prisma.FiveSActionGetPayload<{ select: typeof ACTION_SELECT }>;

const describeDate = (value: string | null) => value ?? 'not set';

@Injectable()
export class ActionsService {
    constructor(private prisma: PrismaService, private access: FiveSAccessService) {}

    async list(user: AccessTokenPayload, query: ActionListQueryDto) {
        const actor = await this.access.resolveActor(user);
        const today = this.access.today(actor);
        const viewWhere: Prisma.FiveSActionWhereInput =
            query.view === 'overdue'
                ? overdueActionWhere(today)
                : query.view === 'no_due_date'
                  ? { status: { not: FiveSActionStatus.VERIFIED }, dueDate: null }
                  : query.view === 'mine'
                    ? {
                          status: { not: FiveSActionStatus.VERIFIED },
                          OR: [{ ownerId: actor.employeeId }, { correctiveActions: { some: { ownerId: actor.employeeId, completedAt: null } } }],
                      }
                    : query.view === 'to_verify'
                      ? { status: FiveSActionStatus.AWAITING_VERIFICATION, NOT: { ownerId: actor.employeeId } }
                      : {};

        const rows = await this.prisma.fiveSAction.findMany({
            where: {
                AND: [
                    { organizationId: actor.organizationId, area: this.access.visibleAreaWhere(actor) },
                    viewWhere,
                    query.areaId ? { areaId: query.areaId } : {},
                    query.departmentId ? { area: { departmentId: query.departmentId } } : {},
                    query.ownerId ? { ownerId: query.ownerId } : {},
                    query.status ? { status: query.status } : {},
                    query.auditId ? { auditId: query.auditId } : {},
                    query.practice ? { practice: query.practice } : {},
                    query.from ? { createdAt: { gte: toDbDate(query.from) } } : {},
                    query.to ? { createdAt: { lt: toDbDate(addDays(query.to, 1)) } } : {},
                ],
            },
            orderBy: [{ status: 'asc' }, { dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
            take: 300,
            select: ACTION_SELECT,
        });

        let result = rows.map((r) => this.toView(actor, r, today));
        // "To verify" only lists actions this person may actually verify.
        if (query.view === 'to_verify') result = result.filter((a) => a.permissions.canVerify);
        return result;
    }

    async get(user: AccessTokenPayload, actionId: string) {
        const actor = await this.access.resolveActor(user);
        const action = await this.actionOrThrow(actor, actionId);
        const events = await this.prisma.fiveSActionEvent.findMany({
            where: { actionId },
            orderBy: { createdAt: 'asc' },
            select: { id: true, type: true, note: true, fromValue: true, toValue: true, createdAt: true, actor: { select: PERSON_SELECT } },
        });
        return {
            ...this.toView(actor, action, this.access.today(actor)),
            history: events.map((e) => ({ ...e, actor: person(e.actor) })),
        };
    }

    async create(user: AccessTokenPayload, dto: CreateActionDto) {
        const actor = await this.access.resolveActor(user);
        const area = await this.access.areaOrThrow(actor, dto.areaId);
        if (!this.access.canCoordinateArea(actor, area) && !this.access.canAudit(actor, area)) {
            throw new ForbiddenException('You cannot raise actions for this area');
        }
        const steps = dto.correctiveActions ?? [];
        await this.access.assertCompanyEmployees(actor.organizationId, [dto.ownerId, ...steps.map((c) => c.ownerId)]);
        const planOwnerId = dto.ownerId ?? area.ownerId ?? null;

        return this.prisma.$transaction(async (tx) => {
            const reference = await nextReference(tx, actor.organizationId, 'ACTION');
            const action = await tx.fiveSAction.create({
                data: {
                    organizationId: actor.organizationId,
                    reference,
                    areaId: area.id,
                    source: FiveSActionSource.MANUAL,
                    practice: dto.practice,
                    finding: dto.finding,
                    ownerId: planOwnerId,
                    dueDate: dto.dueDate ? toDbDate(dto.dueDate) : null,
                    createdById: actor.employeeId,
                },
                select: { id: true, reference: true, ownerId: true },
            });
            if (steps.length) {
                await tx.fiveSCorrectiveAction.createMany({
                    data: steps.map((c, i) => ({
                        actionId: action.id,
                        sortOrder: i + 1,
                        description: c.description,
                        // A step without its own owner belongs to the plan owner.
                        ownerId: c.ownerId ?? planOwnerId,
                        dueDate: c.dueDate ? toDbDate(c.dueDate) : null,
                        createdById: actor.employeeId,
                    })),
                });
            }
            await tx.fiveSActionEvent.create({
                data: { actionId: action.id, actorId: actor.employeeId, type: FiveSActionEventType.CREATED, note: `Raised manually (${PRACTICE_LABELS[dto.practice]})` },
            });
            return { id: action.id, reference: action.reference };
        });
    }

    // Plan the action: owner, due date and finding. Each change is recorded in history.
    // Corrective actions have their own endpoints below.
    async update(user: AccessTokenPayload, actionId: string, dto: UpdateActionDto) {
        const actor = await this.access.resolveActor(user);
        const action = await this.actionOrThrow(actor, actionId);
        const coordinator = this.access.canCoordinateArea(actor, action.area);
        const isOwner = action.ownerId === actor.employeeId;
        if (!coordinator && !isOwner) throw new ForbiddenException('You cannot change this action');
        if (action.status === FiveSActionStatus.VERIFIED) throw new ConflictException('Verified actions are closed');
        if (!coordinator && (dto.ownerId !== undefined || dto.dueDate !== undefined)) {
            throw new ForbiddenException('Only the area owner, HOD or a verifier can reassign an action or change its due date');
        }
        await this.access.assertCompanyEmployees(actor.organizationId, [dto.ownerId]);

        const data: Prisma.FiveSActionUncheckedUpdateInput = {};
        const events: Prisma.FiveSActionEventCreateManyInput[] = [];
        const event = (type: FiveSActionEventType, fromValue: string | null, toValue: string | null, note?: string) =>
            events.push({ actionId, actorId: actor.employeeId, type, fromValue, toValue, note: note ?? dto.note ?? null });

        if (dto.ownerId !== undefined && dto.ownerId !== action.ownerId) {
            data.ownerId = dto.ownerId;
            const newOwner = dto.ownerId
                ? await this.prisma.employee.findUnique({ where: { id: dto.ownerId }, select: PERSON_SELECT })
                : null;
            event(FiveSActionEventType.ASSIGNED, person(action.owner)?.name ?? 'Unassigned', person(newOwner)?.name ?? 'Unassigned');
        }
        const currentDue = dateOnly(action.dueDate);
        if (dto.dueDate !== undefined && dto.dueDate !== currentDue) {
            data.dueDate = dto.dueDate ? toDbDate(dto.dueDate) : null;
            event(FiveSActionEventType.DUE_DATE_CHANGED, describeDate(currentDue), describeDate(dto.dueDate));
        }
        const textChanges: string[] = [];
        if (dto.finding !== undefined && dto.finding !== action.finding) {
            data.finding = dto.finding;
            textChanges.push('finding');
        }
        if (textChanges.length) event(FiveSActionEventType.UPDATED, null, null, dto.note || `Updated ${textChanges.join(', ')}`);
        if (events.length === 0) return this.get(user, actionId);

        await this.prisma.$transaction(async (tx) => {
            const updated = await tx.fiveSAction.updateMany({ where: { id: actionId, status: { not: FiveSActionStatus.VERIFIED } }, data });
            if (updated.count === 0) throw new ConflictException('Verified actions are closed');
            await tx.fiveSActionEvent.createMany({ data: events });
        });
        return this.get(user, actionId);
    }

    // The owner records the completed work and asks for verification.
    async submit(user: AccessTokenPayload, actionId: string, dto: SubmitActionDto) {
        const actor = await this.access.resolveActor(user);
        const action = await this.actionOrThrow(actor, actionId);
        if (action.ownerId !== actor.employeeId) {
            throw new ForbiddenException(action.ownerId ? 'Only the action owner can request verification' : 'Assign an owner before requesting verification');
        }
        if (action.status !== FiveSActionStatus.OPEN) throw new ConflictException('Only open actions can be sent for verification');
        if (action.correctiveActions.length === 0) {
            throw new BadRequestException({ message: 'Add at least one corrective action before requesting verification', code: 'FIVE_S_NO_CORRECTIVE_ACTIONS' });
        }
        const pending = action.correctiveActions.filter((c) => !c.completedAt);
        if (pending.length) {
            throw new BadRequestException({
                message: `Finish every corrective action first (${pending.length} of ${action.correctiveActions.length} not done)`,
                code: 'FIVE_S_CORRECTIVE_ACTIONS_PENDING',
            });
        }

        await this.prisma.$transaction(async (tx) => {
            const updated = await tx.fiveSAction.updateMany({
                where: { id: actionId, status: FiveSActionStatus.OPEN },
                data: {
                    status: FiveSActionStatus.AWAITING_VERIFICATION,
                    completionDescription: dto.completionDescription,
                    completionEvidenceUrls: dto.completionEvidenceUrls ?? [],
                    submittedAt: new Date(),
                },
            });
            if (updated.count === 0) throw new ConflictException('This action has already been sent for verification');
            await tx.fiveSActionEvent.create({
                data: {
                    actionId, actorId: actor.employeeId, type: FiveSActionEventType.SUBMITTED_FOR_VERIFICATION,
                    fromValue: FiveSActionStatus.OPEN, toValue: FiveSActionStatus.AWAITING_VERIFICATION, note: dto.completionDescription,
                },
            });
        });
        return this.get(user, actionId);
    }

    // A verifier (never the owner) confirms the fix or returns it for rework with a reason.
    async verify(user: AccessTokenPayload, actionId: string, dto: VerifyActionDto) {
        const actor = await this.access.resolveActor(user);
        const action = await this.actionOrThrow(actor, actionId);
        if (action.ownerId === actor.employeeId) throw new ForbiddenException('You cannot verify an action you own');
        if (!this.access.canVerifyAction(actor, action.area, action.ownerId)) throw new ForbiddenException('You cannot verify actions in this area');
        if (action.status !== FiveSActionStatus.AWAITING_VERIFICATION) throw new ConflictException('This action is not awaiting verification');
        if (dto.outcome === 'REWORK' && !dto.remarks) throw new BadRequestException('Give a reason so the owner knows what to rework');

        const verified = dto.outcome === 'VERIFIED';
        await this.prisma.$transaction(async (tx) => {
            const updated = await tx.fiveSAction.updateMany({
                where: { id: actionId, status: FiveSActionStatus.AWAITING_VERIFICATION },
                data: verified
                    ? { status: FiveSActionStatus.VERIFIED, verifiedById: actor.employeeId, verifiedAt: new Date(), verificationRemarks: dto.remarks || null }
                    : { status: FiveSActionStatus.OPEN, verificationRemarks: dto.remarks, verifiedById: null, verifiedAt: null },
            });
            if (updated.count === 0) throw new ConflictException('This action is no longer awaiting verification');
            await tx.fiveSActionEvent.create({
                data: {
                    actionId, actorId: actor.employeeId,
                    type: verified ? FiveSActionEventType.VERIFIED : FiveSActionEventType.RETURNED_FOR_REWORK,
                    fromValue: FiveSActionStatus.AWAITING_VERIFICATION,
                    toValue: verified ? FiveSActionStatus.VERIFIED : FiveSActionStatus.OPEN,
                    note: dto.remarks || null,
                },
            });
        });
        return this.get(user, actionId);
    }

    // ---------- corrective actions ----------

    // The area coordinators and the plan owner manage the steps of an open plan.
    async addCorrectiveAction(user: AccessTokenPayload, actionId: string, dto: CorrectiveActionInputDto) {
        const actor = await this.access.resolveActor(user);
        const action = await this.actionOrThrow(actor, actionId);
        this.assertCanManageSteps(actor, action);
        await this.access.assertCompanyEmployees(actor.organizationId, [dto.ownerId]);

        await this.prisma.$transaction(async (tx) => {
            const last = await tx.fiveSCorrectiveAction.aggregate({ where: { actionId }, _max: { sortOrder: true } });
            await tx.fiveSCorrectiveAction.create({
                data: {
                    actionId,
                    sortOrder: (last._max.sortOrder ?? 0) + 1,
                    description: dto.description,
                    ownerId: dto.ownerId === undefined ? action.ownerId : dto.ownerId,
                    dueDate: dto.dueDate ? toDbDate(dto.dueDate) : null,
                    createdById: actor.employeeId,
                },
            });
            await tx.fiveSActionEvent.create({
                data: { actionId, actorId: actor.employeeId, type: FiveSActionEventType.UPDATED, note: `Added corrective action: ${dto.description}` },
            });
        });
        return this.get(user, actionId);
    }

    // Editing a step needs plan rights; ticking it done is also open to the step's own owner.
    async updateCorrectiveAction(user: AccessTokenPayload, actionId: string, stepId: string, dto: UpdateCorrectiveActionDto) {
        const actor = await this.access.resolveActor(user);
        const action = await this.actionOrThrow(actor, actionId);
        const step = action.correctiveActions.find((c) => c.id === stepId);
        if (!step) throw new NotFoundException('Corrective action not found');
        if (action.status !== FiveSActionStatus.OPEN) throw new ConflictException('Corrective actions can only change while the action is open');
        const editsDetails = dto.description !== undefined || dto.ownerId !== undefined || dto.dueDate !== undefined;
        if (editsDetails) this.assertCanManageSteps(actor, action);
        if (dto.done !== undefined && !this.canManageSteps(actor, action) && step.ownerId !== actor.employeeId) {
            throw new ForbiddenException('Only the step owner, the action owner or the area coordinators can tick this step');
        }
        await this.access.assertCompanyEmployees(actor.organizationId, [dto.ownerId]);

        const data: Prisma.FiveSCorrectiveActionUncheckedUpdateInput = {};
        const notes: string[] = [];
        if (dto.description !== undefined && dto.description !== step.description) {
            data.description = dto.description;
            notes.push(`Corrective action reworded: ${dto.description}`);
        }
        if (dto.ownerId !== undefined && dto.ownerId !== step.ownerId) {
            data.ownerId = dto.ownerId;
            const newOwner = dto.ownerId ? await this.prisma.employee.findUnique({ where: { id: dto.ownerId }, select: PERSON_SELECT }) : null;
            notes.push(`"${step.description}" assigned to ${person(newOwner)?.name ?? 'nobody'}`);
        }
        const currentDue = dateOnly(step.dueDate);
        if (dto.dueDate !== undefined && dto.dueDate !== currentDue) {
            data.dueDate = dto.dueDate ? toDbDate(dto.dueDate) : null;
            notes.push(`"${step.description}" due date ${describeDate(currentDue)} → ${describeDate(dto.dueDate)}`);
        }
        if (dto.done !== undefined && dto.done !== !!step.completedAt) {
            data.completedAt = dto.done ? new Date() : null;
            data.completedById = dto.done ? actor.employeeId : null;
            notes.push(`${dto.done ? 'Completed' : 'Reopened'} corrective action: ${step.description}`);
        }
        if (notes.length === 0) return this.get(user, actionId);

        await this.prisma.$transaction(async (tx) => {
            await tx.fiveSCorrectiveAction.update({ where: { id: stepId }, data });
            await tx.fiveSActionEvent.createMany({
                data: notes.map((note) => ({ actionId, actorId: actor.employeeId, type: FiveSActionEventType.UPDATED, note })),
            });
        });
        return this.get(user, actionId);
    }

    async removeCorrectiveAction(user: AccessTokenPayload, actionId: string, stepId: string) {
        const actor = await this.access.resolveActor(user);
        const action = await this.actionOrThrow(actor, actionId);
        const step = action.correctiveActions.find((c) => c.id === stepId);
        if (!step) throw new NotFoundException('Corrective action not found');
        this.assertCanManageSteps(actor, action);

        await this.prisma.$transaction(async (tx) => {
            await tx.fiveSCorrectiveAction.delete({ where: { id: stepId } });
            await tx.fiveSActionEvent.create({
                data: { actionId, actorId: actor.employeeId, type: FiveSActionEventType.UPDATED, note: `Removed corrective action: ${step.description}` },
            });
        });
        return this.get(user, actionId);
    }

    // ---------- helpers ----------

    private canManageSteps(actor: FiveSActor, action: ActionRow): boolean {
        return action.status === FiveSActionStatus.OPEN && (this.access.canCoordinateArea(actor, action.area) || action.ownerId === actor.employeeId);
    }

    private assertCanManageSteps(actor: FiveSActor, action: ActionRow) {
        if (action.status !== FiveSActionStatus.OPEN) throw new ConflictException('Corrective actions can only change while the action is open');
        if (!this.canManageSteps(actor, action)) throw new ForbiddenException('Only the action owner or the area coordinators can change corrective actions');
    }

    private async actionOrThrow(actor: FiveSActor, actionId: string): Promise<ActionRow> {
        const action = await this.prisma.fiveSAction.findFirst({
            where: { id: actionId, organizationId: actor.organizationId, area: this.access.visibleAreaWhere(actor) },
            select: ACTION_SELECT,
        });
        if (!action) throw new NotFoundException('Action not found');
        return action;
    }

    private toView(actor: FiveSActor, a: ActionRow, today: string) {
        const dueDate = dateOnly(a.dueDate);
        const coordinator = this.access.canCoordinateArea(actor, a.area);
        const isOwner = a.ownerId === actor.employeeId;
        const canManageSteps = this.canManageSteps(actor, a);
        const steps = a.correctiveActions.map((c) => {
            const stepDue = dateOnly(c.dueDate);
            return {
                id: c.id,
                description: c.description,
                owner: person(c.owner),
                dueDate: stepDue,
                isOverdue: !c.completedAt && a.status === FiveSActionStatus.OPEN && !!stepDue && stepDue < today,
                completedAt: c.completedAt,
                completedBy: person(c.completedBy),
                canComplete: a.status === FiveSActionStatus.OPEN && (canManageSteps || c.ownerId === actor.employeeId),
            };
        });
        const stepsDone = steps.filter((c) => c.completedAt).length;
        return {
            id: a.id,
            reference: a.reference,
            source: a.source,
            area: { id: a.area.id, name: a.area.name },
            audit: a.audit ? { id: a.audit.id, reference: a.audit.reference, auditDate: dateOnly(a.audit.auditDate) } : null,
            checkpointNo: a.checkpointNo,
            checkpointText: a.checkpointText,
            practice: a.practice,
            practiceLabel: PRACTICE_LABELS[a.practice],
            locationCount: a.locationCount,
            finding: a.finding,
            correctiveActions: steps,
            correctiveActionProgress: { done: stepsDone, total: steps.length },
            owner: person(a.owner),
            dueDate,
            // No due date means never overdue.
            isOverdue: a.status === FiveSActionStatus.OPEN && !!dueDate && dueDate < today,
            status: a.status,
            completionDescription: a.completionDescription,
            completionEvidenceUrls: a.completionEvidenceUrls,
            submittedAt: a.submittedAt,
            verifiedBy: person(a.verifiedBy),
            verifiedAt: a.verifiedAt,
            verificationRemarks: a.verificationRemarks,
            createdBy: person(a.createdBy),
            createdAt: a.createdAt,
            updatedAt: a.updatedAt,
            permissions: {
                canPlan: a.status !== FiveSActionStatus.VERIFIED && coordinator,
                canEditText: a.status !== FiveSActionStatus.VERIFIED && (coordinator || isOwner),
                canSubmit: a.status === FiveSActionStatus.OPEN && isOwner,
                // Sending for verification also needs every step done; the UI explains what is missing.
                allStepsDone: steps.length > 0 && stepsDone === steps.length,
                canManageSteps,
                canVerify: a.status === FiveSActionStatus.AWAITING_VERIFICATION && this.access.canVerifyAction(actor, a.area, a.ownerId),
            },
        };
    }
}
