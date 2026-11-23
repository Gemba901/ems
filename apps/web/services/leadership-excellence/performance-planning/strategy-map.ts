import type {
  ApprovedVersion,
  Goal,
  Objective,
  ParentGoal,
  PlanningReferences,
  PlanningView,
} from "./types";
import {
  objectiveAlignmentLabels,
  objectiveAsGoal,
  objectiveHasOwnMeasurement,
  resolveParentGoal,
} from "./measurable-objective";

type ReadablePlan = PlanningView["documents"][number];

export interface StrategyMapAction {
  key: string;
  id: string;
  code: string;
  title: string;
  owner: string;
  dueDate: string;
  expectedResult: string;
  department: string;
  documentId: string;
  version: number;
}

export interface StrategyMapGoal {
  id: string;
  code: string;
  title: string;
  measure: string;
  baseline: number | null;
  target: number | null;
  unit: string;
  owner: string;
  deadline: string;
  departments: string[];
  actions: StrategyMapAction[];
  contributions?: StrategyMapDepartmentContribution[];
  result?: string;
  definition?: string;
  direction?: string;
  baselinePeriod?: string;
  dataSource?: string;
  reviewFrequency?: string;
  guardrails?: string;
}

export interface StrategyMapDepartmentContribution {
  id: string;
  documentId: string;
  version: number;
  code: string;
  title: string;
  department: string;
  measure: string;
  baseline: number | null;
  target: number | null;
  unit: string;
  deadline: string;
}

export interface StrategyMapObjective {
  id: string;
  code: string;
  title: string;
  meaning: string;
  pillar: string;
  pillarName: string;
  alignments: string[];
  owner: string;
  priority: number | null;
  weightage: number | null;
  /** Own approved measure; a read-only projection, never a second saved goal. */
  measurement?: StrategyMapGoal | null;
  goals: StrategyMapGoal[];
}

export interface StrategyMapIndividualGoal {
  planId: string;
  planCode: string;
  version: number;
  employee: string;
  position: string;
  department: string;
  id: string;
  code: string;
  title: string;
  measure: string;
  baseline: number | null;
  target: number | null;
  unit: string;
  deadline: string;
  parentKind:
    | "Company"
    | "Company objective"
    | "Department"
    | "Responsibility"
    | "Approved goal";
  parentTitle: string;
  parentCode: string;
  parentVersion: number | null;
  companyObjectiveId: string | null;
}

export interface StrategyMap {
  cycle: string;
  asOf: string;
  plan: {
    id: string;
    code: string;
    title: string;
    version: number;
    effectiveDate: string;
    approvedAt: string;
    owner: string;
    startDate: string;
    endDate: string;
  } | null;
  direction: {
    company: string;
    purpose: string;
    vision: string;
    mission: string;
    values: string[];
    version: number | null;
  };
  objectives: StrategyMapObjective[];
  individualGoals: StrategyMapIndividualGoal[];
  notices: string[];
}

/** Match the API's published-version selection, without touching draft data. */
export function effectiveVersion(
  document: ReadablePlan,
  asOf: string,
): ApprovedVersion | undefined {
  const versions = document.versions
    .filter((version) => version.effectiveDate && version.effectiveDate <= asOf)
    .sort((a, b) => a.version - b.version);
  const latest = versions.at(-1);
  if (!latest || !versions.some((version) => version.approvedItem))
    return latest;
  const objectives = new Map<string, Objective>();
  const goals = new Map<string, Goal>();
  let model = "";
  for (const version of versions) {
    const nextModel = version.companyPlanningModel || "LINKED_GOALS";
    if (!version.approvedItem || (model && nextModel !== model)) {
      objectives.clear();
      goals.clear();
    }
    model = nextModel;
    // A cumulative snapshot approves only its designated item. Other rows can
    // contain a future-effective revision and must never leak into this map.
    for (const objective of version.data.objectives)
      if (
        !version.approvedItem ||
        (version.approvedItem.kind === "objective" &&
          version.approvedItem.itemId === objective.id)
      )
        objectives.set(objective.id, objective);
    for (const goal of version.data.goals)
      if (
        !version.approvedItem ||
        (version.approvedItem.kind === "goal" &&
          version.approvedItem.itemId === goal.id)
      )
        goals.set(goal.id, goal);
  }
  return {
    ...latest,
    data: {
      ...latest.data,
      objectives: [...objectives.values()],
      goals: [...goals.values()],
    },
  };
}

