import test from "node:test";
import assert from "node:assert/strict";
import { sampleAssets } from "../components/tpm/asset-preview";
import {
  createInspectionSnapshot,
  sampleInspectionPreview,
  updateInspection,
} from "../components/tpm/inspections/inspection-preview";
import {
  addPlanningDays,
  buildOccurrences,
  createPlan,
  emptyPlan,
  occurrenceResult,
  planningDateTime,
  planningSchema,
  planningToday,
  previewPlanDates,
  readPlanning,
  setPlanStatus,
  updatePlan,
  validatePlanInput,
  type PlanInput,
} from "../components/tpm/planning/planning-preview";
import { createWorkOrder } from "../components/tpm/work-orders/work-order-preview";
import { emptyWorkOrder } from "../components/tpm/work-orders/work-order-types";

const NOW = "2026-01-01T00:00:00.000Z";
function fixture(overrides: Partial<PlanInput> = {}) {
  const assets = sampleAssets();
  const checklists = sampleInspectionPreview().checklists;
  const input: PlanInput = {
    ...emptyPlan(),
    name: "Packaging line preventive maintenance",
    assetIds: [assets[0].id],
    startDate: "2026-01-31",
    tasks: [
      {
        id: "lubrication",
        title: "Lubricate bearings",
        description: "Use approved grease.",
        required: true,
        estimatedHours: "0.5",
      },
    ],
    checklistId: checklists[1].id,
    ...overrides,
  };
  const plan = createPlan(input, assets, checklists, [], "Active", NOW);
  return { input, assets, checklists, plan };
}

test("monthly recurrence preserves its original day after February and shorter months", () => {
  const { plan } = fixture();
  const jobs = buildOccurrences(plan, "2026-01-01", "2026-05-31", [], NOW);
  assert.deepEqual(
    jobs.map((row) => row.scheduledDate),
    ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31"],
  );
  assert.equal(jobs[0].scheduledAt, "2026-01-30T18:30:00.000Z");
  assert.equal(jobs[0].dueAt, "2026-01-31T11:30:00.000Z");
});

test("quarterly, half-yearly and yearly recurrence use calendar months and leap-year clamping", () => {
  const quarterly = fixture({ frequency: "Quarterly" }).plan;
  assert.deepEqual(
    buildOccurrences(quarterly, "2026-01-01", "2026-12-31", [], NOW).map(
      (row) => row.scheduledDate,
    ),
    ["2026-01-31", "2026-04-30", "2026-07-31", "2026-10-31"],
  );
  const halfYearly = fixture({
    frequency: "Half-yearly",
    startDate: "2024-08-31",
  }).plan;
  assert.deepEqual(
    buildOccurrences(halfYearly, "2025-01-01", "2025-12-31", [], NOW).map(
      (row) => row.scheduledDate,
    ),
    ["2025-02-28", "2025-08-31"],
  );
  const yearly = fixture({ frequency: "Yearly", startDate: "2024-02-29" }).plan;
  assert.equal(
    buildOccurrences(yearly, "2025-01-01", "2025-12-31", [], NOW)[0]
      .scheduledDate,
    "2025-02-28",
  );
  assert.equal(
    buildOccurrences(yearly, "2028-01-01", "2028-12-31", [], NOW)[0]
      .scheduledDate,
    "2028-02-29",
  );
});

test("weekly dates stay anchored; explicit exclusions are kept as skipped jobs", () => {
  const { plan } = fixture({
    frequency: "Weekly",
    startDate: "2026-01-05",
    endDate: "2026-01-26",
    excludedDates: ["2026-01-12"],
  });
  const jobs = buildOccurrences(plan, "2026-01-01", "2026-02-28", [], NOW);
  assert.deepEqual(
    jobs.map((row) => row.scheduledDate),
    ["2026-01-05", "2026-01-12", "2026-01-19", "2026-01-26"],
  );
  assert.equal(jobs[1].state, "Skipped");
  assert.equal(jobs[1].skipReason, "Excluded date");
  assert.equal(jobs[2].state, "Scheduled");
  const daily = fixture({
    frequency: "Daily",
    startDate: "2026-01-02",
    excludedWeekdays: [0, 6],
  }).plan;
  assert.deepEqual(
    buildOccurrences(daily, "2026-01-02", "2026-01-05", [], NOW).map(
      (row) => row.state,
    ),
    ["Scheduled", "Skipped", "Skipped", "Scheduled"],
  );
});

