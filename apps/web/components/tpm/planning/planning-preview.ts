import { z } from "zod";
import type { Asset } from "../asset-preview";
import {
  INSPECTION_FREQUENCIES,
  inspectionItemHasIssue,
  inspectionPreviewSchema,
  inspectionToday,
  isValidInspectionDate,
  validateChecklist,
  validateInspection,
  type InspectionChecklist,
  type InspectionReport,
} from "../inspections/inspection-preview";
import {
  WORK_ORDER_PRIORITIES,
  totalTaskDurationSeconds,
  type WorkOrder,
} from "../work-orders/work-order-types";

export const PLAN_FREQUENCIES = INSPECTION_FREQUENCIES;
export const PLAN_STATUSES = ["Draft", "Active", "Paused", "Archived"] as const;
const DAY_MS = 86_400_000;
const MAX_GENERATED = 2_000;
const checklistSchema = inspectionPreviewSchema.shape.checklists.element;
const validTimeZones = new Map<string, boolean>();
const wallClockFormatters = new Map<string, Intl.DateTimeFormat>();
const validZone = (value: string) => {
  const cached = validTimeZones.get(value);
  if (cached !== undefined) return cached;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format(0);
    validTimeZones.set(value, !!value);
    return !!value;
  } catch {
    validTimeZones.set(value, false);
    return false;
  }
};
const dateSchema = z
  .string()
  .refine(isValidInspectionDate, "Enter a valid date.");
const optionalDateSchema = z
  .string()
  .refine(
    (value) => !value || isValidInspectionDate(value),
    "Enter a valid date.",
  );
