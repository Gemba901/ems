import test from "node:test";
import assert from "node:assert/strict";
import {
  approvedParentAvailability,
  approvedParentOptions,
  approvedParents,
  parentAvailableToDepartment,
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
  itemKind: "OBJECTIVE",
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

test("newly approved and future-effective objectives appear without the full parent document", () => {
  const view = workspace();
  assert.equal(approvedParentOptions(view, child, "2026-11-07").length, 0);
  view.approvedParentGoals = [parent];
  const [option] = approvedParentOptions(view, child, "2026-11-07");
  assert.match(option.label, /Effective 2027-03-01/);
  assert.deepEqual(JSON.parse(option.value), {
    documentId: "company-plan",
    goalId: "downtime",
    version: 2,
    itemKind: "OBJECTIVE",
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
      itemKind: undefined,
      scopeId: "production",
    },
  ]);
  assert.equal(approvedParentOptions(view, child, "2026-11-07").length, 1);
});

test("only the exact approved programme result opens an objective to every department", () => {
  const view = workspace([
    { ...parent, goal: { ...parent.goal, departmentIds: ["quality"] } },
    {
      ...parent,
      version: 1,
      goal: { ...parent.goal, departmentIds: ["quality"] },
    },
  ]);
  const objective = {
    ...parent.goal,
    result: "Reduce changeover time to 30 minutes",
    departmentIds: ["quality"],
  };
  view.documents = [
    {
      ...child,
      id: parent.documentId,
      kind: "COMPANY",
      data: {
        ...child.data,
        objectives: [{ ...objective, result: "An unsaved draft" } as never],
      },
      permissions: {
        canRead: true,
        canEdit: true,
        canApprove: false,
        canConfigure: false,
        canSeeSources: false,
      },
      issues: [],
      versions: [
        {
          version: 1,
          data: {
            ...child.data,
            objectives: [{ ...objective, result: "" } as never],
          },
          companyPlanningModel: "MEASURABLE_OBJECTIVES",
          effectiveDate: "2027-01-01",
          approvedAt: "2026-11-01T10:00:00Z",
          approvedBy: "leader",
          definitions: [],
          reason: "",
        },
        {
          version: 2,
          data: { ...child.data, objectives: [objective as never] },
          companyPlanningModel: "MEASURABLE_OBJECTIVES",
          approvedItem: { kind: "objective", itemId: objective.id },
          effectiveDate: "2027-03-01",
          approvedAt: "2026-11-02T10:00:00Z",
          approvedBy: "leader",
          definitions: [],
          reason: "",
        },
      ],
    },
  ];
  const before = JSON.stringify(view);
  const result = approvedParentAvailability(view, child, "2026-11-07");
  assert.deepEqual(
    result.options.map((option) => JSON.parse(option.value).version),
    [2],
  );
  assert.deepEqual(
    result.unavailableOptions.map((option) => JSON.parse(option.value).version),
    [1],
  );
  assert.equal(
    parentAvailableToDepartment(
      view,
      view.approvedParentGoals![0],
      "production",
    ),
    true,
  );
  assert.equal(
    parentAvailableToDepartment(
      view,
      view.approvedParentGoals![1],
      "production",
    ),
    false,
  );
  assert.equal(JSON.stringify(view), before);
  view.documents[0].versions[1].data.objectives[0].result = "   ";
  assert.deepEqual(approvedParentOptions(view, child, "2026-11-07"), []);
  view.documents[0].versions = [];
  assert.deepEqual(
    approvedParentOptions(view, child, "2026-11-07"),
    [],
    "A draft result never widens scope",
  );
});

test("fallback summaries expose only the canonical item from a cumulative approval", () => {
  const view = workspace();
  delete view.approvedParentGoals;
  const original = { ...parent.goal, result: "Original approved result" };
  const second = {
    ...original,
    id: "second",
    code: "OBJ-002",
    result: "Second approved result",
  };
  view.documents = [
    {
      ...child,
      id: parent.documentId,
      kind: "COMPANY",
      permissions: {
        canRead: true,
        canEdit: true,
        canApprove: true,
        canConfigure: true,
        canSeeSources: true,
      },
      issues: [],
      versions: [
        {
          version: 1,
          data: { ...child.data, objectives: [original as never] },
          companyPlanningModel: "MEASURABLE_OBJECTIVES",
          approvedItem: { kind: "objective", itemId: original.id },
          effectiveDate: "2027-01-01",
          approvedAt: "2026-11-01T10:00:00Z",
          approvedBy: "leader",
          definitions: [],
          reason: "",
        },
        {
          version: 2,
          data: {
            ...child.data,
            objectives: [original as never, second as never],
          },
          companyPlanningModel: "MEASURABLE_OBJECTIVES",
          approvedItem: { kind: "objective", itemId: second.id },
          effectiveDate: "2027-01-01",
          approvedAt: "2026-11-02T10:00:00Z",
          approvedBy: "leader",
          definitions: [],
          reason: "",
        },
      ],
    },
  ];
  assert.deepEqual(
    approvedParents(view).map((option) => [option.goal.id, option.version]),
    [
      [original.id, 1],
      [second.id, 2],
    ],
  );
});

