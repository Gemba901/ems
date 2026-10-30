import { z } from "zod";
import type { Asset } from "../asset-preview";

export const INSPECTION_FREQUENCIES = [
  "Daily",
  "Weekly",
  "Monthly",
  "Quarterly",
  "Half-yearly",
  "Yearly",
] as const;
export const INSPECTION_RESPONSE_TYPES = [
  "Pass / Fail",
  "Number",
  "Text",
] as const;

const itemSchema = z.object({
  id: z.string().min(1),
  title: z.string().max(300),
  instructions: z.string().max(2000),
  section: z.string().max(120),
  responseType: z.enum(INSPECTION_RESPONSE_TYPES),
  required: z.boolean(),
  allowNa: z.boolean(),
  unit: z.string().max(40),
  min: z.string().max(40),
  max: z.string().max(40),
});
const checklistSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1).max(200),
  kind: z.enum(["AM", "PM"]),
  frequency: z.enum(INSPECTION_FREQUENCIES),
  description: z.string().max(2000),
  status: z.enum(["Draft", "Published", "Archived"]),
  items: z.array(itemSchema).min(1).max(100),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  version: z.number().int().positive(),
});
const answerSchema = z.object({
  value: z.string().max(4000),
  note: z.string().max(4000),
});
const reportSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  checklistId: z.string(),
  checklistName: z.string(),
  checklistCode: z.string(),
  checklistVersion: z.number().int().positive(),
  kind: z.enum(["AM", "PM"]),
  frequency: z.enum(INSPECTION_FREQUENCIES),
  assetId: z.string(),
  assetName: z.string(),
  assetCode: z.string(),
  assetLocation: z.string(),
  inspectorName: z.string(),
  inspectorUserId: z.string().default(""),
  inspectorRole: z.string().default(""),
  inspectionDate: z
    .string()
    .refine((value) => value === "" || isValidInspectionDate(value))
    .default(""),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime(),
  status: z.enum(["In progress", "Completed"]),
  items: z.array(itemSchema).min(1).max(100),
  answers: z.record(z.string(), answerSchema),
  notes: z.string().max(4000),
});
export const inspectionPreviewSchema = z.object({
  checklists: z.array(checklistSchema),
  reports: z.array(reportSchema),
});
export type InspectionItem = z.infer<typeof itemSchema>;
export type InspectionChecklist = z.infer<typeof checklistSchema>;
export type ChecklistInput = Omit<
  InspectionChecklist,
  "id" | "code" | "createdAt" | "updatedAt" | "version"
>;
export type InspectionAnswer = z.infer<typeof answerSchema>;
export type InspectionReport = z.infer<typeof reportSchema>;
export type InspectionPreview = z.infer<typeof inspectionPreviewSchema>;
export type InspectionInspector = {
  userId: string;
  name: string;
  role: string;
  inspectionDate: string;
};

export function isValidInspectionDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return day <= daysInMonth[month - 1];
}