const taskSchema = z.object({
  id: z.string().min(1).max(200),
  title: z.string().max(300),
  description: z.string().max(2_000),
  estimatedHours: z.string().max(40),
  required: z.boolean(),
});
const planInputSchema = z.object({
  name: z.string().max(200),
  kind: z.enum(["AM", "PM"]),
  assetIds: z.array(z.string().min(1).max(200)).max(50),
  frequency: z.enum(PLAN_FREQUENCIES),
  startDate: optionalDateSchema,
  endDate: optionalDateSchema,
  dueTime: z
    .string()
    .refine(
      (value) => !value || /^([01]\d|2[0-3]):[0-5]\d$/.test(value),
      "Enter a valid time.",
    ),
  dueWindowDays: z.number().int().min(0).max(30),
  timeZone: z.string().refine(validZone, "Choose a valid time zone."),
  checklistId: z.string().max(200),
  tasks: z.array(taskSchema).max(50),
  assigneeId: z.string().max(200),
  assigneeName: z.string().max(200),
  team: z.string().max(200),
  estimatedMinutes: z.number().positive().max(525_600),
  manpower: z.number().int().positive().max(1_000),
  priority: z.enum(WORK_ORDER_PRIORITIES),
  excludedWeekdays: z.array(z.number().int().min(0).max(6)).max(7),
  excludedDates: z.array(dateSchema).max(366),
  notes: z.string().max(4_000),
});
export type PlanInput = z.infer<typeof planInputSchema>;
const assetSnapshotSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  code: z.string().min(1),
  location: z.string(),
});
const planSchema = planInputSchema.extend({
  id: z.string().min(1),
  code: z.string().min(1),
  status: z.enum(PLAN_STATUSES),
  assetSnapshots: z.array(assetSnapshotSchema).max(50),
  checklist: checklistSchema.nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type MaintenancePlan = z.infer<typeof planSchema>;
export type Plan = MaintenancePlan;
const occurrenceSchema = z.object({
  id: z.string().min(1),
  planId: z.string().min(1),
  planCode: z.string().min(1),
  planName: z.string().min(1).max(200),
  assetId: z.string().min(1),
  assetName: z.string().min(1),
  assetCode: z.string().min(1),
  assetLocation: z.string(),
  kind: z.enum(["AM", "PM"]),
  scheduledDate: dateSchema,
  scheduledAt: z.string().datetime(),
  dueAt: z.string().datetime(),
  plannedMinutes: z.number().positive().max(525_600),
  manpower: z.number().int().positive().max(1_000),
  state: z.enum(["Scheduled", "Skipped"]),
  skipReason: z.string().max(1_000),
  executionId: z.string().min(1).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  checklist: checklistSchema.nullable(),
  tasks: z.array(taskSchema).max(50),
  assigneeId: z.string().max(200),
  assigneeName: z.string().max(200),
  team: z.string().max(200),
  priority: z.enum(WORK_ORDER_PRIORITIES),
  notes: z.string().max(4_000),
  timeZone: z.string().refine(validZone),
});
export type PlanOccurrence = z.infer<typeof occurrenceSchema>;
export type PlanningData = {
  plans: MaintenancePlan[];
  occurrences: PlanOccurrence[];
};

const identity = (
  row: Pick<PlanOccurrence, "planId" | "assetId" | "scheduledDate">,
) => JSON.stringify([row.planId, row.assetId, row.scheduledDate]);

export const planningSchema = z
  .object({
    plans: z.array(planSchema).max(500),
    occurrences: z.array(occurrenceSchema).max(20_000),
  })
  .superRefine((data, ctx) => {
    const fail = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: "custom", path, message });
    const plans = new Set<string>();
    const codes = new Set<string>();
    data.plans.forEach((plan, index) => {
      if (plans.has(plan.id) || codes.has(plan.code))
        fail(["plans", index], "Duplicate maintenance plan.");
      plans.add(plan.id);
      codes.add(plan.code);
      for (const [field, message] of Object.entries(
        validatePlanInput(
          plan,
          plan.status === "Draft" || plan.status === "Archived",
        ),
      ))
        fail(["plans", index, field], message);
      if (
        (plan.status === "Active" || plan.status === "Paused") &&
        (plan.assetSnapshots.length !== plan.assetIds.length ||
          plan.assetIds.some(
            (id) => !plan.assetSnapshots.some((asset) => asset.id === id),
          ))
      )
        fail(
          ["plans", index, "assetSnapshots"],
          "Plan asset snapshots are incomplete.",
        );
      if (
        (plan.checklist?.id ?? "") !== plan.checklistId ||
        (plan.checklist && plan.checklist.kind !== plan.kind)
      )
        fail(
          ["plans", index, "checklist"],
          "Plan checklist snapshot does not match.",
        );
      if (
        (plan.status === "Active" || plan.status === "Paused") &&
        plan.checklist &&
        (plan.checklist.status !== "Published" ||
          Object.keys(validateChecklist(plan.checklist)).length)
      )
        fail(
          ["plans", index, "checklist"],
          "Plan requires a valid published checklist snapshot.",
        );
    });
    const ids = new Set<string>();
    const keys = new Set<string>();
    const linkedExecutions = new Set<string>();
    data.occurrences.forEach((occurrence, index) => {
      const key = identity(occurrence);
      if (ids.has(occurrence.id) || keys.has(key))
        fail(["occurrences", index], "Duplicate scheduled job.");
      ids.add(occurrence.id);
      keys.add(key);
      if (!plans.has(occurrence.planId))
        fail(["occurrences", index, "planId"], "Scheduled job has no plan.");
      if (Date.parse(occurrence.dueAt) < Date.parse(occurrence.scheduledAt))
        fail(
          ["occurrences", index, "dueAt"],
          "Deadline precedes the scheduled date.",
        );
      if (
        isValidInspectionDate(occurrence.scheduledDate) &&
        validZone(occurrence.timeZone)
      ) {
        try {
          if (
            planningDateTime(
              occurrence.scheduledDate,
              "00:00",
              occurrence.timeZone,
            ) !== occurrence.scheduledAt
          )
            fail(
              ["occurrences", index, "scheduledAt"],
              "Scheduled timestamp does not match its date and time zone.",
            );
        } catch {
          fail(
            ["occurrences", index, "scheduledAt"],
            "Scheduled date does not exist in its time zone.",
          );
        }
      }
      if (occurrence.kind === "AM" && !occurrence.checklist)
        fail(
          ["occurrences", index, "checklist"],
          "AM job needs a checklist snapshot.",
        );
      if (occurrence.checklist && occurrence.checklist.kind !== occurrence.kind)
        fail(
          ["occurrences", index, "checklist"],
          "Checklist kind does not match the job.",
        );
      if (
        occurrence.checklist &&
        (occurrence.checklist.status !== "Published" ||
          Object.keys(validateChecklist(occurrence.checklist)).length)
      )
        fail(
          ["occurrences", index, "checklist"],
          "Scheduled job requires a valid published checklist snapshot.",
        );
      if (occurrence.kind === "PM" && !occurrence.tasks.length)
        fail(
          ["occurrences", index, "tasks"],
          "PM job needs maintenance tasks.",
        );
      if (
        new Set(occurrence.tasks.map((task) => task.id)).size !==
          occurrence.tasks.length ||
        occurrence.tasks.some(
          (task) =>
            !task.title.trim() ||
            (task.estimatedHours.trim() &&
              (!Number.isFinite(Number(task.estimatedHours)) ||
                Number(task.estimatedHours) <= 0 ||
                Number(task.estimatedHours) > 1_000_000)),
        )
      )
        fail(
          ["occurrences", index, "tasks"],
          "Job tasks must have unique IDs, titles and valid estimated hours.",
        );
      if (
        occurrence.state === "Skipped" &&
        (!occurrence.skipReason.trim() || occurrence.executionId)
      )
        fail(
          ["occurrences", index, "state"],
          "Skipped jobs need a reason and cannot have an execution.",
        );
      if (occurrence.executionId) {
        const execution = `${occurrence.kind}:${occurrence.executionId}`;
        if (linkedExecutions.has(execution))
          fail(
            ["occurrences", index, "executionId"],
            "Execution is already linked to another job.",
          );
        linkedExecutions.add(execution);
      }
    });
  });