test("team and position plans receive only their department's approved goals", () => {
  const view = workspace([
    parent,
    {
      ...parent,
      documentId: "production-parent",
      kind: "DEPARTMENT",
      itemKind: undefined,
      scopeId: "production",
    },
    {
      ...parent,
      documentId: "quality-parent",
      kind: "DEPARTMENT",
      itemKind: undefined,
      scopeId: "quality",
    },
  ]);
  for (const kind of ["TEAM", "POSITION"] as const) {
    const options = approvedParentOptions(
      view,
      { ...child, kind, scopeId: "operator" },
      "2026-11-07",
    );
    assert.equal(options.length, 1);
    assert.equal(JSON.parse(options[0].value).documentId, "production-parent");
  }
});

test("a Management individual can select authorised company and Production goals without the full plans", () => {
  const personal = {
    ...child,
    kind: "INDIVIDUAL" as const,
    scopeId: "ems",
    departmentId: "management",
  };
  const productionParent: ApprovedParentGoal = {
    ...parent,
    documentId: "production-parent",
    kind: "DEPARTMENT",
    itemKind: undefined,
    scopeId: "production",
    departmentId: "production",
  };
  const view = workspace([
    parent,
    { ...productionParent, version: 1, effectiveDate: "2026-11-01" },
    productionParent,
    { ...productionParent, documentId: "next-year", cycle: "2028" },
    {
      ...productionParent,
      documentId: "management-parent",
      scopeId: "management",
      departmentId: "management",
      goal: { ...parent.goal, id: "management-goal", code: "GOAL-003" },
    },
  ]);
  view.actor = {
    userId: "ems-user",
    employeeId: "ems",
    departmentId: "management",
    role: "EMPLOYEE",
    name: "EMS",
  };
  view.references.departments = [
    { id: "management", name: "Management" },
    { id: "production", name: "Production" },
  ];
  const options = approvedParentOptions(view, personal, "2026-11-07");
  assert.equal(view.documents.length, 0);
  assert.equal(options.length, 4);
  assert.deepEqual(
    options.map((option) => JSON.parse(option.value)),
    [
      {
        documentId: "company-plan",
        goalId: "downtime",
        version: 2,
        itemKind: "OBJECTIVE",
      },
      { documentId: "production-parent", goalId: "downtime", version: 2 },
      {
        documentId: "management-parent",
        goalId: "management-goal",
        version: 2,
      },
      { documentId: "production-parent", goalId: "downtime", version: 1 },
    ],
  );
  assert.match(options[0].label, /Company.*GOAL-002.*Reduce downtime.*v2/);
  assert.match(
    options[1].label,
    /Production.*GOAL-002.*Reduce downtime.*v2.*Effective 2027-03-01/,
  );
  assert.match(options[2].label, /Management.*GOAL-003/);
  assert.doesNotMatch(options[3].label, /Effective/);
  const availability = approvedParentAvailability(view, personal, "2026-11-07");
  assert.equal(availability.reason, "AVAILABLE");
  assert.deepEqual(availability.options, options);
  assert.deepEqual(availability.unavailableOptions, []);
});

