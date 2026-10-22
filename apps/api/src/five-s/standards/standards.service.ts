import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { FiveSStandardStatus, Prisma } from 'db';
import type { AccessTokenPayload } from 'src/auth/access-token-payload';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateStandardDto, StandardListQueryDto, StandardSourceQueryDto, UpdateStandardDto } from '../dto/five-s.dto';
import { FiveSAccessService, FiveSActor } from '../five-s-access.service';
import { PERSON_SELECT, logChange, person } from '../five-s-records';

// Area standards (Standardize). Revisions of one standard share a seriesId; at most one revision
// is APPROVED at a time, and approving a new revision supersedes the old one.

const STANDARD_SELECT = {
    id: true,
    seriesId: true,
    revision: true,
    title: true,
    instructions: true,
    referenceUrls: true,
    status: true,
    changeNote: true,
    approvedAt: true,
    createdAt: true,
    updatedAt: true,
    area: { select: { id: true, name: true, departmentId: true, ownerId: true, isActive: true } },
    owner: { select: PERSON_SELECT },
    approvedBy: { select: PERSON_SELECT },
    sourceKaizen: { select: { id: true, title: true } },
    sourceSga: { select: { id: true, title: true } },
} satisfies Prisma.FiveSStandardSelect;

// Only a verified, closed improvement is proven enough to become the standard.
const CLOSED = 'VERIFIED_CLOSED';

type StandardRow = Prisma.FiveSStandardGetPayload<{ select: typeof STANDARD_SELECT }>;

@Injectable()
export class StandardsService {
    constructor(private prisma: PrismaService, private access: FiveSAccessService) {}

    async list(user: AccessTokenPayload, query: StandardListQueryDto) {
        const actor = await this.access.resolveActor(user);
        const statusWhere: Prisma.FiveSStandardWhereInput = query.status
            ? { status: query.status }
            : query.view === 'all'
              ? {}
              : query.view === 'current'
                ? { status: FiveSStandardStatus.APPROVED }
                : { status: { not: FiveSStandardStatus.SUPERSEDED } };
        const rows = await this.prisma.fiveSStandard.findMany({
            where: {
                organizationId: actor.organizationId,
                area: this.access.visibleAreaWhere(actor),
                ...(query.areaId ? { areaId: query.areaId } : {}),
                ...statusWhere,
            },
            orderBy: [{ area: { name: 'asc' } }, { title: 'asc' }, { revision: 'desc' }],
            take: 300,
            select: STANDARD_SELECT,
        });
        return rows.map((r) => this.toView(actor, r));
    }

    async get(user: AccessTokenPayload, id: string) {
        const actor = await this.access.resolveActor(user);
        const standard = await this.standardOrThrow(actor, id);
        const revisions = await this.prisma.fiveSStandard.findMany({
            where: { seriesId: standard.seriesId },
            orderBy: { revision: 'desc' },
            select: { id: true, revision: true, status: true, changeNote: true, approvedAt: true, createdAt: true, approvedBy: { select: PERSON_SELECT } },
        });
        const current = revisions.find((r) => r.status === FiveSStandardStatus.APPROVED) ?? null;
        return {
            ...this.toView(actor, standard),
            currentApprovedId: current?.id ?? null,
            hasOpenDraft: revisions.some((r) => r.status === FiveSStandardStatus.DRAFT),
            revisions: revisions.map((r) => ({ ...r, approvedBy: person(r.approvedBy) })),
        };
    }

    async create(user: AccessTokenPayload, dto: CreateStandardDto) {
        const actor = await this.access.resolveActor(user);
        const area = await this.access.areaOrThrow(actor, dto.areaId);
        if (!this.access.canMaintainAreaStandards(actor, area)) throw new ForbiddenException('Only the area owner, HOD or a 5S administrator can write standards');
        await this.access.assertCompanyEmployees(actor.organizationId, [dto.ownerId]);
        const source = await this.closedSource(actor.organizationId, { kaizenId: dto.sourceKaizenId, sgaId: dto.sourceSgaId });

        const id = randomUUID();
        return this.prisma.$transaction(async (tx) => {
            const standard = await tx.fiveSStandard.create({
                data: {
                    id,
                    seriesId: id,
                    revision: 1,
                    organizationId: actor.organizationId,
                    areaId: area.id,
                    title: dto.title,
                    instructions: dto.instructions,
                    ownerId: dto.ownerId ?? area.ownerId ?? null,
                    referenceUrls: dto.referenceUrls ?? [],
                    changeNote: dto.changeNote || 'First issue',
                    status: FiveSStandardStatus.DRAFT,
                    createdById: actor.employeeId,
                    sourceKaizenId: source?.kind === 'KAIZEN' ? source.id : null,
                    sourceSgaId: source?.kind === 'SGA' ? source.id : null,
                },
                select: { id: true },
            });
            await logChange(tx, {
                organizationId: actor.organizationId, actorId: actor.employeeId, entityType: 'STANDARD', entityId: id,
                action: 'DRAFTED',
                summary: `Drafted standard "${dto.title}" rev 1 for "${area.name}"${source ? ` from ${source.label}` : ''}`,
            });
            return standard;
        });
    }

