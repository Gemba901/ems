import test from "node:test";
import assert from "node:assert/strict";
import {
  resultPeriodOptions,
  type ResultSchedule,
} from "../services/leadership-excellence/performance-planning/result-periods";
import { programmeCommitments } from "../services/leadership-excellence/performance-planning/programme";
import type {
  ApprovedVersion,
  Goal,
  PlanningView,
} from "../services/leadership-excellence/performance-planning/types";

test("result period options retain their approved target/version and server eligibility", () => {
  const schedules: ResultSchedule[] = [1, 2].map((version) => ({
    version,
    effectiveDate: version === 1 ? "2026-01-01" : "2026-12-01",
    frequency: "MONTHLY",
    target: version === 1 ? 30 : 20,
    unit: "count",
    calendarSource: "AREA_02",
    calendarVersion: 1,
    periods: [
      {
        id: String(version),
        label: version === 1 ? "November" : "December",
        start: version === 1 ? "2026-11-01" : "2026-12-01",
        end: version === 1 ? "2026-11-30" : "2026-12-31",
        target: version === 1 ? 30 : 20,
        upper: null,
        canRecord: version === 1,
      },
    ],
  }));
  const options = resultPeriodOptions(schedules);
  assert.equal(options[0].canRecord, false);
  assert.equal(options[1].version, 1);
  assert.equal(options[1].target, 30);
  assert.equal(options[1].canRecord, true);
});

test("whole-plan approval preserves the currently effective canonical goal and target", () => {
  const goal = {
    id: "goal",
    title: "Reduce waste",
    target: 30,
    direction: "LOWER",
  } as Goal;
  const first: ApprovedVersion = {
    version: 1,
    effectiveDate: "2026-01-01",
    approvedAt: "2026-01-01T00:00:00Z", approvedBy: "approver", definitions: [], reason: "",
    approvedItem: { kind: "goal", itemId: "goal" },
    data: { title: "Production", ownerId: "owner", approverId: "approver", coordinatorIds: [], contributorIds: [], startDate: "2026-01-01", endDate: "2026-12-31", consideredPillars: [], findings: [], goals: [goal], objectives: [], assignments: [], actions: [] },
  };
  const future = structuredClone(first);
  future.version = 2;
  future.effectiveDate = "2026-12-01";
  future.data.goals[0].target = 20;
  const whole = structuredClone(future);
  whole.version = 3;
  whole.effectiveDate = "2026-11-01";
  delete whole.approvedItem;
  whole.itemVersions = { goal: 2 };
  const view = {
    documents: [
      {
        id: "doc",
        cycle: "2026",
        kind: "DEPARTMENT",
        permissions: { canRead: true },
        versions: [first, future, whole],
      },
    ],
  } as PlanningView;
  const [november] = programmeCommitments(view, "2026", "2026-11-19");
  assert.equal(november.version, 1);
  assert.equal(november.item.target, 30);
  const [december] = programmeCommitments(view, "2026", "2026-12-01");
  assert.equal(december.version, 2);
  assert.equal(december.item.target, 20);
  // Read-only workspace responses omit cumulative copies, keeping their map.
  whole.data.goals = [];
  const [reader] = programmeCommitments(view, "2026", "2026-12-01");
  assert.equal(reader.version, 2);
  assert.equal(reader.item.target, 20);
});
