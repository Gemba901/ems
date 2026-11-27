import type {
  Goal,
  ParentGoal,
  PlanningDocument,
  PlanningState,
} from './planning.types';

export function validDepartmentGoalNumber(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

/** Parent versions revise a commitment; they do not create a new numbering scope. */
export function sameDepartmentGoalParent(
  left: ParentGoal | null | undefined,
  right: ParentGoal | null | undefined,
): boolean {
  return (
    !!left &&
    !!right &&
    left.documentId === right.documentId &&
    left.goalId === right.goalId &&
    (left.itemKind || 'GOAL') === (right.itemKind || 'GOAL')
  );
}

/** Seed old workspaces from retained records before reserving any new number. */
export function reserveDepartmentGoalNumbers(
  state: PlanningState,
  document: PlanningDocument,
  parent: ParentGoal,
) {
  const key = JSON.stringify([
    document.cycle,
    document.scopeId,
    parent.documentId,
    parent.itemKind || 'GOAL',
    parent.goalId,
  ]);
  const counters = (state.departmentGoalSequences ||= {});
  let high = validDepartmentGoalNumber(counters[key]) ? counters[key] : 0;
  const used = new Map<number, Set<string>>();
  const include = (goal: Goal) => {
    if (
      !sameDepartmentGoalParent(goal.parent, parent) ||
      !validDepartmentGoalNumber(goal.goalNo)
    )
      return;
    high = Math.max(high, goal.goalNo);
    const owners = used.get(goal.goalNo) || new Set<string>();
    owners.add(goal.id);
    used.set(goal.goalNo, owners);
  };
  for (const candidate of state.documents) {
    if (
      candidate.kind !== 'DEPARTMENT' ||
      candidate.scopeId !== document.scopeId ||
      candidate.cycle !== document.cycle
    )
      continue;
    candidate.data.goals.forEach(include);
    for (const version of candidate.versions) {
      for (const goal of version.data.goals) {
        if (
          version.approvedItem &&
          (version.approvedItem.kind !== 'goal' ||
            version.approvedItem.itemId !== goal.id)
        )
          continue;
        include(goal);
      }
    }
  }
  counters[key] = high;
  return { key, high, used };
}
