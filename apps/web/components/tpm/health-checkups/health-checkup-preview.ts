import { z } from "zod";
import type { Asset } from "../asset-preview";

export const HEALTH_FREQUENCIES = [
  "Daily",
  "Weekly",
  "Monthly",
  "Quarterly",
  "Half-yearly",
  "Yearly",
] as const;
export const HEALTH_RESPONSE_TYPES = [
  "Number",
  "Condition",
  "Pass / Fail",
  "Text",
] as const;
export const HEALTH_CONDITIONS = [
  "Good",
  "Fair",
  "Poor",
  "Critical",
] as const;
export const HEALTH_OUTCOMES = [
  "Incomplete",
  "Healthy",
  "Needs Attention",
  "Critical",
] as const;
export const MACHINE_TYPE_SUGGESTIONS = [
  "Motor",
  "Pump",
  "Compressor",
  "Conveyor",
  "Mixer",
  "Tank",
  "Grinder",
] as const;

const itemSchema = z.object({
  id: z.string().min(1),
  title: z.string().max(300),
  instructions: z.string().max(2000),
  section: z.string().max(120),
  responseType: z.enum(HEALTH_RESPONSE_TYPES),
  required: z.boolean(),
  unit: z.string().max(40),
  min: z.string().max(40),
  max: z.string().max(40),
  /** When true, a failing result forces overall Critical. */
  criticalOnFail: z.boolean(),
});
const standardSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1).max(200),
  machineType: z.string().min(1).max(120),
  description: z.string().max(2000),
  status: z.enum(["Draft", "Published", "Archived"]),
  items: z.array(itemSchema).min(1).max(100),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  version: z.number().int().positive(),
});
const assignmentSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  standardId: z.string().min(1),
  standardName: z.string().min(1),
  standardCode: z.string().min(1),
  machineType: z.string().min(1).max(120),
  assetId: z.string().min(1),
  assetName: z.string().min(1),
  assetCode: z.string().min(1),
  assetLocation: z.string(),
  assigneeName: z.string().max(200),
  assigneeId: z.string().max(200),
  frequency: z.enum(HEALTH_FREQUENCIES),
  nextDueAt: z
    .string()
    .refine((value) => value === "" || isValidHealthDate(value)),
  status: z.enum(["Active", "Paused"]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
const answerSchema = z.object({
  value: z.string().max(4000),
  note: z.string().max(4000),
  photo: z.string().max(1500000),
});
const checkupSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  assignmentId: z.string(),
  standardId: z.string(),
  standardName: z.string(),
  standardCode: z.string(),
  standardVersion: z.number().int().positive(),
  machineType: z.string(),
  assetId: z.string(),
  assetName: z.string(),
  assetCode: z.string(),
  assetLocation: z.string(),
  technicianName: z.string(),
  technicianUserId: z.string().default(""),
  technicianRole: z.string().default(""),
  checkupDate: z
    .string()
    .refine((value) => value === "" || isValidHealthDate(value))
    .default(""),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime(),
  status: z.enum(["In progress", "Completed", "Pending verification"]),
  items: z.array(itemSchema).min(1).max(100),
  answers: z.record(z.string(), answerSchema),
  notes: z.string().max(4000),
  healthStatus: z.enum(HEALTH_OUTCOMES).nullable(),
  score: z.number().min(0).max(100).nullable(),
  problems: z.array(z.string().max(500)).max(100),
  workOrderIds: z.array(z.string()).max(50),
  /** Original checkup this verification re-checks after repairs. */
  verifiesCheckupId: z.string(),
  verifiedAt: z.string().datetime().nullable(),
});

export const healthCheckupPreviewSchema = z.object({
  standards: z.array(standardSchema),
  assignments: z.array(assignmentSchema),
  checkups: z.array(checkupSchema),
});

export type HealthCheckItem = z.infer<typeof itemSchema>;
export type HealthStandard = z.infer<typeof standardSchema>;
export type StandardInput = Omit<
  HealthStandard,
  "id" | "code" | "createdAt" | "updatedAt" | "version"
>;
export type HealthAssignment = z.infer<typeof assignmentSchema>;
export type AssignmentInput = {
  standardId: string;
  assetIds: string[];
  assigneeName: string;
  assigneeId: string;
  frequency: (typeof HEALTH_FREQUENCIES)[number];
  nextDueAt: string;
};
export type HealthAnswer = z.infer<typeof answerSchema>;
export type HealthCheckup = z.infer<typeof checkupSchema>;
export type HealthCheckupPreview = z.infer<typeof healthCheckupPreviewSchema>;
export type HealthTechnician = {
  userId: string;
  name: string;
  role: string;
  checkupDate: string;
};
export type HealthOutcome = (typeof HEALTH_OUTCOMES)[number];

