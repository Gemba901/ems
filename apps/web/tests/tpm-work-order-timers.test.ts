import test from "node:test";
import assert from "node:assert/strict";
import { sampleAssets } from "../components/tpm/asset-preview";
import { sampleInspectionPreview } from "../components/tpm/inspections/inspection-preview";
import {
  changeWorkOrderStatus,
  completeWorkOrder,
  createWorkOrder,
  createWorkOrderDraft,
  readWorkOrders,
  saveWorkOrderCompletion,
  saveWorkOrderWork,
  setWorkOrderFinancialClosed,
  startWorkOrderTask,
  stopWorkOrderTask,
  updateWorkOrderDetails,
} from "../components/tpm/work-orders/work-order-preview";
import {
  emptyWorkOrder,
  formatWorkOrderDuration,
  taskDurationSeconds,
  totalTaskDurationSeconds,
  workOrderTotals,
  type ScrapEntry,
  type WorkOrder,
  type WorkOrderCompletion,
  type WorkOrderInput,
} from "../components/tpm/work-orders/work-order-types";

const createdAt = "2026-10-22T07:00:00.000Z";
const startedAt = "2026-10-22T08:00:00.000Z";
const stoppedAt = "2026-10-22T09:00:00.000Z";
const laterAt = "2026-10-22T10:00:00.000Z";
const actor = { id: "technician-a", name: "Technician A" };
const task = (id: string, required = true) => ({
  id,
  title: `Repair ${id}`,
  description: "",
  estimatedHours: "1",
  required,
});

function fixture(taskCount = 1, withChecklist = false) {
  const asset = sampleAssets()[0];
  const checklist = sampleInspectionPreview().checklists[0];
  const input: WorkOrderInput = {
    ...emptyWorkOrder(),
    title: "Repair the drive motor",
    assetId: asset.id,
    dueAt: "2026-11-01T17:00:00.000Z",
    checklistId: withChecklist ? checklist.id : "",
    tasks: Array.from({ length: taskCount }, (_, index) =>
      task(`task-${index + 1}`, index === 0),
    ),
  };
  const order = createWorkOrder(
    input,
    asset,
    withChecklist ? checklist : null,
    "Planner",
    [],
    createdAt,
  );
  return { order, asset, checklist, input };
}

const completion = (
  overrides: Partial<WorkOrderCompletion> = {},
): WorkOrderCompletion => ({
  notes: "Repair verified and handed over.",
  actualHours: "1",
  scrapGenerated: "No",
  attachments: [],
  ...overrides,
});

const scrap = (overrides: Partial<ScrapEntry> = {}): ScrapEntry => ({
  id: "scrap-1",
  name: "Damaged drive motor",
  quantity: 1,
  unit: "piece",
  reason: "Winding failure",
  location: "Scrap store",
  disposition: "Disposed",
  estimatedValue: 100,
  actualRecovery: null,
  attachments: [],
  rootCause: "Bearing seizure",
  disposalCost: 25.75,
  dispositionDate: "2026-10-22",
  approvalRequired: false,
  approvalStatus: "Pending",
  approvalBy: "",
  approvalAt: null,
  ...overrides,
});

function completedTaskOrder(withChecklist = false) {
  return stopWorkOrderTask(
    startWorkOrderTask(fixture(1, withChecklist).order, "task-1", actor, startedAt),
    "task-1",
    stoppedAt,
  );
}

function withStorage(run: (setRaw: (raw: string) => void, getRaw: () => string) => void) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  let raw = "[]";
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: () => raw },
  });
  try {
    run((value) => { raw = value; }, () => raw);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "localStorage", descriptor);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
}

