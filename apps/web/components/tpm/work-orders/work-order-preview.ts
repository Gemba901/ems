import { z } from "zod";
import type { Asset } from "../asset-preview";
import {
  inspectionPreviewSchema,
  validateChecklist,
  validateInspection,
  type InspectionChecklist,
  type InspectionReport,
} from "../inspections/inspection-preview";
import {
  SCRAP_DISPOSITIONS,
  WORK_ORDER_PRIORITIES,
  WORK_ORDER_SAFETY_TAGS,
  WORK_ORDER_STATUSES,
  WORK_ORDER_TYPES,
  plannedWorkOrderTotals,
  taskDurationSeconds,
  workOrderTotals,
  type WorkOrder,
  type WorkOrderActor,
  type WorkOrderCompletion,
  type WorkOrderInput,
  type WorkOrderStatus,
  type WorkOrderWork,
  type ScrapEntry,
} from "./work-order-types";

const text = z.string().trim().max(200);
const money = z.number().finite().min(0).max(1_000_000_000);
const quantity = z.number().finite().positive().max(1_000_000);
const identifier = z.string().min(1).max(200);
const photo = z.object({
  id: identifier,
  name: text.min(1),
  dataUrl: z
    .string()
    .max(683_000)
    .regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/),
});
const attachments = z
  .array(photo)
  .max(3)
  .refine(
    (rows) => new Set(rows.map((row) => row.id)).size === rows.length,
    "Each photo must have a unique identifier.",
  );
const document = z.object({
  id: identifier,
  name: text.min(1),
  dataUrl: z
    .string()
    .max(1_398_160)
    .regex(
      /^data:(?:application\/pdf|image\/(?:png|jpeg|webp));base64,[A-Za-z0-9+/]+={0,2}$/,
    )
    .refine(
      (value) => documentBytes(value) <= 1_048_576,
      "Each document must be 1 MB or smaller.",
    ),
});
function documentBytes(value: string) {
  const encoded = value.slice(value.indexOf(",") + 1);
  return (
    (encoded.length * 3) / 4 -
    (encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0)
  );
}
const documents = z
  .array(document)
  .max(5)
  .refine(
    (rows) => new Set(rows.map((row) => row.id)).size === rows.length,
    "Each document must have a unique identifier.",
  )
  .refine(
    (rows) =>
      rows.reduce((total, row) => total + documentBytes(row.dataUrl), 0) <=
      3 * 1_048_576,
    "Documents must total no more than 3 MB.",
  );
const numericText = z.string().trim().max(40);
const tasks = z
  .array(
    z.object({
      id: identifier,
      title: text,
      description: z.string().trim().max(4000),
      estimatedHours: numericText,
      required: z.boolean(),
    }),
  )
  .max(200);
const plannedMaterials = z
  .array(
    z.object({
      id: identifier,
      name: text,
      quantity: numericText,
      unit: text,
      unitCost: numericText,
    }),
  )
  .max(200);
const plannedLabour = z
  .array(
    z.object({
      id: identifier,
      technician: text,
      hours: numericText,
      hourlyRate: numericText,
    }),
  )
  .max(200);