export function emptyPlan(timeZone = "Asia/Kolkata"): PlanInput {
  return {
    name: "",
    kind: "PM",
    assetIds: [],
    frequency: "Monthly",
    startDate: "",
    endDate: "",
    dueTime: "17:00",
    dueWindowDays: 0,
    timeZone,
    checklistId: "",
    tasks: [],
    assigneeId: "",
    assigneeName: "",
    team: "",
    estimatedMinutes: 30,
    manpower: 1,
    priority: "Medium",
    excludedWeekdays: [],
    excludedDates: [],
    notes: "",
  };
}

export function validatePlanInput(
  input: PlanInput,
  draft = false,
): Record<string, string> {
  const errors: Record<string, string> = {};
  const parsed = planInputSchema.safeParse(input);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "plan");
      errors[field] ??= issue.message;
    }
    return errors;
  }
  if (!draft) {
    if (!input.name.trim()) errors.name = "Enter a maintenance plan name.";
    if (!input.assetIds.length)
      errors.assetIds = "Select at least one registered asset.";
    if (!input.startDate) errors.startDate = "Choose the first scheduled date.";
    if (!input.dueTime) errors.dueTime = "Choose a deadline time.";
    if (input.kind === "AM" && !input.checklistId)
      errors.checklistId = "Select a published AM checklist.";
    if (input.kind === "PM" && !input.tasks.length)
      errors.tasks = "Add at least one maintenance task.";
    if (new Set(input.excludedWeekdays).size === 7)
      errors.excludedWeekdays = "Leave at least one working day in the week.";
  }
  if (input.endDate && !input.startDate)
    errors.startDate = "Choose a start date before setting an end date.";
  if (input.startDate && input.endDate && input.endDate < input.startDate)
    errors.endDate = "End date must be on or after the start date.";
  if (new Set(input.assetIds).size !== input.assetIds.length)
    errors.assetIds = "Select each asset only once.";
  if (new Set(input.excludedDates).size !== input.excludedDates.length)
    errors.excludedDates = "Add each excluded date only once.";
  if (new Set(input.excludedWeekdays).size !== input.excludedWeekdays.length)
    errors.excludedWeekdays = "Select each weekday only once.";
  if (!!input.assigneeId.trim() !== !!input.assigneeName.trim())
    errors.assigneeId = "Choose a member with both an ID and name.";
  if (new Set(input.tasks.map((task) => task.id)).size !== input.tasks.length)
    errors.tasks = "Each maintenance task must have a unique ID.";
  for (const task of input.tasks) {
    if (!draft && !task.title.trim()) errors.tasks = "Give every task a title.";
    if (
      task.estimatedHours.trim() &&
      (!Number.isFinite(Number(task.estimatedHours)) ||
        Number(task.estimatedHours) <= 0 ||
        Number(task.estimatedHours) > 1_000_000)
    )
      errors.tasks =
        "Task estimated hours must be greater than 0 and no more than 1,000,000.";
  }
  if (input.startDate && input.dueTime) {
    try {
      planningDateTime(
        addPlanningDays(input.startDate, input.dueWindowDays),
        input.dueTime,
        input.timeZone,
      );
    } catch {
      errors.dueTime =
        "This time does not exist on that date in the selected time zone.";
    }
  }
  return errors;
}

