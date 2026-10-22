import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
    AlertType,
    FiveSActionEventType,
    FiveSActionStatus,
    FiveSRoutineFrequency,
    FiveSRoutineOutcome,
    ModuleType,
    NotificationType,
    RecurrenceUnit,
    Severity,
    TaskFrequency,
    TaskSourceModule,
    TaskStatus,
} from 'db';
import { DwmsTaskBridge, DwmsTaskSourceInput } from 'src/dwms/services/dwms-task-bridge.service';
import { DwmsTaskEvents, DwmsTaskStatusChange } from 'src/dwms/services/dwms-task-events.service';
import { isUniqueConstraintError } from 'src/dwms/utils/alertDeduplication';
import { NotificationsService } from 'src/notifications/notifications.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { addDays, fromDbDate, toDbDate } from 'src/work/work-date';
import { dateOnly } from './five-s-records';
import { routineOccurrences } from './five-s-schedule';

// 5S -> DWMS (joins 5, 9 and 11). Routines become recurring tasks for the responsible person and
// corrective-action steps become one-off tasks for each step owner, so the work shows up on the
// employee's single DWMS list. Ticking it there flows back here: a routine check is recorded and
// a step is marked done. A check done with an exception raises a DWMS abnormality.
//
// The sync methods run after the 5S change is saved and never fail it; every sync is idempotent,
// so the next save repairs anything a failure left behind.

const ROUTINE_TASK_SCHEDULE: Record<FiveSRoutineFrequency, { unit: RecurrenceUnit; frequency: TaskFrequency }> = {
    DAILY: { unit: RecurrenceUnit.DAY, frequency: TaskFrequency.DAILY },
    WEEKLY: { unit: RecurrenceUnit.WEEK, frequency: TaskFrequency.WEEKLY },
    MONTHLY: { unit: RecurrenceUnit.MONTH, frequency: TaskFrequency.MONTHLY },
};

// What a DWMS status means for the routine check. Statuses not listed (pending, in progress,
// awaiting approval) are not a result yet.
const OUTCOME_FOR_STATUS: Partial<Record<TaskStatus, FiveSRoutineOutcome>> = {
    [TaskStatus.DONE]: FiveSRoutineOutcome.DONE,
    [TaskStatus.PARTLY_DONE]: FiveSRoutineOutcome.DONE_WITH_EXCEPTION,
    [TaskStatus.LESS_THAN_50]: FiveSRoutineOutcome.DONE_WITH_EXCEPTION,
    [TaskStatus.NOT_APPLICABLE]: FiveSRoutineOutcome.NOT_DONE,
};

const STATUS_FOR_OUTCOME: Record<FiveSRoutineOutcome, TaskStatus> = {
    DONE: TaskStatus.DONE,
    DONE_WITH_EXCEPTION: TaskStatus.PARTLY_DONE,
    NOT_DONE: TaskStatus.NOT_APPLICABLE,
};

// Longest gap between two occurrences, plus room for DWMS moving one past closed office days.
const OCCURRENCE_LOOKBACK_DAYS = 40;

@Injectable()
export class FiveSDwmsSyncService implements OnModuleInit {
    private readonly logger = new Logger(FiveSDwmsSyncService.name);

    constructor(
        private prisma: PrismaService,
        private bridge: DwmsTaskBridge,
        private taskEvents: DwmsTaskEvents,
        private notifications: NotificationsService,
    ) {}

    onModuleInit() {
        this.taskEvents.onStatusChange(TaskSourceModule.FIVE_S_ROUTINE, (change) => this.recordRoutineFromDwms(change));
        this.taskEvents.onStatusChange(TaskSourceModule.FIVE_S_STEP, (change) => this.completeStepFromDwms(change));
    }

    // ---------- 5S -> DWMS ----------

