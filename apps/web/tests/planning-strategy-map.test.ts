import test from "node:test";
import assert from "node:assert/strict";
import {
  approvedPlanningCommitments,
  buildStrategyMap,
} from "../services/leadership-excellence/performance-planning/strategy-map";
import { strategyMapPrintHtml } from "../services/leadership-excellence/performance-planning/strategy-map-print";
import {
  programmeCommitments,
  programmeLatestResult,
} from "../services/leadership-excellence/performance-planning/programme";
import type {
  DeliveryAction,
  Goal,
  Objective,
  PlanningView,
  ProgrammeResult,
} from "../services/leadership-excellence/performance-planning/types";

type Plan = PlanningView["documents"][number];
const stamp = {
  createdAt: "2028-01-01",
  createdBy: "owner",
  updatedAt: "2028-01-01",
  updatedBy: "owner",
};
const goal: Goal = {
  ...stamp,
  id: "company-goal",
  code: "GOAL-1",
  title: "Reduce rejects",
  objectiveId: "objective",
  parent: null,
  ongoingReason: "",
  measure: "Rejected units / inspected units",
  definitionId: "",
  baseline: null,
  baselineReason: "Not recorded yet",
  target: 0,
  unit: "%",
  ownerId: "owner",
  startDate: "2028-01-01",
  endDate: "2028-12-31",
  approach: "",
  departmentIds: ["production"],
};
const objective: Objective = {
  ...stamp,
  id: "objective",
  code: "OBJ-1",
  title: "Improve product quality",
  meaning: "More first-time-right products",
  pillar: "OPX",
  alignments: ["Quality", "Cost"],
  alignmentReason: "",
  ownerId: "owner",
  startDate: "2028-01-01",
  endDate: "2028-12-31",
  sources: [
    {
      documentId: "confidential-swot",
      findingId: "private-finding",
      version: 1,
    },
  ],
  sourceRationale: "Confidential SWOT explanation",
};
const action: DeliveryAction = {
  ...stamp,
  id: "action",
  code: "ACT-1",
  title: "Standardise first-off inspection",
  goalId: "department-goal",
  parentActionId: "",
  ownerId: "owner",
  dueDate: "2028-03-31",
  expectedResult: "Consistent settings",
  completionEvidence: "Private evidence",
  support: "Detailed instructions",
  sources: [
    { documentId: "private-swot", findingId: "private-finding", version: 1 },
  ],
};
function plan(id = "company", kind: Plan["kind"] = "COMPANY"): Plan {
  return {
    id,
    code: `PLAN-${id}`,
    kind,
    scopeId: kind === "COMPANY" ? "company" : "production",
    departmentId: "production",
    cycle: "2028",
    status: "DRAFT",
    versions: [],
    revisionReason: "",
    effectiveDate: "",
    history: [],
    acknowledgement: null,
    permissions: {
      canRead: true,
      canEdit: true,
      canApprove: true,
      canConfigure: true,
      canSeeSources: true,
    },
    issues: [],
    data: {
      title: `${id} quality plan`,
      ownerId: "owner",
      approverId: "owner",
      coordinatorIds: [],
      contributorIds: [],
      startDate: "2028-01-01",
      endDate: "2028-12-31",
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
function approve(document: Plan, effectiveDate = "2028-01-01", version = 1) {
  document.status = "APPROVED";
  document.versions.push({
    version,
    data: structuredClone(document.data),
    effectiveDate,
    approvedAt: "2027-11-09",
    approvedBy: "owner",
    definitions: [],
    reason: "",
  });
  return document;
}
function company() {
  const document = plan();
  document.data.objectives = [structuredClone(objective)];
  document.data.goals = [structuredClone(goal)];
  return approve(document);
}
function department() {
  const document = plan("department", "DEPARTMENT");
  document.data.goals = [
    {
      ...structuredClone(goal),
      id: "department-goal",
      title: "Production rejects",
      objectiveId: "",
      parent: { documentId: "company", goalId: "company-goal", version: 1 },
    },
  ];
  document.data.actions = [structuredClone(action)];
  return approve(document);
}
function view(documents: Plan[]): PlanningView {
  return {
    revision: 1,
    documents,
    actor: {
      userId: "user",
      employeeId: "owner",
      departmentId: "production",
      name: "Sam",
      role: "SUPER_ADMIN",
    },
    references: {
      timeZone: "Asia/Calcutta",
      departments: [{ id: "production", name: "Production" }],
      teams: [],
      pillars: [{ code: "OPX", name: "Operational Excellence" }],
      people: [
        {
          id: "owner",
          name: "Sam",
          departmentId: "production",
          position: "Production lead",
          role: "EMPLOYEE",
          userId: "user",
        },
      ],
      direction: {
        version: 2,
        company: "Plastic Ltd",
        purpose: "Reliable packaging",
        mission: "Make quality packaging",
        vision: "Zero waste",
      },
    },
    kras: [],
    definitions: [],
    sharedActions: [],
  };
}

test("drafts are not printable even for a manager; future approval uses an explicit effective date", () => {
  const draft = plan();
  draft.data.objectives = [objective];
  draft.data.goals = [goal];
  assert.equal(
    buildStrategyMap(view([draft]), "2028", "2028-02-01").plan,
    null,
  );
  approve(draft, "2028-03-01");
  const before = buildStrategyMap(view([draft]), "2028", "2028-02-01");
  assert.equal(before.plan, null);
  assert.match(before.notices.join(" "), /effective on 2028-03-01/);
  assert.equal(
    buildStrategyMap(view([draft]), "2028", "2028-03-01").plan?.version,
    1,
  );
});

test("approved snapshots survive edits and future revisions without exposing draft titles", () => {
  const document = company();
  document.data.goals[0].title = "Later approved title";
  approve(document, "2028-07-01", 2);
  document.status = "DRAFT";
  document.data.goals[0].title = "Secret draft title";
  const input = view([document]);
  assert.equal(
    buildStrategyMap(input, "2028", "2028-04-01").objectives[0].goals[0].title,
    "Reduce rejects",
  );
  assert.equal(
    buildStrategyMap(input, "2028", "2028-07-01").objectives[0].goals[0].title,
    "Later approved title",
  );
  assert.equal(
    JSON.stringify(buildStrategyMap(input, "2028", "2028-07-01")).includes(
      "Secret draft title",
    ),
    false,
  );
});

test("only exact company-version links contribute high-level department actions", () => {
  const c = company();
  const d = department();
  let map = buildStrategyMap(view([c, d]), "2028", "2028-05-01");
  assert.equal(map.objectives[0].goals[0].actions[0].title, action.title);
  assert.equal(map.objectives[0].goals[0].actions[0].department, "Production");
  approve(c, "2028-04-01", 2);
  map = buildStrategyMap(view([c, d]), "2028", "2028-05-01");
  assert.equal(map.objectives[0].goals[0].actions.length, 0);
  assert.match(map.notices.join(" "), /different company plan version/);
});

test("individual commitments to a shared action do not duplicate the original", () => {
  const d = department();
  const individual = plan("individual", "INDIVIDUAL");
  individual.data.actionLinks = [
    {
      id: "shared-link",
      goalId: "individual-goal",
      documentId: d.id,
      actionId: "action",
      version: 1,
    },
  ];
  approve(individual);
  const input = view([company(), d, individual]);
  input.sharedActions = [{ documentId: d.id, version: 1, action }];
  const actions = buildStrategyMap(input, "2028", "2028-05-01").objectives[0]
    .goals[0].actions;
  assert.equal(actions.length, 1);
  assert.equal(actions[0].key, "department/1/action");
});

test("permissions and selected year constrain all exported actions", () => {
  const d = department();
  d.permissions.canRead = false;
  assert.equal(
    buildStrategyMap(view([company(), d]), "2028", "2028-05-01").objectives[0]
      .goals[0].actions.length,
    0,
  );
  d.permissions.canRead = true;
  d.cycle = "2029";
  assert.equal(
    buildStrategyMap(view([company(), d]), "2028", "2028-05-01").objectives[0]
      .goals[0].actions.length,
    0,
  );
  const c = company();
  c.permissions.canRead = false;
  assert.equal(buildStrategyMap(view([c]), "2028", "2028-05-01").plan, null);
});

test("raw SWOT, action evidence, detailed instructions and result assignments never enter print data", () => {
  const map = buildStrategyMap(
    view([company(), department()]),
    "2028",
    "2028-05-01",
  );
  const json = JSON.stringify(map);
  for (const privateText of [
    "Confidential SWOT explanation",
    "private-finding",
    "Private evidence",
    "Detailed instructions",
    "assignments",
    "completionEvidence",
  ]) {
    assert.equal(json.includes(privateText), false, privateText);
  }
});

test("missing baseline remains null and a real zero target is preserved", () => {
  const printed = buildStrategyMap(view([company()]), "2028", "2028-05-01")
    .objectives[0].goals[0];
  assert.equal(printed.baseline, null);
  assert.equal(printed.target, 0);
});

test("missing direction stays empty and approved value references use names only", () => {
  const input = view([company()]);
  input.references.direction = null;
  const missing = buildStrategyMap(input, "2028", "2028-05-01");
  assert.equal(missing.direction.mission, "");
  assert.deepEqual(missing.direction.values, []);
  assert.match(missing.notices.join(" "), /not available/);
  input.references.direction = {
    version: 3,
    company: "Plastic Ltd",
    purpose: "",
    mission: "Make packaging",
    vision: "Waste-free operations",
  };
  Object.assign(input.references.direction, {
    values: [
      { id: "value1", name: "Quality", why: "Detailed core-value context" },
    ],
  });
  assert.deepEqual(
    buildStrategyMap(input, "2028", "2028-05-01").direction.values,
    ["Quality"],
  );
});

test("the print builder does not mutate workspace records or versions", () => {
  const input = view([company(), department()]);
  const before = structuredClone(input);
  const map = buildStrategyMap(input, "2028", "2028-05-01");
  map.objectives[0].alignments.push("Safety");
  assert.deepEqual(input, before);
});

test("duplicate company records cannot silently produce a misleading combined strategy", () => {
  const duplicate = company();
  duplicate.id = "duplicate-company";
  const map = buildStrategyMap(
    view([company(), duplicate]),
    "2028",
    "2028-05-01",
  );
  assert.equal(map.plan, null);
  assert.match(map.notices.join(" "), /duplicate/);
});

test("invalid effective dates cannot silently select an approved version", () => {
  for (const date of ["", "invalid", "2028-02-31", "2028-13-01"]) {
    const map = buildStrategyMap(view([company()]), "2028", date);
    assert.equal(map.plan, null);
    assert.match(map.notices.join(" "), /valid effective date/);
  }
});

test("print HTML escapes user content and permits no scripts or external resources", () => {
  const map = buildStrategyMap(
    view([company(), department()]),
    "2028",
    "2028-05-01",
  );
  const unsafe = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
  map.objectives[0].title = unsafe;
  map.objectives[0].goals[0].measure = unsafe;
  map.objectives[0].goals[0].actions[0].title = unsafe;
  map.direction.mission = unsafe;
  map.direction.values = [unsafe];
  const html = strategyMapPrintHtml(map, {
    paper: "A3",
    company: unsafe,
    cycle: "2028",
    asOf: "2028-05-01",
    objectiveIds: ["objective"],
    includeActions: true,
  });
  assert.doesNotMatch(html, /<(?:img|script)\b/i);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.match(html, /default-src 'none'/);
  assert.match(html, /script-src 'none'/);
});

test("print retains missing versus zero numbers and omits confidential source and execution details", () => {
  const map = buildStrategyMap(
    view([company(), department()]),
    "2028",
    "2028-05-01",
  );
  const html = strategyMapPrintHtml(map, {
    paper: "A4",
    company: "Plastic Ltd",
    cycle: "2028",
    asOf: "2028-05-01",
    objectiveIds: ["objective"],
    includeActions: true,
  });
  assert.match(html, /Baseline Not set/);
  assert.match(html, /Target 0 %/);
  assert.match(html, /Standardise first-off inspection/);
  for (const privateText of [
    "Confidential SWOT explanation",
    "Private evidence",
    "Detailed instructions",
    "Consistent settings",
  ]) {
    assert.equal(html.includes(privateText), false, privateText);
  }
  assert.match(html, /@page \{ size: A4 landscape/);
});

test("partial objective print is explicitly labelled and excluding action summaries removes their content", () => {
  const map = buildStrategyMap(
    view([company(), department()]),
    "2028",
    "2028-05-01",
  );
  map.objectives.push({
    ...structuredClone(map.objectives[0]),
    id: "other-objective",
    title: "Other strategic objective",
    goals: [],
  });
  const html = strategyMapPrintHtml(map, {
    paper: "A3",
    company: "Plastic Ltd",
    cycle: "2028",
    asOf: "2028-05-01",
    objectiveIds: ["objective"],
    includeActions: false,
  });
  assert.match(html, /Selected view/);
  assert.match(html, /1 objective/);
  assert.equal(html.includes("Other strategic objective"), false);
  assert.equal(html.includes(action.title), false);
  assert.equal(html.includes("KEY IMPROVEMENT ACTIONS"), false);
});

function individual(id = "person-plan") {
  const document = plan(id, "INDIVIDUAL");
  document.scopeId = "owner";
  document.data.goals = [
    {
      ...structuredClone(goal),
      id: "personal-direct",
      code: "PERSONAL-1",
      title: "Inspect my assigned batches before release",
      objectiveId: "",
      parent: { documentId: "company", goalId: "company-goal", version: 1 },
      measure: "My checked batches / my assigned batches",
      target: 100,
    },
    {
      ...structuredClone(goal),
      id: "personal-department",
      code: "PERSONAL-2",
      title: "Record every first-off inspection",
      objectiveId: "",
      parent: {
        documentId: "department",
        goalId: "department-goal",
        version: 1,
      },
      measure: "Missing records in my shifts",
      baseline: 5,
      target: 0,
      unit: "records",
    },
  ];
  return approve(document);
}

test("objective priority and weightage come from the approved snapshot, with legacy missing values preserved", () => {
  const c = company();
  assert.equal(
    buildStrategyMap(view([c]), "2028", "2028-05-01").objectives[0].priority,
    null,
  );
  assert.equal(
    buildStrategyMap(view([c]), "2028", "2028-05-01").objectives[0].weightage,
    null,
  );
  c.data.objectives[0].priority = 8;
  c.data.objectives[0].weightage = 12.25;
  approve(c, "2028-04-01", 2);
  c.status = "DRAFT";
  c.data.objectives[0].priority = 2;
  c.data.objectives[0].weightage = 30;
  const map = buildStrategyMap(view([c]), "2028", "2028-05-01");
  assert.equal(map.objectives[0].priority, 8);
  assert.equal(map.objectives[0].weightage, 12.25);
  const html = strategyMapPrintHtml(map, {
    paper: "A3",
    company: "Plastic Ltd",
    cycle: "2028",
    asOf: "2028-05-01",
    objectiveIds: ["objective"],
    includeActions: false,
  });
  assert.match(html, /Priority: <strong>8<\/strong>/);
  assert.match(html, /Weightage: <strong>12\.25%<\/strong>/);
});

test("approved individual plans preserve both company and department links and their distinct measures", () => {
  const input = view([company(), department(), individual()]);
  const before = structuredClone(input);
  const map = buildStrategyMap(input, "2028", "2028-05-01");
  assert.equal(map.individualGoals.length, 2);
  assert.deepEqual(
    map.individualGoals.map((entry) => entry.parentKind),
    ["Company", "Department"],
  );
  assert.deepEqual(
    map.individualGoals.map((entry) => entry.companyObjectiveId),
    ["objective", "objective"],
  );
  assert.equal(map.individualGoals[0].employee, "Sam");
  assert.equal(map.individualGoals[0].position, "Production lead");
  assert.equal(
    map.individualGoals[0].measure,
    "My checked batches / my assigned batches",
  );
  assert.equal(map.individualGoals[0].baseline, null);
  assert.equal(map.individualGoals[0].target, 100);
  assert.equal(map.individualGoals[1].target, 0);
  assert.equal(map.objectives[0].goals[0].target, 0);
  assert.deepEqual(input, before);
});

test("individual print excludes draft, inaccessible, future-effective and other-year plans", () => {
  const draft = individual("draft");
  draft.versions = [];
  draft.status = "DRAFT";
  const restricted = individual("restricted");
  restricted.permissions.canRead = false;
  const future = individual("future");
  future.versions[0].effectiveDate = "2028-07-01";
  const wrongYear = individual("other-year");
  wrongYear.cycle = "2029";
  const map = buildStrategyMap(
    view([company(), department(), draft, restricted, future, wrongYear]),
    "2028",
    "2028-05-01",
  );
  assert.deepEqual(map.individualGoals, []);
});

test("individual dated revisions retain the previous approved goal instead of leaking current drafts", () => {
  const person = individual();
  person.data.goals[0].title = "Later approved individual commitment";
  person.data.goals[0].target = 98;
  approve(person, "2028-07-01", 2);
  person.status = "DRAFT";
  person.data.goals[0].title = "Confidential unfinished individual edit";
  const input = view([company(), department(), person]);
  const before = buildStrategyMap(input, "2028", "2028-05-01");
  assert.equal(
    before.individualGoals[0].title,
    "Inspect my assigned batches before release",
  );
  assert.equal(before.individualGoals[0].version, 1);
  const after = buildStrategyMap(input, "2028", "2028-07-01");
  assert.equal(
    after.individualGoals[0].title,
    "Later approved individual commitment",
  );
  assert.equal(after.individualGoals[0].target, 98);
  assert.equal(after.individualGoals[0].version, 2);
  assert(
    !JSON.stringify(after).includes("Confidential unfinished individual edit"),
  );
});

test("individual parent labels stay pinned to their approved version and cannot expose a future parent edit", () => {
  const d = department();
  d.data.goals[0].title = "Future department title";
  approve(d, "2028-07-01", 2);
  const person = individual();
  let map = buildStrategyMap(
    view([company(), d, person]),
    "2028",
    "2028-08-01",
  );
  assert.equal(map.individualGoals[1].parentTitle, "Production rejects");
  assert.equal(map.individualGoals[1].parentVersion, 1);
  person.versions[0].data.goals[1].parent!.version = 2;
  map = buildStrategyMap(view([company(), d, person]), "2028", "2028-05-01");
  assert.equal(
    map.individualGoals[1].parentTitle,
    "Approved parent details unavailable for this date",
  );
  assert(
    !JSON.stringify(map.individualGoals).includes("Future department title"),
  );
});

test("individual print appends paginated approved goal sheets without shrinking the company map or dropping rows", () => {
  const person = individual();
  person.data.goals = Array.from({ length: 5 }, (_, index) => ({
    ...person.data.goals[0],
    id: `personal-${index}`,
    code: `PERSONAL-${index}`,
    title: `Distinct individual goal ${index}`,
  }));
  person.versions = [];
  approve(person);
  const map = buildStrategyMap(
    view([company(), department(), person]),
    "2028",
    "2028-05-01",
  );
  const options = {
    paper: "A3" as const,
    company: "Plastic Ltd",
    cycle: "2028",
    asOf: "2028-05-01",
    objectiveIds: ["objective"],
    includeActions: true,
  };
  const html = strategyMapPrintHtml(map, options);
  assert.equal(
    (html.match(/class="strategy-sheet individual-sheet"/g) || []).length,
    2,
  );
  assert.match(html, /Goals 1–4 of 5/);
  assert.match(html, /Goals 5–5 of 5/);
  for (let index = 0; index < 5; index++)
    assert.equal(
      (html.match(new RegExp(`Distinct individual goal ${index}`, "g")) || [])
        .length,
      1,
    );
  assert.match(
    html,
    /Individual achievement does not replace company achievement/,
  );
  assert.equal(
    strategyMapPrintHtml(map, {
      ...options,
      includeIndividuals: false,
    }).includes("Distinct individual goal"),
    false,
  );
});

test("selected objective print includes only its linked individual goals and escapes every printed employee field", () => {
  const map = buildStrategyMap(
    view([company(), department(), individual()]),
    "2028",
    "2028-05-01",
  );
  map.objectives.push({
    ...structuredClone(map.objectives[0]),
    id: "other",
    goals: [],
  });
  map.individualGoals[1].companyObjectiveId = "other";
  const unsafe = '<img src=x onerror="alert(1)">';
  map.individualGoals[0].employee = unsafe;
  map.individualGoals[0].parentTitle = unsafe;
  const html = strategyMapPrintHtml(map, {
    paper: "A3",
    company: "Plastic Ltd",
    cycle: "2028",
    asOf: "2028-05-01",
    objectiveIds: ["objective"],
    includeActions: true,
  });
  assert(html.includes("Inspect my assigned batches before release"));
  assert(!html.includes("Record every first-off inspection"));
  assert.doesNotMatch(html, /<img\b/i);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  for (const value of [
    "private-finding",
    "Confidential SWOT explanation",
    "Private evidence",
  ])
    assert(!html.includes(value));
});

function measurableCompany() {
  const document = company();
  document.versions = [];
  document.data.goals = [];
  Object.assign(document.data.objectives[0], {
    title: "Eliminate preventable rejects by December 2028",
    measure: "Preventable rejected batches / total inspected batches",
    baseline: null,
    baselineReason: "No comparable baseline",
    target: 0,
    unit: "%",
    departmentIds: ["production"],
    approach: "Standardise first-off checks",
    selectionReason: "Repeat defects identified in reviewed evidence",
  });
  approve(document);
  document.versions[0].companyPlanningModel = "MEASURABLE_OBJECTIVES";
  return document;
}

function directObjectiveDepartment() {
  const document = department();
  document.versions = [];
  document.data.goals[0].code = "DEPT-1";
  document.data.goals[0].parent = {
    documentId: "company",
    goalId: "objective",
    version: 1,
    itemKind: "OBJECTIVE",
  };
  document.data.goals[0].measure = "Production first-off checks missed";
  document.data.goals[0].baseline = 10;
  document.data.goals[0].target = 2;
  document.data.goals[0].unit = "checks";
  return approve(document);
}

function directObjectiveIndividual() {
  const document = individual();
  document.versions = [];
  document.data.goals[0].parent = {
    documentId: "company",
    goalId: "objective",
    version: 1,
    itemKind: "OBJECTIVE",
  };
  return approve(document);
}

test("a measurable company objective prints its own target once without a second company goal", () => {
  const input = view([measurableCompany(), directObjectiveDepartment()]);
  const before = structuredClone(input);
  const map = buildStrategyMap(input, "2028", "2028-05-01");
  const item = map.objectives[0];
  assert.deepEqual(item.goals, []);
  assert.equal(item.measurement?.baseline, null);
  assert.equal(item.measurement?.target, 0);
  assert.equal(
    item.measurement?.measure,
    "Preventable rejected batches / total inspected batches",
  );
  assert.equal(item.measurement?.actions[0].id, "action");
  assert.equal(item.measurement?.contributions?.[0].target, 2);
  assert.equal(item.measurement?.contributions?.[0].department, "Production");
  const html = strategyMapPrintHtml(map, {
    paper: "A3",
    company: "Plastic Ltd",
    cycle: "2028",
    asOf: "2028-05-01",
    objectiveIds: ["objective"],
    includeActions: true,
  });
  assert.equal(
    html.split("Eliminate preventable rejects by December 2028").length - 1,
    1,
  );
  assert.match(html, /data-objective-measure="objective"/);
  assert.match(html, /MEASURE &amp; TARGET/);
  assert.match(html, /Baseline Not set/);
  assert.match(html, /Target 0 %/);
  assert.match(html, /Production first-off checks missed/);
  assert.match(html, /Target 2 checks/);
  assert(!html.includes("0 goals"));
  assert(!html.includes("MEASURABLE GOALS"));
  assert(!html.includes("GOAL-1"));
  assert.deepEqual(input, before);
});

test("direct objective and department-mediated individual links retain independent measures", () => {
  const input = view([
    measurableCompany(),
    directObjectiveDepartment(),
    directObjectiveIndividual(),
  ]);
  const map = buildStrategyMap(input, "2028", "2028-05-01");
  assert.deepEqual(
    map.individualGoals.map((item) => item.parentKind),
    ["Company objective", "Department"],
  );
  assert.deepEqual(
    map.individualGoals.map((item) => item.companyObjectiveId),
    ["objective", "objective"],
  );
  assert.equal(
    map.individualGoals[0].parentTitle,
    "Eliminate preventable rejects by December 2028",
  );
  assert.equal(map.individualGoals[0].target, 100);
  assert.equal(map.individualGoals[1].target, 0);
  assert.equal(map.objectives[0].measurement?.target, 0);
  assert.equal(map.objectives[0].measurement?.contributions?.[0].target, 2);
});

test("objective parent links are never guessed from a legacy goal reference with the same ID", () => {
  const d = directObjectiveDepartment();
  delete d.versions[0].data.goals[0].parent!.itemKind;
  const i = directObjectiveIndividual();
  delete i.versions[0].data.goals[0].parent!.itemKind;
  const map = buildStrategyMap(
    view([measurableCompany(), d, i]),
    "2028",
    "2028-05-01",
  );
  assert.deepEqual(map.objectives[0].measurement?.actions, []);
  assert.deepEqual(map.objectives[0].measurement?.contributions, []);
  assert.equal(
    map.individualGoals[0].parentTitle,
    "Approved parent details unavailable for this date",
  );
  assert.equal(map.individualGoals[0].companyObjectiveId, null);
  assert.equal(map.individualGoals[1].companyObjectiveId, null);
});

test("old strategy versions retain linked goals and new approved versions switch to own objective measures", () => {
  const c = company();
  c.data = structuredClone(measurableCompany().data);
  approve(c, "2028-07-01", 2);
  c.versions[1].companyPlanningModel = "MEASURABLE_OBJECTIVES";
  c.status = "DRAFT";
  c.data.objectives[0].target = 999;
  c.data.objectives[0].title = "Confidential unapproved new result";
  const input = view([c, department(), individual()]);
  const before = buildStrategyMap(input, "2028", "2028-06-30");
  assert.equal(before.objectives[0].measurement, null);
  assert.equal(before.objectives[0].goals[0].title, "Reduce rejects");
  assert.equal(
    approvedPlanningCommitments(input, "2028", "2028-06-30")[0].itemKind,
    "GOAL",
  );
  const after = buildStrategyMap(input, "2028", "2028-07-01");
  assert.deepEqual(after.objectives[0].goals, []);
  assert.equal(after.objectives[0].measurement?.target, 0);
  assert.equal(after.individualGoals[0].parentTitle, "Reduce rejects");
  assert.equal(after.individualGoals[0].parentVersion, 1);
  assert.equal(after.individualGoals[0].companyObjectiveId, null);
  assert.equal(after.objectives[0].measurement?.actions.length, 0);
  assert(!JSON.stringify(after).includes("Confidential unapproved new result"));
  const handoff = approvedPlanningCommitments(input, "2028", "2028-07-01");
  assert.equal(handoff.filter((row) => row.plan.kind === "COMPANY").length, 1);
  assert.equal(handoff[0].itemKind, "OBJECTIVE");
  assert.equal(handoff[0].goal.target, 0);
});

test("results handoff excludes drafts, restricted plans, other periods and future effective approvals", () => {
  const c = measurableCompany();
  const draft = directObjectiveDepartment();
  draft.id = "draft";
  draft.versions = [];
  draft.status = "DRAFT";
  const restricted = directObjectiveDepartment();
  restricted.id = "restricted";
  restricted.permissions.canRead = false;
  const future = directObjectiveIndividual();
  future.id = "future";
  future.versions[0].effectiveDate = "2029-01-01";
  const other = directObjectiveIndividual();
  other.id = "other-period";
  other.cycle = "2028-04-01..2029-03-31";
  const input = view([c, draft, restricted, future, other]);
  const before = structuredClone(input);
  const rows = approvedPlanningCommitments(input, "2028", "2028-05-01");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].itemKind, "OBJECTIVE");
  assert.equal(rows[0].goal.id, "objective");
  assert.equal(rows[0].goal.baseline, null);
  assert.equal(rows[0].goal.target, 0);
  assert.deepEqual(
    approvedPlanningCommitments(input, "2028", "2028-02-30"),
    [],
  );
  assert.deepEqual(input, before);
});

test("missing objective targets never fall back to an archived goal target or become zero", () => {
  const c = measurableCompany();
  c.versions[0].data.objectives[0].baseline = 0;
  c.versions[0].data.objectives[0].target = null;
  c.versions[0].data.goals = [
    { ...structuredClone(goal), target: 99, title: "Archived company goal" },
  ];
  const input = view([c]);
  const map = buildStrategyMap(input, "2028", "2028-05-01");
  assert.equal(map.objectives[0].measurement?.baseline, 0);
  assert.equal(map.objectives[0].measurement?.target, null);
  assert.deepEqual(map.objectives[0].goals, []);
  const handoff = approvedPlanningCommitments(input, "2028", "2028-05-01");
  assert.equal(handoff.length, 1);
  assert.equal(handoff[0].goal.target, null);
  const html = strategyMapPrintHtml(map, {
    paper: "A4",
    company: "Plastic Ltd",
    cycle: "2028",
    asOf: "2028-05-01",
    objectiveIds: ["objective"],
    includeActions: false,
  });
  assert.match(html, /Baseline 0 %/);
  assert.match(html, /Target Not set/);
  assert(!html.includes("Archived company goal"));
  assert(!html.includes("Target 99"));
});

test("measurable objective print escapes department measures and still excludes confidential SWOT", () => {
  const c = measurableCompany(),
    d = directObjectiveDepartment();
  d.versions[0].data.goals[0].measure = '<img src=x onerror="alert(1)">';
  const map = buildStrategyMap(view([c, d]), "2028", "2028-05-01");
  const options = {
    paper: "A3" as const,
    company: "Plastic Ltd",
    cycle: "2028",
    asOf: "2028-05-01",
    objectiveIds: ["objective"],
    includeActions: true,
  };
  const html = strategyMapPrintHtml(map, options);
  assert.doesNotMatch(html, /<img\b/i);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  for (const privateText of [
    "private-finding",
    "Confidential SWOT explanation",
    "Private evidence",
    "Detailed instructions",
  ])
    assert(!html.includes(privateText));
  const companyOnly = strategyMapPrintHtml(map, {
    ...options,
    includeActions: false,
  });
  assert(!companyOnly.includes("Production rejects"));
  assert(
    companyOnly.includes(
      "Preventable rejected batches / total inspected batches",
    ),
  );
});

test("programme print shows the separate measurable result and approved measurement rules once", () => {
  const c = measurableCompany();
  Object.assign(c.versions[0].data.objectives[0], {
    title: "Reliable packaging quality",
    result: "Reduce rejected batches to zero by December 2028",
    definition: "Count each inspected batch once <checked>",
    direction: "LOWER",
    baselinePeriod: "October 2027; 200 inspected batches",
    dataSource: "Quality register; verified by the Quality Manager",
    reviewFrequency: "Monthly",
    guardrails: "Maintain safe machine settings & product specifications",
    alignment: "Q",
  });
  const map = buildStrategyMap(view([c]), "2028", "2028-05-01");
  const html = strategyMapPrintHtml(map, {
    paper: "A3",
    company: "Plastic Ltd",
    cycle: "2028",
    asOf: "2028-05-01",
    objectiveIds: ["objective"],
    includeActions: false,
  });
  assert.equal(html.split("Reliable packaging quality").length - 1, 1);
  assert.equal(
    html.split("Reduce rejected batches to zero by December 2028").length - 1,
    1,
  );
  assert.match(html, /Count each inspected batch once &lt;checked&gt;/);
  assert.match(html, /October 2027; 200 inspected batches/);
  assert.match(html, /Quality register; verified by the Quality Manager/);
  assert.match(html, /Success: Reduce \/ at most the target/);
  assert.match(html, /Review: Monthly/);
  assert.match(
    html,
    /Maintain safe machine settings &amp; product specifications/,
  );
  assert.doesNotMatch(html, /private-finding|Confidential SWOT explanation/);
});

test("strategy map prints all approved objective alignments and preserves legacy Other history", () => {
  const c = measurableCompany();
  Object.assign(c.versions[0].data.objectives[0], {
    alignments: ["Q", "C", "D"],
    alignment: "Q",
  });
  const map = buildStrategyMap(view([c]), "2028", "2028-05-01");
  assert.deepEqual(map.objectives[0].alignments, [
    "Q · Quality",
    "C · Cost",
    "D · Delivery",
  ]);
  const options = {
    paper: "A3" as const,
    company: "Plastic Ltd",
    cycle: "2028",
    asOf: "2028-05-01",
    objectiveIds: ["objective"],
    includeActions: false,
  };
  const html = strategyMapPrintHtml(map, options);
  assert.match(
    html,
    /<span>Q · Quality<\/span><span>C · Cost<\/span><span>D · Delivery<\/span>/,
  );
  Object.assign(c.versions[0].data.objectives[0], {
    alignments: [],
    alignment: "OTHER",
    otherBusinessFocus: "Continuity <verified>",
  });
  const legacy = buildStrategyMap(view([c]), "2028", "2028-05-01");
  assert.deepEqual(legacy.objectives[0].alignments, [
    "Business focus: Continuity <verified>",
  ]);
  assert.match(
    strategyMapPrintHtml(legacy, options),
    /Business focus: Continuity &lt;verified&gt;/,
  );
});

function cumulativeCompany() {
  const c = measurableCompany();
  c.versions[0].approvedItem = { kind: "objective", itemId: "objective" };
  c.itemApprovals = [
    {
      kind: "objective",
      itemId: "objective",
      status: "APPROVED",
      version: 1,
      approvedAt: "2028-01-01",
      approvedBy: "owner",
    },
  ];
  c.data.objectives.push({
    ...structuredClone(c.data.objectives[0]),
    id: "another-objective",
    code: "OBJ-2",
    title: "Protect delivery reliability",
  });
  approve(c, "2028-02-01", 2);
  c.versions[1].companyPlanningModel = "MEASURABLE_OBJECTIVES";
  c.versions[1].approvedItem = {
    kind: "objective",
    itemId: "another-objective",
  };
  c.itemApprovals.push({
    kind: "objective",
    itemId: "another-objective",
    status: "APPROVED",
    version: 2,
    approvedAt: "2028-02-01",
    approvedBy: "owner",
  });
  return c;
}

test("approving another objective keeps unchanged pinned department and individual links in print", () => {
  const c = cumulativeCompany();
  const map = buildStrategyMap(
    view([c, directObjectiveDepartment(), directObjectiveIndividual()]),
    "2028",
    "2028-05-01",
  );
  const first = map.objectives.find((item) => item.id === "objective")!;
  assert.equal(map.plan?.version, 2);
  assert.equal(first.measurement?.contributions?.length, 1);
  assert.equal(first.measurement?.actions.length, 1);
  assert.deepEqual(
    map.individualGoals.map((item) => item.companyObjectiveId),
    ["objective", "objective"],
  );
  assert(
    !map.notices.some((notice) =>
      notice.includes("different company plan version"),
    ),
  );
  c.data.objectives[0].target = 5;
  approve(c, "2028-06-01", 3);
  c.versions[2].companyPlanningModel = "MEASURABLE_OBJECTIVES";
  c.versions[2].approvedItem = { kind: "objective", itemId: "objective" };
  c.itemApprovals![0].version = 3;
  const revised = buildStrategyMap(
    view([c, directObjectiveDepartment()]),
    "2028",
    "2028-06-01",
  );
  assert.equal(
    revised.objectives.find((item) => item.id === "objective")?.measurement
      ?.contributions?.length,
    0,
  );
});

test("verified results keep their own approval version across unrelated and future item approvals", () => {
  const c = cumulativeCompany();
  const input = view([c]);
  const result: ProgrammeResult = {
    id: "result-1",
    documentId: c.id,
    itemId: "objective",
    itemKind: "OBJECTIVE",
    version: 1,
    scope: "COMPANY",
    periodStart: "2028-03-01",
    periodEnd: "2028-03-31",
    actual: 0,
    numerator: null,
    denominator: null,
    source: "Quality register",
    notes: "Independently checked",
    status: "VERIFIED",
    recordedBy: "recorder",
    recordedAt: "2028-04-01",
    verifiedBy: "reviewer",
    verifiedAt: "2028-04-02",
    verificationNote: "Scope and counts checked",
  };
  const first = programmeCommitments(input, "2028", "2028-05-01").find(
    (item) => item.item.id === "objective",
  )!;
  assert.equal(first.version, 1);
  assert.equal(programmeLatestResult([result], first)?.id, "result-1");
  c.data.objectives[0].target = 5;
  approve(c, "2028-06-01", 3);
  c.versions[2].companyPlanningModel = "MEASURABLE_OBJECTIVES";
  c.versions[2].approvedItem = { kind: "objective", itemId: "objective" };
  c.itemApprovals![0].version = 3;
  const beforeEffective = programmeCommitments(
    input,
    "2028",
    "2028-05-31",
  ).find((item) => item.item.id === "objective")!;
  assert.equal(beforeEffective.version, 1);
  assert.equal(
    programmeLatestResult([result], beforeEffective)?.id,
    "result-1",
  );
  const afterEffective = programmeCommitments(input, "2028", "2028-06-01").find(
    (item) => item.item.id === "objective",
  )!;
  assert.equal(afterEffective.version, 3);
  assert.equal(programmeLatestResult([result], afterEffective), undefined);
});

test("print and handover ignore future-effective rows copied into another item's approval", () => {
  const c = cumulativeCompany();
  const oldTarget = c.versions[0].data.objectives[0].target;
  // A future A approval is saved before a currently effective B approval.
  c.data.objectives[0].target = 5;
  approve(c, "2028-09-01", 3);
  c.versions[2].companyPlanningModel = "MEASURABLE_OBJECTIVES";
  c.versions[2].approvedItem = { kind: "objective", itemId: "objective" };
  c.data.objectives[1].target = 98;
  approve(c, "2028-04-01", 4);
  c.versions[3].companyPlanningModel = "MEASURABLE_OBJECTIVES";
  c.versions[3].approvedItem = {
    kind: "objective",
    itemId: "another-objective",
  };
  c.itemApprovals![0].version = 3;
  c.itemApprovals![1].version = 4;
  const input = view([c, directObjectiveDepartment()]);
  const map = buildStrategyMap(input, "2028", "2028-05-01");
  const first = map.objectives.find((item) => item.id === "objective")!;
  assert.equal(first.measurement?.target, oldTarget);
  assert.equal(first.measurement?.contributions?.length, 1);
  assert.equal(
    map.objectives.find((item) => item.id === "another-objective")?.measurement
      ?.target,
    98,
  );
  const rows = approvedPlanningCommitments(input, "2028", "2028-05-01");
  assert.equal(
    rows.find((row) => row.goal.id === "objective")?.version.version,
    1,
  );
  assert.equal(
    rows.find((row) => row.goal.id === "objective")?.goal.target,
    oldTarget,
  );
  assert.equal(
    rows.find((row) => row.goal.id === "another-objective")?.version.version,
    4,
  );
  assert.equal(
    programmeCommitments(input, "2028", "2028-05-01").find(
      (row) => row.item.id === "objective",
    )?.version,
    1,
  );
  const effective = buildStrategyMap(input, "2028", "2028-09-01");
  assert.equal(
    effective.objectives.find((item) => item.id === "objective")?.measurement
      ?.target,
    5,
  );
});