const inputSchema = z.object({
  title: text,
  assetId: z.string().max(200),
  type: z.enum(WORK_ORDER_TYPES),
  priority: z.enum(WORK_ORDER_PRIORITIES),
  description: z.string().trim().max(4000),
  assigneeId: z.string().max(200),
  assigneeName: text,
  plannedStart: z.string().max(40),
  dueAt: z.string().max(40),
  estimatedBudget: z.string().trim().max(40),
  checklistId: z.string().max(200),
  attachments,
  departmentId: z.string().max(200).default(""),
  departmentName: text.default(""),
  team: text.default(""),
  estimatedDuration: numericText.default(""),
  tasks: tasks.default([]),
  plannedMaterials: plannedMaterials.default([]),
  plannedLabour: plannedLabour.default([]),
  safetyTags: z
    .array(z.enum(WORK_ORDER_SAFETY_TAGS))
    .max(WORK_ORDER_SAFETY_TAGS.length)
    .refine(
      (tags) => new Set(tags).size === tags.length,
      "Safety tags must be unique.",
    )
    .default([]),
  permitRequired: z.boolean().default(false),
  permitReference: text.default(""),
  safetyNotes: z.string().trim().max(4000).default(""),
  documents: documents.default([]),
});
const workSchema = z.object({
  labour: z
    .array(
      z.object({
        id: identifier,
        technician: text.min(1),
        hours: z.number().finite().min(0).max(1_000_000),
        hourlyRate: money,
        taskId: identifier.optional(),
      }),
    )
    .max(200),
  materials: z
    .array(
      z.object({
        id: identifier,
        name: text.min(1),
        quantity,
        unit: text.min(1),
        unitCost: money,
      }),
    )
    .max(200),
  expenses: z
    .array(
      z.object({
        id: identifier,
        description: text.min(1),
        amount: money,
        category: text.default(""),
        attachments: documents.default([]),
      }),
    )
    .max(200),
  scrap: z
    .array(
      z.object({
        id: identifier,
        name: text.min(1),
        quantity,
        unit: text.min(1),
        reason: z.string().trim().min(1).max(1000),
        location: text.min(1),
        disposition: z.enum(SCRAP_DISPOSITIONS),
        estimatedValue: money.nullable(),
        actualRecovery: money.nullable(),
        attachments,
        rootCause: z.string().trim().max(1000).default(""),
        disposalCost: money.default(0),
        dispositionDate: z.string().max(40).default(""),
        approvalRequired: z.boolean().default(false),
        approvalStatus: z.enum(["Pending", "Approved", "Rejected"]).default("Pending"),
        approvalBy: text.default(""),
        approvalAt: z.string().datetime().nullable().default(null),
      }),
    )
    .max(200),
  costsReviewed: z.boolean(),
  answers: z.record(
    z.string(),
    z.object({
      value: z.string().trim().max(4000),
      note: z.string().trim().max(4000),
    }),
  ),
  taskResults: z.record(z.string(), z.boolean()).default({}),
  taskTimeEntries: z.record(
    identifier,
    z.object({
      startedAt: z.string().datetime(),
      stoppedAt: z.string().datetime().nullable(),
      performedById: identifier,
      performedByName: text.min(1),
    }),
  ).default({}),
});
const completionSchema = z.object({
  notes: z.string().trim().min(1).max(4000),
  actualHours: z.string().trim().max(40),
  scrapGenerated: z.enum(["Yes", "No"]),
  attachments,
});
const checklistSchema = inspectionPreviewSchema.shape.checklists.element;
export const workOrderSchema = inputSchema.extend({
  ...workSchema.shape,
  id: identifier,
  code: text.min(1),
  status: z.enum(WORK_ORDER_STATUSES),
  assetName: text,
  assetCode: text,
  assetLocation: text,
  checklist: z
    .object({
      id: identifier,
      name: text.min(1),
      items: checklistSchema.shape.items,
    })
    .nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  createdBy: text,
  completedAt: z.string().datetime().nullable(),
  completion: completionSchema.nullable(),
  completionMode: z.enum(["manual", "tasks"]).default("manual"),
  financialStatus: z.enum(["Open", "Closed"]).default("Open"),
  financialClosedAt: z.string().datetime().nullable().default(null),
  history: z.array(
    z.object({
      id: identifier,
      at: z.string().datetime(),
      message: z.string().max(1000),
    }),
  ),
});

function validDate(value: string) {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?$/.exec(
      value,
    );
  if (!match || !Number.isFinite(new Date(value).getTime())) return false;
  const [, year, month, day, hour, minute] = match.map(Number);
  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= new Date(Date.UTC(year, month, 0)).getUTCDate() &&
    hour <= 23 &&
    minute <= 59
  );
}

