import { Injectable } from '@nestjs/common';
import {
  Prisma,
  Priority,
  RecurrenceUnit,
  Task,
  TaskFrequency,
  TaskSourceModule,
  TaskStatus,
} from 'db';
import { PrismaService } from 'src/prisma/prisma.service';
import { DwmsService } from '../dwms.service';
import {
  getCurrentUtcDateInTimeZone,
  parseTimeZone,
  toUtcDateOnly,
} from '../utils/taskSchedule';

// Identifies the DWMS task a source record owns. sourceId is the per-task key and is unique per
// sourceModule (compound for fan-out, e.g. "<kaizenId>:<employeeId>"); sourceParentId is the
// owning Kaizen / Sga / FiveSRoutine / FiveSAction, so all of its tasks can be handled together.
export interface DwmsTaskSourceKey {
  sourceModule: TaskSourceModule;
  sourceId: string;
}

export interface DwmsTaskSourceParentKey {
  sourceModule: TaskSourceModule;
  sourceParentId: string;
}

export type DwmsTaskSourceTarget = DwmsTaskSourceKey | DwmsTaskSourceParentKey;

export interface DwmsTaskSourceInput extends DwmsTaskSourceKey {
  sourceParentId: string;
  // Display label shown on the task, e.g. "SGA · Reduce changeover time · action 3"
  sourceRef: string;
  ownerId: string;
  title: string;
  description?: string | null;
  departmentId?: string | null;
  assignedById?: string | null;
  priority?: Priority;
  frequency: TaskFrequency;
  // One-off (PLANNED) tasks
  dueDate?: Date | null;
  // Recurring tasks (meeting plans, 5S routines); same fields DWMS uses for its own recurrence
  recurrenceUnit?: RecurrenceUnit | null;
  recurrenceInterval?: number | null;
  recurrenceWeekdays?: number[];
  recurrenceDayOfMonth?: number | null;
  recurrenceStartsOn?: Date | null;
}

// Instance events the bridge writes, so the owner's history shows why an item changed
export const SOURCE_CLOSED_EVENT = 'SOURCE_CLOSED';
export const SOURCE_REOPENED_EVENT = 'SOURCE_REOPENED';
export const SOURCE_DEACTIVATED_EVENT = 'SOURCE_DEACTIVATED';
export const SOURCE_RECORDED_EVENT = 'SOURCE_RECORDED';
const SOURCE_EVENT_TYPES = [
  SOURCE_CLOSED_EVENT,
  SOURCE_REOPENED_EVENT,
  SOURCE_DEACTIVATED_EVENT,
  SOURCE_RECORDED_EVENT,
];

const COMPLETED_STATUSES: TaskStatus[] = [TaskStatus.DONE, TaskStatus.NOT_APPLICABLE];

const PROGRESS_FOR_STATUS: Partial<Record<TaskStatus, number>> = {
  [TaskStatus.DONE]: 100,
  [TaskStatus.PARTLY_DONE]: 50,
  [TaskStatus.LESS_THAN_50]: 10,
};

const OPEN_INSTANCE: Prisma.TaskInstanceWhereInput = {
  status: { notIn: [TaskStatus.DONE, TaskStatus.NOT_APPLICABLE] },
};

// Nobody has worked on it yet, so it can be deleted and regenerated without losing anything
const UNTOUCHED_INSTANCE: Prisma.TaskInstanceWhereInput = {
  status: TaskStatus.PENDING,
  completionPercent: 0,
  completedAt: null,
  comments: { none: {} },
  events: { none: { type: { notIn: SOURCE_EVENT_TYPES } } },
};

const taskWithOrg = {
  owner: { select: { organization: { select: { timeZone: true } } } },
} satisfies Prisma.TaskInclude;

type TaskWithOrg = Prisma.TaskGetPayload<{ include: typeof taskWithOrg }>;

// Single entry point other modules (Kaizen, SGA, 5S) use to put work on an employee's DWMS task
// list. The source module owns the truth: it calls the bridge after saving its own record, and
// DWMS is only where the work is done. Changes made in DWMS flow back through DwmsTaskEvents.
@Injectable()
export class DwmsTaskBridge {
  constructor(
    private prisma: PrismaService,
    private dwms: DwmsService,
  ) { }

