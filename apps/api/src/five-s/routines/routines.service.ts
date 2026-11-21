import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { FiveSRoutineFrequency, FiveSRoutineOutcome, Prisma } from 'db';
import type { AccessTokenPayload } from 'src/auth/access-token-payload';
import { PrismaService } from 'src/prisma/prisma.service';
import { addDays, daysBetween, toDbDate } from 'src/work/work-date';
import { isUniqueViolation } from 'src/work/work-errors';
import {
    CreateRoutineDto,
    RecordRoutineCompletionDto,
    RoutineListQueryDto,
    RoutineScheduleQueryDto,
    UpdateRoutineDto,
} from '../dto/five-s.dto';
import { FiveSAccessService, FiveSActor } from '../five-s-access.service';
import { FiveSDwmsSyncService } from '../five-s-dwms-sync.service';
import { PERSON_SELECT, dateOnly, logChange, person } from '../five-s-records';
import { isRoutineOccurrence, routineOccurrences } from '../five-s-schedule';

// Sustaining routines: what is checked, where, by whom and how often. Completions are a
// permanent history. They never change audit scores and never close improvement actions.

const ROUTINE_SELECT = {
    id: true,
    title: true,
    checkLocation: true,
    instructions: true,
    category: true,
    frequency: true,
    responsibleId: true,
    startDate: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
    area: { select: { id: true, name: true, departmentId: true, ownerId: true, isActive: true } },
    responsible: { select: PERSON_SELECT },
} satisfies Prisma.FiveSRoutineSelect;

type RoutineRow = Prisma.FiveSRoutineGetPayload<{ select: typeof ROUTINE_SELECT }>;

export type OccurrenceState = 'DONE' | 'DONE_WITH_EXCEPTION' | 'NOT_DONE' | 'MISSED' | 'DUE_TODAY' | 'UPCOMING';

const MAX_SCHEDULE_DAYS = 120;

// How far back an unrecorded occurrence still counts as "due" rather than missed.
const GRACE_DAYS: Record<FiveSRoutineFrequency, number> = { DAILY: 0, WEEKLY: 2, MONTHLY: 5 };

@Injectable()
export class RoutinesService {
    constructor(
        private prisma: PrismaService,
        private access: FiveSAccessService,
        private dwmsSync: FiveSDwmsSyncService,
    ) {}

    async list(user: AccessTokenPayload, query: RoutineListQueryDto) {
        const actor = await this.access.resolveActor(user);
        const today = this.access.today(actor);
        const status = query.status ?? 'active';
        const rows = await this.prisma.fiveSRoutine.findMany({
            where: {
                organizationId: actor.organizationId,
                area: this.access.visibleAreaWhere(actor),
                ...(status === 'all' ? {} : { isActive: status === 'active' }),
                ...(query.areaId ? { areaId: query.areaId } : {}),
                ...(query.responsibleId ? { responsibleId: query.responsibleId } : {}),
            },
            orderBy: [{ area: { name: 'asc' } }, { title: 'asc' }],
            take: 300,
            select: ROUTINE_SELECT,
        });
        if (rows.length === 0) return [];

        // Last completion and the most recent occurrence's state, for the list view.
        const from = addDays(today, -40);
        const completions = await this.prisma.fiveSRoutineCompletion.findMany({
            where: { routineId: { in: rows.map((r) => r.id) }, scheduledDate: { gte: toDbDate(from) } },
            select: { routineId: true, scheduledDate: true, outcome: true },
        });
        const byRoutine = new Map<string, Map<string, string>>();
        for (const c of completions) {
            const m = byRoutine.get(c.routineId) ?? new Map<string, string>();
            m.set(dateOnly(c.scheduledDate)!, c.outcome);
            byRoutine.set(c.routineId, m);
        }

        return rows.map((r) => {
            const done = byRoutine.get(r.id) ?? new Map<string, string>();
            const occurrences = routineOccurrences(dateOnly(r.startDate)!, r.frequency, from, today);
            const latest = occurrences.at(-1) ?? null;
            const missed = occurrences.filter((d) => !done.has(d) && this.stateFor(d, today, r.frequency, undefined) === 'MISSED').length;
            return {
                ...this.toView(actor, r),
                latestOccurrence: latest ? { date: latest, state: this.stateFor(latest, today, r.frequency, done.get(latest)) } : null,
                missedLast40Days: missed,
            };
        });
    }

