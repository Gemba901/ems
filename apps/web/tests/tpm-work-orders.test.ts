import test from "node:test";
import assert from "node:assert/strict";
import { sampleAssets } from "../components/tpm/asset-preview";
import { sampleInspectionPreview } from "../components/tpm/inspections/inspection-preview";
import {
  changeWorkOrderStatus,
  completeWorkOrder,
  createWorkOrder,
  createWorkOrderDraft,
  nextWorkOrderCode,
  readWorkOrders,
  releaseWorkOrderDraft,
  saveWorkOrderWork,
  setWorkOrderFinancialClosed,
  updateWorkOrderDetails,
  updateWorkOrderDraft,
  validateWorkOrderInput,
} from "../components/tpm/work-orders/work-order-preview";
import {
  emptyWorkOrder,
  plannedWorkOrderTotals,
  workOrderTotals,
  type WorkOrderCompletion,
  type WorkOrderInput,
  type WorkOrderWork,
} from "../components/tpm/work-orders/work-order-types";

function fixture(withChecklist = false) {
  const asset = sampleAssets()[0];
  const checklist = sampleInspectionPreview().checklists[0];
  const input: WorkOrderInput = {
    ...emptyWorkOrder(),
    title: "Replace worn drive motor",
    assetId: asset.id,
    dueAt: "2026-11-10T17:00",
    plannedStart: "2026-11-09T09:00",
    estimatedBudget: "5000",
    checklistId: withChecklist ? checklist.id : "",
  };
  const order = createWorkOrder(
    input,
    asset,
    withChecklist ? checklist : null,
    "Preview technician",
    [],
    "2026-10-21T09:00:00.000Z",
  );
  return { asset, checklist, input, order };
}
const completion = (
  overrides: Partial<WorkOrderCompletion> = {},
): WorkOrderCompletion => ({
  notes: "Replaced motor and verified operation.",
  actualHours: "2",
  scrapGenerated: "No",
  attachments: [],
  ...overrides,
});
const work = (overrides: Partial<WorkOrderWork> = {}): WorkOrderWork => ({
  labour: [],
  materials: [],
  expenses: [],
  scrap: [],
  costsReviewed: false,
  answers: {},
  taskResults: {},
  ...overrides,
});
const scrap = () => ({
  id: "scrap-1",
  name: "Old motor",
  quantity: 1,
  unit: "piece",
  reason: "Winding damaged",
  location: "Scrap store",
  disposition: "Stored" as const,
  estimatedValue: 700,
  actualRecovery: null,
  attachments: [],
});

test("create allocates a code, normalizes dates and keeps independent asset/checklist snapshots", () => {
  const { order, asset, checklist, input } = fixture(true);
  assert.equal(order.code, "WO-0001");
  assert.equal(order.status, "Open");
  assert.equal(order.costsReviewed, false);
  assert.equal(order.dueAt, new Date(input.dueAt).toISOString());
  const original = structuredClone(order);
  asset.name = "Renamed machine";
  checklist.name = "Updated template";
  checklist.items[0].title = "Changed check";
  assert.deepEqual(order, original);
  assert.equal(
    nextWorkOrderCode([{ code: "WO-0009" }, { code: "WO-0002" }]),
    "WO-0010",
  );
  assert.equal(
    nextWorkOrderCode([{ code: "WO-9007199254740993" }]),
    "WO-9007199254740994",
  );
});

test("create rejects retired/draft/missing assets and unpublished/mismatched checklists", () => {
  const { asset, checklist, input } = fixture(true);
  assert.throws(
    () => createWorkOrder(input, undefined, checklist, "User", []),
    /registered asset/,
  );
  assert.throws(
    () =>
      createWorkOrder(
        input,
        { ...asset, stage: "Draft" },
        checklist,
        "User",
        [],
      ),
    /registered asset/,
  );
  assert.throws(
    () =>
      createWorkOrder(
        input,
        { ...asset, usage: "Retired" },
        checklist,
        "User",
        [],
      ),
    /registered asset/,
  );
  assert.throws(
    () =>
      createWorkOrder(
        input,
        asset,
        { ...checklist, status: "Draft" },
        "User",
        [],
      ),
    /published/,
  );
  assert.throws(
    () =>
      createWorkOrder(
        input,
        asset,
        { ...checklist, id: "another" },
        "User",
        [],
      ),
    /published/,
  );
});

