import test from "node:test";
import assert from "node:assert/strict";
import {
  calendarDateBounds,
  calendarDateIssue,
  calendarFrequencyChoices,
  calendarIdentity,
  savedPlanningCalendar,
} from "../services/leadership-excellence/performance-planning/calendar-options";
import { serializeAssignmentRows } from "../services/leadership-excellence/performance-planning/individual-kpi-draft";
import type {
  PlanningCalendar,
  PlanningDocument,
  PlanningReferences,
} from "../services/leadership-excellence/performance-planning/types";

const calendar = (version = 1): PlanningCalendar => ({
  id: "approved-calendar",
  version,
  source: "AREA_02",
  approved: true,
  name: "Operations reporting",
  frequencies: ["MONTHLY", "EVERY_TWO_MONTHS", "CUSTOM"],
  startDate: "2026-04-01",
  endDate: "2027-03-31",
  timeZone: "Asia/Kolkata",
  workingDays: [1, 2, 3, 4, 5],
  holidays: [],
  weekStart: 1,
  fortnightAnchor: "2026-04-01",
  twiceMonthlySplit: 15,
  submissionDueDays: 2,
});

test("approved calendars expose only enabled reporting frequencies, including custom and two-month periods", () => {
  assert.deepEqual(
    calendarFrequencyChoices(calendar()).map(([frequency]) => frequency),
    ["MONTHLY", "EVERY_TWO_MONTHS", "CUSTOM"],
  );
  assert.deepEqual(
    calendarFrequencyChoices({ ...calendar(), frequencies: [] }),
    [],
  );
  assert.equal(
    calendarFrequencyChoices({ ...calendar(), source: "WORK_SETTINGS" }).length,
    8,
  );
  assert.equal(
    calendarFrequencyChoices().some(([frequency]) => frequency === "CUSTOM"),
    false,
  );
  const separateReview = {
    ...calendar(),
    area02: { reviewFrequency: "QUARTERLY" },
  } as PlanningCalendar;
  assert.equal(
    calendarFrequencyChoices(separateReview).some(
      ([frequency]) => frequency === "QUARTERLY",
    ),
    false,
  );
  assert.equal(
    calendarFrequencyChoices(separateReview, "review").some(
      ([frequency]) => frequency === "QUARTERLY",
    ),
    true,
  );
});

test("saved calendar identity includes its version and is not upgraded by current references", () => {
  const pinned = calendar(2),
    latest = calendar(3);
  const references = {
    calendar: latest,
    calendars: [latest],
  } as PlanningReferences;
  const document = {
    data: { calendar: pinned },
    versions: [],
  } as unknown as PlanningDocument;
  assert.equal(savedPlanningCalendar(document, references), pinned);
  assert.equal(savedPlanningCalendar(undefined, references), undefined);
  assert.notEqual(calendarIdentity(pinned), calendarIdentity(latest));
  assert.equal(
    calendarIdentity(pinned),
    calendarIdentity({ ...pinned, version: "2" }),
  );
  document.data.calendar = undefined;
  document.versions = [
    { version: 2, calendar: pinned },
  ] as PlanningDocument["versions"];
  assert.equal(savedPlanningCalendar(document, references), pinned);
});

test("legacy work settings remain available only for an older reference response", () => {
  const legacy = { ...calendar(), source: "WORK_SETTINGS" as const };
  assert.equal(
    savedPlanningCalendar(undefined, {
      calendar: legacy,
    } as PlanningReferences),
    legacy,
  );
  assert.equal(
    savedPlanningCalendar(undefined, {
      calendar: legacy,
      calendars: [],
    } as unknown as PlanningReferences),
    undefined,
  );
});

test("date limits intersect calendar and goal ranges without changing entered values", () => {
  assert.deepEqual(calendarDateBounds(calendar(), "2026-01-01", "2026-12-31"), {
    startDate: "2026-04-01",
    endDate: "2026-12-31",
  });
  assert.match(
    calendarDateIssue(calendar(), "2026-01-01", "2026-12-31"),
    /01 April 2026/,
  );
  assert.equal(calendarDateIssue(calendar(), "2026-04-01", "2026-12-31"), "");
  assert.equal(
    calendarDateIssue(
      { ...calendar(), startDate: "", endDate: "" },
      "2026-04-01",
      "2026-12-31",
    ),
    "",
  );
});

test("assignment payload sends only the approved calendar reference for server resolution", () => {
  const selected = calendar(2);
  const row = {
    key: "draft",
    data: { calendar: selected, baseline: "0", target: "12", targets: [] },
  };
  const result = serializeAssignmentRows([row])[0];
  assert.deepEqual(result.data.calendar, { id: selected.id, version: 2 });
  assert.equal(result.data.baseline, 0);
  assert.equal(
    row.data.calendar,
    selected,
    "Serializing never replaces the full display snapshot in the draft",
  );
  const legacy = serializeAssignmentRows([
    {
      ...row,
      data: { ...row.data, calendar: { ...selected, source: "WORK_SETTINGS" } },
    },
  ])[0];
  assert.equal((legacy.data.calendar as PlanningCalendar).weekStart, 1);
});
