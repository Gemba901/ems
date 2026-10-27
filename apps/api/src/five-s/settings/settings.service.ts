import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
    EmploymentStatus,
    FiveSActionEventType,
    FiveSActionSource,
    FiveSAuditStatus,
    FiveSRedTagReason,
    FiveSResponsibility,
    FiveSRoutineCategory,
    FiveSRoutineFrequency,
    FiveSStandardStatus,
    Prisma,
} from 'db';
import { randomUUID } from 'node:crypto';
import type { AccessTokenPayload } from 'src/auth/access-token-payload';
import { PrismaService } from 'src/prisma/prisma.service';
import { addDays, toDbDate } from 'src/work/work-date';
import { isUniqueViolation } from 'src/work/work-errors';
import { AssignResponsibilityDto, ChangeLogQueryDto, DirectoryQueryDto } from '../dto/five-s.dto';
import { FiveSAccessService } from '../five-s-access.service';
import { PERSON_SELECT, logChange, nextReference, person } from '../five-s-records';
import { scoreAudit } from '../five-s-scoring';
import { CURRENT_TEMPLATE, PRACTICE_LABELS, checkpointsFor } from '../five-s-template';

export const SAMPLE_PREFIX = '[Sample] ';

const RESPONSIBILITY_LABELS: Record<FiveSResponsibility, string> = {
    ADMIN: '5S administrator',
    AUDITOR: '5S auditor',
    VERIFIER: '5S verifier / red-tag reviewer',
    VIEWER: 'Management viewer',
};

const INACTIVE_STATUSES: EmploymentStatus[] = [
    EmploymentStatus.RESIGNED,
    EmploymentStatus.TERMINATED,
    EmploymentStatus.RETIRED,
    EmploymentStatus.ABSCONDED,
    EmploymentStatus.CONTRACT_ENDED,
];

@Injectable()
export class FiveSSettingsService {
    constructor(private prisma: PrismaService, private access: FiveSAccessService) {}

    async capabilities(user: AccessTokenPayload) {
        const actor = await this.access.resolveActor(user);
        return this.access.capabilities(actor);
    }

    // Employees and departments of the company, for pickers.
    async directory(user: AccessTokenPayload, query: DirectoryQueryDto) {
        const actor = await this.access.resolveActor(user);
        const search = query.search?.trim();
        const [employees, departments] = await Promise.all([
            this.prisma.employee.findMany({
                where: {
                    organizationId: actor.organizationId,
                    employmentStatus: { notIn: INACTIVE_STATUSES },
                    OR: [{ departmentId: null }, { department: { isPlatformTeam: false } }],
                    ...(search
                        ? {
                              AND: [{
                                  OR: [
                                      { firstName: { contains: search, mode: 'insensitive' } },
                                      { lastName: { contains: search, mode: 'insensitive' } },
                                      { employeeCode: { contains: search, mode: 'insensitive' } },
                                  ],
                              }],
                          }
                        : {}),
                },
                orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
                take: 2000,
                select: { ...PERSON_SELECT, departmentId: true, jobTitle: true, employeeCode: true },
            }),
            this.prisma.department.findMany({
                where: { organizationId: actor.organizationId, isPlatformTeam: false },
                orderBy: { name: 'asc' },
                select: { id: true, name: true },
            }),
        ]);
        return {
            employees: employees.map((e) => ({ ...person(e)!, departmentId: e.departmentId, jobTitle: e.jobTitle, employeeCode: e.employeeCode })),
            departments,
        };
    }

    async responsibilities(user: AccessTokenPayload) {
        const actor = await this.access.resolveActor(user);
        this.access.assertModuleAdmin(actor);
        const rows = await this.prisma.fiveSResponsibilityAssignment.findMany({
            where: { organizationId: actor.organizationId },
            orderBy: [{ responsibility: 'asc' }, { createdAt: 'asc' }],
            select: { id: true, responsibility: true, createdAt: true, employee: { select: { ...PERSON_SELECT, department: { select: { name: true } } } } },
        });
        return rows.map((r) => ({
            id: r.id,
            responsibility: r.responsibility,
            label: RESPONSIBILITY_LABELS[r.responsibility],
            employee: person(r.employee),
            department: r.employee.department?.name ?? null,
            createdAt: r.createdAt,
        }));
    }