export function validateWorkOrderInput(
  input: WorkOrderInput,
  draft = false,
): Record<string, string> {
  const errors: Record<string, string> = {};
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]);
      errors[key] =
        key === "attachments"
          ? "Add up to 3 PNG, JPEG or WebP photos, each up to 500 KB."
          : key === "documents"
            ? "Add up to 5 PDF, PNG, JPEG or WebP documents, each up to 1 MB and 3 MB in total."
            : `Check ${key === "assetId" ? "the asset" : key === "title" ? "the title (1–200 characters)" : key} before saving.`;
    }
  }
  if (!draft && !input.title.trim()) errors.title = "Enter a work order title.";
  if (!draft && !input.assetId) errors.assetId = "Choose an asset.";
  if ((!draft || input.dueAt) && !validDate(input.dueAt))
    errors.dueAt = "Choose a valid due date and time.";
  if (input.plannedStart && !validDate(input.plannedStart))
    errors.plannedStart = "Choose a valid planned start date and time.";
  if (
    validDate(input.dueAt) &&
    validDate(input.plannedStart) &&
    new Date(input.plannedStart) > new Date(input.dueAt)
  )
    errors.dueAt = "Due date must be on or after the planned start.";
  const budget = input.estimatedBudget.trim();
  if (
    budget &&
    (!Number.isFinite(Number(budget)) ||
      Number(budget) < 0 ||
      Number(budget) > 1_000_000_000)
  )
    errors.estimatedBudget =
      "Enter an estimated budget between 0 and 1,000,000,000.";
  if (!!input.assigneeId !== !!input.assigneeName.trim())
    errors.assigneeId =
      "Choose a valid assignee or leave the work order unassigned.";
  if (!!input.departmentId !== !!input.departmentName.trim())
    errors.departmentId = "Choose a valid department or leave it unassigned.";
  const validNumber = (value: string, positive = false) => {
    const number = Number(value);
    return (
      Number.isFinite(number) &&
      (positive
        ? number > 0 && number <= 1_000_000
        : number >= 0 && number <= 1_000_000_000)
    );
  };
  if (
    input.estimatedDuration.trim() &&
    !validNumber(input.estimatedDuration, true)
  )
    errors.estimatedDuration =
      "Enter an estimated duration greater than 0 and up to 1,000,000 hours.";
  for (const [name, rows] of Object.entries({
    tasks: input.tasks,
    plannedMaterials: input.plannedMaterials,
    plannedLabour: input.plannedLabour,
  })) {
    if (new Set(rows.map((row) => row.id)).size !== rows.length)
      errors[name] = "Each row must have a unique identifier.";
  }
  for (const [index, task] of input.tasks.entries()) {
    if (!draft && !task.title.trim())
      errors.tasks = `Enter a title for task ${index + 1}.`;
    if (task.estimatedHours.trim() && !validNumber(task.estimatedHours, true))
      errors.tasks = `Enter valid estimated hours for task ${index + 1}.`;
  }
  for (const [index, row] of input.plannedMaterials.entries()) {
    if (
      !draft &&
      (!row.name.trim() || !row.unit.trim() || !row.quantity.trim())
    )
      errors.plannedMaterials = `Complete the name, quantity and unit for planned material ${index + 1}.`;
    if (row.quantity.trim() && !validNumber(row.quantity, true))
      errors.plannedMaterials = `Enter a positive quantity for planned material ${index + 1}.`;
    if (row.unitCost.trim() && !validNumber(row.unitCost))
      errors.plannedMaterials = `Enter a non-negative unit cost for planned material ${index + 1}.`;
  }
  for (const [index, row] of input.plannedLabour.entries()) {
    if (!draft && (!row.technician.trim() || !row.hours.trim()))
      errors.plannedLabour = `Complete the person or role and hours for planned labour ${index + 1}.`;
    if (row.hours.trim() && !validNumber(row.hours, true))
      errors.plannedLabour = `Enter positive hours for planned labour ${index + 1}.`;
    if (row.hourlyRate.trim() && !validNumber(row.hourlyRate))
      errors.plannedLabour = `Enter a non-negative hourly rate for planned labour ${index + 1}.`;
  }
  const plannedTotals = plannedWorkOrderTotals(input);
  if (
    !Number.isFinite(plannedTotals.total) ||
    plannedTotals.total > 1_000_000_000
  ) {
    errors.plannedMaterials =
      "Keep the combined planned materials and labour estimate within 1,000,000,000.";
    errors.plannedLabour = errors.plannedMaterials;
  }
  return errors;
}

function cleanInput(input: WorkOrderInput, draft = false): WorkOrderInput {
  const errors = validateWorkOrderInput(input, draft);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  const clean = inputSchema.parse(input);
  return {
    ...clean,
    dueAt: clean.dueAt ? new Date(clean.dueAt).toISOString() : "",
    plannedStart: clean.plannedStart
      ? new Date(clean.plannedStart).toISOString()
      : "",
  };
}

export function nextWorkOrderCode(orders: readonly Pick<WorkOrder, "code">[]) {
  let highest = BigInt(0);
  for (const order of orders) {
    const match = /^WO-(\d+)$/i.exec(order.code);
    if (match && BigInt(match[1]) > highest) highest = BigInt(match[1]);
  }
  return `WO-${(highest + BigInt(1)).toString().padStart(4, "0")}`;
}

function snapshotAsset(input: WorkOrderInput, asset?: Asset) {
  if (
    !asset ||
    input.assetId !== asset.id ||
    asset.stage !== "Registered" ||
    asset.usage === "Retired"
  )
    throw new Error("Choose a registered asset that has not been retired.");
  return {
    assetName: asset.name,
    assetCode: asset.code,
    assetLocation: asset.location,
  };
}
function snapshotChecklist(
  input: WorkOrderInput,
  checklist?: InspectionChecklist | null,
): WorkOrder["checklist"] {
  if (!input.checklistId) return null;
  if (
    !checklist ||
    input.checklistId !== checklist.id ||
    checklist.status !== "Published"
  )
    throw new Error("Choose a published inspection checklist.");
  const errors = validateChecklist(checklist);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  return {
    id: checklist.id,
    name: checklist.name,
    items: checklist.items.map((item) => ({ ...item })),
  };
}
function event(message: string, at: string) {
  return { id: crypto.randomUUID(), at, message };
}
function editable(order: WorkOrder) {
  if (order.status === "Completed" || order.status === "Cancelled")
    throw new Error(`${order.status} work orders cannot be changed.`);
}

export function createWorkOrder(
  input: WorkOrderInput,
  asset: Asset | undefined,
  checklist: InspectionChecklist | null | undefined,
  createdBy: string,
  orders: WorkOrder[],
  now = new Date().toISOString(),
): WorkOrder {
  const clean = cleanInput(input);
  return newWorkOrder(clean, asset, checklist, createdBy, orders, "Open", now);
}

