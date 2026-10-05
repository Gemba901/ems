import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { DwmsService } from './dwms.service';

const LEASE_MS = 5 * 60_000;
const HEARTBEAT_MS = 60_000;
const MAX_ATTEMPTS = 5;

function retryDelay(attempts: number) {
  return Math.min(5 * 60_000, 5_000 * 2 ** Math.max(0, attempts - 1));
}

@Injectable()
export class ActivityIngestionWorker {
  private busy = false;
  private readonly logger = new Logger(ActivityIngestionWorker.name);

  constructor(
    private readonly db: PrismaService,
    private readonly dwms: DwmsService,
  ) {}

  @Interval(2_000)
  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.processOne();
    } catch {
      this.logger.error(
        'Activity ingestion worker failed; queued work remains retryable',
      );
    } finally {
      this.busy = false;
    }
  }

  async processOne() {
    const leaseId = randomUUID();
    const ingestion = await this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM "ActivityIngestion"
        WHERE "completedAt" IS NULL
          AND "failedAt" IS NULL
          AND "availableAt" <= NOW()
          AND (
            status = 'QUEUED'
            OR (
              status = 'PROCESSING'
              AND ("leaseUntil" IS NULL OR "leaseUntil" < NOW())
            )
          )
        ORDER BY "availableAt", "createdAt"
        FOR UPDATE SKIP LOCKED
        LIMIT 1`;
      if (!rows[0]) return null;

      return tx.activityIngestion.update({
        where: { id: rows[0].id },
        data: {
          status: 'PROCESSING',
          leaseId,
          leaseUntil: new Date(Date.now() + LEASE_MS),
          startedAt: new Date(),
          attempts: { increment: 1 },
          failedAt: null,
          failureMessage: null,
        },
        select: { id: true, attempts: true },
      });
    });
    if (!ingestion) return;

    const heartbeat = setInterval(() => {
      void this.db.activityIngestion
        .updateMany({
          where: {
            id: ingestion.id,
            leaseId,
            status: 'PROCESSING',
          },
          data: { leaseUntil: new Date(Date.now() + LEASE_MS) },
        })
        .catch(() => undefined);
    }, HEARTBEAT_MS);

    try {
      await this.dwms.processQueuedActivityIngestion(ingestion.id, leaseId);
    } catch {
      const terminal = ingestion.attempts >= MAX_ATTEMPTS;
      await this.db.activityIngestion.updateMany({
        where: { id: ingestion.id, leaseId, status: 'PROCESSING' },
        data: terminal
          ? {
              status: 'FAILED',
              failedAt: new Date(),
              failureMessage:
                'Activity ingestion failed after repeated processing attempts.',
              leaseId: null,
              leaseUntil: null,
            }
          : {
              status: 'QUEUED',
              availableAt: new Date(
                Date.now() + retryDelay(ingestion.attempts),
              ),
              leaseId: null,
              leaseUntil: null,
            },
      });
      this.logger.warn(
        `Activity ingestion attempt failed: ingestion=${ingestion.id} attempt=${ingestion.attempts}`,
      );
    } finally {
      clearInterval(heartbeat);
    }
  }
}
