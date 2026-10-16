import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { FiveSActionStatus, FiveSAuditStatus, FiveSStandardStatus, Prisma } from 'db';
import type { AccessTokenPayload } from 'src/auth/access-token-payload';
import { PrismaService } from 'src/prisma/prisma.service';
import { isUniqueViolation } from 'src/work/work-errors';
import { AreaListQueryDto, CreateAreaDto, UpdateAreaDto } from '../dto/five-s.dto';
import { FiveSAccessService } from '../five-s-access.service';
import { PERSON_SELECT, dateOnly, logChange, person } from '../five-s-records';
import { AUDIT_RESULT_SELECT, REPORTABLE_AUDIT_WHERE, buildAreaSummaries, toAuditResult } from '../five-s-summary';
import { TEMPLATE_LABELS } from '../five-s-template';

const toTenths = (levelValue: number) => Math.round(levelValue * 10);

@Injectable()
export class AreasService {
    constructor(private prisma: PrismaService, private access: FiveSAccessService) {}

    async list(user: AccessTokenPayload, query: AreaListQueryDto) {
        const actor = await this.access.resolveActor(user);
        const status = query.status ?? 'active';
        const where: Prisma.FiveSAreaWhereInput = {
            AND: [
                this.access.visibleAreaWhere(actor),
                {
                    ...(status === 'all' ? {} : { isActive: status === 'active' }),
                    ...(query.departmentId ? { departmentId: query.departmentId } : {}),
                    ...(query.ownerId ? { ownerId: query.ownerId } : {}),
                },
            ],
        };
        return buildAreaSummaries(this.prisma, where, this.access.today(actor));
    }

    async get(user: AccessTokenPayload, areaId: string) {
        const actor = await this.access.resolveActor(user);
        const scope = await this.access.areaOrThrow(actor, areaId);
        const today = this.access.today(actor);

        const [[summary], area, history, outstanding, drafts, otherMethodCount, standards, routines] = await Promise.all([
            buildAreaSummaries(this.prisma, { id: areaId }, today),
            this.prisma.fiveSArea.findUniqueOrThrow({
                where: { id: areaId },
                select: { description: true, auditBoundary: true, createdAt: true, updatedAt: true },
            }),
            this.prisma.fiveSAudit.findMany({
                where: { areaId, ...REPORTABLE_AUDIT_WHERE },
                orderBy: [{ auditDate: 'desc' }, { submittedAt: 'desc' }],
                take: 24,
                select: AUDIT_RESULT_SELECT,
            }),
            this.prisma.fiveSAction.findMany({
                where: { areaId, status: { not: FiveSActionStatus.VERIFIED } },
                orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
                take: 50,
                select: {
                    id: true, reference: true, practice: true, finding: true, status: true, dueDate: true, checkpointNo: true,
                    owner: { select: PERSON_SELECT },
                },
            }),
            this.prisma.fiveSAudit.findMany({
                where: { areaId, status: FiveSAuditStatus.DRAFT },
                orderBy: { updatedAt: 'desc' },
                select: { id: true, reference: true, auditDate: true, updatedAt: true, auditor: { select: PERSON_SELECT }, _count: { select: { responses: { where: { locationCount: { not: null } } } } } },
            }),
            this.prisma.fiveSAudit.count({ where: { areaId, status: FiveSAuditStatus.SUBMITTED, template: { not: REPORTABLE_AUDIT_WHERE.template } } }),
            this.prisma.fiveSStandard.count({ where: { areaId, status: FiveSStandardStatus.APPROVED } }),
            this.prisma.fiveSRoutine.count({ where: { areaId, isActive: true } }),
        ]);

        return {
            ...summary,
            description: area.description,
            auditBoundary: area.auditBoundary,
            createdAt: area.createdAt,
            updatedAt: area.updatedAt,
            method: TEMPLATE_LABELS[REPORTABLE_AUDIT_WHERE.template],
            history: history.map(toAuditResult),
            otherMethodAuditCount: otherMethodCount,
            outstandingActions: outstanding.map((a) => ({ ...a, dueDate: dateOnly(a.dueDate), owner: person(a.owner) })),
            drafts: drafts.map((d) => ({
                id: d.id, reference: d.reference, auditDate: dateOnly(d.auditDate), updatedAt: d.updatedAt,
                auditor: person(d.auditor), answered: d._count.responses,
            })),
            approvedStandards: standards,
            activeRoutines: routines,
            permissions: {
                canEdit: this.access.canManageArea(actor, scope),
                canAudit: scope.isActive && this.access.canAudit(actor, scope),
                canMaintainStandards: this.access.canMaintainAreaStandards(actor, scope),
                canCoordinate: this.access.canCoordinateArea(actor, scope),
            },
        };
    }

