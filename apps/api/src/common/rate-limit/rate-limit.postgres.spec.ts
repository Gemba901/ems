import 'reflect-metadata';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from 'db';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../prisma/prisma.service';
import { RateLimitService, TooManyRequestsException } from './rate-limit.service';

// Explicit opt-in: never fall back to the application DATABASE_URL.
const url = process.env.MILESTONE3_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

suite('RateLimitService on PostgreSQL', () => {
  let db: PrismaClient;
  let service: RateLimitService;

  beforeAll(async () => {
    const target = new URL(url!);
    if (!['127.0.0.1', 'localhost'].includes(target.hostname) || target.port !== '55439') {
      throw new Error('Use the disposable local test database on port 55439');
    }
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
    await db.$connect();
    service = new RateLimitService(db as unknown as PrismaService);
  }, 30_000);

  afterAll(async () => {
    if (!db) return;
    await db.$executeRaw`DELETE FROM "RateLimitBucket"`;
    await db.$disconnect();
  });

  it('admits exactly `max` of many parallel requests', async () => {
    const key = `parallel:${randomUUID()}`;
    const results = await Promise.allSettled(Array.from({ length: 25 }, () => service.consume(key, 10, 60_000)));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(10);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rejected).toHaveLength(15);
    for (const r of rejected) {
      expect(r.reason).toBeInstanceOf(TooManyRequestsException);
      expect(r.reason.retryAfterSeconds).toBeGreaterThan(0);
      expect(r.reason.retryAfterSeconds).toBeLessThanOrEqual(60);
    }
  });

  it('starts a fresh window once the old one expires', async () => {
    const key = `window:${randomUUID()}`;
    await service.consume(key, 1, 200);
    await expect(service.consume(key, 1, 200)).rejects.toBeInstanceOf(TooManyRequestsException);
    await new Promise(resolve => setTimeout(resolve, 300));
    await expect(service.consume(key, 1, 200)).resolves.toBeUndefined();
  });

  it('stores only hashed keys and purges expired buckets', async () => {
    const key = `purge:ann@example.com:${randomUUID()}`;
    await service.consume(key, 5, 1);
    const rows = await db.$queryRaw<{ key: string }[]>`SELECT "key" FROM "RateLimitBucket"`;
    expect(rows.some(row => row.key.includes('ann@example.com'))).toBe(false);
    expect(rows.every(row => /^[a-f0-9]{64}$/.test(row.key))).toBe(true);
    await new Promise(resolve => setTimeout(resolve, 20));
    await service.purgeExpired();
    const [{ count }] = await db.$queryRaw<{ count: bigint }[]>`SELECT count(*) FROM "RateLimitBucket" WHERE "expiresAt" <= now()`;
    expect(Number(count)).toBe(0);
  });
});
