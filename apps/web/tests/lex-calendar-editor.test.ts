import { test } from "node:test";
import assert from "node:assert/strict";
import { initialRules } from "../components/leadership-excellence/organisation-framework/rules-calendar/calendar-model";
import {
  acceptedExceptions,
  cycleYears,
  cycleMonths,
  displayDate,
  exceptionIssue,
  mergeSuggestions,
  responsibilityChoices,
  suggestedCycleEnd,
} from "../components/leadership-excellence/organisation-framework/rules-calendar/calendar-editor";
import type { HolidaySuggestion } from "../services/leadership-excellence/rules-calendar.service";
const h = (date: string, reason = "Holiday"): HolidaySuggestion => ({
  date,
  reason,
  kind: "NON_WORKING",
  source: "HOLIDAY_SUGGESTION",
});

test("new cycle suggestions follow calendar/financial years, including a leap-day start", () => {
  assert.equal(suggestedCycleEnd("2027-01-01"), "2027-12-31");
  assert.equal(suggestedCycleEnd("2027-04-01"), "2028-03-31");
  assert.equal(suggestedCycleEnd("2028-02-29"), "2029-02-28");
});
test("holiday lookup covers every cycle year and stops for invalid dates", () => {
  assert.deepEqual(cycleYears("2027-04-01", "2028-03-31"), [2027, 2028]);
  assert.deepEqual(cycleYears("2027-01-01", "2026-12-31"), []);
  assert.deepEqual(cycleYears("2027-01-01", "2099-12-31"), []);
});
test("holiday results are clipped, sorted and combined without losing coinciding reasons", () => {
  const merged = mergeSuggestions(
    [
      [h("2026-12-25"), h("2027-12-25", "Christmas")],
      [h("2027-12-25", "Shutdown"), h("2028-01-01")],
    ],
    "2027-01-01",
    "2027-12-31",
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].reason, "Christmas; Shutdown");
});
test("accepting suggestions never overwrites an existing working exception and never adds unchecked dates", () => {
  const existing = [
    {
      ...h("2027-01-01", "Essential operation"),
      kind: "WORKING" as const,
      source: "MANUAL" as const,
    },
  ];
  const next = acceptedExceptions(
    existing,
    [h("2027-01-01"), h("2027-05-01"), h("2027-06-01")],
    ["2027-01-01", "2027-05-01"],
  );
  assert.equal(next.length, 2);
  assert.deepEqual(next[0], existing[0]);
  assert.equal(existing.length, 1);
  assert.equal(next[1].date, "2027-05-01");
});
test("exceptions before the cycle explain the problem; dates after year-end can serve deadlines", () => {
  const r = initialRules(2027);
  assert.match(exceptionIssue(r, "2026-12-26"), /before this cycle starts/);
  assert.equal(exceptionIssue(r, "2028-01-01"), "");
  assert.match(
    exceptionIssue(r, "2028-05-01"),
    /after the last supported deadline/,
  );
});
test("weekday display is a civil date and month choices include the entire financial cycle", () => {
  assert.match(displayDate("2027-10-11"), /Mon/);
  assert.deepEqual(cycleMonths("2027-12-01", "2028-02-29"), [
    "2027-12",
    "2028-01",
    "2028-02",
  ]);
});
test("a new owner choice cannot point back to itself; legacy values stay visible for correction", () => {
  assert.equal(
    responsibilityChoices("owner", "DEPARTMENT_HOD").some(
      ([v]) => v === "PLAN_OWNER",
    ),
    false,
  );
  assert.equal(
    responsibilityChoices("provider", "PLAN_OWNER").some(
      ([v]) => v === "PLAN_OWNER",
    ),
    true,
  );
  assert.match(
    responsibilityChoices("owner", "PLAN_OWNER")[0][1],
    /Choose another/,
  );
});