  // Create the task for this source key, or update it in place (owner, title, due date,
  // frequency/recurrence) if it already exists. Re-running a sync never creates duplicates, and
  // re-activates a task that was deactivated earlier. A task the source already closed stays
  // closed; use reopenFromSource for that. Returns null when the organization doesn't use DWMS.
  async upsertFromSource(input: DwmsTaskSourceInput): Promise<Task | null> {
    const owner = await this.prisma.employee.findUnique({
      where: { id: input.ownerId },
      select: {
        firstName: true,
        lastName: true,
        departmentId: true,
        organizationId: true,
        organization: { select: { modules: true, status: true } },
      },
    });
    if (!owner) throw new Error(`DWMS task owner ${input.ownerId} not found`);
    if (owner.organization.status !== 'ACTIVE' || !owner.organization.modules.includes('DWMS')) {
      return null;
    }

    const assignedBy = input.assignedById
      ? await this.prisma.employee.findUnique({
        where: { id: input.assignedById },
        select: { firstName: true, lastName: true },
      })
      : null;

    const isPlanned = input.frequency === TaskFrequency.PLANNED;
    const data = {
      sourceParentId: input.sourceParentId,
      sourceRef: input.sourceRef,
      title: input.title,
      description: input.description ?? null,
      ownerId: input.ownerId,
      ownerName: `${owner.firstName} ${owner.lastName}`.trim(),
      assignedById: input.assignedById ?? null,
      assignedByName: assignedBy ? `${assignedBy.firstName} ${assignedBy.lastName}`.trim() : null,
      departmentId: input.departmentId ?? owner.departmentId ?? null,
      priority: input.priority ?? Priority.MEDIUM,
      frequency: input.frequency,
      dueDate: isPlanned && input.dueDate ? toUtcDateOnly(input.dueDate) : null,
      recurrenceUnit: isPlanned ? null : (input.recurrenceUnit ?? null),
      recurrenceInterval: isPlanned ? null : (input.recurrenceInterval ?? null),
      recurrenceWeekdays: isPlanned ? [] : (input.recurrenceWeekdays ?? []),
      recurrenceDayOfMonth: isPlanned ? null : (input.recurrenceDayOfMonth ?? null),
      recurrenceStartsOn:
        isPlanned || !input.recurrenceStartsOn ? null : toUtcDateOnly(input.recurrenceStartsOn),
    };

    const key = { sourceModule: input.sourceModule, sourceId: input.sourceId };
    let existing = await this.prisma.task.findUnique({
      where: { sourceModule_sourceId: key },
      include: taskWithOrg,
    });

    if (!existing) {
      try {
        const created = await this.prisma.task.create({
          data: { ...key, ...data },
        });
        await this.dwms.refreshTaskInstances(created.id, owner.organizationId);
        return created;
      } catch (error: any) {
        // A concurrent sync created it first; fall through and update that one instead
        if (error?.code !== 'P2002') throw error;
        existing = await this.prisma.task.findUniqueOrThrow({
          where: { sourceModule_sourceId: key },
          include: taskWithOrg,
        });
      }
    }

    const closed = existing.status === TaskStatus.DONE;
    const scheduleChanged =
      !existing.isActive ||
      existing.ownerId !== data.ownerId ||
      existing.title !== data.title ||
      existing.description !== data.description ||
      existing.frequency !== data.frequency ||
      existing.dueDate?.getTime() !== data.dueDate?.getTime() ||
      existing.recurrenceUnit !== data.recurrenceUnit ||
      existing.recurrenceInterval !== data.recurrenceInterval ||
      existing.recurrenceDayOfMonth !== data.recurrenceDayOfMonth ||
      existing.recurrenceStartsOn?.getTime() !== data.recurrenceStartsOn?.getTime() ||
      existing.recurrenceWeekdays.join(',') !== data.recurrenceWeekdays.join(',');

    const updated = await this.prisma.task.update({
      where: { id: existing.id },
      data: { ...data, ...(!closed && { isActive: true }) },
    });

    if (!closed && scheduleChanged) {
      // Drop the instances nobody has started so they're regenerated with the new owner/dates
      await this.deleteUntouchedInstances(existing, isPlanned ? null : this.today(existing));
      await this.dwms.refreshTaskInstances(updated.id, owner.organizationId);
    }
    return updated;
  }

