import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  AlertStatus,
  AlertType,
  NotificationType,
  RoleName,
  Severity,
  TaskStatus,
} from 'db';
import { NotificationsService } from 'src/notifications/notifications.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { toUtcDateOnly } from './utils/taskSchedule';

const MANAGEMENT_ROLE_NAMES: RoleName[] = [
  RoleName.SUPER_ADMIN,
  RoleName.ADMIN,
  RoleName.MANAGEMENT,
  RoleName.HR,
];
const APPROVAL_PENDING_STATUS = 'APPROVAL_PENDING' as TaskStatus;
const NON_OVERDUE_TASK_STATUSES = [
  TaskStatus.DONE,
  TaskStatus.NOT_APPLICABLE,
  APPROVAL_PENDING_STATUS,
];

@Injectable()
export class DwmsEscalationService {
  private readonly logger = new Logger(DwmsEscalationService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  @Cron('0 * * * *', { timeZone: 'GMT' })
  async checkEscalations() {
    const configs = await this.prisma.dwmsPermissionConfig.findMany();

    for (const config of configs) {
      try {
        await this.processOrganization(config.organizationId, config);
      } catch (error) {
        this.logger.warn(
          `Failed to process DWMS escalations for ${config.organizationId}: ${(error as Error)?.message ?? error}`,
        );
      }
    }
  }

  private async processOrganization(organizationId: string, config: any) {
    const now = new Date();
    const today = toUtcDateOnly(now);
    const unacknowledgedCutoff = new Date(
      now.getTime() - config.escalateUnacknowledgedMins * 60_000,
    );

    const overdueTasks = await this.prisma.task.findMany({
      where: {
        owner: { organizationId },
        status: { notIn: NON_OVERDUE_TASK_STATUSES },
        dueDate: { not: null, lt: today },
      },
      include: {
        owner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            departmentId: true,
            reportingManagerId: true,
          },
        },
        assignedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    const unacknowledgedTasks = await this.prisma.task.findMany({
      where: {
        owner: { organizationId },
        isAdhoc: true,
        acknowledgedAt: null,
        createdAt: { lt: unacknowledgedCutoff },
        dueDate: { gte: today },
        status: { notIn: NON_OVERDUE_TASK_STATUSES },
      },
      include: {
        owner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            departmentId: true,
            reportingManagerId: true,
          },
        },
        assignedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    const overdueInstances = await this.prisma.taskInstance.findMany({
      where: {
        owner: { organizationId },
        dueAt: { lt: today },
        status: { notIn: NON_OVERDUE_TASK_STATUSES },
      },
      include: {
        owner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            departmentId: true,
            reportingManagerId: true,
          },
        },
        task: {
          select: {
            id: true,
            title: true,
            assignedById: true,
            assignedBy: {
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
    });

    for (const task of overdueTasks) {
      await this.raiseTaskAlert({
        organizationId,
        config,
        task,
        reason: 'overdue',
      });
    }

    for (const task of unacknowledgedTasks) {
      await this.raiseTaskAlert({
        organizationId,
        config,
        task,
        reason: 'unacknowledged',
      });
    }

    for (const instance of overdueInstances) {
      await this.raiseInstanceAlert({ organizationId, config, instance });
    }

    await this.raiseAbnormalitiesForStaleAlerts(organizationId, config, now);
  }
  private abnormalityWindowMins(config: any, severity: Severity) {
    const fallbackBySeverity: Record<Severity, number> = {
      LOW: 1440,
      MEDIUM: 1440,
      HIGH: 480,
      CRITICAL: 120,
    };
    const fieldBySeverity: Record<Severity, string> = {
      LOW: 'abnormalityMediumMins',
      MEDIUM: 'abnormalityMediumMins',
      HIGH: 'abnormalityHighMins',
      CRITICAL: 'abnormalityCriticalMins',
    };
    const raw = config[fieldBySeverity[severity]];
    const fallback = fallbackBySeverity[severity];
    return typeof raw === 'number' && Number.isFinite(raw)
      ? Math.max(0, Math.trunc(raw))
      : fallback;
  }

  private async raiseAbnormalitiesForStaleAlerts(
    organizationId: string,
    config: any,
    now: Date,
  ) {
    const alerts = await this.prisma.alert.findMany({
      where: {
        organizationId,
        status: { not: AlertStatus.CLOSED },
        correctiveAction: null,
        isAbnormality: false,
      },
      include: {
        taskInstance: {
          select: {
            ownerId: true,
            task: { select: { title: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    for (const alert of alerts) {
      const windowMins = this.abnormalityWindowMins(config, alert.severity);
      const ageMins = Math.floor(
        (now.getTime() - alert.createdAt.getTime()) / 60_000,
      );

      if (ageMins < windowMins) continue;

      const existing = await this.prisma.alert.findFirst({
        where: { abnormalitySourceAlertId: alert.id },
        select: { id: true },
      });
      if (existing) continue;

      const title = `Abnormality: ${alert.title}`;
      const linkedTaskTitle = alert.taskInstance?.task?.title;
      const description = [
        `Alert "${alert.title}" has not been worked upon for ${ageMins} minutes.`,
        `Configured abnormality window for ${alert.severity} severity is ${windowMins} minutes.`,
        linkedTaskTitle ? `Linked task: ${linkedTaskTitle}.` : null,
        alert.description ? `Original alert details: ${alert.description}` : null,
      ]
        .filter(Boolean)
        .join('\n');

      const abnormality = await this.prisma.alert.create({
        data: {
          type: AlertType.ABNORMAL_SITUATION,
          title,
          description,
          severity: alert.severity,
          status: AlertStatus.OPEN,
          organizationId,
          raisedById: alert.raisedById,
          taskInstanceId: alert.taskInstanceId,
          departmentId: alert.departmentId,
          againstUserId: alert.againstUserId ?? alert.taskInstance?.ownerId ?? null,
          isAbnormality: true,
          abnormalitySourceAlertId: alert.id,
        },
      });

      const notificationTargets = new Set<string>();
      notificationTargets.add(alert.raisedById);
      if (alert.againstUserId) notificationTargets.add(alert.againstUserId);
      if (alert.taskInstance?.ownerId) {
        notificationTargets.add(alert.taskInstance.ownerId);
      }

      await Promise.all(
        Array.from(notificationTargets).map((employeeId) =>
          this.notifications.create({
            employeeId,
            type: NotificationType.ALERT,
            module: 'DWMS',
            title: 'Alert Abnormality Created',
            message: `An abnormality was created because alert "${alert.title}" was not worked upon in time.`,
            actionUrl: `/dwms/alerts/${abnormality.id}`,
          }),
        ),
      );

      this.logger.debug(
        `Created DWMS abnormality ${abnormality.id} from alert ${alert.id}`,
      );
    }
  }

  private async raiseTaskAlert(params: {
    organizationId: string;
    config: any;
    task: any;
    reason: 'overdue' | 'unacknowledged';
  }) {
    const { organizationId, config, task, reason } = params;
    const title =
      reason === 'overdue'
        ? `Overdue task: ${task.title}`
        : `Unacknowledged task: ${task.title}`;

    const contactIds = await this.resolveContactIds(
      config,
      organizationId,
      task.owner,
      task.assignedById,
    );

    const existing = await this.prisma.alert.findFirst({
      where: {
        organizationId,
        type: AlertType.DELAY,
        title,
        againstUserId: task.ownerId,
      },
      select: { id: true },
    });

    const notificationTargets = new Set(contactIds);
    notificationTargets.add(task.ownerId);

    if (existing) return;

    const raisedById = task.assignedById ?? task.ownerId;
    const description =
      reason === 'overdue'
        ? `Task "${task.title}" assigned to ${task.owner.firstName} ${task.owner.lastName} is overdue.`
        : `Task "${task.title}" assigned to ${task.owner.firstName} ${task.owner.lastName} has not been acknowledged within ${config.escalateUnacknowledgedMins} minutes.`;

    const alert = await this.prisma.alert.create({
      data: {
        type: AlertType.DELAY,
        title,
        description,
        severity: Severity.HIGH,
        status: AlertStatus.OPEN,
        organizationId,
        raisedById,
        againstUserId: task.ownerId,
      },
    });

    for (const contactId of notificationTargets) {
      await this.notifications.create({
        employeeId: contactId,
        type: NotificationType.ALERT,
        module: 'DWMS',
        title,
        message: description,
        actionUrl: contactId === task.ownerId ? `/dwms/alerts/${alert.id}` : undefined,
      });
    }
  }

  private async raiseInstanceAlert(params: {
    organizationId: string;
    config: any;
    instance: any;
  }) {
    const { organizationId, config, instance } = params;
    const title = `Overdue task instance: ${instance.task.title}`;

    const contactIds = await this.resolveContactIds(
      config,
      organizationId,
      instance.owner,
      instance.task.assignedById,
    );

    const existing = await this.prisma.alert.findFirst({
      where: {
        organizationId,
        type: AlertType.DELAY,
        taskInstanceId: instance.id,
      },
      select: { id: true },
    });

    const notificationTargets = new Set(contactIds);
    notificationTargets.add(instance.ownerId);

    if (existing) return;

    const raisedById = instance.task.assignedById ?? instance.ownerId;
    const description = `Task instance for "${instance.task.title}" assigned to ${instance.owner.firstName} ${instance.owner.lastName} is overdue.`;

    const alert = await this.prisma.alert.create({
      data: {
        type: AlertType.DELAY,
        title,
        description,
        severity: Severity.HIGH,
        status: AlertStatus.OPEN,
        organizationId,
        raisedById,
        taskInstanceId: instance.id,
        againstUserId: instance.ownerId,
      },
    });

    for (const contactId of notificationTargets) {
      await this.notifications.create({
        employeeId: contactId,
        type: NotificationType.ALERT,
        module: 'DWMS',
        title,
        message: description,
        actionUrl: contactId === instance.ownerId ? `/dwms/alerts/${alert.id}` : undefined,
      });
    }
  }

  private async resolveContactIds(
    config: any,
    organizationId: string,
    owner: any,
    assignedById?: string | null,
  ) {
    const rules =
      Array.isArray(config.escalationContactRules) &&
      config.escalationContactRules.length > 0
        ? config.escalationContactRules
        : ['ASSIGNER'];
    const contactIds = new Set<string>();

    for (const rule of rules) {
      switch (rule) {
        case 'MANAGER': {
          let managerId = owner.reportingManagerId;
          const visited = new Set<string>();

          while (managerId && !visited.has(managerId)) {
            visited.add(managerId);
            const manager = await this.prisma.employee.findUnique({
              where: { id: managerId },
              select: {
                id: true,
                reportingManagerId: true,
              },
            });

            if (!manager) break;
            contactIds.add(manager.id);
            managerId = manager.reportingManagerId;
          }
          break;
        }
        case 'HIGHER_LEVEL_MANAGERS': {
          if (!owner.reportingManagerId) break;

          const directManager = await this.prisma.employee.findUnique({
            where: { id: owner.reportingManagerId },
            select: {
              id: true,
              reportingManagerId: true,
            },
          });

          if (directManager?.reportingManagerId) {
            contactIds.add(directManager.reportingManagerId);
          } else if (directManager?.id) {
            contactIds.add(directManager.id);
          }
          break;
        }
        case 'HOD': {
          if (!owner.departmentId) break;
          const hod = await this.prisma.employee.findFirst({
            where: {
              organizationId,
              departmentId: owner.departmentId,
              user: {
                organizations: {
                  some: {
                    organizationId,
                    role: {
                      name: RoleName.HOD,
                    },
                  },
                },
              },
            },
            select: { id: true },
          });
          if (hod?.id) contactIds.add(hod.id);
          break;
        }
        case 'CUSTOM':
          if (
            Array.isArray(config.customEscalationContactIds) &&
            config.customEscalationContactIds.length > 0
          ) {
            config.customEscalationContactIds.forEach((id: string) =>
              contactIds.add(id),
            );
          }
          break;
        case 'ASSIGNER':
          if (assignedById) contactIds.add(assignedById);
          break;
        default:
          break;
      }
    }

    if (contactIds.size > 0) {
      return Array.from(contactIds);
    }

    if (owner.reportingManagerId) {
      return [owner.reportingManagerId];
    }

    const assigner = await this.prisma.employee.findFirst({
      where: {
        organizationId,
        user: {
          organizations: {
            some: {
              organizationId,
              role: {
                name: { in: Array.from(MANAGEMENT_ROLE_NAMES) },
              },
            },
          },
        },
      },
      select: { id: true },
    });

    return assigner?.id ? [assigner.id] : owner.id ? [owner.id] : [];
  }
}