    async update(user: AccessTokenPayload, id: string, dto: UpdateStandardDto) {
        const actor = await this.access.resolveActor(user);
        const standard = await this.standardOrThrow(actor, id);
        if (!this.access.canMaintainAreaStandards(actor, standard.area)) throw new ForbiddenException('You cannot edit this standard');
        if (standard.status !== FiveSStandardStatus.DRAFT) throw new ConflictException('Approved revisions are locked. Start a new revision instead.');
        await this.access.assertCompanyEmployees(actor.organizationId, [dto.ownerId]);

        const updated = await this.prisma.fiveSStandard.updateMany({
            where: { id, status: FiveSStandardStatus.DRAFT },
            data: {
                ...(dto.title !== undefined ? { title: dto.title } : {}),
                ...(dto.instructions !== undefined ? { instructions: dto.instructions } : {}),
                ...(dto.ownerId !== undefined ? { ownerId: dto.ownerId } : {}),
                ...(dto.referenceUrls !== undefined ? { referenceUrls: dto.referenceUrls } : {}),
                ...(dto.changeNote !== undefined ? { changeNote: dto.changeNote || null } : {}),
            },
        });
        if (updated.count === 0) throw new ConflictException('Approved revisions are locked. Start a new revision instead.');
        return this.get(user, id);
    }

    async approve(user: AccessTokenPayload, id: string) {
        const actor = await this.access.resolveActor(user);
        const standard = await this.standardOrThrow(actor, id);
        if (!this.access.canApproveStandards(actor, standard.area)) throw new ForbiddenException('Only the area HOD or a 5S administrator can approve standards');
        if (standard.status !== FiveSStandardStatus.DRAFT) throw new ConflictException('Only draft revisions can be approved');

        await this.prisma.$transaction(async (tx) => {
            const superseded = await tx.fiveSStandard.updateMany({
                where: { seriesId: standard.seriesId, status: FiveSStandardStatus.APPROVED },
                data: { status: FiveSStandardStatus.SUPERSEDED },
            });
            const approved = await tx.fiveSStandard.updateMany({
                where: { id, status: FiveSStandardStatus.DRAFT },
                data: { status: FiveSStandardStatus.APPROVED, approvedById: actor.employeeId, approvedAt: new Date() },
            });
            if (approved.count === 0) throw new ConflictException('This revision has already been approved');
            await logChange(tx, {
                organizationId: actor.organizationId, actorId: actor.employeeId, entityType: 'STANDARD', entityId: standard.seriesId,
                action: 'APPROVED',
                summary: `Approved "${standard.title}" rev ${standard.revision}${superseded.count ? ` (supersedes previous revision)` : ''}`,
            });
        });
        return this.get(user, id);
    }

    // Starts a new draft revision from the latest one. Only one open draft per standard.
    async revise(user: AccessTokenPayload, id: string) {
        const actor = await this.access.resolveActor(user);
        const standard = await this.standardOrThrow(actor, id);
        if (!this.access.canMaintainAreaStandards(actor, standard.area)) throw new ForbiddenException('You cannot revise this standard');

        const created = await this.prisma.$transaction(async (tx) => {
            const latest = await tx.fiveSStandard.findFirstOrThrow({ where: { seriesId: standard.seriesId }, orderBy: { revision: 'desc' } });
            if (latest.status === FiveSStandardStatus.DRAFT) throw new ConflictException('This standard already has a draft revision');
            const revision = latest.revision + 1;
            const draft = await tx.fiveSStandard.create({
                data: {
                    organizationId: latest.organizationId,
                    areaId: latest.areaId,
                    seriesId: latest.seriesId,
                    revision,
                    title: latest.title,
                    instructions: latest.instructions,
                    ownerId: latest.ownerId,
                    referenceUrls: latest.referenceUrls,
                    sourceKaizenId: latest.sourceKaizenId,
                    sourceSgaId: latest.sourceSgaId,
                    status: FiveSStandardStatus.DRAFT,
                    changeNote: null,
                    createdById: actor.employeeId,
                },
                select: { id: true },
            });
            await logChange(tx, {
                organizationId: actor.organizationId, actorId: actor.employeeId, entityType: 'STANDARD', entityId: latest.seriesId,
                action: 'REVISION_STARTED', summary: `Started revision ${revision} of "${latest.title}"`,
            });
            return draft;
        });
        return this.get(user, created.id);
    }