function normalizedInput(input: PlanInput): PlanInput {
  return planInputSchema.parse({
    ...input,
    name: input.name.trim(),
    assigneeId: input.assigneeId.trim(),
    assigneeName: input.assigneeName.trim(),
    team: input.team.trim(),
    notes: input.notes.trim(),
    tasks: input.tasks.map((task) => ({
      ...task,
      title: task.title.trim(),
      description: task.description.trim(),
      estimatedHours: task.estimatedHours.trim(),
    })),
  });
}

function preparePlan(
  input: PlanInput,
  assets: Asset[],
  checklists: InspectionChecklist[],
  status: MaintenancePlan["status"],
) {
  const errors = validatePlanInput(input, status === "Draft");
  const selected = input.assetIds.map((id) =>
    assets.find((asset) => asset.id === id),
  );
  if (
    status !== "Draft" &&
    selected.some(
      (asset) =>
        !asset || asset.stage !== "Registered" || asset.usage === "Retired",
    )
  )
    errors.assetIds = "Select registered assets that have not been retired.";
  const checklist =
    checklists.find((row) => row.id === input.checklistId) ?? null;
  if (input.checklistId && (!checklist || checklist.kind !== input.kind))
    errors.checklistId = `Select an available ${input.kind} checklist.`;
  if (
    status !== "Draft" &&
    checklist &&
    (checklist.status !== "Published" ||
      Object.keys(validateChecklist(checklist)).length)
  )
    errors.checklistId = "Select a valid published checklist.";
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  return {
    ...normalizedInput(input),
    assetSnapshots: selected
      .filter((asset): asset is Asset => !!asset)
      .map((asset) => ({
        id: asset.id,
        name: asset.name,
        code: asset.code,
        location: asset.location,
      })),
    checklist: checklist ? structuredClone(checklist) : null,
  };
}

export function createPlan(
  input: PlanInput,
  assets: Asset[],
  checklists: InspectionChecklist[],
  existingPlans: MaintenancePlan[],
  status: MaintenancePlan["status"] = "Draft",
  now = new Date().toISOString(),
): MaintenancePlan {
  if (existingPlans.length >= 500)
    throw new Error("This preview supports up to 500 maintenance plans.");
  if (status !== "Draft" && status !== "Active")
    throw new Error("New plans must be Draft or Active.");
  let highest = BigInt(0);
  for (const plan of existingPlans) {
    const match = /^PMP-(\d+)$/.exec(plan.code);
    if (match && BigInt(match[1]) > highest) highest = BigInt(match[1]);
  }
  return planSchema.parse({
    ...preparePlan(input, assets, checklists, status),
    id: crypto.randomUUID(),
    code: `PMP-${(highest + BigInt(1)).toString().padStart(4, "0")}`,
    status,
    createdAt: now,
    updatedAt: now,
  });
}

function validateTransition(
  current: MaintenancePlan["status"],
  next: MaintenancePlan["status"],
) {
  if (current === "Archived")
    throw new Error("Archived plans cannot be changed.");
  if (current !== "Draft" && next === "Draft")
    throw new Error("An activated plan cannot return to Draft.");
  if (current === "Draft" && next === "Paused")
    throw new Error("Activate the plan before pausing it.");
}

export function updatePlan(
  current: MaintenancePlan,
  input: PlanInput,
  assets: Asset[],
  checklists: InspectionChecklist[],
  status: MaintenancePlan["status"] = current.status,
  now = new Date().toISOString(),
): MaintenancePlan {
  validateTransition(current.status, status);
  return planSchema.parse({
    ...current,
    ...preparePlan(input, assets, checklists, status),
    status,
    updatedAt: now,
  });
}

