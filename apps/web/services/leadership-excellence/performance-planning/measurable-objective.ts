import type { Goal, Objective, ParentGoal, PlanData } from "./types";
import { businessAlignmentLabels } from "./business-alignment";

/** Do not infer a company result by adding or choosing among legacy goals. */
export function objectiveHasOwnMeasurement(objective: Objective): boolean {
  return Object.hasOwn(objective, "measure");
}

/** Read every selected area from the canonical array, with legacy scalar fallback. */
export function objectiveAlignmentLabels(objective: Objective): string[] {
  // Older approved objectives stored business focus with an empty tag array.
  // New empty drafts also clear the scalar, so this preserves history only.
  if (!objective.alignments?.length && objective.alignment === "OTHER")
    return businessAlignmentLabels({ ...objective, alignments: ["OTHER"] });
  return businessAlignmentLabels(objective);
}

/** Read-only adapter for existing presentation components; never persist a second goal. */
export function objectiveAsGoal(objective: Objective): Goal {
  return {
    id: objective.id,
    code: objective.code,
    createdAt: objective.createdAt,
    createdBy: objective.createdBy,
    updatedAt: objective.updatedAt,
    updatedBy: objective.updatedBy,
    title: objective.title,
    objectiveId: objective.id,
    parent: null,
    ongoingReason: "",
    measure: objective.measure || "",
    definitionId: "",
    baseline: objective.baseline ?? null,
    baselineReason: objective.baselineReason || "",
    target: objective.target ?? null,
    unit: objective.unit || "",
    ownerId: objective.ownerId,
    startDate: objective.startDate,
    endDate: objective.endDate,
    approach: objective.approach || "",
    departmentIds: [...(objective.departmentIds || [])],
  };
}

/** Explicit kind preserves exact old references without reinterpreting their IDs. */
export function resolveParentGoal(
  data: PlanData,
  parent: ParentGoal,
): Goal | undefined {
  if (parent.itemKind === "OBJECTIVE") {
    const objective = data.objectives.find((item) => item.id === parent.goalId);
    return objective ? objectiveAsGoal(objective) : undefined;
  }
  return data.goals.find((item) => item.id === parent.goalId);
}