test("form validation catches bad dates, due-before-start, invalid budgets and empty title", () => {
  const { input } = fixture();
  assert.deepEqual(validateWorkOrderInput(input), {});
  assert.ok(validateWorkOrderInput({ ...input, title: "  " }).title);
  assert.ok(
    validateWorkOrderInput({ ...input, dueAt: "2026-02-31T09:00" }).dueAt,
  );
  assert.ok(
    validateWorkOrderInput({ ...input, dueAt: "2026-11-08T09:00" }).dueAt,
  );
  assert.ok(validateWorkOrderInput({ ...input, dueAt: "bad date" }).dueAt);
  for (const budget of ["-1", "NaN", "Infinity", "1000000001"])
    assert.ok(
      validateWorkOrderInput({ ...input, estimatedBudget: budget })
        .estimatedBudget,
    );
  assert.deepEqual(
    validateWorkOrderInput({
      ...input,
      estimatedBudget: "0",
      plannedStart: "",
    }),
    {},
  );
  assert.ok(
    validateWorkOrderInput({ ...input, assigneeId: "person", assigneeName: "" })
      .assigneeId,
  );
});

test("only allowed status transitions work and completion locks maintenance edits", () => {
  const { order, input } = fixture();
  assert.throws(
    () => changeWorkOrderStatus(order, "Completed"),
    /Complete work order/,
  );
  assert.throws(
    () => completeWorkOrder(order, completion()),
    /Start or resume/,
  );
  const active = changeWorkOrderStatus(order, "In progress");
  const held = changeWorkOrderStatus(active, "On hold");
  assert.throws(() => changeWorkOrderStatus(held, "Open"), /Cannot change/);
  const resumed = changeWorkOrderStatus(held, "In progress");
  const completed = completeWorkOrder(resumed, completion());
  assert.equal(completed.status, "Completed");
  assert.ok(completed.completedAt);
  const cancelled = changeWorkOrderStatus(order, "Cancelled");
  assert.throws(
    () => saveWorkOrderWork(cancelled, work()),
    /cannot be changed/,
  );
  assert.equal(saveWorkOrderWork(completed, work()).status, "Completed");
  for (const locked of [completed, cancelled]) {
    assert.throws(
      () => updateWorkOrderDetails(locked, input),
      /cannot be changed/,
    );
    assert.throws(
      () => changeWorkOrderStatus(locked, "In progress"),
      /cannot be changed/,
    );
    assert.throws(
      () => completeWorkOrder(locked, completion()),
      /cannot be changed/,
    );
  }
  assert.equal(order.status, "Open");
});

test("costing uses consumed quantities and actual recovery, while estimates remain separate", () => {
  const { order } = fixture();
  const saved = saveWorkOrderWork(
    order,
    work({
      labour: [
        {
          id: "labour-1",
          technician: "Technician A",
          hours: 2,
          hourlyRate: 300,
        },
      ],
      materials: [
        {
          id: "material-1",
          name: "Motor",
          quantity: 1,
          unit: "piece",
          unitCost: 4000,
        },
      ],
      scrap: [scrap()],
      costsReviewed: true,
    }),
  );
  assert.deepEqual(workOrderTotals(saved), {
    labour: 600,
    materials: 4000,
    other: 0,
    disposal: 0,
    gross: 4600,
    recovery: 0,
    net: 4600,
  });
  assert.equal(saved.scrap[0].estimatedValue, 700);
  assert.equal(saved.scrap[0].actualRecovery, null);
  const recovered = saveWorkOrderWork(saved, {
    ...saved,
    scrap: [{ ...saved.scrap[0], actualRecovery: 500, disposition: "Sold" }],
  });
  assert.equal(workOrderTotals(recovered).net, 4100);
  assert.equal(workOrderTotals(recovered).gross, 4600);
  assert.equal(saveWorkOrderWork(order, work()).costsReviewed, false);
  assert.equal(
    saveWorkOrderWork(order, work({ costsReviewed: true })).costsReviewed,
    true,
  );
});