test("organization time zone determines dates and deadlines across daylight-saving changes", () => {
  assert.equal(
    planningDateTime("2026-03-07", "17:00", "America/New_York"),
    "2026-03-07T22:00:00.000Z",
  );
  assert.equal(
    planningDateTime("2026-03-08", "17:00", "America/New_York"),
    "2026-03-08T21:00:00.000Z",
  );
  assert.equal(
    planningToday("Asia/Kolkata", new Date("2026-01-31T21:00:00.000Z")),
    "2026-02-01",
  );
  assert.equal(addPlanningDays("2024-02-28", 1), "2024-02-29");
  assert.throws(
    () => planningDateTime("2026-03-08", "02:30", "America/New_York"),
    /does not exist/,
  );
  assert.throws(() => planningDateTime("2026-02-30", "17:00", "UTC"), /valid/);
  assert.throws(() => planningToday("Not/AZone"), /valid/);
  const { plan } = fixture({
    frequency: "Daily",
    startDate: "2026-03-07",
    timeZone: "America/New_York",
    dueWindowDays: 1,
  });
  assert.equal(
    buildOccurrences(plan, "2026-03-07", "2026-03-07", [], NOW)[0].dueAt,
    "2026-03-08T21:00:00.000Z",
  );
});

test("generation is idempotent across overlapping windows and edits preserve existing snapshots", () => {
  const { plan, assets, checklists, input } = fixture();
  const first = buildOccurrences(plan, "2026-01-01", "2026-03-31", [], NOW);
  const original = structuredClone(first);
  assert.deepEqual(
    buildOccurrences(plan, "2026-01-01", "2026-03-31", first, NOW),
    [],
  );
  checklists[1].items[0].title = "New checklist wording";
  assets[0].name = "Renamed equipment";
  input.tasks[0].title = "New maintenance task";
  const edited = updatePlan(
    plan,
    { ...input, estimatedMinutes: 90 },
    assets,
    checklists,
    "Active",
    "2026-02-01T00:00:00.000Z",
  );
  const additional = buildOccurrences(
    edited,
    "2026-02-01",
    "2026-04-30",
    first,
    NOW,
  );
  assert.equal(additional.length, 1);
  assert.equal(additional[0].scheduledDate, "2026-04-30");
  assert.equal(additional[0].plannedMinutes, 90);
  assert.equal(
    additional[0].checklist?.items[0].title,
    "New checklist wording",
  );
  assert.equal(additional[0].assetName, "Renamed equipment");
  assert.deepEqual(first, original);
  assert.notEqual(plan.checklist?.items[0].title, "New checklist wording");
  assert.notEqual(plan.tasks[0].title, "New maintenance task");
  assert.equal(
    buildOccurrences(plan, "2026-01-01", "2026-03-31", [], NOW)[0].id,
    first[0].id,
  );
});

test("pause stops generation and resume rechecks live directory availability", () => {
  const { plan, assets, checklists } = fixture();
  const paused = setPlanStatus(plan, "Paused", NOW);
  assert.deepEqual(
    buildOccurrences(paused, "2026-01-01", "2026-03-31", [], NOW),
    [],
  );
  assert.throws(() => setPlanStatus(paused, "Active", NOW), /current assets/);
  const resumed = updatePlan(paused, paused, assets, checklists, "Active", NOW);
  assert.equal(
    buildOccurrences(resumed, "2026-01-01", "2026-03-31", [], NOW).length,
    3,
  );
  assets[0].usage = "Retired";
  assert.throws(
    () => updatePlan(paused, paused, assets, checklists, "Active", NOW),
    /registered assets/,
  );
  const archived = setPlanStatus(plan, "Archived", NOW);
  assert.throws(
    () => updatePlan(archived, archived, assets, checklists, "Active", NOW),
    /Archived/,
  );
  assert.throws(() => setPlanStatus(plan, "Draft", NOW), /cannot return/);
});

