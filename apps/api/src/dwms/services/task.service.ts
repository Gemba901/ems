import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  AlertStatus,
  AlertType,
  NotificationType,
  Priority,
  Severity,
  TaskFrequency,
  TaskStatus,
} from 'db';
import {
  CreateAssignedTaskDto,
  UpdateProgressDto,
  CompleteAssignedTaskDto,
  CreateTaskInstanceCommentDto,
  TaskApprovalActionDto,
} from '../dto/dwms.dto';
import { getKenyaPublicHolidays } from '../../calendar/kenya-holidays';
import {
  endOfDayInTimeZone,
  isBeforeUtcDate,
  parseDateOnly,
  parseTaskFrequency,
  parseTimeZone,
  toIsoDate,
  toUtcDateOnly,
} from '../utils/taskSchedule';
import {
  APPROVAL_PENDING_STATUS,
  completedStatuses,
  DwmsBaseService,
  nonOverdueStatuses,
  nonOverdueStatusValues,
  UserPayload,
} from './base.service';

export const TASK_INSTANCE_GENERATION_DAYS = 31;

const recurringTaskFrequencies = new Set<TaskFrequency>([
  TaskFrequency.DAILY,
  TaskFrequency.WEEKLY,
  TaskFrequency.MONTHLY,
  TaskFrequency.QUARTERLY,
  TaskFrequency.YEARLY,
]);

type OfficeScheduledTask = {
  frequency: TaskFrequency;
  dueDate?: Date | null;
  createdAt?: Date;
  ownerId?: string | null;
  owner?: { organizationId?: string | null } | null;
};

function isRecurringTaskFrequency(frequency: TaskFrequency) {
  return recurringTaskFrequencies.has(frequency);
}

function isPlannedTaskFrequency(frequency: TaskFrequency) {
  return frequency === TaskFrequency.PLANNED;
}

function getScheduledForTaskDate(
  task: { frequency: TaskFrequency; dueDate?: Date | null },
  referenceDate: Date,
): Date {
  if (isPlannedTaskFrequency(task.frequency) && task.dueDate) {
    return toUtcDateOnly(task.dueDate);
  }

  return referenceDate;
}

function getUtcDayDifference(from: Date, to: Date) {
  const start = toUtcDateOnly(from).getTime();
  const end = toUtcDateOnly(to).getTime();
  return Math.floor((end - start) / 86_400_000);
}

function getUtcMonthDifference(from: Date, to: Date) {
  return (
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    (to.getUTCMonth() - from.getUTCMonth())
  );
}

function isSameUtcDayOfMonth(anchor: Date, value: Date) {
  return anchor.getUTCDate() === value.getUTCDate();
}

function isScheduledOccurrenceDate(
  task: { frequency: TaskFrequency; createdAt: Date; dueDate?: Date | null },
  scheduledFor: Date,
): boolean {
  const occurrenceDate = toUtcDateOnly(scheduledFor);

  if (isPlannedTaskFrequency(task.frequency)) {
    return (
      !!task.dueDate &&
      toUtcDateOnly(task.dueDate).getTime() === occurrenceDate.getTime()
    );
  }

  const anchor = toUtcDateOnly(task.dueDate ?? task.createdAt);
  if (occurrenceDate.getTime() < anchor.getTime()) {
    return false;
  }

  const dayDiff = getUtcDayDifference(anchor, occurrenceDate);
  const monthDiff = getUtcMonthDifference(anchor, occurrenceDate);

  switch (task.frequency) {
    case TaskFrequency.DAILY:
      return true;
    case TaskFrequency.WEEKLY:
      return dayDiff % 7 === 0;
    case TaskFrequency.MONTHLY:
      return monthDiff >= 0 && isSameUtcDayOfMonth(anchor, occurrenceDate);
    case TaskFrequency.QUARTERLY:
      return (
        monthDiff >= 0 &&
        monthDiff % 3 === 0 &&
        isSameUtcDayOfMonth(anchor, occurrenceDate)
      );
    case TaskFrequency.YEARLY:
      return (
        anchor.getUTCMonth() === occurrenceDate.getUTCMonth() &&
        anchor.getUTCDate() === occurrenceDate.getUTCDate()
      );
    default:
      return false;
  }
}

export abstract class DwmsTaskService extends DwmsBaseService {
  private getHolidayName(dateKey: string) {
    return getKenyaPublicHolidays(Number(dateKey.slice(0, 4))).find(
      (h) => h.date === dateKey,
    )?.name;
  }

  private async getWorkingDaySet(organizationId: string) {
    const leaveSettingsDelegate = this.prisma.leaveSettings as unknown as {
      findUnique(args: {
        where: { organizationId: string };
        select: { workingDays: true };
      }): Promise<{ workingDays: number[] } | null>;
    };
    const settings = await leaveSettingsDelegate.findUnique({
      where: { organizationId },
      select: { workingDays: true },
    });
    const configuredWorkingDays = settings?.workingDays ?? [];
    return new Set(
      configuredWorkingDays.length > 0
        ? configuredWorkingDays
        : [1, 2, 3, 4, 5],
    );
  }

  private async isOfficeOpenDate(organizationId: string, date: Date) {
    const dateOnly = toIsoDate(toUtcDateOnly(date));
    if (this.getHolidayName(dateOnly)) return false;
    const workingDays = await this.getWorkingDaySet(organizationId);
    return workingDays.has(date.getUTCDay());
  }

  private async assertDueDateIsOfficeOpen(
    organizationId: string,
    dueDateKey: string,
  ) {
    const holidayName = this.getHolidayName(dueDateKey);
    if (holidayName) {
      throw new BadRequestException(
        `Due date cannot be on a public holiday (${holidayName})`,
      );
    }

    const workingDays = await this.getWorkingDaySet(organizationId);
    const selectedDay = new Date(`${dueDateKey}T00:00:00`).getDay();
    if (!workingDays.has(selectedDay)) {
      throw new BadRequestException('Due date cannot be on a non-working day');
    }
  }

  private async getLastOfficeOpenDateOfWeek(
    organizationId: string,
    date: Date,
  ) {
    const weekStart = toUtcDateOnly(date);
    const mondayOffset = (weekStart.getUTCDay() + 6) % 7;
    weekStart.setUTCDate(weekStart.getUTCDate() - mondayOffset);

    for (let offset = 6; offset >= 0; offset -= 1) {
      const candidate = new Date(weekStart);
      candidate.setUTCDate(weekStart.getUTCDate() + offset);
      if (await this.isOfficeOpenDate(organizationId, candidate)) {
        return toUtcDateOnly(candidate);
      }
    }

    return null;
  }

  private async getLastOfficeOpenDateOfMonth(
    organizationId: string,
    date: Date,
  ) {
    const candidate = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
    );

    while (candidate.getUTCMonth() === date.getUTCMonth()) {
      if (await this.isOfficeOpenDate(organizationId, candidate)) {
        return toUtcDateOnly(candidate);
      }
      candidate.setUTCDate(candidate.getUTCDate() - 1);
    }

