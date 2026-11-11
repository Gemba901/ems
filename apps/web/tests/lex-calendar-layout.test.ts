import test from "node:test";
import assert from "node:assert/strict";
import {
  initialRules,
  type CalendarRules,
} from "../components/leadership-excellence/organisation-framework/rules-calendar/calendar-model";
import { intervalExample } from "../components/leadership-excellence/organisation-framework/rules-calendar/frequency-summary";
import {
  calendarIssues,
  serverIssue,
} from "../components/leadership-excellence/organisation-framework/rules-calendar/calendar-issues";
import { makePeriods } from "../../api/src/leadership-excellence/organisation-framework/rules-calendar/calendar-engine";

const valid = (): CalendarRules => ({
  ...initialRules(2027),
  name: "Office 2027",
  timeZone: "Africa/Nairobi",
});

test("live interval examples agree with approved-engine period boundaries, including clipped cycles and leap years", () => {
  for (const year of [2027, 2028]) {
    for (const start of [`${year}-01-01`, `${year}-02-17`]) {
      for (const unit of ["DAYS", "WEEKS", "MONTHS"] as const) {
        for (const every of [1, 2, 3, 14]) {
          for (const anchor of [`${year - 1}-12-01`, `${year}-04-01`]) {
            const r = {
              ...valid(),
              start,
              end: `${year}-03-05`,
              enabledFrequencies: ["custom"] as const,
              customInterval: { unit, every, anchor },
            };
            const rules = {
              ...r,
              enabledFrequencies: [...r.enabledFrequencies],
            };
            const examples = intervalExample(rules, "custom")!;
            const expected = makePeriods(rules, "custom")
              .slice(0, 2)
              .map(({ start, end, partial }) => ({ start, end, partial }));
            assert.deepEqual(
              examples.periods,
              expected,
              JSON.stringify({ year, start, unit, every, anchor }),
            );
          }
        }
      }
      for (const splitDay of [1, 7, 15, 27]) {
        const r = {
          ...valid(),
          start,
          end: `${year}-03-05`,
          splitDay,
          enabledFrequencies: [
            "twice-monthly",
          ] as CalendarRules["enabledFrequencies"],
        };
        assert.deepEqual(
          intervalExample(r, "twice-monthly")!.periods,
          makePeriods(r, "twice-monthly")
            .slice(0, 2)
            .map(({ start, end, partial }) => ({ start, end, partial })),
        );
      }
    }
  }
});

test("incomplete or invalid interval inputs do not produce misleading example dates", () => {
  for (const every of [0, -1, 1.5, 366]) {
    assert.equal(
      intervalExample(
        {
          ...valid(),
          customInterval: { every, unit: "DAYS", anchor: "2027-01-01" },
        },
        "custom",
      ),
      null,
    );
  }
  assert.equal(
    intervalExample({ ...valid(), start: "2027-02-30" }, "custom"),
    null,
  );
  assert.equal(
    intervalExample({ ...valid(), end: "2026-12-31" }, "twice-monthly"),
    null,
  );
  assert.equal(
    intervalExample(
      {
        ...valid(),
        customInterval: { every: 3, unit: "MONTHS", anchor: "2027-01-02" },
      },
      "custom",
    ),
    null,
  );
});

test("approval errors identify the exact field instead of defaulting to cycle start", () => {
  assert.deepEqual(calendarIssues(valid(), true), []);
  assert.equal(calendarIssues({ ...valid(), name: "" }, true)[0].field, "name");
  assert.equal(
    calendarIssues({ ...valid(), timeZone: "Nairobi?" }, true)[0].field,
    "timeZone",
  );
  assert.equal(
    calendarIssues({ ...valid(), end: "2026-12-31" }, true)[0].field,
    "end",
  );
  assert.equal(
    calendarIssues(
      {
        ...valid(),
        enabledFrequencies: ["custom"],
        customInterval: { every: 0, unit: "MONTHS", anchor: "2027-01-01" },
      },
      true,
    )[0].field,
    "customEvery",
  );
  const missingName = {
    kind: "PEOPLE" as const,
    label: "",
    employeeIds: ["p1"],
    departmentIds: [],
  };
  assert.equal(
    calendarIssues({ ...valid(), audience: missingName }, true)[0].field,
    "audienceLabel",
  );
  assert.equal(
    calendarIssues(
      {
        ...valid(),
        audience: { ...missingName, label: "Operations", employeeIds: [] },
      },
      true,
    )[0].field,
    "audiencePeople",
  );
  assert.deepEqual(
    calendarIssues(
      {
        ...valid(),
        exceptions: [
          {
            date: "2026-12-26",
            reason: "Old shutdown",
            kind: "NON_WORKING",
            source: "MANUAL",
          },
        ],
      },
      true,
    )[0].date,
    "2026-12-26",
  );
});

test("unknown server problems stay beside approval and saved snapshots remain the API's responsibility", () => {
  assert.equal(
    serverIssue("Another editor changed this draft. Reload.").field,
    "approval",
  );
  assert.equal(serverIssue("Approval is not permitted").field, "approval");
  assert.equal(serverIssue("Choose a valid IANA time zone.").field, "timeZone");
  assert.equal(
    serverIssue("The assignment overlaps an approved group").field,
    "audience",
  );
  assert.equal(
    calendarIssues({ ...valid(), name: "" }, false).length,
    0,
    "unnamed drafts can still preview dates",
  );
});
