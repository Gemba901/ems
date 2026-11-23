import test from "node:test";
import assert from "node:assert/strict";
import {
  objectiveAlignmentLabels,
  objectiveAsGoal,
  objectiveHasOwnMeasurement,
  resolveParentGoal,
} from "../services/leadership-excellence/performance-planning/measurable-objective";
import type {
  Goal,
  Objective,
  PlanData,
} from "../services/leadership-excellence/performance-planning/types";

function objective(fields: Partial<Objective> = {}): Objective {
  return {
    id: "objective-1",
    code: "OBJ-OPX-2027-001",
    createdAt: "2026-11-12T10:00:00Z",
    createdBy: "leader",
    updatedAt: "2026-11-12T10:00:00Z",
    updatedBy: "leader",
    title: "Reduce packaging scrap to 2%",
    meaning: "Use materials efficiently while maintaining quality.",
    pillar: "OPX",
    alignments: ["C", "Q"],
    alignmentReason: "",
    ownerId: "leader",
    startDate: "2027-01-01",
    endDate: "2027-12-31",
    sources: [],
    sourceRationale: "",
    priority: 8,
    weightage: 30,
    ...fields,
  };
}

function data(objectives: Objective[] = [], goals: Goal[] = []): PlanData {
  return {
    title: "Company plan",
    ownerId: "leader",
    approverId: "leader",
    coordinatorIds: [],
    contributorIds: [],
    startDate: "2027-01-01",
    endDate: "2027-12-31",
    consideredPillars: [],
    findings: [],
    objectives,
    goals,
    assignments: [],
    actions: [],
  };
}

test("objective presentation keeps every selected QCDSMT tag ahead of a legacy scalar", () => {
  const item = objective({ alignments: ["Q", "C", "D"], alignment: "Q" });
  const labels = objectiveAlignmentLabels(item);
  assert.deepEqual(labels, ["Q · Quality", "C · Cost", "D · Delivery"]);
  labels.push("S");
  assert.deepEqual(item.alignments, ["Q", "C", "D"]);
  assert.deepEqual(
    objectiveAlignmentLabels(objective({ alignments: [], alignment: "Q" })),
    [],
  );
});

test("historical Other remains readable without replacing current QCDSMT selections", () => {
  const legacy = objective({
    alignments: [],
    alignment: "OTHER",
    otherBusinessFocus: "Business continuity",
  });
  assert.deepEqual(objectiveAlignmentLabels(legacy), [
    "Business focus: Business continuity",
  ]);
  assert.deepEqual(
    objectiveAlignmentLabels({ ...legacy, alignments: ["D", "T"] }),
    ["D · Delivery", "T · Technology"],
  );
  assert.deepEqual(
    objectiveAlignmentLabels({ ...legacy, alignments: ["Q", "OTHER"] }),
    ["Q · Quality", "Business focus: Business continuity"],
  );
});

test("objective projection preserves zero values and never creates a duplicate stored goal", () => {
  const measured = objective({
    measure: "Scrap rate",
    baseline: 0,
    target: 0,
    unit: "%",
    departmentIds: ["production"],
    approach: "Control filling temperature",
  });
  const plan = data([measured]);
  const before = structuredClone(plan);
  const projected = objectiveAsGoal(measured);
  assert.equal(projected.id, measured.id);
  assert.equal(projected.objectiveId, measured.id);
  assert.equal(projected.baseline, 0);
  assert.equal(projected.target, 0);
  assert.equal(projected.parent, null);
  assert.equal(projected.measure, "Scrap rate");
  assert.equal(projected.unit, "%");
  assert.deepEqual(plan, before);
  assert.equal(plan.goals.length, 0);
  projected.departmentIds.push("quality");
  assert.deepEqual(measured.departmentIds, ["production"]);
});

test("missing objective measures remain missing and are never inferred from legacy linked goals", () => {
  const direction = objective();
  const legacy = objectiveAsGoal(
    objective({ measure: "Scrap rate", baseline: 12, target: 2, unit: "%" }),
  );
  legacy.id = "old-goal-1";
  const second = {
    ...legacy,
    id: "old-goal-2",
    measure: "Downtime",
    baseline: 24,
    target: 8,
    unit: "hours",
  };
  const plan = data([direction], [legacy, second]);
  const before = structuredClone(plan);
  const projected = resolveParentGoal(plan, {
    documentId: "company",
    goalId: direction.id,
    version: 1,
    itemKind: "OBJECTIVE",
  });
  assert.equal(projected?.measure, "");
  assert.equal(projected?.unit, "");
  assert.equal(projected?.baseline, null);
  assert.equal(projected?.target, null);
  assert.deepEqual(projected?.departmentIds, []);
  assert.deepEqual(plan, before);
  assert.equal(objectiveHasOwnMeasurement(direction), false);
  assert.equal(
    objectiveHasOwnMeasurement(objective({ measure: "" })),
    true,
    "a new incomplete objective is distinct from a legacy direction, not automatically ready for approval",
  );
});

test("explicit reference kind distinguishes an objective from a legacy goal with the same identifier", () => {
  const measured = objective({
    measure: "Scrap rate",
    baseline: 8,
    target: 2,
    unit: "%",
  });
  const legacy = {
    ...objectiveAsGoal(measured),
    title: "Old separate goal",
    target: 5,
  };
  const plan = data([measured], [legacy]);
  const reference = { documentId: "company", goalId: measured.id, version: 1 };
  assert.equal(resolveParentGoal(plan, reference)?.target, 5);
  assert.equal(
    resolveParentGoal(plan, { ...reference, itemKind: "GOAL" })?.title,
    "Old separate goal",
  );
  assert.equal(
    resolveParentGoal(plan, { ...reference, itemKind: "OBJECTIVE" })?.target,
    2,
  );
  assert.equal(resolveParentGoal(data([measured]), reference), undefined);
  assert.equal(
    resolveParentGoal(data([], [legacy]), {
      ...reference,
      itemKind: "OBJECTIVE",
    }),
    undefined,
  );
  assert.equal(
    resolveParentGoal(plan, {
      ...reference,
      goalId: "missing",
      itemKind: "OBJECTIVE",
    }),
    undefined,
  );
});

test("projection respects the selected immutable snapshot rather than a newer objective value", () => {
  const approved = data([
    objective({ measure: "Scrap rate", baseline: 8, target: 2, unit: "%" }),
  ]);
  const draft = structuredClone(approved);
  draft.objectives[0].target = 1;
  const reference = {
    documentId: "company",
    goalId: "objective-1",
    version: 1,
    itemKind: "OBJECTIVE" as const,
  };
  assert.equal(resolveParentGoal(approved, reference)?.target, 2);
  assert.equal(resolveParentGoal(draft, reference)?.target, 1);
  assert.equal(approved.objectives[0].target, 2);
});