function newWorkOrder(
  input: WorkOrderInput,
  asset: Asset | undefined,
  checklist: InspectionChecklist | null | undefined,
  createdBy: string,
  orders: WorkOrder[],
  status: "Draft" | "Open",
  now: string,
): WorkOrder {
  return workOrderSchema.parse({
    ...input,
    ...(input.assetId
      ? snapshotAsset(input, asset)
      : { assetName: "", assetCode: "", assetLocation: "" }),
    checklist: snapshotChecklist(input, checklist),
    id: crypto.randomUUID(),
    code: nextWorkOrderCode(orders),
    status,
    createdBy,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    completion: null,
    labour: [],
    materials: [],
    expenses: [],
    scrap: [],
    costsReviewed: false,
    answers: {},
    taskResults: {},
    financialStatus: "Open",
    financialClosedAt: null,
    history: [
      event(
        status === "Draft" ? "Work order draft saved." : "Work order created.",
        now,
      ),
    ],
  });
}

export function createWorkOrderDraft(
  input: WorkOrderInput,
  asset: Asset | undefined,
  checklist: InspectionChecklist | null | undefined,
  createdBy: string,
  orders: WorkOrder[],
  now = new Date().toISOString(),
): WorkOrder {
  return newWorkOrder(
    cleanInput(input, true),
    asset,
    checklist,
    createdBy,
    orders,
    "Draft",
    now,
  );
}

export function updateWorkOrderDraft(
  order: WorkOrder,
  input: WorkOrderInput,
  asset: Asset | undefined,
  checklist: InspectionChecklist | null | undefined,
  now = new Date().toISOString(),
): WorkOrder {
  if (order.status !== "Draft")
    throw new Error("Only a draft can be saved as a draft.");
  const clean = cleanInput(input, true);
  return workOrderSchema.parse({
    ...order,
    ...clean,
    ...(clean.assetId
      ? snapshotAsset(clean, asset)
      : { assetName: "", assetCode: "", assetLocation: "" }),
    checklist: snapshotChecklist(clean, checklist),
    updatedAt: now,
    history: [event("Work order draft updated.", now), ...order.history],
  });
}

export function releaseWorkOrderDraft(
  order: WorkOrder,
  input: WorkOrderInput,
  asset: Asset | undefined,
  checklist: InspectionChecklist | null | undefined,
  now = new Date().toISOString(),
): WorkOrder {
  if (order.status !== "Draft")
    throw new Error("Only a draft can be released.");
  const clean = cleanInput(input);
  return workOrderSchema.parse({
    ...order,
    ...clean,
    ...snapshotAsset(clean, asset),
    checklist: snapshotChecklist(clean, checklist),
    status: "Open",
    updatedAt: now,
    history: [
      event("Draft reviewed and released as an open work order.", now),
      ...order.history,
    ],
  });
}

export function hasWorkOrderAnswers(order: WorkOrder) {
  return Object.values(order.answers).some(
    (answer) => answer.value.trim() || answer.note.trim(),
  );
}
export function hasRecordedWork(order: WorkOrder) {
  return !!(
    order.labour.length ||
    order.materials.length ||
    order.expenses.length ||
    order.scrap.length ||
    Object.keys(order.taskResults).length ||
    Object.keys(order.taskTimeEntries ?? {}).length ||
    hasWorkOrderAnswers(order)
  );
}

export function updateWorkOrderDetails(
  order: WorkOrder,
  input: WorkOrderInput,
  asset?: Asset,
  checklist?: InspectionChecklist | null,
  now = new Date().toISOString(),
): WorkOrder {
  editable(order);
  if (order.status === "Draft")
    throw new Error("Use Save draft or review and release this draft.");
  const clean = cleanInput(input);
  const assetChanged = clean.assetId !== order.assetId;
  const checklistChanged = clean.checklistId !== order.checklistId;
  if (assetChanged && hasRecordedWork(order))
    throw new Error("Keep the selected asset after work has been recorded.");
  if (checklistChanged && hasWorkOrderAnswers(order))
    throw new Error(
      "Keep the selected checklist after answers have been recorded.",
    );
  if (
    (Object.keys(order.taskResults).length ||
      Object.keys(order.taskTimeEntries ?? {}).length) &&
    JSON.stringify(clean.tasks) !== JSON.stringify(order.tasks)
  )
    throw new Error("Keep the work tasks after progress has been recorded.");
  return workOrderSchema.parse({
    ...order,
    ...clean,
    ...(assetChanged ? snapshotAsset(clean, asset) : {}),
    checklist: checklistChanged
      ? snapshotChecklist(clean, checklist)
      : order.checklist,
    answers: checklistChanged ? {} : order.answers,
    updatedAt: now,
    history: [event("Work order details updated.", now), ...order.history],
  });
}

function inspectionAdapter(
  order: WorkOrder,
  answers = order.answers,
): InspectionReport {
  return {
    id: order.id,
    code: order.code,
    checklistId: order.checklistId,
    checklistName: order.checklist?.name ?? "",
    checklistCode: "",
    checklistVersion: 1,
    kind: "PM",
    frequency: "Daily",
    assetId: order.assetId,
    assetName: order.assetName,
    assetCode: order.assetCode,
    assetLocation: order.assetLocation,
    inspectorName: order.assigneeName,
    inspectorUserId: "",
    inspectorRole: "",
    inspectionDate: "",
    startedAt: order.createdAt,
    updatedAt: order.updatedAt,
    completedAt: order.completedAt,
    status: "In progress",
    items: order.checklist?.items ?? [],
    answers,
    notes: "",
  };
}

