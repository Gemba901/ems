import type {
  Alignment,
  DemoRole,
  DemoSession,
  Dependencies,
  GoalData,
  ObjectiveData,
  PlanRecord,
  PlanningPeriod,
  PillarCode,
  SmartCheck,
  ValidationErrors,
  Version,
} from "./types";

// The only business-rule boundary. Move these checks behind the API after approval.
export const ALIGNMENTS: readonly Alignment[] = [
  "Quality",
  "Cost",
  "Delivery",
  "Safety",
  "Morale",
  "Technology",
];
export const DEMO_APPROVER_ID = "demo-emp-02";

export class PlanningRuleError extends Error {
  constructor(public readonly fields: ValidationErrors) {
    super(Object.values(fields).join(" "));
    this.name = "PlanningRuleError";
  }
}

export function demoSession(
  role: DemoRole,
  dependencies: Dependencies,
): DemoSession {
  const actor = {
    LEADERSHIP: "demo-emp-01",
    APPROVER: DEMO_APPROVER_ID,
    READER: "demo-emp-06",
  }[role];
  const employee = dependencies.employees.find((entry) => entry.id === actor);
  if (!employee) throw new Error("Choose a supported demo role.");
  return {
    role,
    employeeId: employee.id,
    name: employee.name,
    canEdit: role === "LEADERSHIP",
    canApprove: role === "APPROVER",
  };
}

export function requirePermission(
  session: DemoSession,
  action: "edit" | "approve",
) {
  const allowed =
    action === "edit"
      ? session.role === "LEADERSHIP"
      : session.role === "APPROVER" && session.employeeId === DEMO_APPROVER_ID;
  if (!allowed)
    throw new Error(
      action === "edit"
        ? "Only authorised leadership can change the plan."
        : "Only the designated approver can approve this record.",
    );
}

export function emptyObjective(): ObjectiveData {
  return {
    title: "",
    meaning: "",
    primaryPillarCode: null,
    alignments: [],
    ownerId: null,
    planningPeriodId: null,
  };
}
export function emptyGoal(): GoalData {
  return {
    resultStatement: "",
    measure: "",
    baseline: null,
    target: null,
    unit: "",
    ownerId: null,
    deadline: "",
    contributingDepartmentIds: [],
    smartExplanations: {},
    smartConfirmations: { specific: false, achievable: false, relevant: false },
  };
}
export function objectiveDraft(
  input: Partial<ObjectiveData>,
  current = emptyObjective(),
): ObjectiveData {
  const data = { ...current, ...input };
  return {
    ...data,
    title: data.title.trim(),
    meaning: data.meaning.trim(),
    alignments: [...new Set(data.alignments)],
  };
}
// Use for live form edits too: material changes require fresh human judgement.
// Keep untrimmed text while typing; normalise only when the draft is saved.
export function editGoalDraft(
  input: Partial<GoalData>,
  current = emptyGoal(),
): GoalData {
  const data = { ...current, ...input };
  const reviewedFields: (keyof GoalData)[] = [
    "resultStatement",
    "measure",
    "baseline",
    "target",
    "unit",
    "ownerId",
    "deadline",
    "contributingDepartmentIds",
  ];
  const changed = reviewedFields.some(
    (key) => JSON.stringify(data[key]) !== JSON.stringify(current[key]),
  );
  return {
    ...data,
    contributingDepartmentIds: [...new Set(data.contributingDepartmentIds)],
    smartExplanations: { ...data.smartExplanations },
    smartConfirmations: {
      ...(changed
        ? emptyGoal().smartConfirmations
        : current.smartConfirmations),
      ...input.smartConfirmations,
    },
  };
}

export function goalDraft(
  input: Partial<GoalData>,
  current = emptyGoal(),
): GoalData {
  const data = editGoalDraft(input, current);
  return {
    ...data,
    resultStatement: data.resultStatement.trim(),
    measure: data.measure.trim(),
    unit: data.unit.trim(),
  };
}

export function requireSameObjective(previousId: string, nextId: string) {
  if (previousId !== nextId)
    throw new Error("A goal cannot be moved to another objective.");
}

export function isDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}

// Incomplete drafts get unique temporary codes. Approval assigns the final code.
// Record IDs remain stable through draft, approval and every later revision.
export function generateCode(
  kind: "OBJ" | "GOAL",
  existing: readonly string[],
  pillar: PillarCode | null = null,
  period: PlanningPeriod | null = null,
): string {
  const prefix =
    pillar && period ? `${kind}-${pillar}-${period.year}-` : `${kind}-DRAFT-`;
  let maximum = 0;
  for (const code of existing) {
    if (!code.startsWith(prefix)) continue;
    const suffix = code.slice(prefix.length);
    if (/^\d+$/.test(suffix)) maximum = Math.max(maximum, Number(suffix));
  }
  return `${prefix}${String(maximum + 1).padStart(3, "0")}`;
}

export function validateObjective(
  data: ObjectiveData,
  refs: Dependencies,
): ValidationErrors {
  const errors: ValidationErrors = {};
  if (!data.title.trim()) errors.title = "Give the objective a clear title.";
  if (!data.meaning.trim())
    errors.meaning =
      "Explain the direction or outcome this objective gives the company.";
  if (!refs.pillars.some((item) => item.code === data.primaryPillarCode))
    errors.primaryPillarCode = "Select one of the six BEES pillars.";
  if (
    !data.alignments.length ||
    data.alignments.some((item) => !ALIGNMENTS.includes(item))
  )
    errors.alignments = "Select at least one QCDSMT alignment.";
  if (!refs.employees.some((item) => item.id === data.ownerId))
    errors.ownerId = "Choose an objective owner.";
  if (!refs.planningPeriods.some((item) => item.id === data.planningPeriodId))
    errors.planningPeriodId = "Choose a planning period.";
  // Objectives express direction. SMART and numeric targets apply only to goals.
  return errors;
}

