import { test } from "node:test";
import assert from "node:assert/strict";
import {
  shiftCycleEndYear,
  acceptedExceptions,
} from "../components/leadership-excellence/organisation-framework/rules-calendar/calendar-editor";
import {
  countryOptions,
  suggestedSelection,
} from "../components/leadership-excellence/organisation-framework/rules-calendar/calendar-selection";
import { initialRules } from "../components/leadership-excellence/organisation-framework/rules-calendar/calendar-model";
import {
  holidayDecisionIssue,
  needsHolidayReason,
  preserveHolidayOrigins,
} from "../components/leadership-excellence/organisation-framework/rules-calendar/calendar-holiday-decisions";
import type { CalendarDirectory } from "../components/leadership-excellence/organisation-framework/rules-calendar/calendar-audience.types";

test("year-only changes preserve a chosen end month, including cross-year and leap-year cycles", () => {
  assert.equal(
    shiftCycleEndYear("2027-02-01", "2027-11-30", "2028-02-01"),
    "2028-11-30",
  );
  assert.equal(
    shiftCycleEndYear("2027-04-01", "2028-03-31", "2028-04-01"),
    "2029-03-31",
  );
  assert.equal(
    shiftCycleEndYear("2027-04-01", "2028-02-29", "2028-04-01"),
    "2029-02-28",
  );
  assert.equal(
    shiftCycleEndYear("2027-02-01", "2027-11-30", "2027-03-01"),
    null,
  );
  assert.equal(
    shiftCycleEndYear("2027-02-01", "2027-11-30", "2028-03-01"),
    null,
  );
  assert.equal(
    shiftCycleEndYear("2027-02-01", "2027-11-30", "2027-02-01"),
    null,
  );
});
test("country name prefixes and codes are ranked before incidental text matches without choosing anything", () => {
  const countries = {
    KE: "Kenya",
    ES: "Spain",
    EE: "Estonia",
    EC: "Ecuador",
    UG: "Uganda",
    TR: "Turkey",
    XK: "Kosovo",
  };
  assert.deepEqual(
    countryOptions(countries, "e")
      .slice(0, 2)
      .map((c) => c[0]),
    ["EC", "EE"],
  );
  assert.deepEqual(
    countryOptions(countries, "k")
      .slice(0, 2)
      .map((c) => c[0]),
    ["KE", "XK"],
  );
  assert.equal(countryOptions(countries, "es")[0][0], "ES");
  assert.equal(countryOptions(countries, "ken")[0][0], "KE");
  assert.equal(countryOptions(countries, "unmatched").length, 0);
});
test("team suggestions use actual recorded departments and active job titles, with optional wider leadership", () => {
  const d: CalendarDirectory = {
    source: "CORE_RECORDS",
    loadedAt: "2027-01-01",
    departments: [
      { id: "hr", name: "Human Resources" },
      { id: "finance", name: "Finance" },
      { id: "admin", name: "Administration" },
      { id: "maint", name: "Maintenance" },
      { id: "store", name: "Stores" },
      { id: "other", name: "Other" },
    ],
    people: [
      "Chief Engineer",
      "HOD Production",
      "Head of Finance",
      "Director",
      "Manager",
      "Supervisor",
      "Operator",
      "Chief Accountant",
    ].map((jobTitle, i) => ({
      id: String(i),
      name: jobTitle,
      jobTitle,
      code: null,
      departmentId: null,
      branch: null,
      active: i !== 7,
    })),
  };
  const before = structuredClone(d);
  assert.deepEqual(suggestedSelection(d, "OFFICE"), {
    departmentIds: ["hr", "finance", "admin"],
    employeeIds: [],
  });
  assert.deepEqual(suggestedSelection(d, "PRODUCTION").departmentIds, [
    "maint",
    "store",
  ]);
  assert.deepEqual(suggestedSelection(d, "LEADERSHIP").employeeIds, [
    "0",
    "1",
    "2",
    "3",
  ]);
  assert.deepEqual(
    suggestedSelection(d, "LEADERSHIP", true, true).employeeIds,
    ["0", "1", "2", "3", "4", "5"],
  );
  assert.deepEqual(d, before);
});
test("accepted holidays retain their category, country and observed date for later changes", () => {
  const accepted = acceptedExceptions(
    [],
    [
      {
        date: "2027-10-11",
        reason: "Mazingira Day",
        kind: "NON_WORKING",
        source: "HOLIDAY_SUGGESTION",
        category: "OBSERVED_PUBLIC_HOLIDAY",
        originalDate: "2027-10-10",
      },
    ],
    ["2027-10-11"],
    "KE",
  );
  assert.equal(accepted[0].holidayCountry, "KE");
  assert.equal(accepted[0].category, "OBSERVED_PUBLIC_HOLIDAY");
  assert.equal(accepted[0].originalDate, "2027-10-10");
  const before = { ...initialRules(2027), country: "KE", exceptions: accepted };
  const after = { ...before, country: "UG", exceptions: [] };
  assert.match(holidayDecisionIssue(before, after), /Give a reason/);
  assert.match(
    holidayDecisionIssue(before, {
      ...after,
      holidayOmissions: [
        {
          date: "2027-10-11",
          name: "Mazingira Day",
          country: "UG",
          reason: "Wrong country",
        },
      ],
    }),
    /Give a reason/,
  );
  assert.equal(
    holidayDecisionIssue(before, {
      ...after,
      holidayOmissions: [
        {
          date: "2027-10-11",
          name: "Mazingira Day",
          country: "KE",
          reason: "Site remains open",
        },
      ],
    }),
    "",
  );
  assert.equal(
    needsHolidayReason({ ...accepted[0], category: "OPTIONAL_CLOSURE" }),
    false,
  );
  assert.equal(
    needsHolidayReason({ ...accepted[0], category: undefined }),
    true,
  );
  const renamed = preserveHolidayOrigins(before, {
    ...before,
    exceptions: [
      {
        ...accepted[0],
        source: "MANUAL",
        category: undefined,
        reason: "Renamed holiday",
      },
    ],
  });
  assert.equal(renamed.exceptions[0].source, "HOLIDAY_SUGGESTION");
  assert.equal(renamed.exceptions[0].reason, "Renamed holiday");
  assert.equal(renamed.exceptions[0].category, "OBSERVED_PUBLIC_HOLIDAY");
});
