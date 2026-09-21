import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AlertType, ModuleType, NotificationType, Severity, TaskStatus } from 'db';
import { NotificationsService } from 'src/notifications/notifications.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { ScheduledJobsService } from '../operations/scheduled-jobs.service';
import { isUniqueConstraintError, taskInstanceDelayAlertKey } from './utils/alertDeduplication';

@Injectable()
export class DwmsOverdueAlertService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DwmsOverdueAlertService.name);
  private running: Promise<void> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly jobs: ScheduledJobsService,
  ) {}

  onApplicationBootstrap() {
    void this.checkOverdueAlerts();
  }

  @Cron(CronExpression.EVERY_HOUR, { timeZone: 'GMT' })
  async checkOverdueAlerts() {
    if (this.running) return this.running;
    const run = this.jobs.run(
      'dwms-overdue-alerts',
      new Date().toISOString().slice(0, 13),
      () => this.scan(),
    ).catch((error) => {
      this.logger.error(`DWMS overdue alert check failed: ${(error as Error)?.message ?? error}`);
    }).finally(() => {
      if (this.running === run) this.running = null;
    });
    this.running = run;
    return run;
  }

  private async scan() {
    const organizations = await this.prisma.organization.findMany({
      where: { status: 'ACTIVE', modules: { has: ModuleType.DWMS } },
      select: { id: true },
    });
    for (const organization of organizations) {
      const instances = await this.prisma.taskInstance.findMany({
        where: {
          owner: { organizationId: organization.id },
          task: { assignedById: { not: null } },
          dueAt: { lt: new Date() },
          status: { notIn: [TaskStatus.DONE, TaskStatus.NOT_APPLICABLE, TaskStatus.APPROVAL_PENDING] },
        },
        include: {
          owner: { select: { id: true, firstName: true, lastName: true } },
          task: { select: { id: true, title: true, assignedById: true } },
        },
      });
      for (const instance of instances) {
        await this.createOnce(organization.id, instance);
      }
    }
  }

  private async createOnce(organizationId: string, instance: any) {
    const key = taskInstanceDelayAlertKey(instance);
    const description = `Task "${instance.task.title}" assigned to ${instance.owner.firstName} ${instance.owner.lastName} is overdue.`;
    let alert: { id: string };
    try {
      alert = await this.prisma.alert.create({
        data: {
          type: AlertType.DELAY,
          title: `Overdue task: ${instance.task.title}`,
          description,
          severity: Severity.MEDIUM,
          organizationId,
          raisedById: instance.task.assignedById!,
          taskInstanceId: instance.id,
          againstUserId: instance.ownerId,
          deduplicationKey: key,
          occurrences: { create: { raisedById: instance.task.assignedById! } },
        },
        select: { id: true },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) return;
      throw error;
    }
    await this.notifications.create({
      employeeId: instance.ownerId,
      type: NotificationType.ALERT,
      module: 'DWMS',
      title: 'Overdue Task Alert',
      message: `Please acknowledge the overdue alert for "${instance.task.title}".`,
      actionUrl: `/dwms/alerts/${alert.id}`,
    });
  }
}
