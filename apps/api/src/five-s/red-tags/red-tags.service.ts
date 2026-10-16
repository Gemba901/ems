import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { FiveSRedTagDecision, FiveSRedTagStatus, Prisma } from 'db';
import type { AccessTokenPayload } from 'src/auth/access-token-payload';
import { PrismaService } from 'src/prisma/prisma.service';
import { toDbDate } from 'src/work/work-date';
import { CreateRedTagDto, RedTagDecisionDto, RedTagListQueryDto, ResolveRedTagDto, UpdateRedTagDto } from '../dto/five-s.dto';
import { FiveSAccessService, FiveSActor } from '../five-s-access.service';
import { PERSON_SELECT, dateOnly, logChange, nextReference, person } from '../five-s-records';
import { PENDING_RED_TAG_STATUSES } from '../five-s-summary';

// Red-tag register. A tag stays pending until both a decision and the completed disposition
// are recorded. This register never deletes or changes asset or inventory records: disposals
// follow the company's approval process, which is referenced here.

export const RED_TAG_DECISION_LABELS: Record<FiveSRedTagDecision, string> = {
    RETAIN: 'Retain',
    RELOCATE: 'Relocate',
    REPAIR: 'Repair',
    RECYCLE: 'Recycle',
    DISPOSE: 'Dispose',
};

const RED_TAG_SELECT = {
    id: true,
    reference: true,
    itemName: true,
    location: true,
    quantity: true,
    reason: true,
    reasonDetails: true,
    raisedOn: true,
    reviewDueDate: true,
    photoUrls: true,
    status: true,
    decision: true,
    decisionNotes: true,
    approvalReference: true,
    decidedAt: true,
    resolutionDetails: true,
    resolvedOn: true,
    ownerId: true,
    raisedById: true,
    createdAt: true,
    updatedAt: true,
    area: { select: { id: true, name: true, departmentId: true, ownerId: true, isActive: true } },
    owner: { select: PERSON_SELECT },
    raisedBy: { select: PERSON_SELECT },
    decidedBy: { select: PERSON_SELECT },
    resolvedBy: { select: PERSON_SELECT },
} satisfies Prisma.FiveSRedTagSelect;

type RedTagRow = Prisma.FiveSRedTagGetPayload<{ select: typeof RED_TAG_SELECT }>;

@Injectable()
export class RedTagsService {
    constructor(private prisma: PrismaService, private access: FiveSAccessService) {}

    async list(user: AccessTokenPayload, query: RedTagListQueryDto) {
        const actor = await this.access.resolveActor(user);
        const today = this.access.today(actor);
        const rows = await this.prisma.fiveSRedTag.findMany({
            where: {
                AND: [
                    { organizationId: actor.organizationId, area: this.access.visibleAreaWhere(actor) },
                    query.view === 'pending' ? { status: { in: PENDING_RED_TAG_STATUSES } } : {},
                    query.view === 'review_overdue'
                        ? { status: FiveSRedTagStatus.PENDING, reviewDueDate: { not: null, lt: toDbDate(today) } }
                        : {},
                    query.status ? { status: query.status } : {},
                    query.areaId ? { areaId: query.areaId } : {},
                    query.departmentId ? { area: { departmentId: query.departmentId } } : {},
                    query.ownerId ? { ownerId: query.ownerId } : {},
                    query.from ? { raisedOn: { gte: toDbDate(query.from) } } : {},
                    query.to ? { raisedOn: { lte: toDbDate(query.to) } } : {},
                ],
            },
            orderBy: [{ status: 'asc' }, { raisedOn: 'desc' }, { createdAt: 'desc' }],
            take: 300,
            select: RED_TAG_SELECT,
        });
        return rows.map((r) => this.toView(actor, r, today));
    }

    async get(user: AccessTokenPayload, tagId: string) {
        const actor = await this.access.resolveActor(user);
        return this.toView(actor, await this.tagOrThrow(actor, tagId), this.access.today(actor));
    }

