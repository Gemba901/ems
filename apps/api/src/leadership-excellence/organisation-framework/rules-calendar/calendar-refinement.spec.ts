import { initialRules, type CalendarRules } from "./calendar-model";
import { approvalSnapshot, makePeriods } from "./calendar-engine";
import { parseRules } from "./calendar-validation";
const rules = (): CalendarRules => ({
  ...initialRules(2027),
  name: "Office 2027",
});
describe("separate reporting and review frequency choices", () => {
  it("keeps monthly reviews when monthly reporting is unchecked", () => {
    const r = {
      ...rules(),
      enabledFrequencies: ["quarterly"] as CalendarRules["enabledFrequencies"],
    };
    const snapshot = approvalSnapshot(parseRules(r));
    expect(Object.keys(snapshot.periods)).toEqual(["quarterly"]);
    expect(snapshot.reviews).toHaveLength(12);
    expect(snapshot.reviews[0]).toMatchObject({
      start: "2027-01-01",
      end: "2027-01-31",
      completeBy: "2027-02-07",
    });
    expect(() => makePeriods(r, "monthly")).toThrow(/enabled/);
  });
  it("uses the same chosen weekly boundaries for weekly reviews and reports", () => {
    const r: CalendarRules = {
      ...rules(),
      enabledFrequencies: ["weekly"],
      reviewFrequency: "weekly",
      weekStart: 0,
    };
    const snapshot = approvalSnapshot(r);
    expect(snapshot.periods.weekly!.map((p) => [p.start, p.end])).toEqual(
      snapshot.reviews.map((p) => [p.start, p.end]),
    );
    expect(snapshot.reviews[1]).toMatchObject({
      start: "2027-01-03",
      end: "2027-01-09",
    });
  });
  it("validates and uses review-only anchors and monthly splits", () => {
    const r: CalendarRules = {
      ...rules(),
      enabledFrequencies: ["monthly"],
      reviewFrequency: "fortnightly",
      fortnightAnchor: "",
    };
    expect(() => approvalSnapshot(r)).toThrow(/anchor/);
    r.fortnightAnchor = "2027-01-04";
    expect(approvalSnapshot(r).reviews[1]).toMatchObject({
      start: "2027-01-04",
      end: "2027-01-17",
    });
    r.reviewFrequency = "twice-monthly";
    r.splitDay = 10;
    expect(approvalSnapshot(r).reviews[0]).toMatchObject({
      start: "2027-01-01",
      end: "2027-01-10",
    });
  });
  it("calculates a custom review interval without making it a reporting option", () => {
    const r: CalendarRules = {
      ...rules(),
      enabledFrequencies: ["monthly"],
      reviewFrequency: "custom",
      customInterval: { every: 3, unit: "MONTHS", anchor: "2027-02-01" },
    };
    const snapshot = approvalSnapshot(parseRules(r));
    expect(snapshot.periods.custom).toBeUndefined();
    expect(snapshot.reviews[1]).toMatchObject({
      start: "2027-02-01",
      end: "2027-04-30",
    });
    expect(() =>
      approvalSnapshot({
        ...r,
        customInterval: { ...r.customInterval!, anchor: "2027-02-02" },
      }),
    ).toThrow(/first day/);
  });
  it("retains the department supervisor as a selection rule without granting a role or choosing a person", () => {
    const r = rules();
    r.responsibilities.verifier = "DEPARTMENT_SUPERVISOR";
    const snapshot = approvalSnapshot(parseRules(r));
    expect(snapshot.rules.responsibilities.verifier).toBe(
      "DEPARTMENT_SUPERVISOR",
    );
    expect(snapshot.rules).not.toHaveProperty("verifierId");
  });
});
