import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../notifications/channels/email.service';
import { OnboardingService, backoff } from './onboarding.service';

@Injectable()
export class OnboardingWorker {
  private busy = false;
  private readonly logger = new Logger(OnboardingWorker.name);
  constructor(
    private readonly db: PrismaService,
    private readonly config: ConfigService,
    private readonly onboarding: OnboardingService,
    private readonly email: EmailService,
  ) {}

  @Interval(10_000)
  async tick() {
    // Separate switch permits completing accepted requests while signup is paused.
    if (this.busy || this.config.get('ONBOARDING_WORKER_ENABLED') !== 'true')
      return;
    this.busy = true;
    try {
      await this.db.onboardingRequest.updateMany({
        where: {
          status: 'PENDING_VERIFICATION',
          expiresAt: { lt: new Date() },
        },
        data: { status: 'EXPIRED', slug: null, passwordHash: null },
      });
      await this.onboarding.provisionOne();
      await this.deliverOne();
    } catch {
      // No exception payloads: SDK errors can include addresses or verification links.
      this.logger.error(
        'Onboarding worker failed; pending work remains retryable',
      );
    } finally {
      this.busy = false;
    }
  }

  async deliverOne() {
    const leaseId = randomUUID();
    const message = await this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM "OnboardingMessage" WHERE "sentAt" IS NULL AND "failedAt" IS NULL AND "availableAt" <= NOW() AND ("leaseUntil" IS NULL OR "leaseUntil" < NOW()) ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1`;
      if (!rows[0]) return null;
      return tx.onboardingMessage.update({
        where: { id: rows[0].id },
        data: {
          leaseId,
          leaseUntil: new Date(Date.now() + 120_000),
          attempts: { increment: 1 },
        },
        include: { request: true },
      });
    });
    if (!message) return;
    const request = message.request;
    try {
      const verification = message.kind === 'VERIFY';
      if (
        verification &&
        (request.status !== 'PENDING_VERIFICATION' ||
          request.expiresAt < new Date())
      ) {
        await this.db.onboardingMessage.updateMany({
          where: { id: message.id, leaseId },
          data: { failedAt: new Date(), leaseUntil: null },
        });
        return;
      }
      const actionUrl = verification
        ? `${this.onboarding.publicOrigin()}/signup/verify#id=${request.id}&token=${this.onboarding.token(request.id, 'verify')}`
        : this.onboarding.workspaceUrl(request.requestedSlug);
      await this.email.send(
        {
          to: request.email,
          subject: verification
            ? 'Verify your Gemba workspace signup'
            : 'Your Gemba workspace is ready',
          title: verification ? 'Verify your email' : 'Workspace ready',
          message: verification
            ? 'Open this link within 30 minutes to verify your email and set up your workspace. If you did not request this, ignore this message.'
            : 'Your company workspace is ready. Sign in to continue.',
          actionUrl,
          actionLabel: verification ? 'Verify email' : 'Sign in',
        },
        { requireDelivery: true },
      );
      await this.db.onboardingMessage.updateMany({
        where: { id: message.id, leaseId },
        data: { sentAt: new Date(), leaseUntil: null, leaseId: null },
      });
    } catch {
      await this.db.onboardingMessage.updateMany({
        where: { id: message.id, leaseId },
        data: {
          leaseId: null,
          leaseUntil: null,
          availableAt: new Date(Date.now() + backoff(message.attempts)),
          ...(message.attempts >= 5 ? { failedAt: new Date() } : {}),
        },
      });
      this.logger.warn(`Onboarding email attempt failed: job=${message.id}`);
    }
  }
}