export function setPlanStatus(
  current: MaintenancePlan,
  status: MaintenancePlan["status"],
  now = new Date().toISOString(),
): MaintenancePlan {
  validateTransition(current.status, status);
  if (status === "Active" && current.status !== "Active")
    throw new Error(
      "Use updatePlan to activate a plan with current assets and checklists.",
    );
  return planSchema.parse({ ...current, status, updatedAt: now });
}

export function planningToday(timeZone: string, now = new Date()): string {
  if (!validZone(timeZone)) throw new Error("Choose a valid time zone.");
  return inspectionToday(timeZone, now);
}

export function addPlanningDays(date: string, days: number): string {
  if (!isValidInspectionDate(date) || !Number.isInteger(days))
    throw new Error("Enter a valid date and whole number of days.");
  const result = new Date(
    new Date(`${date}T00:00:00.000Z`).getTime() + days * DAY_MS,
  )
    .toISOString()
    .slice(0, 10);
  if (!isValidInspectionDate(result))
    throw new Error("Date is outside the supported range.");
  return result;
}

/** Interpret a wall-clock deadline in its plan's zone, never the browser's zone. */
export function planningDateTime(
  date: string,
  time: string,
  timeZone: string,
): string {
  if (
    !isValidInspectionDate(date) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) ||
    !validZone(timeZone)
  )
    throw new Error("Enter a valid date, time and time zone.");
  let formatter = wallClockFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    wallClockFormatters.set(timeZone, formatter);
  }
  const desired = Date.parse(`${date}T${time}:00.000Z`);
  let candidate = desired;
  for (let attempt = 0; attempt < 6; attempt++) {
    const parts = formatter.formatToParts(candidate);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((item) => item.type === type)?.value ?? "";
    const wall = `${part("year").padStart(4, "0")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}:00.000Z`;
    const difference = desired - Date.parse(wall);
    if (difference === 0) return new Date(candidate).toISOString();
    candidate += difference;
  }
  throw new Error("This local time does not exist in the selected time zone.");
}

function occursOn(
  plan: Pick<PlanInput, "frequency" | "startDate">,
  date: string,
): boolean {
  const days =
    (Date.parse(`${date}T00:00:00Z`) -
      Date.parse(`${plan.startDate}T00:00:00Z`)) /
    DAY_MS;
  if (days < 0) return false;
  if (plan.frequency === "Daily") return true;
  if (plan.frequency === "Weekly") return days % 7 === 0;
  const monthsPerOccurrence = {
    Monthly: 1,
    Quarterly: 3,
    "Half-yearly": 6,
    Yearly: 12,
  }[plan.frequency];
  const [anchorYear, anchorMonth, anchorDay] = plan.startDate
    .split("-")
    .map(Number);
  const [year, month, day] = date.split("-").map(Number);
  const months = (year - anchorYear) * 12 + month - anchorMonth;
  if (months < 0 || months % monthsPerOccurrence !== 0) return false;
  const monthStart = new Date(`${date.slice(0, 7)}-01T00:00:00.000Z`);
  monthStart.setUTCMonth(monthStart.getUTCMonth() + 1);
  monthStart.setUTCDate(0);
  return day === Math.min(anchorDay, monthStart.getUTCDate());
}

function exclusionReason(
  input: Pick<PlanInput, "excludedDates" | "excludedWeekdays">,
  date: string,
): string {
  return input.excludedDates.includes(date)
    ? "Excluded date"
    : input.excludedWeekdays.includes(new Date(`${date}T00:00:00Z`).getUTCDay())
      ? "Weekly off"
      : "";
}

export function previewPlanDates(
  input: PlanInput,
  limit = 6,
): { date: string; state: "Scheduled" | "Skipped"; reason: string }[] {
  const parsed = planInputSchema.safeParse(input);
  if (
    !parsed.success ||
    !input.startDate ||
    (input.endDate && input.endDate < input.startDate)
  )
    return [];
  const count = Math.min(12, Math.max(0, Math.floor(limit)));
  if (!Number.isFinite(count) || !count) return [];
  const output: {
    date: string;
    state: "Scheduled" | "Skipped";
    reason: string;
  }[] = [];
  // Preview only: at most twelve yearly dates, without creating execution records.
  for (let offset = 0; offset <= 366 * count; offset++) {
    let date: string;
    try {
      date = addPlanningDays(input.startDate, offset);
    } catch {
      break;
    }
    if (input.endDate && date > input.endDate) break;
    if (!occursOn(input, date)) continue;
    const reason = exclusionReason(input, date);
    output.push({ date, state: reason ? "Skipped" : "Scheduled", reason });
    if (output.length >= count) break;
  }
  return output;
}

