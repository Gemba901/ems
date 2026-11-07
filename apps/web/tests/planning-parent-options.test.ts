import test from "node:test";
import assert from "node:assert/strict";
import {
  approvedParentAvailability,
  approvedParentOptions,
  planningDocumentFingerprint,
} from "../components/leadership-excellence/performance-planning/PlanningParents";
import type {
  ApprovedParentGoal,
  PlanningDocument,
  PlanningView,
} from "../services/leadership-excellence/performance-planning.service";

const child: PlanningDocument = {
  id: "production-plan",
  code: "DEP-2027-001",
  kind: "DEPARTMENT",
  scopeId: "production",
  departmentId: "production",
  cycle: "2027",
  status: "DRAFT",
  versions: [],
  history: [],
  effectiveDate: "",
  revisionReason: "",
  acknowledgement: null,
  data: {
    title: "Production plan",
    ownerId: "hod",
    approverId: "leader",
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
  },
};
const parent: ApprovedParentGoal = {
  documentId: "company-plan",
  kind: "COMPANY",
  scopeId: "company",
  departmentId: "",
  cycle: "2027",
  version: 2,
  effectiveDate: "2027-03-01",
  goal: {
    id: "downtime",
    code: "GOAL-002",
    title: "Reduce downtime",
    departmentIds: ["production"],
    startDate: "2027-01-01",
    endDate: "2027-12-31",
  },
};
function workspace(parents: ApprovedParentGoal[] = []): PlanningView {
  return {
    revision: 1,
    documents: [],
    approvedParentGoals: parents,
    kras: [],
    definitions: [],
    sharedActions: [],
    actor: {
      userId: "user",
      employeeId: "hod",
      departmentId: "production",
      role: "HOD",
      name: "HOD",
    },
    references: { departments: [], people: [], teams: [], pillars: [] },
  };
}

test("newly approved and future-effective goals appear without the full parent document", () => {
  const view = workspace();
  assert.equal(approvedParentOptions(view, child, "2026-11-07").length, 0);
  view.approvedParentGoals = [parent];
  const [option] = approvedParentOptions(view, child, "2026-11-07");
  assert.match(option.label, /Effective 2027-03-01/);
  assert.deepEqual(JSON.parse(option.value), {
    documentId: "company-plan",
    goalId: "downtime",
    version: 2,
  });
});

test("department choices retain planning year and contributing department restrictions", () => {
  const view = workspace([
    parent,
    { ...parent, documentId: "other-year", cycle: "2028" },
    {
      ...parent,
      documentId: "other-department",
      goal: { ...parent.goal, departmentIds: ["quality"] },
    },
    {
      ...parent,
      documentId: "department-parent",
      kind: "DEPARTMENT",
      scopeId: "production",
    },
  ]);
  assert.equal(approvedParentOptions(view, child, "2026-11-07").length, 1);
});

test("individual, team and position plans receive only their department's approved goals", () => {
  const view = workspace([
    parent,
    {
      ...parent,
      documentId: "production-parent",
      kind: "DEPARTMENT",
      scopeId: "production",
    },
    {
      ...parent,
      documentId: "quality-parent",
      kind: "DEPARTMENT",
      scopeId: "quality",
    },
  ]);
  for (const kind of ["INDIVIDUAL", "TEAM", "POSITION"] as const) {
    const options = approvedParentOptions(
      view,
      { ...child, kind, scopeId: "operator" },
      "2026-11-07",
    );
    assert.equal(options.length, 1);
    assert.equal(JSON.parse(options[0].value).documentId, "production-parent");
  }
});

test("latest approval sorts first while previously linked version remains selectable", () => {
  const view = workspace([
    { ...parent, version: 1, effectiveDate: "2026-11-01" },
    parent,
  ]);
  assert.deepEqual(
    approvedParentOptions(view, child, "2026-11-07").map(
      (o) => JSON.parse(o.value).version,
    ),
    [2, 1],
  );
});

test("draft goals never become fallback choices and an explicit empty authorised list is respected", () => {
  const view = workspace();
  view.documents = [
    {
      ...child,
      kind: "COMPANY",
      data: { ...child.data, goals: [parent.goal as never] },
      permissions: {
        canRead: true,
        canEdit: true,
        canApprove: true,
        canConfigure: true,
        canSeeSources: true,
      },
      issues: [],
    },
  ];
  delete view.approvedParentGoals;
  assert.equal(approvedParentOptions(view, child, "2026-11-07").length, 0);
  view.documents[0].versions = [
    {
      version: 1,
      data: view.documents[0].data,
      effectiveDate: "2026-11-01",
      approvedAt: "2026-11-01T10:00:00Z",
      approvedBy: "leader",
      definitions: [],
      reason: "",
    },
  ];
  assert.equal(approvedParentOptions(view, child, "2026-11-07").length, 1);
  view.approvedParentGoals = [];
  assert.equal(approvedParentOptions(view, child, "2026-11-07").length, 0);
});

test("safe contribution refresh distinguishes derived checks from concurrent plan edits", () => {
  const opened = planningDocumentFingerprint(child);
  assert.equal(
    planningDocumentFingerprint({
      ...child,
      ...{ issues: ["New parent approved"] },
    }),
    opened,
  );
  assert.notEqual(
    planningDocumentFingerprint({
      ...child,
      data: { ...child.data, title: "Another editor's change" },
    }),
    opened,
  );
  assert.notEqual(
    planningDocumentFingerprint({ ...child, status: "APPROVED" }),
    opened,
  );
});

