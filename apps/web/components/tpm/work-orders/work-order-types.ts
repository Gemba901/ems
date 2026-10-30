import type {
  InspectionAnswer,
  InspectionItem,
} from "../inspections/inspection-preview";

export const WORK_ORDER_TYPES = [
  "Breakdown",
  "Corrective",
  "Preventive",
] as const;
export const WORK_ORDER_PRIORITIES = [
  "Low",
  "Medium",
  "High",
  "Urgent",
] as const;
export const WORK_ORDER_STATUSES = [
  "Draft",
  "Open",
  "In progress",
  "On hold",
  "Completed",
  "Cancelled",
] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];
export type WorkOrderAttachment = { id: string; name: string; dataUrl: string };
export type WorkOrderTask = {
  id: string;
  title: string;
  description: string;
  estimatedHours: string;
  required: boolean;
};
export type PlannedMaterial = {
  id: string;
  name: string;
  quantity: string;
  unit: string;
  unitCost: string;
};
export type PlannedLabour = {
  id: string;
  technician: string;
  hours: string;
  hourlyRate: string;
};
export const WORK_ORDER_SAFETY_TAGS = [
  "LOTO",
  "PPE required",
  "Hot work",
  "Confined space",
  "Working at height",
  "Electrical work",
] as const;
export type WorkOrderInput = {
  title: string;
  assetId: string;
  type: (typeof WORK_ORDER_TYPES)[number];
  priority: (typeof WORK_ORDER_PRIORITIES)[number];
  description: string;
  assigneeId: string;
  assigneeName: string;
  plannedStart: string;
  dueAt: string;
  estimatedBudget: string;
  checklistId: string;
  attachments: WorkOrderAttachment[];
  departmentId: string;
  departmentName: string;
  team: string;
  estimatedDuration: string;
  tasks: WorkOrderTask[];
  plannedMaterials: PlannedMaterial[];
  plannedLabour: PlannedLabour[];
  safetyTags: string[];
  permitRequired: boolean;
  permitReference: string;
  safetyNotes: string;
  documents: WorkOrderAttachment[];
};
export type LabourEntry = {
  id: string;
  technician: string;
  hours: number;
  hourlyRate: number;
  taskId?: string;
};
export type MaterialEntry = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  unitCost: number;
};
export type ExpenseEntry = {
  id: string;
  description: string;
  amount: number;
  category?: string;
  attachments?: WorkOrderAttachment[];
};
export const SCRAP_DISPOSITIONS = [
  "Awaiting review",
  "Stored",
  "Recycled",
  "Sold",
  "Disposed",
  "Returned to vendor",
  "Reworked",
] as const;
export type ScrapEntry = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  reason: string;
  location: string;
  disposition: (typeof SCRAP_DISPOSITIONS)[number];
  estimatedValue: number | null;
  actualRecovery: number | null;
  attachments: WorkOrderAttachment[];
  rootCause?: string;
  disposalCost?: number;
  dispositionDate?: string;
  approvalRequired?: boolean;
  approvalStatus?: "Pending" | "Approved" | "Rejected";
  approvalBy?: string;
  approvalAt?: string | null;
};
export type WorkOrderTaskTimeEntry = {
  startedAt: string;
  stoppedAt: string | null;
  performedById: string;
  performedByName: string;
};
export type WorkOrderActor = { id: string; name: string };
export type WorkOrderWork = {
  labour: LabourEntry[];
  materials: MaterialEntry[];
  expenses: ExpenseEntry[];
  scrap: ScrapEntry[];
  costsReviewed: boolean;
  answers: Record<string, InspectionAnswer>;
  taskResults: Record<string, boolean>;
  taskTimeEntries?: Record<string, WorkOrderTaskTimeEntry>;
};
export type WorkOrderCompletion = {
  notes: string;
  actualHours: string;
  scrapGenerated: "" | "Yes" | "No";
  attachments: WorkOrderAttachment[];
};
export type WorkOrder = WorkOrderInput &
  WorkOrderWork & {
    id: string;
    code: string;
    status: WorkOrderStatus;
    assetName: string;
    assetCode: string;
    assetLocation: string;
    checklist: { id: string; name: string; items: InspectionItem[] } | null;
    createdAt: string;
    updatedAt: string;
    createdBy: string;
    completedAt: string | null;
    completion: WorkOrderCompletion | null;
    completionMode?: "manual" | "tasks";
    financialStatus: "Open" | "Closed";
    financialClosedAt: string | null;
    history: { id: string; at: string; message: string }[];
  };
