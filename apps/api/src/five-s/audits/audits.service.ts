import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { FiveSActionEventType, FiveSActionSource, FiveSAuditStatus, Prisma } from 'db';
import type { AccessTokenPayload } from 'src/auth/access-token-payload';
import { PrismaService } from 'src/prisma/prisma.service';
import { toDbDate } from 'src/work/work-date';
import { AuditListQueryDto, CreateAuditDto, SaveAuditResponsesDto, UpdateAuditDto } from '../dto/five-s.dto';
import { FiveSAccessService, FiveSActor } from '../five-s-access.service';
import { PERSON_SELECT, dateOnly, level, logChange, nextReference, person } from '../five-s-records';
import { emptyPracticePoints, scoreAudit, unansweredCheckpoints } from '../five-s-scoring';
import { CURRENT_TEMPLATE, PRACTICE_LABELS, PRACTICE_ORDER, TEMPLATE_LABELS, checkpointsFor } from '../five-s-template';

const AUDIT_DETAIL_SELECT = {
    id: true,
    reference: true,
    areaId: true,
    template: true,
    status: true,
    auditDate: true,
    auditeeName: true,
    remarks: true,
    photoUrls: true,
    sortPoints: true,
    setInOrderPoints: true,
    shinePoints: true,
    standardizePoints: true,
    sustainPoints: true,
    totalPoints: true,
    levelTenths: true,
    targetLevelTenths: true,
    submittedAt: true,
    createdById: true,
    createdAt: true,
    updatedAt: true,
    area: { select: { id: true, name: true, departmentId: true, ownerId: true, isActive: true, targetLevelTenths: true } },
    auditor: { select: PERSON_SELECT },
    auditee: { select: PERSON_SELECT },
    submittedBy: { select: PERSON_SELECT },
    responses: { select: { checkpointNo: true, locationCount: true, affectedLocations: true, remark: true, photoUrls: true, updatedAt: true } },
    actions: {
        select: { id: true, reference: true, checkpointNo: true, status: true, dueDate: true, owner: { select: PERSON_SELECT } },
        orderBy: { checkpointNo: 'asc' },
    },
} satisfies Prisma.FiveSAuditSelect;

type AuditDetailRow = Prisma.FiveSAuditGetPayload<{ select: typeof AUDIT_DETAIL_SELECT }>;

@Injectable()
export class AuditsService {
    constructor(private prisma: PrismaService, private access: FiveSAccessService) {}

    async list(user: AccessTokenPayload, query: AuditListQueryDto) {
        const actor = await this.access.resolveActor(user);
        const where: Prisma.FiveSAuditWhereInput = {
            organizationId: actor.organizationId,
            area: {
                AND: [
                    this.access.visibleAreaWhere(actor),
                    query.departmentId ? { departmentId: query.departmentId } : {},
                    query.ownerId ? { ownerId: query.ownerId } : {},
                ],
            },
            ...(query.areaId ? { areaId: query.areaId } : {}),
            ...(query.status ? { status: query.status } : {}),
            ...(query.auditorId ? { auditorId: query.auditorId } : {}),
            ...(query.from || query.to
                ? { auditDate: { ...(query.from ? { gte: toDbDate(query.from) } : {}), ...(query.to ? { lte: toDbDate(query.to) } : {}) } }
                : {}),
        };
        const rows = await this.prisma.fiveSAudit.findMany({
            where,
            orderBy: [{ auditDate: 'desc' }, { createdAt: 'desc' }],
            take: 200,
            select: {
                id: true, reference: true, status: true, template: true, auditDate: true, totalPoints: true, levelTenths: true,
                targetLevelTenths: true, submittedAt: true, updatedAt: true,
                sortPoints: true, setInOrderPoints: true, shinePoints: true, standardizePoints: true, sustainPoints: true,
                area: { select: { id: true, name: true, targetLevelTenths: true } },
                auditor: { select: PERSON_SELECT },
                _count: { select: { responses: { where: { locationCount: { not: null } } }, actions: true } },
            },
        });
        return rows.map((r) => {
            const submitted = r.status === FiveSAuditStatus.SUBMITTED;
            return {
                id: r.id,
                reference: r.reference,
                status: r.status,
                method: TEMPLATE_LABELS[r.template],
                auditDate: dateOnly(r.auditDate),
                area: { id: r.area.id, name: r.area.name },
                auditor: person(r.auditor),
                answered: r._count.responses,
                checkpointCount: checkpointsFor(r.template).length,
                actionCount: r._count.actions,
                updatedAt: r.updatedAt,
                submittedAt: r.submittedAt,
                // Drafts have no result yet.
                result: submitted
                    ? {
                          points: {
                              SORT: r.sortPoints ?? 0, SET_IN_ORDER: r.setInOrderPoints ?? 0, SHINE: r.shinePoints ?? 0,
                              STANDARDIZE: r.standardizePoints ?? 0, SUSTAIN: r.sustainPoints ?? 0,
                          },
                          totalPoints: r.totalPoints,
                          level: level(r.levelTenths),
                          targetLevel: level(r.targetLevelTenths),
                          targetMet: r.levelTenths != null && r.targetLevelTenths != null ? r.levelTenths >= r.targetLevelTenths : null,
                      }
                    : null,
            };
        });
    }