test("an assigned parent can be retained only by its exact existing individual goal", () => {
  const personal = {
    ...child,
    id: "ems-plan",
    kind: "INDIVIDUAL" as const,
    scopeId: "ems",
    departmentId: "management",
  };
  const view = workspace([
    {
      ...parent,
      documentId: "production-parent",
      kind: "DEPARTMENT",
      itemKind: undefined,
      scopeId: "production",
      retainedFor: [{ documentId: personal.id, goalId: "assigned-goal" }],
    },
  ]);
  const retained = approvedParentAvailability(
    view,
    personal,
    "2026-11-07",
    "assigned-goal",
  );
  assert.equal(retained.reason, "AVAILABLE");
  assert.deepEqual(
    retained.options.map((option) => JSON.parse(option.value)),
    [{ documentId: "production-parent", goalId: "downtime", version: 2 }],
  );
  assert.match(retained.options[0].label, /Effective 2027-03-01/);
  for (const [document, goalId] of [
    [personal, undefined],
    [personal, "new-goal"],
    [personal, "another-goal"],
    [{ ...personal, id: "another-plan" }, "assigned-goal"],
  ] as const) {
    const unavailable = approvedParentAvailability(
      view,
      document,
      "2026-11-07",
      goalId,
    );
    assert.equal(unavailable.reason, "NO_APPROVED_PARENT");
    assert.deepEqual(unavailable.options, []);
    assert.deepEqual(unavailable.unavailableOptions, []);
  }
  assert.deepEqual(
    approvedParentOptions(
      view,
      { ...personal, id: undefined },
      "2026-11-07",
      "assigned-goal",
    ),
    [],
  );
});

test("retained-only summaries do not suggest other planning years to unrelated goals", () => {
  const personal = {
    ...child,
    id: "ems-plan",
    kind: "INDIVIDUAL" as const,
    scopeId: "ems",
    departmentId: "management",
  };
  const view = workspace([
    {
      ...parent,
      kind: "DEPARTMENT",
      itemKind: undefined,
      scopeId: "production",
      cycle: "2028",
      retainedFor: [{ documentId: personal.id, goalId: "assigned-goal" }],
    },
  ]);
  const unavailable = approvedParentAvailability(view, personal, "2026-11-07");
  assert.equal(unavailable.reason, "NO_APPROVED_PARENT");
  assert.doesNotMatch(unavailable.message, /2028/);
  const matching = approvedParentAvailability(
    view,
    personal,
    "2026-11-07",
    "assigned-goal",
  );
  assert.equal(matching.reason, "DIFFERENT_YEAR");
  assert.deepEqual(matching.options, []);
  assert.match(matching.message, /2028.*2027/);
});