function itemApprovalVersion(
  document: ReadablePlan,
  asOf: string,
  kind: "objective" | "goal",
  id: string,
  fallback: ApprovedVersion,
) {
  return (
    [...document.versions]
      .filter(
        (version) =>
          version.effectiveDate &&
          version.effectiveDate <= asOf &&
          (!version.approvedItem ||
            (version.approvedItem.kind === kind &&
              version.approvedItem.itemId === id)),
      )
      .sort((a, b) => b.version - a.version)
      .find((version) =>
        (kind === "objective"
          ? version.data.objectives
          : version.data.goals
        ).some((item) => item.id === id),
      ) || fallback
  );
}

function validEffectiveDate(value: string): boolean {
  const parsed = Date.parse(value);
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(parsed) &&
    new Date(parsed).toISOString().slice(0, 10) === value
  );
}

/** Execution handover reads exactly one currently effective approved measure per record. */
export function approvedPlanningCommitments(
  view: PlanningView,
  cycle: string,
  asOf: string,
) {
  if (!validEffectiveDate(asOf)) return [];
  return view.documents
    .filter(
      (plan) =>
        plan.permissions.canRead &&
        plan.kind !== "SWOT" &&
        plan.cycle === cycle,
    )
    .flatMap((plan) => {
      const version = effectiveVersion(plan, asOf);
      if (!version) return [];
      const objectives =
        plan.kind === "COMPANY"
          ? version.data.objectives.filter(
              (objective) =>
                version.companyPlanningModel === "MEASURABLE_OBJECTIVES" ||
                objectiveHasOwnMeasurement(objective),
            )
          : [];
      const goals =
        plan.kind === "COMPANY" &&
        version.companyPlanningModel === "MEASURABLE_OBJECTIVES"
          ? []
          : version.data.goals.filter(
              (goal) =>
                !objectives.some(
                  (objective) => objective.id === goal.objectiveId,
                ),
            );
      return [
        ...objectives.map((objective) => ({
          plan,
          version: itemApprovalVersion(
            plan,
            asOf,
            "objective",
            objective.id,
            version,
          ),
          goal: objectiveAsGoal(objective),
          itemKind: "OBJECTIVE" as const,
        })),
        ...goals.map((goal) => ({
          plan,
          version: itemApprovalVersion(plan, asOf, "goal", goal.id, version),
          goal,
          itemKind: "GOAL" as const,
        })),
      ];
    });
}

function directionSummary(
  references: PlanningReferences,
): StrategyMap["direction"] {
  // Direction is an approved, read-only Area 01 reference. Older API responses
  // do not include values; leave them missing rather than inventing a master.
  const direction = references.direction;
  const values: unknown = (direction as { values?: unknown } | null | undefined)
    ?.values;
  return {
    company: direction?.company || "",
    purpose: direction?.purpose || "",
    vision: direction?.vision || "",
    mission: direction?.mission || "",
    values: Array.isArray(values)
      ? values.flatMap((value) => {
          const name =
            typeof value === "string"
              ? value
              : value && typeof value === "object" && "name" in value
                ? value.name
                : "";
          return typeof name === "string" && name.trim() ? [name] : [];
        })
      : typeof values === "string" && values.trim()
        ? [values]
        : [],
    version: direction?.version ?? null,
  };
}

