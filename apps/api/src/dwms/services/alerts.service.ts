import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  AlertStatus,
  AlertType,
  NotificationType,
  RoleName,
  Severity,
  TaskStatus,
} from 'db';
import { CreateAlertDto } from '../dto/dwms.dto';
import { UserPayload } from './base.service';
import { DwmsDirectoryService } from './directory.service';

export abstract class DwmsAlertsService extends DwmsDirectoryService {
  async createAlert(user: UserPayload, dto: CreateAlertDto) {
    const employee = await this.getEmployee(user.userId, user.organizationId);
    const role = this.getDwmsRole(user.roleLevel);

    if (dto.severity === Severity.LOW) {
      throw new BadRequestException('DWMS alerts cannot have low severity');
    }

    const targetType = dto.targetType ?? 'GENERAL';

    if (targetType === 'GENERAL') {
      if (role !== 'HOD' && role !== 'MANAGEMENT') {
        throw new ForbiddenException(
          'Organisation level alerts can only be raised by HODs or Management',
        );
      }
    } else if (targetType === 'DEPARTMENT') {
      if (!dto.departmentId) {
        throw new BadRequestException(
          'departmentId is required when targetType is DEPARTMENT',
        );
      }
      const isHodOrMgmt = role === 'HOD' || role === 'MANAGEMENT';
      if (!isHodOrMgmt) {
        if (!employee.departmentId) {
          throw new ForbiddenException(
            'You are not assigned to any department',
          );
        }
        if (dto.departmentId !== employee.departmentId) {
          throw new ForbiddenException(
            'You can only raise alerts in your own department',
          );
        }
      }
    } else if (targetType === 'PERSON') {
      if (!dto.againstUserId) {
        throw new BadRequestException(
          'againstUserId is required when targetType is PERSON',
        );
      }
      if (employee.id === dto.againstUserId) {
        throw new BadRequestException(
          'You cannot raise an alert against yourself',
        );
      }
      const isMgmt = role === 'MANAGEMENT';
      const isUserSuperior = await this.isSuperior(
        employee.id,
        dto.againstUserId,
      );
      if (!isUserSuperior && !isMgmt) {
        throw new ForbiddenException(
          'You can only raise alerts against users who report to you',
        );
      }
    } else if (targetType === 'TASK') {
      if (!dto.taskInstanceId) {
        throw new BadRequestException(
          'taskInstanceId is required when targetType is TASK',
        );
      }
      const instance = await this.prisma.taskInstance.findUnique({
        where: { id: dto.taskInstanceId },
        select: { ownerId: true },
      });
      if (!instance) {
        throw new NotFoundException('Task instance not found');
      }
      if (instance.ownerId === employee.id) {
        throw new ForbiddenException(
          'You cannot raise an alert against your own tasks',
        );
      }
      const isMgmt = role === 'MANAGEMENT';
      const isUserSuperior = await this.isSuperior(
        employee.id,
        instance.ownerId,
      );
      if (!isUserSuperior && !isMgmt) {
        throw new ForbiddenException(
          'You can only raise alerts against tasks assigned to users who report to you',
        );
      }
    }

    const alert = await this.prisma.alert.create({
      data: {
        type: AlertType.ABNORMAL_SITUATION,
        title: dto.title,
        description: dto.description,
        raisedById: employee.id,
        organizationId: user.organizationId,
        severity: dto.severity,
        taskInstanceId: dto.taskInstanceId ?? null,
        departmentId: dto.departmentId ?? null,
        againstUserId: dto.againstUserId ?? null,
        status: AlertStatus.OPEN,
      },
    });

    // Alert notification escalation
    let notifyTargetId: string | null = null;
    if (dto.againstUserId) {
      notifyTargetId = dto.againstUserId;
    } else if (dto.taskInstanceId) {
      const inst = await this.prisma.taskInstance.findUnique({
        where: { id: dto.taskInstanceId },
        select: { ownerId: true },
      });
      notifyTargetId = inst?.ownerId ?? null;
    }

    if (notifyTargetId) {
      await this.notifications.create({
        employeeId: notifyTargetId,
        type: NotificationType.ALERT,
        module: 'DWMS',
        title: 'Alert Raised Against You',
        message: `An alert was raised: "${dto.title}".`,
        actionUrl: '/dwms/alerts',
      });
    }

    return { message: 'Alert created successfully', alert };
  }

