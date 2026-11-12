import test from "node:test";
import assert from "node:assert/strict";
import {
  dateEntry,
  parseDateEntry,
  displayMonth,
  previewIssue,
  previewCorrection,
} from "../components/leadership-excellence/organisation-framework/rules-calendar/calendar-editor";
import {
  initialRules,
  enabledFrequencies,
} from "../components/leadership-excellence/organisation-framework/rules-calendar/calendar-model";
test("named-month date entry is unambiguous, strict and leap-year aware", () => {
  assert.equal(dateEntry("2027-01-02"), "2 Jan 2027");
  assert.equal(parseDateEntry("2 January 2027"), "2027-01-02");
  assert.equal(parseDateEntry("29 Feb 2028"), "2028-02-29");
  assert.equal(parseDateEntry("29 Feb 2027"), null);
  assert.equal(parseDateEntry("31 Apr 2027"), null);
  assert.equal(parseDateEntry("01/02/2027"), null);
  assert.equal(parseDateEntry("2 Janz 2027"), null);
  assert.equal(parseDateEntry("2027-01-02"), "2027-01-02");
  assert.equal(displayMonth("2027-02"), "Feb 2027");
});
test("unnamed drafts preview dates and corrections route to the relevant tab", () => {
  assert.equal(previewIssue(initialRules(2027)), "");
  assert.equal(previewCorrection("Choose a valid anchor").step, 1);
  assert.equal(previewCorrection("Choose valid cycle dates").step, 0);
  assert.equal(
    previewCorrection("Give the cycle a name").label,
    "Enter calendar name",
  );
});
test("legacy rules retain frequencies while new drafts choose monthly and quarterly", () => {
  const r = initialRules(2027);
  assert.deepEqual(enabledFrequencies(r), ["monthly", "quarterly"]);
  delete r.enabledFrequencies;
  assert.equal(enabledFrequencies(r).length, 8);
});