test("drafts may be incomplete, while active plans require valid assets, schedule, tasks or checklist", () => {
  assert.deepEqual(validatePlanInput(emptyPlan(), true), {});
  const required = validatePlanInput(emptyPlan());
  assert.ok(
    required.name && required.assetIds && required.startDate && required.tasks,
  );
  const { input, assets, checklists } = fixture();
  const draft = createPlan(emptyPlan(), assets, checklists, [], "Draft", NOW);
  assert.equal(draft.status, "Draft");
  const archivedDraft = setPlanStatus(draft, "Archived", NOW);
  assert.equal(
    planningSchema.safeParse({ plans: [archivedDraft], occurrences: [] })
      .success,
    true,
  );
  assert.equal(
    createPlan(input, assets, checklists, [draft], "Active", NOW).code,
    "PMP-0002",
  );
  assert.ok(validatePlanInput({ ...input, endDate: "2026-01-01" }).endDate);
  assert.ok(validatePlanInput({ ...input, startDate: "2026-02-29" }).startDate);
  assert.ok(
    validatePlanInput({ ...input, estimatedMinutes: 0 }).estimatedMinutes,
  );
  assert.ok(validatePlanInput({ ...input, manpower: 1.5 }).manpower);
  assert.ok(
    validatePlanInput({ ...input, excludedWeekdays: [0, 1, 2, 3, 4, 5, 6] })
      .excludedWeekdays,
  );
  assert.ok(
    validatePlanInput({ ...input, assigneeName: "Unknown member" }).assigneeId,
  );
  assert.ok(
    validatePlanInput({ ...input, assetIds: [assets[0].id, assets[0].id] })
      .assetIds,
  );
  assert.throws(
    () =>
      createPlan(
        { ...input, kind: "AM", checklistId: "" },
        assets,
        checklists,
        [],
        "Active",
        NOW,
      ),
    /AM checklist/,
  );
  assert.throws(
    () =>
      createPlan(
        { ...input, checklistId: checklists[2].id },
        assets,
        checklists,
        [],
        "Active",
        NOW,
      ),
    /published/,
  );
  assert.throws(
    () =>
      createPlan(
        { ...input, kind: "AM" },
        assets,
        checklists,
        [],
        "Active",
        NOW,
      ),
    /available AM/,
  );
  assert.throws(
    () => createPlan(input, [], checklists, [], "Active", NOW),
    /registered/,
  );
});

test("schedule preview follows recurrence and exclusions without creating assets or jobs", () => {
  const input = {
    ...emptyPlan(),
    startDate: "2026-01-31",
    excludedDates: ["2026-02-28"],
  };
  assert.deepEqual(previewPlanDates(input, 3), [
    { date: "2026-01-31", state: "Scheduled", reason: "" },
    { date: "2026-02-28", state: "Skipped", reason: "Excluded date" },
    { date: "2026-03-31", state: "Scheduled", reason: "" },
  ]);
  assert.deepEqual(previewPlanDates(emptyPlan()), []);
  assert.equal(
    previewPlanDates({ ...input, frequency: "Yearly" }, 3)[2].date,
    "2028-01-31",
  );
  assert.equal(previewPlanDates({ ...input, endDate: "2026-02-28" }).length, 2);
});

test("generation bounds reject oversized ranges and job counts without changing existing data", () => {
  const { plan, input, assets, checklists } = fixture({
    frequency: "Daily",
    startDate: "2026-01-01",
  });
  assert.throws(
    () => buildOccurrences(plan, "2026-01-01", "2027-01-02", [], NOW),
    /366 days/,
  );
  assert.throws(
    () => buildOccurrences(plan, "2026-02-01", "2026-01-01", [], NOW),
    /valid generation/,
  );
  const manyAssets = Array.from({ length: 50 }, (_, index) => ({
    ...assets[0],
    id: `asset-${index}`,
    code: `AST-${index}`,
  }));
  const many = createPlan(
    { ...input, assetIds: manyAssets.map((asset) => asset.id) },
    manyAssets,
    checklists,
    [],
    "Active",
    NOW,
  );
  const existing = buildOccurrences(many, "2026-01-01", "2026-01-01", [], NOW);
  const original = structuredClone(existing);
  assert.throws(
    () => buildOccurrences(many, "2026-01-01", "2026-03-01", existing, NOW),
    /2,000 jobs/,
  );
  assert.deepEqual(existing, original);
});

