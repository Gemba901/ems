import assert from "node:assert/strict";
import test from "node:test";
import type {
  ExecutionAssignment,
  ExecutionResult,
} from "../services/leadership-excellence/execution/types";
import type { KpiDefinition } from "../services/leadership-excellence/performance-planning/types";
import {
  actualValue,
  aggregateResults,
  editablePeriod,
  inputNumber,
  parseResultPaste,
  resultSummary,
  sameGoalReference,
} from "../services/leadership-excellence/execution/helpers";

const definition: KpiDefinition = {
  id: "waste",
  code: "KPI-1",
  kraId: "cost",
  name: "Waste cost per accepted unit",
  meaning: "Combined waste cost divided by accepted units",
  unit: "KES/unit",
  direction: "LOWER",
  formula: "RATIO",
  inputA: "Waste cost",
  inputB: "Accepted units",
  aggregation: "RATIO",
  source: "CUSTOM",
};
const assignment = {
  key: "plan/kpi/v1",
  documentId: "plan",
  version: 1,
  cycle: "2027",
  departmentId: "production",
  goalKey: "plan/goal/v1",
  goalTitle: "Reduce waste",
  scope: "DEPARTMENT",
  current: true,
  effectiveDate: "2027-01-01",
  canEnter: true,
  canVerify: false,
  definition,
  assignment: {
    id: "kpi",
    code: "ASSIGN-1",
    createdAt: "2027-01-01",
    updatedAt: "2027-01-01",
    createdBy: "u",
    updatedBy: "u",
    goalId: "goal",
    definitionId: "waste",
    baseline: null,
    baselineReason: "",
    startDate: "2027-01-01",
    endDate: "2027-12-31",
    providerId: "provider",
    verifierId: "verifier",
    source: "Waste log",
    updateFrequency: "DAILY",
    reviewFrequency: "MONTHLY",
    targetMode: "SAME",
    target: 40,
    upper: null,
    targets: [],
  },
  periods: [
    {
      id: "d1",
      label: "Day 1",
      start: "2027-01-01",
      end: "2027-01-01",
      target: 40,
      upper: null,
      scheduled: true,
      submissionDate: "2027-01-02",
    },
    {
      id: "d2",
      label: "Day 2",
      start: "2027-01-02",
      end: "2027-01-02",
      target: 40,
      upper: null,
      scheduled: true,
    },
    {
      id: "d3",
      label: "Day 3",
      start: "2027-01-03",
      end: "2027-01-03",
      target: 40,
      upper: null,
      scheduled: false,
    },
    {
      id: "future",
      label: "Future",
      start: "2027-02-01",
      end: "2027-02-01",
      target: 40,
      upper: null,
      scheduled: true,
    },
  ],
  entryPeriodIds: ["d1", "d2", "d3", "future"],
} satisfies ExecutionAssignment;

function result(
  periodId: string,
  inputA: number,
  inputB: number,
  verified = true,
): ExecutionResult {
  return {
    id: periodId,
    assignmentKey: assignment.key,
    periodId,
    inputA,
    inputB,
    actual: inputA / inputB,
    note: "",
    evidence: "Waste log",
    status: verified ? "VERIFIED" : "SUBMITTED",
    updatedAt: "2027-01-04",
    updatedBy: "provider",
    submittedAt: "2027-01-03",
    verificationNote: "",
    official: verified
      ? {
          actual: inputA / inputB,
          inputA,
          inputB,
          verifiedAt: "2027-01-04",
          verifiedBy: "verifier",
        }
      : null,
    history: [],
  };
}