  // Upsert every task a parent currently owns and deactivate the parent's other tasks (items
  // removed from the source, a team member taken off the kaizen). Items already done in the source
  // go in closedSourceIds: they're closed if they have a task and never get a new one.
  async syncParentFromSource(
    parent: DwmsTaskSourceParentKey,
    inputs: DwmsTaskSourceInput[],
    closedSourceIds: string[] = [],
  ): Promise<void> {
    for (const input of inputs) await this.upsertFromSource(input);
    for (const sourceId of closedSourceIds) {
      await this.closeFromSource({ sourceModule: parent.sourceModule, sourceId });
    }
    await this.deactivateFromSource(parent, [
      ...inputs.map((input) => input.sourceId),
      ...closedSourceIds,
    ]);
  }

  // The source item was completed in its own module: mark the task (and its open instance) done
  // so it leaves the owner's list. Recurring tasks also stop generating. No-op if nothing matches.
  async closeFromSource(target: DwmsTaskSourceTarget, completedAt = new Date()): Promise<void> {
    const tasks = await this.prisma.task.findMany({
      where: { ...this.whereFor(target), status: { not: TaskStatus.DONE } },
      include: taskWithOrg,
    });

    for (const task of tasks) {
      const recurring = task.frequency !== TaskFrequency.PLANNED;
      if (recurring) await this.deleteUntouchedInstances(task, this.tomorrow(task));

      const open = await this.prisma.taskInstance.findMany({
        where: { taskId: task.id, ...OPEN_INSTANCE },
        select: { id: true, status: true },
      });
      await this.prisma.$transaction([
        this.prisma.task.update({
          where: { id: task.id },
          data: {
            status: TaskStatus.DONE,
            completionPercent: 100,
            ...(recurring && { isActive: false }),
          },
        }),
        this.prisma.taskInstance.updateMany({
          where: { id: { in: open.map((i) => i.id) } },
          data: { status: TaskStatus.DONE, completionPercent: 100, completedAt },
        }),
        this.prisma.taskInstanceEvent.createMany({
          data: open.map((i) => ({
            taskInstanceId: i.id,
            type: SOURCE_CLOSED_EVENT,
            fromStatus: i.status,
            toStatus: TaskStatus.DONE,
            note: `Completed in ${task.sourceRef ?? 'the source module'}`,
          })),
        }),
      ]);
    }
  }

  // The source took back a completion (e.g. a kaizen returned for rework, an SGA action moved off
  // DONE): reopen what closeFromSource closed and put it back on the owner's list.
  async reopenFromSource(target: DwmsTaskSourceTarget): Promise<void> {
    const tasks = await this.prisma.task.findMany({
      where: { ...this.whereFor(target), status: TaskStatus.DONE },
      include: { owner: { select: { organizationId: true } } },
    });

    for (const task of tasks) {
      const closedBySource = await this.prisma.taskInstance.findMany({
        where: {
          taskId: task.id,
          status: TaskStatus.DONE,
          events: { some: { type: SOURCE_CLOSED_EVENT } },
        },
        select: { id: true },
      });
      await this.prisma.$transaction([
        this.prisma.task.update({
          where: { id: task.id },
          data: { status: TaskStatus.PENDING, completionPercent: 0, isActive: true },
        }),
        this.prisma.taskInstance.updateMany({
          where: { id: { in: closedBySource.map((i) => i.id) } },
          data: { status: TaskStatus.PENDING, completionPercent: 0, completedAt: null },
        }),
        this.prisma.taskInstanceEvent.createMany({
          data: closedBySource.map((i) => ({
            taskInstanceId: i.id,
            type: SOURCE_REOPENED_EVENT,
            fromStatus: TaskStatus.DONE,
            toStatus: TaskStatus.PENDING,
            note: `Reopened in ${task.sourceRef ?? 'the source module'}`,
          })),
        }),
      ]);
      await this.dwms.refreshTaskInstances(task.id, task.owner.organizationId);
    }
  }