    // Join 5: an active routine with a responsible person is a recurring task on their list; an
    // inactive or unassigned one has its task deactivated (history kept).
    syncRoutine(routineId: string, actorId: string) {
        return this.safely(`routine ${routineId}`, async () => {
            const routine = await this.prisma.fiveSRoutine.findUnique({
                where: { id: routineId },
                include: { area: { select: { name: true, departmentId: true, isActive: true } } },
            });
            const key = { sourceModule: TaskSourceModule.FIVE_S_ROUTINE, sourceId: routineId };
            if (!routine || !routine.isActive || !routine.area.isActive || !routine.responsibleId) {
                await this.bridge.deactivateFromSource(key);
                return;
            }

            const schedule = ROUTINE_TASK_SCHEDULE[routine.frequency];
            const description = [`Where: ${routine.checkLocation}`, routine.instructions].filter(Boolean).join('\n');
            await this.bridge.upsertFromSource({
                ...key,
                sourceParentId: routine.id,
                sourceRef: `5S · ${routine.area.name} · ${routine.title}`,
                ownerId: routine.responsibleId,
                title: `5S check: ${routine.title}`,
                description,
                departmentId: routine.area.departmentId,
                assignedById: actorId === routine.responsibleId ? null : actorId,
                frequency: schedule.frequency,
                // Same anchor as the 5S schedule: weekly on the start date's weekday, monthly on its
                // day of month (last day in shorter months).
                recurrenceUnit: schedule.unit,
                recurrenceInterval: 1,
                recurrenceWeekdays: schedule.unit === RecurrenceUnit.WEEK ? [routine.startDate.getUTCDay()] : [],
                recurrenceDayOfMonth: null,
                recurrenceStartsOn: routine.startDate,
            });
        });
    }

    // A check recorded on the 5S page closes the matching DWMS instance with the same result.
    recordRoutineOccurrence(
        routine: { id: string; startDate: Date; frequency: FiveSRoutineFrequency },
        scheduledDate: string,
        outcome: FiveSRoutineOutcome,
        exception: string | null,
        actorId: string,
    ) {
        return this.safely(`routine ${routine.id}`, async () => {
            const next = routineOccurrences(
                dateOnly(routine.startDate)!,
                routine.frequency,
                addDays(scheduledDate, 1),
                addDays(scheduledDate, OCCURRENCE_LOOKBACK_DAYS),
            )[0];
            await this.bridge.recordOccurrenceFromSource(
                { sourceModule: TaskSourceModule.FIVE_S_ROUTINE, sourceId: routine.id },
                {
                    occurrenceDate: toDbDate(scheduledDate),
                    nextOccurrenceDate: next ? toDbDate(next) : null,
                    status: STATUS_FOR_OUTCOME[outcome],
                    actorId,
                    note: exception,
                },
            );
        });
    }

    // Join 9: each open step with an owner is a one-off task due on its own due date, or the
    // action's when it has none. Steps without an owner or any due date get no task; finished
    // steps are closed; removed steps are deactivated.
    syncActionSteps(actionId: string, actorId: string) {
        return this.safely(`action ${actionId}`, async () => {
            const action = await this.prisma.fiveSAction.findUnique({
                where: { id: actionId },
                include: {
                    area: { select: { name: true, departmentId: true } },
                    correctiveActions: { orderBy: { sortOrder: 'asc' } },
                },
            });
            const parent = { sourceModule: TaskSourceModule.FIVE_S_STEP, sourceParentId: actionId };
            if (!action) {
                await this.bridge.deactivateFromSource(parent);
                return;
            }

            const inputs: DwmsTaskSourceInput[] = [];
            const closedIds: string[] = [];
            for (const step of action.correctiveActions) {
                if (step.completedAt) {
                    closedIds.push(step.id);
                    continue;
                }
                const dueDate = step.dueDate ?? action.dueDate;
                if (!step.ownerId || !dueDate || action.status === FiveSActionStatus.VERIFIED) continue;
                inputs.push({
                    sourceModule: TaskSourceModule.FIVE_S_STEP,
                    sourceId: step.id,
                    sourceParentId: action.id,
                    sourceRef: `5S · ${action.reference} · step ${step.sortOrder}`,
                    ownerId: step.ownerId,
                    title: `5S action: ${step.description}`,
                    description: `${action.area.name}: ${action.finding}`,
                    departmentId: action.area.departmentId,
                    assignedById: actorId === step.ownerId ? null : actorId,
                    frequency: TaskFrequency.PLANNED,
                    dueDate,
                });
            }
            await this.bridge.syncParentFromSource(parent, inputs, closedIds);
        });
    }