    // Anyone who can see an active area may raise a red tag in it.
    async create(user: AccessTokenPayload, dto: CreateRedTagDto) {
        const actor = await this.access.resolveActor(user);
        const area = await this.access.areaOrThrow(actor, dto.areaId);
        if (!area.isActive) throw new BadRequestException('This area is inactive');
        if (this.access.isViewOnly(actor, area)) throw new ForbiddenException('Management viewers cannot raise red tags');
        if (dto.raisedOn > this.access.today(actor)) throw new BadRequestException('The date raised cannot be in the future');
        if (dto.reviewDueDate && dto.reviewDueDate < dto.raisedOn) throw new BadRequestException('The review date cannot be before the date raised');
        await this.access.assertCompanyEmployees(actor.organizationId, [dto.ownerId]);

        return this.prisma.$transaction(async (tx) => {
            const reference = await nextReference(tx, actor.organizationId, 'RED_TAG');
            const tag = await tx.fiveSRedTag.create({
                data: {
                    organizationId: actor.organizationId,
                    reference,
                    areaId: area.id,
                    itemName: dto.itemName,
                    location: dto.location,
                    quantity: dto.quantity || null,
                    reason: dto.reason,
                    reasonDetails: dto.reasonDetails || null,
                    ownerId: dto.ownerId ?? area.ownerId ?? null,
                    raisedById: actor.employeeId,
                    raisedOn: toDbDate(dto.raisedOn),
                    reviewDueDate: dto.reviewDueDate ? toDbDate(dto.reviewDueDate) : null,
                    photoUrls: dto.photoUrls ?? [],
                },
                select: { id: true, reference: true },
            });
            await logChange(tx, {
                organizationId: actor.organizationId, actorId: actor.employeeId, entityType: 'RED_TAG', entityId: tag.id,
                action: 'RAISED', summary: `Raised red tag ${reference} for "${dto.itemName}" in "${area.name}"`,
            });
            return tag;
        });
    }

    async update(user: AccessTokenPayload, tagId: string, dto: UpdateRedTagDto) {
        const actor = await this.access.resolveActor(user);
        const tag = await this.tagOrThrow(actor, tagId);
        if (tag.status !== FiveSRedTagStatus.PENDING) throw new ConflictException('Tag details are locked once a decision is recorded');
        const coordinator = this.access.canCoordinateArea(actor, tag.area);
        if (!coordinator && tag.raisedById !== actor.employeeId) throw new ForbiddenException('You cannot edit this red tag');
        if (dto.ownerId !== undefined && !coordinator) throw new ForbiddenException('Only the area owner, HOD or a reviewer can change the tag owner');
        const raisedOn = dateOnly(tag.raisedOn)!;
        if (dto.reviewDueDate && dto.reviewDueDate < raisedOn) throw new BadRequestException('The review date cannot be before the date raised');
        await this.access.assertCompanyEmployees(actor.organizationId, [dto.ownerId]);

        await this.prisma.$transaction(async (tx) => {
            const updated = await tx.fiveSRedTag.updateMany({
                where: { id: tagId, status: FiveSRedTagStatus.PENDING },
                data: {
                    ...(dto.itemName !== undefined ? { itemName: dto.itemName } : {}),
                    ...(dto.location !== undefined ? { location: dto.location } : {}),
                    ...(dto.quantity !== undefined ? { quantity: dto.quantity || null } : {}),
                    ...(dto.reason !== undefined ? { reason: dto.reason } : {}),
                    ...(dto.reasonDetails !== undefined ? { reasonDetails: dto.reasonDetails || null } : {}),
                    ...(dto.ownerId !== undefined ? { ownerId: dto.ownerId } : {}),
                    ...(dto.reviewDueDate !== undefined ? { reviewDueDate: dto.reviewDueDate ? toDbDate(dto.reviewDueDate) : null } : {}),
                    ...(dto.photoUrls !== undefined ? { photoUrls: dto.photoUrls } : {}),
                },
            });
            if (updated.count === 0) throw new ConflictException('Tag details are locked once a decision is recorded');
            await logChange(tx, {
                organizationId: actor.organizationId, actorId: actor.employeeId, entityType: 'RED_TAG', entityId: tagId,
                action: 'UPDATED', summary: `Updated red tag ${tag.reference}`,
            });
        });
        return this.get(user, tagId);
    }

    // The reviewer decides what happens to the item. Disposal needs a company approval reference.
    async decide(user: AccessTokenPayload, tagId: string, dto: RedTagDecisionDto) {
        const actor = await this.access.resolveActor(user);
        const tag = await this.tagOrThrow(actor, tagId);
        if (!this.access.canCoordinateArea(actor, tag.area)) throw new ForbiddenException('Only the area owner, HOD or a 5S reviewer can decide on red tags');
        if (tag.status === FiveSRedTagStatus.RESOLVED) throw new ConflictException('This red tag is already resolved');
        if (dto.decision === FiveSRedTagDecision.DISPOSE && !dto.approvalReference) {
            throw new BadRequestException('Disposal needs the company approval reference (for example the asset write-off or disposal form number)');
        }

        await this.prisma.$transaction(async (tx) => {
            const updated = await tx.fiveSRedTag.updateMany({
                where: { id: tagId, status: { in: PENDING_RED_TAG_STATUSES } },
                data: {
                    status: FiveSRedTagStatus.DECIDED,
                    decision: dto.decision,
                    decisionNotes: dto.decisionNotes || null,
                    approvalReference: dto.approvalReference || null,
                    decidedById: actor.employeeId,
                    decidedAt: new Date(),
                },
            });
            if (updated.count === 0) throw new ConflictException('This red tag is already resolved');
            await logChange(tx, {
                organizationId: actor.organizationId, actorId: actor.employeeId, entityType: 'RED_TAG', entityId: tagId,
                action: tag.decision ? 'DECISION_CHANGED' : 'DECIDED',
                summary: `Decision for ${tag.reference}: ${RED_TAG_DECISION_LABELS[dto.decision]}${tag.decision ? ` (was ${RED_TAG_DECISION_LABELS[tag.decision]})` : ''}`,
            });
        });
        return this.get(user, tagId);
    }