  async getAlertTargets(user: UserPayload) {
    const employee = await this.getEmployee(user.userId, user.organizationId);
    const role = this.getDwmsRole(user.roleLevel);
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 7);

    const isMgmt = role === 'MANAGEMENT';
    const isHod = role === 'HOD';

    let allowedEmployees: any[] = [];
    let departments: any[] = [];

    if (isMgmt) {
      // Management: can raise against anyone and any department
      allowedEmployees = await this.prisma.employee.findMany({
        where: { organizationId: user.organizationId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          jobTitle: true,
        },
      });
      departments = await this.prisma.department.findMany({
        where: { organizationId: user.organizationId },
        select: { id: true, name: true },
      });
    } else if (isHod) {
      // HOD: can raise against other HODs, department members, or recursive reportees
      const reportees = await this.listReporteesRecursive(employee.id);

      const departmentAndHods = await this.prisma.employee.findMany({
        where: {
          organizationId: user.organizationId,
          OR: [
            employee.departmentId
              ? { departmentId: employee.departmentId }
              : undefined,
            {
              user: {
                organizations: {
                  some: {
                    organizationId: user.organizationId,
                    role: { name: RoleName.HOD },
                  },
                },
              },
            },
          ].filter(
            (cond): cond is Exclude<typeof cond, undefined> =>
              cond !== undefined,
          ),
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          jobTitle: true,
        },
      });

      const uniqueMap = new Map<string, any>();
      departmentAndHods.forEach((emp) => uniqueMap.set(emp.id, emp));
      reportees.forEach((emp) =>
        uniqueMap.set(emp.id, {
          id: emp.id,
          firstName: emp.firstName,
          lastName: emp.lastName,
          email: emp.email,
          jobTitle: emp.jobTitle,
        }),
      );
      uniqueMap.delete(employee.id);

      allowedEmployees = Array.from(uniqueMap.values());

      if (employee.departmentId) {
        const dept = await this.prisma.department.findUnique({
          where: { id: employee.departmentId },
          select: { id: true, name: true },
        });
        departments = dept ? [dept] : [];
      }
    } else {
      // Operator/Manager: can raise against recursive reportees
      const reportees = await this.listReporteesRecursive(employee.id);
      allowedEmployees = reportees.map((emp) => ({
        id: emp.id,
        firstName: emp.firstName,
        lastName: emp.lastName,
        email: emp.email,
        jobTitle: emp.jobTitle,
      }));

      if (employee.departmentId) {
        const dept = await this.prisma.department.findUnique({
          where: { id: employee.departmentId },
          select: { id: true, name: true },
        });
        departments = dept ? [dept] : [];
      }
    }

    const reporteesForTasks = await this.listReporteesRecursive(employee.id);