test("work rejects invalid numbers, missing scrap details, foreign answers and duplicate row IDs", () => {
  const { order } = fixture();
  for (const hours of [0, -1, NaN, Infinity, 1_000_001])
    assert.throws(
      () =>
        saveWorkOrderWork(
          order,
          work({
            labour: [{ id: "a", technician: "Tech", hours, hourlyRate: 300 }],
          }),
        ),
      /Check labour/,
    );
  for (const amount of [-1, NaN, Infinity])
    assert.throws(
      () =>
        saveWorkOrderWork(
          order,
          work({ expenses: [{ id: "e", description: "Repair", amount }] }),
        ),
      /Check expenses/,
    );
  assert.throws(
    () =>
      saveWorkOrderWork(order, work({ scrap: [{ ...scrap(), reason: " " }] })),
    /Check scrap/,
  );
  assert.throws(
    () =>
      saveWorkOrderWork(
        order,
        work({ scrap: [{ ...scrap(), actualRecovery: -1 }] }),
      ),
    /Check scrap/,
  );
  assert.throws(
    () => saveWorkOrderWork(order, work({ scrap: [scrap(), scrap()] })),
    /unique identifier/,
  );
  assert.throws(
    () =>
      saveWorkOrderWork(
        order,
        work({ answers: { unexpected: { value: "Pass", note: "" } } }),
      ),
    /belong to/,
  );
  assert.throws(
    () =>
      saveWorkOrderWork(
        order,
        work({
          labour: [
            {
              id: "large",
              technician: "Tech",
              hours: 1_000_000,
              hourlyRate: 1_000_000_000,
            },
          ],
        }),
      ),
    /quantities and rates/,
  );
});

test("checklist completion requires every required response and notes on findings", () => {
  const { order } = fixture(true);
  const active = changeWorkOrderStatus(order, "In progress");
  assert.throws(
    () => completeWorkOrder(active, completion()),
    /required check/,
  );
  const answers = Object.fromEntries(
    active.checklist!.items.map((item) => [
      item.id,
      { value: "Pass", note: "" },
    ]),
  );
  answers[active.checklist!.items[0].id] = { value: "Fail", note: "" };
  const findings = saveWorkOrderWork(active, work({ answers }));
  assert.throws(
    () => completeWorkOrder(findings, completion()),
    /Describe the issue/,
  );
  answers[active.checklist!.items[0].id].note =
    "Guard damage reported for follow-up.";
  const ready = saveWorkOrderWork(findings, work({ answers }));
  assert.equal(completeWorkOrder(ready, completion()).status, "Completed");
});

test("completion requires explicit scrap confirmation consistent with saved scrap", () => {
  const active = changeWorkOrderStatus(fixture().order, "In progress");
  assert.throws(
    () => completeWorkOrder(active, completion({ scrapGenerated: "" })),
    /Confirm whether/,
  );
  assert.throws(
    () => completeWorkOrder(active, completion({ scrapGenerated: "Yes" })),
    /Add the generated scrap/,
  );
  assert.throws(
    () => completeWorkOrder(active, completion({ notes: "  " })),
    /completion notes/,
  );
  assert.throws(
    () => completeWorkOrder(active, completion({ actualHours: "Infinity" })),
    /Actual hours/,
  );
  const withScrap = saveWorkOrderWork(active, work({ scrap: [scrap()] }));
  assert.throws(
    () => completeWorkOrder(withScrap, completion()),
    /Scrap entries exist/,
  );
  const done = completeWorkOrder(
    withScrap,
    completion({ scrapGenerated: "Yes", actualHours: "" }),
  );
  assert.equal(done.completion?.actualHours, "");
  assert.equal(done.costsReviewed, false);
});