function checkWork(order: WorkOrder, work: WorkOrderWork): WorkOrderWork {
  const parsed = workSchema.safeParse(work);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(
      `Check ${issue.path.join(" / ")}: use valid names, positive hours/quantities and non-negative amounts. Photos: up to 3 PNG, JPEG or WebP files of 500 KB each.`,
    );
  }
  for (const [name, rows] of Object.entries({
    labour: parsed.data.labour,
    materials: parsed.data.materials,
    expenses: parsed.data.expenses,
    scrap: parsed.data.scrap,
  })) {
    if (new Set(rows.map((row) => row.id)).size !== rows.length)
      throw new Error(`Each ${name} entry must have a unique identifier.`);
  }
  const totals = workOrderTotals(parsed.data);
  if (totals.gross > 1_000_000_000_000 || totals.recovery > 1_000_000_000_000)
    throw new Error(
      "Check the quantities and rates: work order amounts must stay within 1,000,000,000,000.",
    );
  const ids = new Set(order.checklist?.items.map((item) => item.id) ?? []);
  if (Object.keys(parsed.data.answers).some((id) => !ids.has(id)))
    throw new Error("Answers must belong to this work order's checklist.");
  const taskIds = new Set(order.tasks.map((task) => task.id));
  if (Object.keys(parsed.data.taskResults).some((id) => !taskIds.has(id)))
    throw new Error("Task progress must belong to this work order's tasks.");
  for (const [taskId, entry] of Object.entries(parsed.data.taskTimeEntries)) {
    if (!taskIds.has(taskId))
      throw new Error("Task timing must belong to this work order's tasks.");
    const startedAt = new Date(entry.startedAt).getTime();
    const stoppedAt = entry.stoppedAt ? new Date(entry.stoppedAt).getTime() : null;
    const updatedAt = new Date(order.updatedAt).getTime();
    if (startedAt < new Date(order.createdAt).getTime() ||
      (stoppedAt !== null && stoppedAt < startedAt))
      throw new Error("Task stop time must be on or after its start time.");
    if (startedAt > updatedAt || (stoppedAt !== null && stoppedAt > updatedAt))
      throw new Error("Task timestamps cannot be later than the saved work order update.");
    if (entry.stoppedAt === null && order.status !== "In progress")
      throw new Error("Running task timers require an in-progress work order.");
    if (Boolean(parsed.data.taskResults[taskId]) !== Boolean(entry.stoppedAt))
      throw new Error("Use Start and Stop to change a timed task's progress.");
  }
  const linkedTasks = new Set<string>();
  for (const row of parsed.data.labour) {
    if (!row.taskId) {
      if (row.hours <= 0) throw new Error("Check labour: manual hours must be positive.");
      continue;
    }
    const entry = parsed.data.taskTimeEntries[row.taskId];
    if (!taskIds.has(row.taskId) || !entry?.stoppedAt)
      throw new Error("Link labour only to a completed task timer.");
    if (linkedTasks.has(row.taskId))
      throw new Error("Each completed task timer can be linked to labour once.");
    linkedTasks.add(row.taskId);
    if (row.hours !== taskDurationSeconds(entry) / 3600 ||
      row.technician !== entry.performedByName)
      throw new Error("Timer-linked labour must keep the recorded technician and exact task hours.");
  }
  for (const row of parsed.data.scrap) {
    if (row.dispositionDate && !validScrapDate(row.dispositionDate))
      throw new Error("Choose a valid scrap disposition date.");
    if (row.approvalStatus === "Pending" && (row.approvalBy || row.approvalAt))
      throw new Error("Pending scrap approval cannot have an approval audit record.");
    if (row.approvalStatus !== "Pending" && (!row.approvalBy || !row.approvalAt))
      throw new Error("Scrap approval requires the reviewer's name and review date.");
  }
  const errors = validateInspection(
    inspectionAdapter(order, parsed.data.answers),
  );
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  return parsed.data;
}

function validScrapDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
  return validDate(value);
}

function checkedActor(actor: WorkOrderActor | undefined) {
  const parsed = z.object({ id: identifier, name: text.min(1) }).safeParse(actor);
  if (!parsed.success) throw new Error("Sign in with a valid user before recording this action.");
  return parsed.data;
}

export function scrapReviewDetailsChanged(previous: ScrapEntry, row: ScrapEntry) {
  const details = (entry: ScrapEntry) => JSON.stringify({
    name: entry.name, quantity: entry.quantity, unit: entry.unit,
    reason: entry.reason, location: entry.location, disposition: entry.disposition,
    estimatedValue: entry.estimatedValue, actualRecovery: entry.actualRecovery,
    rootCause: entry.rootCause ?? "", disposalCost: entry.disposalCost ?? 0,
    dispositionDate: entry.dispositionDate ?? "", attachments: entry.attachments,
    approvalRequired: entry.approvalRequired ?? false,
  });
  return details(previous) !== details(row);
}