    async get(user: AccessTokenPayload, auditId: string) {
        const actor = await this.access.resolveActor(user);
        const audit = await this.auditOrThrow(actor, auditId);
        return this.toDetail(actor, audit);
    }

    async create(user: AccessTokenPayload, dto: CreateAuditDto) {
        const actor = await this.access.resolveActor(user);
        const area = await this.access.areaOrThrow(actor, dto.areaId);
        if (!area.isActive) throw new BadRequestException('This area is inactive: no current employee profile lists it as their work area');
        if (!this.access.canAudit(actor, area)) throw new ForbiddenException('You are not an auditor for this area');
        this.assertNotFuture(actor, dto.auditDate);

        const auditorId = dto.auditorId ?? actor.employeeId;
        if (auditorId !== actor.employeeId && !this.access.canManageArea(actor, area)) {
            throw new ForbiddenException('Only the area HOD or a 5S administrator can record an audit for someone else');
        }
        await this.access.assertCompanyEmployees(actor.organizationId, [auditorId, dto.auditeeId]);

        return this.prisma.$transaction(async (tx) => {
            const reference = await nextReference(tx, actor.organizationId, 'AUDIT');
            const audit = await tx.fiveSAudit.create({
                data: {
                    organizationId: actor.organizationId,
                    reference,
                    areaId: area.id,
                    template: CURRENT_TEMPLATE,
                    status: FiveSAuditStatus.DRAFT,
                    auditDate: toDbDate(dto.auditDate),
                    auditorId,
                    auditeeId: dto.auditeeId ?? null,
                    auditeeName: dto.auditeeName || null,
                    createdById: actor.employeeId,
                },
                select: { id: true, reference: true },
            });
            await logChange(tx, {
                organizationId: actor.organizationId, actorId: actor.employeeId, entityType: 'AUDIT', entityId: audit.id,
                action: 'DRAFT_CREATED', summary: `Started draft audit ${reference} for "${area.name}"`,
            });
            return audit;
        });
    }

    async update(user: AccessTokenPayload, auditId: string, dto: UpdateAuditDto) {
        const actor = await this.access.resolveActor(user);
        const audit = await this.editableDraftOrThrow(actor, auditId);
        if (dto.auditDate) this.assertNotFuture(actor, dto.auditDate);
        if (dto.auditorId && dto.auditorId !== actor.employeeId && !this.access.canManageArea(actor, audit.area)) {
            throw new ForbiddenException('Only the area HOD or a 5S administrator can change the auditor');
        }
        await this.access.assertCompanyEmployees(actor.organizationId, [dto.auditorId, dto.auditeeId]);

        const result = await this.prisma.fiveSAudit.updateMany({
            where: { id: auditId, status: FiveSAuditStatus.DRAFT },
            data: {
                ...(dto.auditDate !== undefined ? { auditDate: toDbDate(dto.auditDate) } : {}),
                ...(dto.auditorId !== undefined ? { auditorId: dto.auditorId } : {}),
                ...(dto.auditeeId !== undefined ? { auditeeId: dto.auditeeId } : {}),
                ...(dto.auditeeName !== undefined ? { auditeeName: dto.auditeeName || null } : {}),
                ...(dto.remarks !== undefined ? { remarks: dto.remarks || null } : {}),
                ...(dto.photoUrls !== undefined ? { photoUrls: dto.photoUrls } : {}),
            },
        });
        if (result.count === 0) throw new ConflictException('This audit has been submitted and is locked');
        return this.get(user, auditId);
    }

