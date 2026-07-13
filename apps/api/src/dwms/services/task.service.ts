import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
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
} from '../dto/dwms.dto';
import {
  addFrequencyInterval,
  endOfUtcDay,
  isBeforeUtcDate,
  parseDateOnly,
  parseTaskFrequency,
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

export abstract class DwmsTaskService extends DwmsBaseService {
  // Check and raise alerts for overdue daily task instances
  async checkAndRaiseDelayedTaskAlerts(organizationId: string) {
    const now = new Date();

    const delayedInstances = await this.prisma.taskInstance.findMany({
      where: {
        owner: { organizationId },
        dueAt: { lt: toUtcDateOnly(now) },
        status: { notIn: nonOverdueStatusValues },
        alerts: {
          none: {
            type: AlertType.DELAY,
          },
        },
      },
      include: {
        owner: true,
        task: true,
      },
    });

    for (const instance of delayedInstances) {
      const raisedById = instance.task.assignedById ?? instance.ownerId;

      await this.prisma.alert.create({
        data: {
          type: AlertType.DELAY,
          title: `Delay: Task "${instance.task.title}" is overdue`,
          description: `The task "${instance.task.title}" assigned to ${instance.owner.firstName} ${instance.owner.lastName} was not completed by its due date (${instance.dueAt.toLocaleDateString()}).`,
          severity: Severity.HIGH,
          organizationId,
          raisedById,
          taskInstanceId: instance.id,
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

  // Ensure task instance exists for a scheduled date
  async ensureTaskInstance(task: any, scheduledFor: Date) {
    try {
      return await this.prisma.taskInstance.upsert({
        where: {
          taskId_scheduledFor: {
            taskId: task.id,
            scheduledFor,
          },
        },
        update: {},
        create: {
          taskId: task.id,
          ownerId: task.ownerId,
          frequency: task.frequency,
          scheduledFor,
          dueAt: endOfUtcDay(scheduledFor),
          status: task.status,
          completionPercent: task.completionPercent,
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        const existing = await this.prisma.taskInstance.findUnique({
          where: {
            taskId_scheduledFor: {
              taskId: task.id,
              scheduledFor,
            },
          },
        });
        if (existing) return existing;
      }
      throw error;
    }
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

    return {
      instanceId: instance.id,
      taskId: task.id,
      title: task.title,
      description: task.description,
      frequency: task.frequency,
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
      completedAt: instance.completedAt
        ? instance.completedAt.toISOString()
        : null,
      completionAttachmentUrl: task.completionAttachmentUrl ?? null,
      completionAttachmentName: task.completionAttachmentName ?? null,
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
    };
  }

  async getMyDwmsTasks(
    user: UserPayload,
    rawFrequency?: string,
    rawDate?: string,
  ) {
    const employee = await this.getEmployee(user.userId, user.organizationId);
    await this.checkAndRaiseDelayedTaskAlerts(user.organizationId);

    const frequency = parseTaskFrequency(rawFrequency);
    if (rawFrequency && !frequency) {
      throw new BadRequestException('Invalid frequency');
    }

    const referenceDate = parseDateOnly(rawDate) ?? toUtcDateOnly(new Date());

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
      },
      orderBy: [{ createdAt: 'asc' }, { title: 'asc' }],
    });

    const taskInstances = await Promise.all(
      tasks.map(async (t) => {
        const inst = await this.ensureTaskInstance(t, referenceDate);
        return { task: t, instance: inst };
      }),
    );

    return {
      date: toIsoDate(referenceDate),
      frequency: frequency ?? null,
      count: taskInstances.length,
      tasks: taskInstances.map(({ task, instance }) =>
        this.serializeTaskInstance(task, instance),
      ),
    };
  }

  async getMyDwmsTaskSummary(user: UserPayload, rawDate?: string) {
    const employee = await this.getEmployee(user.userId, user.organizationId);
    await this.checkAndRaiseDelayedTaskAlerts(user.organizationId);

    const referenceDate = parseDateOnly(rawDate) ?? toUtcDateOnly(new Date());

    const tasks = await this.prisma.task.findMany({
      where: { ownerId: employee.id },
      include: {
        owner: true,
        assignedBy: true,
        department: true,
        approvedBy: true,
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

    const currentInstances = await Promise.all(
      tasks.map((t) => this.ensureTaskInstance(t, referenceDate)),
    );
    const upcomingInstances = await Promise.all(
      tasks.map((t) =>
        this.ensureTaskInstance(
          t,
          addFrequencyInterval(referenceDate, t.frequency),
        ),
      ),
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
      OVERDUE: 0,
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
    const completedAt = completedStatuses.has(effectiveStatus)
      ? new Date()
      : null;
    const shouldCaptureAttachment =
      status === TaskStatus.DONE || effectiveStatus === APPROVAL_PENDING_STATUS;

    const [updatedInstance] = await this.prisma.$transaction([
      this.prisma.taskInstance.update({
        where: { id: existingInstance.id },
        data: {
          status: effectiveStatus,
          completionPercent: resolvedCompletionPercent,
          completedAt,
        },
      }),
      this.prisma.task.update({
        where: { id: existingInstance.taskId },
        data: {
          status: effectiveStatus,
          completionPercent: resolvedCompletionPercent,
          ...(shouldCaptureAttachment
            ? {
                completionAttachmentUrl: dto.completionAttachmentUrl ?? null,
                completionAttachmentName: dto.completionAttachmentName ?? null,
              }
            : {}),
        },
      }),
    ]);

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

  async createAssignedTask(user: UserPayload, dto: CreateAssignedTaskDto) {
    const employee = await this.getEmployee(user.userId, user.organizationId);

    if (dto.priority === Priority.LOW) {
      throw new BadRequestException('DWMS tasks cannot have low priority');
    }

    if (dto.dueDate) {
      const selectedDate = new Date(dto.dueDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      selectedDate.setHours(0, 0, 0, 0);
      if (selectedDate < today) {
        throw new BadRequestException('Due date cannot be in the past');
      }
    }

    const ownerEmployee = await this.prisma.employee.findUnique({
      where: { id: dto.assignedToId },
    });
    if (!ownerEmployee) {
      throw new BadRequestException('Assignee not found');
    }

    const ownerName =
      `${ownerEmployee.firstName} ${ownerEmployee.lastName}`.trim();
    const assignedByName = `${employee.firstName} ${employee.lastName}`.trim();

    const isDailyOrWeekly =
      dto.frequency === TaskFrequency.DAILY ||
      dto.frequency === TaskFrequency.WEEKLY;
    const backupOwnerId = isDailyOrWeekly ? (dto.backupOwnerId ?? null) : null;
    const task = await this.prisma.task.create({
      data: {
        title: dto.title,
        description: dto.description ?? null,
        ownerId: dto.assignedToId,
        assignedById: employee.id,
        ownerName,
        assignedByName,
        frequency: dto.frequency ?? TaskFrequency.PLANNED,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        priority: dto.priority ?? Priority.MEDIUM,
        isAdhoc: true,
        approvedById: dto.approvedById ?? null,
        overdueAlertTo: dto.overdueAlertTo ?? 'ASSIGNER',
        backupOwnerId,
      },
    });

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

    const tasks = await this.prisma.task.findMany({
      where: { ownerId: employee.id, isAdhoc: true },
      orderBy: { createdAt: 'desc' },
    });

    return { count: tasks.length, tasks };
  }

  async getAssignedTasksByMe(user: UserPayload) {
    const employee = await this.getEmployee(user.userId, user.organizationId);

    const tasks = await this.prisma.task.findMany({
      where: { assignedById: employee.id, isAdhoc: true },
      orderBy: { createdAt: 'desc' },
    });

    return { count: tasks.length, tasks };
  }

  async getApprovalPendingTasks(user: UserPayload, status = 'pending') {
    const employee = await this.getEmployee(user.userId, user.organizationId);
    const taskStatus =
      status === 'approved' ? TaskStatus.DONE : APPROVAL_PENDING_STATUS;

    const tasks = await this.prisma.task.findMany({
      where: {
        approvedById: employee.id,
        status: taskStatus,
      },
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
      },
      orderBy: { updatedAt: 'desc' },
    });

    return {
      count: tasks.length,
      tasks: tasks.map((task) => ({
        ...task,
        ownerName:
          task.ownerName ??
          `${task.owner.firstName} ${task.owner.lastName}`.trim(),
        owner: {
          id: task.owner.id,
          name: `${task.owner.firstName} ${task.owner.lastName}`.trim(),
          email: task.owner.email,
        },
        assignedBy: task.assignedBy
          ? {
              id: task.assignedBy.id,
              name: `${task.assignedBy.firstName} ${task.assignedBy.lastName}`.trim(),
              email: task.assignedBy.email,
            }
          : null,
      })),
    };
  }

  async approveTask(user: UserPayload, taskId: string) {
    const employee = await this.getEmployee(user.userId, user.organizationId);

    const task = await this.prisma.task.findFirst({
      where: {
        id: taskId,
        approvedById: employee.id,
        status: APPROVAL_PENDING_STATUS,
      },
      include: {
        owner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!task) {
      throw new NotFoundException(
        'Task not found or not pending your approval',
      );
    }

    const now = new Date();
    const [updated] = await this.prisma.$transaction([
      this.prisma.task.update({
        where: { id: task.id },
        data: {
          status: TaskStatus.DONE,
          completionPercent: 100,
        },
      }),
      this.prisma.taskInstance.updateMany({
        where: {
          taskId: task.id,
          status: APPROVAL_PENDING_STATUS,
        },
        data: {
          status: TaskStatus.DONE,
          completionPercent: 100,
          completedAt: now,
        },
      }),
    ]);

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
          message: `${employee.firstName} ${employee.lastName} approved the task: "${task.title}".`,
          actionUrl: '/dwms/tasks',
        }),
      ),
    );

    return { message: 'Task approved successfully', task: updated };
  }

  async rejectTask(user: UserPayload, taskId: string) {
    const employee = await this.getEmployee(user.userId, user.organizationId);

    const task = await this.prisma.task.findFirst({
      where: {
        id: taskId,
        approvedById: employee.id,
        status: APPROVAL_PENDING_STATUS,
      },
      include: {
        owner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!task) {
      throw new NotFoundException(
        'Task not found or not pending your approval',
      );
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.task.update({
        where: { id: task.id },
        data: {
          status: TaskStatus.PENDING,
          completionPercent: 0,
        },
      }),
      this.prisma.taskInstance.updateMany({
        where: {
          taskId: task.id,
          status: APPROVAL_PENDING_STATUS,
        },
        data: {
          status: TaskStatus.PENDING,
          completionPercent: 0,
          completedAt: null,
        },
      }),
    ]);

    const notificationTargets = new Set<string>([task.ownerId]);
    if (task.assignedById) notificationTargets.add(task.assignedById);
    notificationTargets.delete(employee.id);

    await Promise.all(
      Array.from(notificationTargets).map((employeeId) =>
        this.notifications.create({
          employeeId,
          type: NotificationType.ALERT,
          module: 'DWMS',
          title: 'Task Disapproved',
          message: `${employee.firstName} ${employee.lastName} disapproved the task: "${task.title}". It has been reset to Pending.`,
          actionUrl: '/dwms/tasks',
        }),
      ),
    );

    return { message: 'Task disapproved successfully', task: updated };
  }

  async acknowledgeAssignedTask(user: UserPayload, taskId: string) {
    const employee = await this.getEmployee(user.userId, user.organizationId);

    const task = await this.prisma.task.findFirst({
      where: { id: taskId, ownerId: employee.id, isAdhoc: true },
    });

    if (!task) {
      throw new NotFoundException('Task not found or not assigned to you');
    }

    if (task.acknowledgedAt) {
      return { message: 'Task already acknowledged', task };
    }

    const updated = await this.prisma.task.update({
      where: { id: taskId },
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

    return { message: 'Task acknowledged successfully', task: updated };
  }

  async updateAssignedTaskProgress(
    user: UserPayload,
    taskId: string,
    dto: UpdateProgressDto,
  ) {
    const employee = await this.getEmployee(user.userId, user.organizationId);

    const task = await this.prisma.task.findFirst({
      where: { id: taskId, ownerId: employee.id, isAdhoc: true },
    });

    if (!task) {
      throw new NotFoundException('Task not found or not assigned to you');
    }

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
    const shouldCaptureAttachment =
      dto.status === TaskStatus.DONE ||
      effectiveStatus === APPROVAL_PENDING_STATUS;

    const updated = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        status: effectiveStatus,
        completionPercent: resolvedCompletionPercent,
        completionNote: dto.completionNote ?? null,
        ...(shouldCaptureAttachment
          ? {
              completionAttachmentUrl: dto.completionAttachmentUrl ?? null,
              completionAttachmentName: dto.completionAttachmentName ?? null,
            }
          : {}),
      },
    });

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

    return { message: 'Task progress updated', task: updated };
  }

  async completeAssignedTask(
    user: UserPayload,
    taskId: string,
    dto: CompleteAssignedTaskDto,
  ) {
    const employee = await this.getEmployee(user.userId, user.organizationId);

    const task = await this.prisma.task.findFirst({
      where: { id: taskId, ownerId: employee.id, isAdhoc: true },
    });

    if (!task) {
      throw new NotFoundException('Task not found or not assigned to you');
    }

    const effectiveStatus = task.approvedById
      ? APPROVAL_PENDING_STATUS
      : TaskStatus.DONE;

    const updated = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        status: effectiveStatus,
        completionPercent: 100,
        completionNote: dto.completionNote ?? null,
        completionAttachmentUrl: dto.completionAttachmentUrl ?? null,
        completionAttachmentName: dto.completionAttachmentName ?? null,
      },
    });

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

    return { message: 'Task completed successfully', task: updated };
  }
}
