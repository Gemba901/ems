import test from "node:test";
import assert from "node:assert/strict";
import {
  findingActionRows,
  goalActionRows,
  visibleProgrammeActionRows,
} from "../services/leadership-excellence/performance-planning/programme-action-links";
import type {
  DeliveryAction,
  Goal,
  PlanningView,
} from "../services/leadership-excellence/performance-planning/types";

type Plan = PlanningView["documents"][number];
const stamp = {
  createdAt: "2027-01-01",
  createdBy: "owner",
  updatedAt: "2027-01-01",
  updatedBy: "owner",
};
function action(
  id: string,
  fields: Partial<DeliveryAction> = {},
): DeliveryAction {
  return {
    ...stamp,
    id,
    code: `ACT-${id}`,
    title: id,
    goalId: "goal",
    parentActionId: "",
    ownerId: "owner",
    dueDate: "2027-04-01",
    expectedResult: "Standard work",
    completionEvidence: "",
    support: "",
    sources: [],
    ...fields,
  };
}
function plan(id: string): Plan {
  return {
    id,
    code: id,
    kind: "DEPARTMENT",
    scopeId: id,
    departmentId: id,
    cycle: "2027",
    status: "DRAFT",
    versions: [],
    revisionReason: "",
    effectiveDate: "",
    history: [],
    acknowledgement: null,
    permissions: {
      canRead: true,
      canEdit: true,
      canApprove: false,
      canConfigure: true,
      canSeeSources: true,
    },
    issues: [],
    data: {
      title: id,
      ownerId: "owner",
      approverId: "approver",
      coordinatorIds: [],
      contributorIds: [],
      startDate: "2027-01-01",
      endDate: "2027-12-31",
      consideredPillars: [],
      findings: [],
      objectives: [],
      goals: [],
      assignments: [],
      actions: [],
      actionLinks: [],
    },
  };
}
function view(
  documents: Plan[],
  fields: Partial<PlanningView> = {},
): PlanningView {
  return { documents, sharedActions: [], ...fields } as PlanningView;
}
const goal = { id: "goal" } as Goal;

test("the server action list is authoritative, deduplicated and document-scoped", () => {
  const department = plan("production");
  department.data.actions = [action("private-draft")];
  const authoritative = { documentId: department.id, action: action("work") };
  const data = view([department], {
    programmeActions: [
      authoritative,
      authoritative,
      { documentId: "quality", action: action("work") },
    ],
  });
  assert.equal(visibleProgrammeActionRows(data).length, 2);
  assert.deepEqual(goalActionRows(data, department, goal), [authoritative]);
  assert.deepEqual(
    visibleProgrammeActionRows({ ...data, programmeActions: [] }),
    [],
  );
});

test("older responses fall back only to current readable documents", () => {
  const visible = plan("visible");
  visible.permissions.canEdit = false;
  visible.data.actions = [action("visible-work")];
  const hidden = plan("hidden");
  hidden.permissions.canRead = false;
  hidden.data.actions = [action("hidden-work")];
  const rows = visibleProgrammeActionRows(view([visible, hidden]));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].action.id, "visible-work");
  assert.equal(rows[0].readOnly, true);
});

test("a canonical goal parent retains its approved version and overrides conflicting goalId", () => {
  const department = plan("production");
  const parent = { documentId: department.id, goalId: goal.id, version: 1 };
  const correct = action("approved-work", { goalId: "", parent });
  const data = view([department], {
    programmeActions: [
      { documentId: department.id, action: correct },
      {
        documentId: department.id,
        action: action("wrong-parent", {
          parent: { ...parent, documentId: "other" },
        }),
      },
      {
        documentId: department.id,
        action: action("objective", {
          parent: { ...parent, itemKind: "OBJECTIVE" },
        }),
      },
    ],
  });
  assert.deepEqual(goalActionRows(data, department, goal), [
    { documentId: department.id, action: correct },
  ]);
  assert.equal(correct.parent?.version, 1);
});

test("explicit shared actions resolve exact snapshots without exposing other candidates", () => {
  const individual = plan("person");
  individual.kind = "INDIVIDUAL";
  individual.data.actionLinks = [
    {
      id: "link",
      goalId: goal.id,
      documentId: "hidden-dept",
      actionId: "work",
      version: 1,
    },
    {
      id: "duplicate",
      goalId: goal.id,
      documentId: "hidden-dept",
      actionId: "work",
      version: 1,
    },
    {
      id: "unavailable",
      goalId: goal.id,
      documentId: "hidden-dept",
      actionId: "newer-only",
      version: 1,
    },
    {
      id: "another-goal",
      goalId: "another",
      documentId: "hidden-dept",
      actionId: "candidate",
      version: 1,
    },
  ];
  const approved = action("work", { title: "Approved instruction" });
  const data = view([individual], {
    programmeActions: [
      {
        documentId: "hidden-dept",
        action: action("work", { title: "Changed draft" }),
      },
    ],
    sharedActions: [
      { documentId: "hidden-dept", version: 1, action: approved },
      { documentId: "hidden-dept", version: 2, action: action("work") },
      { documentId: "hidden-dept", version: 2, action: action("newer-only") },
      { documentId: "hidden-dept", version: 1, action: action("candidate") },
    ],
  });
  assert.deepEqual(goalActionRows(data, individual, goal), [
    { documentId: "hidden-dept", action: approved, version: 1, readOnly: true },
  ]);
});

test("linked action snapshot fallback uses the exact readable version, never current data", () => {
  const individual = plan("person");
  const source = plan("department");
  const approved = action("work", { title: "Version one" });
  source.data.actions = [action("work", { title: "Current draft" })];
  source.versions = [
    {
      version: 1,
      data: { ...source.data, actions: [approved] },
      approvedAt: "2027-01-01",
      approvedBy: "approver",
      effectiveDate: "2027-01-01",
      definitions: [],
      reason: "",
    },
  ];
  individual.data.actionLinks = [
    {
      id: "link",
      goalId: goal.id,
      documentId: source.id,
      actionId: "work",
      version: 1,
    },
    {
      id: "missing-version",
      goalId: goal.id,
      documentId: source.id,
      actionId: "work",
      version: 2,
    },
  ];
  const data = view([individual, source], { programmeActions: [] });
  assert.deepEqual(goalActionRows(data, individual, goal), [
    { documentId: source.id, action: approved, version: 1, readOnly: true },
  ]);
  source.permissions.canRead = false;
  assert.deepEqual(goalActionRows(data, individual, goal), []);
});

test("direct SWOT actions stay with the finding across reviews and exclude goal-bound work", () => {
  const source = { documentId: "swot", findingId: "finding", version: 2 };
  const direct = action("direct", {
    goalId: "",
    sources: [{ ...source, version: 1 }],
  });
  const data = view([], {
    programmeActions: [
      { documentId: "production", action: direct },
      {
        documentId: "quality",
        action: action("goal-work", { sources: [source] }),
      },
      {
        documentId: "quality",
        action: action("parent-work", {
          goalId: "",
          parent: { documentId: "quality", goalId: goal.id, version: 1 },
          sources: [source],
        }),
      },
      {
        documentId: "quality",
        action: action("different-swot", {
          goalId: "",
          sources: [{ ...source, documentId: "other-swot" }],
        }),
      },
    ],
  });
  assert.deepEqual(findingActionRows(data, source), [
    { documentId: "production", action: direct },
  ]);
  assert.equal(direct.sources[0].version, 1);
});