    // Autosave: upserts the given checkpoints only. A null count clears the selection.
    async saveResponses(user: AccessTokenPayload, auditId: string, dto: SaveAuditResponsesDto) {
        const actor = await this.access.resolveActor(user);
        const audit = await this.editableDraftOrThrow(actor, auditId);
        const valid = new Set(checkpointsFor(audit.template).map((c) => c.no));
        const seen = new Set<number>();
        for (const r of dto.responses) {
            if (!valid.has(r.checkpointNo)) throw new BadRequestException(`Checkpoint ${r.checkpointNo} is not on this checksheet`);
            if (seen.has(r.checkpointNo)) throw new BadRequestException(`Checkpoint ${r.checkpointNo} appears twice`);
            seen.add(r.checkpointNo);
        }

        await this.prisma.$transaction(async (tx) => {
            // Lock the draft row so a concurrent submit cannot interleave with this save.
            const locked = await tx.$queryRaw<{ status: string }[]>`
                SELECT "status"::text AS status FROM "FiveSAudit" WHERE "id" = ${auditId} FOR UPDATE`;
            if (locked[0]?.status !== FiveSAuditStatus.DRAFT) throw new ConflictException('This audit has been submitted and is locked');

            for (const r of dto.responses) {
                const data = {
                    ...(r.locationCount !== undefined ? { locationCount: r.locationCount } : {}),
                    ...(r.affectedLocations !== undefined ? { affectedLocations: r.affectedLocations || null } : {}),
                    ...(r.remark !== undefined ? { remark: r.remark || null } : {}),
                    ...(r.photoUrls !== undefined ? { photoUrls: r.photoUrls } : {}),
                };
                await tx.fiveSAuditResponse.upsert({
                    where: { auditId_checkpointNo: { auditId, checkpointNo: r.checkpointNo } },
                    create: { auditId, checkpointNo: r.checkpointNo, ...data },
                    update: data,
                });
            }
            await tx.fiveSAudit.update({ where: { id: auditId }, data: { updatedAt: new Date() } });
        });
        return this.get(user, auditId);
    }