test("detail edits preserve snapshots and cannot move recorded work onto a different asset or checklist", () => {
  const { order, input } = fixture(true);
  const updated = updateWorkOrderDetails(order, {
    ...input,
    title: "Updated repair title",
  });
  assert.deepEqual(updated.checklist, order.checklist);
  assert.equal(updated.assetName, order.assetName);
  const changed = updateWorkOrderDetails(order, { ...input, checklistId: "" });
  assert.equal(changed.checklist, null);
  const answers = {
    [order.checklist!.items[0].id]: { value: "Pass", note: "" },
  };
  const withAnswers = saveWorkOrderWork(order, work({ answers }));
  assert.throws(
    () => updateWorkOrderDetails(withAnswers, { ...input, checklistId: "" }),
    /after answers/,
  );
  const anotherAsset = sampleAssets()[1];
  assert.throws(
    () =>
      updateWorkOrderDetails(
        withAnswers,
        { ...input, assetId: anotherAsset.id },
        anotherAsset,
      ),
    /after work/,
  );
});

test("photos accept limited raster data URLs and reject scripts, remote URLs and oversized input", () => {
  const { input, asset } = fixture();
  const photo = {
    id: "photo-1",
    name: "motor.png",
    dataUrl: "data:image/png;base64,YWJjZA==",
  };
  assert.equal(
    createWorkOrder({ ...input, attachments: [photo] }, asset, null, "User", [])
      .attachments.length,
    1,
  );
  for (const dataUrl of [
    "https://example.com/photo.png",
    "data:image/svg+xml;base64,YWJjZA==",
    "data:application/pdf;base64,YWJjZA==",
    "data:image/png;base64," + "A".repeat(683_000),
  ]) {
    assert.ok(
      validateWorkOrderInput({ ...input, attachments: [{ ...photo, dataUrl }] })
        .attachments,
    );
  }
  assert.ok(
    validateWorkOrderInput({
      ...input,
      attachments: Array.from({ length: 4 }, (_, index) => ({
        ...photo,
        id: String(index),
      })),
    }).attachments,
  );
});

test("storage is scoped, starts empty and fails closed without overwriting corrupt data", () => {
  const descriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
  );
  const saved = new Map<string, string>();
  const key = "gemba:tpm-work-orders-preview:v1:org-a:user-a";
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: (name: string) => saved.get(name) ?? null },
  });
  try {
    assert.deepEqual(readWorkOrders(key), []);
    const order = fixture().order;
    saved.set(key, JSON.stringify([order]));
    assert.equal(readWorkOrders(key)[0].id, order.id);
    const completed = completeWorkOrder(
      changeWorkOrderStatus(order, "In progress"),
      completion(),
    );
    saved.set(key, JSON.stringify([completed]));
    assert.equal(readWorkOrders(key)[0].status, "Completed");
    assert.deepEqual(
      readWorkOrders("gemba:tpm-work-orders-preview:v1:org-b:user-a"),
      [],
    );
    for (const corrupt of [
      "{",
      "",
      "{}",
      JSON.stringify([order, order]),
      JSON.stringify([{ ...order, status: "Completed" }]),
      JSON.stringify([{ ...order, dueAt: "bad" }]),
      JSON.stringify([
        { ...completed, completion: completion({ actualHours: "Infinity" }) },
      ]),
    ]) {
      saved.set(key, corrupt);
      assert.throws(() => readWorkOrders(key), /saved data has been kept/);
      assert.equal(saved.get(key), corrupt);
    }
  } finally {
    if (descriptor)
      Object.defineProperty(globalThis, "localStorage", descriptor);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});

