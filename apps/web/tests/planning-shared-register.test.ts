import test from "node:test";
import assert from "node:assert/strict";
import {
  filterSharedRegisterRows,
  registerValue,
  sharedRegisterRows,
  type RegisterPlan,
} from "../services/leadership-excellence/performance-planning/shared-register";
import type {
  Goal,
  Objective,
  PlanningView,
} from "../services/leadership-excellence/performance-planning/types";

const stamp = {
  createdAt: "2027-01-01",
  createdBy: "owner",
  updatedAt: "2027-01-01",
  updatedBy: "owner",
};
function objective(id = "objective"): Objective {
  return {
    ...stamp,
    id,
    code: `OBJ-${id}`,
    title: "Improve reliability",
    meaning: "Keep production equipment available.",
    pillar: "OPX",
    alignments: ["Delivery"],
    alignmentReason: "",
    ownerId: "owner",
    startDate: "2027-01-01",
    endDate: "2027-12-31",
    sources: [],
    sourceRationale: "",
  };
}
function goal(id = "goal"): Goal {
  return {
    ...stamp,
    id,
    code: `GOAL-${id}`,
    title: "Reduce equipment downtime",
    objectiveId: "objective",
    parent: null,
    ongoingReason: "",
    measure: "Unplanned downtime",
    definitionId: "",
    baseline: null,
    baselineReason: "",
    target: 0,
    unit: "hours",
    ownerId: "owner",
    startDate: "2027-01-01",
    endDate: "2027-12-31",
    approach: "",
    departmentIds: ["production"],
  };
}
function plan(
  id = "company",
  kind: RegisterPlan["kind"] = "COMPANY",
): RegisterPlan {
  return {
    id,
    code: id,
    kind,
    scopeId: kind === "COMPANY" ? "company" : "production",
    departmentId: "production",
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
      canSeeSources: false,
    },
    issues: [],
    data: {
      title: `${id} plan`,
      ownerId: "owner",
      approverId: "approver",
      coordinatorIds: [],
      contributorIds: [],
      startDate: "2027-01-01",
      endDate: "2027-12-31",
      consideredPillars: [],
      findings: [],
      objectives: [objective()],
      goals: [goal()],
      assignments: [],
      actions: [],
    },
  };
}
function view(documents: RegisterPlan[]): PlanningView {
  return {
    revision: 1,
    documents,
    actor: {
      userId: "user",
      employeeId: "owner",
      departmentId: "production",
      name: "Sam",
      role: "EMPLOYEE",
    },
    references: {
      departments: [{ id: "production", name: "Production" }],
      people: [
        {
          id: "owner",
          name: "Sam",
          departmentId: "production",
          position: "Engineer",
          role: "EMPLOYEE",
          userId: "user",
        },
      ],
      teams: [
        {
          id: "crew",
          name: "Maintenance crew",
          departmentId: "production",
          memberIds: ["owner"],
        },
      ],
      positions: [
        {
          id: "engineer",
          name: "Engineer",
          departmentId: "production",
          holderIds: ["owner"],
        },
      ],
      pillars: [],
    },
    kras: [],
    definitions: [],
    sharedActions: [],
  };
}

test("one register derives all five plan levels with original goal IDs and EMS names", () => {
  const documents = [
    plan(),
    plan("department", "DEPARTMENT"),
    plan("team", "TEAM"),
    plan("person", "INDIVIDUAL"),
    plan("position", "POSITION"),
  ];
  documents[2].scopeId = "crew";
  documents[3].scopeId = "owner";
  documents[4].scopeId = "engineer";
  const data = view(documents);
  const before = structuredClone(data);
  const rows = sharedRegisterRows(data, "2027");
  assert.equal(rows.length, 5);
  assert.deepEqual(
    rows.map((row) => row.scopeLabel),
    ["Company", "Production", "Maintenance crew", "Sam", "Engineer"],
  );
  assert.equal(new Set(rows.map((row) => row.key)).size, 5);
  assert.ok(rows.every((row) => row.itemId === "goal"));
  assert.equal(rows[0].goal, documents[0].data.goals[0]);
  assert.deepEqual(data, before, "derivation must not mutate source records");
});

test("other years, unreadable plans and confidential SWOT are excluded", () => {
  const hidden = plan("private");
  hidden.permissions.canRead = false;
  const otherYear = plan("old");
  otherYear.cycle = "2026";
  const data = view([plan(), hidden, otherYear, plan("swot", "SWOT")]);
  assert.deepEqual(
    sharedRegisterRows(data, "2027").map((row) => row.document.id),
    ["company"],
  );
});