    // Record that the decision has been carried out. Only then is the tag resolved.
    async resolve(user: AccessTokenPayload, tagId: string, dto: ResolveRedTagDto) {
        const actor = await this.access.resolveActor(user);
        const tag = await this.tagOrThrow(actor, tagId);
        if (!this.canResolve(actor, tag)) throw new ForbiddenException('Only the tag owner, area owner, HOD or a 5S reviewer can resolve this tag');
        if (tag.status === FiveSRedTagStatus.PENDING) throw new BadRequestException('Record a decision before resolving the tag');
        if (tag.status === FiveSRedTagStatus.RESOLVED) throw new ConflictException('This red tag is already resolved');
        if (dto.resolvedOn > this.access.today(actor)) throw new BadRequestException('The resolution date cannot be in the future');
        if (dto.resolvedOn < dateOnly(tag.raisedOn)!) throw new BadRequestException('The resolution date cannot be before the date raised');

        await this.prisma.$transaction(async (tx) => {
            const updated = await tx.fiveSRedTag.updateMany({
                where: { id: tagId, status: FiveSRedTagStatus.DECIDED },
                data: {
                    status: FiveSRedTagStatus.RESOLVED,
                    resolutionDetails: dto.resolutionDetails,
                    resolvedById: actor.employeeId,
                    resolvedOn: toDbDate(dto.resolvedOn),
                },
            });
            if (updated.count === 0) throw new ConflictException('This red tag is not ready to resolve');
            await logChange(tx, {
                organizationId: actor.organizationId, actorId: actor.employeeId, entityType: 'RED_TAG', entityId: tagId,
                action: 'RESOLVED', summary: `Resolved ${tag.reference} (${RED_TAG_DECISION_LABELS[tag.decision!]})`,
            });
        });
        return this.get(user, tagId);
    }

    // ---------- helpers ----------

    private canResolve(actor: FiveSActor, tag: RedTagRow): boolean {
        return tag.ownerId === actor.employeeId || this.access.canCoordinateArea(actor, tag.area);
    }

    private async tagOrThrow(actor: FiveSActor, tagId: string): Promise<RedTagRow> {
        const tag = await this.prisma.fiveSRedTag.findFirst({
            where: { id: tagId, organizationId: actor.organizationId, area: this.access.visibleAreaWhere(actor) },
            select: RED_TAG_SELECT,
        });
        if (!tag) throw new NotFoundException('Red tag not found');
        return tag;
    }

    private toView(actor: FiveSActor, t: RedTagRow, today: string) {
        const reviewDueDate = dateOnly(t.reviewDueDate);
        const coordinator = this.access.canCoordinateArea(actor, t.area);
        return {
            id: t.id,
            reference: t.reference,
            area: { id: t.area.id, name: t.area.name },
            itemName: t.itemName,
            location: t.location,
            quantity: t.quantity,
            reason: t.reason,
            reasonDetails: t.reasonDetails,
            owner: person(t.owner),
            raisedBy: person(t.raisedBy),
            raisedOn: dateOnly(t.raisedOn),
            reviewDueDate,
            reviewOverdue: t.status === FiveSRedTagStatus.PENDING && !!reviewDueDate && reviewDueDate < today,
            photoUrls: t.photoUrls,
            status: t.status,
            // Pending until the decision has been carried out.
            isPending: t.status !== FiveSRedTagStatus.RESOLVED,
            decision: t.decision,
            decisionLabel: t.decision ? RED_TAG_DECISION_LABELS[t.decision] : null,
            decisionNotes: t.decisionNotes,
            approvalReference: t.approvalReference,
            decidedBy: person(t.decidedBy),
            decidedAt: t.decidedAt,
            resolutionDetails: t.resolutionDetails,
            resolvedBy: person(t.resolvedBy),
            resolvedOn: dateOnly(t.resolvedOn),
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
            permissions: {
                canEdit: t.status === FiveSRedTagStatus.PENDING && (coordinator || t.raisedById === actor.employeeId),
                canDecide: t.status !== FiveSRedTagStatus.RESOLVED && coordinator,
                canResolve: t.status === FiveSRedTagStatus.DECIDED && this.canResolve(actor, t),
            },
        };
    }
}
