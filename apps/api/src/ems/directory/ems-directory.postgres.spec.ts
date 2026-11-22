import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from 'db';
import { EmsDirectoryService } from './ems-directory.service';

// Only this explicit opt-in is read. Every table lives in a temporary schema, removed in afterAll.
const url = process.env.EMS_DIRECTORY_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
jest.setTimeout(30000);
suite('Shared EMS service on PostgreSQL', () => {
  const schema = `ems_directory_${randomUUID().replace(/-/g, '')}`;
  let admin: PrismaClient, db: PrismaClient, service: EmsDirectoryService;
  beforeAll(async () => {
    admin = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url!, max: 2 }),
    });
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    db = new PrismaClient({
      adapter: new PrismaPg(
        { connectionString: url!, options: `-c search_path=${schema}`, max: 4 },
        { schema },
      ),
    });
    const sql = [
      `CREATE TYPE "EmploymentStatus" AS ENUM ('ACTIVE', 'PROBATION', 'RESIGNED', 'TERMINATED', 'RETIRED', 'SUSPENDED', 'ABSCONDED', 'CONTRACT_ENDED')`,
      'CREATE TABLE "Organization" (id TEXT PRIMARY KEY, name TEXT, status TEXT, modules TEXT[], "isAdminOrg" BOOLEAN)',
      'CREATE TABLE "Department" (id TEXT PRIMARY KEY, name TEXT, "organizationId" TEXT)',
      'CREATE TABLE "Role" (id INTEGER PRIMARY KEY, name TEXT)',
      'CREATE TABLE "UserOrganization" ("userId" TEXT, "organizationId" TEXT, "roleId" INTEGER, PRIMARY KEY ("userId", "organizationId"))',
      `CREATE TABLE "Employee" (id TEXT PRIMARY KEY, "organizationId" TEXT, "userId" TEXT, "firstName" TEXT, "middleName" TEXT, "lastName" TEXT,
        "employeeCode" TEXT, "jobTitle" TEXT, "departmentId" TEXT, "plantBranch" TEXT, section TEXT, "subSection" TEXT, "employmentStatus" "EmploymentStatus",
        "avatarUrl" TEXT, "reportingManagerId" TEXT, "reportsToBoard" BOOLEAN DEFAULT false, "reportingBody" TEXT, "pendingReportingRecordId" TEXT,
        "employmentType" TEXT, "dateJoined" TIMESTAMP, shift TEXT, "workStation" TEXT, level TEXT, grade TEXT, "skillLevel" TEXT, "trainingNeeded" BOOLEAN,
        "jobCategory" TEXT, "primaryWorkRole" TEXT, "machineProcess" TEXT, "hrRecordOwnerId" TEXT,
        "canBeLeader" BOOLEAN DEFAULT false, "canBeMember" BOOLEAN DEFAULT true, "canBeAssignedTasks" BOOLEAN DEFAULT true)`,
      'CREATE TABLE "EmsOnboardingBatch" (id TEXT PRIMARY KEY, "organizationId" TEXT, status TEXT)',
      'CREATE TABLE "EmsOnboardingRecord" (id TEXT PRIMARY KEY, "organizationId" TEXT, "batchId" TEXT, status TEXT)',
      'CREATE TABLE "EmsDepartmentHod" (id TEXT PRIMARY KEY, "departmentId" TEXT, "branchKey" TEXT, "branchLabel" TEXT, "employeeId" TEXT, "pendingRecordId" TEXT, "isUnassigned" BOOLEAN DEFAULT false)',
    ];
    for (const statement of sql) await db.$executeRawUnsafe(statement);
    await db.$executeRaw`INSERT INTO "Organization" VALUES ('a', 'A', 'ACTIVE', ARRAY['EMS'], false), ('b', 'B', 'ACTIVE', ARRAY['EMS'], false)`;
    await db.$executeRaw`INSERT INTO "Department" VALUES ('d', 'Production', 'a'), ('empty', 'Empty', 'a'), ('foreign-dept', 'Private department', 'b')`;
    await db.$executeRaw`INSERT INTO "Role" VALUES (1, 'HR'), (2, 'EMPLOYEE')`;
    await db.$executeRaw`INSERT INTO "UserOrganization" VALUES ('hr', 'a', 1), ('hr', 'b', 2), ('worker-login', 'a', 2)`;
    await db.$executeRaw`INSERT INTO "Employee" (id, "organizationId", "userId", "firstName", "lastName", "employeeCode", "departmentId", "plantBranch", "employmentStatus", "reportingManagerId", "hrRecordOwnerId") VALUES
      ('worker', 'a', 'worker-login', 'Worker', 'A', 'A1', 'foreign-dept', 'Head Office', 'ACTIVE', 'foreign', 'foreign'),
      ('lead', 'a', null, 'Leader', 'A', 'A2', 'd', 'Head Office', 'PROBATION', null, null),
      ('foreign', 'b', null, 'Private', 'B', 'B1', 'foreign-dept', 'Elsewhere', 'ACTIVE', null, null)`;
    await db.$executeRaw`INSERT INTO "EmsOnboardingBatch" VALUES ('batch', 'a', 'READY')`;
    await db.$executeRaw`INSERT INTO "EmsOnboardingRecord" VALUES ('draft', 'a', 'batch', 'READY')`;
    await db.$executeRaw`INSERT INTO "EmsDepartmentHod" VALUES ('hod', 'd', 'headoffice', 'Head Office', 'lead', null, false), ('pending', 'empty', 'headoffice', 'Head Office', null, 'draft', false)`;
    service = new EmsDirectoryService(db as never);
  });
  afterAll(async () => {
    if (db) await db.$disconnect();
    if (admin) {
      try {
        await admin.$executeRawUnsafe(
          `DROP SCHEMA IF EXISTS "${schema}" CASCADE`,
        );
      } finally {
        await admin.$disconnect();
      }
    }
  });
  it('filters company rows, sanitises cross-company references and excludes onboarding drafts', async () => {
    const result = await service.getOrganisation('a');
    expect(result.people.map((p) => p.id).sort()).toEqual(['lead', 'worker']);
    expect(result.people.find((p) => p.id === 'worker')).toMatchObject({
      departmentId: null,
      reporting: { state: 'UNAVAILABLE', managerId: null },
    });
    expect(result.hodAssignments.map((h) => h.state).sort()).toEqual([
      'ASSIGNED',
      'PENDING',
    ]);
    expect(JSON.stringify(result)).not.toMatch(/Private|foreign|draft/);
  });
  it('honours the membership in the requested company and sanitises related detail names', async () => {
    const full = await service.getPerson('a', 'hr', 'worker');
    expect(full.tier).toBe('FULL');
    expect(full.emsProfileUrl).toBe('/ems/employees/worker');
    expect(full.manager).toBeNull();
    expect(full.department).toBeNull();
    expect(full.role?.hrRecordOwner).toBeNull();
    expect((await service.getPerson('b', 'hr', 'foreign')).tier).toBe('BASIC');
    await expect(service.getPerson('a', 'hr', 'foreign')).rejects.toThrow(
      'Person not found',
    );
    await expect(service.getPerson('a', 'outsider', 'worker')).rejects.toThrow(
      'Company access denied',
    );
  });
  it('keeps an existing approval transaction snapshot while a concurrent employment change commits', async () => {
    await db.$transaction(
      async (tx) => {
        const before = await service.readDirectory(tx, 'a');
        expect(before.people.find((p) => p.id === 'lead')?.active).toBe(true);
        await db.$executeRaw`UPDATE "Employee" SET "employmentStatus" = 'RESIGNED' WHERE id = 'lead'`;
        expect(
          (await service.readDirectory(tx, 'a')).people.find(
            (p) => p.id === 'lead',
          )?.active,
        ).toBe(true);
      },
      { isolationLevel: 'RepeatableRead' },
    );
    const after = await service.getOrganisation('a');
    expect(after.people.find((p) => p.id === 'lead')?.active).toBe(false);
    expect(
      after.hodAssignments.find((h) => h.departmentId === 'd')?.state,
    ).toBe('NEEDS_ATTENTION');
  });
  it('reflects removed membership immediately instead of trusting a cached role', async () => {
    await db.$executeRaw`DELETE FROM "UserOrganization" WHERE "userId" = 'worker-login' AND "organizationId" = 'a'`;
    await expect(
      service.getPerson('a', 'worker-login', 'worker'),
    ).rejects.toThrow('Company access denied');
  });
});