test("missing stays null, zero remains a valid result and partial ratios stay blank", () => {
  assert.equal(inputNumber(""), null);
  assert.equal(inputNumber("  "), null);
  assert.equal(inputNumber("0"), 0);
  assert.equal(actualValue(definition, 0, 100), 0);
  assert.equal(actualValue(definition, 6000, null), null);
  assert.equal(actualValue(definition, 6000, 0), null);
});
test("support stays linked across revisions of one commitment without crossing goals or plans", () => {
  assert.equal(sameGoalReference("plan/goal/v1", "plan/goal/v3"), true);
  assert.equal(sameGoalReference("plan/goal/v1", "other-plan/goal/v1"), false);
  assert.equal(sameGoalReference("plan/goal/v1", "plan/other-goal/v1"), false);
});
test("approved ratio uses combined figures: 10500 / 250 = 42, not mean 45", () => {
  const summary = resultSummary(
    assignment,
    [result("d1", 6000, 100), result("d2", 4500, 150)],
    "2027-01-04",
  );
  assert.equal(summary.official, 42);
  assert.equal(summary.verified, 2);
  assert.equal(summary.overdue, 0);
});
test("submitted figures are provisional; old official values survive a pending correction", () => {
  const correction = {
    ...result("d1", 6000, 100),
    inputA: 3000,
    actual: 30,
    status: "SUBMITTED" as const,
  };
  const summary = resultSummary(
    assignment,
    [correction, result("d2", 4500, 150, false)],
    "2027-01-04",
  );
  assert.equal(summary.official, 60);
  assert.equal(summary.provisional, 30);
  assert.equal(summary.submitted, 2);
});
test("nonworking and future rows never become overdue", () => {
  const summary = resultSummary(assignment, [], "2027-01-04");
  assert.equal(summary.overdue, 2);
  assert.equal(summary.elapsed, 2);
  assert.equal(summary.scheduled, 3);
  assert.equal(
    editablePeriod(assignment, assignment.periods[2], "2027-01-04"),
    false,
  );
  assert.equal(
    editablePeriod(assignment, assignment.periods[3], "2027-01-04"),
    false,
  );
});
test("view only, submitted and superseded periods are locked; historical correction retains its version", () => {
  assert.equal(
    editablePeriod(
      { ...assignment, canEnter: false },
      assignment.periods[0],
      "2027-01-04",
    ),
    false,
  );
  assert.equal(
    editablePeriod(
      assignment,
      assignment.periods[0],
      "2027-01-04",
      result("d1", 6000, 100, false),
    ),
    false,
  );
  const historical = { ...assignment, current: false, entryPeriodIds: [] };
  assert.equal(
    editablePeriod(historical, assignment.periods[0], "2027-01-04"),
    false,
  );
  assert.equal(
    editablePeriod(
      historical,
      assignment.periods[0],
      "2027-01-04",
      result("d1", 6000, 100),
    ),
    true,
  );
  assert.equal(
    editablePeriod(
      { ...assignment, key: "plan/kpi/v2", version: 2 },
      assignment.periods[0],
      "2027-01-04",
      undefined,
      [result("d1", 6000, 100)],
    ),
    false,
  );
});
test("direct SUM and CLOSING/MILESTONE honour the approved aggregation", () => {
  const entries = [
    { actual: 10, inputA: 10, inputB: null, end: "2027-01-02" },
    { actual: 30, inputA: 30, inputB: null, end: "2027-01-01" },
  ];
  const direct = { ...definition, formula: "DIRECT" as const };
  assert.equal(
    aggregateResults({ ...direct, aggregation: "SUM" }, entries),
    40,
  );
  assert.equal(
    aggregateResults({ ...direct, aggregation: "CLOSING" }, entries),
    10,
  );
  assert.equal(
    aggregateResults({ ...direct, aggregation: "MILESTONE" }, entries),
    10,
  );
  assert.equal(aggregateResults(direct, []), null);
});
test("spreadsheet paste reports duplicates, invalid figures, locked periods and future rows before applying", () => {
  const rows = parseResultPaste(
    "2027-01-01\t6000\t100\tWaste log\n2027-01-01\t1\t0\n2027-01-02\tbad\t100\n2027-02-01\t0\t100",
    assignment,
    "2027-01-04",
    [],
  );
  assert.equal(rows[0].error, "");
  assert.match(rows[1].error, /twice/);
  assert.match(rows[2].error, /valid numbers/);
  assert.match(rows[3].error, /future/);
  assert.equal(
    parseResultPaste("2027-01-01\t0\t100", assignment, "2027-01-04", [
      result("d1", 6000, 100, false),
    ])[0].error.includes("locked"),
    true,
  );
});