export function isValidHealthDate(value: string): boolean {
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

export function healthToday(timeZone?: string, now = new Date()): string {
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
      // Fall through to local date.
    }
  }
  return `${String(now.getFullYear()).padStart(4, "0")}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function newHealthCheckItem(): HealthCheckItem {
  return {
    id: crypto.randomUUID(),
    title: "",
    instructions: "",
    section: "General",
    responseType: "Number",
    required: true,
    unit: "",
    min: "",
    max: "",
    criticalOnFail: false,
  };
}

export function emptyStandard(): StandardInput {
  return {
    name: "",
    machineType: "",
    description: "",
    status: "Draft",
    items: [newHealthCheckItem()],
  };
}

export function validateStandard(
  input: StandardInput,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!input.name.trim()) errors.name = "Enter a standard name.";
  if (input.name.length > 200)
    errors.name = "Keep the name within 200 characters.";
  if (!input.machineType.trim())
    errors.machineType = "Enter the machine type this standard covers.";
  if (input.machineType.length > 120)
    errors.machineType = "Keep the machine type within 120 characters.";
  if (!input.items.length || input.items.length > 100)
    errors.items = "Add between 1 and 100 checkup items.";
  if (new Set(input.items.map((item) => item.id)).size !== input.items.length)
    errors.items = "Each checkup item must have a unique identifier.";
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
      else if (!min && !max)
        errors[`items.${item.id}.range`] =
          "Set an acceptable minimum, maximum, or both.";
    }
  }
  return errors;
}

export function validateAssignmentInput(
  input: AssignmentInput,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!input.standardId) errors.standardId = "Choose a published standard.";
  if (!input.assetIds.length)
    errors.assetIds = "Select at least one machine.";
  if (!input.assigneeName.trim())
    errors.assigneeName = "Enter who performs the checkup.";
  if (!isValidHealthDate(input.nextDueAt))
    errors.nextDueAt = "Choose a valid due date.";
  return errors;
}

export function healthItemHasIssue(
  item: HealthCheckItem,
  answer?: HealthAnswer,
): boolean {
  const value = answer?.value.trim() ?? "";
  if (!value) return false;
  if (item.responseType === "Pass / Fail") return value === "Fail";
  if (item.responseType === "Condition")
    return value === "Fair" || value === "Poor" || value === "Critical";
  if (item.responseType !== "Number" || !Number.isFinite(Number(value)))
    return false;
  return (
    (item.min.trim() !== "" && Number(value) < Number(item.min)) ||
    (item.max.trim() !== "" && Number(value) > Number(item.max))
  );
}

export function healthItemIsCritical(
  item: HealthCheckItem,
  answer?: HealthAnswer,
): boolean {
  const value = answer?.value.trim() ?? "";
  if (!value) return false;
  if (item.responseType === "Condition" && value === "Critical") return true;
  if (!healthItemHasIssue(item, answer)) return false;
  return item.criticalOnFail || value === "Critical";
}

function isAnswered(item: HealthCheckItem, answer?: HealthAnswer): boolean {
  const value = answer?.value.trim() ?? "";
  if (!value) return false;
  if (item.responseType === "Pass / Fail")
    return value === "Pass" || value === "Fail";
  if (item.responseType === "Condition")
    return (HEALTH_CONDITIONS as readonly string[]).includes(value);
  if (item.responseType === "Number") return Number.isFinite(Number(value));
  return true;
}

export function getCheckupProgress(checkup: HealthCheckup) {
  return {
    answered: checkup.items.filter((item) =>
      isAnswered(item, checkup.answers[item.id]),
    ).length,
    total: checkup.items.length,
    requiredAnswered: checkup.items.filter(
      (item) => item.required && isAnswered(item, checkup.answers[item.id]),
    ).length,
    requiredTotal: checkup.items.filter((item) => item.required).length,
    issues: checkup.items.filter((item) =>
      healthItemHasIssue(item, checkup.answers[item.id]),
    ).length,
  };
}

export function evaluateHealthReport(checkup: HealthCheckup): {
  healthStatus: HealthOutcome;
  score: number;
  problems: string[];
} {
  const progress = getCheckupProgress(checkup);
  const incomplete =
    progress.requiredAnswered < progress.requiredTotal ||
    progress.answered < progress.total;
  const problems: string[] = [];
  let critical = false;
  let attention = false;
  let passCount = 0;

  for (const item of checkup.items) {
    const answer = checkup.answers[item.id];
    if (!isAnswered(item, answer)) continue;
    if (healthItemIsCritical(item, answer)) {
      critical = true;
      problems.push(problemLabel(item, answer));
    } else if (healthItemHasIssue(item, answer)) {
      attention = true;
      problems.push(problemLabel(item, answer));
    } else {
      passCount += 1;
    }
  }

  const scored = checkup.items.filter((item) =>
    isAnswered(item, checkup.answers[item.id]),
  ).length;
  const score =
    scored === 0 ? 0 : Math.round((passCount / scored) * 100);

  if (incomplete) {
    return { healthStatus: "Incomplete", score, problems };
  }
  if (critical) return { healthStatus: "Critical", score, problems };
  if (attention) return { healthStatus: "Needs Attention", score, problems };
  return { healthStatus: "Healthy", score, problems };
}

function problemLabel(item: HealthCheckItem, answer?: HealthAnswer): string {
  const value = answer?.value.trim() ?? "";
  const unit = item.unit ? ` ${item.unit}` : "";
  if (item.responseType === "Number") {
    const range =
      item.min && item.max
        ? ` (expected ${item.min}–${item.max}${unit})`
        : item.min
          ? ` (min ${item.min}${unit})`
          : item.max
            ? ` (max ${item.max}${unit})`
            : "";
    return `${item.title}: ${value}${unit}${range}`;
  }
  return `${item.title}: ${value}`;
}

export function validateCheckup(
  checkup: HealthCheckup,
  complete = false,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (checkup.notes.length > 4000)
    errors.notes = "Keep checkup notes within 4,000 characters.";
  for (const item of checkup.items) {
    const answer = checkup.answers[item.id];
    const value = answer?.value.trim() ?? "";
    if (value && !isAnswered(item, answer))
      errors[item.id] =
        item.responseType === "Number"
          ? "Enter a valid number."
          : "Choose a valid response.";
    if (complete && item.required && !isAnswered(item, answer))
      errors[item.id] = "Complete this required check.";
    if ((answer?.value.length ?? 0) > 4000)
      errors[item.id] = "Keep the response within 4,000 characters.";
    if ((answer?.note.length ?? 0) > 4000)
      errors[`${item.id}.note`] = "Keep notes within 4,000 characters.";
    if ((answer?.photo.length ?? 0) > 1500000)
      errors[`${item.id}.photo`] = "Choose a smaller photo.";
    if (
      complete &&
      healthItemHasIssue(item, answer) &&
      !answer?.note.trim()
    )
      errors[`${item.id}.note`] =
        "Describe the problem before completing the checkup.";
  }
  return errors;
}

export function nextHealthCode(
  prefix: "STD" | "ASN" | "HC",
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

export function createCheckupSnapshot(
  standard: HealthStandard,
  asset: Asset,
  technician: HealthTechnician,
  checkups: HealthCheckup[],
  options: {
    assignmentId?: string;
    verifiesCheckupId?: string;
  } = {},
  now = new Date().toISOString(),
): HealthCheckup {
  if (standard.status !== "Published")
    throw new Error("Publish this standard before starting a checkup.");
  if (asset.stage !== "Registered" || asset.usage === "Retired")
    throw new Error("Choose a registered asset that has not been retired.");
  if (
    !technician.userId.trim() ||
    !technician.name.trim() ||
    !technician.role.trim()
  )
    throw new Error(
      "Your technician name and role are unavailable. Sign in again before starting a checkup.",
    );
  if (!isValidHealthDate(technician.checkupDate))
    throw new Error("Choose a valid checkup date.");
  const errors = validateStandard(standard);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  return {
    id: crypto.randomUUID(),
    code: nextHealthCode("HC", checkups),
    assignmentId: options.assignmentId ?? "",
    standardId: standard.id,
    standardName: standard.name,
    standardCode: standard.code,
    standardVersion: standard.version,
    machineType: standard.machineType,
    assetId: asset.id,
    assetName: asset.name,
    assetCode: asset.code,
    assetLocation: asset.location,
    technicianName: technician.name.trim(),
    technicianUserId: technician.userId.trim(),
    technicianRole: technician.role.trim(),
    checkupDate: technician.checkupDate,
    startedAt: now,
    completedAt: null,
    updatedAt: now,
    status: "In progress",
    items: standard.items.map((item) => ({ ...item })),
    answers: {},
    notes: "",
    healthStatus: null,
    score: null,
    problems: [],
    workOrderIds: [],
    verifiesCheckupId: options.verifiesCheckupId ?? "",
    verifiedAt: null,
  };
}

export function updateCheckup(
  checkup: HealthCheckup,
  answers: Record<string, HealthAnswer>,
  notes: string,
  complete = false,
  now = new Date().toISOString(),
): HealthCheckup {
  if (checkup.status === "Completed")
    throw new Error("Completed health checkups cannot be changed.");
  const cleanAnswers = Object.fromEntries(
    checkup.items
      .filter((item) => answers[item.id])
      .map((item) => [
        item.id,
        {
          value: answers[item.id].value.trim(),
          note: answers[item.id].note.trim(),
          photo: answers[item.id].photo.trim(),
        },
      ]),
  );
  const draft: HealthCheckup = {
    ...checkup,
    answers: cleanAnswers,
    notes: notes.trim(),
    updatedAt: now,
  };
  const report = evaluateHealthReport(draft);
  const needsFollowUp =
    complete &&
    (report.healthStatus === "Needs Attention" ||
      report.healthStatus === "Critical");
  const updated: HealthCheckup = {
    ...draft,
    healthStatus: complete ? report.healthStatus : report.healthStatus,
    score: report.score,
    problems: report.problems,
    status: complete
      ? needsFollowUp
        ? "Pending verification"
        : "Completed"
      : "In progress",
    completedAt: complete && !needsFollowUp ? now : null,
    verifiedAt:
      complete &&
      !needsFollowUp &&
      checkup.verifiesCheckupId &&
      report.healthStatus === "Healthy"
        ? now
        : checkup.verifiedAt,
  };
  const errors = validateCheckup(updated, complete);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  // Incomplete completed submissions are allowed only when the caller asked to
  // complete; evaluateHealthReport already marks them Incomplete (never Healthy).
  if (complete && updated.healthStatus === "Incomplete") {
    // Still finalize as Completed with Incomplete outcome so teams see the gap.
    updated.status = "Completed";
    updated.completedAt = now;
  }
  return checkupSchema.parse(updated);
}

export function linkWorkOrderToCheckup(
  checkup: HealthCheckup,
  workOrderId: string,
): HealthCheckup {
  if (!workOrderId.trim()) throw new Error("Choose a work order to link.");
  if (checkup.workOrderIds.includes(workOrderId)) return checkup;
  if (checkup.workOrderIds.length >= 50)
    throw new Error("This checkup already has the maximum linked work orders.");
  return {
    ...checkup,
    workOrderIds: [...checkup.workOrderIds, workOrderId],
    updatedAt: new Date().toISOString(),
  };
}

export function markCheckupVerified(
  original: HealthCheckup,
  verification: HealthCheckup,
  now = new Date().toISOString(),
): HealthCheckup {
  if (verification.verifiesCheckupId !== original.id)
    throw new Error("This checkup is not a verification of the original.");
  if (verification.healthStatus !== "Healthy")
    throw new Error(
      "Verify the condition is Healthy before updating the original health result.",
    );
  if (
    verification.status !== "Completed" &&
    verification.status !== "Pending verification"
  )
    throw new Error("Complete the verification checkup first.");
  return {
    ...original,
    status: "Completed",
    healthStatus: "Healthy",
    score: verification.score,
    problems: [],
    completedAt: now,
    verifiedAt: now,
    updatedAt: now,
  };
}

export function previousCheckupsForAsset(
  checkups: HealthCheckup[],
  assetId: string,
  standardId: string,
  excludeId?: string,
): HealthCheckup[] {
  return checkups
    .filter(
      (item) =>
        item.assetId === assetId &&
        item.standardId === standardId &&
        item.id !== excludeId &&
        (item.status === "Completed" || item.status === "Pending verification"),
    )
    .sort((a, b) => b.checkupDate.localeCompare(a.checkupDate));
}

export function sampleHealthCheckupPreview(): HealthCheckupPreview {
  const now = "2026-10-15T08:00:00.000Z";
  const oct20 = "2026-10-20T06:30:00.000Z";
  const oct22 = "2026-10-22T09:15:00.000Z";
  const oct24 = "2026-10-24T07:00:00.000Z";
  const oct25 = "2026-10-25T10:30:00.000Z";

  // ── Motor standard items ─────────────────────────────────────
  const motorItems: Omit<HealthCheckItem, "id">[] = [
    {
      title: "Bearing / housing temperature",
      instructions: "Measure surface temperature at the drive end.",
      section: "Temperature",
      responseType: "Number",
      required: true,
      unit: "°C",
      min: "20",
      max: "75",
      criticalOnFail: true,
    },
    {
      title: "Vibration level",
      instructions: "Record overall vibration at the motor feet.",
      section: "Vibration",
      responseType: "Number",
      required: true,
      unit: "mm/s",
      min: "0",
      max: "4.5",
      criticalOnFail: true,
    },
    {
      title: "Noise condition",
      instructions: "Listen for unusual grinding, screeching, or knocking.",
      section: "Noise",
      responseType: "Condition",
      required: true,
      unit: "",
      min: "",
      max: "",
      criticalOnFail: false,
    },
    {
      title: "Lubrication condition",
      instructions: "Confirm grease/oil level and condition are acceptable.",
      section: "Lubrication",
      responseType: "Pass / Fail",
      required: true,
      unit: "",
      min: "",
      max: "",
      criticalOnFail: false,
    },
  ];

  // ── Pump standard items ──────────────────────────────────────
  const pumpItems: Omit<HealthCheckItem, "id">[] = [
    {
      title: "Discharge pressure",
      instructions: "Compare against the approved operating range.",
      section: "Performance",
      responseType: "Number",
      required: true,
      unit: "bar",
      min: "2",
      max: "6",
      criticalOnFail: false,
    },
    {
      title: "Seal condition",
      instructions: "Check for leaks around the mechanical seal.",
      section: "Seals",
      responseType: "Condition",
      required: true,
      unit: "",
      min: "",
      max: "",
      criticalOnFail: true,
    },
    {
      title: "Unusual noise or cavitation",
      instructions: "Listen for pump cavitation or dry-run sounds.",
      section: "Noise",
      responseType: "Pass / Fail",
      required: true,
      unit: "",
      min: "",
      max: "",
      criticalOnFail: false,
    },
  ];

  // ── Compressor standard items ────────────────────────────────
  const compressorItems: Omit<HealthCheckItem, "id">[] = [
    {
      title: "Discharge air pressure",
      instructions: "Read the gauge at the receiver tank outlet.",
      section: "Performance",
      responseType: "Number",
      required: true,
      unit: "bar",
      min: "6",
      max: "10",
      criticalOnFail: true,
    },
    {
      title: "Oil level",
      instructions: "Check sight glass — oil must be between marks.",
      section: "Lubrication",
      responseType: "Pass / Fail",
      required: true,
      unit: "",
      min: "",
      max: "",
      criticalOnFail: false,
    },
    {
      title: "Air filter condition",
      instructions: "Inspect inlet filter for clogging or damage.",
      section: "Filtration",
      responseType: "Condition",
      required: true,
      unit: "",
      min: "",
      max: "",
      criticalOnFail: false,
    },
    {
      title: "Discharge air temperature",
      instructions: "Measure temperature at the discharge line.",
      section: "Temperature",
      responseType: "Number",
      required: true,
      unit: "°C",
      min: "30",
      max: "95",
      criticalOnFail: true,
    },
  ];

  // ── Conveyor standard items ──────────────────────────────────
  const conveyorItems: Omit<HealthCheckItem, "id">[] = [
    {
      title: "Belt alignment",
      instructions: "Confirm belt tracks centrally across all rollers.",
      section: "Belt",
      responseType: "Pass / Fail",
      required: true,
      unit: "",
      min: "",
      max: "",
      criticalOnFail: false,
    },
    {
      title: "Belt tension",
      instructions: "Check deflection is within the approved spec.",
      section: "Belt",
      responseType: "Condition",
      required: true,
      unit: "",
      min: "",
      max: "",
      criticalOnFail: false,
    },
    {
      title: "Roller condition",
      instructions: "Spin each roller by hand — must rotate freely without noise.",
      section: "Rollers",
      responseType: "Condition",
      required: true,
      unit: "",
      min: "",
      max: "",
      criticalOnFail: false,
    },
  ];

  // ── Snapshot items with IDs ──────────────────────────────────
  const motorStdItems = motorItems.map((item, i) => ({
    ...item,
    id: `sample-std-motor-${i + 1}`,
  }));
  const pumpStdItems = pumpItems.map((item, i) => ({
    ...item,
    id: `sample-std-pump-${i + 1}`,
  }));
  const compStdItems = compressorItems.map((item, i) => ({
    ...item,
    id: `sample-std-comp-${i + 1}`,
  }));
  const convStdItems = conveyorItems.map((item, i) => ({
    ...item,
    id: `sample-std-conv-${i + 1}`,
  }));

  // ── Standards ────────────────────────────────────────────────
  const standards: HealthStandard[] = [
    {
      id: "sample-std-motor",
      code: "STD-0001",
      name: "Motor health checkup",
      machineType: "Motor",
      description:
        "Standard checks for motors: temperature, vibration, noise, and lubrication. Acceptable ranges are examples — adapt to your approved procedure.",
      status: "Published",
      version: 2,
      createdAt: now,
      updatedAt: oct20,
      items: motorStdItems,
    },
    {
      id: "sample-std-pump",
      code: "STD-0002",
      name: "Pump health checkup",
      machineType: "Pump",
      description:
        "Pump performance and condition standard covering discharge pressure, seal integrity, and noise. Review before publishing.",
      status: "Published",
      version: 1,
      createdAt: now,
      updatedAt: oct20,
      items: pumpStdItems,
    },
    {
      id: "sample-std-compressor",
      code: "STD-0003",
      name: "Compressor health checkup",
      machineType: "Compressor",
      description:
        "Air compressor health standard covering pressure output, oil level, air filter, and discharge temperature.",
      status: "Published",
      version: 1,
      createdAt: oct20,
      updatedAt: oct20,
      items: compStdItems,
    },
    {
      id: "sample-std-conveyor",
      code: "STD-0004",
      name: "Conveyor belt inspection",
      machineType: "Conveyor",
      description:
        "Draft standard for conveyor belt checks. Still under review with the packing team — do not publish yet.",
      status: "Draft",
      version: 1,
      createdAt: oct22,
      updatedAt: oct22,
      items: convStdItems,
    },
  ];

  // ── Assignments ──────────────────────────────────────────────
  const assignments: HealthAssignment[] = [
    {
      id: "sample-asn-1",
      code: "ASN-0001",
      standardId: "sample-std-motor",
      standardName: "Motor health checkup",
      standardCode: "STD-0001",
      machineType: "Motor",
      assetId: "sample-asset-1",
      assetName: "Flour Automation",
      assetCode: "AST-0001",
      assetLocation: "Mixing",
      assigneeName: "Ravi Kumar",
      assigneeId: "demo-user-1",
      frequency: "Monthly",
      nextDueAt: "2026-10-28",
      status: "Active",
      createdAt: oct20,
      updatedAt: oct20,
    },
    {
      id: "sample-asn-2",
      code: "ASN-0002",
      standardId: "sample-std-motor",
      standardName: "Motor health checkup",
      standardCode: "STD-0001",
      machineType: "Motor",
      assetId: "sample-asset-2",
      assetName: "Sugar Grinder 01",
      assetCode: "AST-0002",
      assetLocation: "Sugar Grinding",
      assigneeName: "Ravi Kumar",
      assigneeId: "demo-user-1",
      frequency: "Weekly",
      nextDueAt: "2026-10-26",
      status: "Active",
      createdAt: oct20,
      updatedAt: oct20,
    },
    {
      id: "sample-asn-3",
      code: "ASN-0003",
      standardId: "sample-std-compressor",
      standardName: "Compressor health checkup",
      standardCode: "STD-0003",
      machineType: "Compressor",
      assetId: "sample-asset-5",
      assetName: "Compressor 01",
      assetCode: "AST-0005",
      assetLocation: "Compressor Room",
      assigneeName: "Amit Patel",
      assigneeId: "demo-user-2",
      frequency: "Weekly",
      nextDueAt: "2026-10-27",
      status: "Active",
      createdAt: oct22,
      updatedAt: oct22,
    },
    {
      id: "sample-asn-4",
      code: "ASN-0004",
      standardId: "sample-std-pump",
      standardName: "Pump health checkup",
      standardCode: "STD-0002",
      machineType: "Pump",
      assetId: "sample-asset-3",
      assetName: "Syrup Tank",
      assetCode: "AST-0003",
      assetLocation: "Mixing",
      assigneeName: "Ravi Kumar",
      assigneeId: "demo-user-1",
      frequency: "Monthly",
      nextDueAt: "2026-11-15",
      status: "Active",
      createdAt: oct22,
      updatedAt: oct22,
    },
    {
      id: "sample-asn-5",
      code: "ASN-0005",
      standardId: "sample-std-pump",
      standardName: "Pump health checkup",
      standardCode: "STD-0002",
      machineType: "Pump",
      assetId: "sample-asset-4",
      assetName: "Cooling Tank",
      assetCode: "AST-0004",
      assetLocation: "Mixing",
      assigneeName: "Amit Patel",
      assigneeId: "demo-user-2",
      frequency: "Monthly",
      nextDueAt: "2026-11-15",
      status: "Paused",
      createdAt: oct22,
      updatedAt: oct24,
    },
  ];

  // ── Checkup 1: Motor on Flour Automation → Healthy (100) ────
  const checkup1Items = motorStdItems.map((item) => ({ ...item }));
  const checkup1Answers: Record<string, HealthAnswer> = {
    "sample-std-motor-1": { value: "62", note: "Normal range for current load.", photo: "" },
    "sample-std-motor-2": { value: "2.1", note: "", photo: "" },
    "sample-std-motor-3": { value: "Good", note: "No unusual sounds.", photo: "" },
    "sample-std-motor-4": { value: "Pass", note: "Grease level adequate.", photo: "" },
  };

  // ── Checkup 2: Motor on Sugar Grinder → Needs Attention (50) ─
  const checkup2Items = motorStdItems.map((item) => ({ ...item }));
  const checkup2Answers: Record<string, HealthAnswer> = {
    "sample-std-motor-1": { value: "78", note: "Above max — bearing may be wearing. Scheduled grease change.", photo: "" },
    "sample-std-motor-2": { value: "3.8", note: "", photo: "" },
    "sample-std-motor-3": { value: "Fair", note: "Slight humming at high RPM.", photo: "" },
    "sample-std-motor-4": { value: "Pass", note: "", photo: "" },
  };

  // ── Checkup 3: Compressor → Critical (25) ───────────────────
  const checkup3Items = compStdItems.map((item) => ({ ...item }));
  const checkup3Answers: Record<string, HealthAnswer> = {
    "sample-std-comp-1": { value: "5.2", note: "Below minimum 6 bar — pressure drop detected.", photo: "" },
    "sample-std-comp-2": { value: "Fail", note: "Oil below minimum mark. Top-up required immediately.", photo: "" },
    "sample-std-comp-3": { value: "Poor", note: "Filter heavily clogged — replacement needed.", photo: "" },
    "sample-std-comp-4": { value: "102", note: "Overheating above 95°C limit. Machine shut down pending repair.", photo: "" },
  };

  // ── Checkup 4: Pump on Syrup Tank → Incomplete (66) ─────────
  const checkup4Items = pumpStdItems.map((item) => ({ ...item }));
  const checkup4Answers: Record<string, HealthAnswer> = {
    "sample-std-pump-1": { value: "4.2", note: "Within range.", photo: "" },
    "sample-std-pump-2": { value: "Good", note: "", photo: "" },
    "sample-std-pump-3": { value: "", note: "", photo: "" },
  };

  // ── Checkup 5: In-progress Motor on Flour Automation ────────
  const checkup5Items = motorStdItems.map((item) => ({ ...item }));
  const checkup5Answers: Record<string, HealthAnswer> = {
    "sample-std-motor-1": { value: "58", note: "", photo: "" },
    "sample-std-motor-2": { value: "", note: "", photo: "" },
    "sample-std-motor-3": { value: "", note: "", photo: "" },
    "sample-std-motor-4": { value: "", note: "", photo: "" },
  };

  const checkups: HealthCheckup[] = [
    // Checkup 5 — In progress (most recent, appears first)
    {
      id: "sample-hc-5",
      code: "HC-0005",
      assignmentId: "sample-asn-1",
      standardId: "sample-std-motor",
      standardName: "Motor health checkup",
      standardCode: "STD-0001",
      standardVersion: 2,
      machineType: "Motor",
      assetId: "sample-asset-1",
      assetName: "Flour Automation",
      assetCode: "AST-0001",
      assetLocation: "Mixing",
      technicianName: "Ravi Kumar",
      technicianUserId: "demo-user-1",
      technicianRole: "Technician",
      checkupDate: "2026-10-25",
      startedAt: oct25,
      completedAt: null,
      updatedAt: oct25,
      status: "In progress",
      items: checkup5Items,
      answers: checkup5Answers,
      notes: "",
      healthStatus: null,
      score: null,
      problems: [],
      workOrderIds: [],
      verifiesCheckupId: "",
      verifiedAt: null,
    },
    // Checkup 3 — Completed Critical → Pending verification
    {
      id: "sample-hc-3",
      code: "HC-0003",
      assignmentId: "sample-asn-3",
      standardId: "sample-std-compressor",
      standardName: "Compressor health checkup",
      standardCode: "STD-0003",
      standardVersion: 1,
      machineType: "Compressor",
      assetId: "sample-asset-5",
      assetName: "Compressor 01",
      assetCode: "AST-0005",
      assetLocation: "Compressor Room",
      technicianName: "Amit Patel",
      technicianUserId: "demo-user-2",
      technicianRole: "Senior Technician",
      checkupDate: "2026-10-22",
      startedAt: oct22,
      completedAt: null,
      updatedAt: oct24,
      status: "Pending verification",
      items: checkup3Items,
      answers: checkup3Answers,
      notes: "Compressor in poor condition. Shut down for corrective maintenance. WO raised for oil top-up, filter replacement, and pressure leak investigation.",
      healthStatus: "Critical",
      score: 0,
      problems: [
        "Discharge air pressure: 5.2 bar (expected 6–10 bar)",
        "Oil level: Fail",
        "Air filter condition: Poor",
        "Discharge air temperature: 102 °C (expected 30–95 °C)",
      ],
      workOrderIds: ["WO-0012"],
      verifiesCheckupId: "",
      verifiedAt: null,
    },
    // Checkup 4 — Completed Incomplete
    {
      id: "sample-hc-4",
      code: "HC-0004",
      assignmentId: "sample-asn-4",
      standardId: "sample-std-pump",
      standardName: "Pump health checkup",
      standardCode: "STD-0002",
      standardVersion: 1,
      machineType: "Pump",
      assetId: "sample-asset-3",
      assetName: "Syrup Tank",
      assetCode: "AST-0003",
      assetLocation: "Mixing",
      technicianName: "Ravi Kumar",
      technicianUserId: "demo-user-1",
      technicianRole: "Technician",
      checkupDate: "2026-10-24",
      startedAt: oct24,
      completedAt: oct24,
      updatedAt: oct24,
      status: "Completed",
      items: checkup4Items,
      answers: checkup4Answers,
      notes: "Could not test cavitation — pump was not running at the time of inspection.",
      healthStatus: "Incomplete",
      score: 67,
      problems: [],
      workOrderIds: [],
      verifiesCheckupId: "",
      verifiedAt: null,
    },
    // Checkup 2 — Completed Needs Attention
    {
      id: "sample-hc-2",
      code: "HC-0002",
      assignmentId: "sample-asn-2",
      standardId: "sample-std-motor",
      standardName: "Motor health checkup",
      standardCode: "STD-0001",
      standardVersion: 2,
      machineType: "Motor",
      assetId: "sample-asset-2",
      assetName: "Sugar Grinder 01",
      assetCode: "AST-0002",
      assetLocation: "Sugar Grinding",
      technicianName: "Ravi Kumar",
      technicianUserId: "demo-user-1",
      technicianRole: "Technician",
      checkupDate: "2026-10-20",
      startedAt: oct20,
      completedAt: oct20,
      updatedAt: oct20,
      status: "Completed",
      items: checkup2Items,
      answers: checkup2Answers,
      notes: "Bearing temperature above limit. Scheduled bearing inspection for next week. Vibration still within range but trending upward.",
      healthStatus: "Needs Attention",
      score: 50,
      problems: [
        "Bearing / housing temperature: 78 °C (expected 20–75 °C)",
        "Noise condition: Fair",
      ],
      workOrderIds: [],
      verifiesCheckupId: "",
      verifiedAt: null,
    },
    // Checkup 1 — Completed Healthy
    {
      id: "sample-hc-1",
      code: "HC-0001",
      assignmentId: "sample-asn-1",
      standardId: "sample-std-motor",
      standardName: "Motor health checkup",
      standardCode: "STD-0001",
      standardVersion: 2,
      machineType: "Motor",
      assetId: "sample-asset-1",
      assetName: "Flour Automation",
      assetCode: "AST-0001",
      assetLocation: "Mixing",
      technicianName: "Ravi Kumar",
      technicianUserId: "demo-user-1",
      technicianRole: "Technician",
      checkupDate: "2026-10-20",
      startedAt: oct20,
      completedAt: oct20,
      updatedAt: oct20,
      status: "Completed",
      items: checkup1Items,
      answers: checkup1Answers,
      notes: "All checks passed. Motor running smoothly under normal production load.",
      healthStatus: "Healthy",
      score: 100,
      problems: [],
      workOrderIds: [],
      verifiesCheckupId: "",
      verifiedAt: null,
    },
  ];

  return { standards, assignments, checkups };
}

export function readHealthCheckupPreview(key: string): HealthCheckupPreview {
  const raw = localStorage.getItem(key);
  if (!raw) return sampleHealthCheckupPreview();
  const parsed = healthCheckupPreviewSchema.safeParse(JSON.parse(raw));
  if (!parsed.success)
    throw new Error(
      "This browser's health checkup preview could not be read. Keep your saved data and try again.",
    );
  return parsed.data;
}
