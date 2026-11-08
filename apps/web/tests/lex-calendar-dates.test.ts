import { test } from "node:test";
import assert from "node:assert/strict";
import { cycleDateIssue } from "../components/leadership-excellence/organisation-framework/rules-calendar/cycle-dates";
import { cycleDateIssue as apiDateIssue } from "../../api/src/leadership-excellence/organisation-framework/rules-calendar/cycle-dates";

test("January 2027 cannot end in December 2026, even as a draft", () => {
  assert.match(cycleDateIssue("2027-01-01", "2026-12-31", true), /on or after/);
});

test("a corrected financial year is valid without changing either entered date", () => {
  assert.equal(cycleDateIssue("2027-04-01", "2028-03-31"), "");
  assert.equal(cycleDateIssue("2027-01-01", "2027-01-01"), "");
});

test("unfinished drafts remain possible but preview and approval need both dates", () => {
  assert.equal(cycleDateIssue("", "2027-12-31", true), "");
  assert.match(cycleDateIssue("", "2027-12-31"), /both cycle dates/);
});

test("API and form agree on ordering, leap days, missing dates and supported bounds", () => {
  const pairs = [
    ["2027-01-01", "2026-12-31"],
    ["2028-02-29", "2028-03-01"],
    ["2027-02-29", "2027-03-01"],
    ["2027-02-30", "2027-03-01"],
    ["", "2027-12-31"],
    ["2027-01-01", ""],
    ["", ""],
    ["1899-12-31", "1900-01-01"],
    ["2199-01-01", "2200-01-01"],
    ["2027-01-01", "2031-01-01"],
    ["2027-01-01", "2027-12-31"],
  ];
  for (const [start, end] of pairs)
    for (const incomplete of [false, true]) {
      assert.equal(
        cycleDateIssue(start, end, incomplete),
        apiDateIssue(start, end, incomplete),
      );
    }
  assert.match(
    cycleDateIssue("2027-02-29", "2027-03-01", true),
    /valid cycle dates/,
  );
  assert.equal(cycleDateIssue("2028-02-29", "2028-03-01"), "");
});