test("start records technician and timestamp, and stop completes the task and final work order", () => {
  const { order } = fixture(2);
  const original = structuredClone(order);
  const started = startWorkOrderTask(order, "task-1", actor, startedAt);
  assert.equal(started.status, "In progress");
  assert.equal(started.updatedAt, startedAt);
  assert.deepEqual(started.taskTimeEntries?.["task-1"], {
    startedAt,
    stoppedAt: null,
    performedById: actor.id,
    performedByName: actor.name,
  });
  assert.notEqual(started.taskResults["task-1"], true);
  const firstStopped = stopWorkOrderTask(started, "task-1", stoppedAt);
  assert.equal(firstStopped.taskResults["task-1"], true);
  assert.equal(firstStopped.taskTimeEntries?.["task-1"].stoppedAt, stoppedAt);
  assert.equal(firstStopped.status, "In progress");
  assert.equal(firstStopped.completedAt, null);
  const secondStarted = startWorkOrderTask(firstStopped, "task-2", actor, stoppedAt);
  const completed = stopWorkOrderTask(secondStarted, "task-2", laterAt);
  assert.equal(completed.status, "Completed");
  assert.equal(completed.completedAt, laterAt);
  assert.equal(completed.updatedAt, laterAt);
  assert.equal(completed.completionMode, "tasks");
  assert.equal(completed.financialStatus, "Open");
  assert.deepEqual(completed.taskResults, { "task-1": true, "task-2": true });
  assert.equal(totalTaskDurationSeconds(completed.taskTimeEntries), 7200);
  assert.deepEqual(order, original);
});

test("elapsed duration survives reload, retains subsecond accuracy, and displays total hours beyond a day", () => {
  const running = startWorkOrderTask(fixture().order, "task-1", actor, startedAt);
  withStorage((setRaw) => {
    setRaw(JSON.stringify([running]));
    const restored = readWorkOrders("timer-refresh")[0];
    const now = Date.parse("2026-10-23T10:03:04.875Z");
    assert.equal(taskDurationSeconds(restored.taskTimeEntries?.["task-1"], now), 93784.875);
    assert.equal(formatWorkOrderDuration(totalTaskDurationSeconds(restored.taskTimeEntries, now)), "26:03:04");
    const completed = stopWorkOrderTask(restored, "task-1", "2026-10-23T10:03:04.875Z");
    assert.equal(taskDurationSeconds(completed.taskTimeEntries?.["task-1"], now + 1_000_000), 93784.875);
    setRaw(JSON.stringify([completed]));
    assert.equal(readWorkOrders("timer-refresh")[0].status, "Completed");
  });
  assert.equal(taskDurationSeconds(undefined), 0);
  assert.equal(totalTaskDurationSeconds(undefined), 0);
  assert.equal(formatWorkOrderDuration(0), "00:00:00");
  assert.equal(formatWorkOrderDuration(3661.999), "01:01:01");
  assert.equal(formatWorkOrderDuration(360000), "100:00:00");
});

test("overlapping tasks sum technician time rather than the wall-clock span", () => {
  const first = startWorkOrderTask(fixture(2).order, "task-1", actor, startedAt);
  const both = startWorkOrderTask(first, "task-2", { id: "technician-b", name: "Technician B" }, startedAt);
  const oneStopped = stopWorkOrderTask(both, "task-1", stoppedAt);
  const completed = stopWorkOrderTask(oneStopped, "task-2", laterAt);
  assert.equal(totalTaskDurationSeconds(completed.taskTimeEntries), 10800);
});

test("repeated starts and stops cannot reset a timer, restart a completed task, or add history", () => {
  const started = startWorkOrderTask(fixture(2).order, "task-1", actor, startedAt);
  const runningSnapshot = structuredClone(started);
  assert.throws(() => startWorkOrderTask(started, "task-1", actor, stoppedAt));
  assert.deepEqual(started, runningSnapshot);
  const stopped = stopWorkOrderTask(started, "task-1", stoppedAt);
  const stoppedSnapshot = structuredClone(stopped);
  assert.throws(() => stopWorkOrderTask(stopped, "task-1", laterAt));
  assert.throws(() => startWorkOrderTask(stopped, "task-1", actor, laterAt));
  assert.deepEqual(stopped, stoppedSnapshot);
});

test("timer actions reject foreign tasks, invalid actors and impossible timestamps", () => {
  const { order } = fixture();
  assert.throws(() => startWorkOrderTask(order, "missing-task", actor, startedAt));
  assert.throws(() => stopWorkOrderTask(order, "task-1", stoppedAt));
  assert.throws(() => startWorkOrderTask(order, "task-1", { id: "", name: "" }, startedAt));
  assert.throws(() => startWorkOrderTask(order, "task-1", actor, "not-a-date"));
  const running = startWorkOrderTask(order, "task-1", actor, startedAt);
  assert.throws(() => stopWorkOrderTask(running, "task-1", "not-a-date"));
  assert.throws(() => stopWorkOrderTask(running, "task-1", createdAt));
  assert.equal(running.taskTimeEntries?.["task-1"].stoppedAt, null);
});

