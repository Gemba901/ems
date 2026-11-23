import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ModuleType } from 'db';
import { PrismaService } from 'src/prisma/prisma.service';
import { ScheduledJobsService } from 'src/operations/scheduled-jobs.service';
import { AlertsService } from './alerts.service';

/**
 * 05.03: hourly pass so alerts open and close even when nobody opens the
 * alerts screen. Runs only where BUSINESS_JOBS_ENABLED=true, once per hour
 * across all API instances (ScheduledJobsService lease).
 */
@Injectable()
export class AlertsSyncJob {
  private readonly logger = new Logger(AlertsSyncJob.name);
  private running: Promise<void> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: ScheduledJobsService,
    private readonly alerts: AlertsService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR, { timeZone: 'GMT' })
  async syncAll() {
    if (this.running) return this.running;
    const run = this.jobs
      .run('lex05-alert-sync', new Date().toISOString().slice(0, 13), () =>
        this.scan(),
      )
      .catch((error) => {
        this.logger.error(
          `LEX 05 alert sync failed: ${(error as Error)?.message ?? error}`,
        );
      })
      .finally(() => {
        if (this.running === run) this.running = null;
      });
    this.running = run;
    return run;
  }

  /** One organisation failing must not stop the others. */
  async scan() {
    const organizations = await this.prisma.organization.findMany({
      where: {
        status: 'ACTIVE',
        modules: { has: ModuleType.LEADERSHIP_EXCELLENCE },
      },
      select: { id: true },
    });
    for (const { id } of organizations) {
      try {
        await this.alerts.sync(id);
      } catch (error) {
        this.logger.warn(
          `LEX 05 alert sync skipped organisation ${id}: ${(error as Error)?.message ?? error}`,
        );
      }
    }
  }
}