export function inspectionToday(timeZone?: string, now = new Date()): string {
  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(now);
      const value = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((part) => part.type === type)?.value ?? "";
      return `${value("year")}-${value("month")}-${value("day")}`;
    } catch {
      // Use the browser's local date when the organization has no valid zone.
    }
  }
  return `${String(now.getFullYear()).padStart(4, "0")}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function newInspectionItem(): InspectionItem {
  return {
    id: crypto.randomUUID(),
    title: "",
    instructions: "",
    section: "General",
    responseType: "Pass / Fail",
    required: true,
    allowNa: true,
    unit: "",
    min: "",
    max: "",
  };
}

export function emptyChecklist(): ChecklistInput {
  return {
    name: "",
    kind: "AM",
    frequency: "Daily",
    description: "",
    status: "Draft",
    items: [newInspectionItem()],
  };
}

export function validateChecklist(
  input: ChecklistInput,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!input.name.trim()) errors.name = "Enter a checklist name.";
  if (input.name.length > 200)
    errors.name = "Keep the name within 200 characters.";
  if (!input.items.length || input.items.length > 100)
    errors.items = "Add between 1 and 100 inspection items.";
  if (new Set(input.items.map((item) => item.id)).size !== input.items.length)
    errors.items = "Each inspection item must have a unique identifier.";
  for (const item of input.items) {
    if (!item.title.trim())
      errors[`items.${item.id}.title`] = "Enter what needs to be checked.";
    if (item.title.length > 300)
      errors[`items.${item.id}.title`] =
        "Keep this check within 300 characters.";
    if (item.responseType === "Number") {
      const min = item.min.trim();
      const max = item.max.trim();
      if (
        (min && !Number.isFinite(Number(min))) ||
        (max && !Number.isFinite(Number(max)))
      )
        errors[`items.${item.id}.range`] =
          "Enter valid numbers for the acceptable range.";
      else if (min && max && Number(min) > Number(max))
        errors[`items.${item.id}.range`] =
          "Minimum must be less than or equal to maximum.";
    }
  }
  return errors;
}

export function inspectionItemHasIssue(
  item: InspectionItem,
  answer?: InspectionAnswer,
): boolean {
  const value = answer?.value.trim() ?? "";
  if (!value || value === "NA") return false;
  if (item.responseType === "Pass / Fail") return value === "Fail";
  if (item.responseType !== "Number" || !Number.isFinite(Number(value)))
    return false;
  return (
    (item.min.trim() !== "" && Number(value) < Number(item.min)) ||
    (item.max.trim() !== "" && Number(value) > Number(item.max))
  );
}

function isAnswered(item: InspectionItem, answer?: InspectionAnswer): boolean {
  const value = answer?.value.trim() ?? "";
  if (!value) return false;
  if (value === "NA") return item.allowNa;
  if (item.responseType === "Pass / Fail")
    return value === "Pass" || value === "Fail";
  if (item.responseType === "Number") return Number.isFinite(Number(value));
  return true;
}

export function getInspectionProgress(report: InspectionReport) {
  return {
    answered: report.items.filter((item) =>
      isAnswered(item, report.answers[item.id]),
    ).length,
    total: report.items.length,
    requiredAnswered: report.items.filter(
      (item) => item.required && isAnswered(item, report.answers[item.id]),
    ).length,
    requiredTotal: report.items.filter((item) => item.required).length,
    issues: report.items.filter((item) =>
      inspectionItemHasIssue(item, report.answers[item.id]),
    ).length,
    naCount: report.items.filter(
      (item) => report.answers[item.id]?.value === "NA" && item.allowNa,
    ).length,
  };
}

export function validateInspection(
  report: InspectionReport,
  complete = false,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (report.notes.length > 4000)
    errors.notes = "Keep inspection notes within 4,000 characters.";
  for (const item of report.items) {
    const answer = report.answers[item.id];
    const value = answer?.value.trim() ?? "";
    if (value && !isAnswered(item, answer))
      errors[item.id] =
        item.responseType === "Number"
          ? "Enter a valid number or choose N/A if available."
          : "Choose a valid response.";
    if (complete && item.required && !isAnswered(item, answer))
      errors[item.id] = "Complete this required check.";
    if ((answer?.value.length ?? 0) > 4000)
      errors[item.id] = "Keep the response within 4,000 characters.";
    if ((answer?.note.length ?? 0) > 4000)
      errors[`${item.id}.note`] = "Keep notes within 4,000 characters.";
    if (
      complete &&
      inspectionItemHasIssue(item, answer) &&
      !answer?.note.trim()
    )
      errors[`${item.id}.note`] =
        "Describe the issue before completing the inspection.";
  }
  return errors;
}

export function nextInspectionCode(
  prefix: "CHK" | "INSP",
  records: { code: string }[],
): string {
  let highest = BigInt(0);
  const pattern = new RegExp(`^${prefix}-(\\d+)$`, "i");
  for (const record of records) {
    const match = pattern.exec(record.code);
    if (match && BigInt(match[1]) > highest) highest = BigInt(match[1]);
  }
  return `${prefix}-${(highest + BigInt(1)).toString().padStart(4, "0")}`;
}

export function createInspectionSnapshot(
  checklist: InspectionChecklist,
  asset: Asset,
  inspector: InspectionInspector,
  reports: InspectionReport[],
  now = new Date().toISOString(),
): InspectionReport {
  if (checklist.status !== "Published")
    throw new Error("Publish this checklist before starting an inspection.");
  if (asset.stage !== "Registered" || asset.usage === "Retired")
    throw new Error("Choose a registered asset that has not been retired.");
  if (
    !inspector.userId.trim() ||
    !inspector.name.trim() ||
    !inspector.role.trim()
  )
    throw new Error(
      "Your inspector name and role are unavailable. Sign in again before starting an inspection.",
    );
  if (!isValidInspectionDate(inspector.inspectionDate))
    throw new Error("Choose a valid inspection date.");
  const errors = validateChecklist(checklist);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  return {
    id: crypto.randomUUID(),
    code: nextInspectionCode("INSP", reports),
    checklistId: checklist.id,
    checklistName: checklist.name,
    checklistCode: checklist.code,
    checklistVersion: checklist.version,
    kind: checklist.kind,
    frequency: checklist.frequency,
    assetId: asset.id,
    assetName: asset.name,
    assetCode: asset.code,
    assetLocation: asset.location,
    inspectorName: inspector.name.trim(),
    inspectorUserId: inspector.userId.trim(),
    inspectorRole: inspector.role.trim(),
    inspectionDate: inspector.inspectionDate,
    startedAt: now,
    completedAt: null,
    updatedAt: now,
    status: "In progress",
    items: checklist.items.map((item) => ({ ...item })),
    answers: {},
    notes: "",
  };
}

export function updateInspection(
  report: InspectionReport,
  answers: Record<string, InspectionAnswer>,
  notes: string,
  complete = false,
  now = new Date().toISOString(),
): InspectionReport {
  if (report.status === "Completed")
    throw new Error("Completed inspection reports cannot be changed.");
  const cleanAnswers = Object.fromEntries(
    report.items
      .filter((item) => answers[item.id])
      .map((item) => [
        item.id,
        {
          value: answers[item.id].value.trim(),
          note: answers[item.id].note.trim(),
        },
      ]),
  );
  const updated: InspectionReport = {
    ...report,
    answers: cleanAnswers,
    notes: notes.trim(),
    updatedAt: now,
    status: complete ? "Completed" : "In progress",
    completedAt: complete ? now : null,
  };
  const errors = validateInspection(updated, complete);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  return reportSchema.parse(updated);
}

export function sampleInspectionPreview(): InspectionPreview {
  const now = "2026-10-15T08:00:00.000Z";
  const definitions = [
    {
      id: "sample-am-daily",
      name: "Daily operator check",
      kind: "AM" as const,
      frequency: "Daily" as const,
      status: "Published" as const,
      description:
        "A sample autonomous maintenance checklist for routine operator observations. Adapt the checks to your asset and approved procedures.",
      checks: [
        "Work area is clean and accessible",
        "Guards and covers appear intact",
        "No visible leaks or loose connections",
        "No unusual noise or vibration reported",
        "Operating area handed over in good condition",
      ],
    },
    {
      id: "sample-pm-weekly",
      name: "Weekly equipment inspection",
      kind: "PM" as const,
      frequency: "Weekly" as const,
      status: "Published" as const,
      description:
        "A sample preventive maintenance checklist. Review condition and maintenance records against the equipment's approved procedure.",
      checks: [
        "Scheduled lubrication records reviewed",
        "Visible wear and condition checked",
        "Connections and fittings inspected",
        "Safety inspection record reviewed",
        "Follow-up findings recorded",
      ],
    },
    {
      id: "sample-pm-monthly",
      name: "Monthly condition review",
      kind: "PM" as const,
      frequency: "Monthly" as const,
      status: "Draft" as const,
      description:
        "Draft example for a monthly condition review. Customize and publish before use.",
      checks: [
        "Equipment condition reviewed",
        "Recurring issues reviewed",
        "Next maintenance actions identified",
      ],
    },
  ];
  return {
    checklists: definitions.map((definition, index) => ({
      id: definition.id,
      code: `CHK-${String(index + 1).padStart(4, "0")}`,
      name: definition.name,
      kind: definition.kind,
      frequency: definition.frequency,
      description: definition.description,
      status: definition.status,
      version: 1,
      createdAt: now,
      updatedAt: now,
      items: definition.checks.map((title, itemIndex) => ({
        id: `${definition.id}-${itemIndex + 1}`,
        title,
        section:
          definition.kind === "AM" ? "Operator checks" : "Condition checks",
        instructions: "",
        responseType: "Pass / Fail",
        required: true,
        allowNa: true,
        unit: "",
        min: "",
        max: "",
      })),
    })),
    reports: [],
  };
}

export function readInspectionPreview(key: string): InspectionPreview {
  const raw = localStorage.getItem(key);
  if (!raw) return sampleInspectionPreview();
  const parsed = inspectionPreviewSchema.safeParse(JSON.parse(raw));
  if (!parsed.success)
    throw new Error(
      "This browser's inspection preview could not be read. Keep your saved data and try again.",
    );
  return parsed.data;
}
