import type { Pillar } from "./types";

export type PlanningTemplateKind = "finding" | "objective" | "department-goal";

export interface PlanningLibraryTemplate {
  id: string;
  kind: PlanningTemplateKind;
  title: string;
  pillar: Pillar;
  category?: "S" | "W" | "O" | "T";
  department?: string;
  sourceCode: string;
  sourceSheet: string;
  sourceRow: number;
  ownerRole?: string;
  parentObjectiveCode?: string;
  parentObjectiveTitle?: string;
  fields: Record<string, unknown>;
  notes: string[];
  version?: number;
}

/** Fail visibly if the endpoint returns a proxy page or an unexpected payload. */
export function readPlanningLibraryTemplates(
  value: unknown,
  kind: PlanningTemplateKind,
): PlanningLibraryTemplate[] {
  if (
    !Array.isArray(value) ||
    value.some(
      (item) =>
        !item ||
        typeof item !== "object" ||
        item.kind !== kind ||
        typeof item.id !== "string" ||
        typeof item.title !== "string" ||
        !["LEX", "PEX", "OPX", "CMX", "SGEX", "FPEX"].includes(item.pillar) ||
        typeof item.sourceCode !== "string" ||
        typeof item.sourceSheet !== "string" ||
        !Number.isInteger(item.sourceRow) ||
        !item.fields ||
        typeof item.fields !== "object" ||
        Array.isArray(item.fields) ||
        !Array.isArray(item.notes) ||
        item.notes.some((note: unknown) => typeof note !== "string"),
    )
  ) {
    throw new Error(
      "The template library returned an invalid response. Please try again.",
    );
  }
  return value as PlanningLibraryTemplate[];
}

const editableFields: Record<PlanningTemplateKind, readonly string[]> = {
  finding: [
    "title",
    "pillar",
    "category",
    "explanation",
    "evidence",
    "impact",
    "alignments",
    "alignment",
    "otherBusinessFocus",
    "weightage",
    "priority",
    "response",
  ],
  objective: [
    "title",
    "result",
    "pillar",
    "alignments",
    "alignment",
    "otherBusinessFocus",
    "measure",
    "definition",
    "baseline",
    "target",
    "unit",
    "direction",
    "selectionReason",
    "sourceRationale",
  ],
  "department-goal": [
    "title",
    "measure",
    "definition",
    "baseline",
    "target",
    "unit",
    "direction",
    "approach",
    "relevance",
    "source",
  ],
};

/** Only editable content is copied. Record identity, real source/parent links,
 * ownership, approval and history must always come from the current workspace.
 * Dates are deliberately absent: the source workbook's date cells are blank.
 * Missing numerical baselines stay null, while a valid zero stays zero. */
export function templateDraftFields(
  template: PlanningLibraryTemplate,
): Record<string, unknown> {
  const selected = Object.fromEntries(
    editableFields[template.kind]
      .filter((key) => Object.hasOwn(template.fields, key))
      .map((key) => [key, template.fields[key]]),
  );
  return structuredClone(selected);
}