    async get(user: AccessTokenPayload, id: string) {
        const actor = await this.access.resolveActor(user);
        return this.toView(actor, await this.routineOrThrow(actor, id));
    }

    async schedule(user: AccessTokenPayload, id: string, query: RoutineScheduleQueryDto) {
        const actor = await this.access.resolveActor(user);
        const routine = await this.routineOrThrow(actor, id);
        const today = this.access.today(actor);
        const to = query.to ?? addDays(today, 14);
        const from = query.from ?? addDays(today, -30);
        if (from > to) throw new BadRequestException('"from" must be on or before "to"');
        if (daysBetween(from, to) > MAX_SCHEDULE_DAYS) throw new BadRequestException(`Choose a range of at most ${MAX_SCHEDULE_DAYS} days`);

        const startDate = dateOnly(routine.startDate)!;
        const occurrences = routineOccurrences(startDate, routine.frequency, from, to);
        const completions = await this.prisma.fiveSRoutineCompletion.findMany({
            where: { routineId: id },
            orderBy: { scheduledDate: 'desc' },
            take: 500,
            select: { id: true, scheduledDate: true, outcome: true, exception: true, completedAt: true, completedBy: { select: PERSON_SELECT } },
        });
        const byDate = new Map(completions.map((c) => [dateOnly(c.scheduledDate)!, c]));
        const canRecord = this.canRecord(actor, routine);

        return {
            routine: this.toView(actor, routine),
            from,
            to,
            today,
            occurrences: occurrences.map((date) => {
                const c = byDate.get(date);
                return {
                    date,
                    state: this.stateFor(date, today, routine.frequency, c?.outcome),
                    completion: c ? { id: c.id, outcome: c.outcome, exception: c.exception, completedAt: c.completedAt, completedBy: person(c.completedBy) } : null,
                    canRecord: !c && canRecord && routine.isActive && date <= today,
                };
            }),
            // Full history, including completions outside the range and for earlier schedules.
            history: completions.map((c) => ({
                id: c.id, scheduledDate: dateOnly(c.scheduledDate), outcome: c.outcome, exception: c.exception,
                completedAt: c.completedAt, completedBy: person(c.completedBy),
            })),
        };
    }

    async create(user: AccessTokenPayload, dto: CreateRoutineDto) {
        const actor = await this.access.resolveActor(user);
        const area = await this.access.areaOrThrow(actor, dto.areaId);
        if (!this.access.canMaintainAreaStandards(actor, area)) throw new ForbiddenException('Only the area owner, HOD or a 5S administrator can set up routines');
        await this.access.assertCompanyEmployees(actor.organizationId, [dto.responsibleId]);

        const created = await this.prisma.$transaction(async (tx) => {
            const routine = await tx.fiveSRoutine.create({
                data: {
                    organizationId: actor.organizationId,
                    areaId: area.id,
                    title: dto.title,
                    checkLocation: dto.checkLocation,
                    instructions: dto.instructions || null,
                    category: dto.category,
                    frequency: dto.frequency,
                    responsibleId: dto.responsibleId ?? area.ownerId ?? null,
                    startDate: toDbDate(dto.startDate),
                    createdById: actor.employeeId,
                },
                select: { id: true },
            });
            await logChange(tx, {
                organizationId: actor.organizationId, actorId: actor.employeeId, entityType: 'ROUTINE', entityId: routine.id,
                action: 'CREATED', summary: `Created routine "${dto.title}" (${dto.frequency.toLowerCase()}) for "${area.name}"`,
            });
            return routine;
        });
        // Join 5: the routine becomes a recurring task on the responsible person's DWMS list.
        await this.dwmsSync.syncRoutine(created.id, actor.employeeId);
        return created;
    }

