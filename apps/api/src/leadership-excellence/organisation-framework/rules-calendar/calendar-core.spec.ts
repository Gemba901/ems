import {
  initialRules,
  enabledFrequencies,
  CalendarRules,
} from "./calendar-model";
import {
  approvalSnapshot,
  makePeriods,
  verificationDeadline,
  reviewPeriods,
  allowanceDeadline,
  reviewWarnings,
} from "./calendar-engine";
import { parseRules } from "./calendar-validation";
import { RulesCalendarService } from "./rules-calendar.service";
import { PrismaService } from "src/prisma/prisma.service";
const base = (): CalendarRules => ({
  ...initialRules(2027),
  name: "Office 2027",
});
describe("selected reporting rules and stable versions", () => {
  it("allows unnamed date previews while requiring a name at approval", () => {
    const r = initialRules(2027);
    expect(makePeriods(r, "monthly")).toHaveLength(12);
    const service = new RulesCalendarService({} as PrismaService);
    expect(service.preview(r, "monthly").periods).toHaveLength(12);
    expect(() => approvalSnapshot(r)).toThrow(/name/);
  });
  it("new cycles select monthly and quarterly; existing rules retain their original eight choices", () => {
    expect(enabledFrequencies(base())).toEqual(["monthly", "quarterly"]);
    const old = base();
    delete old.enabledFrequencies;
    expect(enabledFrequencies(parseRules(old))).toHaveLength(8);
    expect(approvalSnapshot(old).periods.daily).toHaveLength(365);
    expect(Object.keys(approvalSnapshot(base()).periods)).toEqual([
      "monthly",
      "quarterly",
    ]);
    expect(() => makePeriods(base(), "daily")).toThrow(/enabled/);
  });
  it("does not require an unused 14-day anchor", () => {
    const r = { ...base(), fortnightAnchor: "" };
    expect(makePeriods(r, "monthly")).toHaveLength(12);
    expect(() =>
      makePeriods(
        { ...r, enabledFrequencies: ["monthly", "fortnightly"] },
        "fortnightly",
      ),
    ).toThrow(/anchor/);
  });
  it("aligns two-month periods to the chosen month and clips cycle edges", () => {
    const r: CalendarRules = {
      ...base(),
      enabledFrequencies: ["monthly", "every-two-months"],
      start: "2027-01-15",
      end: "2027-04-20",
      twoMonthAnchor: "2027-02-01",
    };
    expect(
      makePeriods(r, "every-two-months").map((p) => [
        p.naturalStart,
        p.naturalEnd,
        p.start,
        p.end,
      ]),
    ).toEqual([
      ["2026-12-01", "2027-01-31", "2027-01-15", "2027-01-31"],
      ["2027-02-01", "2027-03-31", "2027-02-01", "2027-03-31"],
      ["2027-04-01", "2027-05-31", "2027-04-01", "2027-04-20"],
    ]);
  });
  it.each([
    ["DAYS", 10, "2027-01-10"],
    ["WEEKS", 3, "2027-01-21"],
    ["MONTHS", 2, "2027-02-28"],
  ] as const)("supports custom %s periods", (unit, every, end) => {
    const r: CalendarRules = {
      ...base(),
      enabledFrequencies: ["custom"],
      reviewFrequency: "custom",
      customInterval: { every, unit, anchor: "2027-01-01" },
    };
    const ps = makePeriods(parseRules(r), "custom");
    expect(ps[0].end).toBe(end);
    expect(ps.at(-1)?.end).toBe(r.end);
    for (let i = 1; i < ps.length; i++)
      expect(Date.parse(ps[i].start) - Date.parse(ps[i - 1].end)).toBe(
        86400000,
      );
  });
  it("rejects invalid custom intervals, month anchors and unsupported review frequencies", () => {
    expect(() => parseRules({ ...base(), enabledFrequencies: [] })).toThrow();
    for (const every of [0, -1, 1.5, 366])
      expect(() =>
        parseRules({
          ...base(),
          customInterval: { every, unit: "DAYS", anchor: "2027-01-01" },
        }),
      ).toThrow();
    expect(() =>
      parseRules({
        ...base(),
        customInterval: {
          every: 1,
          unit: "WORKING_DAYS",
          anchor: "2027-01-01",
        },
      }),
    ).toThrow();
    expect(() =>
      approvalSnapshot({
        ...base(),
        enabledFrequencies: ["custom", "monthly"],
        customInterval: { every: 2, unit: "MONTHS", anchor: "2027-01-31" },
      }),
    ).toThrow(/first day/);
    expect(() =>
      approvalSnapshot({ ...base(), reviewFrequency: "unsupported" as never }),
    ).toThrow(/review/);
  });
  it("keeps fixed verification clock independent of early receipt and leaves actual-receipt preview undated", () => {
    const r = base();
    expect(verificationDeadline(r, "2027-02-02", "2027-02-01")).toBe(
      "2027-02-04",
    );
    r.verificationBasis = "ACTUAL_SUBMISSION";
    expect(verificationDeadline(r, "2027-02-02", "2027-02-01")).toBe(
      "2027-02-03",
    );
    expect(verificationDeadline(r, "2027-02-02", "2027-02-08")).toBe(
      "2027-02-10",
    );
    expect(approvalSnapshot(r).periods.monthly![0]).toMatchObject({
      verifyBy: null,
      verificationPendingSubmission: true,
    });
    expect(() => verificationDeadline(r, "2027-02-02", "not a date")).toThrow(
      /valid/,
    );
  });
  it("counts working verification days and independently calculates review deadlines from review period end", () => {
    const r: CalendarRules = {
      ...base(),
      verificationDayType: "WORKING",
      reviewDayType: "WORKING",
      reviewDays: 2,
    };
    expect(verificationDeadline(r, "2027-02-05")).toBe("2027-02-09");
    expect(reviewPeriods(r)[0].completeBy).toBe("2027-02-02");
    r.verificationDays = 1;
    r.verificationDayType = "CALENDAR";
    r.verificationRoll = "NEXT_WORKING";
    expect(verificationDeadline(r, "2027-02-05")).toBe("2027-02-08");
    r.exceptions = [
      {
        date: "2027-02-08",
        kind: "NON_WORKING",
        reason: "Shutdown",
        source: "MANUAL",
      },
    ];
    expect(verificationDeadline(r, "2027-02-05")).toBe("2027-02-09");
  });
  it("bounds all working-day deadline searches", () => {
    const r = base();
    r.workdays = [];
    expect(() =>
      allowanceDeadline(r, "2027-01-01", 1, "WORKING", "NONE", "Review"),
    ).toThrow(/120 days/);
  });
  it("saves omission reasons as explicit decisions without inventing closure dates", () => {
    const r = base();
    r.holidayOmissions = [
      {
        date: "2027-05-01",
        name: "Labour Day",
        country: "KE",
        reason: "Calendar covers another country",
      },
    ];
    expect(parseRules(r).holidayOmissions).toEqual(r.holidayOmissions);
    const frozen = approvalSnapshot(r);
    r.holidayOmissions[0].reason = "changed";
    expect(frozen.rules.holidayOmissions![0].reason).toBe(
      "Calendar covers another country",
    );
    expect(frozen.rules.exceptions).toEqual([]);
    expect(() =>
      approvalSnapshot({
        ...r,
        holidayOmissions: [{ ...r.holidayOmissions![0], reason: "" }],
      }),
    ).toThrow(/reason/);
  });
});

