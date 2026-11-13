import { planningPeriodLabel } from "@/services/leadership-excellence/performance-planning/planning-period";
import { objectiveAsGoal } from "@/services/leadership-excellence/performance-planning/measurable-objective";
import type {
  ApprovedParentGoal,
  PlanningDocument,
  PlanningView,
} from "@/services/leadership-excellence/performance-planning.service";

export function approvedParents(view: PlanningView): ApprovedParentGoal[] {
  // Older API responses can still supply their visible approved snapshots.
  // Draft document.data is never used as a source of parent goals.
  return (
    view.approvedParentGoals ??
    view.documents.flatMap((document) => {
      if (document.kind !== "COMPANY" && document.kind !== "DEPARTMENT")
        return [];
      const kind = document.kind;
      return document.versions.flatMap((version) => {
        const objectives =
          kind === "COMPANY" &&
          version.companyPlanningModel === "MEASURABLE_OBJECTIVES";
        const records = objectives
          ? version.data.objectives.map(objectiveAsGoal)
          : version.data.goals;
        return records
          .filter(
            (goal) =>
              !version.approvedItem || version.approvedItem.itemId === goal.id,
          )
          .map((goal) => ({
            ...(objectives ? { itemKind: "OBJECTIVE" as const } : {}),
            documentId: document.id,
            kind,
            cycle: document.cycle,
            scopeId: document.scopeId,
            departmentId: document.departmentId,
            version: version.version,
            effectiveDate: version.effectiveDate,
            goal,
          }));
      });
    })
  );
}

function parentOption(
  parent: ApprovedParentGoal,
  today: string,
  departmentName?: string,
) {
  return {
    value: JSON.stringify({
      documentId: parent.documentId,
      goalId: parent.goal.id,
      version: parent.version,
      ...(parent.itemKind ? { itemKind: parent.itemKind } : {}),
    }),
    label: `${departmentName ? `${departmentName} · ` : ""}${parent.kind === "COMPANY" && parent.itemKind !== "OBJECTIVE" ? "Existing goal link · " : ""}${parent.goal.code} · ${parent.goal.title} · v${parent.version}${
      parent.effectiveDate > today ? ` · Effective ${parent.effectiveDate}` : ""
    }`,
  };
}

const compareParents = (a: ApprovedParentGoal, b: ApprovedParentGoal) =>
  b.version - a.version || a.goal.code.localeCompare(b.goal.code);

function parentAvailableForGoal(
  parent: ApprovedParentGoal,
  childId?: string,
  currentGoalId?: string,
) {
  return (
    parent.retainedFor === undefined ||
    parent.retainedFor.some(
      (link) => link.documentId === childId && link.goalId === currentGoalId,
    )
  );
}

/** Existing company-goal links stay editable, but new department goals choose company objectives. */
function compatibleParent(
  view: PlanningView,
  parent: ApprovedParentGoal,
  childId?: string,
  currentGoalId?: string,
) {
  if (parent.kind !== "COMPANY" || parent.itemKind === "OBJECTIVE") return true;
  if (!childId || !currentGoalId) return false;
  if (
    parent.retainedFor?.some(
      (link) => link.documentId === childId && link.goalId === currentGoalId,
    )
  )
    return true;
  const existing = view.documents
    .find((plan) => plan.id === childId)
    ?.data.goals.find((goal) => goal.id === currentGoalId)?.parent;
  return (
    !!existing &&
    existing.itemKind !== "OBJECTIVE" &&
    existing.documentId === parent.documentId &&
    existing.goalId === parent.goal.id &&
    existing.version === parent.version
  );
}

/** Programme objectives are open to all departments; older directions retain
 * their saved contributor scope. Only the exact approved snapshot can grant
 * this eligibility, never a current draft or a different approved version. */
export function parentAvailableToDepartment(
  view: PlanningView,
  parent: ApprovedParentGoal,
  departmentId: string,
) {
  if (parent.kind !== "COMPANY") return false;
  if (parent.goal.departmentIds.includes(departmentId)) return true;
  if (parent.itemKind !== "OBJECTIVE") return false;
  const objective = view.documents
    .find((document) => document.id === parent.documentId)
    ?.versions.find((version) => version.version === parent.version)
    ?.data.objectives.find((item) => item.id === parent.goal.id);
  return !!objective?.result?.trim();
}

export function approvedParentOptions(
  view: PlanningView,
  child: Pick<
    PlanningDocument,
    "kind" | "cycle" | "scopeId" | "departmentId"
  > & {
    id?: string;
  },
  today: string,
  currentGoalId?: string,
) {
  return approvedParents(view)
    .filter(
      (parent) =>
        parentAvailableForGoal(parent, child.id, currentGoalId) &&
        compatibleParent(view, parent, child.id, currentGoalId) &&
        parent.cycle === child.cycle &&
        (child.kind === "DEPARTMENT"
          ? parent.kind === "COMPANY" &&
            parentAvailableToDepartment(view, parent, child.scopeId)
          : child.kind === "INDIVIDUAL"
            ? parent.kind === "COMPANY" || parent.kind === "DEPARTMENT"
            : parent.kind === "DEPARTMENT" &&
              ["TEAM", "POSITION"].includes(child.kind) &&
              parent.scopeId === child.departmentId),
    )
    .sort(compareParents)
    .map((parent) =>
      parentOption(
        parent,
        today,
        child.kind === "INDIVIDUAL"
          ? parent.kind === "COMPANY"
            ? "Company"
            : view.references.departments.find(
                (department) => department.id === parent.scopeId,
              )?.name || "Department"
          : undefined,
      ),
    );
}