test("unrestricted summaries remain selectable alongside retained-only and empty retained lists", () => {
  const personal = {
    ...child,
    id: "ems-plan",
    kind: "INDIVIDUAL" as const,
    scopeId: "ems",
    departmentId: "management",
  };
  const availableParent: ApprovedParentGoal = {
    ...parent,
    documentId: "production-parent",
    kind: "DEPARTMENT",
    itemKind: undefined,
    scopeId: "production",
  };
  const view = workspace([
    availableParent,
    {
      ...availableParent,
      documentId: "assigned-parent",
      retainedFor: [{ documentId: personal.id, goalId: "assigned-goal" }],
    },
    { ...availableParent, documentId: "no-assignments", retainedFor: [] },
  ]);
  const newGoal = approvedParentAvailability(
    view,
    personal,
    "2026-11-07",
    "new-goal",
  );
  assert.equal(newGoal.reason, "AVAILABLE");
  assert.equal(newGoal.options.length, 1);
  assert.equal(
    JSON.parse(newGoal.options[0].value).documentId,
    "production-parent",
  );
  assert.match(newGoal.options[0].label, /Effective 2027-03-01/);
  assert.equal(
    approvedParentOptions(view, personal, "2026-11-07", "assigned-goal").length,
    2,
  );

  view.approvedParentGoals = [];
  assert.deepEqual(
    approvedParentOptions(view, personal, "2026-11-07", "assigned-goal"),
    [],
  );
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

test("legacy company goals are available only to their exact retained contribution", () => {
  const legacy = { ...parent, itemKind: undefined };
  const retainedChild = structuredClone(child);
  retainedChild.data.goals = [
    {
      id: "existing-contribution",
      parent: {
        documentId: parent.documentId,
        goalId: parent.goal.id,
        version: parent.version,
      },
    } as never,
  ];
  const view = workspace([legacy, { ...legacy, version: 1 }, parent]);
  view.documents = [
    {
      ...retainedChild,
      permissions: {
        canRead: true,
        canEdit: true,
        canApprove: true,
        canConfigure: true,
        canSeeSources: false,
      },
      issues: [],
    },
  ];
  for (const currentGoalId of [undefined, "new-contribution"])
    assert.deepEqual(
      approvedParentOptions(
        view,
        retainedChild,
        "2026-11-07",
        currentGoalId,
      ).map((option) => JSON.parse(option.value).itemKind),
      ["OBJECTIVE"],
    );
  const existing = approvedParentOptions(
    view,
    retainedChild,
    "2026-11-07",
    "existing-contribution",
  );
  assert.equal(existing.length, 2);
  assert.equal(
    existing.filter((option) => JSON.parse(option.value).itemKind === undefined)
      .length,
    1,
  );
  assert.match(
    existing.find((option) => JSON.parse(option.value).itemKind === undefined)!
      .label,
    /Existing goal link/,
  );
  assert.equal(
    approvedParentOptions(
      view,
      { ...retainedChild, id: "another-plan" },
      "2026-11-07",
      "existing-contribution",
    ).length,
    1,
  );
  const before = JSON.stringify(view);
  view.approvedParentGoals = [{ ...legacy, itemKind: "GOAL" }];
  assert.equal(
    approvedParentOptions(view, retainedChild, "2026-11-07").length,
    0,
  );
  assert.equal(
    JSON.parse(
      approvedParentOptions(
        view,
        retainedChild,
        "2026-11-07",
        "existing-contribution",
      )[0].value,
    ).itemKind,
    "GOAL",
  );
  view.approvedParentGoals = [legacy, { ...legacy, version: 1 }, parent];
  assert.equal(JSON.stringify(view), before);
});

test("server-retained legacy summary is not offered for a new contribution or another plan", () => {
  const personal = {
    ...child,
    kind: "INDIVIDUAL" as const,
    id: "personal-plan",
    scopeId: "person",
  };
  const view = workspace([
    {
      ...parent,
      itemKind: undefined,
      retainedFor: [{ documentId: personal.id, goalId: "existing" }],
    },
  ]);
  assert.equal(
    approvedParentOptions(view, personal, "2026-11-07", "existing").length,
    1,
  );
  assert.deepEqual(approvedParentOptions(view, personal, "2026-11-07"), []);
  assert.deepEqual(
    approvedParentOptions(view, personal, "2026-11-07", "new"),
    [],
  );
  assert.deepEqual(
    approvedParentOptions(
      view,
      { ...personal, id: "someone-else" },
      "2026-11-07",
      "existing",
    ),
    [],
  );
});

test("multi-year parent selection requires exact period boundaries", () => {
  const cycle = "2027-04-01..2030-03-31";
  const view = workspace([
    { ...parent, cycle },
    {
      ...parent,
      cycle: "2027-04-02..2030-03-31",
      documentId: "different-period",
    },
  ]);
  const choices = approvedParentOptions(
    view,
    { ...child, cycle },
    "2026-11-07",
  );
  assert.equal(choices.length, 1);
  assert.equal(JSON.parse(choices[0].value).documentId, "company-plan");
});

test("draft goals never become fallback choices and an explicit empty authorised list is respected", () => {
  const view = workspace();
  view.documents = [
    {
      ...child,
      kind: "COMPANY",
      data: { ...child.data, objectives: [parent.goal as never], goals: [] },
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
      companyPlanningModel: "MEASURABLE_OBJECTIVES",
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
  assert.match(
    result.message,
    /revise.*add Housekeeping.*approve the revision/,
  );
  assert.equal(result.unavailableOptions.length, 1);
  assert.equal(result.unavailableOptions[0].code, "GOAL-2018-0045");
  assert.equal(result.unavailableOptions[0].title, "test");
  assert.deepEqual(result.unavailableOptions[0].departmentNames, [
    "Administration",
    "Dispatch",
  ]);
  assert.equal(
    JSON.stringify(view),
    before,
    "Diagnostics never mutate an approved snapshot",
  );
});

test("parent availability distinguishes a different planning year from a missing approval", () => {
  const view = workspace([parent]);
  const result = approvedParentAvailability(
    view,
    { ...child, cycle: "2018" },
    "2026-11-07",
  );
  assert.equal(result.reason, "DIFFERENT_YEAR");
  assert.match(result.message, /2027.*2018/);
  assert.deepEqual(result.options, []);
  assert.deepEqual(result.unavailableOptions, []);

  view.approvedParentGoals = [];
  const empty = approvedParentAvailability(view, child, "2026-11-07");
  assert.equal(empty.reason, "NO_APPROVED_PARENT");
  assert.match(empty.message, /No approved company (?:objective|goal)/);
});

test("availability diagnostics respect an explicit authorised empty list and never substitute drafts", () => {
  const view = workspace();
  view.documents = [
    {
      ...child,
      kind: "COMPANY",
      data: { ...child.data, objectives: [parent.goal as never], goals: [] },
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
  assert.equal(
    approvedParentAvailability(view, child, "2026-11-07").reason,
    "NO_APPROVED_PARENT",
  );
  view.documents[0].versions = [
    {
      version: 1,
      data: view.documents[0].data,
      companyPlanningModel: "MEASURABLE_OBJECTIVES",
      effectiveDate: "2026-11-01",
      approvedAt: "2026-11-01T10:00:00Z",
      approvedBy: "leader",
      definitions: [],
      reason: "",
    },
  ];
  assert.equal(
    approvedParentAvailability(view, child, "2026-11-07").reason,
    "AVAILABLE",
  );
  view.approvedParentGoals = [];
  const hidden = approvedParentAvailability(view, child, "2026-11-07");
  assert.equal(hidden.reason, "NO_APPROVED_PARENT");
  assert.deepEqual(hidden.unavailableOptions, []);
  assert(!JSON.stringify(hidden).includes(parent.goal.title));
});

test("individual availability uses accessible departments to explain a different year", () => {
  const personal = {
    ...child,
    kind: "INDIVIDUAL" as const,
    scopeId: "ems",
    departmentId: "management",
  };
  const view = workspace([
    {
      ...parent,
      kind: "DEPARTMENT",
      itemKind: undefined,
      scopeId: "production",
      cycle: "2028",
    },
  ]);
  view.references.departments = [{ id: "management", name: "Management" }];
  const result = approvedParentAvailability(view, personal, "2026-11-07");
  assert.equal(result.reason, "DIFFERENT_YEAR");
  assert.match(
    result.message,
    /approved company objectives or department goals available to you.*2028.*2027/,
  );
  assert.doesNotMatch(result.message, /Management's plan/);
  assert.deepEqual(result.options, []);
  assert.deepEqual(result.unavailableOptions, []);

  view.approvedParentGoals = [];
  const empty = approvedParentAvailability(view, personal, "2026-11-07");
  assert.equal(empty.reason, "NO_APPROVED_PARENT");
  assert.match(
    empty.message,
    /no approved company objectives or department goals available to you for 2027/,
  );
  assert.doesNotMatch(
    empty.message,
    /Management's plan|Approve that department plan/,
  );
});

test("individual choices never supplement the authorised summaries with other goals or drafts", () => {
  const personal = {
    ...child,
    kind: "INDIVIDUAL" as const,
    scopeId: "ems",
    departmentId: "management",
  };
  const view = workspace([
    {
      ...parent,
      documentId: "production-parent",
      kind: "DEPARTMENT",
      itemKind: undefined,
      scopeId: "production",
    },
  ]);
  const restrictedData = {
    ...child.data,
    goals: [{ ...parent.goal, title: "Private quality goal" } as never],
  };
  view.documents = [
    {
      ...child,
      id: "quality-parent",
      scopeId: "quality",
      departmentId: "quality",
      data: restrictedData,
      versions: [
        {
          version: 1,
          data: restrictedData,
          effectiveDate: "2026-11-01",
          approvedAt: "2026-11-01T10:00:00Z",
          approvedBy: "leader",
          definitions: [],
          reason: "",
        },
      ],
      permissions: {
        canRead: true,
        canEdit: false,
        canApprove: false,
        canConfigure: false,
        canSeeSources: false,
      },
      issues: [],
    },
  ];
  const result = approvedParentAvailability(view, personal, "2026-11-07");
  assert.equal(result.options.length, 1);
  assert.equal(
    JSON.parse(result.options[0].value).documentId,
    "production-parent",
  );
  assert(!JSON.stringify(result).includes("Private quality goal"));

  view.approvedParentGoals = [];
  const hidden = approvedParentAvailability(view, personal, "2026-11-07");
  assert.equal(hidden.reason, "NO_APPROVED_PARENT");
  assert.deepEqual(hidden.options, []);
  assert(!JSON.stringify(hidden).includes("Private quality goal"));

  delete view.approvedParentGoals;
  view.documents[0].versions = [];
  assert.equal(
    approvedParentAvailability(view, personal, "2026-11-07").reason,
    "NO_APPROVED_PARENT",
  );
});

test("eligible choices stay selectable alongside separately explained non-contributor choices", () => {
  const view = workspace([
    parent,
    {
      ...parent,
      documentId: "other-plan",
      goal: { ...parent.goal, id: "quality-only", departmentIds: ["quality"] },
    },
  ]);
  const result = approvedParentAvailability(view, child, "2026-11-07");
  assert.equal(result.reason, "AVAILABLE");
  assert.deepEqual(
    result.options,
    approvedParentOptions(view, child, "2026-11-07"),
  );
  assert.equal(result.options.length, 1);
  assert.equal(result.unavailableOptions.length, 1);
  assert.equal(
    JSON.parse(result.unavailableOptions[0].value).goalId,
    "quality-only",
  );
});
