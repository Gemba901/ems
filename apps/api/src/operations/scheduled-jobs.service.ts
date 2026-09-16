import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
@Injectable()
export class ScheduledJobsService {
  private readonly logger = new Logger(ScheduledJobsService.name);
  constructor(
    private readonly db: PrismaService,
    private readonly config: ConfigService,
  ) {}
  async run(name: string, window: string, work: () => Promise<unknown>) {
    if (this.config.get('BUSINESS_JOBS_ENABLED') !== 'true') return;
    const leaseId = randomUUID();
    const claimed = await this.db.$queryRaw<{ key: string }[]>`
      INSERT INTO "ScheduledJobRun" (key, "window", "leaseId", "leaseUntil", "updatedAt")
      VALUES (${name}, ${window}, ${leaseId}, NOW() + INTERVAL '5 minutes', NOW())
      ON CONFLICT (key) DO UPDATE SET "window" = EXCLUDED."window", "leaseId" = EXCLUDED."leaseId",
        "leaseUntil" = EXCLUDED."leaseUntil", "completedAt" = NULL, "failedAt" = NULL,
        attempts = CASE WHEN "ScheduledJobRun"."window" = EXCLUDED."window" THEN "ScheduledJobRun".attempts + 1 ELSE 1 END, "updatedAt" = NOW()
      WHERE "ScheduledJobRun"."leaseUntil" < NOW()
        AND ("ScheduledJobRun"."window" != EXCLUDED."window" OR "ScheduledJobRun"."completedAt" IS NULL)
      RETURNING key`;
    if (!claimed.length) return;
    let renewing = false;
    let lostLease = false;
    const heartbeat = setInterval(() => {
      if (renewing) return;
      renewing = true;
      void this.db.scheduledJobRun
        .updateMany({
          where: {
            key: name,
            leaseId,
            completedAt: null,
            leaseUntil: { gt: new Date() },
          },
          data: { leaseUntil: new Date(Date.now() + 300_000) },
        })
        .then((result) => {
          if (!result.count) lostLease = true;
        })
        .catch(() => {
          lostLease = true;
        })
        .finally(() => {
          renewing = false;
        });
    }, 30_000);
    heartbeat.unref();
    try {
      await work();
      if (lostLease) throw new Error('Lease lost');
      const completed = await this.db.scheduledJobRun.updateMany({
        where: { key: name, leaseId },
        data: {
          completedAt: new Date(),
          failedAt: null,
          leaseUntil: new Date(),
        },
      });
      if (completed.count !== 1)
        throw new Error('Lease lost before completion');
      this.logger.log(
        JSON.stringify({ event: 'scheduled_job_completed', job: name, window }),
      );
    } catch {
      await this.db.scheduledJobRun.updateMany({
        where: { key: name, leaseId },
        data: { failedAt: new Date(), leaseUntil: new Date() },
      });
      this.logger.error(
        JSON.stringify({ event: 'scheduled_job_failed', job: name, window }),
      );
    } finally {
      clearInterval(heartbeat);
    }
  }
}
