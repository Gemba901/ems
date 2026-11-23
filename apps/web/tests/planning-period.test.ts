import assert from "node:assert/strict";
import test from "node:test";
import {
  planningPeriodBounds,
  planningPeriodKey,
  planningPeriodLabel,
  planningPeriodValidation,
} from "../services/leadership-excellence/performance-planning/planning-period";

test("calendar years retain their existing register identity", () => {
  for (const year of [2000, 2018, 2027, 2200]) {
    const bounds = planningPeriodBounds(String(year));
    assert.deepEqual(bounds, {
      startDate: `${year}-01-01`,
      endDate: `${year}-12-31`,
    });
    assert.equal(
      planningPeriodKey(bounds!.startDate, bounds!.endDate),
      String(year),
    );
    assert.equal(planningPeriodLabel(String(year)), String(year));
  }
  assert.equal(planningPeriodKey("2027-01-01", "2027-12-31"), "2027");
  assert.equal(planningPeriodLabel("2027-01-01..2027-12-31"), "2027");
});

test("financial and multi-year plans keep their exact chosen date bounds", () => {
  const pairs = [
    ["2027-04-01", "2028-03-31"],
    ["2027-04-01", "2029-03-31"],
    ["2027-01-01", "2029-12-31"],
    ["2027-04-01", "2027-06-30"],
  ];
  for (const [from, to] of pairs) {
    const key = planningPeriodKey(from, to);
    assert.equal(key, `${from}..${to}`);
    assert.deepEqual(planningPeriodBounds(key!), {
      startDate: from,
      endDate: to,
    });
  }
  assert.equal(
    planningPeriodLabel("2027-04-01..2029-03-31"),
    "1 Apr 2027 – 31 Mar 2029",
  );
});

test("same-day periods and leap days are accepted without moving the dates", () => {
  assert.equal(
    planningPeriodKey("2028-02-29", "2028-02-29"),
    "2028-02-29..2028-02-29",
  );
  assert.deepEqual(planningPeriodValidation("2000-02-29", "2028-02-29"), []);
  assert.equal(
    planningPeriodLabel("2028-02-29..2028-02-29"),
    "29 Feb 2028 – 29 Feb 2028",
  );
});

test("invalid calendar dates are rejected instead of being silently normalised", () => {
  for (const date of [
    "2027-02-29",
    "2100-02-29",
    "2027-04-31",
    "2027-13-01",
    "2027-00-01",
    "2027-1-01",
    "",
    " 2027-01-01",
    "2027-01-01 ",
  ]) {
    assert.equal(planningPeriodKey(date, "2200-12-31"), null, date);
    assert.equal(planningPeriodKey("2000-01-01", date), null, date);
    assert.equal(planningPeriodBounds(`${date}..2200-12-31`), null, date);
  }
});

test("date boundaries and reversed ranges give actionable errors", () => {
  assert.equal(planningPeriodKey("1999-12-31", "2027-12-31"), null);
  assert.equal(planningPeriodKey("2027-01-01", "2201-01-01"), null);
  assert.equal(
    planningPeriodKey("2000-01-01", "2200-12-31"),
    "2000-01-01..2200-12-31",
  );
  assert.deepEqual(planningPeriodValidation("2029-03-31", "2027-04-01"), [
    "The To date must be on or after the From date.",
  ]);
  assert.match(planningPeriodValidation("", "2027-12-31")[0], /From date/);
  assert.match(planningPeriodValidation("2027-01-01", "")[0], /To date/);
});

test("malformed persisted cycles never become a guessed planning year", () => {
  for (const cycle of [
    "27",
    "1999",
    "2201",
    "2027/28",
    "2027..2028",
    "2028-01-01..2027-12-31",
    "2027-01-01..2027-02-31",
    "2027-01-01..2028-12-31extra",
    "",
  ]) {
    assert.equal(planningPeriodBounds(cycle), null, cycle);
    assert.equal(planningPeriodLabel(cycle), "Invalid planning period", cycle);
  }
});