function reviewScrap(
  order: WorkOrder,
  work: WorkOrderWork,
  actor: WorkOrderActor | undefined,
  now: string,
) {
  return work.scrap.map((row) => {
    const previous = order.scrap.find((entry) => entry.id === row.id);
    const status = row.approvalStatus ?? "Pending";
    const priorStatus = previous?.approvalStatus ?? "Pending";
    if (previous && priorStatus !== "Pending" && scrapReviewDetailsChanged(previous, row))
      return { ...row, approvalStatus: "Pending" as const, approvalBy: "", approvalAt: null };
    if (status !== priorStatus && status !== "Pending") {
      const reviewer = checkedActor(actor);
      return { ...row, approvalBy: reviewer.name, approvalAt: now };
    }
    if (status === "Pending")
      return { ...row, approvalBy: "", approvalAt: null };
    if ((row.approvalBy ?? "") !== (previous?.approvalBy ?? "") ||
      (row.approvalAt ?? null) !== (previous?.approvalAt ?? null))
      throw new Error("Keep the recorded scrap approval reviewer and date.");
    return row;
  });
}

export function saveWorkOrderWork(
  order: WorkOrder,
  work: WorkOrderWork,
  now = new Date().toISOString(),
  actor?: WorkOrderActor,
): WorkOrder {
  if (order.status === "Cancelled")
    throw new Error("Cancelled work orders cannot be changed.");
  if (order.status === "Draft")
    throw new Error("Release this draft before recording work or costs.");
  if (order.financialStatus === "Closed")
    throw new Error("Reopen financial records before changing costs or scrap.");
  if (work.taskTimeEntries &&
    !sameRecord(work.taskTimeEntries, order.taskTimeEntries ?? {}))
    throw new Error("Use Start and Stop to record task timing.");
  const clean = checkWork(order, {
    ...work,
    taskTimeEntries: order.taskTimeEntries ?? {},
    scrap: reviewScrap(order, work, actor, now),
  });
  if (
    order.status === "Completed" &&
    ((order.completionMode !== "tasks" && !sameRecord(clean.answers, order.answers)) ||
      !sameRecord(clean.taskResults, order.taskResults))
  )
    throw new Error(
      "Completed maintenance tasks and checklist responses cannot be changed.",
    );
  return workOrderSchema.parse({
    ...order,
    ...clean,
    updatedAt: now,
    history: [
      event(
        order.status === "Completed"
          ? "Closeout and financial records updated after maintenance completion."
          : "Work, costs and scrap records saved.",
        now,
      ),
      ...order.history,
    ],
  });
}

function sameRecord(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
) {
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(right, key) &&
        JSON.stringify(left[key]) === JSON.stringify(right[key]),
    )
  );
}

function validateFinancialClosure(order: WorkOrder) {
  if (order.status !== "Completed")
    throw new Error("Complete maintenance before closing financial records.");
  if (!order.completion)
    throw new Error("Save completion notes and the scrap declaration before closing financial records.");
  checkedCompletion(order, order.completion, {
    compareCurrentScrap: false,
    requireAllTasks: order.completionMode === "tasks",
  });
  if (!order.costsReviewed)
    throw new Error(
      "Review the labour, materials and costs before closing financial records.",
    );
  if (order.scrap.some((row) => row.disposition === "Awaiting review"))
    throw new Error(
      "Review the disposition of all scrap before closing financial records.",
    );
  if (
    order.scrap.some(
      (row) => row.disposition === "Sold" && row.actualRecovery === null,
    )
  )
    throw new Error(
      "Record actual recovery for sold scrap before closing financial records.",
    );
  if (order.scrap.some((row) => row.approvalRequired && row.approvalStatus !== "Approved"))
    throw new Error("Approve all scrap requiring review before closing financial records.");
}

export function financialClosureError(order: WorkOrder): string {
  try {
    validateFinancialClosure(order);
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : "Review financial records before closing.";
  }
}

export function setWorkOrderFinancialClosed(
  order: WorkOrder,
  closed: boolean,
  now = new Date().toISOString(),
): WorkOrder {
  if (order.status !== "Completed")
    throw new Error("Complete maintenance before changing financial closure.");
  if ((order.financialStatus === "Closed") === closed)
    throw new Error(
      `Financial records are already ${closed ? "closed" : "open"}.`,
    );
  if (closed) validateFinancialClosure(order);
  return workOrderSchema.parse({
    ...order,
    financialStatus: closed ? "Closed" : "Open",
    financialClosedAt: closed ? now : null,
    updatedAt: now,
    history: [
      event(
        closed
          ? "Financial records closed after cost and scrap review."
          : "Financial records reopened for corrections. Maintenance remains completed.",
        now,
      ),
      ...order.history,
    ],
  });
}

