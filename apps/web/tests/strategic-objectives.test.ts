import test from "node:test";
import assert from "node:assert/strict";
import {
  createMockStrategicObjectivesService,
  type GoalData,
  type ObjectiveData,
} from "../services/strategic-objectives";
import { createSeedState } from "../services/strategic-objectives/seed";
import {
  emptyGoal,
  editGoalDraft,
  generateCode,
  smartReadiness,
  validateGoal,
  validateObjective,
} from "../services/strategic-objectives/rules";
import { isStrategicObjectivesDemoPath } from "../services/strategic-objectives/routes";

const NOW = "2026-10-30T09:00:00.000Z";
const make = () => createMockStrategicObjectivesService({ now: () => NOW });
async function dependencies(service = make()) {
  const [pillars, departments, employees, planningPeriods] = await Promise.all([
    service.getPillars(),
    service.getDepartments(),
    service.getEmployees(),
    service.getPlanningPeriods(),
  ]);
  return { pillars, departments, employees, planningPeriods };
}
const completeGoal = (): GoalData => ({
  ...emptyGoal(),
  resultStatement:
    "Eliminate verified reportable safety incidents by year end.",
  measure: "Verified reportable incidents in the period",
  target: 0,
  unit: "incidents",
  ownerId: "demo-emp-07",
  deadline: "2026-12-31",
  contributingDepartmentIds: ["demo-dept-maintenance", "demo-dept-production"],
  smartConfirmations: { specific: true, achievable: true, relevant: true },
});

test("fixtures have exactly six pillars, eight departments, twelve employees and two periods", async () => {
  const refs = await dependencies();
  assert.deepEqual(
    refs.pillars.map((item) => item.code),
    ["LEX", "PEX", "OPX", "CMX", "SGEX", "FPEX"],
  );
  assert.equal(refs.departments.length, 8);
  assert.equal(refs.employees.length, 12);
  assert.equal(refs.planningPeriods.length, 2);
  assert.ok(
    refs.employees.every(
      (person) =>
        person.position &&
        refs.departments.some((item) => item.id === person.departmentId),
    ),
  );
});

test("one seeded register contains three objective statuses and five singly linked goals", async () => {
  const service = make();
  const rows = await service.getObjectives();
  assert.deepEqual(
    rows.map((item) => item.current.status),
    ["Draft", "Approved", "Revised"],
  );
  assert.equal(rows.flatMap((item) => item.goals).length, 5);
  assert.ok(
    rows.every(
      (row) =>
        row.goals.length >= 1 &&
        row.goals.length <= 2 &&
        row.goals.every((goal) => goal.objectiveId === row.id),
    ),
  );
  const refs = await dependencies(service);
  for (const row of rows) {
    if (row.current.status === "Approved")
      assert.deepEqual(validateObjective(row.current.data, refs), {});
    for (const goal of row.goals.filter(
      (item) => item.current.status === "Approved",
    ))
      assert.deepEqual(
        validateGoal(goal.current.data, row.current.data, refs),
        {},
      );
  }
});

test("drafts save without required data; absent numbers stay null and approval validates", async () => {
  const service = make();
  const objective = await service.createObjective();
  const goal = await service.saveGoal(objective.id, {});
  assert.equal(goal.current.data.baseline, null);
  assert.equal(goal.current.data.target, null);
  await service.setDemoRole("APPROVER");
  await assert.rejects(
    service.approveObjective(objective.id, 1),
    /clear title/,
  );
  await assert.rejects(
    service.approveGoal(goal.id, 1),
    /Approve the linked objective/,
  );
  assert.equal(
    (await service.getObjectives()).find((item) => item.id === objective.id)
      ?.current.status,
    "Draft",
  );
});

test("codes remain unique under concurrent mock calls and temporary codes are not reused", async () => {
  const service = make();
  const input = (await service.getObjectives())[0].current.data;
  const records = await Promise.all(
    Array.from({ length: 12 }, () => service.createObjective(input)),
  );
  assert.equal(new Set(records.map((item) => item.id)).size, 12);
  assert.equal(new Set(records.map((item) => item.code)).size, 12);
  await service.setDemoRole("APPROVER");
  const approved = await service.approveObjective(records.at(-1)!.id, 1);
  assert.match(approved.code, /^OBJ-LEX-2026-\d{3}$/);
  await service.setDemoRole("LEADERSHIP");
  assert.notEqual((await service.createObjective()).code, records.at(-1)!.code);
  assert.equal(
    generateCode(
      "OBJ",
      ["OBJ-OPX-2026-001", "OBJ-OPX-2026-004"],
      "OPX",
      (await service.getPlanningPeriods())[0],
    ),
    "OBJ-OPX-2026-005",
  );
});