    async submit(user: AccessTokenPayload, auditId: string) {
        const actor = await this.access.resolveActor(user);
        const audit = await this.editableDraftOrThrow(actor, auditId);
        if (!audit.area.isActive) throw new BadRequestException('This area is inactive: no current employee profile lists it as their work area');
        this.assertNotFuture(actor, dateOnly(audit.auditDate)!);

        const checkpoints = checkpointsFor(audit.template);

        await this.prisma.$transaction(async (tx) => {
            const locked = await tx.$queryRaw<{ status: string }[]>`
                SELECT "status"::text AS status FROM "FiveSAudit" WHERE "id" = ${auditId} FOR UPDATE`;
            if (locked[0]?.status !== FiveSAuditStatus.DRAFT) throw new ConflictException('This audit has already been submitted');

            const responses = await tx.fiveSAuditResponse.findMany({ where: { auditId } });
            const counts = new Map(responses.map((r) => [r.checkpointNo, r.locationCount]));
            const missing = unansweredCheckpoints(checkpoints, counts);
            if (missing.length > 0) {
                throw new BadRequestException({
                    message: `Every checkpoint needs a selection before you submit. Not answered: ${missing.join(', ')}`,
                    code: 'FIVE_S_CHECKPOINTS_UNANSWERED',
                    missing,
                });
            }

            const result = scoreAudit(checkpoints, counts);
            const area = await tx.fiveSArea.findUniqueOrThrow({ where: { id: audit.areaId }, select: { ownerId: true, targetLevelTenths: true, name: true } });
            await tx.fiveSAudit.update({
                where: { id: auditId },
                data: {
                    status: FiveSAuditStatus.SUBMITTED,
                    sortPoints: result.pointsByPractice.SORT,
                    setInOrderPoints: result.pointsByPractice.SET_IN_ORDER,
                    shinePoints: result.pointsByPractice.SHINE,
                    standardizePoints: result.pointsByPractice.STANDARDIZE,
                    sustainPoints: result.pointsByPractice.SUSTAIN,
                    totalPoints: result.totalPoints,
                    levelTenths: result.levelTenths,
                    targetLevelTenths: area.targetLevelTenths,
                    submittedAt: new Date(),
                    submittedById: actor.employeeId,
                },
            });

            // One improvement action per checkpoint with at least one problem location.
            const byNo = new Map(responses.map((r) => [r.checkpointNo, r]));
            let created = 0;
            for (const checkpoint of checkpoints) {
                const response = byNo.get(checkpoint.no)!;
                const count = response.locationCount!;
                if (count === 0) continue;
                const reference = await nextReference(tx, actor.organizationId, 'ACTION');
                const countLabel = count >= 5 ? '5 or more' : String(count);
                const action = await tx.fiveSAction.create({
                    data: {
                        organizationId: actor.organizationId,
                        reference,
                        areaId: audit.areaId,
                        source: FiveSActionSource.AUDIT,
                        auditId,
                        checkpointNo: checkpoint.no,
                        practice: checkpoint.practice,
                        locationCount: count,
                        checkpointText: checkpoint.text,
                        // Actions have no separate locations field; the audit's affected locations stay readable in the finding.
                        finding: [
                            response.remark ||
                                `${countLabel} problem location${count === 1 ? '' : 's'} found against checkpoint ${checkpoint.no} (${PRACTICE_LABELS[checkpoint.practice]}).`,
                            response.affectedLocations ? `Affected locations: ${response.affectedLocations}` : null,
                        ]
                            .filter(Boolean)
                            .join('\n'),
                        ownerId: area.ownerId,
                        dueDate: null,
                        createdById: actor.employeeId,
                    },
                    select: { id: true },
                });
                await tx.fiveSActionEvent.create({
                    data: {
                        actionId: action.id, actorId: actor.employeeId, type: FiveSActionEventType.CREATED,
                        note: `Raised from audit ${audit.reference}, checkpoint ${checkpoint.no}`,
                    },
                });
                created++;
            }

            await logChange(tx, {
                organizationId: actor.organizationId, actorId: actor.employeeId, entityType: 'AUDIT', entityId: auditId,
                action: 'SUBMITTED',
                summary: `Submitted audit ${audit.reference} for "${area.name}": ${result.totalPoints} points, level ${(result.levelTenths / 10).toFixed(1)}; ${created} action${created === 1 ? '' : 's'} raised`,
            });
        });

        return this.get(user, auditId);
    }

    async remove(user: AccessTokenPayload, auditId: string) {
        const actor = await this.access.resolveActor(user);
        const audit = await this.editableDraftOrThrow(actor, auditId);
        await this.prisma.$transaction(async (tx) => {
            const deleted = await tx.fiveSAudit.deleteMany({ where: { id: auditId, status: FiveSAuditStatus.DRAFT } });
            if (deleted.count === 0) throw new ConflictException('Submitted audits cannot be deleted');
            await logChange(tx, {
                organizationId: actor.organizationId, actorId: actor.employeeId, entityType: 'AUDIT', entityId: auditId,
                action: 'DRAFT_DELETED', summary: `Deleted draft audit ${audit.reference} for "${audit.area.name}"`,
            });
        });
        return { deleted: true };
    }

    // ---------- helpers ----------

    private async auditOrThrow(actor: FiveSActor, auditId: string): Promise<AuditDetailRow> {
        const audit = await this.prisma.fiveSAudit.findFirst({
            where: { id: auditId, organizationId: actor.organizationId, area: this.access.visibleAreaWhere(actor) },
            select: AUDIT_DETAIL_SELECT,
        });
        if (!audit) throw new NotFoundException('Audit not found');
        return audit;
    }

