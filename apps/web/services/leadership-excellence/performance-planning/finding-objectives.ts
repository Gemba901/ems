import type { Objective, PlanningView, SourceLink } from "./types";

export type FindingObjectiveLink = {
  documentId: string;
  objective: Objective;
  historical: boolean;
  version?: number;
};

/** A shared source stays one finding; each objective is listed once across its versions. */
export function linkedFindingObjectives(
  documents: PlanningView["documents"],
  cycle: string,
  source: Pick<SourceLink, "documentId" | "findingId">,
): FindingObjectiveLink[] {
  const links = new Map<string, FindingObjectiveLink>();
  const matches = (objective: Objective) =>
    objective.sources.some(
      (link) =>
        link.documentId === source.documentId &&
        link.findingId === source.findingId,
    );
  for (const document of documents) {
    if (
      document.kind !== "COMPANY" ||
      document.cycle !== cycle ||
      !document.permissions.canRead
    )
      continue;
    for (const objective of document.data.objectives) {
      if (matches(objective))
        links.set(`${document.id}/${objective.id}`, {
          documentId: document.id,
          objective,
          historical: false,
        });
    }
    for (const snapshot of [...document.versions].sort(
      (a, b) => b.version - a.version,
    )) {
      for (const objective of snapshot.data.objectives) {
        const key = `${document.id}/${objective.id}`;
        if (links.has(key) || !matches(objective)) continue;
        // A cumulative per-item snapshot approves only its designated item.
        if (
          snapshot.approvedItem &&
          (snapshot.approvedItem.kind !== "objective" ||
            snapshot.approvedItem.itemId !== objective.id)
        )
          continue;
        links.set(key, {
          documentId: document.id,
          objective,
          historical: true,
          version: snapshot.version,
        });
      }
    }
  }
  return [...links.values()];
}
