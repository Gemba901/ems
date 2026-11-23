import type { ParentGoal, PlanningDocument } from "./types";

export const commonPlanningUnits = ["%", "count", "actions", "units", "people", "incidents", "defects", "minutes", "hours", "days", "INR", "USD", "kg", "tonnes", "kWh", "ppm"];

/** Cumulative copies are not new approvals of an unchanged commitment. */
export function approvedProgrammeItemHistory(document: PlanningDocument, kind: "objective" | "goal", id: string) {
  return document.versions.flatMap((version) => {
    if (version.approvedItem && (version.approvedItem.itemId !== id || version.approvedItem.kind !== kind)) return [];
    if (version.itemVersions?.[id] && version.itemVersions[id] !== version.version) return [];
    const record = (kind === "objective" ? version.data.objectives : version.data.goals).find((item) => item.id === id);
    return record ? [{ version, record }] : [];
  });
}

/** A revision may advance the approved version without changing its identity. */
export function sameParentIdentity(left: ParentGoal | null | undefined, right: ParentGoal | null | undefined) {
  return !!left && !!right && left.documentId === right.documentId && left.goalId === right.goalId && (left.itemKind || "GOAL") === (right.itemKind || "GOAL");
}

export function contributionDateBounds(period: { startDate: string; endDate: string } | null | undefined, parent?: { startDate?: string; endDate?: string }) {
  return {
    startDate: [period?.startDate, parent?.startDate].filter(Boolean).sort().at(-1) || "",
    endDate: [period?.endDate, parent?.endDate].filter(Boolean).sort()[0] || "",
  };
}

export function contributionDateIssue(deadline: string, bounds: { startDate: string; endDate: string }) {
  if (!deadline) return "";
  return (bounds.startDate && deadline < bounds.startDate) || (bounds.endDate && deadline > bounds.endDate)
    ? `Deadline must be between ${bounds.startDate || "the parent start date"} and ${bounds.endDate || "the parent end date"}.`
    : "";
}

export function embeddedDeadlineWarnings(fields: Record<string, unknown>): string[] {
  const deadline = typeof fields.endDate === "string" ? fields.endDate : "";
  if (!deadline) return [];
  const content = [fields.title, fields.result, fields.measure, fields.definition].filter((value): value is string => typeof value === "string").join(" ");
  const mentioned = [...content.matchAll(/\b(20\d{2}-\d{2}-\d{2}|\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+20\d{2})\b/gi)].map(([value]) => value);
  return [...new Set(mentioned)].filter((value) => {
    const date = new Date(value + " 12:00:00 UTC");
    const parsed = /^20\d{2}-/.test(value) ? value : Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : "";
    return parsed !== deadline;
  }).map((value) => `The text mentions ${value}, but the deadline is ${deadline}. Update the text or deadline if they describe the same commitment.`);
}

/** Map readiness messages to the existing form, retaining unsaved entries. */
export function approvalIssueField(issue: string): string {
  const text = issue.toLowerCase();
  if (/approver|plan settings/.test(text)) return "settings";
  if (/source of the company measure/.test(text)) return "dataSource";
  if (/measurement source|data source/.test(text)) return "source";
  if (/describe.*business focus/.test(text)) return "otherBusinessFocus";
  if (/resources|approach|achieve|achievable/.test(text)) return "approach";
  if (/supports.*company objective|contribution.*company/.test(text)) return "relevance";
  if (/target.*baseline/.test(text)) return "target";
  if (/baseline.*period/.test(text)) return "baselinePeriod";
  if (/baseline/.test(text)) return "baseline";
  if (/deadline|due date|parent period|timing/.test(text)) return "endDate";
  if (/weightage|allocation/.test(text)) return "weightage";
  if (/priority/.test(text)) return "priority";
  if (/primary pillar/.test(text)) return "pillar";
  if (/counted|counting|definition/.test(text)) return "definition";
  if (/target/.test(text)) return "target";
  if (/kpi.*unit|measure.*unit/.test(text)) return "measure";
  if (/unit/.test(text)) return "unit";
  if (/responsible|owner/.test(text)) return "ownerId";
  if (/higher|lower|maintained/.test(text)) return "direction";
  if (/qcdsmt|business focus/.test(text)) return "alignments";
  if (/frequency/.test(text)) return "reviewFrequency";
  if (/company result/.test(text)) return "result";
  if (/why.*selected|rationale/.test(text)) return "selectionReason";
  if (/quality|safety|guardrail/.test(text)) return "guardrails";
  if (/parent|approved company|approved department/.test(text)) return "parent";
  if (/source|evidence|finding|swot/.test(text)) return "sources";
  if (/measure|kpi/.test(text)) return "measure";
  return "title";
}