describe("stored approval compatibility", () => {
  it("reads the exact pinned format-1 snapshot without recalculating dates or substituting current settings", async () => {
    const snapshot = {
      format: 1,
      rules: { ...base(), name: "Historic rules" },
      periods: {
        monthly: [
          {
            start: "2027-01-01",
            end: "2027-01-31",
            submitBy: {
              date: "2027-02-17",
              time: "09:00",
              timeZone: "Africa/Nairobi",
            },
          },
        ],
      },
      reviews: [],
    };
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      lexPerformanceCalendar: {
        findFirst: jest.fn().mockResolvedValue({ currentVersion: 4 }),
      },
      lexPerformanceCalendarVersion: {
        findFirst: jest.fn().mockResolvedValue({
          snapshot,
          version: 1,
          approvedAt: new Date("2027-01-01T00:00:00Z"),
          approvedByUserId: "manager",
        }),
      },
    };
    const service = new RulesCalendarService({
      $transaction: async (fn: (t: unknown) => unknown) => fn(tx),
    } as unknown as PrismaService);
    const result = await service.getApproved("org-a", "cycle", 1);
    expect(result).toMatchObject(snapshot);
    expect(result!.periods).toEqual(snapshot.periods);
    expect(tx.lexPerformanceCalendarVersion.findFirst).toHaveBeenCalledWith({
      where: { organizationId: "org-a", calendarId: "cycle", version: 1 },
    });
    tx.lexPerformanceCalendarVersion.findFirst.mockResolvedValue(null);
    expect(await service.getApproved("org-a", "cycle", 99)).toBeNull();
  });
});

it("warns when fixed reviews precede verification and keeps receipt-dependent timing explicit", () => {
  const r = { ...base(), reviewDays: 0 };
  expect(approvalSnapshot(r).warnings?.[0]).toMatch(/before/);
  expect(approvalSnapshot({ ...r, reviewDays: 7 }).warnings).toEqual([]);
  expect(
    approvalSnapshot({ ...r, verificationBasis: "ACTUAL_SUBMISSION" })
      .warnings?.[0],
  ).toMatch(/actual submission/);
});

it("rejects a working verification deadline beyond the configured special-date coverage", () => {
  const r = base();
  r.end = "2027-01-31";
  r.verificationDays = 60;
  r.verificationDayType = "WORKING";
  expect(() => verificationDeadline(r, "2027-04-01")).toThrow(
    /120 days after cycle end/,
  );
});
