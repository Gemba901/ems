import test from "node:test";
import assert from "node:assert/strict";
import {
  readCalendarLocation,
  calendarLocationUrl,
} from "../components/leadership-excellence/organisation-framework/rules-calendar/calendar-location";

test("saved view restores the same cycle, historical version, tab and preview filters", () => {
  const state = readCalendarLocation(
    "?view=calendar&cycle=cycle-1&version=2&tab=preview&frequency=weekly&month=2027-02",
    "2027-01",
  );
  assert.equal(state.screen, "calendar");
  assert.equal(state.calendarId, "cycle-1");
  assert.equal(state.version, 2);
  assert.equal(state.step, 2);
  assert.equal(state.frequency, "weekly");
  assert.equal(state.month, "2027-02");
  const url = calendarLocationUrl(
    "https://company.test/leadership-excellence/organisation-framework/rules-calendar?from=home#calendar",
    state,
  );
  assert.ok(url.includes("from=home"));
  assert.ok(url.endsWith("#calendar"));
  assert.deepEqual(
    readCalendarLocation(
      new URL(url, "https://company.test").search,
      "2027-01",
    ),
    state,
  );
});
test("comparison month, mode and selected day round-trip separately from reporting filters", () => {
  const state = readCalendarLocation(
    "?view=comparison&compareMonth=2027-03&compareView=day&day=2027-03-14",
    "2027-01",
  );
  assert.equal(state.comparisonMode, "DAY");
  assert.equal(state.comparisonDay, "2027-03-14");
  assert.equal(state.month, "");
  const url = calendarLocationUrl("https://example.test/rules", state);
  assert.deepEqual(
    readCalendarLocation(
      new URL(url, "https://example.test").search,
      "2027-01",
    ),
    state,
  );
});
test("invalid navigation values fall back safely and never become approval actions", () => {
  const state = readCalendarLocation(
    "?cycle=x&tab=approve&version=-3&frequency=made-up&month=2027-99&compareMonth=bad&day=2027-02-30&approve=true",
    "2027-01",
  );
  assert.equal(state.step, null);
  assert.equal(state.version, null);
  assert.equal(state.frequency, "monthly");
  assert.equal(state.month, "");
  assert.equal(state.comparisonDay, "");
  assert.equal(
    readCalendarLocation(`?cycle=${"x".repeat(201)}`, "2027-01").screen,
    "cycles",
  );
  assert.equal(
    readCalendarLocation(
      "?view=comparison&compareMonth=2027-01&day=2027-02-01",
      "2027-01",
    ).comparisonDay,
    "",
  );
});
test("returning to the overview removes stale calendar state; a new form has no saved calendar ID", () => {
  const initial = readCalendarLocation(
    "?cycle=x&version=4&tab=preview&month=2027-02",
    "2027-01",
  );
  const overview = calendarLocationUrl(
    "https://example.test/rules?cycle=x&version=4&tab=preview&month=2027-02&from=home",
    { ...initial, screen: "cycles" },
  );
  assert.equal(overview, "/rules?from=home");
  const fresh = calendarLocationUrl("https://example.test/rules", {
    ...initial,
    screen: "new",
    step: 1,
  });
  assert.ok(fresh.includes("view=new"));
  assert.ok(fresh.includes("tab=periods"));
  assert.ok(!fresh.includes("cycle="));
  assert.ok(!fresh.includes("version="));
});