test("Housekeeping 2018 explains an approved goal assigned only to Administration and Dispatch", () => {
  const housekeeping = {
    ...child,
    id: "housekeeping-plan",
    scopeId: "housekeeping",
    departmentId: "housekeeping",
    cycle: "2018",
  };
  const view = workspace([
    {
      ...parent,
      cycle: "2018",
      goal: {
        ...parent.goal,
        code: "GOAL-2018-0045",
        title: "test",
        departmentIds: ["administration", "dispatch"],
      },
    },
  ]);
  view.references.departments = [
    { id: "housekeeping", name: "Housekeeping" },
    { id: "administration", name: "Administration" },
    { id: "dispatch", name: "Dispatch" },
  ];
  const before = JSON.stringify(view);
  const result = approvedParentAvailability(view, housekeeping, "2026-11-07");
  assert.deepEqual(result.options, []);
  assert.equal(result.reason, "NOT_CONTRIBUTING_DEPARTMENT");
  assert.equal(result.departmentName, "Housekeeping");
  assert.match(result.message, /2018.*Housekeeping.*contributing department/);
  assert.match(result.message, /revise.*add Housekeeping.*approve the revision/);
  assert.equal(result.unavailableOptions.length, 1);
  assert.equal(result.unavailableOptions[0].code, "GOAL-2018-0045");
  assert.equal(result.unavailableOptions[0].title, "test");
  assert.deepEqual(result.unavailableOptions[0].departmentNames, [
    "Administration",
    "Dispatch",
  ]);
  assert.equal(JSON.stringify(view), before, "Diagnostics never mutate an approved snapshot");
});

test("parent availability distinguishes a different planning year from a missing approval", () => {
  const view = workspace([parent]);
  const result = approvedParentAvailability(view, { ...child, cycle: "2018" }, "2026-11-07");
  assert.equal(result.reason, "DIFFERENT_YEAR");
  assert.match(result.message, /2027.*2018/);
  assert.deepEqual(result.options, []);
  assert.deepEqual(result.unavailableOptions, []);

  view.approvedParentGoals = [];
  const empty = approvedParentAvailability(view, child, "2026-11-07");
  assert.equal(empty.reason, "NO_APPROVED_PARENT");
  assert.match(empty.message, /No approved company goal/);
});

test("availability diagnostics respect an explicit authorised empty list and never substitute drafts", () => {
  const view = workspace();
  view.documents = [{
    ...child,
    kind: "COMPANY",
    data: { ...child.data, goals: [parent.goal as never] },
    permissions: { canRead: true, canEdit: true, canApprove: true, canConfigure: true, canSeeSources: true },
    issues: [],
  }];
  delete view.approvedParentGoals;
  assert.equal(approvedParentAvailability(view, child, "2026-11-07").reason, "NO_APPROVED_PARENT");
  view.documents[0].versions = [{
    version: 1, data: view.documents[0].data, effectiveDate: "2026-11-01",
    approvedAt: "2026-11-01T10:00:00Z", approvedBy: "leader", definitions: [], reason: "",
  }];
  assert.equal(approvedParentAvailability(view, child, "2026-11-07").reason, "AVAILABLE");
  view.approvedParentGoals = [];
  const hidden = approvedParentAvailability(view, child, "2026-11-07");
  assert.equal(hidden.reason, "NO_APPROVED_PARENT");
  assert.deepEqual(hidden.unavailableOptions, []);
  assert(!JSON.stringify(hidden).includes(parent.goal.title));
});

test("personal availability never exposes approved goals from a different department", () => {
  const personal = { ...child, kind: "INDIVIDUAL" as const, scopeId: "operator" };
  const view = workspace([{
    ...parent,
    kind: "DEPARTMENT",
    scopeId: "quality",
    goal: { ...parent.goal, title: "Restricted quality plan goal" },
  }]);
  view.references.departments = [{ id: "production", name: "Production" }];
  const result = approvedParentAvailability(view, personal, "2026-11-07");
  assert.equal(result.reason, "NO_APPROVED_PARENT");
  assert.match(result.message, /Production's plan.*2027/);
  assert.deepEqual(result.unavailableOptions, []);
  assert(!JSON.stringify(result).includes("Restricted quality"));
  view.approvedParentGoals = [{ ...parent, kind: "DEPARTMENT", scopeId: "production", cycle: "2028" }];
  assert.equal(approvedParentAvailability(view, personal, "2026-11-07").reason, "DIFFERENT_YEAR");
});

test("eligible choices stay selectable alongside separately explained non-contributor choices", () => {
  const view = workspace([
    parent,
    { ...parent, documentId: "other-plan", goal: { ...parent.goal, id: "quality-only", departmentIds: ["quality"] } },
  ]);
  const result = approvedParentAvailability(view, child, "2026-11-07");
  assert.equal(result.reason, "AVAILABLE");
  assert.deepEqual(result.options, approvedParentOptions(view, child, "2026-11-07"));
  assert.equal(result.options.length, 1);
  assert.equal(result.unavailableOptions.length, 1);
  assert.equal(JSON.parse(result.unavailableOptions[0].value).goalId, "quality-only");
});
