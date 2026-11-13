import {
  approvalSnapshot,
  calendarErrors,
  dayStatus,
  makePeriods,
} from "./calendar-engine";
import { initialRules, FREQUENCIES } from "./calendar-model";
import { parseRules } from "./calendar-validation";
import { cycleDateIssue } from "./cycle-dates";

const rules = () => ({
  ...initialRules(2028, "Africa/Nairobi"),
  name: "2028 plan",
  enabledFrequencies: [...FREQUENCIES],
  workdays: [0, 1, 2, 3, 4, 5, 6],
});
describe("02.03 calendar semantics", () => {
  it("rejects reversed dates in January 2027 / December 2026 before generating periods", () => {
    const r = { ...rules(), start: "2027-01-01", end: "2026-12-31" };
    expect(cycleDateIssue(r.start, r.end, true)).toMatch(/on or after/);
    expect(calendarErrors(r).join(" ")).toMatch(/on or after/);
    expect(() => makePeriods(r, "monthly")).toThrow(/on or after/);
    expect(() => approvalSnapshot(r)).toThrow(/on or after/);
  });
  it("distinguishes an unfinished draft from invalid dates and supports leap days", () => {
    expect(cycleDateIssue("", "2027-12-31", true)).toBe("");
    expect(cycleDateIssue("", "2027-12-31")).toMatch(/both cycle dates/);
    expect(cycleDateIssue("2027-02-29", "2027-03-01", true)).toMatch(
      /valid cycle dates/,
    );
    expect(cycleDateIssue("2028-02-29", "2028-03-01", true)).toBe("");
    expect(cycleDateIssue("2027-01-01", "2027-01-01", true)).toBe("");
  });
  it("retains leap day and represents an agreed holiday as not scheduled with its reason", () => {
    const r = rules();
    r.start = "2028-02-01";
    r.end = "2028-02-29";
    r.exceptions = [
      {
        date: "2028-02-29",
        kind: "NON_WORKING",
        reason: "Company shutdown",
        source: "MANUAL",
      },
    ];
    const days = makePeriods(r, "daily");
    expect(days).toHaveLength(29);
    expect(days.at(-1)).toMatchObject({
      scheduled: false,
      submitBy: null,
      verifyBy: null,
      reasons: ["2028-02-29: Company shutdown"],
    });
    expect(makePeriods(r, "monthly")[0]).toMatchObject({
      scheduled: true,
      workingDays: 28,
    });
  });
  it("keeps 14-day anchors, twice-monthly splits and cross-month periods distinct", () => {
    const r = rules();
    r.end = "2028-02-29";
    r.fortnightAnchor = "2027-12-27";
    expect(
      makePeriods(r, "fortnightly")
        .slice(0, 3)
        .map((p) => [p.naturalStart, p.naturalEnd]),
    ).toEqual([
      ["2027-12-27", "2028-01-09"],
      ["2028-01-10", "2028-01-23"],
      ["2028-01-24", "2028-02-06"],
    ]);
    expect(
      makePeriods(r, "twice-monthly").map((p) => [p.start, p.end]),
    ).toEqual([
      ["2028-01-01", "2028-01-15"],
      ["2028-01-16", "2028-01-31"],
      ["2028-02-01", "2028-02-15"],
      ["2028-02-16", "2028-02-29"],
    ]);
  });
  it("works when the 14-day anchor is after the cycle begins", () => {
    const r = rules();
    r.fortnightAnchor = "2028-02-07";
    r.end = "2028-01-31";
    expect(makePeriods(r, "fortnightly")[0]).toMatchObject({
      naturalStart: "2027-12-27",
      naturalEnd: "2028-01-09",
      partial: true,
    });
  });
  it("uses the fiscal start month for quarters and labels partial boundaries", () => {
    const r = rules();
    r.start = "2028-04-15";
    r.end = "2029-03-10";
    expect(
      makePeriods(r, "quarterly").map((p) => [p.start, p.end, p.partial]),
    ).toEqual([
      ["2028-04-15", "2028-06-30", true],
      ["2028-07-01", "2028-09-30", false],
      ["2028-10-01", "2028-12-31", false],
      ["2029-01-01", "2029-03-10", true],
    ]);
  });
  it.each(FREQUENCIES)(
    "%s covers every cycle day once without gaps or overlaps",
    (frequency) => {
      const r = rules();
      r.start = "2028-01-17";
      r.end = "2029-02-23";
      const ps = makePeriods(r, frequency);
      expect(ps[0].start).toBe(r.start);
      expect(ps.at(-1)?.end).toBe(r.end);
      for (let i = 1; i < ps.length; i++)
        expect(Date.parse(ps[i].start) - Date.parse(ps[i - 1].end)).toBe(
          86400000,
        );
      expect(ps.reduce((sum, p) => sum + p.workingDays, 0)).toBe(
        (Date.parse(r.end) - Date.parse(r.start)) / 86400000 + 1,
      );
    },
  );
  it("does not move a deadline unless the configured rule requires it", () => {
    const r = rules();
    r.start = r.end = "2028-01-07";
    r.workdays = [1, 2, 3, 4, 5]; // Friday
    expect(makePeriods(r, "daily")[0].submitBy?.date).toBe("2028-01-08");
    r.submissionRoll = "NEXT_WORKING";
    expect(makePeriods(r, "daily")[0].submitBy?.date).toBe("2028-01-10");
    r.submissionDayType = "WORKING";
    r.submissionDays = 2;
    expect(makePeriods(r, "daily")[0].submitBy?.date).toBe("2028-01-11");
    expect(makePeriods(r, "daily")[0].submitBy).toMatchObject({
      time: "17:00",
      timeZone: "Africa/Nairobi",
    });
  });
  it("explicit working dates override a normal weekend", () => {
    const r = rules();
    r.workdays = [1, 2, 3, 4, 5];
    r.exceptions = [
      {
        date: "2028-01-08",
        kind: "WORKING",
        reason: "Approved catch-up day",
        source: "MANUAL",
      },
    ];
    expect(dayStatus(r, "2028-01-08")).toEqual({
      working: true,
      reason: "Approved catch-up day",
    });
  });
  it("rejects invalid dates, duplicate exceptions and missing reasons before approval", () => {
    const r = rules();
    r.exceptions = [
      { date: "2028-02-30", kind: "NON_WORKING", reason: "", source: "MANUAL" },
      { date: "2028-02-30", kind: "WORKING", reason: "Test", source: "MANUAL" },
    ];
    expect(calendarErrors(r).join(" ")).toMatch(/date is invalid/);
    expect(calendarErrors(r).join(" ")).toMatch(/only one/);
    expect(() => approvalSnapshot(r)).toThrow();
  });
  it("validates untrusted settings without accepting organisation IDs or illegal choices", () => {
    expect(() => parseRules({ ...rules(), splitDay: 31 })).toThrow();
    expect(() => parseRules({ ...rules(), exceptions: "no" })).toThrow();
    expect(() =>
      parseRules({
        ...rules(),
        responsibilities: {
          ...rules().responsibilities,
          verifier: "SUPER_ADMIN",
        },
      }),
    ).toThrow();
    expect(
      parseRules({ ...rules(), organizationId: "other" }),
    ).not.toHaveProperty("organizationId");
  });
  it("keeps approval snapshots independent of later edits and includes separate review windows", () => {
    const r = rules();
    const s = approvalSnapshot(r);
    r.name = "Changed";
    r.reviewDays = 30;
    r.exceptions.push({
      date: "2028-01-01",
      kind: "NON_WORKING",
      reason: "New",
      source: "MANUAL",
    });
    expect(s.rules.name).toBe("2028 plan");
    expect(s.periods.daily![0].scheduled).toBe(true);
    expect(s.reviews[0]).toEqual({
      start: "2028-01-01",
      end: "2028-01-31",
      completeBy: "2028-02-07",
    });
  });
  it("has a finite failure for a shutdown covering the whole submission allowance", () => {
    const r = rules();
    r.start = r.end = "2028-01-01";
    r.submissionRoll = "NEXT_WORKING";
    for (let i = 1; i <= 120; i++)
      r.exceptions.push({
        date: new Date(Date.parse("2028-01-01") + i * 86400000)
          .toISOString()
          .slice(0, 10),
        kind: "NON_WORKING",
        reason: "Shutdown",
        source: "MANUAL",
      });
    expect(() => makePeriods(r, "daily")).toThrow(/120 days/);
  });
});
