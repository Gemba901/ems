import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { FiveSActionEventType, FiveSActionSource, FiveSActionStatus, Prisma } from 'db';
import type { AccessTokenPayload } from 'src/auth/access-token-payload';
import { PrismaService } from 'src/prisma/prisma.service';
import { addDays, toDbDate } from 'src/work/work-date';
import { ActionListQueryDto, CreateActionDto, SubmitActionDto, UpdateActionDto, VerifyActionDto } from '../dto/five-s.dto';
import { FiveSAccessService, FiveSActor } from '../five-s-access.service';
import { PERSON_SELECT, dateOnly, nextReference, person } from '../five-s-records';
import { overdueActionWhere } from '../five-s-summary';
import { PRACTICE_LABELS } from '../five-s-template';

// Improvement actions. Closing or verifying an action never changes the audit it came from:
// audit results are a snapshot written at submission.

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
    affectedLocations: true,
    correctiveAction: true,
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
                    ? { ownerId: actor.employeeId, status: { not: FiveSActionStatus.VERIFIED } }
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
        await this.access.assertCompanyEmployees(actor.organizationId, [dto.ownerId]);

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
                    affectedLocations: dto.affectedLocations || null,
                    correctiveAction: dto.correctiveAction || null,
                    ownerId: dto.ownerId ?? area.ownerId ?? null,
                    dueDate: dto.dueDate ? toDbDate(dto.dueDate) : null,
                    createdById: actor.employeeId,
                },
                select: { id: true, reference: true, ownerId: true },
            });
            await tx.fiveSActionEvent.create({
                data: { actionId: action.id, actorId: actor.employeeId, type: FiveSActionEventType.CREATED, note: `Raised manually (${PRACTICE_LABELS[dto.practice]})` },
            });
            return { id: action.id, reference: action.reference };
        });
    }

    // Plan the action: owner, due date, finding, corrective action. Each change is recorded in history.
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
        if (dto.affectedLocations !== undefined && (dto.affectedLocations || null) !== action.affectedLocations) {
            data.affectedLocations = dto.affectedLocations || null;
            textChanges.push('locations');
        }
        if (dto.correctiveAction !== undefined && (dto.correctiveAction || null) !== action.correctiveAction) {
            data.correctiveAction = dto.correctiveAction || null;
            textChanges.push('corrective action');
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

    // ---------- helpers ----------

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
            affectedLocations: a.affectedLocations,
            correctiveAction: a.correctiveAction,
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
                canVerify: a.status === FiveSActionStatus.AWAITING_VERIFICATION && this.access.canVerifyAction(actor, a.area, a.ownerId),
            },
        };
    }
}