export function emptyWorkOrder(): WorkOrderInput {
  return {
    title: "",
    assetId: "",
    type: "Corrective",
    priority: "Medium",
    description: "",
    assigneeId: "",
    assigneeName: "",
    plannedStart: "",
    dueAt: "",
    estimatedBudget: "",
    checklistId: "",
    attachments: [],
    departmentId: "",
    departmentName: "",
    team: "",
    estimatedDuration: "",
    tasks: [],
    plannedMaterials: [],
    plannedLabour: [],
    safetyTags: [],
    permitRequired: false,
    permitReference: "",
    safetyNotes: "",
    documents: [],
  };
}
export function workOrderTotals(order: WorkOrderWork) {
  const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const labour = round(
    order.labour.reduce(
      (sum, row) => sum + round(row.hours * row.hourlyRate),
      0,
    ),
  );
  const materials = round(
    order.materials.reduce(
      (sum, row) => sum + round(row.quantity * row.unitCost),
      0,
    ),
  );
  const other = round(order.expenses.reduce((sum, row) => sum + row.amount, 0));
  const disposal = round(
    order.scrap.reduce((sum, row) => sum + (row.disposalCost ?? 0), 0),
  );
  const recovery = round(
    order.scrap.reduce((sum, row) => sum + (row.actualRecovery ?? 0), 0),
  );
  const gross = round(labour + materials + other + disposal);
  return {
    labour,
    materials,
    other,
    disposal,
    gross,
    recovery,
    net: round(gross - recovery),
  };
}
export function taskDurationSeconds(
  entry: WorkOrderTaskTimeEntry | undefined,
  now = Date.now(),
) {
  if (!entry) return 0;
  const started = new Date(entry.startedAt).getTime();
  const stopped = entry.stoppedAt ? new Date(entry.stoppedAt).getTime() : now;
  return Number.isFinite(started) && Number.isFinite(stopped)
    ? Math.max(0, (stopped - started) / 1000)
    : 0;
}
export function totalTaskDurationSeconds(
  entries: Record<string, WorkOrderTaskTimeEntry> | undefined,
  now = Date.now(),
) {
  return Object.values(entries ?? {}).reduce(
    (total, entry) => total + taskDurationSeconds(entry, now),
    0,
  );
}
export function formatWorkOrderDuration(totalSeconds: number) {
  const seconds = Number.isFinite(totalSeconds)
    ? Math.max(0, Math.floor(totalSeconds))
    : 0;
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}
export const formatWorkOrderMoney = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);
export function isWorkOrderOverdue(order: WorkOrder, now = Date.now()) {
  return (
    order.status !== "Draft" &&
    order.status !== "Completed" &&
    order.status !== "Cancelled" &&
    new Date(order.dueAt).getTime() < now
  );
}

export function plannedWorkOrderTotals(
  input: Pick<WorkOrderInput, "plannedMaterials" | "plannedLabour">,
) {
  const round = (value: number) =>
    Math.round((value + Number.EPSILON) * 100) / 100;
  let pending = false;
  function total(quantity: string, rate: string) {
    if (
      !quantity.trim() ||
      !rate.trim() ||
      !Number.isFinite(Number(quantity)) ||
      !Number.isFinite(Number(rate)) ||
      Number(quantity) <= 0 ||
      Number(rate) < 0
    ) {
      pending = true;
      return 0;
    }
    return round(Number(quantity) * Number(rate));
  }
  const labour = round(
    input.plannedLabour.reduce(
      (sum, row) => sum + total(row.hours, row.hourlyRate),
      0,
    ),
  );
  const materials = round(
    input.plannedMaterials.reduce(
      (sum, row) => sum + total(row.quantity, row.unitCost),
      0,
    ),
  );
  return {
    labour,
    materials,
    total: round(labour + materials),
    pending,
    hasEntries: !!(input.plannedLabour.length || input.plannedMaterials.length),
  };
}