test("a blank objective can be continued in the same register without duplicating it or its goals", async () => {
  const service = make();
  const created = await service.createObjective();
  assert.equal(created.current.data.ownerId, null);
  assert.equal(created.current.data.planningPeriodId, null);
  const input: ObjectiveData = {
    title: "Make production reliable and right first time",
    meaning: "Prevent avoidable interruptions and improve consistent output.",
    primaryPillarCode: "OPX",
    alignments: ["Quality", "Delivery"],
    ownerId: "demo-emp-03",
    planningPeriodId: "demo-period-2026",
  };
  const updated = await service.saveObjective(
    created.id,
    input,
    created.current.number,
  );
  const rows = await service.getObjectives();
  assert.equal(rows.length, 4);
  assert.equal(rows.flatMap((row) => row.goals).length, 5);
  assert.equal(rows.filter((row) => row.id === created.id).length, 1);
  assert.equal(updated.code, created.code);
  assert.deepEqual(
    rows.find((row) => row.id === created.id)?.current.data,
    input,
  );
  assert.equal(updated.current.status, "Draft");
  assert.equal(updated.audit.at(-1)?.actorId, "demo-emp-01");
  assert.equal(updated.audit.at(-1)?.at, NOW);
  assert.equal(updated.audit.length, created.audit.length + 1);
  // Clearing a previously completed field is still a legitimate draft save.
  await service.saveObjective(
    updated.id,
    { ownerId: null },
    updated.current.number,
  );
  assert.equal(
    (await service.getObjectives()).find((row) => row.id === created.id)
      ?.current.data.ownerId,
    null,
  );
  await service.setDemoRole("READER");
  assert.ok(
    !(await service.getObjectives()).some((row) => row.id === created.id),
  );
});

test("objectives need clear direction but no goals or SMART fields", async () => {
  const service = make();
  const draft = await service.createObjective(
    (await service.getObjectives())[0].current.data,
  );
  await service.setDemoRole("APPROVER");
  const result = await service.approveObjective(draft.id, 1);
  assert.equal(result.current.status, "Approved");
  assert.deepEqual(result.goals, []);
});

test("SMART allows zero targets and absent baseline/explanations but needs human judgement", async () => {
  const service = make();
  const objective = (await service.getObjectives())[1];
  const refs = await dependencies(service);
  const complete = completeGoal();
  assert.ok(
    smartReadiness(complete, objective.current.data, refs).every(
      (check) => check.ready,
    ),
  );
  assert.deepEqual(validateGoal(complete, objective.current.data, refs), {});
  assert.ok(
    Object.keys(
      validateGoal({ ...complete, target: null }, objective.current.data, refs),
    ).length,
  );
  assert.ok(
    Object.keys(
      validateGoal(
        { ...complete, deadline: "2026-02-30" },
        objective.current.data,
        refs,
      ),
    ).length,
  );
  assert.ok(
    Object.keys(
      validateGoal(
        { ...complete, deadline: "2027-01-01" },
        objective.current.data,
        refs,
      ),
    ).length,
  );
  assert.ok(
    Object.keys(
      validateGoal(
        {
          ...complete,
          smartConfirmations: {
            specific: true,
            achievable: false,
            relevant: true,
          },
        },
        objective.current.data,
        refs,
      ),
    ).length,
  );
  const goal = await service.saveGoal(objective.id, complete);
  await service.setDemoRole("APPROVER");
  assert.equal(
    (await service.approveGoal(goal.id, 1)).current.status,
    "Approved",
  );
});

test("read-only role sees effective approved snapshots without pending data or audit leakage", async () => {
  const service = make();
  await service.setDemoRole("READER");
  const rows = await service.getObjectives();
  assert.equal(rows.length, 2);
  assert.ok(
    rows.every(
      (row) =>
        row.current.status === "Approved" &&
        row.goals.every((goal) => goal.current.status === "Approved"),
    ),
  );
  const finance = rows.find((row) => row.id === "demo-obj-fpex")!;
  assert.equal(finance.current.number, 1);
  assert.equal(finance.goals[0].current.data.target, 50);
  assert.deepEqual(finance.history, []);
  assert.ok(finance.audit.every((entry) => entry.action === "Approved"));
  await assert.rejects(service.createObjective(), /Only authorised leadership/);
  await assert.rejects(
    service.saveGoal(finance.id, {}),
    /Only authorised leadership/,
  );
  await assert.rejects(
    service.reviseObjective(finance.id, "Change", "2026-11-01"),
    /Only authorised leadership/,
  );
  await assert.rejects(
    service.approveGoal(finance.goals[0].id, 1),
    /designated approver/,
  );
});

