import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "db";
import { PrismaService } from "src/prisma/prisma.service";
import { Role } from "src/common/enum/role.enum";
import { RulesCalendarService } from "./rules-calendar.service";
import { emptyAudience } from "./calendar-audience";
import type { CalendarAudience } from "./calendar-audience.types";
import { initialRules } from "./calendar-model";

// Opt-in, disposable database only. Never reads the app DATABASE_URL.
const url = process.env.LEX_CALENDAR_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
jest.setTimeout(30000);
suite("02.03 persisted calendar workflow on PostgreSQL", () => {
  const schema = `lex_calendar_${randomUUID().replace(/-/g, "")}`;
  let admin: PrismaClient, db: PrismaClient, service: RulesCalendarService;
  const management = { userId: "manager", role: Role.MANAGEMENT };
  const hr = { userId: "coordinator", role: Role.HR };
  const employee = { userId: "employee", role: Role.EMPLOYEE };
  const rules = () => ({ ...initialRules(2028), name: "FY 2028" });
  const create = () => service.create("org-a", hr, rules());
  beforeAll(async () => {
    admin = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url!, max: 2 }),
    });
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    db = new PrismaClient({
      adapter: new PrismaPg(
        { connectionString: url!, options: `-c search_path=${schema}`, max: 6 },
        { schema },
      ),
    });
    await db.$executeRawUnsafe(
      'CREATE TABLE "Organization" (id TEXT PRIMARY KEY)',
    );
    const sql = readFileSync(
      resolve(
        __dirname,
        "../../../../../..",
        "packages/db/prisma/migrations/20261107000000_lex_rules_calendar/migration.sql",
      ),
      "utf8",
    );
    for (const statement of sql
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean))
      await db.$executeRawUnsafe(statement);
    await db.$executeRaw`INSERT INTO "Organization" VALUES ('org-a'), ('org-b')`;
    await db.$executeRawUnsafe(
      'CREATE TABLE "Department" (id TEXT PRIMARY KEY, name TEXT NOT NULL, "organizationId" TEXT NOT NULL)',
    );
    await db.$executeRawUnsafe(
      'CREATE TABLE "Employee" (id TEXT PRIMARY KEY, "firstName" TEXT NOT NULL, "middleName" TEXT, "lastName" TEXT NOT NULL, "employeeCode" TEXT, "jobTitle" TEXT, "departmentId" TEXT, "plantBranch" TEXT, "employmentStatus" TEXT NOT NULL, "organizationId" TEXT NOT NULL)',
    );
    service = new RulesCalendarService(db as unknown as PrismaService);
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
  beforeEach(async () => {
    await db.lexPerformanceCalendar.deleteMany();
    await db.$executeRawUnsafe('DELETE FROM "Employee"');
    await db.$executeRawUnsafe('DELETE FROM "Department"');
    await db.$executeRaw`INSERT INTO "Department" (id,name,"organizationId") VALUES ('office','Office','org-a'),('ops','Operations','org-a'),('foreign-dept','Other company','org-b')`;
    await db.$executeRaw`INSERT INTO "Employee" (id,"firstName","lastName","employeeCode","jobTitle","departmentId","plantBranch","employmentStatus","organizationId") VALUES ('p-a','Amina','Office','A1','Coordinator','office','HQ','ACTIVE','org-a'),('p-b','Brian','Operations','B1','Operator','ops','Plant','PROBATION','org-a'),('p-foreign','Foreign','Person','X1','Operator','foreign-dept','Elsewhere','ACTIVE','org-b')`;
  });

  it("rejects a reversed-date create without persisting a calendar or audit event", async () => {
    await expect(
      service.create("org-a", hr, {
        ...rules(),
        start: "2027-01-01",
        end: "2026-12-31",
      }),
    ).rejects.toThrow(/on or after/);
    expect(await db.lexPerformanceCalendar.count()).toBe(0);
    expect(await db.lexPerformanceCalendarEvent.count()).toBe(0);
  });

  it("rejects a reversed-date save without changing the saved draft, revision or history", async () => {
    const row = await create();
    await expect(
      service.mutate("org-a", row.id, hr, "save", {
        expectedRevision: 0,
        rules: { ...rules(), start: "2027-01-01", end: "2026-12-31" },
      }),
    ).rejects.toThrow(/on or after/);
    expect(await service.read("org-a", row.id, hr)).toMatchObject({
      revision: 0,
      draft: { start: "2028-01-01", end: "2028-12-31" },
    });
    expect(await db.lexPerformanceCalendarEvent.count()).toBe(1);
  });

  it("allows correcting an invalid draft saved before the date fix", async () => {
    const row = await create();
    await db.lexPerformanceCalendar.update({
      where: { id: row.id },
      data: {
        draft: JSON.parse(
          JSON.stringify({
            ...rules(),
            start: "2027-01-01",
            end: "2026-12-31",
          }),
        ),
      },
    });
    await expect(
      service.mutate("org-a", row.id, management, "approve", {
        expectedRevision: 0,
      }),
    ).rejects.toMatchObject({
      status: 400,
      response: {
        message: expect.arrayContaining([expect.stringMatching(/on or after/)]),
      },
    });
    await service.mutate("org-a", row.id, hr, "save", {
      expectedRevision: 0,
      rules: { ...rules(), start: "2027-01-01", end: "2027-12-31" },
    });
    expect(await service.read("org-a", row.id, hr)).toMatchObject({
      revision: 1,
      draft: { start: "2027-01-01", end: "2027-12-31" },
    });
  });

  it("keeps drafts private; HR submits and management approves one immutable version", async () => {
    const row = await create();
    expect((await service.list("org-a", employee)).calendars).toEqual([]);
    await expect(service.read("org-a", row.id, employee)).rejects.toThrow(
      "No approved",
    );
    await expect(
      service.mutate("org-a", row.id, hr, "approve", { expectedRevision: 0 }),
    ).rejects.toThrow("permission");
    await service.mutate("org-a", row.id, hr, "submit", {
      expectedRevision: 0,
    });
    await expect(
      service.mutate("org-a", row.id, hr, "save", {
        expectedRevision: 1,
        rules: rules(),
      }),
    ).rejects.toThrow("draft");
    await service.mutate("org-a", row.id, management, "approve", {
      expectedRevision: 1,
    });
    expect(await service.getApproved("org-a", row.id, 1)).toMatchObject({
      version: 1,
      rules: { name: "FY 2028" },
    });
    expect(await service.read("org-a", row.id, employee)).not.toHaveProperty(
      "draft",
    );
    expect(await service.getApproved("org-a", row.id, 99)).toBeNull();
  });

  it("rejects cross-company reads, writes, history and version access", async () => {
    const row = await create();
    await expect(service.read("org-b", row.id, management)).rejects.toThrow(
      "not found",
    );
    await expect(
      service.mutate("org-b", row.id, management, "save", {
        expectedRevision: 0,
        rules: rules(),
      }),
    ).rejects.toThrow("not found");
    await expect(service.history("org-b", row.id, management)).rejects.toThrow(
      "not found",
    );
    expect(await service.getApproved("org-b", row.id)).toBeNull();
  });

  it("allows only one of two simultaneous approvals and commits matching history", async () => {
    const row = await create();
    const results = await Promise.allSettled([
      service.mutate("org-a", row.id, management, "approve", {
        expectedRevision: 0,
      }),
      service.mutate("org-a", row.id, management, "approve", {
        expectedRevision: 0,
      }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.lexPerformanceCalendarVersion.count()).toBe(1);
    expect(
      (await service.history("org-a", row.id, management)).filter(
        (e) => e.action === "APPROVE",
      ),
    ).toHaveLength(1);
    expect(await service.read("org-a", row.id, hr)).toMatchObject({
      revision: 1,
      status: "APPROVED",
    });
  });

  it("protects the old approved name, dates and responsibilities during revisions", async () => {
    const row = await create();
    await service.mutate("org-a", row.id, management, "approve", {
      expectedRevision: 0,
    });
    const old = await service.getApproved("org-a", row.id, 1);
    await service.mutate("org-a", row.id, hr, "revise", {
      expectedRevision: 1,
      reason: "Change future deadline defaults",
    });
    await service.mutate("org-a", row.id, hr, "save", {
      expectedRevision: 2,
      rules: { ...rules(), name: "Unpublished name", submissionDays: 5 },
    });
    expect((await service.list("org-a", employee)).calendars[0].name).toBe(
      "FY 2028",
    );
    expect(await service.getApproved("org-a", row.id)).toEqual(old);
    await service.mutate("org-a", row.id, management, "approve", {
      expectedRevision: 3,
    });
    expect(await service.getApproved("org-a", row.id, 1)).toEqual(old);
    expect(await service.getApproved("org-a", row.id, 2)).toMatchObject({
      rules: { name: "Unpublished name", submissionDays: 5 },
    });
  });

  it("retains an incomplete draft but refuses approval; stale saves cannot overwrite newer work", async () => {
    const row = await service.create("org-a", hr, {
      ...rules(),
      name: "",
      start: "",
    });
    await expect(
      service.mutate("org-a", row.id, management, "approve", {
        expectedRevision: 0,
      }),
    ).rejects.toThrow();
    await service.mutate("org-a", row.id, hr, "save", {
      expectedRevision: 0,
      rules: rules(),
    });
    await expect(
      service.mutate("org-a", row.id, hr, "save", {
        expectedRevision: 0,
        rules: { ...rules(), name: "Stale" },
      }),
    ).rejects.toThrow("another tab");
    expect(await service.read("org-a", row.id, hr)).toMatchObject({
      draft: { name: "FY 2028" },
      revision: 1,
    });
  });

  it("returns and withdraws through the expected workflow without publishing", async () => {
    const row = await create();
    await service.mutate("org-a", row.id, hr, "submit", {
      expectedRevision: 0,
    });
    await expect(
      service.mutate(
        "org-a",
        row.id,
        { ...hr, userId: "other-editor" },
        "withdraw",
        { expectedRevision: 1 },
      ),
    ).rejects.toThrow("submitter");
    await service.mutate("org-a", row.id, management, "return", {
      expectedRevision: 1,
      reason: "Check shutdown dates",
    });
    expect(await service.read("org-a", row.id, hr)).toMatchObject({
      status: "DRAFT",
      returnReason: "Check shutdown dates",
    });
    expect(await service.getApproved("org-a", row.id)).toBeNull();
  });
  it("does not grant a HOD company-wide calendar editing rights", async () => {
    await expect(
      service.create("org-a", { userId: "hod", role: Role.HOD }, rules()),
    ).rejects.toThrow("permission");
  });
  const assignmentRules = (
    name: string,
    kind: CalendarAudience["kind"],
    ids: string[] = [],
  ) => ({
    ...rules(),
    name,
    audience: {
      ...emptyAudience(),
      kind,
      label: name,
      employeeIds: kind === "PEOPLE" ? ids : [],
      departmentIds: kind === "DEPARTMENTS" ? ids : [],
    },
  });
  it("serializes concurrent publication of overlapping calendars on different rows", async () => {
    const [a, b] = await Promise.all([
      service.create(
        "org-a",
        hr,
        assignmentRules("Office A", "PEOPLE", ["p-a"]),
      ),
      service.create(
        "org-a",
        hr,
        assignmentRules("Office B", "PEOPLE", ["p-a"]),
      ),
    ]);
    const outcomes = await Promise.allSettled(
      [a, b].map((row) =>
        service.mutate("org-a", row.id, management, "approve", {
          expectedRevision: 0,
        }),
      ),
    );
    expect(outcomes.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.find(
      (x) => x.status === "rejected",
    ) as PromiseRejectedResult;
    expect(rejected.reason.message).toMatch(/overlaps/);
    expect(await db.lexPerformanceCalendarVersion.count()).toBe(1);
    expect(
      await db.lexPerformanceCalendarEvent.count({
        where: { action: "APPROVE" },
      }),
    ).toBe(1);
  });
  it("uses only approved assignments in comparison, with no draft names or person directory leak", async () => {
    const saved = await service.create(
      "org-a",
      hr,
      assignmentRules("Approved office", "COMPANY"),
    );
    await service.mutate("org-a", saved.id, management, "approve", {
      expectedRevision: 0,
    });
    await service.mutate("org-a", saved.id, hr, "revise", {
      expectedRevision: 1,
      reason: "New policy",
    });
    await service.mutate("org-a", saved.id, hr, "save", {
      expectedRevision: 2,
      rules: assignmentRules("Private new label", "PEOPLE", ["p-a"]),
    });
    const result = await service.comparison("org-a", employee, "2028-01");
    expect(result.activePeople).toBe(2);
    expect(result.rows[0]).toMatchObject({
      name: "Approved office",
      kind: "COMPANY",
      version: 1,
    });
    expect(result.days[0]).toMatchObject({
      assigned: 2,
      conflicts: 0,
      unassigned: 0,
    });
    expect(JSON.stringify(result)).not.toMatch(
      /Private new label|p-a|Amina|Foreign/,
    );
  });
  it("uses stable group identities while preserving an old pinned version after revision", async () => {
    const saved = await service.create(
      "org-a",
      hr,
      assignmentRules("Office", "PEOPLE", ["p-a"]),
    );
    await service.mutate("org-a", saved.id, management, "approve", {
      expectedRevision: 0,
    });
    expect(
      await service.getCurrentAssignment("org-a", "p-a", "2028-01-01"),
    ).toMatchObject({ status: "ASSIGNED", version: 1, calendarId: saved.id });
    await service.mutate("org-a", saved.id, hr, "revise", {
      expectedRevision: 1,
      reason: "Change membership",
    });
    await service.mutate("org-a", saved.id, hr, "save", {
      expectedRevision: 2,
      rules: assignmentRules("Office", "PEOPLE", ["p-b"]),
    });
    await service.mutate("org-a", saved.id, management, "approve", {
      expectedRevision: 3,
    });
    expect(
      (await service.getApproved("org-a", saved.id, 1))?.rules.audience
        ?.employeeIds,
    ).toEqual(["p-a"]);
    expect(
      (await service.getCurrentAssignment("org-a", "p-a", "2028-01-01")).status,
    ).toBe("UNASSIGNED");
    expect(
      await service.getCurrentAssignment("org-a", "p-b", "2028-01-01"),
    ).toMatchObject({ status: "ASSIGNED", version: 2 });
  });
  it("rejects foreign department/person assignments and unauthorized directory access before mutation", async () => {
    await expect(
      service.create(
        "org-a",
        hr,
        assignmentRules("Bad", "PEOPLE", ["p-foreign"]),
      ),
    ).rejects.toMatchObject({
      response: {
        statusCode: 400,
        message: expect.arrayContaining([expect.stringMatching(/company/)]),
      },
    });
    await expect(
      service.create(
        "org-a",
        hr,
        assignmentRules("Bad", "DEPARTMENTS", ["foreign-dept"]),
      ),
    ).rejects.toMatchObject({
      response: {
        statusCode: 400,
        message: expect.arrayContaining([expect.stringMatching(/company/)]),
      },
    });
    expect(await db.lexPerformanceCalendar.count()).toBe(0);
    await expect(service.directory("org-a", employee)).rejects.toThrow(
      /permission/,
    );
    await expect(
      service.directory("org-a", { userId: "hod", role: Role.HOD }),
    ).rejects.toThrow(/permission/);
    await expect(
      service.getCurrentAssignment("org-a", "p-foreign", "2028-01-01"),
    ).rejects.toThrow(/not found/);
    const d = await service.directory("org-a", hr);
    expect(d.people.map((p) => p.id).sort()).toEqual(["p-a", "p-b"]);
  });
  it("accepts company, department and named-group overrides without double counting people", async () => {
    const selections = [
      assignmentRules("Default", "COMPANY"),
      assignmentRules("Office", "DEPARTMENTS", ["office"]),
      {
        ...assignmentRules("Operations Saturdays", "PEOPLE", ["p-b"]),
        workdays: [1, 2, 3, 4, 5, 6],
      },
    ];
    for (const r of selections) {
      const saved = await service.create("org-a", hr, r);
      await service.mutate("org-a", saved.id, management, "approve", {
        expectedRevision: 0,
      });
    }
    const result = await service.comparison("org-a", employee, "2028-01");
    expect(result.days[0]).toMatchObject({
      assigned: 2,
      conflicts: 0,
      unassigned: 0,
    });
    expect(
      result.rows.find((r) => r.name === "Default")!.cells[0].effectivePeople,
    ).toBe(0);
    expect(
      result.rows.find((r) => r.name === "Office")!.cells[0],
    ).toMatchObject({ working: false, effectivePeople: 1 });
    expect(
      result.rows.find((r) => r.name === "Operations Saturdays")!.cells[0],
    ).toMatchObject({ working: true, effectivePeople: 1 });
  });
  it("rejects deleted membership at approval and leaves the saved draft intact", async () => {
    const saved = await service.create(
      "org-a",
      hr,
      assignmentRules("Office", "PEOPLE", ["p-a"]),
    );
    await db.$executeRaw`DELETE FROM "Employee" WHERE id='p-a'`;
    await expect(
      service.mutate("org-a", saved.id, management, "approve", {
        expectedRevision: 0,
      }),
    ).rejects.toMatchObject({
      response: {
        statusCode: 400,
        message: expect.arrayContaining([expect.stringMatching(/no longer/)]),
      },
    });
    const current = await service.read("org-a", saved.id, hr);
    expect(current).toMatchObject({ status: "DRAFT", revision: 0 });
    expect(await db.lexPerformanceCalendarVersion.count()).toBe(0);
  });
  it("reports overlap in preview without excluding another company's calendar ID", async () => {
    const saved = await service.create(
      "org-a",
      hr,
      assignmentRules("Original", "COMPANY"),
    );
    await service.mutate("org-a", saved.id, management, "approve", {
      expectedRevision: 0,
    });
    const result = await service.assignmentPreview(
      "org-a",
      hr,
      assignmentRules("Second", "COMPANY"),
    );
    expect(result.conflicts[0]).toMatchObject({
      calendarId: saved.id,
      name: "Original",
    });
    const other = await service.create(
      "org-b",
      hr,
      assignmentRules("Other", "COMPANY"),
    );
    await expect(
      service.assignmentPreview(
        "org-a",
        hr,
        assignmentRules("Second", "COMPANY"),
        other.id,
      ),
    ).rejects.toThrow(/not found/);
  });
  it("deletes only an unapproved draft and its draft-only history", async () => {
    const row = await create();
    await service.mutate("org-a", row.id, hr, "delete", {
      expectedRevision: 0,
    });
    expect(await db.lexPerformanceCalendar.count()).toBe(0);
    expect(await db.lexPerformanceCalendarEvent.count()).toBe(0);
    await expect(service.read("org-a", row.id, hr)).rejects.toThrow(
      /not found/,
    );
  });
  it("rejects stale, foreign-company and unauthorized deletion", async () => {
    const row = await create();
    await service.mutate("org-a", row.id, hr, "save", {
      expectedRevision: 0,
      rules: rules(),
    });
    await expect(
      service.mutate("org-a", row.id, hr, "delete", { expectedRevision: 0 }),
    ).rejects.toThrow(/changed/);
    await expect(
      service.mutate("org-b", row.id, hr, "delete", { expectedRevision: 1 }),
    ).rejects.toThrow(/not found/);
    await expect(
      service.mutate("org-a", row.id, employee, "delete", {
        expectedRevision: 1,
      }),
    ).rejects.toThrow(/permission/);
    expect(await db.lexPerformanceCalendar.count()).toBe(1);
  });
  it("does not delete submitted drafts or calendars with approved versions", async () => {
    const row = await create();
    await service.mutate("org-a", row.id, hr, "submit", {
      expectedRevision: 0,
    });
    await expect(
      service.mutate("org-a", row.id, hr, "delete", { expectedRevision: 1 }),
    ).rejects.toThrow();
    await service.mutate("org-a", row.id, management, "approve", {
      expectedRevision: 1,
    });
    await service.mutate("org-a", row.id, hr, "revise", {
      expectedRevision: 2,
      reason: "New revision",
    });
    await expect(
      service.mutate("org-a", row.id, hr, "delete", { expectedRevision: 3 }),
    ).rejects.toThrow(/approved/);
    expect(await db.lexPerformanceCalendarVersion.count()).toBe(1);
  });
  it("discards a revision without changing approved rules, dates, memberships or version history", async () => {
    const row = await service.create(
      "org-a",
      hr,
      assignmentRules("Approved", "PEOPLE", ["p-a"]),
    );
    await service.mutate("org-a", row.id, management, "approve", {
      expectedRevision: 0,
    });
    const before = await service.getApproved("org-a", row.id, 1);
    await service.mutate("org-a", row.id, hr, "revise", {
      expectedRevision: 1,
      reason: "Change coverage",
    });
    await service.mutate("org-a", row.id, hr, "save", {
      expectedRevision: 2,
      rules: assignmentRules("Private new name", "PEOPLE", ["p-b"]),
    });
    await service.mutate("org-a", row.id, hr, "discard-revision", {
      expectedRevision: 3,
    });
    expect(await service.getApproved("org-a", row.id, 1)).toEqual(before);
    const restored = await service.read("org-a", row.id, hr);
    expect(restored).toMatchObject({
      status: "APPROVED",
      revision: 4,
      draft: { name: "Approved", audience: { employeeIds: ["p-a"] } },
    });
    expect(await db.lexPerformanceCalendarVersion.count()).toBe(1);
    expect(
      await db.lexPerformanceCalendarEvent.count({
        where: { action: "DISCARD-REVISION" },
      }),
    ).toBe(1);
    await expect(
      service.mutate("org-a", row.id, hr, "discard-revision", {
        expectedRevision: 4,
      }),
    ).rejects.toThrow();
  });
  it("rejects discard without an approved version, stale revision or foreign company", async () => {
    const row = await create();
    await expect(
      service.mutate("org-a", row.id, hr, "discard-revision", {
        expectedRevision: 0,
      }),
    ).rejects.toThrow(/no approved/);
    await service.mutate("org-a", row.id, management, "approve", {
      expectedRevision: 0,
    });
    await service.mutate("org-a", row.id, hr, "revise", {
      expectedRevision: 1,
      reason: "Revision",
    });
    await expect(
      service.mutate("org-a", row.id, hr, "discard-revision", {
        expectedRevision: 1,
      }),
    ).rejects.toThrow(/changed/);
    await expect(
      service.mutate("org-b", row.id, hr, "discard-revision", {
        expectedRevision: 2,
      }),
    ).rejects.toThrow(/not found/);
    await expect(
      service.mutate("org-a", row.id, employee, "discard-revision", {
        expectedRevision: 2,
      }),
    ).rejects.toThrow(/permission/);
    expect((await service.read("org-a", row.id, hr)).status).toBe("DRAFT");
  });
  it("allows only one winner when deleting a draft races approval", async () => {
    const row = await create();
    const results = await Promise.allSettled([
      service.mutate("org-a", row.id, management, "approve", {
        expectedRevision: 0,
      }),
      service.mutate("org-a", row.id, hr, "delete", { expectedRevision: 0 }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const current = await db.lexPerformanceCalendar.findUnique({
      where: { id: row.id },
    });
    if (current) {
      expect(current.status).toBe("APPROVED");
      expect(await db.lexPerformanceCalendarVersion.count()).toBe(1);
    } else expect(await db.lexPerformanceCalendarVersion.count()).toBe(0);
  });
  it("allows only one winner when discarding a revision races a new approval", async () => {
    const row = await create();
    await service.mutate("org-a", row.id, management, "approve", {
      expectedRevision: 0,
    });
    const original = await service.getApproved("org-a", row.id, 1);
    await service.mutate("org-a", row.id, hr, "revise", {
      expectedRevision: 1,
      reason: "Revision",
    });
    const results = await Promise.allSettled([
      service.mutate("org-a", row.id, management, "approve", {
        expectedRevision: 2,
      }),
      service.mutate("org-a", row.id, hr, "discard-revision", {
        expectedRevision: 2,
      }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await service.getApproved("org-a", row.id, 1)).toEqual(original);
    expect((await service.read("org-a", row.id, hr)).status).toBe("APPROVED");
  });
});