test("drafts accept incomplete plans, retain their code, and validate everything on release", () => {
  const { input, asset, checklist } = fixture(true);
  const draft = createWorkOrderDraft(
    emptyWorkOrder(),
    undefined,
    null,
    "Planner",
    [],
  );
  assert.equal(draft.status, "Draft");
  assert.equal(draft.assetName, "");
  assert.equal(draft.dueAt, "");
  assert.deepEqual(validateWorkOrderInput(emptyWorkOrder(), true), {});
  assert.throws(
    () => releaseWorkOrderDraft(draft, emptyWorkOrder(), undefined, null),
    /title/,
  );
  assert.throws(() => saveWorkOrderWork(draft, work()), /Release this draft/);
  assert.throws(
    () => changeWorkOrderStatus(draft, "In progress"),
    /Cannot change/,
  );
  assert.throws(
    () =>
      createWorkOrderDraft(
        { ...emptyWorkOrder(), dueAt: "2026-02-31T09:00" },
        undefined,
        null,
        "Planner",
        [],
      ),
    /valid due date/,
  );
  assert.throws(
    () =>
      createWorkOrderDraft(
        { ...emptyWorkOrder(), estimatedDuration: "-2" },
        undefined,
        null,
        "Planner",
        [],
      ),
    /estimated duration/,
  );
  const planned = updateWorkOrderDraft(draft, input, asset, checklist);
  assert.equal(planned.code, draft.code);
  assert.equal(planned.checklist?.name, checklist.name);
  assert.throws(
    () =>
      releaseWorkOrderDraft(
        planned,
        input,
        { ...asset, usage: "Retired" },
        checklist,
      ),
    /registered asset/,
  );
  assert.throws(
    () =>
      releaseWorkOrderDraft(planned, input, asset, {
        ...checklist,
        status: "Draft",
      }),
    /published/,
  );
  const released = releaseWorkOrderDraft(planned, input, asset, checklist);
  assert.equal(released.id, draft.id);
  assert.equal(released.code, draft.code);
  assert.equal(released.status, "Open");
  assert.throws(
    () => updateWorkOrderDraft(released, input, asset, checklist),
    /Only a draft/,
  );
  assert.throws(
    () => releaseWorkOrderDraft(released, input, asset, checklist),
    /Only a draft/,
  );
});

test("planning estimates stay separate from actuals and optional rates remain pending", () => {
  const { input, asset } = fixture();
  const plan: WorkOrderInput = {
    ...input,
    departmentId: "maintenance",
    departmentName: "Maintenance",
    team: "Day shift",
    estimatedDuration: "3",
    plannedMaterials: [
      {
        id: "part",
        name: "Drive belt",
        quantity: "2",
        unit: "pieces",
        unitCost: "125.50",
      },
    ],
    plannedLabour: [
      {
        id: "plan-tech",
        technician: "Electrical technician",
        hours: "3",
        hourlyRate: "200",
      },
    ],
    safetyTags: ["LOTO", "PPE required"],
    permitRequired: true,
    permitReference: "Permit pending",
    safetyNotes: "Confirm isolation before work.",
  };
  const saved = createWorkOrder(plan, asset, null, "Planner", []);
  assert.equal(plannedWorkOrderTotals(saved).total, 851);
  assert.equal(workOrderTotals(saved).gross, 0);
  assert.equal(saved.materials.length, 0);
  assert.equal(saved.labour.length, 0);
  assert.deepEqual(saved.safetyTags, plan.safetyTags);
  const pending = {
    ...plan,
    plannedLabour: [{ ...plan.plannedLabour[0], hourlyRate: "" }],
  };
  assert.deepEqual(validateWorkOrderInput(pending), {});
  assert.equal(plannedWorkOrderTotals(pending).pending, true);
  assert.equal(plannedWorkOrderTotals(pending).total, 251);
  assert.ok(
    validateWorkOrderInput({ ...plan, departmentName: "" }).departmentId,
  );
  assert.ok(
    validateWorkOrderInput({
      ...plan,
      plannedLabour: [{ ...plan.plannedLabour[0], hours: "" }],
    }).plannedLabour,
  );
  assert.deepEqual(
    validateWorkOrderInput(
      { ...plan, plannedLabour: [{ ...plan.plannedLabour[0], hours: "" }] },
      true,
    ),
    {},
  );
  assert.ok(
    validateWorkOrderInput(
      {
        ...plan,
        plannedMaterials: [{ ...plan.plannedMaterials[0], unitCost: "-1" }],
      },
      true,
    ).plannedMaterials,
  );
  assert.ok(
    validateWorkOrderInput({
      ...plan,
      plannedMaterials: [
        {
          ...plan.plannedMaterials[0],
          quantity: "1000000",
          unitCost: "1000000",
        },
      ],
    }).plannedMaterials,
  );
  assert.ok(
    validateWorkOrderInput({
      ...plan,
      plannedMaterials: [plan.plannedMaterials[0], plan.plannedMaterials[0]],
    }).plannedMaterials,
  );
});