    async removeDraft(user: AccessTokenPayload, id: string) {
        const actor = await this.access.resolveActor(user);
        const standard = await this.standardOrThrow(actor, id);
        if (!this.access.canMaintainAreaStandards(actor, standard.area)) throw new ForbiddenException('You cannot delete this draft');
        await this.prisma.$transaction(async (tx) => {
            const deleted = await tx.fiveSStandard.deleteMany({ where: { id, status: FiveSStandardStatus.DRAFT } });
            if (deleted.count === 0) throw new ConflictException('Only draft revisions can be deleted');
            await logChange(tx, {
                organizationId: actor.organizationId, actorId: actor.employeeId, entityType: 'STANDARD', entityId: standard.seriesId,
                action: 'DRAFT_DELETED', summary: `Deleted draft rev ${standard.revision} of "${standard.title}"`,
            });
        });
        return { deleted: true };
    }

    // Join 12 ("Standardise"): what a new standard written from a closed Kaizen or SGA starts with.
    // The 5S side decides the area; the improvement supplies the title and the method that worked.
    async sourcePrefill(user: AccessTokenPayload, query: StandardSourceQueryDto) {
        const actor = await this.access.resolveActor(user);
        const source = await this.closedSource(actor.organizationId, query);
        if (!source) throw new BadRequestException('Pick a Kaizen or SGA to standardise');
        return {
            kind: source.kind,
            id: source.id,
            title: source.title,
            instructions: source.instructions,
            changeNote: `First issue, standardised from ${source.label}`,
        };
    }

    private async closedSource(organizationId: string, ids: { kaizenId?: string; sgaId?: string }) {
        if (ids.kaizenId && ids.sgaId) throw new BadRequestException('A standard comes from one Kaizen or one SGA, not both');
        if (ids.kaizenId) {
            const kaizen = await this.prisma.kaizen.findFirst({
                where: { id: ids.kaizenId, organizationId },
                select: { id: true, title: true, status: true, actionTaken: true, resultSaving: true, conditionDescription: true },
            });
            if (!kaizen) throw new NotFoundException('Kaizen not found');
            if (kaizen.status !== CLOSED) throw new BadRequestException('Only a verified and closed Kaizen can be standardised');
            const title = kaizen.title ?? 'Untitled kaizen';
            return {
                kind: 'KAIZEN' as const,
                id: kaizen.id,
                title,
                label: `Kaizen "${title}"`,
                instructions: [kaizen.actionTaken ?? kaizen.conditionDescription, kaizen.resultSaving && `Result: ${kaizen.resultSaving}`]
                    .filter(Boolean)
                    .join('\n\n'),
            };
        }
        if (ids.sgaId) {
            const sga = await this.prisma.sga.findFirst({
                where: { id: ids.sgaId, organizationId },
                select: { id: true, title: true, status: true, implementationSummary: true, problemDescription: true },
            });
            if (!sga) throw new NotFoundException('SGA not found');
            if (sga.status !== CLOSED) throw new BadRequestException('Only a verified and closed SGA can be standardised');
            const title = sga.title ?? 'Untitled SGA';
            return {
                kind: 'SGA' as const,
                id: sga.id,
                title,
                label: `SGA "${title}"`,
                instructions: sga.implementationSummary ?? sga.problemDescription ?? '',
            };
        }
        return null;
    }

    private async standardOrThrow(actor: FiveSActor, id: string): Promise<StandardRow> {
        const standard = await this.prisma.fiveSStandard.findFirst({
            where: { id, organizationId: actor.organizationId, area: this.access.visibleAreaWhere(actor) },
            select: STANDARD_SELECT,
        });
        if (!standard) throw new NotFoundException('Standard not found');
        return standard;
    }

    private toView(actor: FiveSActor, s: StandardRow) {
        const maintain = this.access.canMaintainAreaStandards(actor, s.area);
        return {
            id: s.id,
            seriesId: s.seriesId,
            revision: s.revision,
            title: s.title,
            instructions: s.instructions,
            referenceUrls: s.referenceUrls,
            status: s.status,
            isCurrent: s.status === FiveSStandardStatus.APPROVED,
            changeNote: s.changeNote,
            area: { id: s.area.id, name: s.area.name },
            owner: person(s.owner),
            approvedBy: person(s.approvedBy),
            approvedAt: s.approvedAt,
            sourceKaizen: s.sourceKaizen,
            sourceSga: s.sourceSga,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt,
            permissions: {
                canEdit: s.status === FiveSStandardStatus.DRAFT && maintain,
                canApprove: s.status === FiveSStandardStatus.DRAFT && this.access.canApproveStandards(actor, s.area),
                canRevise: s.status === FiveSStandardStatus.APPROVED && maintain,
            },
        };
    }
}
