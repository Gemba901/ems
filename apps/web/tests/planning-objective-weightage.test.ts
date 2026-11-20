import test from "node:test";
import assert from "node:assert/strict";
import {
  PILLAR_BUDGETS,
  objectiveAllocation,
  objectiveWeightLimit,
  planningPillarBudgets,
  validObjectivePriority,
  validObjectiveWeightage,
} from "../services/leadership-excellence/performance-planning/objective-weightage";
import type {
  ApprovedVersion,
  PlanningDocument,
  PlanningReferences,
} from "../services/leadership-excellence/performance-planning/types";

test("objective weights respect each pillar limit and numerical priority is independent", () => {
  for (const [pillar, limit] of Object.entries(PILLAR_BUDGETS)) {
    assert.equal(objectiveWeightLimit(pillar), limit);
    assert(validObjectiveWeightage(1, pillar));
    assert(validObjectiveWeightage(limit, pillar));
    assert(!validObjectiveWeightage(limit + 0.01, pillar));
    assert(!validObjectiveWeightage(0, pillar));
    assert(!validObjectiveWeightage(0.5, pillar));
    assert(!validObjectiveWeightage(1.001, pillar));
    assert(!validObjectiveWeightage("1", pillar));
    assert(!validObjectiveWeightage(null, pillar));
  }
  assert(validObjectiveWeightage(12.25, "OPX"));
  assert(!validObjectiveWeightage(12.25, "LEX"));
  assert.equal(objectiveWeightLimit("CUSTOM"), null);
  assert(validObjectivePriority(1));
  assert(validObjectivePriority(10));
  assert(!validObjectivePriority(1.5));
  assert(!validObjectivePriority(0));
  assert(!validObjectivePriority(11));
});

test("totals use exact hundredths without changing or redistributing objective values", () => {
  const objectives = [
    { pillar: "OPX", weightage: 12.25 },
    { pillar: "OPX", weightage: 9.75 },
    { pillar: "OPX", weightage: 8 },
  ];
  const copy = structuredClone(objectives);
  assert.equal(objectiveAllocation(objectives, "OPX").total, 30);
  assert.equal(objectiveAllocation(objectives, "OPX").balanced, true);
  objectives[0].weightage = 12.26;
  const allocation = objectiveAllocation(objectives, "OPX");
  assert.equal(allocation.total, 30.01);
  assert.equal(allocation.delta, -0.01);
  assert.equal(allocation.balanced, false);
  assert.match(allocation.messages.join(" "), /Reduce 0.01%/);
  assert.equal(objectives[0].weightage, 12.26);
  assert.deepEqual(objectives.slice(1), copy.slice(1));
});

test("blank weights remain unassigned, invalid zero is not silently accepted, unused pillars stay optional", () => {
  const unassigned = objectiveAllocation(
    [{ pillar: "LEX", weightage: null }],
    "LEX",
  );
  assert.equal(unassigned.missing, 1);
  assert.equal(unassigned.balanced, false);
  const zero = objectiveAllocation([{ pillar: "LEX", weightage: 0 }], "LEX");
  assert.equal(zero.invalid, 1);
  assert.equal(zero.missing, 0);
  const unused = objectiveAllocation([], "OPX");
  assert.equal(unused.count, 0);
  assert.match(unused.messages.join(" "), /only if it supports this plan/);
});

test("approved plans retain pinned allocations when Area 01 publishes newer weights", () => {
  const savedWeights = { ...PILLAR_BUDGETS, LEX: 15, PEX: 15 };
  const liveWeights = { ...PILLAR_BUDGETS, LEX: 20, PEX: 10 };
  const references: PlanningReferences = {
    departments: [], people: [], teams: [], pillars: [],
    pillarWeights: { source: "AREA_01", approved: true, version: 3, weights: liveWeights },
  };
  const documentWith = (fields: Partial<ApprovedVersion>) => ({
    versions: [{ version: 2, ...fields }],
  }) as PlanningDocument;

  const published = planningPillarBudgets(documentWith({
    pillarWeights: { source: "AREA_01", approved: true, version: 1, weights: savedWeights },
    localPillarWeights: PILLAR_BUDGETS,
  }), references);
  assert.deepEqual(published.weights, savedWeights);
  assert.match(published.label, /version 1.*pinned/);

  const local = planningPillarBudgets(documentWith({ localPillarWeights: savedWeights }), references);
  assert.deepEqual(local.weights, savedWeights);
  assert.match(local.label, /pinned.*unavailable/);

  const legacy = planningPillarBudgets(documentWith({}), references);
  assert.deepEqual(legacy.weights, PILLAR_BUDGETS);
  assert.match(legacy.label, /no Area 01 publication was pinned/);

  const draft = planningPillarBudgets({ versions: [] } as unknown as PlanningDocument, references);
  assert.deepEqual(draft.weights, liveWeights);
  assert.match(draft.label, /version 3/);
  assert.deepEqual(planningPillarBudgets(undefined, { ...references, pillarWeights: undefined }).weights, PILLAR_BUDGETS);
});

test("custom pinned budgets govern validation and unallocated capacity does not block an item", () => {
  const budgets = { ...PILLAR_BUDGETS, LEX: 20, PEX: 10 };
  assert.equal(objectiveWeightLimit("LEX", budgets), 20);
  assert.equal(validObjectiveWeightage(15, "LEX", budgets), true);
  assert.equal(validObjectiveWeightage(11, "PEX", budgets), false);
  const allocation = objectiveAllocation([{ pillar: "LEX", weightage: 15 }], "LEX", budgets);
  assert.equal(allocation.target, 20);
  assert.equal(allocation.delta, 5);
  assert.equal(allocation.invalid, 0);
  assert.match(allocation.messages.join(" "), /5% remains unallocated.*does not block an individual objective's approval/);
});