test("readers keep API-published data, while their own authorised draft remains editable", () => {
  const published = plan();
  published.status = "APPROVED";
  published.permissions.canEdit = false;
  published.data.goals[0].title = "Published company goal";
  const future = structuredClone(published.data);
  future.goals[0].title = "Future version must not replace published data";
  published.versions = [
    {
      version: 2,
      data: future,
      approvedAt: "2027-01-02",
      approvedBy: "approver",
      effectiveDate: "2028-01-01",
      definitions: [],
      reason: "Revision",
    },
  ];
  const ownDraft = plan("own", "INDIVIDUAL");
  ownDraft.scopeId = "owner";
  ownDraft.data.goals[0].title = "My authorised draft";
  const rows = sharedRegisterRows(view([published, ownDraft]), "2027");
  assert.deepEqual(
    rows.map((row) => row.title),
    ["Published company goal", "My authorised draft"],
  );
  assert.equal(rows[0].document.permissions.canEdit, false);
  assert.equal(rows[1].document.permissions.canEdit, true);
});

test("incomplete objective and unlinked goal drafts both remain reachable", () => {
  const document = plan();
  document.data.objectives.push({ ...objective("orphan"), title: "" });
  document.data.goals.push({ ...goal("unlinked"), objectiveId: "", title: "" });
  const rows = sharedRegisterRows(view([document]), "2027");
  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map((row) => [row.kind, row.itemId]),
    [
      ["goal", "goal"],
      ["goal", "unlinked"],
      ["objective", "orphan"],
    ],
  );
  assert.equal(rows[2].title, "Untitled draft objective");
  document.data.goals.push({ ...goal("first-linked"), objectiveId: "orphan" });
  assert.equal(
    sharedRegisterRows(view([document]), "2027").filter(
      (row) => row.kind === "objective",
    ).length,
    0,
  );
});

test("search and level/status filters work together without duplicating records", () => {
  const department = plan("department", "DEPARTMENT");
  department.status = "APPROVED";
  const rows = sharedRegisterRows(view([plan(), department]), "2027");
  assert.deepEqual(
    filterSharedRegisterRows(rows, {
      search: "production",
      level: "DEPARTMENT",
      status: "APPROVED",
    }).map((row) => row.document.id),
    ["department"],
  );
  assert.equal(
    filterSharedRegisterRows(rows, {
      search: "RELIABILITY",
      level: "",
      status: "",
    }).length,
    2,
  );
  assert.equal(
    filterSharedRegisterRows(rows, {
      search: "sam",
      level: "COMPANY",
      status: "DRAFT",
    }).length,
    1,
  );
  assert.equal(
    filterSharedRegisterRows(rows, { search: "absent", level: "", status: "" })
      .length,
    0,
  );
});

test("missing targets remain missing and an intentional zero remains zero", () => {
  assert.equal(registerValue(null, "hours"), "Not set");
  assert.equal(registerValue(undefined), "Not set");
  assert.equal(registerValue(0, "hours"), "0 hours");
  assert.equal(registerValue(95, "%"), "95 %");
});

test("parent context uses its linked approved version, never the parent draft", () => {
  const company = plan();
  const approvedData = structuredClone(company.data);
  approvedData.goals[0].title = "Approved equipment goal";
  approvedData.objectives[0].title = "Approved reliability objective";
  company.versions = [
    {
      version: 1,
      data: approvedData,
      approvedAt: "2027-01-02",
      approvedBy: "approver",
      effectiveDate: "2027-01-01",
      definitions: [],
      reason: "",
    },
  ];
  company.data.goals[0].title = "Private revision goal";
  company.data.objectives[0].title = "Private revision objective";
  const department = plan("department", "DEPARTMENT");
  department.data.objectives = [];
  department.data.goals[0].objectiveId = "";
  department.data.goals[0].parent = {
    documentId: company.id,
    goalId: "goal",
    version: 1,
  };
  const data = view([company, department]);
  const row = sharedRegisterRows(data, "2027").find(
    (item) => item.document.id === "department",
  )!;
  assert.equal(row.parentTitle, "Approved equipment goal");
  assert.equal(row.objectiveTitle, "Approved reliability objective");
  company.permissions.canRead = false;
  const inaccessible = sharedRegisterRows(data, "2027")[0];
  assert.equal(inaccessible.parentTitle, "Approved parent goal unavailable");
  assert.equal(inaccessible.objectiveTitle, "");
});

test("saved data updates the same row immediately without another register store", () => {
  const data = view([plan()]);
  const initial = sharedRegisterRows(data, "2027")[0];
  data.documents[0].data.goals[0].title = "Updated equipment goal";
  data.documents[0].status = "APPROVED";
  const updated = sharedRegisterRows(data, "2027")[0];
  assert.equal(initial.key, updated.key);
  assert.equal(updated.title, "Updated equipment goal");
  assert.equal(updated.document.status, "APPROVED");
  assert.equal(data.documents.length, 1);
  assert.equal(data.documents[0].data.goals.length, 1);
});