    // The schedule (frequency/start) is fixed once created so completion history stays meaningful;
    // to change it, deactivate this routine and create a new one.
    async update(user: AccessTokenPayload, id: string, dto: UpdateRoutineDto) {
        const actor = await this.access.resolveActor(user);
        const routine = await this.routineOrThrow(actor, id);
        if (!this.access.canMaintainAreaStandards(actor, routine.area)) throw new ForbiddenException('You cannot change this routine');
        if (dto.frequency !== undefined && dto.frequency !== routine.frequency) {
            const recorded = await this.prisma.fiveSRoutineCompletion.count({ where: { routineId: id } });
            if (recorded > 0) throw new ConflictException('This routine has recorded checks. Deactivate it and create a new routine to change how often it runs.');
        }
        await this.access.assertCompanyEmployees(actor.organizationId, [dto.responsibleId]);

        await this.prisma.$transaction(async (tx) => {
            await tx.fiveSRoutine.update({
                where: { id },
                data: {
                    ...(dto.title !== undefined ? { title: dto.title } : {}),
                    ...(dto.checkLocation !== undefined ? { checkLocation: dto.checkLocation } : {}),
                    ...(dto.instructions !== undefined ? { instructions: dto.instructions || null } : {}),
                    ...(dto.category !== undefined ? { category: dto.category } : {}),
                    ...(dto.frequency !== undefined ? { frequency: dto.frequency } : {}),
                    ...(dto.responsibleId !== undefined ? { responsibleId: dto.responsibleId } : {}),
                    ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
                },
            });
            await logChange(tx, {
                organizationId: actor.organizationId, actorId: actor.employeeId, entityType: 'ROUTINE', entityId: id,
                action: 'UPDATED',
                summary: `Updated routine "${dto.title ?? routine.title}"${dto.isActive === false ? ' (deactivated)' : dto.isActive === true && !routine.isActive ? ' (reactivated)' : ''}`,
            });
        });
        await this.dwmsSync.syncRoutine(id, actor.employeeId);
        return this.get(user, id);
    }

    async recordCompletion(user: AccessTokenPayload, id: string, dto: RecordRoutineCompletionDto) {
        const actor = await this.access.resolveActor(user);
        const routine = await this.routineOrThrow(actor, id);
        if (!this.canRecord(actor, routine)) throw new ForbiddenException('Only the responsible person, area owner or HOD can record this check');
        if (!routine.isActive) throw new BadRequestException('This routine is inactive');
        const today = this.access.today(actor);
        if (dto.scheduledDate > today) throw new BadRequestException('You cannot record a check for a future date');
        if (!isRoutineOccurrence(dateOnly(routine.startDate)!, routine.frequency, dto.scheduledDate)) {
            throw new BadRequestException('That date is not a scheduled occurrence of this routine');
        }

        try {
            await this.prisma.fiveSRoutineCompletion.create({
                data: {
                    routineId: id,
                    scheduledDate: toDbDate(dto.scheduledDate),
                    outcome: dto.outcome,
                    exception: dto.exception || null,
                    completedById: actor.employeeId,
                },
            });
        } catch (error) {
            if (isUniqueViolation(error)) throw new ConflictException('This occurrence has already been recorded');
            throw error;
        }
        await this.dwmsSync.recordRoutineOccurrence(routine, dto.scheduledDate, dto.outcome, dto.exception || null, actor.employeeId);
        if (dto.outcome === FiveSRoutineOutcome.DONE_WITH_EXCEPTION) {
            await this.dwmsSync.raiseRoutineException(routine.id, dto.scheduledDate, dto.exception || null, actor.employeeId);
        }
        return this.schedule(user, id, {});
    }

    // ---------- helpers ----------

    private canRecord(actor: FiveSActor, routine: RoutineRow): boolean {
        return routine.responsibleId === actor.employeeId || this.access.canMaintainAreaStandards(actor, routine.area);
    }

    private stateFor(date: string, today: string, frequency: FiveSRoutineFrequency, outcome: string | undefined): OccurrenceState {
        if (outcome) return outcome as OccurrenceState;
        if (date > today) return 'UPCOMING';
        if (date === today || daysBetween(date, today) <= GRACE_DAYS[frequency]) return 'DUE_TODAY';
        return 'MISSED';
    }

    private async routineOrThrow(actor: FiveSActor, id: string): Promise<RoutineRow> {
        const routine = await this.prisma.fiveSRoutine.findFirst({
            where: { id, organizationId: actor.organizationId, area: this.access.visibleAreaWhere(actor) },
            select: ROUTINE_SELECT,
        });
        if (!routine) throw new NotFoundException('Routine not found');
        return routine;
    }

    private toView(actor: FiveSActor, r: RoutineRow) {
        return {
            id: r.id,
            title: r.title,
            checkLocation: r.checkLocation,
            instructions: r.instructions,
            category: r.category,
            frequency: r.frequency,
            startDate: dateOnly(r.startDate),
            isActive: r.isActive,
            area: { id: r.area.id, name: r.area.name },
            responsible: person(r.responsible),
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
            permissions: {
                canEdit: this.access.canMaintainAreaStandards(actor, r.area),
                canRecord: r.isActive && this.canRecord(actor, r),
            },
        };
    }
}
