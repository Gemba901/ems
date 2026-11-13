import type {
  Goal,
  Objective,
  PlanningDocument,
  PlanningView,
  ProgrammeResult,
} from "./types";

export type ProgrammeDocument = PlanningView["documents"][number];
export type ProgrammeItemKind = "objective" | "goal";

export function programmeItemStatus(
  document: PlanningDocument,
  kind: ProgrammeItemKind,
  id: string,
): "DRAFT" | "APPROVED" {
  const approval = document.itemApprovals?.find(
    (item) => item.kind === kind && item.itemId === id,
  );
  return (
    approval?.status || (document.status === "APPROVED" ? "APPROVED" : "DRAFT")
  );
}
export function programmeItemVersion(
  document: PlanningDocument,
  kind: ProgrammeItemKind,
  id: string,
): number {
  return (
    document.itemApprovals?.find(
      (item) => item.kind === kind && item.itemId === id,
    )?.version ||
    [...document.versions]
      .sort((a, b) => b.version - a.version)
      .find((version) =>
        (kind === "objective"
          ? version.data.objectives
          : version.data.goals
        ).some((item) => item.id === id),
      )?.version ||
    0
  );
}
export function programmeItemState(
  document: ProgrammeDocument,
  kind: ProgrammeItemKind,
  id: string,
) {
  const approved = programmeItemStatus(document, kind, id) === "APPROVED";
  return {
    approved,
    version: programmeItemVersion(document, kind, id),
    canEdit: document.permissions.canEdit && !approved,
    canApprove: document.permissions.canApprove && !approved,
  };
}
export function programmeItemIssues(
  document: ProgrammeDocument,
  id: string,
): string[] {
  return document.programmeIssues?.[id] || [];
}
export type ProgrammeCommitment = {
  document: ProgrammeDocument;
  item: Objective | Goal;
  kind: "OBJECTIVE" | "GOAL";
  version: number;
  title: string;
  direction: string;
};

/** Only immutable, effective approvals are eligible for measured results. */
export function programmeCommitments(
  view: PlanningView,
  cycle: string,
  today: string,
): ProgrammeCommitment[] {
  return view.documents
    .filter(
      (document) =>
        document.permissions.canRead &&
        document.cycle === cycle &&
        ["COMPANY", "DEPARTMENT", "INDIVIDUAL"].includes(document.kind),
    )
    .flatMap((document) => {
      const records = new Map<string, ProgrammeCommitment>();
      let priorKind = "";
      for (const snapshot of [...document.versions]
        .filter((version) => version.effectiveDate <= today)
        .sort((a, b) => a.version - b.version)) {
        const kind =
          document.kind === "COMPANY" &&
          snapshot.companyPlanningModel === "MEASURABLE_OBJECTIVES"
            ? ("OBJECTIVE" as const)
            : ("GOAL" as const);
        if (!snapshot.approvedItem || (priorKind && priorKind !== kind))
          records.clear();
        priorKind = kind;
        const rows =
          kind === "OBJECTIVE" ? snapshot.data.objectives : snapshot.data.goals;
        for (const item of rows) {
          // Cumulative snapshots only approve their designated row. Other rows
          // may include a later-effective revision and are not approval authority.
          if (
            snapshot.approvedItem &&
            (snapshot.approvedItem.itemId !== item.id ||
              snapshot.approvedItem.kind !==
                (kind === "OBJECTIVE" ? "objective" : "goal"))
          )
            continue;
          records.set(item.id, {
            document,
            item,
            kind,
            version: snapshot.version,
            title:
              kind === "OBJECTIVE"
                ? (item as Objective).result || item.title
                : item.title,
            direction: item.direction || "",
          });
        }
      }
      return [...records.values()];
    });
}
export function programmeResultMeetsTarget(
  actual: number,
  target: number | null | undefined,
  direction: string,
): boolean | null {
  if (!Number.isFinite(actual) || target == null || !Number.isFinite(target))
    return null;
  if (direction === "LOWER" || direction === "MAINTAIN_MAX")
    return actual <= target;
  if (direction === "HIGHER" || direction === "MAINTAIN_MIN")
    return actual >= target;
  return null;
}
export function programmeLatestResult(
  results: ProgrammeResult[],
  commitment: ProgrammeCommitment,
) {
  return results
    .filter(
      (result) =>
        result.status === "VERIFIED" &&
        result.documentId === commitment.document.id &&
        result.itemId === commitment.item.id &&
        result.itemKind === commitment.kind &&
        result.version === commitment.version,
    )
    .sort(
      (a, b) =>
        b.periodEnd.localeCompare(a.periodEnd) ||
        b.verifiedAt.localeCompare(a.verifiedAt),
    )[0];
}