test("approval belongs to one demo approver; approval cannot be edited or repeated", async () => {
  const service = make();
  const rows = await service.getObjectives();
  await assert.rejects(
    service.approveObjective(rows[0].id, 1),
    /designated approver/,
  );
  await assert.rejects(
    service.saveObjective(rows[1].id, { title: "Overwrite" }, 1),
    /locked/,
  );
  await assert.rejects(
    service.saveGoal(rows[1].id, { target: 3 }, rows[1].goals[0].id, 1),
    /locked/,
  );
  await service.setDemoRole("APPROVER");
  assert.equal((await service.getSession()).employeeId, "demo-emp-02");
  await assert.rejects(service.createObjective(), /authorised leadership/);
  await assert.rejects(service.approveObjective(rows[1].id, 1), /locked/);
});

test("revisions require reason/date, preserve approved history and honour effective dates", async () => {
  let time = NOW;
  const service = createMockStrategicObjectivesService({ now: () => time });
  await assert.rejects(
    service.reviseObjective("demo-obj-opx", "", "2026-11-01"),
    /Explain why/,
  );
  await assert.rejects(
    service.reviseObjective("demo-obj-opx", "Updated direction", "invalid"),
    /effective date/,
  );
  const revised = await service.reviseObjective(
    "demo-obj-opx",
    "Updated direction",
    "2026-11-01",
  );
  const original = structuredClone(revised.history[0]);
  await assert.rejects(
    service.saveObjective(revised.id, { title: "New" }, 1),
    /latest version/,
  );
  await service.saveObjective(
    revised.id,
    { title: "More reliable production" },
    2,
  );
  await service.setDemoRole("APPROVER");
  const approved = await service.approveObjective(revised.id, 2);
  assert.deepEqual(approved.history[0], original);
  assert.equal(approved.id, revised.id);
  assert.equal(approved.code, revised.code);
  await service.setDemoRole("READER");
  assert.equal(
    (await service.getObjectives()).find((row) => row.id === revised.id)
      ?.current.number,
    1,
  );
  time = "2026-11-01T09:00:00.000Z";
  assert.equal(
    (await service.getObjectives()).find((row) => row.id === revised.id)
      ?.current.number,
    2,
  );
});

test("changing a revised goal clears old SMART judgements without changing its approved version", async () => {
  const service = make();
  const revised = await service.reviseGoal(
    "demo-goal-scrap",
    "New target proposal",
    "2026-11-01",
  );
  const changed = await service.saveGoal(
    revised.objectiveId,
    { target: 1 },
    revised.id,
    2,
  );
  assert.equal(changed.history[0].data.target, 2);
  assert.equal(changed.current.data.smartConfirmations.achievable, false);
  await service.setDemoRole("APPROVER");
  await assert.rejects(service.approveGoal(revised.id, 2), /achievable/);
});

test("department integration uses distinct references to the same approved company goals", async () => {
  const service = make();
  const draft = await service.saveGoal("demo-obj-opx", {
    ...completeGoal(),
    contributingDepartmentIds: [
      "demo-dept-maintenance",
      "demo-dept-maintenance",
      "demo-dept-production",
    ],
  });
  assert.deepEqual(draft.current.data.contributingDepartmentIds, [
    "demo-dept-maintenance",
    "demo-dept-production",
  ]);
  await assert.rejects(service.saveGoal("missing-objective", {}), /not found/);
  await assert.rejects(
    service.saveGoal("demo-obj-lex", {}, draft.id, 1),
    /cannot be moved/,
  );
  await service.setDemoRole("APPROVER");
  await service.approveGoal(draft.id, 1);
  const maintenance = await service.getApprovedCompanyGoals(
    "demo-dept-maintenance",
  );
  const production = await service.getApprovedCompanyGoals(
    "demo-dept-production",
  );
  assert.ok(maintenance.some((item) => item.id === draft.id));
  assert.ok(production.some((item) => item.id === draft.id));
  assert.equal(
    (await service.getObjectives())
      .flatMap((row) => row.goals)
      .filter((item) => item.id === draft.id).length,
    1,
  );
});

