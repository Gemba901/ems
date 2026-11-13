import test from "node:test";
import assert from "node:assert/strict";
import {
  initAssignmentRows,
  mergeAssignmentPeriods,
  serializeAssignmentRows,
  type ProgrammeAssignmentDraftRow,
} from "../services/leadership-excellence/performance-planning/individual-kpi-draft";
import type {
  Assignment,
  TargetPeriod,
} from "../services/leadership-excellence/performance-planning/types";

const period = (id: string, target: number | null): TargetPeriod => ({
  id,
  label: id,
  start: "2000-01-01",
  end: "2000-01-31",
  target,
  upper: null,
});
const saved = (): Assignment => ({
  id: "assignment-1",
  code: "KPIA-2000-2003-001",
  createdAt: "2026-11-13T00:00:00Z",
  createdBy: "planner",
  updatedAt: "2026-11-13T00:00:00Z",
  updatedBy: "planner",
  ownerId: "employee",
  goalId: "goal-1",
  definitionId: "shared-definition",
  baseline: null,
  baselineReason: "Not measured yet",
  startDate: "2000-01-01",
  endDate: "2003-12-31",
  providerId: "employee",
  verifierId: "supervisor",
  source: "Shift log",
  updateFrequency: "MONTHLY",
  reviewFrequency: "QUARTERLY",
  targetMode: "VARIED",
  target: 0,
  upper: null,
  targets: [period("2000-01", 0), period("2000-02", null)],
});

test("editing and reopening a KPI preserves zero, missing targets and its existing identity", () => {
  const assignment = saved();
  const original = structuredClone(assignment);
  const draft = initAssignmentRows([assignment]);
  assert.equal(draft[0].data.baseline, "");
  assert.equal(draft[0].data.target, "0");
  const [payload] = serializeAssignmentRows(draft);
  assert.equal(payload.id, assignment.id);
  assert.equal(payload.data.goalId, "goal-1");
  assert.equal(payload.data.definitionId, "shared-definition");
  assert.equal(payload.data.baseline, null);
  assert.equal(payload.data.target, 0);
  assert.deepEqual(
    payload.data.targets.map((p) => p.target),
    [0, null],
  );
  assert.deepEqual(
    assignment,
    original,
    "The saved record is never mutated by editing",
  );
});

test("period refresh retains values only for unchanged dates and clears unscheduled days", () => {
  const previous = initAssignmentRows([saved()])[0].data.targets as ReturnType<
    typeof mergeAssignmentPeriods
  >;
  previous[1].target = "17.5";
  const generated: TargetPeriod[] = [
    { ...period("2000-01", null), submissionDate: "2000-02-04" },
    { ...period("2000-02", null), start: "2000-02-01", end: "2000-02-29" },
    { ...period("holiday", 99), scheduled: false },
  ];
  const refreshed = mergeAssignmentPeriods(previous, generated);
  assert.equal(refreshed[0].target, "0");
  assert.equal(refreshed[0].submissionDate, "2000-02-04");
  assert.equal(
    refreshed[1].target,
    "",
    "A changed period must not inherit another date range's target",
  );
  assert.equal(refreshed[2].target, "");
  const draft: ProgrammeAssignmentDraftRow = {
    key: "new",
    data: { targets: refreshed },
  };
  assert.deepEqual(
    serializeAssignmentRows([draft])[0].data.targets.map((p) => p.target),
    [0, null, null],
  );
});

test("invalid numeric input cannot silently turn into a blank or zero draft value", () => {
  const [row] = initAssignmentRows([saved()]);
  assert.throws(
    () =>
      serializeAssignmentRows([
        { ...row, data: { ...row.data, target: "1e309" } },
      ]),
    /valid number/,
  );
  assert.throws(
    () =>
      serializeAssignmentRows([
        {
          ...row,
          data: { ...row.data, baseline: "" },
          badNumbers: { baseline: true },
        },
      ]),
    /baseline/,
  );
  const targets = row.data.targets as ReturnType<typeof mergeAssignmentPeriods>;
  targets[1].target = "";
  targets[1].badTarget = true;
  assert.throws(() => serializeAssignmentRows([row]), /target for 2000-02/);
});

test("all period targets are retained beyond the first displayed page, without inventing IDs", () => {
  const [row] = initAssignmentRows([saved()]);
  row.data.targets = Array.from({ length: 48 }, (_, index) => ({
    ...period(`period-${index}`, null),
    target: index % 2 ? "" : String(index),
    upper: "",
  }));
  const payload = serializeAssignmentRows([row])[0];
  assert.equal(payload.data.targets.length, 48);
  assert.equal(payload.data.targets[46].target, 46);
  assert.equal(payload.data.targets[47].target, null);
  assert.equal(payload.data.targets[47].id, "period-47");
  const fresh = serializeAssignmentRows([
    { ...row, key: "new", id: undefined },
  ])[0];
  assert.equal("id" in fresh, false, "The server generates new assignment IDs");
});