    async assign(user: AccessTokenPayload, dto: AssignResponsibilityDto) {
        const actor = await this.access.resolveActor(user);
        this.access.assertModuleAdmin(actor);
        await this.access.assertCompanyEmployees(actor.organizationId, [dto.employeeId]);
        try {
            return await this.prisma.$transaction(async (tx) => {
                const row = await tx.fiveSResponsibilityAssignment.create({
                    data: { organizationId: actor.organizationId, employeeId: dto.employeeId, responsibility: dto.responsibility, createdById: actor.employeeId },
                    select: { id: true, employee: { select: PERSON_SELECT } },
                });
                await logChange(tx, {
                    organizationId: actor.organizationId, actorId: actor.employeeId, entityType: 'RESPONSIBILITY', entityId: row.id,
                    action: 'ASSIGNED', summary: `${person(row.employee)!.name} made ${RESPONSIBILITY_LABELS[dto.responsibility]}`,
                });
                return { id: row.id };
            });
        } catch (error) {
            if (isUniqueViolation(error)) throw new ConflictException('This person already has that responsibility');
            throw error;
        }
    }

    async unassign(user: AccessTokenPayload, id: string) {
        const actor = await this.access.resolveActor(user);
        this.access.assertModuleAdmin(actor);
        const row = await this.prisma.fiveSResponsibilityAssignment.findFirst({
            where: { id, organizationId: actor.organizationId },
            select: { id: true, responsibility: true, employee: { select: PERSON_SELECT } },
        });
        if (!row) throw new NotFoundException('Assignment not found');
        await this.prisma.$transaction(async (tx) => {
            await tx.fiveSResponsibilityAssignment.delete({ where: { id } });
            await logChange(tx, {
                organizationId: actor.organizationId, actorId: actor.employeeId, entityType: 'RESPONSIBILITY', entityId: id,
                action: 'REMOVED', summary: `${person(row.employee)!.name} is no longer ${RESPONSIBILITY_LABELS[row.responsibility]}`,
            });
        });
        return { deleted: true };
    }

    async changeLog(user: AccessTokenPayload, query: ChangeLogQueryDto) {
        const actor = await this.access.resolveActor(user);
        this.access.assertModuleAdmin(actor);
        const rows = await this.prisma.fiveSChangeLog.findMany({
            where: {
                organizationId: actor.organizationId,
                ...(query.entityType ? { entityType: query.entityType } : {}),
                ...(query.entityId ? { entityId: query.entityId } : {}),
            },
            orderBy: { createdAt: 'desc' },
            take: query.limit ?? 100,
            select: { id: true, entityType: true, entityId: true, action: true, summary: true, createdAt: true, actor: { select: PERSON_SELECT } },
        });
        return rows.map((r) => ({ ...r, actor: person(r.actor) }));
    }

    // ---------- Sample data ----------
    // Clearly labelled demonstration records: area names start with "[Sample]" and isSample is set.

    async sampleStatus(user: AccessTokenPayload) {
        const actor = await this.access.resolveActor(user);
        const count = await this.prisma.fiveSArea.count({ where: { organizationId: actor.organizationId, isSample: true } });
        return { sampleAreas: count };
    }