export interface UnavailableParentOption {
  value: string;
  label: string;
  code: string;
  title: string;
  departmentNames: string[];
  reason: "NOT_CONTRIBUTING_DEPARTMENT";
}

/** Explain authorised approved choices without weakening their linkage rules. */
export function approvedParentAvailability(
  view: PlanningView,
  child: PlanningDocument,
  today: string,
  currentGoalId?: string,
) {
  const options = approvedParentOptions(view, child, today, currentGoalId);
  const departmentId =
    child.kind === "DEPARTMENT" ? child.scopeId : child.departmentId;
  const departmentName =
    view.references.departments.find(
      (department) => department.id === departmentId,
    )?.name || "This department";
  const relevant = approvedParents(view).filter(
    (parent) =>
      parentAvailableForGoal(parent, child.id, currentGoalId) &&
      compatibleParent(view, parent, child.id, currentGoalId) &&
      (child.kind === "DEPARTMENT"
        ? parent.kind === "COMPANY"
        : child.kind === "INDIVIDUAL"
          ? parent.kind === "COMPANY" || parent.kind === "DEPARTMENT"
          : parent.kind === "DEPARTMENT" &&
            ["TEAM", "POSITION"].includes(child.kind) &&
            parent.scopeId === child.departmentId),
  );
  // Only authorised, same-year company snapshots may be shown as disabled
  // choices for non-contributing departments.
  const unavailableOptions: UnavailableParentOption[] =
    child.kind === "DEPARTMENT"
      ? relevant
          .filter(
            (parent) =>
              parent.cycle === child.cycle &&
              !parentAvailableToDepartment(view, parent, child.scopeId),
          )
          .sort(compareParents)
          .map((parent) => ({
            ...parentOption(parent, today),
            code: parent.goal.code,
            title: parent.goal.title,
            departmentNames: parent.goal.departmentIds.map(
              (id) =>
                view.references.departments.find(
                  (department) => department.id === id,
                )?.name || "Unavailable department",
            ),
            reason: "NOT_CONTRIBUTING_DEPARTMENT" as const,
          }))
      : [];
  let reason:
    | "AVAILABLE"
    | "NOT_CONTRIBUTING_DEPARTMENT"
    | "DIFFERENT_YEAR"
    | "NO_APPROVED_PARENT" = "AVAILABLE";
  let message =
    child.kind === "INDIVIDUAL"
      ? "Approved company objectives and department goals available to you appear here automatically. Each contribution retains its selected approved version."
      : child.kind === "DEPARTMENT"
        ? "Approved company objectives appear here automatically. The selected approved version stays linked to this department goal."
        : "Approved department goals appear here automatically. The selected approved version stays linked to this goal.";
  if (!options.length) {
    if (unavailableOptions.length) {
      reason = "NOT_CONTRIBUTING_DEPARTMENT";
      message = `Approved company objectives exist for ${planningPeriodLabel(child.cycle)}, but ${departmentName} is not listed as a contributing department. An authorised planner must revise the company objective, add ${departmentName}, and approve the revision before you can link it.`;
    } else if (relevant.length) {
      reason = "DIFFERENT_YEAR";
      const years = [...new Set(relevant.map((parent) => parent.cycle))]
        .sort()
        .map(planningPeriodLabel)
        .join(", ");
      message =
        child.kind === "DEPARTMENT"
          ? `Approved company objectives are available for ${years}, but this plan uses ${planningPeriodLabel(child.cycle)}. Choose the intended planning period and check its contributing departments, or approve a company objective for ${planningPeriodLabel(child.cycle)}.`
          : child.kind === "INDIVIDUAL"
            ? `The approved company objectives or department goals available to you are for ${years}, but this plan uses ${planningPeriodLabel(child.cycle)}. Choose the matching planning period or ask an authorised planner to approve a company objective or department goal for ${planningPeriodLabel(child.cycle)}.`
            : `Approved department goals in ${departmentName}'s plan are available for ${years}, but this plan uses ${planningPeriodLabel(child.cycle)}. Choose the matching planning period or approve a department goal for ${planningPeriodLabel(child.cycle)}.`;
    } else {
      reason = "NO_APPROVED_PARENT";
      message =
        child.kind === "DEPARTMENT"
          ? `No approved company objective is available for ${planningPeriodLabel(child.cycle)}. Approve a company objective for the matching planning period.`
          : child.kind === "INDIVIDUAL"
            ? `There are no approved company objectives or department goals available to you for ${planningPeriodLabel(child.cycle)}. Check the planning period or ask an authorised planner to approve a company objective or department goal you can access before linking a contribution.`
            : `No approved department goal is available in ${departmentName}'s plan for ${planningPeriodLabel(child.cycle)}. Approve a department goal before linking a contribution.`;
    }
  }
  return { options, unavailableOptions, reason, message, departmentName };
}

/** Ignore derived permissions/issues, but retain every persisted plan field. */
export function planningDocumentFingerprint(document: PlanningDocument) {
  return JSON.stringify([
    document.id,
    document.kind,
    document.scopeId,
    document.departmentId,
    document.cycle,
    document.status,
    document.data,
    document.versions,
    document.findingReviews,
    document.revisionReason,
    document.effectiveDate,
    document.history,
    document.acknowledgement,
  ]);
}