/**
 * A print-only read model of the existing, permission-filtered workspace.
 * It never saves records, uses unapproved edits, or exports SWOT, evidence,
 * employee result scores or the detailed action plan. Company measures remain
 * the company's own measures, not a roll-up of departmental achievements.
 */
export function buildStrategyMap(
  view: PlanningView,
  cycle: string,
  asOf: string,
): StrategyMap {
  const result: StrategyMap = {
    cycle,
    asOf,
    plan: null,
    direction: directionSummary(view.references),
    objectives: [],
    individualGoals: [],
    notices: [],
  };
  if (!validEffectiveDate(asOf)) {
    result.notices.push("Choose a valid effective date for this strategy map.");
    return result;
  }
  const readable = view.documents.filter(
    (document) => document.cycle === cycle && document.permissions.canRead,
  );
  const companies = readable.filter((document) => document.kind === "COMPANY");
  if (companies.length > 1) {
    result.notices.push(
      "More than one company plan is available for this period. Resolve the duplicate before printing a single company strategy map.",
    );
    return result;
  }
  const company = companies[0];
  const approved = company && effectiveVersion(company, asOf);
  if (!company || !approved) {
    const next = company?.versions
      .filter((version) => version.effectiveDate > asOf)
      .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))[0];
    result.notices.push(
      next
        ? `An approved company plan becomes effective on ${next.effectiveDate}. Choose that date or later to preview it.`
        : "No approved company plan is available for this period and effective date. Approve the company plan first.",
    );
    return result;
  }
  const owner = (id: string) =>
    view.references.people.find((person) => person.id === id)?.name ||
    (id ? "Owner unavailable" : "Not assigned");
  const department = (id: string) =>
    view.references.departments.find((item) => item.id === id)?.name ||
    "Department unavailable";
  result.plan = {
    id: company.id,
    code: company.code,
    title: approved.data.title,
    version: approved.version,
    effectiveDate: approved.effectiveDate,
    approvedAt: approved.approvedAt,
    owner: owner(approved.data.ownerId),
    startDate: approved.data.startDate,
    endDate: approved.data.endDate,
  };
  if (
    !result.direction.vision ||
    !result.direction.mission ||
    !result.direction.values.length
  ) {
    result.notices.push(
      "Some mission, vision or values are not available from the approved Strategic Direction reference. Missing details are labelled on the map.",
    );
  }
  const actionsByGoal = new Map<string, Map<string, StrategyMapAction>>();
  const contributionsByGoal = new Map<
    string,
    StrategyMapDepartmentContribution[]
  >();
  let earlierVersionLinks = 0;
  // A per-item approval publishes a cumulative plan snapshot. Approving a
  // different objective must not disconnect an unchanged, pinned parent.
  const matchesCompanyParent = (parent: ParentGoal): boolean => {
    if (parent.documentId !== company.id) return false;
    if (parent.version === approved.version)
      return !!resolveParentGoal(approved.data, parent);
    if (!company.itemApprovals?.length) return false;
    const previous = company.versions.find(
      (version) =>
        version.version === parent.version &&
        version.effectiveDate &&
        version.effectiveDate <= asOf,
    );
    if (!previous) return false;
    const currentItem =
      parent.itemKind === "OBJECTIVE"
        ? approved.data.objectives.find((item) => item.id === parent.goalId)
        : approved.data.goals.find((item) => item.id === parent.goalId);
    const linkedItem =
      parent.itemKind === "OBJECTIVE"
        ? previous.data.objectives.find((item) => item.id === parent.goalId)
        : previous.data.goals.find((item) => item.id === parent.goalId);
    return (
      !!currentItem &&
      !!linkedItem &&
      JSON.stringify(currentItem) === JSON.stringify(linkedItem)
    );
  };
  for (const document of readable) {
    // Individual/shared links are commitments to an existing department action,
    // not extra high-level actions. Read each original department action once.
    if (document.kind !== "DEPARTMENT") continue;
    const snapshot = effectiveVersion(document, asOf);
    if (!snapshot) continue;
    const companyGoals = new Map<string, string>();
    for (const contribution of snapshot.data.goals) {
      const parent = contribution.parent;
      if (parent?.documentId !== company.id) continue;
      if (!matchesCompanyParent(parent)) {
        earlierVersionLinks += 1;
        continue;
      }
      if (!resolveParentGoal(approved.data, parent)) continue;
      const parentKey = `${parent.itemKind || "GOAL"}/${parent.goalId}`;
      companyGoals.set(contribution.id, parentKey);
      contributionsByGoal.set(parentKey, [
        ...(contributionsByGoal.get(parentKey) || []),
        {
          id: contribution.id,
          documentId: document.id,
          version: snapshot.version,
          code: contribution.code,
          title: contribution.title,
          department: department(document.scopeId || document.departmentId),
          measure: contribution.measure,
          baseline: contribution.baseline ?? null,
          target: contribution.target ?? null,
          unit: contribution.unit,
          deadline: contribution.endDate,
        },
      ]);
    }
    for (const action of snapshot.data.actions) {
      const companyGoalId = companyGoals.get(action.goalId);
      if (!companyGoalId) continue;
      const key = `${document.id}/${snapshot.version}/${action.id}`;
      let goalActions = actionsByGoal.get(companyGoalId);
      if (!goalActions)
        actionsByGoal.set(companyGoalId, (goalActions = new Map()));
      goalActions.set(key, {
        key,
        id: action.id,
        code: action.code,
        title: action.title,
        owner: owner(action.ownerId),
        dueDate: action.dueDate,
        expectedResult: action.expectedResult,
        department: department(document.scopeId || document.departmentId),
        documentId: document.id,
        version: snapshot.version,
      });
    }
  }
  if (earlierVersionLinks) {
    result.notices.push(
      `${earlierVersionLinks} approved department contribution${earlierVersionLinks === 1 ? " links" : "s link"} to a different company plan version. Their actions are excluded from this map until the links match the displayed version.`,
    );
  }
  const measured = (goal: Goal, key: string): StrategyMapGoal => ({
    id: goal.id,
    code: goal.code,
    title: goal.title,
    measure: goal.measure,
    baseline: goal.baseline ?? null,
    target: goal.target ?? null,
    unit: goal.unit,
    owner: owner(goal.ownerId),
    deadline: goal.endDate,
    departments: [...new Set(goal.departmentIds)].map(department),
    actions: [...(actionsByGoal.get(key)?.values() || [])].sort(
      (a, b) =>
        a.dueDate.localeCompare(b.dueDate) || a.code.localeCompare(b.code),
    ),
    contributions: contributionsByGoal.get(key) || [],
  });
  result.objectives = approved.data.objectives.map((objective) => {
    const ownMeasurement =
      approved.companyPlanningModel === "MEASURABLE_OBJECTIVES" ||
      objectiveHasOwnMeasurement(objective);
    return {
      id: objective.id,
      code: objective.code,
      title: objective.title,
      meaning: objective.meaning === objective.result ? "" : objective.meaning,
      pillar: objective.pillar,
      pillarName:
        view.references.pillars.find(
          (pillar) => pillar.code === objective.pillar,
        )?.name ||
        objective.pillar ||
        "Not assigned",
      alignments: objectiveAlignmentLabels(objective),
      owner: owner(objective.ownerId),
      priority:
        typeof objective.priority === "number" &&
        Number.isFinite(objective.priority)
          ? objective.priority
          : null,
      weightage:
        typeof objective.weightage === "number" &&
        Number.isFinite(objective.weightage)
          ? objective.weightage
          : null,
      measurement: ownMeasurement
        ? {
            ...measured(
              objectiveAsGoal(objective),
              `OBJECTIVE/${objective.id}`,
            ),
            result:
              objective.result && objective.result !== objective.title
                ? objective.result
                : "",
            definition: objective.definition,
            direction: objective.direction,
            baselinePeriod: objective.baselinePeriod,
            dataSource: objective.dataSource,
            reviewFrequency: objective.reviewFrequency,
            guardrails: objective.guardrails,
          }
        : null,
      goals: ownMeasurement
        ? []
        : approved.data.goals
            .filter((goal) => goal.objectiveId === objective.id)
            .map((goal) => measured(goal, `GOAL/${goal.id}`)),
    };
  });
  // Every employee commitment is read from its own effective approved snapshot.
  // Parent versions describe the link; they never replace the employee's measure.
  for (const document of readable.filter(
    (entry) => entry.kind === "INDIVIDUAL",
  )) {
    const snapshot = effectiveVersion(document, asOf);
    if (!snapshot) continue;
    const employee = view.references.people.find(
      (person) => person.id === document.scopeId,
    );
    for (const goal of snapshot.data.goals) {
      const parent = goal.parent;
      const parentDocument =
        parent &&
        readable.find(
          (entry) =>
            entry.id === parent.documentId &&
            ["COMPANY", "DEPARTMENT"].includes(entry.kind),
        );
      const parentSnapshot = parentDocument?.versions.find(
        (version) =>
          version.version === parent?.version &&
          version.effectiveDate &&
          version.effectiveDate <= asOf,
      );
      const parentGoal =
        parentSnapshot && parent
          ? resolveParentGoal(parentSnapshot.data, parent)
          : undefined;
      const publishedParent =
        parent &&
        view.approvedParentGoals?.find(
          (entry) =>
            entry.documentId === parent.documentId &&
            entry.version === parent.version &&
            entry.goal.id === parent.goalId &&
            (entry.itemKind || "GOAL") === (parent.itemKind || "GOAL") &&
            entry.cycle === cycle &&
            entry.effectiveDate &&
            entry.effectiveDate <= asOf,
        );
      const companyParent =
        (parentDocument?.kind || publishedParent?.kind) === "COMPANY"
          ? parent
          : parentGoal?.parent;
      const companyGoal =
        companyParent && matchesCompanyParent(companyParent)
          ? resolveParentGoal(approved.data, companyParent)
          : undefined;
      result.individualGoals.push({
        planId: document.id,
        planCode: document.code,
        version: snapshot.version,
        employee: employee?.name || owner(snapshot.data.ownerId),
        position: employee?.position || "Position unavailable",
        department: department(employee?.departmentId || document.departmentId),
        id: goal.id,
        code: goal.code,
        title: goal.title,
        measure: goal.measure,
        baseline: goal.baseline ?? null,
        target: goal.target ?? null,
        unit: goal.unit,
        deadline: goal.endDate,
        parentKind: !parent
          ? "Responsibility"
          : (parentDocument?.kind || publishedParent?.kind) === "COMPANY"
            ? parent.itemKind === "OBJECTIVE"
              ? "Company objective"
              : "Company"
            : (parentDocument?.kind || publishedParent?.kind) === "DEPARTMENT"
              ? "Department"
              : "Approved goal",
        parentTitle: !parent
          ? "Approved ongoing responsibility"
          : parentGoal?.title ||
            publishedParent?.goal.title ||
            "Approved parent details unavailable for this date",
        parentCode: parentGoal?.code || publishedParent?.goal.code || "",
        parentVersion: parent?.version ?? null,
        companyObjectiveId: companyGoal?.objectiveId || null,
      });
    }
  }
  if (!result.objectives.length)
    result.notices.push(
      "This approved company version has no objectives to display.",
    );
  if (
    approved.companyPlanningModel !== "MEASURABLE_OBJECTIVES" &&
    approved.data.goals.some(
      (goal) =>
        !approved.data.objectives.some(
          (objective) => objective.id === goal.objectiveId,
        ),
    )
  ) {
    result.notices.push(
      "An approved company goal has no matching objective. Correct its link through a dated revision before including it in the strategy map.",
    );
  }
  return result;
}