/** Return new immutable job snapshots only; callers persist them atomically. */
export function buildOccurrences(
  plan: MaintenancePlan,
  fromDate: string,
  toDate: string,
  existing: PlanOccurrence[],
  now = new Date().toISOString(),
): PlanOccurrence[] {
  if (
    !isValidInspectionDate(fromDate) ||
    !isValidInspectionDate(toDate) ||
    toDate < fromDate
  )
    throw new Error("Choose a valid generation date range.");
  if (
    (Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) /
      DAY_MS >=
    366
  )
    throw new Error("Generate no more than 366 days at a time.");
  if (plan.status !== "Active") return [];
  const errors = validatePlanInput(plan);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  if (
    plan.assetSnapshots.length !== plan.assetIds.length ||
    plan.assetIds.some(
      (id) => !plan.assetSnapshots.some((asset) => asset.id === id),
    )
  )
    throw new Error("Plan asset snapshots are incomplete.");
  if (plan.kind === "AM" && !plan.checklist)
    throw new Error("AM plans need a checklist snapshot.");
  const keys = new Set(existing.map(identity));
  const output: PlanOccurrence[] = [];
  const first = fromDate > plan.startDate ? fromDate : plan.startDate;
  const last = plan.endDate && plan.endDate < toDate ? plan.endDate : toDate;
  for (let date = first; date <= last; date = addPlanningDays(date, 1)) {
    if (!occursOn(plan, date)) continue;
    const skipReason = exclusionReason(plan, date);
    const scheduledAt = planningDateTime(date, "00:00", plan.timeZone);
    const dueAt = planningDateTime(
      addPlanningDays(date, plan.dueWindowDays),
      plan.dueTime,
      plan.timeZone,
    );
    for (const asset of plan.assetSnapshots) {
      const key = identity({
        planId: plan.id,
        assetId: asset.id,
        scheduledDate: date,
      });
      if (keys.has(key)) continue;
      if (output.length >= MAX_GENERATED)
        throw new Error(
          "This range creates more than 2,000 jobs. Choose fewer assets or a shorter range.",
        );
      output.push(
        occurrenceSchema.parse({
          id: `pm-occ:${encodeURIComponent(plan.id)}:${encodeURIComponent(asset.id)}:${date}`,
          planId: plan.id,
          planCode: plan.code,
          planName: plan.name,
          assetId: asset.id,
          assetName: asset.name,
          assetCode: asset.code,
          assetLocation: asset.location,
          kind: plan.kind,
          scheduledDate: date,
          scheduledAt,
          dueAt,
          plannedMinutes: plan.estimatedMinutes,
          manpower: plan.manpower,
          state: skipReason ? "Skipped" : "Scheduled",
          skipReason,
          executionId: null,
          createdAt: now,
          updatedAt: now,
          checklist: plan.checklist ? structuredClone(plan.checklist) : null,
          tasks: structuredClone(plan.tasks),
          assigneeId: plan.assigneeId,
          assigneeName: plan.assigneeName,
          team: plan.team,
          priority: plan.priority,
          notes: plan.notes,
          timeZone: plan.timeZone,
        }),
      );
      keys.add(key);
    }
    if (date === last) break;
  }
  if (existing.length + output.length > 20_000)
    throw new Error(
      "This browser preview supports up to 20,000 scheduled jobs.",
    );
  return output;
}

export type OccurrenceResult = {
  status:
    | "Scheduled"
    | "Due"
    | "Overdue"
    | "In progress"
    | "Pending checks"
    | "Completed"
    | "Skipped"
    | "Cancelled"
    | "Missing record";
  completedAt: string | null;
  actualSeconds: number | null;
  onTime: boolean | null;
  issueCount: number;
  executionCode: string | null;
};