test("all procedure tasks gate completion and recorded tasks cannot be redefined", () => {
  const { input, asset } = fixture();
  const tasks = [
    {
      id: "isolate",
      title: "Isolate the machine",
      description: "Verify isolation",
      estimatedHours: "0.5",
      required: true,
    },
    {
      id: "clean",
      title: "Clean surrounding area",
      description: "",
      estimatedHours: "",
      required: false,
    },
  ];
  const order = createWorkOrder(
    { ...input, tasks },
    asset,
    null,
    "Planner",
    [],
  );
  const active = changeWorkOrderStatus(order, "In progress");
  assert.throws(
    () => completeWorkOrder(active, completion()),
    /required task: Isolate/,
  );
  assert.throws(
    () => saveWorkOrderWork(active, work({ taskResults: { unrelated: true } })),
    /belong to/,
  );
  const tracked = saveWorkOrderWork(
    active,
    work({ taskResults: { isolate: false } }),
  );
  assert.throws(
    () => updateWorkOrderDetails(tracked, { ...input, tasks: [] }),
    /after progress/,
  );
  const checked = saveWorkOrderWork(
    tracked,
    work({ taskResults: { isolate: true } }),
  );
  assert.throws(
    () => completeWorkOrder(checked, completion()),
    /task: Clean surrounding area/,
  );
  const allChecked = saveWorkOrderWork(
    checked,
    work({ taskResults: { isolate: true, clean: true } }),
  );
  const completed = completeWorkOrder(allChecked, completion());
  assert.equal(completed.status, "Completed");
  assert.throws(
    () =>
      saveWorkOrderWork(completed, work({ taskResults: { isolate: false } })),
    /cannot be changed/,
  );
  assert.deepEqual(
    updateWorkOrderDetails(checked, { ...input, tasks, title: "Updated title" })
      .taskResults,
    { isolate: true },
  );
});

test("financial review remains open after maintenance and late scrap recovery preserves completion", () => {
  const { order } = fixture(true);
  const answers = Object.fromEntries(
    order.checklist!.items.map((item) => [
      item.id,
      { value: "Pass", note: "" },
    ]),
  );
  const active = saveWorkOrderWork(
    changeWorkOrderStatus(order, "In progress"),
    work({ answers }),
  );
  const completed = completeWorkOrder(active, completion());
  assert.equal(completed.financialStatus, "Open");
  assert.equal(completed.completion?.scrapGenerated, "No");
  assert.throws(
    () => setWorkOrderFinancialClosed(active, true),
    /Complete maintenance/,
  );
  assert.throws(
    () => setWorkOrderFinancialClosed(completed, true),
    /Review the labour/,
  );
  assert.throws(
    () => saveWorkOrderWork(completed, work()),
    /cannot be changed/,
  );
  const later = saveWorkOrderWork(completed, {
    ...completed,
    costsReviewed: true,
    scrap: [{ ...scrap(), disposition: "Awaiting review" }],
  });
  assert.equal(later.status, "Completed");
  assert.deepEqual(later.completion, completed.completion);
  assert.equal(later.completedAt, completed.completedAt);
  assert.throws(() => setWorkOrderFinancialClosed(later, true), /disposition/);
  const soldPending = saveWorkOrderWork(later, {
    ...later,
    scrap: [{ ...later.scrap[0], disposition: "Sold" }],
  });
  assert.throws(
    () => setWorkOrderFinancialClosed(soldPending, true),
    /actual recovery/,
  );
  const recovered = saveWorkOrderWork(soldPending, {
    ...soldPending,
    scrap: [{ ...soldPending.scrap[0], actualRecovery: 500 }],
  });
  const closed = setWorkOrderFinancialClosed(
    recovered,
    true,
    "2026-12-01T09:00:00.000Z",
  );
  assert.equal(closed.financialStatus, "Closed");
  assert.equal(closed.financialClosedAt, "2026-12-01T09:00:00.000Z");
  assert.throws(
    () => saveWorkOrderWork(closed, closed),
    /Reopen financial records/,
  );
  const reopened = setWorkOrderFinancialClosed(closed, false);
  assert.equal(reopened.status, "Completed");
  assert.equal(reopened.financialClosedAt, null);
  assert.match(reopened.history[0].message, /reopened/);
  assert.equal(workOrderTotals(reopened).recovery, 500);
});