    async addSampleData(user: AccessTokenPayload) {
        const actor = await this.access.resolveActor(user);
        this.access.assertModuleAdmin(actor);
        const existing = await this.prisma.fiveSArea.count({ where: { organizationId: actor.organizationId, isSample: true } });
        if (existing > 0) throw new ConflictException('Sample data is already loaded. Remove it first to reload.');

        const org = actor.organizationId;
        const me = actor.employeeId;
        const today = this.access.today(actor);
        const checkpoints = checkpointsFor(CURRENT_TEMPLATE);
        // Illustrative counts only. Total 23 points -> level 3.5 - ROUNDUP(23/4)*0.1 = 2.9.
        const counts = [1, 0, 2, 1, 2, 1, 2, 0, 3, 1, 0, 1, 2, 1, 0, 1, 1, 2, 1, 1];

        await this.prisma.$transaction(async (tx) => {
            const press = await tx.fiveSArea.create({
                data: {
                    organizationId: org, name: `${SAMPLE_PREFIX}Press Shop Line 1`, departmentId: actor.departmentId, ownerId: me,
                    description: 'SAMPLE DATA for training. Press line 1 including die rack and finished-goods staging.',
                    auditFrequency: 'MONTHLY', targetLevelTenths: 30, isSample: true, createdById: me,
                },
            });
            await tx.fiveSArea.create({
                data: {
                    organizationId: org, name: `${SAMPLE_PREFIX}Stores Receiving Bay`, departmentId: actor.departmentId, ownerId: me,
                    description: 'SAMPLE DATA for training. Not yet assessed.',
                    auditFrequency: 'FORTNIGHTLY', targetLevelTenths: 28, isSample: true, createdById: me,
                },
            });

            const auditDate = addDays(today, -7);
            const map = new Map(checkpoints.map((c, i) => [c.no, counts[i]]));
            const result = scoreAudit(checkpoints, map);
            const audit = await tx.fiveSAudit.create({
                data: {
                    organizationId: org, reference: await nextReference(tx, org, 'AUDIT'), areaId: press.id, template: CURRENT_TEMPLATE,
                    status: FiveSAuditStatus.SUBMITTED, auditDate: toDbDate(auditDate), auditorId: me, auditeeName: 'Sample line leader',
                    remarks: 'SAMPLE DATA: illustrative audit for training.',
                    sortPoints: result.pointsByPractice.SORT, setInOrderPoints: result.pointsByPractice.SET_IN_ORDER,
                    shinePoints: result.pointsByPractice.SHINE, standardizePoints: result.pointsByPractice.STANDARDIZE,
                    sustainPoints: result.pointsByPractice.SUSTAIN, totalPoints: result.totalPoints, levelTenths: result.levelTenths,
                    targetLevelTenths: press.targetLevelTenths, submittedAt: new Date(), submittedById: me, createdById: me,
                    responses: { create: checkpoints.map((c) => ({ checkpointNo: c.no, locationCount: map.get(c.no)! })) },
                },
            });
            for (const c of checkpoints) {
                const count = map.get(c.no)!;
                if (count === 0) continue;
                const action = await tx.fiveSAction.create({
                    data: {
                        organizationId: org, reference: await nextReference(tx, org, 'ACTION'), areaId: press.id, source: FiveSActionSource.AUDIT,
                        auditId: audit.id, checkpointNo: c.no, practice: c.practice, locationCount: count, checkpointText: c.text,
                        finding: `SAMPLE: ${count} problem location${count === 1 ? '' : 's'} found against checkpoint ${c.no} (${PRACTICE_LABELS[c.practice]}).`,
                        ownerId: me, createdById: me,
                    },
                });
                await tx.fiveSActionEvent.create({ data: { actionId: action.id, actorId: me, type: FiveSActionEventType.CREATED, note: 'Sample data' } });
            }

            await tx.fiveSRedTag.create({
                data: {
                    organizationId: org, reference: await nextReference(tx, org, 'RED_TAG'), areaId: press.id,
                    itemName: 'SAMPLE: Spare die clamp (unidentified)', location: 'Die rack, bottom shelf', quantity: '2', reason: FiveSRedTagReason.UNIDENTIFIED,
                    ownerId: me, raisedById: me, raisedOn: toDbDate(auditDate), reviewDueDate: toDbDate(addDays(today, 7)),
                },
            });
            const standardId = randomUUID();
            await tx.fiveSStandard.create({
                data: {
                    id: standardId, seriesId: standardId, revision: 1, organizationId: org, areaId: press.id,
                    title: 'SAMPLE: Die rack layout and labelling', ownerId: me, status: FiveSStandardStatus.APPROVED,
                    instructions: 'Each die has a labelled home position. Return dies to their position after changeover. Empty positions show the die number.',
                    changeNote: 'Sample data', approvedById: me, approvedAt: new Date(), createdById: me,
                },
            });
            await tx.fiveSRoutine.create({
                data: {
                    organizationId: org, areaId: press.id, title: 'SAMPLE: End-of-shift clean and return tools', checkLocation: 'Press 1 operator station and shadow board',
                    instructions: 'Sweep chips, wipe the bolster, return all tools to the shadow board.',
                    category: FiveSRoutineCategory.CLEANING, frequency: FiveSRoutineFrequency.DAILY, responsibleId: me,
                    startDate: toDbDate(addDays(today, -14)), createdById: me,
                },
            });
            await logChange(tx, { organizationId: org, actorId: me, entityType: 'SAMPLE', entityId: org, action: 'ADDED', summary: 'Loaded 5S sample data' });
        }, { timeout: 30_000 });

        return this.sampleStatus(user);
    }

    // Removes only records belonging to sample areas.
    async removeSampleData(user: AccessTokenPayload) {
        const actor = await this.access.resolveActor(user);
        this.access.assertModuleAdmin(actor);
        const org = actor.organizationId;
        await this.prisma.$transaction(async (tx) => {
            const areaWhere: Prisma.FiveSAreaWhereInput = { organizationId: org, isSample: true };
            const ids = (await tx.fiveSArea.findMany({ where: areaWhere, select: { id: true } })).map((a) => a.id);
            if (ids.length === 0) return;
            const inAreas = { areaId: { in: ids } };
            await tx.fiveSAction.deleteMany({ where: inAreas });
            await tx.fiveSAudit.deleteMany({ where: inAreas });
            await tx.fiveSRedTag.deleteMany({ where: inAreas });
            await tx.fiveSStandard.deleteMany({ where: inAreas });
            await tx.fiveSRoutine.deleteMany({ where: inAreas });
            await tx.fiveSArea.deleteMany({ where: { id: { in: ids } } });
            await logChange(tx, { organizationId: org, actorId: actor.employeeId, entityType: 'SAMPLE', entityId: org, action: 'REMOVED', summary: `Removed 5S sample data (${ids.length} areas)` });
        });
        return this.sampleStatus(user);
    }
}
