import { initialRules, CalendarRules } from "./calendar-model";
import { parseRules } from "./calendar-validation";
import { RulesCalendarService } from "./rules-calendar.service";
import { PrismaService } from "src/prisma/prisma.service";
import { Role } from "src/common/enum/role.enum";

const before = (): CalendarRules => ({
  ...initialRules(2027),
  country: "KE",
  exceptions: [
    {
      date: "2027-10-11",
      reason: "Mazingira Day",
      kind: "NON_WORKING",
      source: "HOLIDAY_SUGGESTION",
      category: "OBSERVED_PUBLIC_HOLIDAY",
      originalDate: "2027-10-10",
      holidayCountry: "KE",
    },
  ],
});
function setup(draft = before()) {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    lexPerformanceCalendar: {
      findFirst: jest
        .fn()
        .mockResolvedValue({
          id: "cal",
          organizationId: "org",
          revision: 3,
          status: "DRAFT",
          currentVersion: 0,
          draft,
        }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    lexPerformanceCalendarEvent: { create: jest.fn().mockResolvedValue({}) },
  };
  const db = { $transaction: jest.fn(async (work) => work(tx)) };
  return {
    tx,
    service: new RulesCalendarService(db as unknown as PrismaService),
  };
}
describe("accepted holiday changes", () => {
  it("keeps holiday provenance through rule parsing and rejects unknown categories", () => {
    expect(parseRules(before()).exceptions).toEqual(before().exceptions);
    expect(() =>
      parseRules({
        ...before(),
        exceptions: [{ ...before().exceptions[0], category: "UNKNOWN" }],
      }),
    ).toThrow();
  });
  it.each(["remove", "working", "move"])(
    "rejects a %s without a recorded reason before any write",
    async (change) => {
      const { tx, service } = setup();
      const r = before();
      r.exceptions =
        change === "remove"
          ? []
          : [
              {
                ...r.exceptions[0],
                ...(change === "working"
                  ? { kind: "WORKING" as const }
                  : { date: "2027-10-12" }),
              },
            ];
      await expect(
        service.mutate("org", "cal", { userId: "hr", role: Role.HR }, "save", {
          expectedRevision: 3,
          rules: r,
        }),
      ).rejects.toThrow(/Give a reason/);
      expect(tx.lexPerformanceCalendar.updateMany).not.toHaveBeenCalled();
      expect(tx.lexPerformanceCalendarEvent.create).not.toHaveBeenCalled();
    },
  );
  it("saves a justified removal and includes its reason in the audit snapshot", async () => {
    const { tx, service } = setup();
    const r = {
      ...before(),
      exceptions: [],
      holidayOmissions: [
        {
          date: "2027-10-11",
          country: "KE",
          name: "Mazingira Day",
          reason: "This site remains open",
        },
      ],
    };
    await expect(
      service.mutate("org", "cal", { userId: "hr", role: Role.HR }, "save", {
        expectedRevision: 3,
        rules: r,
      }),
    ).resolves.toEqual({ id: "cal", revision: 4 });
    expect(
      tx.lexPerformanceCalendarEvent.create.mock.calls[0][0].data.snapshot
        .holidayOmissions,
    ).toEqual(r.holidayOmissions);
  });
  it("does not let a name edit strip an accepted holiday's provenance", async () => {
    const { tx, service } = setup();
    const r = before();
    r.exceptions = [
      {
        date: "2027-10-11",
        reason: "Updated name",
        kind: "NON_WORKING",
        source: "MANUAL",
      },
    ];
    await service.mutate(
      "org",
      "cal",
      { userId: "hr", role: Role.HR },
      "save",
      { expectedRevision: 3, rules: r },
    );
    expect(
      tx.lexPerformanceCalendar.updateMany.mock.calls[0][0].data.draft
        .exceptions[0],
    ).toMatchObject({
      reason: "Updated name",
      source: "HOLIDAY_SUGGESTION",
      category: "OBSERVED_PUBLIC_HOLIDAY",
      holidayCountry: "KE",
    });
  });
  it("allows removing an optional company closure without a public-holiday reason", async () => {
    const r = before();
    r.exceptions[0].category = "OPTIONAL_CLOSURE";
    const { service } = setup(r);
    await expect(
      service.mutate("org", "cal", { userId: "hr", role: Role.HR }, "save", {
        expectedRevision: 3,
        rules: { ...r, exceptions: [] },
      }),
    ).resolves.toEqual({ id: "cal", revision: 4 });
  });
});