    return {
      users: allowedEmployees.map((r) => ({
        id: r.id,
        name: `${r.firstName} ${r.lastName}`,
        email: r.email,
        role: r.jobTitle ?? 'Employee',
      })),
      departments,
      tasks: await this.getRecentCompletedReporteeTasks(
        employee.id,
        reporteesForTasks.map((r) => r.id),
        user.organizationId,
        sevenDaysAgo,
      ),
    };
  }

  private async getRecentCompletedReporteeTasks(
    managerId: string,
    reporteeIds: string[],
    organizationId: string,
    completedSince: Date,
  ) {
    const instances = await this.prisma.taskInstance.findMany({
      where: {
        owner: { organizationId },
        ownerId: { in: reporteeIds },
        status: { in: [TaskStatus.DONE, TaskStatus.NOT_APPLICABLE] },
        OR: [
          { completedAt: { gte: completedSince } },
          { updatedAt: { gte: completedSince } },
        ],
      },
      include: {
        owner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            jobTitle: true,
          },
        },
        task: { select: { id: true, title: true } },
      },
      orderBy: [{ completedAt: 'desc' }, { updatedAt: 'desc' }],
    });

    return instances.map((instance) => ({
      instanceId: instance.id,
      title: instance.task.title,
      ownerName:
        `${instance.owner.firstName} ${instance.owner.lastName}`.trim(),
      ownerEmail: instance.owner.email,
      status: instance.status,
      dueAt: instance.dueAt.toISOString(),
      frequency: instance.frequency,
      completedAt: instance.completedAt?.toISOString() ?? null,
    }));
  }

  async getAlerts(user: UserPayload) {
    const employee = await this.getEmployee(user.userId, user.organizationId);
    const role = this.getDwmsRole(user.roleLevel);

    const config = await this.prisma.dwmsPermissionConfig.findUnique({
      where: { organizationId: user.organizationId },
      select: { alertViewLevel: true },
    });
    const configLevel = config?.alertViewLevel ?? 'OWN';

    let effectiveViewLevel: 'OWN' | 'DEPARTMENT' | 'ORGANIZATION' = 'OWN';
    if (role === 'MANAGEMENT') {
      effectiveViewLevel = 'ORGANIZATION';
    } else if (role === 'HOD') {
      effectiveViewLevel =
        configLevel === 'ORGANIZATION' ? 'ORGANIZATION' : 'DEPARTMENT';
    } else {
      effectiveViewLevel = configLevel as 'OWN' | 'DEPARTMENT' | 'ORGANIZATION';
    }

    let alerts: any[] = [];

    const includeOptions = {
      raisedBy: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
      againstUser: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
      department: { select: { id: true, name: true } },
      taskInstance: {
        select: {
          id: true,
          task: { select: { title: true } },
          owner: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              reportingManagerId: true,
            },
          },
        },
      },
    };

    if (effectiveViewLevel === 'ORGANIZATION') {
      alerts = await this.prisma.alert.findMany({
        where: { organizationId: user.organizationId },
        include: includeOptions,
        orderBy: { createdAt: 'desc' },
      });
    } else if (effectiveViewLevel === 'DEPARTMENT') {
      const reporteeIds = (await this.listReporteesRecursive(employee.id)).map(
        (r) => r.id,
      );

      alerts = await this.prisma.alert.findMany({
        where: {
          organizationId: user.organizationId,
          OR: [
            { raisedById: employee.id },
            { againstUserId: employee.id },
            { taskInstance: { ownerId: employee.id } },
            employee.departmentId
              ? { departmentId: employee.departmentId }
              : undefined,
            { againstUserId: { in: reporteeIds } },
            { taskInstance: { ownerId: { in: reporteeIds } } },
          ].filter(
            (cond): cond is Exclude<typeof cond, undefined> =>
              cond !== undefined,
          ),
        },
        include: includeOptions,
        orderBy: { createdAt: 'desc' },
      });
    } else {
      alerts = await this.prisma.alert.findMany({
        where: {
          organizationId: user.organizationId,
          OR: [
            { raisedById: employee.id },
            { againstUserId: employee.id },
            { taskInstance: { ownerId: employee.id } },
          ],
        },
        include: includeOptions,
        orderBy: { createdAt: 'desc' },
      });
    }

    return {
      count: alerts.length,
      alerts: alerts.map((a) => ({
        ...a,
        raisedBy: a.raisedBy
          ? {
              id: a.raisedBy.id,
              name: `${a.raisedBy.firstName} ${a.raisedBy.lastName}`,
              email: a.raisedBy.email,
            }
          : null,
        againstUser: a.againstUser
          ? {
              id: a.againstUser.id,
              name: `${a.againstUser.firstName} ${a.againstUser.lastName}`,
              email: a.againstUser.email,
            }
          : null,
        taskInstance: a.taskInstance
          ? {
              id: a.taskInstance.id,
              task: a.taskInstance.task,
              owner: a.taskInstance.owner
                ? {
                    id: a.taskInstance.owner.id,
                    name: `${a.taskInstance.owner.firstName} ${a.taskInstance.owner.lastName}`.trim(),
                    email: a.taskInstance.owner.email,
                    reportingToId: a.taskInstance.owner.reportingManagerId,
                  }
                : null,
            }
          : null,
      })),
      employeeId: employee.id,
    };
  }

  async getMyResponsibleAlertCount(user: UserPayload) {
    const employee = await this.getEmployee(user.userId, user.organizationId);

    const count = await this.prisma.alert.count({
      where: {
        organizationId: user.organizationId,
        status: { in: [AlertStatus.OPEN, AlertStatus.IN_PROGRESS] },
        OR: [
          { againstUserId: employee.id },
          { taskInstance: { ownerId: employee.id } },
        ],
      },
    });

    return { count };
  }

  async logCorrectiveAction(
    user: UserPayload,
    alertId: string,
    correctiveAction: string,
  ) {
    const employee = await this.getEmployee(user.userId, user.organizationId);

    const alert = await this.prisma.alert.findFirst({
      where: { id: alertId, organizationId: user.organizationId },
    });

    if (!alert) {
      throw new NotFoundException('Alert not found');
    }

    // Authorization check: Only target user, owner of target task, HOD, or Management can respond
    const role = this.getDwmsRole(user.roleLevel);
    const isMgmt = role === 'MANAGEMENT';
    const isHod =
      role === 'HOD' && employee.departmentId === alert.departmentId;

    let isTarget = alert.againstUserId === employee.id;
    if (!isTarget && alert.taskInstanceId) {
      const inst = await this.prisma.taskInstance.findUnique({
        where: { id: alert.taskInstanceId },
        select: { ownerId: true },
      });
      isTarget = inst?.ownerId === employee.id;
    }

    if (!isTarget && !isMgmt && !isHod) {
      throw new ForbiddenException(
        'You are not authorized to respond to this alert',
      );
    }

    const updated = await this.prisma.alert.update({
      where: { id: alertId },
      data: {
        correctiveAction,
        status: AlertStatus.IN_PROGRESS,
      },
    });

    await this.notifications.create({
      employeeId: alert.raisedById,
      type: NotificationType.INFO,
      module: 'DWMS',
      title: 'Alert Response Logged',
      message: `${employee.firstName} ${employee.lastName} logged corrective action for alert: "${alert.title}".`,
      actionUrl: '/dwms/alerts',
    });

    return { message: 'Corrective action logged successfully', alert: updated };
  }

  async closeAlert(user: UserPayload, alertId: string, closureNote: string) {
    const employee = await this.getEmployee(user.userId, user.organizationId);

    const alert = await this.prisma.alert.findFirst({
      where: { id: alertId, organizationId: user.organizationId },
    });

    if (!alert) {
      throw new NotFoundException('Alert not found');
    }

    // Only the raiser of the alert, an HOD of the department, or Management can close it
    const role = this.getDwmsRole(user.roleLevel);
    const isMgmt = role === 'MANAGEMENT';
    const isHod =
      role === 'HOD' && employee.departmentId === alert.departmentId;
    const isRaiser = alert.raisedById === employee.id;

    if (!isRaiser && !isMgmt && !isHod) {
      throw new ForbiddenException(
        'You are not authorized to close this alert',
      );
    }

    const updated = await this.prisma.alert.update({
      where: { id: alertId },
      data: {
        closureNote,
        status: AlertStatus.CLOSED,
        resolvedAt: new Date(),
      },
    });

    return { message: 'Alert closed successfully', alert: updated };
  }

  async remindAlertOwner(user: UserPayload, alertId: string) {
    const employee = await this.getEmployee(user.userId, user.organizationId);

    const alert = await this.prisma.alert.findFirst({
      where: { id: alertId, organizationId: user.organizationId },
    });

    if (!alert) {
      throw new NotFoundException('Alert not found');
    }

    if (!alert.againstUserId) {
      throw new BadRequestException(
        'This alert is not raised against a specific employee',
      );
    }

    if (!alert.taskInstanceId) {
      throw new BadRequestException(
        'This alert is not linked to a task instance',
      );
    }

    const taskInstance = await this.prisma.taskInstance.findUnique({
      where: { id: alert.taskInstanceId },
      include: { task: true },
    });

    if (!taskInstance) {
      throw new NotFoundException('Task instance not found');
    }

    // Check if reminder was already sent
    const existingNotification = await this.prisma.notification.findFirst({
      where: {
        employeeId: alert.againstUserId,
        type: NotificationType.ACTION_REQUIRED,
        module: 'DWMS',
        title: 'Task Reminder',
        message: { contains: taskInstance.task.title },
      },
    });

    if (existingNotification) {
      throw new BadRequestException(
        'Reminder has already been sent to this employee',
      );
    }

    await this.notifications.create({
      employeeId: alert.againstUserId,
      type: NotificationType.ACTION_REQUIRED,
      module: 'DWMS',
      title: 'Task Reminder',
      message: `Reminder: Please complete/acknowledge task "${taskInstance.task.title}" immediately.`,
      actionUrl: '/dwms/tasks',
    });

    return { message: 'Reminder sent successfully' };
  }

  async reassignEscalatedTask(
    user: UserPayload,
    alertId: string,
    newOwnerId: string,
  ) {
    const employee = await this.getEmployee(user.userId, user.organizationId);

    const alert = await this.prisma.alert.findFirst({
      where: { id: alertId, organizationId: user.organizationId },
    });

    if (!alert || !alert.taskInstanceId) {
      throw new BadRequestException('Alert is not linked to a task instance');
    }

    const taskInstance = await this.prisma.taskInstance.findUnique({
      where: { id: alert.taskInstanceId },
      include: { task: true },
    });

    if (!taskInstance) {
      throw new NotFoundException('Task instance not found');
    }

    const newOwner = await this.prisma.employee.findUnique({
      where: { id: newOwnerId },
    });

    if (!newOwner || newOwner.organizationId !== user.organizationId) {
      throw new BadRequestException('New owner not found in organization');
    }

    const newOwnerName = `${newOwner.firstName} ${newOwner.lastName}`.trim();

    await this.prisma.$transaction([
      this.prisma.task.update({
        where: { id: taskInstance.taskId },
        data: { ownerId: newOwnerId, ownerName: newOwnerName },
      }),
      this.prisma.taskInstance.update({
        where: { id: taskInstance.id },
        data: { ownerId: newOwnerId },
      }),
      this.prisma.alert.update({
        where: { id: alertId },
        data: { againstUserId: newOwnerId },
      }),
    ]);

    await this.notifications.create({
      employeeId: newOwnerId,
      type: NotificationType.ACTION_REQUIRED,
      module: 'DWMS',
      title: 'Task Reassigned',
      message: `You have been reassigned a task via escalation: "${taskInstance.task.title}".`,
      actionUrl: '/dwms/tasks',
    });

    return { message: 'Task reassigned successfully' };
  }

  async extendEscalatedTaskDueDate(
    user: UserPayload,
    alertId: string,
    newDueDate: string,
  ) {
    const employee = await this.getEmployee(user.userId, user.organizationId);

    const alert = await this.prisma.alert.findFirst({
      where: { id: alertId, organizationId: user.organizationId },
    });

    if (!alert || !alert.taskInstanceId) {
      throw new BadRequestException('Alert is not linked to a task instance');
    }

    const taskInstance = await this.prisma.taskInstance.findUnique({
      where: { id: alert.taskInstanceId },
      include: { task: true },
    });

    if (!taskInstance) {
      throw new NotFoundException('Task instance not found');
    }

    const parsedDate = new Date(newDueDate);
    if (isNaN(parsedDate.getTime())) {
      throw new BadRequestException('Invalid date format');
    }

    await this.prisma.$transaction([
      this.prisma.task.update({
        where: { id: taskInstance.taskId },
        data: { dueDate: parsedDate },
      }),
      this.prisma.taskInstance.update({
        where: { id: taskInstance.id },
        data: { dueAt: parsedDate },
      }),
    ]);

    await this.notifications.create({
      employeeId: taskInstance.ownerId,
      type: NotificationType.INFO,
      module: 'DWMS',
      title: 'Task Due Date Extended',
      message: `The due date for task "${taskInstance.task.title}" has been extended to ${newDueDate}.`,
      actionUrl: '/dwms/tasks',
    });

    return { message: 'Task due date extended successfully' };
  }

  async escalateAlertFurther(user: UserPayload, alertId: string) {
    const employee = await this.getEmployee(user.userId, user.organizationId);

    const alert = await this.prisma.alert.findFirst({
      where: { id: alertId, organizationId: user.organizationId },
    });

    if (!alert) {
      throw new NotFoundException('Alert not found');
    }

    const managerOfManagerId = employee.reportingManagerId;

    if (managerOfManagerId) {
      await this.notifications.create({
        employeeId: managerOfManagerId,
        type: NotificationType.ALERT,
        module: 'DWMS',
        title: 'Alert Escalated Further',
        message: `${employee.firstName} ${employee.lastName} escalated alert "${alert.title}" to you.`,
        actionUrl: '/dwms/alerts',
      });
    } else {
      const admin = await this.prisma.employee.findFirst({
        where: {
          organizationId: user.organizationId,
          user: {
            organizations: {
              some: {
                organizationId: user.organizationId,
                role: {
                  name: { in: ['SUPER_ADMIN', 'ADMIN', 'MANAGEMENT'] as any },
                },
              },
            },
          },
        },
        select: { id: true },
      });
      if (admin?.id) {
        await this.notifications.create({
          employeeId: admin.id,
          type: NotificationType.ALERT,
          module: 'DWMS',
          title: 'Alert Escalated Further',
          message: `Alert "${alert.title}" was escalated further.`,
          actionUrl: '/dwms/alerts',
        });
      }
    }

    const updated = await this.prisma.alert.update({
      where: { id: alertId },
      data: { status: AlertStatus.ESCALATED },
    });

    return { message: 'Alert escalated successfully', alert: updated };
  }
}