test("no-task orders never auto-complete and keep the manual completion path", () => {
  const { order } = fixture(0);
  const saved = saveWorkOrderWork(order, { ...order, costsReviewed: true }, startedAt);
  assert.equal(saved.status, "Open");
  assert.equal(saved.completedAt, null);
  assert.throws(() => startWorkOrderTask(saved, "missing-task", actor, startedAt));
  const active = changeWorkOrderStatus(saved, "In progress", startedAt);
  const stillActive = saveWorkOrderWork(active, active, stoppedAt);
  assert.equal(stillActive.status, "In progress");
  assert.equal(completeWorkOrder(stillActive, completion(), laterAt).status, "Completed");
});

test("running timers block hold, cancel and manual completion; held work resumes by starting a task", () => {
  const { order } = fixture(2);
  const running = startWorkOrderTask(order, "task-1", actor, startedAt);
  assert.throws(() => changeWorkOrderStatus(running, "On hold", stoppedAt));
  assert.throws(() => changeWorkOrderStatus(running, "Cancelled", stoppedAt));
  assert.throws(() => completeWorkOrder(running, completion(), stoppedAt));
  const stopped = stopWorkOrderTask(running, "task-1", stoppedAt);
  const held = changeWorkOrderStatus(stopped, "On hold", stoppedAt);
  const resumed = startWorkOrderTask(held, "task-2", actor, laterAt);
  assert.equal(resumed.status, "In progress");
  assert.equal(resumed.taskTimeEntries?.["task-2"].startedAt, laterAt);
  const cancelled = changeWorkOrderStatus(held, "Cancelled", laterAt);
  assert.throws(() => startWorkOrderTask(cancelled, "task-2", actor, laterAt));
  assert.throws(() => stopWorkOrderTask(cancelled, "task-1", laterAt));
  const draft = createWorkOrderDraft(emptyWorkOrder(), undefined, null, "Planner", [], createdAt);
  assert.throws(() => startWorkOrderTask(draft, "task-1", actor, startedAt));
});

test("recording a timer locks task identity and asset while preserving unrelated detail edits", () => {
  const { order, input } = fixture(2);
  const running = startWorkOrderTask(order, "task-1", actor, startedAt);
  assert.throws(() => updateWorkOrderDetails(running, { ...input, tasks: [] }));
  assert.throws(() => updateWorkOrderDetails(running, { ...input, tasks: input.tasks.map((row) => ({ ...row, title: "Changed task" })) }));
  const anotherAsset = sampleAssets()[1];
  assert.throws(() => updateWorkOrderDetails(running, { ...input, assetId: anotherAsset.id }, anotherAsset));
  const changed = updateWorkOrderDetails(running, { ...input, title: "Motor repair in progress" }, undefined, undefined, stoppedAt);
  assert.equal(changed.title, "Motor repair in progress");
  assert.deepEqual(changed.taskTimeEntries, running.taskTimeEntries);
});

test("financial saves preserve timer evidence and reject forged timer state", () => {
  const running = startWorkOrderTask(fixture(2).order, "task-1", actor, startedAt);
  const { taskTimeEntries: omitted, ...oldForm } = running;
  assert.ok(omitted);
  const saved = saveWorkOrderWork(running, { ...oldForm, expenses: [{ id: "expense-1", description: "Travel", amount: 100 }] }, stoppedAt);
  assert.deepEqual(saved.taskTimeEntries, running.taskTimeEntries);
  assert.throws(() => saveWorkOrderWork(running, { ...running, taskTimeEntries: {} }, stoppedAt));
  assert.throws(() => saveWorkOrderWork(running, {
    ...running,
    taskTimeEntries: { "task-1": { ...running.taskTimeEntries!["task-1"], stoppedAt } },
    taskResults: { "task-1": true },
  }, stoppedAt));
  assert.throws(() => saveWorkOrderWork(running, { ...running, taskResults: { "task-1": true } }, stoppedAt));
});

