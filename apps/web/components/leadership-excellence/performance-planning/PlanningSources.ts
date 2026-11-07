import type {
  Objective,
  PlanningDocument,
  PlanningView,
  SourceLink,
} from "@/services/leadership-excellence/performance-planning.service";

export function reviewedSwotSources(
  documents: PlanningDocument[],
  cycle: string,
) {
  return documents
    .filter((document) => document.kind === "SWOT" && document.cycle === cycle)
    .flatMap((document) =>
      document.versions.flatMap((version) =>
        version.data.findings
          .filter((finding) => finding.basis !== "NEEDS_CHECKING")
          .map((finding) => ({
            documentId: document.id,
            version: version.version,
            findingId: finding.id,
            finding,
          })),
      ),
    );
}

export const sourceKey = (source: SourceLink) =>
  `${source.documentId}/${source.version}/${source.findingId}`;

export function resolvedObjectiveSources(
  sources: SourceLink[],
  cycle: string,
  documents: PlanningDocument[],
) {
  const selected = new Set(sources.map(sourceKey));
  return reviewedSwotSources(documents, cycle).filter((source) =>
    selected.has(sourceKey(source)),
  );
}

/** UI routing only: the API remains responsible for final validation. */
export function objectiveHasReviewedSource(
  objective: Objective,
  company: PlanningDocument,
  documents: PlanningView["documents"],
) {
  const resolved = resolvedObjectiveSources(
    objective.sources,
    company.cycle,
    documents,
  );
  if (objective.sources.length) {
    return resolved.length === objective.sources.length;
  }
  const access = documents.find(
    (document) => document.id === company.id,
  )?.permissions;
  // Confidential source redaction must not prevent a permitted editor from
  // using an objective whose source chain was already checked at approval.
  return (
    access?.canSeeSources === false &&
    company.versions.some((version) =>
      version.data.objectives.some((item) => item.id === objective.id),
    )
  );
}