export function smartReadiness(
  goal: GoalData,
  objective: ObjectiveData,
  refs: Dependencies,
): SmartCheck[] {
  const period = refs.planningPeriods.find(
    (item) => item.id === objective.planningPeriodId,
  );
  return [
    {
      dimension: "Specific",
      ready:
        !!goal.resultStatement.trim() &&
        goal.smartConfirmations.specific === true,
      message: "Confirm the result statement describes a specific achievement.",
    },
    {
      dimension: "Measurable",
      ready:
        !!goal.measure.trim() &&
        goal.target !== null &&
        Number.isFinite(goal.target) &&
        !!goal.unit.trim(),
      message:
        "Provide a measure, numeric target and unit. A target of zero is valid.",
    },
    {
      dimension: "Achievable",
      ready:
        goal.smartConfirmations.achievable === true &&
        refs.employees.some((item) => item.id === goal.ownerId),
      message: "Choose an owner and confirm the target is achievable.",
    },
    {
      dimension: "Relevant",
      ready:
        !!objective.meaning.trim() && goal.smartConfirmations.relevant === true,
      message: "Confirm the goal contributes to this objective.",
    },
    {
      dimension: "Time-bound",
      ready:
        !!period &&
        isDate(goal.deadline) &&
        goal.deadline >= period.startDate &&
        goal.deadline <= period.endDate,
      message: "Choose a deadline within the objective's planning period.",
    },
  ];
}

export function validateGoal(
  goal: GoalData,
  objective: ObjectiveData,
  refs: Dependencies,
): ValidationErrors {
  const errors: ValidationErrors = {};
  if (Object.keys(validateObjective(objective, refs)).length)
    errors.objective = "Complete and approve the linked objective first.";
  if (goal.baseline !== null && !Number.isFinite(goal.baseline))
    errors.baseline = "Enter a numeric baseline or leave it blank.";
  if (
    !goal.contributingDepartmentIds.length ||
    goal.contributingDepartmentIds.some(
      (id) => !refs.departments.some((item) => item.id === id),
    )
  )
    errors.contributingDepartmentIds =
      "Select at least one contributing department.";
  for (const check of smartReadiness(goal, objective, refs))
    if (!check.ready) errors[`smart.${check.dimension}`] = check.message;
  // Optional SMART explanations are intentionally not validated as required.
  // Achievement is never calculated from department contributions or employee scores.
  return errors;
}

export function assertValid(errors: ValidationErrors) {
  if (Object.keys(errors).length) throw new PlanningRuleError(errors);
}

export function newDraft<T>(data: T, actorId: string, now: string): Version<T> {
  return {
    number: 1,
    status: "Draft",
    data: structuredClone(data),
    createdAt: now,
    createdBy: actorId,
    updatedAt: now,
    updatedBy: actorId,
    approvedAt: null,
    approvedBy: null,
    effectiveDate: null,
    changeReason: null,
  };
}
export function currentVersion<T>(record: PlanRecord<T>): Version<T> {
  const latest = record.versions.at(-1);
  if (!latest) throw new Error("This record has no version.");
  return latest;
}
export function publishedVersion<T>(
  record: PlanRecord<T>,
  today: string,
): Version<T> | undefined {
  return record.versions
    .filter(
      (entry) =>
        entry.status === "Approved" &&
        !!entry.effectiveDate &&
        entry.effectiveDate <= today,
    )
    .at(-1);
}
export function visibleVersion<T>(
  record: PlanRecord<T>,
  role: DemoRole,
  today: string,
): Version<T> | undefined {
  return role === "READER"
    ? publishedVersion(record, today)
    : currentVersion(record);
}
export function requireEditable<T>(
  record: PlanRecord<T>,
  expectedVersion: number,
): Version<T> {
  const current = currentVersion(record);
  if (current.status === "Approved")
    throw new Error(
      "Approved records are locked. Start a revision with a reason and effective date.",
    );
  if (current.number !== expectedVersion)
    throw new Error(
      "This record has changed. Open its latest version before saving.",
    );
  return current;
}
export function revision<T>(
  record: PlanRecord<T>,
  reason: string,
  effectiveDate: string,
  actorId: string,
  now: string,
): Version<T> {
  const previous = currentVersion(record);
  if (previous.status !== "Approved")
    throw new Error(
      "Finish the existing draft or revision before starting another revision.",
    );
  if (!reason.trim())
    throw new Error("Explain why the approved record needs to change.");
  if (
    !isDate(effectiveDate) ||
    (previous.effectiveDate && effectiveDate < previous.effectiveDate)
  )
    throw new Error(
      "Choose an effective date on or after the previous approved version's effective date.",
    );
  return {
    ...newDraft(previous.data, actorId, now),
    number: previous.number + 1,
    status: "Revised",
    changeReason: reason.trim(),
    effectiveDate,
  };
}
export function approvedVersion<T>(
  current: Version<T>,
  actorId: string,
  now: string,
): Version<T> {
  if (current.status === "Approved")
    throw new Error("This version is already approved.");
  if (
    current.status === "Revised" &&
    (!current.changeReason?.trim() ||
      !current.effectiveDate ||
      !isDate(current.effectiveDate))
  )
    throw new Error("A revision needs a reason and a valid effective date.");
  return {
    ...structuredClone(current),
    status: "Approved",
    updatedAt: now,
    updatedBy: actorId,
    approvedAt: now,
    approvedBy: actorId,
    effectiveDate: current.effectiveDate ?? now.slice(0, 10),
  };
}