test("service returns defensive copies and separate demo instances do not leak changes", async () => {
  const initial = createSeedState();
  const service = createMockStrategicObjectivesService({ initial });
  const rows = await service.getObjectives();
  rows[0].current.data.title = "External mutation";
  (await service.getPillars()).splice(0);
  assert.notEqual(
    (await service.getObjectives())[0].current.data.title,
    "External mutation",
  );
  assert.equal((await service.getPillars()).length, 6);
  await service.createObjective();
  assert.equal(initial.objectives.length, 3);
  assert.equal((await make().getObjectives()).length, 3);
});

test("session exception matches only the four synthetic prototype routes", () => {
  assert.equal(
    isStrategicObjectivesDemoPath("/leadership/strategic-objectives"),
    true,
  );
  assert.equal(
    isStrategicObjectivesDemoPath("/leadership/strategic-objectives/register"),
    true,
  );
  assert.equal(
    isStrategicObjectivesDemoPath("/leadership/strategic-objectives/new"),
    true,
  );
  for (const route of [
    null,
    "/",
    "/tpm/assets",
    "/api/auth/refresh",
    "/leadership/strategic-objectives-other",
    "/leadership/strategic-objectives/private",
    "/leadership/strategic-objectives/goals/private",
  ])
    assert.equal(isStrategicObjectivesDemoPath(route), false);
  assert.equal(
    isStrategicObjectivesDemoPath("/leadership/strategic-objectives/goals/new"),
    true,
  );
});

test("live goal edits reset human confirmations but preserve typing and optional explanations", async () => {
  const ready = completeGoal();
  const edited = editGoalDraft({ resultStatement: "Updated result " }, ready);
  assert.equal(edited.resultStatement, "Updated result ");
  assert.deepEqual(edited.smartConfirmations, emptyGoal().smartConfirmations);
  const explained = editGoalDraft(
    { smartExplanations: { Specific: "Some useful context " } },
    ready,
  );
  assert.deepEqual(explained.smartConfirmations, ready.smartConfirmations);
  assert.equal(explained.smartExplanations.Specific, "Some useful context ");
  assert.equal(ready.smartExplanations.Specific, undefined);
  for (const patch of [
    { target: 1 },
    { baseline: 3 },
    { ownerId: null },
    { deadline: "2027-01-01" },
    { contributingDepartmentIds: [] },
  ]) {
    assert.deepEqual(
      editGoalDraft(patch, ready).smartConfirmations,
      emptyGoal().smartConfirmations,
    );
  }
});

test("a goal draft can be continued under the same objective; zero stays zero and blank stays missing", async () => {
  const service = make();
  const draft = await service.saveGoal("demo-obj-opx", {});
  assert.equal(draft.current.data.target, null);
  const before = (await service.getObjectives()).find(
    (row) => row.id === "demo-obj-opx",
  )!;
  const updated = await service.saveGoal(
    draft.objectiveId,
    completeGoal(),
    draft.id,
    draft.current.number,
  );
  const after = (await service.getObjectives()).find(
    (row) => row.id === "demo-obj-opx",
  )!;
  assert.equal(after.goals.length, before.goals.length);
  assert.deepEqual(
    after.current,
    before.current,
    "Adding/updating a draft goal must not change the approved objective",
  );
  assert.equal(updated.code, draft.code);
  assert.equal(updated.current.data.baseline, null);
  assert.equal(updated.current.data.target, 0);
  assert.deepEqual(updated.current.data.smartExplanations, {});
  assert.equal(updated.audit.at(-1)?.action, "Saved draft");
  assert.ok(
    smartReadiness(
      updated.current.data,
      after.current.data,
      await dependencies(service),
    ).every((check) => check.ready),
  );
  await service.setDemoRole("READER");
  assert.ok(
    !(await service.getObjectives())
      .flatMap((row) => row.goals)
      .some((goal) => goal.id === draft.id),
  );
});

test("goal readiness rejects missing/out-of-period deadlines and is distinct from approval", async () => {
  const service = make();
  const objective = (await service.getObjectives())[1].current.data;
  const refs = await dependencies(service);
  for (const deadline of ["", "2026-02-30", "2025-12-31", "2027-01-01"]) {
    assert.equal(
      smartReadiness({ ...completeGoal(), deadline }, objective, refs).find(
        (check) => check.dimension === "Time-bound",
      )?.ready,
      false,
    );
  }
  const noContributors = { ...completeGoal(), contributingDepartmentIds: [] };
  assert.ok(
    smartReadiness(noContributors, objective, refs).every(
      (check) => check.ready,
    ),
  );
  assert.ok(
    validateGoal(noContributors, objective, refs).contributingDepartmentIds,
  );
});