test("manual and timer-linked labour combine precisely, and timer links cannot double charge", () => {
  const completed = completedTaskOrder();
  const saved = saveWorkOrderWork(completed, {
    ...completed,
    labour: [
      { id: "manual", technician: "Contractor", hours: 1.5, hourlyRate: 200 },
      { id: "timer", technician: actor.name, taskId: "task-1", hours: 1, hourlyRate: 301.25 },
    ],
    materials: [{ id: "material", name: "Bearing", quantity: 2, unit: "piece", unitCost: 40.25 }],
    expenses: [{ id: "expense", description: "Travel", amount: 10.15, category: "Travel", attachments: [] }],
    scrap: [scrap({ actualRecovery: 5.5, estimatedValue: 1000 })],
  }, laterAt);
  assert.deepEqual(workOrderTotals(saved), {
    labour: 601.25,
    materials: 80.5,
    other: 10.15,
    disposal: 25.75,
    gross: 717.65,
    recovery: 5.5,
    net: 712.15,
  });
  assert.throws(() => saveWorkOrderWork(saved, { ...saved, labour: [...saved.labour, { ...saved.labour[1], id: "duplicate-link" }] }));
  assert.throws(() => saveWorkOrderWork(saved, { ...saved, labour: [{ ...saved.labour[1], taskId: "foreign-task" }] }));
  assert.throws(() => saveWorkOrderWork(saved, { ...saved, labour: [{ ...saved.labour[1], hours: 2 }] }));
  const running = startWorkOrderTask(fixture().order, "task-1", actor, startedAt);
  assert.throws(() => saveWorkOrderWork(running, { ...running, labour: [{ ...saved.labour[1] }] }));
});

test("subsecond task time keeps exact labour hours while totals round only currency", () => {
  const completed = stopWorkOrderTask(
    startWorkOrderTask(fixture().order, "task-1", actor, startedAt),
    "task-1",
    "2026-10-22T08:00:01.500Z",
  );
  const saved = saveWorkOrderWork(completed, {
    ...completed,
    labour: [{ id: "timer", technician: actor.name, taskId: "task-1", hours: 1.5 / 3600, hourlyRate: 3600 }],
  }, stoppedAt);
  assert.equal(saved.labour[0].hours, 1.5 / 3600);
  assert.equal(workOrderTotals(saved).labour, 1.5);
});

test("an immediate stop remains valid evidence and permits zero-hour linked labour only", () => {
  const completed = stopWorkOrderTask(
    startWorkOrderTask(fixture().order, "task-1", actor, startedAt),
    "task-1",
    startedAt,
  );
  assert.equal(completed.status, "Completed");
  assert.equal(totalTaskDurationSeconds(completed.taskTimeEntries), 0);
  const linked = { id: "timer", technician: actor.name, taskId: "task-1", hours: 0, hourlyRate: 300 };
  assert.equal(workOrderTotals(saveWorkOrderWork(completed, { ...completed, labour: [linked] }, stoppedAt)).labour, 0);
  assert.throws(() => saveWorkOrderWork(completed, {
    ...completed,
    labour: [{ id: "manual", technician: actor.name, hours: 0, hourlyRate: 300 }],
  }, stoppedAt));
});

test("task completion leaves costs and closeout editable until financial closure", () => {
  const completed = completedTaskOrder();
  assert.equal(completed.status, "Completed");
  assert.equal(completed.financialStatus, "Open");
  assert.throws(() => setWorkOrderFinancialClosed(completed, true, laterAt));
  const closeout = saveWorkOrderCompletion(completed, completion(), laterAt);
  const reviewed = saveWorkOrderWork(closeout, {
    ...closeout,
    labour: [{ id: "late-labour", technician: actor.name, hours: 1, hourlyRate: 300 }],
    costsReviewed: true,
  }, laterAt);
  assert.equal(reviewed.completedAt, stoppedAt);
  assert.deepEqual(reviewed.taskTimeEntries, completed.taskTimeEntries);
  const closed = setWorkOrderFinancialClosed(reviewed, true, laterAt);
  assert.equal(closed.financialStatus, "Closed");
  assert.throws(() => saveWorkOrderWork(closed, closed, laterAt));
  assert.throws(() => saveWorkOrderCompletion(closed, completion({ notes: "Changed notes" }), laterAt));
  assert.throws(() => startWorkOrderTask(closed, "task-1", actor, laterAt));
  assert.throws(() => stopWorkOrderTask(closed, "task-1", laterAt));
  const reopened = setWorkOrderFinancialClosed(closed, false, laterAt);
  assert.equal(saveWorkOrderWork(reopened, { ...reopened, expenses: [{ id: "late", description: "Late invoice", amount: 50 }] }, laterAt).expenses[0].amount, 50);
  assert.equal(reopened.status, "Completed");
  assert.equal(reopened.completedAt, stoppedAt);
});