    return null;
  }

  private async getOfficeScheduledForTaskDate(
    task: OfficeScheduledTask,
    referenceDate: Date,
    organizationId: string,
  ) {
    const date = toUtcDateOnly(referenceDate);

    switch (task.frequency) {
      case TaskFrequency.DAILY:
        return (await this.isOfficeOpenDate(organizationId, date))
          ? date
          : null;
      case TaskFrequency.WEEKLY: {
        const lastOpenDate = await this.getLastOfficeOpenDateOfWeek(
          organizationId,
          date,
        );
        return lastOpenDate?.getTime() === date.getTime() ? date : null;
      }
      case TaskFrequency.MONTHLY: {
        const lastOpenDate = await this.getLastOfficeOpenDateOfMonth(
          organizationId,
          date,
        );
        return lastOpenDate?.getTime() === date.getTime() ? date : null;
      }
      default:
        if (!task.createdAt) return null;
        if (
          !isScheduledOccurrenceDate(
            {
              frequency: task.frequency,
              createdAt: task.createdAt,
              dueDate: task.dueDate,
            },
            date,
          )
        ) {
          return null;
        }
        return getScheduledForTaskDate(task, date);
    }
  }

  private async getTaskOrganizationId(task: OfficeScheduledTask) {
    if (task.owner?.organizationId) return task.owner.organizationId;
    if (!task.ownerId) return null;
    const owner = await this.prisma.employee.findUnique({
      where: { id: task.ownerId },
      select: { organizationId: true },
    });
    return owner?.organizationId ?? null;
  }
  private async getNextOfficeScheduledForTaskDate(
    task: OfficeScheduledTask,
    referenceDate: Date,
    organizationId: string,
  ) {
    const cursor = toUtcDateOnly(referenceDate);

    for (let offset = 1; offset <= 370; offset += 1) {
      const candidate = new Date(cursor);
      candidate.setUTCDate(cursor.getUTCDate() + offset);
      const scheduledFor = await this.getOfficeScheduledForTaskDate(
        task,
        candidate,
        organizationId,
      );
      if (scheduledFor) return scheduledFor;
    }

    return null;
  }
  // Check and raise alerts for overdue task instances
  async checkAndRaiseDelayedTaskAlerts(organizationId: string) {
    const now = new Date();

    const delayedInstances = await this.prisma.taskInstance.findMany({
      where: {
        owner: { organizationId },
        dueAt: { lt: now },
        status: { notIn: nonOverdueStatusValues },
      },
      include: {
        owner: true,
        task: true,
        alerts: {
          where: { type: AlertType.DELAY },
          select: { id: true },
        },
      },
    });

    for (const instance of delayedInstances) {
      const raisedById = instance.task.assignedById ?? instance.ownerId;
      if (instance.status !== TaskStatus.OVERDUE) {
        await this.prisma.taskInstance.update({
          where: { id: instance.id },
          data: { status: TaskStatus.OVERDUE },
        });

        await this.recordTaskInstanceEvent({
          taskInstanceId: instance.id,
          type: 'MARKED_OVERDUE',
          fromStatus: instance.status,
          toStatus: TaskStatus.OVERDUE,
          note: 'Task crossed its due date without completion.',
        });
      }

      if (instance.alerts.length === 0) {
        await this.prisma.alert.create({
          data: {
            type: AlertType.DELAY,
            title: `Delay: Task "${instance.task.title}" is overdue`,
            description: `The task "${instance.task.title}" assigned to ${instance.owner.firstName} ${instance.owner.lastName} was not completed by its due date (${instance.dueAt.toLocaleDateString()}).`,
            severity: Severity.HIGH,
            organizationId,
            raisedById,
            taskInstanceId: instance.id,
            againstUserId: instance.ownerId,
            status: AlertStatus.OPEN,
          },
        });

        await this.notifications.create({
          employeeId: instance.ownerId,
          type: NotificationType.ALERT,
          module: 'DWMS',
          title: 'Task Overdue Alert',
          message: `Your task "${instance.task.title}" is overdue and an alert has been raised.`,
          actionUrl: '/dwms/tasks',
        });
      }
    }
  }

  // Ensure task instance exists for a scheduled date
  async ensureTaskInstance(
    task: any,
    scheduledFor: Date,
    timeZone?: string | null,
  ) {
    const effectiveScheduledFor =
      isPlannedTaskFrequency(task.frequency) && task.dueDate
        ? toUtcDateOnly(task.dueDate)
        : scheduledFor;
    const dueAt = endOfDayInTimeZone(effectiveScheduledFor, timeZone ?? null);
    const initialStatus = isRecurringTaskFrequency(task.frequency)
      ? TaskStatus.PENDING
      : task.status;
    const initialCompletionPercent = isRecurringTaskFrequency(task.frequency)
      ? 0
      : task.completionPercent;

    try {
      return await this.prisma.taskInstance.upsert({
        where: {
          taskId_scheduledFor: {
            taskId: task.id,
            scheduledFor: effectiveScheduledFor,
          },
        },
        update: { dueAt },
        create: {
          taskId: task.id,
          ownerId: task.ownerId,
          frequency: task.frequency,
          scheduledFor: effectiveScheduledFor,
          dueAt,
          status: initialStatus,
          completionPercent: initialCompletionPercent,
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        const existing = await this.prisma.taskInstance.findUnique({
          where: {
            taskId_scheduledFor: {
              taskId: task.id,
              scheduledFor: effectiveScheduledFor,
            },
          },
        });
        if (existing) return existing;
      }
      throw error;
    }
  }
  private async getUnmetParentActivitiesForInstance(instance: any) {
    const activityId = instance.task?.activityId;
    if (!activityId) return [];

    const organizationId =
      instance.owner?.organizationId ??
      instance.task?.owner?.organizationId ??
      (instance.ownerId
        ? (
            await this.prisma.employee.findUnique({
              where: { id: instance.ownerId },
              select: { organizationId: true },
            })
          )?.organizationId
        : null);
    if (!organizationId) return [];

    const activity = await this.prisma.activity.findFirst({
      where: { id: activityId, organizationId },
      select: {
        parentActivityId: true,
        parentActivity: { select: { id: true, name: true, code: true } },
      },
    });
    if (!activity?.parentActivityId || !activity.parentActivity) return [];

    const completedParentInstance = await this.prisma.taskInstance.findFirst({
      where: {
        scheduledFor: instance.scheduledFor,
        status: TaskStatus.DONE,
        task: {
          activityId: activity.parentActivityId,
          frequency: instance.frequency,
          owner: { organizationId },
        },
      },
      select: { id: true },
    });

    return completedParentInstance ? [] : [activity.parentActivity];
  }

  private async assertParentActivitiesDoneBeforeStatusChange(
    instance: any,
    nextStatus: TaskStatus,
  ) {
    if (nextStatus === TaskStatus.PENDING) return;

    const unmetParents =
      await this.getUnmetParentActivitiesForInstance(instance);
    if (unmetParents.length === 0) return;

    throw new BadRequestException(
      `Complete parent activity first: ${unmetParents.map((activity) => activity.name).join(', ')}`,
    );
  }
  private serializeTaskInstanceEvent(event: any) {
    return {
      id: event.id,
      type: event.type,
      fromStatus: event.fromStatus ?? null,
      toStatus: event.toStatus ?? null,
      note: event.note ?? null,
      attachmentUrl: event.attachmentUrl ?? null,
      attachmentName: event.attachmentName ?? null,
      createdAt: event.createdAt.toISOString(),
      actor: event.actor
        ? {
            id: event.actor.id,
            name: (event.actor.firstName + ' ' + event.actor.lastName).trim(),
            email: event.actor.email,
          }
        : null,
    };
  }

  private async recordTaskInstanceEvent(data: {
    taskInstanceId: string;
    actorId?: string | null;
    type: string;
    fromStatus?: TaskStatus | null;
    toStatus?: TaskStatus | null;
    note?: string | null;
    attachmentUrl?: string | null;
    attachmentName?: string | null;
  }) {
    return this.prisma.taskInstanceEvent.create({
      data: {
        taskInstanceId: data.taskInstanceId,
        actorId: data.actorId ?? null,
        type: data.type,
        fromStatus: data.fromStatus ?? null,
        toStatus: data.toStatus ?? null,
        note: data.note?.trim() || null,
        attachmentUrl: data.attachmentUrl ?? null,
        attachmentName: data.attachmentName ?? null,
      },
    });
  }

  private async closeDelayAlertsForCompletedInstance(
    taskInstanceId: string,
    closureNote: string,
  ) {
    await this.prisma.alert.updateMany({
      where: {
        taskInstanceId,
        type: AlertType.DELAY,
        status: { in: [AlertStatus.OPEN, AlertStatus.IN_PROGRESS] },
      },
      data: {
        status: AlertStatus.CLOSED,
        resolvedAt: new Date(),
        closureNote,
      },
    });
  }
  private serializeTaskInstanceComment(comment: any) {
    return {
      id: comment.id,
      comment: comment.comment,
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString(),
      author: comment.author
        ? {
            id: comment.author.id,
            name: (
              comment.author.firstName +
              ' ' +
              comment.author.lastName
            ).trim(),
            email: comment.author.email,
          }
        : null,
    };
  }
  private serializeTaskInstanceHistory(instance: any) {
    const serializedEvents = (instance.events ?? []).map((event: any) =>
      this.serializeTaskInstanceEvent(event),
    );
    const hasCommentEvents = new Set(
      (instance.events ?? [])
        .filter((event: any) => event.type === 'COMMENT_ADDED')
        .map((event: any) => (event.actorId ?? '') + '|' + (event.note ?? '')),
    );
    const legacyCommentEvents = (instance.comments ?? [])
      .filter(
        (comment: any) =>
          !hasCommentEvents.has(
            (comment.authorId ?? '') + '|' + (comment.comment ?? ''),
          ),
      )
      .map((comment: any) => ({
        id: 'comment-' + comment.id,
        type: 'COMMENT_ADDED',
        fromStatus: null,
        toStatus: null,
        note: comment.comment,
        attachmentUrl: null,
        attachmentName: null,
        createdAt: comment.createdAt.toISOString(),
        actor: comment.author
          ? {
              id: comment.author.id,
              name: (
                comment.author.firstName +
                ' ' +
                comment.author.lastName
              ).trim(),
              email: comment.author.email,
            }
          : null,
      }));

    return [...serializedEvents, ...legacyCommentEvents].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  }

  serializeTaskInstance(task: any, instance: any) {
    const ownerName =
      task.ownerName ||
      (task.owner
        ? `${task.owner.firstName} ${task.owner.lastName}`.trim()
        : '');
    const assignedByName =
      task.assignedByName ||
      (task.assignedBy
        ? `${task.assignedBy.firstName} ${task.assignedBy.lastName}`.trim()
        : '');
    const approvedByName = task.approvedBy
      ? `${task.approvedBy.firstName} ${task.approvedBy.lastName}`.trim()
      : '';
    const events = this.serializeTaskInstanceHistory(instance);
    const wasOverdue =
      instance.status === TaskStatus.OVERDUE ||
      events.some((event: any) => event.type === 'MARKED_OVERDUE') ||
      (instance.alerts ?? []).some(
        (alert: any) => alert.type === AlertType.DELAY,
      );

    return {
      id: instance.id,
      instanceId: instance.id,
      taskId: task.id,
      title: task.title,
      description: task.description,
      frequency: task.frequency,
      ownerName,
      assignedByName,
      approvedByName,
      owner: task.ownerId
        ? {
            id: task.ownerId,
            name: ownerName,
            email: task.owner?.email || '',
          }
        : null,
      assignedBy: task.assignedById
        ? {
            id: task.assignedById,
            name: assignedByName,
            email: task.assignedBy?.email || '',
          }
        : null,
      approvedBy: task.approvedById
        ? {
            id: task.approvedById,
            name: approvedByName,
            email: task.approvedBy?.email || '',
          }
        : null,
      status: instance.status,
      completionPercent: instance.completionPercent,
      scheduledFor: instance.scheduledFor.toISOString(),
      dueAt: instance.dueAt.toISOString(),
      dueDate: instance.dueAt.toISOString(),
      completedAt: instance.completedAt
        ? instance.completedAt.toISOString()
        : null,
      completionNote: instance.completionNote ?? task.completionNote ?? null,
      completionAttachmentUrl:
        instance.completionAttachmentUrl ??
        task.completionAttachmentUrl ??
        null,
      completionAttachmentName:
        instance.completionAttachmentName ??
        task.completionAttachmentName ??
        null,
      comments: (instance.comments ?? []).map((comment: any) =>
        this.serializeTaskInstanceComment(comment),
      ),
      events,
      requiresCompletionDocument: task.requiresCompletionDocument ?? false,
      completionDocumentName: task.completionDocumentName ?? null,
      wasOverdue,
      isOverdue:
        isBeforeUtcDate(instance.dueAt, new Date()) &&
        !nonOverdueStatuses.has(instance.status),
      taskCreatedAt: task.createdAt.toISOString(),
      taskUpdatedAt: task.updatedAt.toISOString(),
      instanceCreatedAt: instance.createdAt.toISOString(),
      instanceUpdatedAt: instance.updatedAt.toISOString(),
      isAdhoc: task.isAdhoc,
      acknowledgedAt: task.acknowledgedAt
        ? task.acknowledgedAt.toISOString()
        : null,
      priority: task.priority,
      department: task.department
        ? {
            id: task.department.id,
            name: task.department.name,
          }
        : null,
      activity: task.activity
        ? {
            id: task.activity.id,
            name: task.activity.name,
            code: task.activity.code,
            frequency: task.activity.frequency,
            status: task.activity.status,
            parentActivities: task.activity.parentActivity
              ? [
                  {
                    id: task.activity.parentActivity.id,
                    name: task.activity.parentActivity.name,
                    code: task.activity.parentActivity.code,
                    frequency: task.activity.parentActivity.frequency,
                    status: task.activity.parentActivity.status,
                  },
                ]
              : [],
            parentActivityIds: task.activity.parentActivityId
              ? [task.activity.parentActivityId]
              : [],
          }
        : null,
    };
  }
  async getMyDwmsTaskInstanceDetail(user: UserPayload, instanceId: string) {
    const employee = await this.getEmployee(user.userId, user.organizationId);
    const instance = await this.prisma.taskInstance.findFirst({
      where: {
        id: instanceId,
        task: {
          owner: { organizationId: user.organizationId },
        },
      },
      include: {
        owner: true,
        task: {
          include: {
            owner: true,
            assignedBy: true,
            approvedBy: true,
            department: true,
            activity: {
              include: {
                parentActivity: true,
              },
            },
          },
        },
        comments: {
          include: {
            author: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        events: {
          include: {
            actor: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        alerts: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!instance) {
      throw new NotFoundException('Task instance not found');
    }

    const relatedTaskInstances = await this.prisma.taskInstance.findMany({
      where: {
        scheduledFor: instance.scheduledFor,
        frequency: instance.frequency,
        task: {
          activityId: { not: null },
          frequency: instance.frequency,
          owner: { organizationId: user.organizationId },
        },
      },
      select: {
        id: true,
        status: true,
        task: {
          select: {
            activityId: true,
          },
        },
      },
    });

    const hasFullTaskAccess =
      instance.task.ownerId === employee.id ||
      instance.task.assignedById === employee.id ||
      instance.task.approvedById === employee.id;
    const serializedTask = this.serializeTaskInstance(instance.task, instance);
    const visibleTask = hasFullTaskAccess
      ? serializedTask
      : {
          ...serializedTask,
          description: null,
          completionNote: null,
          completionAttachmentUrl: null,
          completionAttachmentName: null,
          comments: [],
          events: [],
          requiresCompletionDocument: false,
          completionDocumentName: null,
        };

    return {
      access: hasFullTaskAccess ? 'full' : 'relation',
      task: visibleTask,
      relatedTaskInstances: relatedTaskInstances
        .filter((item) => item.task.activityId)
        .map((item) => ({
          activityId: item.task.activityId,
          instanceId: item.id,
          status: item.status,
        })),
      instance: {
        id: instance.id,
        status: instance.status,
        completionPercent: instance.completionPercent,
        scheduledFor: instance.scheduledFor.toISOString(),
        dueAt: instance.dueAt.toISOString(),
        completedAt: instance.completedAt
          ? instance.completedAt.toISOString()
          : null,
      },
      comments: hasFullTaskAccess
        ? instance.comments.map((comment) =>
            this.serializeTaskInstanceComment(comment),
          )
        : [],
      events: hasFullTaskAccess ? this.serializeTaskInstanceHistory(instance) : [],
      alerts: hasFullTaskAccess
        ? instance.alerts.map((alert) => ({
            id: alert.id,
            title: alert.title,
            description: alert.description,
            status: alert.status,
            severity: alert.severity,
            createdAt: alert.createdAt.toISOString(),
            resolvedAt: alert.resolvedAt ? alert.resolvedAt.toISOString() : null,
          }))
        : [],
    };
  }
  async getMyDwmsTasks(
    user: UserPayload,
    rawFrequency?: string,
    rawDate?: string,
    rawTimeZone?: string,
  ) {
    const employee = await this.getEmployee(user.userId, user.organizationId);
    await this.checkAndRaiseDelayedTaskAlerts(user.organizationId);

    const frequency = parseTaskFrequency(rawFrequency);
    if (rawFrequency && !frequency) {
      throw new BadRequestException('Invalid frequency');
    }

    const referenceDate = parseDateOnly(rawDate) ?? toUtcDateOnly(new Date());
    const timeZone = parseTimeZone(rawTimeZone);

    const tasks = await this.prisma.task.findMany({
      where: {
        ownerId: employee.id,
        ...(frequency ? { frequency } : {}),
      },
      include: {
        owner: true,
        assignedBy: true,
        department: true,
        approvedBy: true,
        activity: {
          include: {
            parentActivity: true,
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { title: 'asc' }],
    });

    const maybeTaskInstances = await Promise.all(
      tasks.map(async (t) => {
        const scheduledFor = await this.getOfficeScheduledForTaskDate(
          t,
          referenceDate,
          user.organizationId,
        );

        if (!scheduledFor) return null;

        const inst = await this.ensureTaskInstance(t, scheduledFor, timeZone);
        const instance = await this.getTaskInstanceWithComments(inst.id);
        return { task: t, instance };
      }),
    );
    const taskInstances = maybeTaskInstances.filter(
      (item): item is { task: any; instance: any } => item !== null,
    );
    const currentInstanceIds = new Set(
      taskInstances.map(({ instance }) => instance.id),
    );
    const overdueInstances = await this.prisma.taskInstance.findMany({
      where: {
        ownerId: employee.id,
        status: TaskStatus.OVERDUE,
        ...(frequency ? { frequency } : {}),
        id: { notIn: Array.from(currentInstanceIds) },
      },
      include: {
        task: {
          include: {
            owner: true,
            assignedBy: true,
            department: true,
            approvedBy: true,
            activity: {
              include: {
                parentActivity: true,
              },
            },
          },
        },
        comments: {
          include: {
            author: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        events: {
          include: {
            actor: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        alerts: { orderBy: { createdAt: 'desc' } },
      },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
    });
    const resolvedOverdueInstanceIdsToExclude = new Set([
      ...currentInstanceIds,
      ...overdueInstances.map((instance) => instance.id),
    ]);
    const resolvedOverdueInstances = await this.prisma.taskInstance.findMany({
      where: {
        ownerId: employee.id,
        status: { in: [TaskStatus.DONE, APPROVAL_PENDING_STATUS] },
        ...(frequency ? { frequency } : {}),
        id: { notIn: Array.from(resolvedOverdueInstanceIdsToExclude) },
        OR: [
          { events: { some: { type: 'MARKED_OVERDUE' } } },
          { alerts: { some: { type: AlertType.DELAY } } },
        ],
      },
      include: {
        task: {
          include: {
            owner: true,
            assignedBy: true,
            department: true,
            approvedBy: true,
            activity: {
              include: {
                parentActivity: true,
              },
            },
          },
        },
        comments: {
          include: {
            author: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        events: {
          include: {
            actor: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        alerts: { orderBy: { createdAt: 'desc' } },
      },
      orderBy: [
        { completedAt: 'desc' },
        { dueAt: 'desc' },
        { createdAt: 'desc' },
      ],
    });
    const allTaskInstances = [
      ...taskInstances,
      ...overdueInstances.map((instance) => ({
        task: instance.task,
        instance,
      })),
      ...resolvedOverdueInstances.map((instance) => ({
        task: instance.task,
        instance,
      })),
    ];

    const serializedTaskInstances = await Promise.all(
      allTaskInstances.map(async ({ task, instance }) => {
        const unmetParents = await this.getUnmetParentActivitiesForInstance({
          ...instance,
          task,
        });
        return {
          ...this.serializeTaskInstance(task, instance),
          prerequisiteBlocked: unmetParents.length > 0,
          prerequisiteActivityNames: unmetParents.map((activity) => activity.name),
        };
      }),
    );

    return {
      date: toIsoDate(referenceDate),
      frequency: frequency ?? null,
      count: allTaskInstances.length,
      tasks: serializedTaskInstances,
    };
  }

  async getMyDwmsTaskSummary(
    user: UserPayload,
    rawDate?: string,
    rawTimeZone?: string,
  ) {
    const employee = await this.getEmployee(user.userId, user.organizationId);
    await this.checkAndRaiseDelayedTaskAlerts(user.organizationId);

    const referenceDate = parseDateOnly(rawDate) ?? toUtcDateOnly(new Date());
    const timeZone = parseTimeZone(rawTimeZone);

    const tasks = await this.prisma.task.findMany({
      where: { ownerId: employee.id },
      include: {
        owner: true,
        assignedBy: true,
        department: true,
        approvedBy: true,
        activity: {
          include: {
            parentActivity: true,
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { title: 'asc' }],
    });

    if (tasks.length === 0) {
      return {
        date: toIsoDate(referenceDate),
        total: 0,
        done: 0,
        pending: 0,
        overdue: 0,
        upcoming: 0,
      };
    }

    const maybeCurrentInstances = await Promise.all(
      tasks.map(async (t) => {
        const scheduledFor = await this.getOfficeScheduledForTaskDate(
          t,
          referenceDate,
          user.organizationId,
        );

        if (!scheduledFor) return null;

        return this.ensureTaskInstance(t, scheduledFor, timeZone);
      }),
    );
    const currentInstances = maybeCurrentInstances.filter(
      (instance): instance is NonNullable<typeof instance> => instance !== null,
    );
    const maybeUpcomingInstances = await Promise.all(
      tasks.map(async (t) => {
        if (isPlannedTaskFrequency(t.frequency)) {
          if (!t.dueDate || !isBeforeUtcDate(referenceDate, t.dueDate)) {
            return null;
          }

          return this.ensureTaskInstance(
            t,
            getScheduledForTaskDate(t, referenceDate),
            timeZone,
          );
        }

        const scheduledFor = await this.getNextOfficeScheduledForTaskDate(
          t,
          referenceDate,
          user.organizationId,
        );
        if (!scheduledFor) return null;
        return this.ensureTaskInstance(t, scheduledFor, timeZone);
      }),
    );
    const upcomingInstances = maybeUpcomingInstances.filter(
      (instance): instance is NonNullable<typeof instance> => instance !== null,
    );

    const now = new Date();
    const done = currentInstances.filter(
      (inst) => inst.status === TaskStatus.DONE,
    ).length;
    const pending = currentInstances.filter(
      (inst) =>
        !completedStatuses.has(inst.status) &&
        !isBeforeUtcDate(inst.dueAt, now),
    ).length;
    const overdue = currentInstances.filter(
      (inst) =>
        !completedStatuses.has(inst.status) && isBeforeUtcDate(inst.dueAt, now),
    ).length;
    const upcoming = upcomingInstances.filter(
      (inst) =>
        !completedStatuses.has(inst.status) &&
        inst.dueAt.getTime() > now.getTime(),
    ).length;

    return {
      date: toIsoDate(referenceDate),
      total: currentInstances.length,
      done,
      pending,
      overdue,
      upcoming,
    };
  }

  async updateMyDwmsTaskStatus(
    user: UserPayload,
    instanceId: string,
    dto: UpdateProgressDto,
  ) {
    const employee = await this.getEmployee(user.userId, user.organizationId);
    const { status, completionPercent } = dto;

    const existingInstance = await this.prisma.taskInstance.findFirst({
      where: {
        id: instanceId,
        ownerId: employee.id,
      },
      include: {
        task: true,
      },
    });

    if (!existingInstance) {
      throw new NotFoundException('Task instance not found');
    }

    const statusOrder: Record<TaskStatus, number> = {
      PENDING: 0,
      OVERDUE: 1,
      IN_PROGRESS: 1,
      PARTLY_DONE: 2,
      DONE: 3,
      APPROVAL_PENDING: 4,
      LESS_THAN_50: 99,
      NOT_APPLICABLE: 99,
    };

    const currentOrder = statusOrder[existingInstance.status] ?? 0;
    const newOrder = statusOrder[status] ?? 0;

    if (
      existingInstance.status === TaskStatus.DONE ||
      existingInstance.status === TaskStatus.APPROVAL_PENDING
    ) {
      throw new BadRequestException(
        'Approved or completed tasks cannot be modified',
      );
    }

    if (newOrder < currentOrder) {
      throw new BadRequestException(
        `Cannot transition back from ${existingInstance.status} to ${status}`,
      );
    }

    const task = await this.prisma.task.findUnique({
      where: { id: existingInstance.taskId },
      select: {
        id: true,
        title: true,
        frequency: true,
        approvedById: true,
        requiresCompletionDocument: true,
        completionDocumentName: true,
        approvedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        assignedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    let resolvedCompletionPercent = 0;
    if (status === TaskStatus.IN_PROGRESS) {
      resolvedCompletionPercent = 20;
    } else if (typeof completionPercent === 'number') {
      resolvedCompletionPercent = Math.min(
        100,
        Math.max(0, Math.trunc(completionPercent)),
      );
    } else {
      switch (status) {
        case TaskStatus.DONE:
          resolvedCompletionPercent = 100;
          break;
        case TaskStatus.PARTLY_DONE:
          resolvedCompletionPercent = 50;
          break;
        case TaskStatus.LESS_THAN_50:
          resolvedCompletionPercent = 10;
          break;
        default:
          resolvedCompletionPercent = 0;
          break;
      }
    }

    const effectiveStatus =
      status === TaskStatus.DONE && task.approvedById
        ? APPROVAL_PENDING_STATUS
        : status;

    if (
      existingInstance.status === TaskStatus.OVERDUE &&
      effectiveStatus !== TaskStatus.DONE &&
      effectiveStatus !== APPROVAL_PENDING_STATUS
    ) {
      throw new BadRequestException(
        'Overdue tasks can only be completed or submitted for approval',
      );
    }

    await this.assertParentActivitiesDoneBeforeStatusChange(
      existingInstance,
      effectiveStatus,
    );

    const completedAt = completedStatuses.has(effectiveStatus)
      ? new Date()
      : null;
    const shouldCaptureAttachment =
      status === TaskStatus.DONE || effectiveStatus === APPROVAL_PENDING_STATUS;

    if (
      shouldCaptureAttachment &&
      task.requiresCompletionDocument &&
      !dto.completionAttachmentUrl?.trim()
    ) {
      throw new BadRequestException(
        'Completion document is required for this task',
      );
    }
    const updatedInstance = await this.prisma.taskInstance.update({
      where: { id: existingInstance.id },
      data: {
        status: effectiveStatus,
        completionPercent: resolvedCompletionPercent,
        completionNote: shouldCaptureAttachment
          ? (dto.completionNote ?? null)
          : existingInstance.completionNote,
        completionAttachmentUrl: shouldCaptureAttachment
          ? (dto.completionAttachmentUrl ?? null)
          : existingInstance.completionAttachmentUrl,
        completionAttachmentName: shouldCaptureAttachment
          ? (dto.completionAttachmentName ?? null)
          : existingInstance.completionAttachmentName,
        completedAt,
      },
    });

    await this.recordTaskInstanceEvent({
      taskInstanceId: updatedInstance.id,
      actorId: employee.id,
      type:
        effectiveStatus === APPROVAL_PENDING_STATUS
          ? 'SUBMITTED_FOR_APPROVAL'
          : 'STATUS_CHANGED',
      fromStatus: existingInstance.status,
      toStatus: effectiveStatus,
      note: dto.completionNote ?? null,
      attachmentUrl: dto.completionAttachmentUrl ?? null,
      attachmentName: dto.completionAttachmentName ?? null,
    });

    if (effectiveStatus === TaskStatus.DONE) {
      await this.closeDelayAlertsForCompletedInstance(
        updatedInstance.id,
        'Overdue task was completed after its due date.',
      );
    }

    if (effectiveStatus === APPROVAL_PENDING_STATUS && task.approvedById) {
      await this.notifications.create({
        employeeId: task.approvedById,
        type: NotificationType.ACTION_REQUIRED,
        module: 'DWMS',
        title: 'Task Approval Pending',
        message: `${employee.firstName} ${employee.lastName} submitted "${task.title}" for your approval.`,
        actionUrl: '/dwms/approvalTasks',
      });
    }

    return {
      message: 'Task status updated',
      task,
      instance: {
        id: updatedInstance.id,
        status: updatedInstance.status,
        completionPercent: updatedInstance.completionPercent,
        completedAt: updatedInstance.completedAt
          ? updatedInstance.completedAt.toISOString()
          : null,
        scheduledFor: updatedInstance.scheduledFor.toISOString(),
        dueAt: updatedInstance.dueAt.toISOString(),
      },
    };
  }

  private getGenerationDates(startDate: Date, days: number) {
    return Array.from({ length: Math.max(1, days) }, (_, index) => {
      const date = new Date(startDate);
      date.setUTCDate(date.getUTCDate() + index);
      return toUtcDateOnly(date);
    });
  }

  private async generateInstancesForTask(
    task: OfficeScheduledTask,
    startDate: Date,
    days: number,
    timeZone?: string | null,
    organizationId?: string | null,
  ) {
    const dates = this.getGenerationDates(startDate, days);
    const resolvedOrganizationId =
      organizationId ?? (await this.getTaskOrganizationId(task));
    if (!resolvedOrganizationId) return 0;

    let createdOrEnsured = 0;
    for (const date of dates) {
      const scheduledFor = await this.getOfficeScheduledForTaskDate(
        task,
        date,
        resolvedOrganizationId,
      );
      if (!scheduledFor) continue;

      await this.ensureTaskInstance(task, scheduledFor, timeZone);
      createdOrEnsured += 1;
    }

    return createdOrEnsured;
  }

  async generateUpcomingTaskInstances(days = TASK_INSTANCE_GENERATION_DAYS) {
    const startDate = toUtcDateOnly(new Date());
    const tasks = await this.prisma.task.findMany({
      where: {
        status: { notIn: nonOverdueStatusValues },
      },
      include: { owner: { select: { organizationId: true } } },
    });

    let total = 0;
    for (const task of tasks) {
      total += await this.generateInstancesForTask(
        task,
        startDate,
        days,
        null,
        task.owner.organizationId,
      );
    }

    return { tasks: tasks.length, instances: total };
  }

  async getTaskInstanceWithComments(instanceId: string) {
    return this.prisma.taskInstance.findUniqueOrThrow({
      where: { id: instanceId },
      include: {
        comments: {
          include: {
            author: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        events: {
          include: {
            actor: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        alerts: { orderBy: { createdAt: 'desc' } },
      },
    });
  }

  async addMyDwmsTaskComment(
    user: UserPayload,
    instanceId: string,
    dto: CreateTaskInstanceCommentDto,
  ) {
    const employee = await this.getEmployee(user.userId, user.organizationId);
    const comment = dto.comment.trim();

    if (!comment) {
      throw new BadRequestException('Comment is required');
    }

    const instance = await this.prisma.taskInstance.findFirst({
      where: {
        id: instanceId,
        task: {
          OR: [
            { ownerId: employee.id },
            { assignedById: employee.id },
            { approvedById: employee.id },
          ],
        },
      },
    });

    if (!instance) {
      throw new NotFoundException('Task instance not found');
    }

    const created = await this.prisma.taskInstanceComment.create({
      data: {
        taskInstanceId: instance.id,
        authorId: employee.id,
        comment,
      },
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    await this.recordTaskInstanceEvent({
      taskInstanceId: instance.id,
      actorId: employee.id,
      type: 'COMMENT_ADDED',
      note: comment,
    });

    return {
      message: 'Comment added',
      comment: {
        id: created.id,
        comment: created.comment,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
        author: {
          id: created.author.id,
          name: `${created.author.firstName} ${created.author.lastName}`.trim(),
          email: created.author.email,
        },
      },
    };
  }

  async createAssignedTask(user: UserPayload, dto: CreateAssignedTaskDto) {
    const employee = await this.getEmployee(user.userId, user.organizationId);

    if (dto.priority === Priority.LOW) {
      throw new BadRequestException('DWMS tasks cannot have low priority');
    }

    const frequency = dto.frequency ?? TaskFrequency.PLANNED;
    if (String(frequency) === 'EVERY_5_MINUTES') {
      throw new BadRequestException(
        'Every 5 minutes task frequency is no longer supported',
      );
    }
    const isPlanned = frequency === TaskFrequency.PLANNED;
    let dueDate: Date | null = null;

    if (isPlanned) {
      if (!dto.dueDate) {
        throw new BadRequestException('Due date is required for planned tasks');
      }

      const selectedDate = new Date(dto.dueDate);
      if (Number.isNaN(selectedDate.getTime())) {
        throw new BadRequestException('Due date must be a valid date');
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      selectedDate.setHours(0, 0, 0, 0);
      if (selectedDate < today) {
        throw new BadRequestException('Due date cannot be in the past');
      }
      await this.assertDueDateIsOfficeOpen(
        user.organizationId,
        dto.dueDate.slice(0, 10),
      );
      dueDate = selectedDate;
    }

    const ownerEmployee = await this.prisma.employee.findFirst({
      where: { id: dto.assignedToId, organizationId: user.organizationId },
    });
    if (!ownerEmployee) {
      throw new BadRequestException('Assignee not found');
    }

    const activity = dto.activityId
      ? await this.prisma.activity.findFirst({
          where: { id: dto.activityId, organizationId: user.organizationId },
          select: { id: true, frequency: true, mainDepartmentId: true },
        })
      : null;
    if (dto.activityId && !activity) {
      throw new BadRequestException(
        'Activity must belong to the current organization',
      );
    }

    const ownerName =
      `${ownerEmployee.firstName} ${ownerEmployee.lastName}`.trim();
    const assignedByName = `${employee.firstName} ${employee.lastName}`.trim();

    const isDailyOrWeekly =
      frequency === TaskFrequency.DAILY || frequency === TaskFrequency.WEEKLY;
    const backupOwnerId = isDailyOrWeekly ? (dto.backupOwnerId ?? null) : null;
    const requiresCompletionDocument = dto.requiresCompletionDocument ?? false;
    const completionDocumentName = dto.completionDocumentName?.trim() ?? '';

    if (requiresCompletionDocument && !completionDocumentName) {
      throw new BadRequestException(
        'Document name is required when completion document is required',
      );
    }
    const task = await this.prisma.task.create({
      data: {
        title: dto.title,
        description: dto.description ?? null,
        ownerId: dto.assignedToId,
        assignedById: employee.id,
        ownerName,
        assignedByName,
        frequency,
        dueDate,
        priority: dto.priority ?? Priority.MEDIUM,
        isAdhoc: dto.isAdhoc ?? true,
        acknowledgedAt: dto.acknowledgeOnCreate ? new Date() : null,
        approvedById: dto.approvedById ?? null,
        overdueAlertTo: dto.overdueAlertTo ?? 'ASSIGNER',
        backupOwnerId,
        activityId: activity?.id ?? null,
        requiresCompletionDocument,
        completionDocumentName: requiresCompletionDocument
          ? completionDocumentName
          : null,
        departmentId:
          activity?.mainDepartmentId ?? ownerEmployee.departmentId ?? null,
      },
    });

    await this.generateInstancesForTask(
      task,
      toUtcDateOnly(new Date()),
      TASK_INSTANCE_GENERATION_DAYS,
      null,
      user.organizationId,
    );

    await this.notifications.create({
      employeeId: dto.assignedToId,
      type: NotificationType.ACTION_REQUIRED,
      module: 'DWMS',
      title: 'New Task Assigned',
      message: `You have been assigned a new task: "${dto.title}".`,
      actionUrl: '/dwms/tasks',
    });

    return { message: 'Assigned task created', task };
  }

  async getAssignedTasksForMe(user: UserPayload) {
    const employee = await this.getEmployee(user.userId, user.organizationId);
    await this.checkAndRaiseDelayedTaskAlerts(user.organizationId);

    const instances = await this.prisma.taskInstance.findMany({
      where: {
        ownerId: employee.id,
        task: { isAdhoc: true },
      },
      include: {
        comments: {
          include: {
            author: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        events: {
          include: {
            actor: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        task: {
          include: {
            owner: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            assignedBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            approvedBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            department: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ dueAt: 'desc' }, { createdAt: 'desc' }],
    });

    return {
      count: instances.length,
      tasks: instances.map((instance) =>
        this.serializeTaskInstance(instance.task, instance),
      ),
    };
  }

  async getAssignedTasksByMe(user: UserPayload) {
    const employee = await this.getEmployee(user.userId, user.organizationId);
    await this.checkAndRaiseDelayedTaskAlerts(user.organizationId);

    const instances = await this.prisma.taskInstance.findMany({
      where: {
        task: { assignedById: employee.id, isAdhoc: true },
      },
      include: {
        comments: {
          include: {
            author: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        events: {
          include: {
            actor: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        task: {
          include: {
            owner: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            assignedBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            approvedBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            department: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ dueAt: 'desc' }, { createdAt: 'desc' }],
    });

    return {
      count: instances.length,
      tasks: instances.map((instance) =>
        this.serializeTaskInstance(instance.task, instance),
      ),
    };
  }
  async getApprovalPendingTasks(user: UserPayload, status = 'pending') {
    const employee = await this.getEmployee(user.userId, user.organizationId);
    const normalizedStatus =
      status === 'approved' || status === 'rejected' ? status : 'pending';
    const instanceWhere =
      normalizedStatus === 'approved'
        ? { status: TaskStatus.DONE, task: { approvedById: employee.id } }
        : normalizedStatus === 'rejected'
          ? {
              status: TaskStatus.PENDING,
              task: { approvedById: employee.id },
              events: { some: { type: 'DISAPPROVED' } },
            }
          : {
              status: APPROVAL_PENDING_STATUS,
              task: { approvedById: employee.id },
            };

    const instances = await this.prisma.taskInstance.findMany({
      where: instanceWhere,
      include: {
        task: {
          include: {
            owner: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            assignedBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            approvedBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return {
      count: instances.length,
      tasks: instances.map((instance) => {
        const task = instance.task;
        const ownerName =
          task.ownerName ??
          (task.owner.firstName + ' ' + task.owner.lastName).trim();

        return {
          ...task,
          id: instance.id,
          instanceId: instance.id,
          taskId: task.id,
          status: instance.status,
          completionPercent: instance.completionPercent,
          completionNote:
            instance.completionNote ?? task.completionNote ?? null,
          completionAttachmentUrl:
            instance.completionAttachmentUrl ??
            task.completionAttachmentUrl ??
            null,
          completionAttachmentName:
            instance.completionAttachmentName ??
            task.completionAttachmentName ??
            null,
          scheduledFor: instance.scheduledFor.toISOString(),
          dueAt: instance.dueAt.toISOString(),
          dueDate: instance.dueAt.toISOString(),
          completedAt: instance.completedAt
            ? instance.completedAt.toISOString()
            : null,
          ownerName,
          owner: {
            id: task.owner.id,
            name: ownerName,
            email: task.owner.email,
          },
          assignedBy: task.assignedBy
            ? {
                id: task.assignedBy.id,
                name: (
                  task.assignedBy.firstName +
                  ' ' +
                  task.assignedBy.lastName
                ).trim(),
                email: task.assignedBy.email,
              }
            : null,
          approvedBy: task.approvedBy
            ? {
                id: task.approvedBy.id,
                name: (
                  task.approvedBy.firstName +
                  ' ' +
                  task.approvedBy.lastName
                ).trim(),
                email: task.approvedBy.email,
              }
            : null,
        };
      }),
    };
  }

  async approveTask(
    user: UserPayload,
    instanceId: string,
    dto: TaskApprovalActionDto = {},
  ) {
    const employee = await this.getEmployee(user.userId, user.organizationId);

    const instance = await this.prisma.taskInstance.findFirst({
      where: {
        id: instanceId,
        status: APPROVAL_PENDING_STATUS,
        task: { approvedById: employee.id },
      },
      include: {
        task: {
          include: {
            owner: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!instance) {
      throw new NotFoundException(
        'Task instance not found or not pending your approval',
      );
    }

    const approvalComment = dto.comment?.trim() ?? '';
    if (!approvalComment) {
      throw new BadRequestException('Approval comment is required');
    }

    const updated = await this.prisma.taskInstance.update({
      where: { id: instance.id },
      data: {
        status: TaskStatus.DONE,
        completionPercent: 100,
        completedAt: new Date(),
      },
    });

    if (approvalComment) {
      await this.prisma.taskInstanceComment.create({
        data: {
          taskInstanceId: instance.id,
          authorId: employee.id,
          comment: approvalComment,
        },
      });
    }

    await this.recordTaskInstanceEvent({
      taskInstanceId: instance.id,
      actorId: employee.id,
      type: 'APPROVED',
      fromStatus: instance.status,
      toStatus: TaskStatus.DONE,
      note: approvalComment || null,
    });

    await this.closeDelayAlertsForCompletedInstance(
      instance.id,
      'Overdue task was approved after completion.',
    );

    const task = instance.task;
    const notificationTargets = new Set<string>([task.ownerId]);
    if (task.assignedById) notificationTargets.add(task.assignedById);
    notificationTargets.delete(employee.id);

    await Promise.all(
      Array.from(notificationTargets).map((employeeId) =>
        this.notifications.create({
          employeeId,
          type: NotificationType.INFO,
          module: 'DWMS',
          title: 'Task Approved',
          message:
            employee.firstName +
            ' ' +
            employee.lastName +
            ' approved the task: "' +
            task.title +
            '".',
          actionUrl: '/dwms/tasks',
        }),
      ),
    );

    return { message: 'Task approved successfully', instance: updated };
  }

  async rejectTask(
    user: UserPayload,
    instanceId: string,
    dto: TaskApprovalActionDto = {},
  ) {
    const employee = await this.getEmployee(user.userId, user.organizationId);

    const instance = await this.prisma.taskInstance.findFirst({
      where: {
        id: instanceId,
        status: APPROVAL_PENDING_STATUS,
        task: { approvedById: employee.id },
      },
      include: {
        task: {
          include: {
            owner: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!instance) {
      throw new NotFoundException(
        'Task instance not found or not pending your approval',
      );
    }

    const rejectionComment = dto.comment?.trim() ?? '';
    if (!rejectionComment) {
      throw new BadRequestException('Rejection comment is required');
    }

    const updated = await this.prisma.taskInstance.update({
      where: { id: instance.id },
      data: {
        status: TaskStatus.PENDING,
        completionPercent: 0,
        completedAt: null,
        completionNote: null,
        completionAttachmentUrl: null,
        completionAttachmentName: null,
      },
    });

    if (rejectionComment) {
      await this.prisma.taskInstanceComment.create({
        data: {
          taskInstanceId: instance.id,
          authorId: employee.id,
          comment: rejectionComment,
        },
      });
    }

    await this.recordTaskInstanceEvent({
      taskInstanceId: instance.id,
      actorId: employee.id,
      type: 'DISAPPROVED',
      fromStatus: instance.status,
      toStatus: TaskStatus.PENDING,
      note: rejectionComment || null,
    });

    const task = instance.task;
    const notificationTargets = new Set<string>([task.ownerId]);
    if (task.assignedById) notificationTargets.add(task.assignedById);
    notificationTargets.delete(employee.id);

    await Promise.all(
      Array.from(notificationTargets).map((employeeId) =>
        this.notifications.create({
          employeeId,
          type: NotificationType.ALERT,
          module: 'DWMS',
          title: 'Task Rejected',
          message:
            employee.firstName +
            ' ' +
            employee.lastName +
            ' rejected the task: "' +
            task.title +
            '". The occurrence has been reset to Pending for resubmission.',
          actionUrl: '/dwms/tasks',
        }),
      ),
    );

    return { message: 'Task rejected successfully', instance: updated };
  }
  private async getAssignedTaskInstanceForUser(
    employee: any,
    assignedTaskInstanceId: string,
  ) {
    const instance = await this.prisma.taskInstance.findFirst({
      where: {
        id: assignedTaskInstanceId,
        ownerId: employee.id,
        task: { isAdhoc: true },
      },
      include: { task: true },
    });

    if (instance) {
      return instance;
    }

    const task = await this.prisma.task.findFirst({
      where: {
        id: assignedTaskInstanceId,
        ownerId: employee.id,
        isAdhoc: true,
      },
    });

    if (!task) {
      throw new NotFoundException(
        'Task instance not found or not assigned to you',
      );
    }

    const currentInstance = await this.getCurrentInstanceForTask(task);
    return { ...currentInstance, task };
  }

  async acknowledgeAssignedTask(user: UserPayload, instanceId: string) {
    const employee = await this.getEmployee(user.userId, user.organizationId);
    const instance = await this.getAssignedTaskInstanceForUser(
      employee,
      instanceId,
    );
    const task = instance.task;

    if (task.acknowledgedAt) {
      return { message: 'Task already acknowledged', task, instance };
    }

    const updatedTask = await this.prisma.task.update({
      where: { id: task.id },
      data: { acknowledgedAt: new Date() },
    });

    if (task.assignedById) {
      await this.notifications.create({
        employeeId: task.assignedById,
        type: NotificationType.INFO,
        module: 'DWMS',
        title: 'Task Acknowledged',
        message: `${employee.firstName} ${employee.lastName} acknowledged your assigned task: "${task.title}".`,
        actionUrl: '/dwms/assignedTasks',
      });
    }

    return {
      message: 'Task acknowledged successfully',
      task: updatedTask,
      instance,
    };
  }

  private async getCurrentInstanceForTask(task: any) {
    const referenceDate = toUtcDateOnly(new Date());
    const organizationId = await this.getTaskOrganizationId(task);
    if (!organizationId) {
      throw new NotFoundException('Task organization not found');
    }
    const scheduledFor = await this.getOfficeScheduledForTaskDate(
      task,
      referenceDate,
      organizationId,
    );
    if (!scheduledFor) {
      throw new NotFoundException('No task instance is scheduled for today');
    }
    return this.ensureTaskInstance(task, scheduledFor, null);
  }

  async updateAssignedTaskProgress(
    user: UserPayload,
    instanceId: string,
    dto: UpdateProgressDto,
  ) {
    const employee = await this.getEmployee(user.userId, user.organizationId);
    const instance = await this.getAssignedTaskInstanceForUser(
      employee,
      instanceId,
    );
    const task = instance.task;

    let resolvedCompletionPercent = 0;
    switch (dto.status) {
      case TaskStatus.DONE:
        resolvedCompletionPercent = 100;
        break;
      case TaskStatus.PARTLY_DONE:
        resolvedCompletionPercent = 50;
        break;
      case TaskStatus.LESS_THAN_50:
        resolvedCompletionPercent = 10;
        break;
      case TaskStatus.IN_PROGRESS:
        resolvedCompletionPercent = 0;
        break;
      default:
        resolvedCompletionPercent = 0;
        break;
    }

    const effectiveStatus =
      dto.status === TaskStatus.DONE && task.approvedById
        ? APPROVAL_PENDING_STATUS
        : dto.status;

    if (
      instance.status === TaskStatus.OVERDUE &&
      effectiveStatus !== TaskStatus.DONE &&
      effectiveStatus !== APPROVAL_PENDING_STATUS
    ) {
      throw new BadRequestException(
        'Overdue tasks can only be completed or submitted for approval',
      );
    }

    await this.assertParentActivitiesDoneBeforeStatusChange(
      instance,
      effectiveStatus,
    );

    const shouldCaptureAttachment =
      dto.status === TaskStatus.DONE ||
      effectiveStatus === APPROVAL_PENDING_STATUS;

    if (
      shouldCaptureAttachment &&
      task.requiresCompletionDocument &&
      !dto.completionAttachmentUrl?.trim()
    ) {
      throw new BadRequestException(
        'Completion document is required for this task',
      );
    }

    const updated = await this.prisma.taskInstance.update({
      where: { id: instance.id },
      data: {
        status: effectiveStatus,
        completionPercent: resolvedCompletionPercent,
        completionNote: shouldCaptureAttachment
          ? (dto.completionNote ?? null)
          : instance.completionNote,
        completionAttachmentUrl: shouldCaptureAttachment
          ? (dto.completionAttachmentUrl ?? null)
          : instance.completionAttachmentUrl,
        completionAttachmentName: shouldCaptureAttachment
          ? (dto.completionAttachmentName ?? null)
          : instance.completionAttachmentName,
        completedAt: completedStatuses.has(effectiveStatus) ? new Date() : null,
      },
    });

    await this.recordTaskInstanceEvent({
      taskInstanceId: instance.id,
      actorId: employee.id,
      type:
        effectiveStatus === APPROVAL_PENDING_STATUS
          ? 'SUBMITTED_FOR_APPROVAL'
          : 'STATUS_CHANGED',
      fromStatus: instance.status,
      toStatus: effectiveStatus,
      note: dto.completionNote ?? null,
      attachmentUrl: dto.completionAttachmentUrl ?? null,
      attachmentName: dto.completionAttachmentName ?? null,
    });

    if (effectiveStatus === TaskStatus.DONE) {
      await this.closeDelayAlertsForCompletedInstance(
        updated.id,
        'Overdue assigned task was completed after its due date.',
      );
    }

    if (effectiveStatus === APPROVAL_PENDING_STATUS && task.approvedById) {
      await this.notifications.create({
        employeeId: task.approvedById,
        type: NotificationType.ACTION_REQUIRED,
        module: 'DWMS',
        title: 'Task Approval Pending',
        message: `${employee.firstName} ${employee.lastName} submitted "${task.title}" for your approval.`,
        actionUrl: '/dwms/approvalTasks',
      });
    }

    return { message: 'Task progress updated', task, instance: updated };
  }

  async completeAssignedTask(
    user: UserPayload,
    instanceId: string,
    dto: CompleteAssignedTaskDto,
  ) {
    const employee = await this.getEmployee(user.userId, user.organizationId);
    const instance = await this.getAssignedTaskInstanceForUser(
      employee,
      instanceId,
    );
    const task = instance.task;

    const effectiveStatus = task.approvedById
      ? APPROVAL_PENDING_STATUS
      : TaskStatus.DONE;

    await this.assertParentActivitiesDoneBeforeStatusChange(
      instance,
      effectiveStatus,
    );

    if (
      task.requiresCompletionDocument &&
      !dto.completionAttachmentUrl?.trim()
    ) {
      throw new BadRequestException(
        'Completion document is required for this task',
      );
    }

    const updated = await this.prisma.taskInstance.update({
      where: { id: instance.id },
      data: {
        status: effectiveStatus,
        completionPercent: 100,
        completionNote: dto.completionNote ?? null,
        completionAttachmentUrl: dto.completionAttachmentUrl ?? null,
        completionAttachmentName: dto.completionAttachmentName ?? null,
        completedAt: completedStatuses.has(effectiveStatus) ? new Date() : null,
      },
    });

    await this.recordTaskInstanceEvent({
      taskInstanceId: instance.id,
      actorId: employee.id,
      type:
        effectiveStatus === APPROVAL_PENDING_STATUS
          ? 'SUBMITTED_FOR_APPROVAL'
          : 'STATUS_CHANGED',
      fromStatus: instance.status,
      toStatus: effectiveStatus,
      note: dto.completionNote ?? null,
      attachmentUrl: dto.completionAttachmentUrl ?? null,
      attachmentName: dto.completionAttachmentName ?? null,
    });

    if (effectiveStatus === TaskStatus.DONE) {
      await this.closeDelayAlertsForCompletedInstance(
        updated.id,
        'Overdue assigned task was completed after its due date.',
      );
    }

    if (effectiveStatus === APPROVAL_PENDING_STATUS && task.approvedById) {
      await this.notifications.create({
        employeeId: task.approvedById,
        type: NotificationType.ACTION_REQUIRED,
        module: 'DWMS',
        title: 'Task Approval Pending',
        message: `${employee.firstName} ${employee.lastName} submitted "${task.title}" for your approval.`,
        actionUrl: '/dwms/approvalTasks',
      });
    } else if (task.assignedById) {
      await this.notifications.create({
        employeeId: task.assignedById,
        type: NotificationType.INFO,
        module: 'DWMS',
        title: 'Task Completed',
        message: `${employee.firstName} ${employee.lastName} completed the task: "${task.title}".`,
        actionUrl: '/dwms/assignedTasks',
      });
    }

    return { message: 'Task completed successfully', task, instance: updated };
  }
}

