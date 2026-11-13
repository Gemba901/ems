import test from "node:test";
import assert from "node:assert/strict";
import {
  businessAlignmentLabels,
  businessAlignmentSelections,
} from "../services/leadership-excellence/performance-planning/business-alignment";

test("finding selections preserve multiple result areas and business focus without exposing its compatibility key", () => {
  const input = {
    alignments: ["OTHER", "D", "Q", "D"],
    alignment: "C",
    otherBusinessFocus: "Supply resilience",
  };
  assert.deepEqual(businessAlignmentSelections(input), ["Q", "D", "OTHER"]);
  assert.deepEqual(businessAlignmentLabels(input), [
    "Q · Quality",
    "D · Delivery",
    "Business focus: Supply resilience",
  ]);
  assert.deepEqual(input.alignments, ["OTHER", "D", "Q", "D"]);
});

test("explicit empty finding alignment is canonical; legacy scalar records remain readable", () => {
  assert.deepEqual(
    businessAlignmentLabels({
      alignments: [],
      alignment: "OTHER",
      otherBusinessFocus: "Old detail",
    }),
    [],
  );
  assert.deepEqual(
    businessAlignmentLabels({
      alignment: "OTHER",
      otherBusinessFocus: "Cash continuity",
    }),
    ["Business focus: Cash continuity"],
  );
  assert.deepEqual(businessAlignmentSelections({ alignment: "D" }), ["D"]);
  assert.deepEqual(
    businessAlignmentSelections({
      alignments: ["Quality", "Cost", "Business focus"],
    }),
    ["Q", "C", "OTHER"],
  );
});