test("final task stop completes maintenance before checklist review but financial closure still requires it", () => {
  const completed = completedTaskOrder(true);
  assert.equal(completed.status, "Completed");
  const reviewed = saveWorkOrderWork(completed, { ...completed, costsReviewed: true }, laterAt);
  assert.throws(() => setWorkOrderFinancialClosed(reviewed, true, laterAt));
  const answers = Object.fromEntries(completed.checklist!.items.map((item) => [item.id, { value: "Pass", note: "" }]));
  const answered = saveWorkOrderWork(reviewed, { ...reviewed, answers }, laterAt);
  const closeout = saveWorkOrderCompletion(answered, completion(), laterAt);
  const closed = setWorkOrderFinancialClosed(closeout, true, laterAt);
  assert.equal(closed.financialStatus, "Closed");
  assert.equal(closed.completedAt, stoppedAt);
});

test("scrap approval, disposition and actual recovery gate closure and approval records its reviewer", () => {
  const completed = saveWorkOrderCompletion(completedTaskOrder(), completion(), laterAt);
  const pending = saveWorkOrderWork(completed, {
    ...completed,
    costsReviewed: true,
    scrap: [scrap({ disposition: "Sold", actualRecovery: null, approvalRequired: true })],
  }, laterAt, actor);
  assert.throws(() => setWorkOrderFinancialClosed(pending, true, laterAt));
  const recovered = saveWorkOrderWork(pending, { ...pending, scrap: [{ ...pending.scrap[0], actualRecovery: 50 }] }, laterAt, actor);
  assert.throws(() => setWorkOrderFinancialClosed(recovered, true, laterAt));
  const rejected = saveWorkOrderWork(recovered, { ...recovered, scrap: [{ ...recovered.scrap[0], approvalStatus: "Rejected" }] }, laterAt, actor);
  assert.throws(() => setWorkOrderFinancialClosed(rejected, true, laterAt));
  const approved = saveWorkOrderWork(recovered, { ...recovered, scrap: [{ ...recovered.scrap[0], approvalStatus: "Approved" }] }, laterAt, actor);
  assert.equal(approved.scrap[0].approvalBy, actor.name);
  assert.equal(approved.scrap[0].approvalAt, laterAt);
  assert.throws(() => saveWorkOrderWork(recovered, {
    ...recovered,
    scrap: [{ ...recovered.scrap[0], approvalStatus: "Approved", approvalBy: "Spoofed reviewer", approvalAt: createdAt }],
  }, laterAt));
  const changedAfterApproval = saveWorkOrderWork(approved, {
    ...approved,
    scrap: [{ ...approved.scrap[0], actualRecovery: 75 }],
  }, laterAt, actor);
  assert.equal(changedAfterApproval.scrap[0].approvalStatus, "Pending");
  assert.equal(changedAfterApproval.scrap[0].approvalBy, "");
  assert.equal(changedAfterApproval.scrap[0].approvalAt, null);
  assert.throws(() => setWorkOrderFinancialClosed(changedAfterApproval, true, laterAt));
  const closeout = saveWorkOrderCompletion(approved, completion({ scrapGenerated: "Yes" }), laterAt);
  assert.equal(setWorkOrderFinancialClosed(closeout, true, laterAt).financialStatus, "Closed");
  const awaiting = saveWorkOrderWork(closeout, { ...closeout, scrap: [{ ...closeout.scrap[0], disposition: "Awaiting review" }] }, laterAt, actor);
  assert.throws(() => setWorkOrderFinancialClosed(awaiting, true, laterAt));
});

