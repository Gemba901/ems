import test from "node:test";
import assert from "node:assert/strict";
import {
  PILLAR_BUDGETS,
  objectiveAllocation,
  objectiveWeightLimit,
  validObjectivePriority,
  validObjectiveWeightage,
} from "../services/leadership-excellence/performance-planning/objective-weightage";

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
