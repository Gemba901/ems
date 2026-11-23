import type { DeliveryAction, Goal, PlanningView, SourceLink } from "./types";

type Plan = PlanningView["documents"][number];

export type ProgrammeActionRow = {
  documentId: string;
  action: DeliveryAction;
  /** Present only when this row is an immutable, explicitly linked snapshot. */
  version?: number;
  readOnly?: boolean;
};

function uniqueRows(rows: ProgrammeActionRow[]): ProgrammeActionRow[] {
  const unique = new Map<string, ProgrammeActionRow>();
  for (const row of rows) {
    const key = JSON.stringify([
      row.documentId,
      row.action.id,
      row.version ?? "current",
    ]);
    if (!unique.has(key)) unique.set(key, row);
  }
  return [...unique.values()];
}

/** The server projection is authoritative, including an intentionally empty list. */
export function visibleProgrammeActionRows(
  view: PlanningView,
): ProgrammeActionRow[] {
  if (view.programmeActions !== undefined)
    return uniqueRows(view.programmeActions);

  // Compatibility with older responses: inspect only already readable documents,
  // never expand into historical versions or the shared-action candidate list.
  return uniqueRows(
    view.documents
      .filter((document) => document.permissions.canRead)
      .flatMap((document) =>
        document.data.actions.map((action) => ({
          documentId: document.id,
          action,
          readOnly:
            !document.permissions.canEdit && !document.permissions.canApprove,
        })),
      ),
  );
}

/** Delivery work belongs to a particular goal, not every goal under its parent. */
export function goalActionRows(
  view: PlanningView,
  document: Plan,
  goal: Goal,
): ProgrammeActionRow[] {
  const rows = visibleProgrammeActionRows(view).filter((row) => {
    const parent = row.action.parent;
    // A saved parent is canonical. Retain its original approved version when
    // the goal is revised, rather than reassigning work to a different goal.
    if (parent)
      return (
        parent.documentId === document.id &&
        parent.goalId === goal.id &&
        (parent.itemKind || "GOAL") === "GOAL"
      );
    return row.documentId === document.id && row.action.goalId === goal.id;
  });

  for (const link of document.data.actionLinks || []) {
    if (link.goalId !== goal.id) continue;
    const shared = view.sharedActions.find(
      (source) =>
        source.documentId === link.documentId &&
        source.version === link.version &&
        source.action.id === link.actionId,
    );
    const action =
      shared?.action ||
      view.documents
        .find(
          (source) =>
            source.id === link.documentId && source.permissions.canRead,
        )
        ?.versions.find((version) => version.version === link.version)
        ?.data.actions.find((entry) => entry.id === link.actionId);
    // Never replace an unavailable approved snapshot with a newer draft.
    if (action)
      rows.push({
        documentId: link.documentId,
        action,
        version: link.version,
        readOnly: true,
      });
  }
  return uniqueRows(rows);
}

/** A re-reviewed finding keeps its earlier directly assigned actions visible. */
export function findingActionRows(
  view: PlanningView,
  source: SourceLink,
): ProgrammeActionRow[] {
  return visibleProgrammeActionRows(view).filter(
    ({ action }) =>
      !action.parent &&
      !action.goalId &&
      action.sources.some(
        (link) =>
          link.documentId === source.documentId &&
          link.findingId === source.findingId,
      ),
  );
}
