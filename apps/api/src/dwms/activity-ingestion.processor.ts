import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DwmsService } from './dwms.service';

const MAX_ATTEMPTS = 5;
const PROCESSOR_RETRY_MS = 5_000;

function retryDelay(attempts: number) {
  return Math.min(5 * 60_000, 5_000 * 2 ** Math.max(0, attempts - 1));
}

function errorStack(error: unknown) {
  return error instanceof Error
    ? (error.stack ?? error.message)
    : String(error);
}

@Injectable()
export class ActivityIngestionProcessor
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(ActivityIngestionProcessor.name);
  private drainPromise: Promise<void> | null = null;
  private wakeRequested = false;
  private wakeTimer: ReturnType<typeof setTimeout> | null = null;
  private nextWakeAt: number | null = null;
  private shuttingDown = false;

  constructor(
    private readonly db: PrismaService,
    private readonly dwms: DwmsService,
  ) {}

  async onApplicationBootstrap() {
    await this.recoverInterruptedIngestions();
    void this.enqueue();
  }

  onModuleDestroy() {
    this.shuttingDown = true;
    this.clearWakeTimer();
  }

  enqueue(ingestionId?: string): Promise<void> {
    if (this.shuttingDown) {
      if (ingestionId)
        this.logger.warn(
          `Ignored activity ingestion signal during shutdown: ingestion=${ingestionId}`,
        );
      return Promise.resolve();
    }

    this.wakeRequested = true;
    this.clearWakeTimer();
    if (this.drainPromise) return this.drainPromise;

    const drainPromise = this.drain()
      .catch((error: unknown) => {
        this.logger.error(
          'Activity ingestion processor failed; queued work remains recoverable',
          errorStack(error),
        );
        this.scheduleRecovery();
      })
      .finally(() => {
        if (this.drainPromise === drainPromise) this.drainPromise = null;
        if (this.wakeRequested && !this.shuttingDown) void this.enqueue();
      });
    this.drainPromise = drainPromise;
    return drainPromise;
  }

  private async drain() {
    while (!this.shuttingDown) {
      this.wakeRequested = false;
      const ingestion = await this.claimNextAvailable();
      if (!ingestion) {
        await this.scheduleNextWake();
        if (!this.wakeRequested) return;
        continue;
      }

      await this.processClaimed(ingestion);
    }
  }

  private async claimNextAvailable() {
    const next = await this.db.activityIngestion.findFirst({
      where: {
        status: 'QUEUED',
        completedAt: null,
        failedAt: null,
        availableAt: { lte: new Date() },
      },
      orderBy: [{ availableAt: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });
    if (!next) return null;

    return this.db.activityIngestion.update({
      where: { id: next.id },
      data: {
        status: 'PROCESSING',
        startedAt: new Date(),
        attempts: { increment: 1 },
        failedAt: null,
        failureMessage: null,
      },
      select: { id: true, attempts: true },
    });
  }

  private async processClaimed(ingestion: { id: string; attempts: number }) {
    try {
      await this.dwms.processQueuedActivityIngestion(ingestion.id);
    } catch (error: unknown) {
      const terminal = ingestion.attempts >= MAX_ATTEMPTS;
      await this.db.activityIngestion.updateMany({
        where: { id: ingestion.id, status: 'PROCESSING' },
        data: terminal
          ? {
              status: 'FAILED',
              failedAt: new Date(),
              failureMessage:
                'Activity ingestion failed after repeated processing attempts.',
            }
          : {
              status: 'QUEUED',
              availableAt: new Date(
                Date.now() + retryDelay(ingestion.attempts),
              ),
            },
      });
      this.logger.warn(
        `Activity ingestion attempt failed: ingestion=${ingestion.id} attempt=${ingestion.attempts}`,
        errorStack(error),
      );
    }
  }

  private async scheduleNextWake() {
    const next = await this.db.activityIngestion.findFirst({
      where: {
        status: 'QUEUED',
        completedAt: null,
        failedAt: null,
      },
      orderBy: [{ availableAt: 'asc' }, { createdAt: 'asc' }],
      select: { availableAt: true },
    });
    if (!next) return;

    this.scheduleWake(next.availableAt);
  }

  private scheduleWake(availableAt: Date) {
    const wakeAt = availableAt.getTime();
    if (this.wakeTimer && this.nextWakeAt !== null && this.nextWakeAt <= wakeAt)
      return;

    this.clearWakeTimer();
    this.nextWakeAt = wakeAt;
    this.wakeTimer = setTimeout(
      () => {
        this.wakeTimer = null;
        this.nextWakeAt = null;
        void this.enqueue();
      },
      Math.max(0, wakeAt - Date.now()),
    );
    this.wakeTimer.unref?.();
  }

  private scheduleRecovery() {
    if (this.shuttingDown) return;
    this.clearWakeTimer();
    this.nextWakeAt = Date.now() + PROCESSOR_RETRY_MS;
    this.wakeTimer = setTimeout(() => {
      this.wakeTimer = null;
      this.nextWakeAt = null;
      void this.recoverInterruptedIngestions()
        .then(() => this.enqueue())
        .catch((error: unknown) => {
          this.logger.error(
            'Activity ingestion recovery failed',
            errorStack(error),
          );
          this.scheduleRecovery();
        });
    }, PROCESSOR_RETRY_MS);
    this.wakeTimer.unref?.();
  }

  private async recoverInterruptedIngestions() {
    await this.db.activityIngestion.updateMany({
      where: { status: 'PROCESSING', completedAt: null, failedAt: null },
      data: { status: 'QUEUED', availableAt: new Date() },
    });
  }

  private clearWakeTimer() {
    if (this.wakeTimer) clearTimeout(this.wakeTimer);
    this.wakeTimer = null;
    this.nextWakeAt = null;
  }
}
