import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "db";
import { PrismaService } from "src/prisma/prisma.service";
import { Role } from "src/common/enum/role.enum";
import { RulesCalendarService } from "./rules-calendar.service";
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
});