  // A recurring source recorded one occurrence itself (e.g. a 5S routine check entered on the 5S
  // page): set the matching instance to the same outcome so it isn't left open in DWMS. DWMS may
  // have moved the occurrence to the next open office day, so the instance is the first one on or
  // after occurrenceDate and before nextOccurrenceDate. No-op if there is none or it's already
  // completed. Returns whether an instance was updated.
  async recordOccurrenceFromSource(
    key: DwmsTaskSourceKey,
    occurrence: {
      occurrenceDate: Date;
      nextOccurrenceDate: Date | null;
      status: TaskStatus;
      actorId?: string | null;
      note?: string | null;
    },
  ): Promise<boolean> {
    const task = await this.prisma.task.findUnique({
      where: { sourceModule_sourceId: key },
      select: { id: true, sourceRef: true },
    });
    if (!task) return false;

    const from = toUtcDateOnly(occurrence.occurrenceDate);
    const instance = await this.prisma.taskInstance.findFirst({
      where: {
        taskId: task.id,
        scheduledFor: {
          gte: from,
          ...(occurrence.nextOccurrenceDate && { lt: toUtcDateOnly(occurrence.nextOccurrenceDate) }),
        },
      },
      orderBy: { scheduledFor: 'asc' },
      select: { id: true, status: true },
    });
    if (!instance || COMPLETED_STATUSES.includes(instance.status)) return false;

    const completed = COMPLETED_STATUSES.includes(occurrence.status);
    await this.prisma.$transaction([
      this.prisma.taskInstance.update({
        where: { id: instance.id },
        data: {
          status: occurrence.status,
          completionPercent: PROGRESS_FOR_STATUS[occurrence.status] ?? 0,
          completedAt: completed ? new Date() : null,
        },
      }),
      this.prisma.taskInstanceEvent.create({
        data: {
          taskInstanceId: instance.id,
          actorId: occurrence.actorId ?? null,
          type: SOURCE_RECORDED_EVENT,
          fromStatus: instance.status,
          toStatus: occurrence.status,
          note: occurrence.note?.trim() || `Recorded in ${task.sourceRef ?? 'the source module'}`,
        },
      }),
    ]);
    return true;
  }

  // The source item was cancelled, deleted or made inactive: set Task.isActive = false and keep
  // its history. Pass sourceParentId instead of sourceId to deactivate every task of a parent
  // (e.g. all team-member tasks of a rejected Kaizen), optionally sparing exceptSourceIds.
  // Instances nobody started from today on are removed; anything else still open is marked
  // NOT_APPLICABLE so it leaves the owner's list. No-op if nothing matches.
  async deactivateFromSource(
    target: DwmsTaskSourceTarget,
    exceptSourceIds: string[] = [],
  ): Promise<void> {
    const tasks = await this.prisma.task.findMany({
      where: {
        ...this.whereFor(target),
        isActive: true,
        ...(exceptSourceIds.length && { sourceId: { notIn: exceptSourceIds } }),
      },
      include: taskWithOrg,
    });

    for (const task of tasks) {
      await this.deleteUntouchedInstances(task, this.today(task));
      const open = await this.prisma.taskInstance.findMany({
        where: { taskId: task.id, ...OPEN_INSTANCE },
        select: { id: true, status: true },
      });
      await this.prisma.$transaction([
        this.prisma.task.update({ where: { id: task.id }, data: { isActive: false } }),
        this.prisma.taskInstance.updateMany({
          where: { id: { in: open.map((i) => i.id) } },
          data: { status: TaskStatus.NOT_APPLICABLE },
        }),
        this.prisma.taskInstanceEvent.createMany({
          data: open.map((i) => ({
            taskInstanceId: i.id,
            type: SOURCE_DEACTIVATED_EVENT,
            fromStatus: i.status,
            toStatus: TaskStatus.NOT_APPLICABLE,
            note: `No longer needed in ${task.sourceRef ?? 'the source module'}`,
          })),
        }),
      ]);
    }
  }

  private whereFor(target: DwmsTaskSourceTarget): Prisma.TaskWhereInput {
    return 'sourceId' in target
      ? { sourceModule: target.sourceModule, sourceId: target.sourceId }
      : { sourceModule: target.sourceModule, sourceParentId: target.sourceParentId };
  }

  // from = null deletes untouched instances on any date (a planned task has only the one)
  private deleteUntouchedInstances(task: Task, from: Date | null) {
    return this.prisma.taskInstance.deleteMany({
      where: {
        taskId: task.id,
        ...UNTOUCHED_INSTANCE,
        ...(from && { scheduledFor: { gte: from } }),
      },
    });
  }

  private today(task: TaskWithOrg) {
    const timeZone = parseTimeZone(task.owner.organization.timeZone) ?? 'UTC';
    return getCurrentUtcDateInTimeZone(timeZone);
  }

  private tomorrow(task: TaskWithOrg) {
    const today = this.today(task);
    return new Date(today.getTime() + 86_400_000);
  }
}