test("documents accept PDFs and raster images within per-file and total limits", () => {
  const { input, asset } = fixture();
  const pdf = {
    id: "manual",
    name: "Motor manual.pdf",
    dataUrl: "data:application/pdf;base64,JVBERi0xLjc=",
  };
  assert.equal(
    createWorkOrder({ ...input, documents: [pdf] }, asset, null, "Planner", [])
      .documents[0].name,
    pdf.name,
  );
  for (const dataUrl of [
    "https://example.com/file.pdf",
    "data:text/html;base64,PHNjcmlwdD4=",
    "data:image/svg+xml;base64,PHN2Zz4=",
    "data:application/javascript;base64,YWJjZA==",
  ]) {
    assert.ok(
      validateWorkOrderInput({ ...input, documents: [{ ...pdf, dataUrl }] })
        .documents,
    );
  }
  const oneMb =
    "data:application/pdf;base64," + Buffer.alloc(1_048_576).toString("base64");
  assert.deepEqual(
    validateWorkOrderInput({
      ...input,
      documents: [{ ...pdf, dataUrl: oneMb }],
    }),
    {},
  );
  const tooBig =
    "data:application/pdf;base64," + Buffer.alloc(1_048_577).toString("base64");
  assert.ok(
    validateWorkOrderInput({
      ...input,
      documents: [{ ...pdf, dataUrl: tooBig }],
    }).documents,
  );
  assert.ok(
    validateWorkOrderInput({
      ...input,
      documents: Array.from({ length: 4 }, (_, index) => ({
        ...pdf,
        id: String(index),
        dataUrl: oneMb,
      })),
    }).documents,
  );
  assert.ok(
    validateWorkOrderInput({
      ...input,
      documents: Array.from({ length: 6 }, (_, index) => ({
        ...pdf,
        id: String(index),
      })),
    }).documents,
  );
});

test("existing v1 records gain defaults and late financial updates reload without changing completion", () => {
  const descriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
  );
  let raw = "";
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: () => raw },
  });
  try {
    const original = fixture().order;
    const legacy: Record<string, unknown> = { ...original };
    for (const name of [
      "departmentId",
      "departmentName",
      "team",
      "estimatedDuration",
      "tasks",
      "plannedMaterials",
      "plannedLabour",
      "safetyTags",
      "permitRequired",
      "permitReference",
      "safetyNotes",
      "documents",
      "taskResults",
      "financialStatus",
      "financialClosedAt",
    ])
      delete legacy[name];
    raw = JSON.stringify([legacy]);
    const loaded = readWorkOrders("legacy")[0];
    assert.equal(loaded.id, original.id);
    assert.deepEqual(loaded.tasks, []);
    assert.deepEqual(loaded.taskResults, {});
    assert.equal(loaded.financialStatus, "Open");
    assert.equal(loaded.financialClosedAt, null);
    const draft = createWorkOrderDraft(
      emptyWorkOrder(),
      undefined,
      null,
      "Planner",
      [loaded],
    );
    raw = JSON.stringify([draft]);
    assert.equal(readWorkOrders("draft")[0].status, "Draft");
    const completed = completeWorkOrder(
      changeWorkOrderStatus(loaded, "In progress"),
      completion(),
    );
    const later = saveWorkOrderWork(completed, {
      ...completed,
      scrap: [scrap()],
      costsReviewed: true,
    });
    const closed = setWorkOrderFinancialClosed(later, true);
    raw = JSON.stringify([closed]);
    const restored = readWorkOrders("completed")[0];
    assert.equal(restored.scrap.length, 1);
    assert.equal(restored.completion?.scrapGenerated, "No");
    assert.equal(restored.financialStatus, "Closed");
  } finally {
    if (descriptor)
      Object.defineProperty(globalThis, "localStorage", descriptor);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
