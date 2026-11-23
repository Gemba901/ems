import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from 'db';
import { EmsService } from './ems.service';

// Opt in with a disposable PostgreSQL database. Never use the application URL implicitly.
const url = process.env.EMS_LOCK_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
jest.setTimeout(15000);

suite('EMS reporting lock concurrency on PostgreSQL', () => {
  let db: PrismaClient;
  const schema = `ems_lock_${randomUUID().replace(/-/g, '')}`;
  beforeAll(async () => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url!, max: 4 }) });
    await db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    await db.$executeRawUnsafe(`CREATE TABLE "${schema}"."Organization" (id text PRIMARY KEY)`);
    await db.$executeRawUnsafe(`CREATE TABLE "${schema}"."Child" (id text PRIMARY KEY, "organizationId" text REFERENCES "${schema}"."Organization"(id))`);
    await db.$executeRawUnsafe(`INSERT INTO "${schema}"."Organization" VALUES ('org')`);
  });
  afterAll(async () => {
    if (db) {
      try { await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
      finally { await db.$disconnect(); }
    }
  });

  it('allows a foreign-key insert while a competing reporting writer still waits', async () => {
    let announce!: () => void;
    let release!: () => void;
    const locked = new Promise<void>(resolve => { announce = resolve; });
    const hold = new Promise<void>(resolve => { release = resolve; });
    const owner = db.$transaction(async tx => {
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
      await (EmsService.prototype as any).lockReporting(tx, 'org');
      announce();
      await hold;
    }, { timeout: 8000 });
    // If acquisition fails, do not wait indefinitely for the announcement.
    try {
      await Promise.race([locked, owner]);
      await db.$transaction(async tx => {
        await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
        await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '500ms'");
        await tx.$executeRaw`INSERT INTO "Child" VALUES ('attendance', 'org')`;
      });
      await expect(db.$transaction(async tx => {
        await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
        await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '500ms'");
        await (EmsService.prototype as any).lockReporting(tx, 'org');
      })).rejects.toThrow(/lock timeout/);
    } finally {
      release();
      await owner;
    }
    const children = await db.$queryRawUnsafe<any[]>(`SELECT * FROM "${schema}"."Child"`);
    expect(children).toEqual([{ id: 'attendance', organizationId: 'org' }]);
  });
});