test("scrap disposal amounts and dates reject invalid values before totals are persisted", () => {
  const { order } = fixture(0);
  for (const disposalCost of [-1, NaN, Infinity, 1_000_000_001]) {
    assert.throws(() => saveWorkOrderWork(order, { ...order, scrap: [scrap({ disposalCost })] }));
  }
  for (const dispositionDate of ["not-a-date", "2026-02-31", "2026-13-01"]) {
    assert.throws(() => saveWorkOrderWork(order, { ...order, scrap: [scrap({ dispositionDate })] }));
  }
});

test("storage rejects malformed or inconsistent timers without replacing the saved payload", () => {
  const running = startWorkOrderTask(fixture().order, "task-1", actor, startedAt);
  const entry = running.taskTimeEntries!["task-1"];
  const corrupt: WorkOrder[] = [
    { ...running, taskTimeEntries: { foreign: entry } },
    { ...running, taskTimeEntries: { "task-1": { ...entry, startedAt: "bad" } } },
    { ...running, taskTimeEntries: { "task-1": { ...entry, stoppedAt: createdAt } } },
    { ...running, taskTimeEntries: { "task-1": { ...entry, performedByName: "" } } },
    { ...running, taskResults: { "task-1": true } },
    { ...running, taskTimeEntries: { "task-1": { ...entry, stoppedAt } }, taskResults: { "task-1": false } },
    { ...running, status: "Cancelled" },
    { ...running, status: "On hold" },
  ];
  withStorage((setRaw, getRaw) => {
    for (const order of corrupt) {
      const raw = JSON.stringify([order]);
      setRaw(raw);
      assert.throws(() => readWorkOrders("corrupt-timer"), /saved data has been kept/);
      assert.equal(getRaw(), raw);
    }
  });
});

test("legacy saved work, manual labour and scrap gain safe defaults without fabricated timer evidence", () => {
  const { order } = fixture(2);
  const legacy = {
    ...order,
    taskResults: { "task-1": true },
    labour: [{ id: "legacy-labour", technician: "Former technician", hours: 2, hourlyRate: 100 }],
    expenses: [{ id: "legacy-expense", description: "Transport", amount: 50 }],
    scrap: [{
      id: "legacy-scrap", name: "Old motor", quantity: 1, unit: "piece",
      reason: "Damaged", location: "Scrap store", disposition: "Stored",
      estimatedValue: 75, actualRecovery: null, attachments: [],
    }],
  } as Record<string, unknown>;
  delete legacy.taskTimeEntries;
  delete legacy.completionMode;
  withStorage((setRaw) => {
    setRaw(JSON.stringify([legacy]));
    const loaded = readWorkOrders("legacy-timer")[0];
    assert.deepEqual(loaded.taskTimeEntries, {});
    assert.deepEqual(loaded.taskResults, { "task-1": true });
    assert.equal(totalTaskDurationSeconds(loaded.taskTimeEntries), 0);
    assert.equal(loaded.labour[0].taskId, undefined);
    assert.equal(loaded.scrap[0].disposalCost, 0);
    assert.equal(loaded.scrap[0].approvalRequired, false);
    assert.equal(workOrderTotals(loaded).gross, 250);
    assert.throws(() => startWorkOrderTask(loaded, "task-1", actor, startedAt));
    assert.equal(startWorkOrderTask(loaded, "task-2", actor, startedAt).status, "In progress");
  });
});

test("legacy completed orders with unfinished optional tasks remain readable and financially closeable", () => {
  const { order } = fixture(2);
  const legacy: Record<string, unknown> = {
    ...order,
    status: "Completed",
    completedAt: stoppedAt,
    updatedAt: stoppedAt,
    completion: completion(),
    taskResults: { "task-1": true },
    costsReviewed: true,
  };
  delete legacy.taskTimeEntries;
  delete legacy.completionMode;
  withStorage((setRaw) => {
    setRaw(JSON.stringify([legacy]));
    const loaded = readWorkOrders("legacy-completed-optional-task")[0];
    assert.equal(loaded.status, "Completed");
    assert.equal(loaded.taskResults["task-2"], undefined);
    assert.deepEqual(loaded.taskTimeEntries, {});
    assert.deepEqual(loaded.completion, completion());
    const closed = setWorkOrderFinancialClosed(loaded, true, laterAt);
    setRaw(JSON.stringify([closed]));
    assert.equal(readWorkOrders("legacy-completed-optional-task")[0].financialStatus, "Closed");
  });
});