test("unstarted job status is derived from its organization's scheduled start and deadline", () => {
  const { plan } = fixture();
  const [job] = buildOccurrences(plan, "2026-01-31", "2026-01-31", [], NOW);
  assert.equal(
    occurrenceResult(job, [], [], Date.parse(job.scheduledAt) - 1).status,
    "Scheduled",
  );
  assert.equal(
    occurrenceResult(job, [], [], Date.parse(job.scheduledAt)).status,
    "Due",
  );
  assert.equal(
    occurrenceResult(job, [], [], Date.parse(job.dueAt)).status,
    "Due",
  );
  assert.equal(
    occurrenceResult(job, [], [], Date.parse(job.dueAt) + 1).status,
    "Overdue",
  );
  assert.equal(
    occurrenceResult({ ...job, executionId: "deleted-order" }, [], []).status,
    "Missing record",
  );
  assert.equal(
    occurrenceResult(
      { ...job, state: "Skipped", skipReason: "Shutdown" },
      [],
      [],
    ).status,
    "Skipped",
  );
});

test("PM task completion waits for required checks; cost review does not block maintenance completion", () => {
  const { plan, assets } = fixture();
  const [job] = buildOccurrences(plan, "2026-01-31", "2026-01-31", [], NOW);
  const order = createWorkOrder(
    {
      ...emptyWorkOrder(),
      title: job.planName,
      assetId: job.assetId,
      type: "Preventive",
      plannedStart: job.scheduledAt,
      dueAt: job.dueAt,
      tasks: job.tasks,
      checklistId: job.checklist!.id,
    },
    assets[0],
    job.checklist,
    "Preview technician",
    [],
    NOW,
  );
  const linked = { ...job, executionId: order.id };
  order.status = "Completed";
  order.completionMode = "tasks";
  order.completedAt = "2026-01-31T11:00:00.000Z";
  order.taskResults = { lubrication: true };
  order.taskTimeEntries = {
    lubrication: {
      startedAt: "2026-01-31T10:00:00.000Z",
      stoppedAt: "2026-01-31T11:00:00.000Z",
      performedById: "tech",
      performedByName: "Technician",
    },
  };
  assert.equal(occurrenceResult(linked, [order], []).status, "Pending checks");
  order.answers = Object.fromEntries(
    job.checklist!.items.map((item) => [item.id, { value: "Pass", note: "" }]),
  );
  const completed = occurrenceResult(linked, [order], []);
  assert.equal(order.financialStatus, "Open");
  assert.equal(completed.status, "Completed");
  assert.equal(completed.onTime, true);
  assert.equal(completed.actualSeconds, 3_600);
  order.tasks.push({
    id: "second-task",
    title: "Inspect pump",
    description: "",
    estimatedHours: "",
    required: true,
  });
  order.taskTimeEntries["second-task"] = {
    startedAt: "2026-01-31T10:30:00.000Z",
    stoppedAt: "2026-01-31T11:00:00.000Z",
    performedById: "other-tech",
    performedByName: "Second technician",
  };
  assert.equal(occurrenceResult(linked, [order], []).actualSeconds, 5_400);
  order.completedAt = "2026-01-31T12:00:00.000Z";
  assert.equal(occurrenceResult(linked, [order], []).onTime, false);
  const firstItem = job.checklist!.items[0].id;
  order.answers[firstItem] = { value: "Fail", note: "" };
  assert.equal(occurrenceResult(linked, [order], []).status, "Pending checks");
  order.answers[firstItem].note = "Follow-up work required.";
  assert.equal(occurrenceResult(linked, [order], []).status, "Completed");
  assert.equal(occurrenceResult(linked, [order], []).issueCount, 1);
  order.checklist = null;
  assert.equal(occurrenceResult(linked, [order], []).status, "Pending checks");
});