    // One-off catch-up for 5S data saved before joins 5 and 9: puts every active routine and open
    // action's steps on DWMS. Each sync is idempotent, so running it twice changes nothing.
    async backfill() {
        const organizations = await this.prisma.organization.findMany({
            where: { status: 'ACTIVE', modules: { hasEvery: [ModuleType.FIVE_S, ModuleType.DWMS] } },
            select: { id: true },
        });
        const organizationId = { in: organizations.map((o) => o.id) };
        const routines = await this.prisma.fiveSRoutine.findMany({
            where: { organizationId, isActive: true, responsibleId: { not: null } },
            select: { id: true, createdById: true },
        });
        for (const routine of routines) await this.syncRoutine(routine.id, routine.createdById);

        const actions = await this.prisma.fiveSAction.findMany({
            where: { organizationId, status: { not: FiveSActionStatus.VERIFIED } },
            select: { id: true, createdById: true },
        });
        for (const action of actions) await this.syncActionSteps(action.id, action.createdById);
        return { routines: routines.length, actions: actions.length };
    }

    // A step ticked done was unticked on the 5S page: put its task back on the owner's list.
    reopenStep(stepId: string) {
        return this.safely(`step ${stepId}`, () =>
            this.bridge.reopenFromSource({ sourceModule: TaskSourceModule.FIVE_S_STEP, sourceId: stepId }),
        );
    }

    // Join 11: a check done with an exception is an abnormality for the area owner to follow up (and
    // raise a Kaizen or SGA from, join 10). There is one abnormality per routine: each later exception
    // is raised again on it, with the exception as a comment, the way a repeat raise works in DWMS.
    // When the area owner recorded it themselves, or the area has no owner, it goes to the
    // recorder's manager; with neither, nothing is raised.
    raiseRoutineException(routineId: string, scheduledDate: string, exception: string | null, actorId: string) {
        return this.safely(`routine ${routineId} exception`, async () => {
            const routine = await this.prisma.fiveSRoutine.findUnique({
                where: { id: routineId },
                select: {
                    id: true,
                    title: true,
                    checkLocation: true,
                    organizationId: true,
                    area: { select: { name: true, ownerId: true, departmentId: true } },
                },
            });
            if (!routine) return;
            const organization = await this.prisma.organization.findUnique({
                where: { id: routine.organizationId },
                select: { modules: true },
            });
            if (!organization?.modules.includes(ModuleType.DWMS)) return;

            let responsibleId = routine.area.ownerId;
            if (!responsibleId || responsibleId === actorId) {
                const recorder = await this.prisma.employee.findUnique({ where: { id: actorId }, select: { reportingManagerId: true } });
                responsibleId = recorder?.reportingManagerId ?? null;
            }
            if (!responsibleId) return;

            const comment = `Check of ${scheduledDate}: ${exception ?? 'done with an exception'}`;
            const repeat = {
                raiseCount: { increment: 1 },
                againstUserId: responsibleId,
                occurrences: { create: { raisedById: actorId } },
                comments: { create: { authorId: actorId, comment } },
            };
            const deduplicationKey = routineExceptionAlertKey(routine.id);
            const existing = await this.prisma.alert.findUnique({ where: { deduplicationKey }, select: { id: true } });
            let alertId = existing?.id;
            if (alertId) {
                await this.prisma.alert.update({ where: { id: alertId }, data: repeat });
            } else {
                try {
                    alertId = (
                        await this.prisma.alert.create({
                            data: {
                                type: AlertType.PROCESS_DEVIATION,
                                title: `5S routine exception: ${routine.title}`,
                                description: `${routine.area.name} · ${routine.checkLocation}: the 5S check "${routine.title}" was done with an exception. Repeat exceptions are raised again here.`,
                                severity: Severity.MEDIUM,
                                isAbnormality: true,
                                organizationId: routine.organizationId,
                                departmentId: routine.area.departmentId,
                                raisedById: actorId,
                                againstUserId: responsibleId,
                                deduplicationKey,
                                occurrences: { create: { raisedById: actorId } },
                                comments: { create: { authorId: actorId, comment } },
                            },
                            select: { id: true },
                        })
                    ).id;
                } catch (error) {
                    // Raised at the same moment from the 5S page and DWMS: count it as a repeat.
                    if (!isUniqueConstraintError(error)) throw error;
                    alertId = (await this.prisma.alert.update({ where: { deduplicationKey }, data: repeat, select: { id: true } })).id;
                }
            }

            await this.notifications.create({
                employeeId: responsibleId,
                type: NotificationType.ALERT,
                module: 'DWMS',
                title: 'Abnormality Raised Against You',
                message: `Please acknowledge: 5S check "${routine.title}" in ${routine.area.name} was done with an exception.`,
                actionUrl: `/dwms/alerts/${alertId}`,
            });
        });
    }

