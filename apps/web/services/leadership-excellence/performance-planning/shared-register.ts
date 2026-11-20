import type { Goal, Objective, PlanKind, PlanningView } from "./types";

export type RegisterPlan = PlanningView["documents"][number];
export type RegisterLevel = Exclude<PlanKind, "SWOT">;

export const registerLevelLabels: Record<RegisterLevel, string> = {
  COMPANY: "Company",
  DEPARTMENT: "Department",
  TEAM: "Team",
  INDIVIDUAL: "Individual",
  POSITION: "Position",
};

type RegisterRowBase = {
  key: string;
  itemId: string;
  document: RegisterPlan;
  level: RegisterLevel;
  scopeLabel: string;
  ownerLabel: string;
  title: string;
  code: string;
  deadline: string;
  objectiveTitle: string;
  parentTitle: string;
};

export type SharedRegisterRow = RegisterRowBase &
  (
    | { kind: "goal"; goal: Goal; objective?: Objective }
    | { kind: "objective"; objective: Objective; goal?: never }
  );

export type RegisterFilters = {
  search: string;
  level: RegisterLevel | "";
  status: RegisterPlan["status"] | "";
};

export function registerOwner(view: PlanningView, id: string) {
  return (
    view.references.people.find((person) => person.id === id)?.name ||
    (id ? "Owner unavailable" : "Not assigned")
  );
}

export function registerScope(view: PlanningView, plan: RegisterPlan) {
  switch (plan.kind) {
    case "COMPANY":
      return "Company";
    case "DEPARTMENT":
      return (
        view.references.departments.find(
          (item) => item.id === (plan.scopeId || plan.departmentId),
        )?.name || "Department unavailable"
      );
    case "TEAM":
      return (
        view.references.teams.find((item) => item.id === plan.scopeId)?.name ||
        "Team unavailable"
      );
    case "POSITION":
      return (
        view.references.positions?.find((item) => item.id === plan.scopeId)
          ?.name || "Position unavailable"
      );
    case "INDIVIDUAL":
      return registerOwner(view, plan.scopeId);
    default:
      return plan.data.title || plan.code;
  }
}

export function registerValue(value: number | null | undefined, unit = "") {
  return value == null ? "Not set" : `${value}${unit ? ` ${unit}` : ""}`;
}

/** Resolve a contribution against its linked APPROVED version, never a draft. */
function parentContext(
  view: PlanningView,
  cycle: string,
  goal: Goal,
  seen = new Set<string>(),
): { parentTitle: string; objectiveTitle: string } {
  const parent = goal.parent;
  if (!parent) return { parentTitle: "", objectiveTitle: "" };
  const key = `${parent.documentId}/${parent.version}/${parent.goalId}`;
  if (seen.has(key)) return { parentTitle: "", objectiveTitle: "" };
  seen.add(key);
  const plan = view.documents.find(
    (item) =>
      item.id === parent.documentId &&
      item.cycle === cycle &&
      item.permissions.canRead,
  );
  const snapshot = plan?.versions.find(
    (item) => item.version === parent.version,
  )?.data;
  const parentGoal = snapshot?.goals.find((item) => item.id === parent.goalId);
  const summary = view.approvedParentGoals?.find(
    (item) =>
      item.cycle === cycle &&
      item.documentId === parent.documentId &&
      item.version === parent.version &&
      item.goal.id === parent.goalId,
  );
  const objective = snapshot?.objectives.find(
    (item) => item.id === parentGoal?.objectiveId,
  );
  return {
    parentTitle:
      parentGoal?.title ||
      summary?.goal.title ||
      "Approved parent goal unavailable",
    objectiveTitle:
      objective?.title ||
      (parentGoal
        ? parentContext(view, cycle, parentGoal, seen).objectiveTitle
        : ""),
  };
}

/**
 * A read model of the existing register, not a second collection of records.
 * The API has already applied document ACLs and published snapshots for readers.
 * Use that data as delivered: do not substitute a newer version or hide an
 * employee's own authorised draft. No raw SWOT content is included in rows.
 */
export function sharedRegisterRows(
  view: PlanningView,
  cycle: string,
): SharedRegisterRow[] {
  return view.documents.flatMap<SharedRegisterRow>((document) => {
    if (
      document.kind === "SWOT" ||
      document.cycle !== cycle ||
      !document.permissions.canRead
    )
      return [];
    const level = document.kind;
    const scopeLabel = registerScope(view, document);
    const rows: SharedRegisterRow[] = document.data.goals.map((goal) => {
      const objective = document.data.objectives.find(
        (item) => item.id === goal.objectiveId,
      );
      const context = parentContext(view, cycle, goal);
      return {
        key: `${document.id}/goal/${goal.id}`,
        itemId: goal.id,
        kind: "goal",
        document,
        level,
        scopeLabel,
        goal,
        objective,
        title: goal.title || "Untitled draft goal",
        code: goal.code,
        ownerLabel: registerOwner(view, goal.ownerId),
        deadline: goal.endDate,
        objectiveTitle: objective?.title || context.objectiveTitle,
        parentTitle: context.parentTitle,
      };
    });
    // Saving an incomplete objective is valid. Keep it reachable until its
    // first goal is added, rather than dropping it from the shared register.
    for (const objective of document.data.objectives) {
      if (document.data.goals.some((goal) => goal.objectiveId === objective.id))
        continue;
      rows.push({
        key: `${document.id}/objective/${objective.id}`,
        itemId: objective.id,
        kind: "objective",
        document,
        level,
        scopeLabel,
        objective,
        title: objective.title || "Untitled draft objective",
        code: objective.code,
        ownerLabel: registerOwner(view, objective.ownerId),
        deadline: objective.endDate,
        objectiveTitle: objective.title,
        parentTitle: "",
      });
    }
    return rows;
  });
}

export function filterSharedRegisterRows(
  rows: SharedRegisterRow[],
  filters: RegisterFilters,
) {
  const query = filters.search.trim().toLocaleLowerCase();
  return rows.filter(
    (row) =>
      (!filters.level || row.level === filters.level) &&
      (!filters.status || row.document.status === filters.status) &&
      (!query ||
        [
          row.title,
          row.code,
          row.objectiveTitle,
          row.parentTitle,
          row.scopeLabel,
          row.ownerLabel,
          row.kind === "goal" ? row.goal.measure : row.objective.meaning,
        ]
          .join(" ")
          .toLocaleLowerCase()
          .includes(query)),
  );
}