test("AM reports with recorded issues count as completed and retain their issue count", () => {
  const { plan, assets } = fixture({
    kind: "AM",
    frequency: "Daily",
    checklistId: "sample-am-daily",
    tasks: [],
  });
  const [job] = buildOccurrences(plan, "2026-01-31", "2026-01-31", [], NOW);
  const report = createInspectionSnapshot(
    job.checklist!,
    assets[0],
    {
      userId: "operator-1",
      name: "Operator",
      role: "Operator",
      inspectionDate: "2026-01-31",
    },
    [],
    "2026-01-31T08:00:00.000Z",
  );
  const linked = { ...job, executionId: report.id };
  assert.equal(occurrenceResult(linked, [], [report]).status, "In progress");
  const answers = Object.fromEntries(
    report.items.map((item, index) => [
      item.id,
      {
        value: index === 0 ? "Fail" : "Pass",
        note: index === 0 ? "Leak recorded for corrective work." : "",
      },
    ]),
  );
  const completed = updateInspection(
    report,
    answers,
    "",
    true,
    "2026-01-31T08:15:30.000Z",
  );
  const result = occurrenceResult(linked, [], [completed]);
  assert.equal(result.status, "Completed");
  assert.equal(result.issueCount, 1);
  assert.equal(result.onTime, true);
  assert.equal(result.actualSeconds, 930);
  assert.equal(
    occurrenceResult(
      linked,
      [],
      [{ ...completed, checklistId: "different-checklist" }],
    ).status,
    "Pending checks",
  );
  const missingRequired = structuredClone(completed);
  delete missingRequired.answers[completed.items[0].id];
  missingRequired.items = missingRequired.items.slice(1);
  assert.equal(
    occurrenceResult(linked, [], [missingRequired]).status,
    "Pending checks",
  );
});

test("stored planning data validates duplicates, orphan jobs and skipped execution links", () => {
  const { plan } = fixture();
  const [job] = buildOccurrences(plan, "2026-01-31", "2026-01-31", [], NOW);
  assert.equal(
    planningSchema.safeParse({ plans: [plan], occurrences: [job] }).success,
    true,
  );
  assert.equal(
    planningSchema.safeParse({ plans: [plan, plan], occurrences: [] }).success,
    false,
  );
  assert.equal(
    planningSchema.safeParse({
      plans: [plan],
      occurrences: [job, { ...job, id: "different-id" }],
    }).success,
    false,
  );
  assert.equal(
    planningSchema.safeParse({ plans: [], occurrences: [job] }).success,
    false,
  );
  assert.equal(
    planningSchema.safeParse({
      plans: [plan],
      occurrences: [
        {
          ...job,
          state: "Skipped",
          skipReason: "Holiday",
          executionId: "order",
        },
      ],
    }).success,
    false,
  );
  assert.equal(
    planningSchema.safeParse({
      plans: [{ ...plan, timeZone: "invalid" }],
      occurrences: [],
    }).success,
    false,
  );
});

test("empty storage starts empty; malformed saved data throws and is never replaced", () => {
  const descriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
  );
  let raw: string | null = null;
  let writes = 0;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: () => raw,
      setItem: () => {
        writes++;
      },
    },
  });
  try {
    assert.deepEqual(readPlanning("plans"), { plans: [], occurrences: [] });
    raw = "";
    assert.throws(() => readPlanning("plans"), /kept unchanged/);
    raw = "{broken";
    assert.throws(() => readPlanning("plans"), /kept unchanged/);
    assert.equal(raw, "{broken");
    raw = JSON.stringify({ plans: [], occurrences: [] });
    assert.deepEqual(readPlanning("plans"), { plans: [], occurrences: [] });
    assert.equal(writes, 0);
  } finally {
    if (descriptor)
      Object.defineProperty(globalThis, "localStorage", descriptor);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
