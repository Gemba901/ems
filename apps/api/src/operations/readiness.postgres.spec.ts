import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from 'db';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ScheduledJobsService } from './scheduled-jobs.service';
import { PrismaService } from '../prisma/prisma.service';
import { tenantTransaction } from '../prisma/tenant-transaction';

// Destructive fixture setup is confined to this disposable local database.
const url = process.env.MILESTONE6_TEST_DATABASE_URL;
(url ? describe : describe.skip)('Milestone 6 PostgreSQL boundaries', () => {
  let db: PrismaClient;
  beforeAll(async () => {
    const target = new URL(url!);
    if (
      target.hostname !== '127.0.0.1' ||
      target.port !== '55442' ||
      target.pathname !== '/readiness_test'
    )
      throw Error('Use the disposable milestone 6 database');
    db = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url!, max: 1 }),
    });
    await db.$connect();
    await db.$executeRawUnsafe(
      'DROP TABLE IF EXISTS "FileAsset", "ScheduledJobRun", "Organization" CASCADE',
    );
    // Only the existing FK prerequisite is needed to exercise the new migration.
    await db.$executeRawUnsafe(
      'CREATE TABLE "Organization" (id TEXT PRIMARY KEY)',
    );
    await db.$executeRawUnsafe(
      `INSERT INTO "Organization" VALUES ('one'), ('two')`,
    );
    const migration = readFileSync(
      resolve(
        __dirname,
        '../../../..',
        'packages/db/prisma/migrations/20260917000000_add_private_files_and_job_runs/migration.sql',
      ),
      'utf8',
    );
    for (const statement of migration.split(';').filter((part) => part.trim()))
      await db.$executeRawUnsafe(statement);
    await db.$executeRawUnsafe(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'm6_runtime') THEN
        CREATE ROLE m6_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS;
      END IF;
    END $$`);
    await db.$executeRawUnsafe(
      'ALTER ROLE m6_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS',
    );
    await db.$executeRawUnsafe('GRANT USAGE ON SCHEMA public TO m6_runtime');
    await db.$executeRawUnsafe(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON "FileAsset" TO m6_runtime',
    );
  }, 30_000);
  afterAll(async () => {
    await db?.$disconnect();
  });

  const restricted = () =>
    ({
      $transaction: (
        work: (tx: Prisma.TransactionClient) => Promise<unknown>,
      ) =>
        db.$transaction(async (tx) => {
          await tx.$executeRawUnsafe('SET LOCAL ROLE m6_runtime');
          return work(tx);
        }),
    }) as PrismaService;
  const file = (id: string, organizationId: string) => ({
    id,
    organizationId,
    uploadedBy: 'test',
    key: id,
    fileName: 'test.txt',
    contentType: 'text/plain',
    size: 1,
    folder: 'tests',
    status: 'READY',
  });

  it('enforces the handwritten policy and clears context on a reused connection', async () => {
    await tenantTransaction(restricted(), 'one', (tx) =>
      tx.fileAsset.create({ data: file('a', 'one') }),
    );
    await tenantTransaction(restricted(), 'two', (tx) =>
      tx.fileAsset.create({ data: file('b', 'two') }),
    );
    expect(
      await tenantTransaction(restricted(), 'one', (tx) =>
        tx.fileAsset.findMany(),
      ),
    ).toEqual([expect.objectContaining({ id: 'a' })]);
    expect(
      await tenantTransaction(restricted(), 'two', (tx) =>
        tx.fileAsset.findMany(),
      ),
    ).toEqual([expect.objectContaining({ id: 'b' })]);
    expect(
      await restricted().$transaction((tx) => tx.fileAsset.findMany()),
    ).toEqual([]);
    await expect(
      restricted().$transaction((tx) =>
        tx.fileAsset.create({ data: file('no-context', 'one') }),
      ),
    ).rejects.toThrow();
    await expect(
      tenantTransaction(restricted(), 'one', (tx) =>
        tx.fileAsset.create({ data: file('bad', 'two') }),
      ),
    ).rejects.toThrow();
    await expect(
      tenantTransaction(restricted(), 'one', (tx) =>
        tx.fileAsset.update({
          where: { id: 'a' },
          data: { organizationId: 'two' },
        }),
      ),
    ).rejects.toThrow();
    expect(
      await restricted().$transaction((tx) => tx.fileAsset.findMany()),
    ).toEqual([]);
  });

  it('claims once across workers, deduplicates completed windows and runs the next window', async () => {
    const jobs = new ScheduledJobsService(
      db as PrismaService,
      new ConfigService({ BUSINESS_JOBS_ENABLED: 'true' }),
    );
    let release!: () => void;
    let entered!: () => void;
    const running = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = jobs.run('concurrent', 'day-one', async () => {
      entered();
      await hold;
    });
    await running;
    const competing = jest.fn();
    try {
      await jobs.run('concurrent', 'day-one', competing);
    } finally {
      release();
    }
    await first;
    await jobs.run('concurrent', 'day-one', competing);
    expect(competing).not.toHaveBeenCalled();
    await jobs.run('concurrent', 'day-two', competing);
    expect(competing).toHaveBeenCalledTimes(1);
    expect(
      await db.scheduledJobRun.findUnique({ where: { key: 'concurrent' } }),
    ).toMatchObject({
      window: 'day-two',
      attempts: 1,
      completedAt: expect.any(Date),
    });
  });

  it('records failures and recovers failed or expired claims', async () => {
    const jobs = new ScheduledJobsService(
      db as PrismaService,
      new ConfigService({ BUSINESS_JOBS_ENABLED: 'true' }),
    );
    await jobs.run('recovery', 'hour', async () => {
      throw Error('Injected failure');
    });
    expect(
      await db.scheduledJobRun.findUnique({ where: { key: 'recovery' } }),
    ).toMatchObject({ failedAt: expect.any(Date), completedAt: null });
    const work = jest.fn();
    await jobs.run('recovery', 'hour', work);
    expect(work).toHaveBeenCalledTimes(1);
    await db.scheduledJobRun.update({
      where: { key: 'recovery' },
      data: { completedAt: null, leaseUntil: new Date(0) },
    });
    await jobs.run('recovery', 'hour', work);
    expect(work).toHaveBeenCalledTimes(2);
    expect(
      await db.scheduledJobRun.findUnique({ where: { key: 'recovery' } }),
    ).toMatchObject({
      failedAt: null,
      attempts: 3,
      completedAt: expect.any(Date),
    });
  });
});