const transitions: Record<WorkOrderStatus, readonly WorkOrderStatus[]> = {
  Draft: [],
  Open: ["In progress", "On hold", "Cancelled"],
  "In progress": ["On hold", "Cancelled"],
  "On hold": ["In progress", "Cancelled"],
  Completed: [],
  Cancelled: [],
};
export function changeWorkOrderStatus(
  order: WorkOrder,
  status: WorkOrderStatus,
  now = new Date().toISOString(),
): WorkOrder {
  editable(order);
  if ((status === "On hold" || status === "Cancelled") && hasRunningTask(order))
    throw new Error("Stop running task timers before putting work on hold or cancelling it.");
  if (!transitions[order.status].includes(status))
    throw new Error(
      status === "Completed"
        ? "Use Complete work order to record completion details."
        : `Cannot change ${order.status} to ${status}.`,
    );
  return workOrderSchema.parse({
    ...order,
    status,
    updatedAt: now,
    history: [event(`Status changed to ${status}.`, now), ...order.history],
  });
}

function hasRunningTask(order: WorkOrder) {
  return Object.values(order.taskTimeEntries ?? {}).some((entry) => entry.stoppedAt === null);
}

export function startWorkOrderTask(
  order: WorkOrder,
  taskId: string,
  actor: WorkOrderActor,
  now = new Date().toISOString(),
): WorkOrder {
  editable(order);
  if (order.status === "Draft")
    throw new Error("Release this draft before starting a task.");
  const task = order.tasks.find((entry) => entry.id === taskId);
  if (!task) throw new Error("Choose a task belonging to this work order.");
  if (order.taskResults[taskId] || order.taskTimeEntries?.[taskId])
    throw new Error("This task has already started or completed.");
  const performer = checkedActor(actor);
  const saved = workOrderSchema.parse({
    ...order,
    status: "In progress",
    taskTimeEntries: {
      ...order.taskTimeEntries,
      [taskId]: {
        startedAt: now,
        stoppedAt: null,
        performedById: performer.id,
        performedByName: performer.name,
      },
    },
    costsReviewed: false,
    updatedAt: now,
    history: [event(`Task started: ${task.title}. Performed by ${performer.name}.`, now), ...order.history],
  });
  checkWork(saved, saved);
  return saved;
}

export function stopWorkOrderTask(
  order: WorkOrder,
  taskId: string,
  now = new Date().toISOString(),
): WorkOrder {
  editable(order);
  if (order.status !== "In progress")
    throw new Error("Start or resume work before stopping a task.");
  const task = order.tasks.find((entry) => entry.id === taskId);
  const timer = order.taskTimeEntries?.[taskId];
  if (!task || !timer) throw new Error("Start this task before stopping it.");
  if (timer.stoppedAt !== null || order.taskResults[taskId])
    throw new Error("This task has already stopped and completed.");
  if (new Date(now).getTime() < new Date(timer.startedAt).getTime())
    throw new Error("Task stop time must be on or after its start time.");
  const taskResults = { ...order.taskResults, [taskId]: true };
  const completed = order.tasks.length > 0 && order.tasks.every((entry) => taskResults[entry.id]);
  const saved = workOrderSchema.parse({
    ...order,
    status: completed ? "Completed" : "In progress",
    taskResults,
    taskTimeEntries: { ...order.taskTimeEntries, [taskId]: { ...timer, stoppedAt: now } },
    completionMode: completed ? "tasks" : order.completionMode,
    completedAt: completed ? now : null,
    completion: null,
    financialStatus: "Open",
    financialClosedAt: null,
    costsReviewed: false,
    updatedAt: now,
    history: [
      ...(completed ? [event("All tasks completed. Maintenance completed automatically; financial records remain open.", now)] : []),
      event(`Task stopped and completed: ${task.title}.`, now),
      ...order.history,
    ],
  });
  checkWork(saved, saved);
  return saved;
}

function checkedCompletion(
  order: WorkOrder,
  completion: WorkOrderCompletion,
  { compareCurrentScrap = true, requireAllTasks = true, requireChecklist = true }:
    { compareCurrentScrap?: boolean; requireAllTasks?: boolean; requireChecklist?: boolean } = {},
) {
  const parsed = completionSchema.safeParse(completion);
  if (!parsed.success) {
    const field = parsed.error.issues[0].path[0];
    throw new Error(
      field === "notes"
        ? "Enter completion notes (up to 4,000 characters)."
        : field === "scrapGenerated"
          ? "Confirm whether scrap was generated."
          : "Check completion photos: up to 3 PNG, JPEG or WebP photos of 500 KB each.",
    );
  }
  const hours = parsed.data.actualHours;
  if (
    hours &&
    (!Number.isFinite(Number(hours)) ||
      Number(hours) < 0 ||
      Number(hours) > 1_000_000)
  )
    throw new Error("Actual hours must be between 0 and 1,000,000.");
  checkWork(order, order);
  const errors = validateInspection(inspectionAdapter(order), requireChecklist);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  const unfinished = order.tasks.find(
    (task) => (requireAllTasks || task.required) && !order.taskResults[task.id],
  );
  if (unfinished)
    throw new Error(`Complete the ${unfinished.required ? "required " : ""}task: ${unfinished.title}.`);
  if (
    compareCurrentScrap &&
    parsed.data.scrapGenerated === "Yes" &&
    !order.scrap.length
  )
    throw new Error(
      "Add the generated scrap in the Scrap section before completing.",
    );
  if (
    compareCurrentScrap &&
    parsed.data.scrapGenerated === "No" &&
    order.scrap.length
  )
    throw new Error(
      "Scrap entries exist. Select Yes or correct the scrap records.",
    );
  return parsed.data;
}

