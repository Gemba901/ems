import test from "node:test";
import assert from "node:assert/strict";
import {
  compareFindingWeightage,
  findingPriority,
  findingWeightageText,
  validFindingWeightage,
} from "../services/leadership-excellence/performance-planning/finding-weightage";

test("all ten scores map to the agreed priority bands", () => {
  assert.deepEqual(
    Array.from({ length: 10 }, (_, i) => findingPriority(i + 1)),
    [
      "LOW",
      "LOW",
      "LOW",
      "MEDIUM",
      "MEDIUM",
      "MEDIUM",
      "HIGH",
      "HIGH",
      "HIGH",
      "HIGH",
    ],
  );
  assert.equal(findingWeightageText(8), "Weightage 8/10 · High");
});

test("blank and legacy weightage never become zero or an inferred priority", () => {
  const legacy = { priority: "HIGH" };
  for (const value of [undefined, null, "", legacy]) {
    assert.equal(findingPriority(value), "");
    assert.equal(findingWeightageText(value), "Weightage: Not assessed");
  }
});

test("out-of-range, fractional and nonnumeric scores have no derived priority", () => {
  for (const value of [
    0,
    -1,
    11,
    3.5,
    NaN,
    Infinity,
    -Infinity,
    "7",
    true,
    [],
    {},
  ]) {
    assert.equal(validFindingWeightage(value), false);
    assert.equal(findingPriority(value), "");
  }
});

test("highest numeric weightage sorts first, with unassessed findings last", () => {
  const findings = [
    { code: "SW-2", weightage: 3 },
    { code: "SW-5", weightage: null },
    { code: "SW-10", weightage: 10 },
    { code: "SW-1", weightage: 7 },
    { code: "SW-6" },
    { code: "SW-3", weightage: 4 },
  ];
  const originalOrder = findings.map((item) => item.code);
  const ordered = [...findings].sort(compareFindingWeightage);
  assert.deepEqual(
    ordered.map((item) => item.code),
    ["SW-10", "SW-1", "SW-3", "SW-2", "SW-5", "SW-6"],
  );
  assert.deepEqual(
    findings.map((item) => item.code),
    originalOrder,
  );
});

test("ties use code ordering without changing the score", () => {
  const findings = [
    { code: "SW-10", weightage: 7 },
    { code: "SW-2", weightage: 7 },
  ];
  assert.deepEqual(
    findings.sort(compareFindingWeightage).map((item) => item.code),
    ["SW-2", "SW-10"],
  );
});
