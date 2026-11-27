import test from "node:test";
import assert from "node:assert/strict";
import {
  approvalIssueField,
  approvedProgrammeItemHistory,
  contributionDateBounds,
  contributionDateIssue,
  embeddedDeadlineWarnings,
  sameParentIdentity,
} from "../services/leadership-excellence/performance-planning/editor-guidance";
import type {
  ApprovedVersion,
  Goal,
  Objective,
  ParentGoal,
  PlanningDocument,
} from "../services/leadership-excellence/performance-planning/types";

function version(
  number: number,
  fields: Partial<ApprovedVersion> = {},
): ApprovedVersion {
  return {
    version: number,
    data: {
      objectives: [{ id: "objective", target: number }] as Objective[],
      goals: [{ id: "goal", target: number }] as Goal[],
    },
    ...fields,
  } as ApprovedVersion;
}

test("item history excludes cumulative copies from sibling and whole-plan approvals", () => {
  const first = version(1, {
    approvedItem: { kind: "objective", itemId: "objective" },
    itemVersions: { objective: 1 },
  });
  const revised = version(3, {
    approvedItem: { kind: "objective", itemId: "objective" },
    itemVersions: { objective: 3 },
  });
  const document = {
    versions: [
      first,
      version(2, {
        approvedItem: { kind: "objective", itemId: "sibling" },
        itemVersions: { objective: 1, sibling: 2 },
      }),
      revised,
      version(4, { itemVersions: { objective: 3, goal: 4 } }),
      version(5, {
        approvedItem: { kind: "goal", itemId: "objective" },
      }),
    ],
  } as PlanningDocument;

  const history = approvedProgrammeItemHistory(document, "objective", "objective");
  assert.deepEqual(history.map(({ version }) => version.version), [1, 3]);
  assert.deepEqual(history.map(({ record }) => record.target), [1, 3]);
  assert.equal(history[0].version, first);
  assert.equal(history[1].version, revised);
  assert.deepEqual(
    approvedProgrammeItemHistory(document, "goal", "goal").map(({ version }) => version.version),
    [4],
  );
  assert.deepEqual(approvedProgrammeItemHistory(document, "goal", "missing"), []);
});

test("legacy full-plan snapshots still expose approved goal history", () => {
  const document = { versions: [version(1), version(2)] } as PlanningDocument;
  assert.deepEqual(
    approvedProgrammeItemHistory(document, "goal", "goal").map(({ version }) => version.version),
    [1, 2],
  );
});

test("a parent revision keeps its identity while advancing the approved version", () => {
  const parent: ParentGoal = { documentId: "company", goalId: "objective", itemKind: "OBJECTIVE", version: 1 };
  assert.equal(sameParentIdentity(parent, { ...parent, version: 3 }), true);
  assert.equal(sameParentIdentity(parent, { ...parent, documentId: "other-company" }), false);
  assert.equal(sameParentIdentity(parent, { ...parent, goalId: "other-objective" }), false);
  assert.equal(sameParentIdentity(parent, { ...parent, itemKind: "GOAL" }), false);
  assert.equal(sameParentIdentity(undefined, parent), false);
  assert.equal(sameParentIdentity(parent, null), false);
  const legacy: ParentGoal = { documentId: "department", goalId: "goal", version: 1 };
  assert.equal(sameParentIdentity(legacy, { ...legacy, itemKind: "GOAL", version: 2 }), true);
});

test("contribution deadlines use the intersection of planning and approved-parent dates", () => {
  const period = { startDate: "2027-01-01", endDate: "2027-12-31" };
  const bounds = contributionDateBounds(period, { startDate: "2027-04-01", endDate: "2027-09-30" });
  assert.deepEqual(bounds, { startDate: "2027-04-01", endDate: "2027-09-30" });
  assert.deepEqual(contributionDateBounds(period, { startDate: "2026-01-01", endDate: "2028-12-31" }), period);
  for (const date of ["", "2027-04-01", "2027-07-15", "2027-09-30"]) {
    assert.equal(contributionDateIssue(date, bounds), "");
  }
  for (const date of ["2027-03-31", "2027-10-01"]) {
    assert.match(contributionDateIssue(date, bounds), /2027-04-01.*2027-09-30/);
  }
  assert.deepEqual(contributionDateBounds(undefined, { endDate: "2027-09-30" }), { startDate: "", endDate: "2027-09-30" });
  assert.deepEqual(contributionDateBounds(undefined), { startDate: "", endDate: "" });
});

test("embedded date guidance flags stale template deadlines without rewriting content", () => {
  const fields = {
    title: "Reduce defects by 31 December 2026",
    result: "Finish by 2027-09-30",
    measure: "31 December 2026 count",
    definition: "Count accepted units at 30 Sep 2027",
    endDate: "2027-09-30",
  };
  const original = structuredClone(fields);
  const warnings = embeddedDeadlineWarnings(fields);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /31 December 2026.*2027-09-30/);
  assert.deepEqual(fields, original);
  assert.deepEqual(embeddedDeadlineWarnings({ ...fields, endDate: "" }), []);
  assert.deepEqual(embeddedDeadlineWarnings({ title: "Improve 10 lines by 2027", endDate: "2027-09-30" }), []);
});

test("approval messages navigate to the field that fixes the failing check", () => {
  const cases: [string, string][] = [
    ["Choose the designated approver in plan settings.", "settings"],
    ["Record the measured baseline before approval; an explanation is not a measured baseline.", "baseline"],
    ["Identify the baseline measurement period.", "baselinePeriod"],
    ["The contribution due date must stay within its approved parent period.", "endDate"],
    ["Enter weightage within the selected pillar allocation.", "weightage"],
    ["Explain exactly how this measure is counted.", "definition"],
    ["Choose an approved company objective for this department goal.", "parent"],
    ["Choose the measurement review frequency.", "reviewFrequency"],
    ["Describe the commitment.", "title"],
    ["Identify the baseline / measurement source and checks.", "source"],
    ["Identify the source of the company measure.", "dataSource"],
    ["Describe the Business focus.", "otherBusinessFocus"],
    ["A higher-is-better target must be at least the baseline.", "target"],
    ["Explain how the department can reach this target with its resources and approach.", "approach"],
    ["Explain how this department goal supports the linked company objective.", "relevance"],
  ];
  for (const [issue, field] of cases) assert.equal(approvalIssueField(issue), field, issue);
});
