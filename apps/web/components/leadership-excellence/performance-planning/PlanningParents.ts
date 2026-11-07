import type {
  ApprovedParentGoal,
  PlanningDocument,
  PlanningView,
} from "@/services/leadership-excellence/performance-planning.service";

function approvedParents(view: PlanningView): ApprovedParentGoal[] {
  // Older API responses can still supply their visible approved snapshots.
  // Draft document.data is never used as a source of parent goals.
  return (
    view.approvedParentGoals ??
    view.documents.flatMap((document) => {
      if (document.kind !== "COMPANY" && document.kind !== "DEPARTMENT")
        return [];
      const kind = document.kind;
      return document.versions.flatMap((version) =>
        version.data.goals.map((goal) => ({
          documentId: document.id,
          kind,
          cycle: document.cycle,
          scopeId: document.scopeId,
          departmentId: document.departmentId,
          version: version.version,
          effectiveDate: version.effectiveDate,
          goal,
        })),
      );
    })
  );
}

function parentOption(parent: ApprovedParentGoal, today: string) {
  return {
    value: JSON.stringify({
      documentId: parent.documentId,
      goalId: parent.goal.id,
      version: parent.version,
    }),
    label: `${parent.goal.code} · ${parent.goal.title} · v${parent.version}${
      parent.effectiveDate > today
        ? ` · Effective ${parent.effectiveDate}`
        : ""
    }`,
  };
}

const compareParents = (a: ApprovedParentGoal, b: ApprovedParentGoal) =>
  b.version - a.version || a.goal.code.localeCompare(b.goal.code);

export function approvedParentOptions(
  view: PlanningView,
  child: PlanningDocument,
  today: string,
) {
  return approvedParents(view)
    .filter(
      (parent) =>
        parent.cycle === child.cycle &&
        (child.kind === "DEPARTMENT"
          ? parent.kind === "COMPANY" &&
            parent.goal.departmentIds.includes(child.scopeId)
          : ["TEAM", "POSITION", "INDIVIDUAL"].includes(child.kind) &&
            parent.kind === "DEPARTMENT" &&
            parent.scopeId === child.departmentId),
    )
    .sort(compareParents)
    .map((parent) => parentOption(parent, today));
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
) {
  const options = approvedParentOptions(view, child, today);
  const departmentId =
    child.kind === "DEPARTMENT" ? child.scopeId : child.departmentId;
  const departmentName =
    view.references.departments.find((department) => department.id === departmentId)
      ?.name || "This department";
  const relevant = approvedParents(view).filter((parent) =>
    child.kind === "DEPARTMENT"
      ? parent.kind === "COMPANY"
      : ["TEAM", "POSITION", "INDIVIDUAL"].includes(child.kind) &&
        parent.kind === "DEPARTMENT" &&
        parent.scopeId === child.departmentId,
  );
  // Only authorised, same-year company snapshots may be shown as disabled
  // choices. Never reveal goals belonging to another person's department.
  const unavailableOptions: UnavailableParentOption[] =
    child.kind === "DEPARTMENT"
      ? relevant
          .filter(
            (parent) =>
              parent.cycle === child.cycle &&
              !parent.goal.departmentIds.includes(child.scopeId),
          )
          .sort(compareParents)
          .map((parent) => ({
            ...parentOption(parent, today),
            code: parent.goal.code,
            title: parent.goal.title,
            departmentNames: parent.goal.departmentIds.map(
              (id) =>
                view.references.departments.find((department) => department.id === id)
                  ?.name || "Unavailable department",
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
    "Approved goals appear here automatically. The selected approved version stays linked to this contribution.";
  if (!options.length) {
    if (unavailableOptions.length) {
      reason = "NOT_CONTRIBUTING_DEPARTMENT";
      message = `Approved company goals exist for ${child.cycle}, but ${departmentName} is not listed as a contributing department. An authorised planner must revise the company goal, add ${departmentName}, and approve the revision before you can link it.`;
    } else if (relevant.length) {
      reason = "DIFFERENT_YEAR";
      const years = [...new Set(relevant.map((parent) => parent.cycle))]
        .sort()
        .join(", ");
      message =
        child.kind === "DEPARTMENT"
          ? `Approved company goals are available for ${years}, but this plan uses ${child.cycle}. Choose the intended planning year and check its contributing departments, or approve a company goal for ${child.cycle}.`
          : `Approved goals in ${departmentName}'s plan are available for ${years}, but this plan uses ${child.cycle}. Choose the matching planning year or approve a department goal for ${child.cycle}.`;
    } else {
      reason = "NO_APPROVED_PARENT";
      message =
        child.kind === "DEPARTMENT"
          ? `No approved company goal is available for ${child.cycle}. Approve the company plan with ${departmentName} listed as a contributing department.`
          : `No approved goal is available in ${departmentName}'s plan for ${child.cycle}. Approve that department plan before linking a contribution.`;
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
    document.revisionReason,
    document.effectiveDate,
    document.history,
    document.acknowledgement,
  ]);
}
