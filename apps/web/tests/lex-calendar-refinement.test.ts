import test from "node:test";
import assert from "node:assert/strict";
import {
  calendarNoteGroups,
  previewCorrection,
  holidayNameUpdate,
  previewIssue,
} from "../components/leadership-excellence/organisation-framework/rules-calendar/calendar-editor";
import { initialRules } from "../components/leadership-excellence/organisation-framework/rules-calendar/calendar-model";
test("groups routine non-working dates while retaining all dates and distinct reasons", () => {
  const result = calendarNoteGroups([
    "2027-01-02: Outside normal working week",
    "2027-01-03: Outside normal working week",
    "2027-01-01: New Year",
    "2027-01-01: New Year",
    "2027-01-04: Plant shutdown",
  ]);
  assert.deepEqual(result, [
    {
      reason: "Outside normal working week",
      dates: ["2027-01-02", "2027-01-03"],
    },
    { reason: "New Year", dates: ["2027-01-01"] },
    { reason: "Plant shutdown", dates: ["2027-01-04"] },
  ]);
  assert.deepEqual(calendarNoteGroups(["Undated existing note"]), [
    { reason: "Undated existing note", dates: [""] },
  ]);
});
test("offers the known Kenyan name correction without altering dates, work choices or unrelated history", () => {
  const entry = {
    date: "2027-10-10",
    reason: "Moi Day",
    kind: "NON_WORKING" as const,
    source: "HOLIDAY_SUGGESTION" as const,
  };
  assert.equal(holidayNameUpdate("KE", entry), "Mazingira Day");
  assert.equal(entry.reason, "Moi Day");
  assert.equal(entry.date, "2027-10-10");
  assert.equal(holidayNameUpdate("UG", entry), null);
  assert.equal(holidayNameUpdate("KE", { ...entry, date: "2023-10-10" }), null);
  assert.equal(holidayNameUpdate("KE", { ...entry, date: "2027-05-01" }), null);
  assert.equal(
    holidayNameUpdate("KE", { ...entry, reason: "Mazingira Day" }),
    null,
  );
});
test("web preview permits review-only frequencies and validates their settings", () => {
  const r = initialRules(2027);
  r.enabledFrequencies = ["quarterly"];
  r.reviewFrequency = "weekly";
  assert.equal(previewIssue(r), "");
  r.reviewFrequency = "fortnightly";
  r.fortnightAnchor = "";
  assert.match(previewIssue(r), /anchor/);
  r.reviewFrequency = "custom";
  r.customInterval = { every: 2, unit: "MONTHS", anchor: "2027-01-02" };
  assert.match(previewIssue(r), /month/);
});

test("preview corrections target the renamed date and interval fields", () => {
  const r = initialRules(2027);
  assert.equal(
    previewCorrection("Calendar entry is outside this cycle").field,
    "Date",
  );
  assert.equal(
    previewCorrection("Choose a valid two-month anchor", r).field,
    "First month · year",
  );
  assert.equal(
    previewCorrection("Choose a valid custom anchor", r).field,
    "Starting month · year",
  );
  r.customInterval = { every: 3, unit: "DAYS", anchor: "2027-01-01" };
  assert.equal(
    previewCorrection("Choose a valid custom anchor", r).field,
    "Custom starting date",
  );
});