export function occurrenceResult(
  occurrence: PlanOccurrence,
  orders: WorkOrder[],
  reports: InspectionReport[],
  now = Date.now(),
): OccurrenceResult {
  const pendingStatus =
    now > Date.parse(occurrence.dueAt)
      ? "Overdue"
      : now >= Date.parse(occurrence.scheduledAt)
        ? "Due"
        : "Scheduled";
  const result: OccurrenceResult = {
    status: pendingStatus,
    completedAt: null,
    actualSeconds: null,
    onTime: null,
    issueCount: 0,
    executionCode: null,
  };
  if (occurrence.state === "Skipped") return { ...result, status: "Skipped" };
  if (!occurrence.executionId) return result;
  if (occurrence.kind === "AM") {
    const report = reports.find(
      (row) =>
        row.id === occurrence.executionId &&
        row.assetId === occurrence.assetId &&
        row.kind === "AM",
    );
    if (!report) return { ...result, status: "Missing record" };
    result.executionCode = report.code;
    result.issueCount = report.items.filter((item) =>
      inspectionItemHasIssue(item, report.answers[item.id]),
    ).length;
    const end = report.completedAt ? Date.parse(report.completedAt) : now;
    result.actualSeconds = Math.max(
      0,
      (end - Date.parse(report.startedAt)) / 1_000,
    );
    if (report.status !== "Completed")
      return { ...result, status: "In progress" };
    const snapshotChecks = {
      ...report,
      items: occurrence.checklist?.items ?? report.items,
    };
    if (
      !report.completedAt ||
      report.checklistId !== occurrence.checklist?.id ||
      Object.keys(validateInspection(report, true)).length ||
      Object.keys(validateInspection(snapshotChecks, true)).length
    )
      return { ...result, status: "Pending checks" };
    return {
      ...result,
      status: "Completed",
      completedAt: report.completedAt,
      onTime: Date.parse(report.completedAt) <= Date.parse(occurrence.dueAt),
    };
  }
  const order = orders.find(
    (row) =>
      row.id === occurrence.executionId && row.assetId === occurrence.assetId,
  );
  if (!order) return { ...result, status: "Missing record" };
  result.executionCode = order.code;
  const items = occurrence.checklist?.items ?? order.checklist?.items ?? [];
  result.issueCount = items.filter((item) =>
    inspectionItemHasIssue(item, order.answers[item.id]),
  ).length;
  const timings = Object.fromEntries(
    Object.entries(order.taskTimeEntries ?? {}).filter(([id]) =>
      order.tasks.some((task) => task.id === id),
    ),
  );
  if (Object.keys(timings).length)
    result.actualSeconds = totalTaskDurationSeconds(timings, now);
  else if (
    order.completion?.actualHours.trim() &&
    Number.isFinite(Number(order.completion.actualHours))
  )
    result.actualSeconds = Math.max(
      0,
      Number(order.completion.actualHours) * 3_600,
    );
  if (order.status === "Cancelled") return { ...result, status: "Cancelled" };
  if (order.status !== "Completed")
    return {
      ...result,
      status:
        order.status === "In progress" || order.status === "On hold"
          ? "In progress"
          : pendingStatus,
    };
  // Work-order task timers may complete the order before its checks or costs are reviewed.
  // Completion of the scheduled PM requires the checks, but not financial closure.
  const checklistChecks = {
    items,
    answers: order.answers,
    notes: "",
  } as InspectionReport;
  const missingSnapshot =
    occurrence.checklist && order.checklist?.id !== occurrence.checklist.id;
  if (
    !order.completedAt ||
    missingSnapshot ||
    Object.keys(validateInspection(checklistChecks, true)).length
  )
    return { ...result, status: "Pending checks" };
  return {
    ...result,
    status: "Completed",
    completedAt: order.completedAt,
    onTime: Date.parse(order.completedAt) <= Date.parse(occurrence.dueAt),
  };
}

export function readPlanning(key: string): PlanningData {
  const raw = localStorage.getItem(key);
  if (raw === null) return { plans: [], occurrences: [] };
  try {
    return planningSchema.parse(JSON.parse(raw));
  } catch {
    throw new Error(
      "Saved maintenance planning data could not be read. It has been kept unchanged.",
    );
  }
}