    private canEditDraft(actor: FiveSActor, audit: Pick<AuditDetailRow, 'auditor' | 'createdById' | 'area'>): boolean {
        return (
            audit.auditor.id === actor.employeeId ||
            audit.createdById === actor.employeeId ||
            this.access.canManageArea(actor, audit.area)
        );
    }

    private async editableDraftOrThrow(actor: FiveSActor, auditId: string) {
        const audit = await this.auditOrThrow(actor, auditId);
        if (audit.status !== FiveSAuditStatus.DRAFT) throw new ConflictException('This audit has been submitted and is locked');
        if (!this.canEditDraft(actor, audit)) throw new ForbiddenException('Only the auditor can change this draft');
        return audit;
    }

    private assertNotFuture(actor: FiveSActor, auditDate: string) {
        if (auditDate > this.access.today(actor)) throw new BadRequestException('The audit date cannot be in the future');
    }

    private toDetail(actor: FiveSActor, audit: AuditDetailRow) {
        const checkpoints = checkpointsFor(audit.template);
        const byNo = new Map(audit.responses.map((r) => [r.checkpointNo, r]));
        const actionByNo = new Map(audit.actions.map((a) => [a.checkpointNo, a]));
        const submitted = audit.status === FiveSAuditStatus.SUBMITTED;

        const items = checkpoints.map((c) => {
            const r = byNo.get(c.no);
            const action = actionByNo.get(c.no);
            return {
                no: c.no,
                practice: c.practice,
                text: c.text,
                locationCount: r?.locationCount ?? null,
                affectedLocations: r?.affectedLocations ?? null,
                remark: r?.remark ?? null,
                photoUrls: r?.photoUrls ?? [],
                action: action ? { id: action.id, reference: action.reference, status: action.status, dueDate: dateOnly(action.dueDate), owner: person(action.owner) } : null,
            };
        });

        // Running subtotals over answered checkpoints only; the level appears once all are answered.
        const points = emptyPracticePoints();
        for (const item of items) if (item.locationCount != null) points[item.practice] += item.locationCount;
        const answered = items.filter((i) => i.locationCount != null).length;

        let result: {
            points: Record<string, number>; totalPoints: number; deductionSteps: number; level: number;
            targetLevel: number | null; targetMet: boolean | null;
        } | null = null;
        if (submitted) {
            const total = audit.totalPoints ?? 0;
            result = {
                points: {
                    SORT: audit.sortPoints ?? 0, SET_IN_ORDER: audit.setInOrderPoints ?? 0, SHINE: audit.shinePoints ?? 0,
                    STANDARDIZE: audit.standardizePoints ?? 0, SUSTAIN: audit.sustainPoints ?? 0,
                },
                totalPoints: total,
                deductionSteps: Math.ceil(total / 4),
                level: level(audit.levelTenths)!,
                targetLevel: level(audit.targetLevelTenths),
                targetMet: audit.levelTenths != null && audit.targetLevelTenths != null ? audit.levelTenths >= audit.targetLevelTenths : null,
            };
        }

        return {
            id: audit.id,
            reference: audit.reference,
            status: audit.status,
            template: audit.template,
            method: TEMPLATE_LABELS[audit.template],
            auditDate: dateOnly(audit.auditDate),
            area: { id: audit.area.id, name: audit.area.name, isActive: audit.area.isActive },
            auditor: person(audit.auditor),
            auditee: person(audit.auditee),
            auditeeName: audit.auditeeName,
            remarks: audit.remarks,
            photoUrls: audit.photoUrls,
            createdAt: audit.createdAt,
            updatedAt: audit.updatedAt,
            submittedAt: audit.submittedAt,
            submittedBy: person(audit.submittedBy),
            currentTargetLevel: audit.area.targetLevelTenths / 10,
            checkpoints: items,
            progress: {
                answered,
                total: checkpoints.length,
                unanswered: items.filter((i) => i.locationCount == null).map((i) => i.no),
                pointsByPractice: PRACTICE_ORDER.map((p) => ({ practice: p, label: PRACTICE_LABELS[p], points: points[p] })),
            },
            result,
            permissions: {
                canEdit: !submitted && this.canEditDraft(actor, audit),
                canSubmit: !submitted && audit.area.isActive && this.canEditDraft(actor, audit),
            },
        };
    }
}