export function completeWorkOrder(
  order: WorkOrder,
  completion: WorkOrderCompletion,
  now = new Date().toISOString(),
): WorkOrder {
  editable(order);
  if (order.status !== "In progress")
    throw new Error("Start or resume work before completing this work order.");
  if (hasRunningTask(order))
    throw new Error("Stop running task timers before completing this work order.");
  const clean = checkedCompletion(order, completion);
  return workOrderSchema.parse({
    ...order,
    status: "Completed",
    completion: clean,
    completionMode: "manual",
    completedAt: now,
    updatedAt: now,
    history: [event("Work order completed.", now), ...order.history],
  });
}

export function saveWorkOrderCompletion(
  order: WorkOrder,
  completion: WorkOrderCompletion,
  now = new Date().toISOString(),
): WorkOrder {
  if (order.status !== "Completed" || order.completionMode !== "tasks")
    throw new Error("Only completion details for automatically completed tasks can be updated.");
  if (order.financialStatus === "Closed")
    throw new Error("Reopen financial records before updating completion details.");
  const clean = checkedCompletion(order, completion, { requireChecklist: false });
  return workOrderSchema.parse({
    ...order,
    completion: clean,
    updatedAt: now,
    history: [event("Completion notes and scrap declaration saved after all tasks completed.", now), ...order.history],
  });
}

export function readWorkOrders(key: string): WorkOrder[] {
  let raw: string | null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    throw new Error(
      "Allow browser storage to read your saved work order preview.",
    );
  }
  if (raw === null) return [];
  try {
    const orders = z.array(workOrderSchema).parse(JSON.parse(raw));
    if (
      new Set(orders.map((order) => order.id)).size !== orders.length ||
      new Set(orders.map((order) => order.code.toUpperCase())).size !==
        orders.length
    )
      throw new Error("Duplicate work orders.");
    for (const order of orders) {
      if (
        Object.keys(validateWorkOrderInput(order, order.status === "Draft"))
          .length
      )
        throw new Error("Invalid details.");
      if (
        (order.assetId && (!order.assetName || !order.assetCode)) ||
        (!order.assetId &&
          (order.assetName || order.assetCode || order.assetLocation))
      )
        throw new Error("Invalid asset snapshot.");
      if (order.checklistId !== (order.checklist?.id ?? ""))
        throw new Error("Invalid checklist snapshot.");
      if (
        order.checklist &&
        new Set(order.checklist.items.map((item) => item.id)).size !==
          order.checklist.items.length
      )
        throw new Error("Duplicate checklist items.");
      checkWork(order, order);
      if (
        order.status === "Draft" &&
        (hasRecordedWork(order) || order.costsReviewed)
      )
        throw new Error("Unexpected work on a draft.");
      if (
        order.status === "Completed" &&
        (!order.completedAt || (order.completionMode !== "tasks" && !order.completion))
      )
        throw new Error("Incomplete completion record.");
      if (order.completionMode === "tasks" &&
        (order.status !== "Completed" || !order.tasks.length ||
          !Object.keys(order.taskTimeEntries ?? {}).length ||
          order.tasks.some((task) => !order.taskResults[task.id])))
        throw new Error("Incomplete automatic task completion record.");
      if (order.completionMode === "tasks" && order.completedAt &&
        Math.max(...Object.values(order.taskTimeEntries ?? {}).map((entry) =>
          new Date(entry.stoppedAt ?? entry.startedAt).getTime())) !== new Date(order.completedAt).getTime())
        throw new Error("Automatic completion must retain the final task stop time.");
      if (order.status === "Completed" && order.completion)
        // Scrap may be discovered or disposed after maintenance is complete.
        // The completion response is a historical snapshot, not today's balance.
        checkedCompletion(order, order.completion, {
          compareCurrentScrap: false,
          requireAllTasks: order.completionMode === "tasks",
          requireChecklist: order.completionMode !== "tasks",
        });
      if (
        order.status !== "Completed" &&
        (order.completedAt || order.completion)
      )
        throw new Error("Unexpected completion record.");
      if (order.financialStatus === "Closed") {
        validateFinancialClosure(order);
        if (!order.financialClosedAt)
          throw new Error("Missing financial closure date.");
      } else if (order.financialClosedAt)
        throw new Error("Unexpected financial closure date.");
    }
    return orders;
  } catch {
    throw new Error(
      "This browser's work order preview could not be read. Your saved data has been kept; restore a valid copy and try again.",
    );
  }
}
