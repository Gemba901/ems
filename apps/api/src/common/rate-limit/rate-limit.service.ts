import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { createHash } from 'node:crypto';

import { PrismaService } from '../../prisma/prisma.service';

export class TooManyRequestsException extends HttpException {
  constructor(readonly retryAfterSeconds: number) {
    super('Too many requests. Please try again later.', HttpStatus.TOO_MANY_REQUESTS);
  }
}

// Fixed-window counters in Postgres: shared by every API instance, survive
// deploys, and each hit is one atomic upsert so parallel requests can't slip past.
@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);

  constructor(private readonly prisma: PrismaService) {}

  async consume(key: string, max: number, windowMs: number): Promise<void> {
    const [bucket] = await this.prisma.$queryRaw<{ count: number; expiresAt: Date }[]>`
      INSERT INTO "RateLimitBucket" ("key", "count", "expiresAt")
      VALUES (${hashKey(key)}, 1, now() + ${windowMs} * interval '1 millisecond')
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "RateLimitBucket"."expiresAt" <= now() THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
        "expiresAt" = CASE WHEN "RateLimitBucket"."expiresAt" <= now() THEN EXCLUDED."expiresAt" ELSE "RateLimitBucket"."expiresAt" END
      RETURNING "count", "expiresAt"`;

    if (bucket.count > max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.expiresAt.getTime() - Date.now()) / 1000));
      throw new TooManyRequestsException(retryAfter);
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async purgeExpired(): Promise<void> {
    const removed = await this.prisma.$executeRaw`DELETE FROM "RateLimitBucket" WHERE "expiresAt" <= now()`;
    if (removed) this.logger.log(`Purged ${removed} expired rate-limit buckets`);
  }
}

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}