    // ---------- DWMS -> 5S ----------

    // The responsible person ticked the routine in DWMS: record the check for the 5S occurrence the
    // instance belongs to (DWMS may have moved it to a later open day). The latest DWMS result
    // wins, so partly done followed by done ends as done.
    async recordRoutineFromDwms(change: DwmsTaskStatusChange) {
        const outcome = OUTCOME_FOR_STATUS[change.toStatus];
        if (!outcome) return;
        const routine = await this.prisma.fiveSRoutine.findUnique({
            where: { id: change.sourceId },
            select: { id: true, startDate: true, frequency: true, isActive: true },
        });
        if (!routine?.isActive) return;

        const instanceDate = fromDbDate(change.scheduledFor);
        const occurrence = routineOccurrences(
            dateOnly(routine.startDate)!,
            routine.frequency,
            addDays(instanceDate, -OCCURRENCE_LOOKBACK_DAYS),
            instanceDate,
        ).at(-1);
        if (!occurrence) return;

        const exception = outcome === FiveSRoutineOutcome.DONE ? null : (change.note ?? 'Marked as not fully done in DWMS');
        const actorId = change.actorId ?? change.ownerId;
        const where = { routineId_scheduledDate: { routineId: routine.id, scheduledDate: toDbDate(occurrence) } };
        const previous = await this.prisma.fiveSRoutineCompletion.findUnique({ where, select: { outcome: true } });
        const data = { outcome, exception, completedById: actorId, completedAt: new Date() };
        await this.prisma.fiveSRoutineCompletion.upsert({
            where,
            create: { routineId: routine.id, scheduledDate: toDbDate(occurrence), ...data },
            update: data,
        });
        // Only a change into an exception is a new abnormality, not the same result recorded again.
        if (outcome === FiveSRoutineOutcome.DONE_WITH_EXCEPTION && previous?.outcome !== outcome) {
            await this.raiseRoutineException(routine.id, occurrence, exception, actorId);
        }
    }

    // The step owner finished the task in DWMS: tick the step off, while the plan is still open.
    async completeStepFromDwms(change: DwmsTaskStatusChange) {
        if (change.toStatus !== TaskStatus.DONE) return;
        const step = await this.prisma.fiveSCorrectiveAction.findUnique({
            where: { id: change.sourceId },
            select: { id: true, actionId: true, description: true, completedAt: true, action: { select: { status: true } } },
        });
        if (!step || step.completedAt || step.action.status !== FiveSActionStatus.OPEN) return;

        const actorId = change.actorId ?? change.ownerId;
        await this.prisma.$transaction([
            this.prisma.fiveSCorrectiveAction.update({
                where: { id: step.id },
                data: { completedAt: new Date(), completedById: actorId },
            }),
            this.prisma.fiveSActionEvent.create({
                data: {
                    actionId: step.actionId,
                    actorId,
                    type: FiveSActionEventType.UPDATED,
                    note: `Completed corrective action in DWMS: ${step.description}`,
                },
            }),
        ]);
    }

    private async safely(label: string, sync: () => Promise<unknown>) {
        try {
            await sync();
        } catch (error) {
            this.logger.error(`DWMS task sync failed for 5S ${label}`, error instanceof Error ? error.stack : error);
        }
    }
}

export function routineExceptionAlertKey(routineId: string) {
    return `five-s:routine-exception:${routineId}`;
}