    async create(user: AccessTokenPayload, dto: CreateAreaDto) {
        const actor = await this.access.resolveActor(user);
        if (!this.access.canCreateAreas(actor)) throw new ForbiddenException('Only 5S administrators and HODs can create workplace areas');

        // HODs create areas in their own department only.
        const departmentId = this.access.isModuleAdmin(actor) ? dto.departmentId ?? null : actor.departmentId;
        if (!this.access.isModuleAdmin(actor) && dto.departmentId && dto.departmentId !== actor.departmentId) {
            throw new ForbiddenException('You can only create areas in your own department');
        }
        await this.access.assertCompanyDepartment(actor.organizationId, departmentId);
        await this.access.assertCompanyEmployees(actor.organizationId, [dto.ownerId]);

        try {
            return await this.prisma.$transaction(async (tx) => {
                const area = await tx.fiveSArea.create({
                    data: {
                        organizationId: actor.organizationId,
                        name: dto.name,
                        departmentId,
                        ownerId: dto.ownerId ?? null,
                        description: dto.description || null,
                        auditBoundary: dto.auditBoundary || null,
                        auditFrequency: dto.auditFrequency,
                        targetLevelTenths: toTenths(dto.targetLevel),
                        createdById: actor.employeeId,
                    },
                    select: { id: true, name: true },
                });
                await logChange(tx, {
                    organizationId: actor.organizationId, actorId: actor.employeeId, entityType: 'AREA', entityId: area.id,
                    action: 'CREATED', summary: `Created workplace area "${area.name}" (target ${dto.targetLevel.toFixed(1)})`,
                });
                return area;
            });
        } catch (error) {
            if (isUniqueViolation(error)) throw new ConflictException('An area with this name already exists');
            throw error;
        }
    }

    async update(user: AccessTokenPayload, areaId: string, dto: UpdateAreaDto) {
        const actor = await this.access.resolveActor(user);
        const scope = await this.access.areaOrThrow(actor, areaId);
        if (!this.access.canManageArea(actor, scope)) throw new ForbiddenException('You cannot edit this area');
        if (dto.departmentId !== undefined && !this.access.isModuleAdmin(actor) && dto.departmentId !== actor.departmentId) {
            throw new ForbiddenException('You can only keep areas in your own department');
        }
        await this.access.assertCompanyDepartment(actor.organizationId, dto.departmentId);
        await this.access.assertCompanyEmployees(actor.organizationId, [dto.ownerId]);

        const before = await this.prisma.fiveSArea.findUniqueOrThrow({ where: { id: areaId } });
        const data: Prisma.FiveSAreaUncheckedUpdateInput = {};
        const changes: string[] = [];
        const set = <K extends keyof typeof before>(key: K, value: (typeof before)[K] | undefined, label: string) => {
            if (value === undefined || value === before[key]) return;
            (data as Record<string, unknown>)[key as string] = value;
            changes.push(label);
        };
        set('name', dto.name, 'name');
        set('departmentId', dto.departmentId, 'department');
        set('ownerId', dto.ownerId, 'owner');
        set('description', dto.description === undefined ? undefined : dto.description || null, 'description');
        set('auditBoundary', dto.auditBoundary === undefined ? undefined : dto.auditBoundary || null, 'audit boundary');
        set('auditFrequency', dto.auditFrequency, 'audit frequency');
        set('targetLevelTenths', dto.targetLevel === undefined ? undefined : toTenths(dto.targetLevel), 'target level');
        set('isActive', dto.isActive, dto.isActive ? 'reactivated' : 'deactivated');
        if (changes.length === 0) return { id: areaId, name: before.name };

        try {
            return await this.prisma.$transaction(async (tx) => {
                const area = await tx.fiveSArea.update({ where: { id: areaId }, data, select: { id: true, name: true } });
                await logChange(tx, {
                    organizationId: actor.organizationId, actorId: actor.employeeId, entityType: 'AREA', entityId: areaId,
                    action: 'UPDATED', summary: `Updated "${area.name}": ${changes.join(', ')}`,
                });
                return area;
            });
        } catch (error) {
            if (isUniqueViolation(error)) throw new ConflictException('An area with this name already exists');
            throw error;
        }
    }
}
