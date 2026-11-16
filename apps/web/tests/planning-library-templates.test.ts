import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  readPlanningLibraryTemplates,
  templateDraftFields,
  type PlanningLibraryTemplate,
  type PlanningTemplateKind,
} from "../services/leadership-excellence/performance-planning/library-templates";

// Fixtures come from the server's deployment seed, never a frontend fallback.
const catalogue = JSON.parse(
  readFileSync(
    new URL(
      "../../../packages/db/prisma/seeds/planning-library.data.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as { templates: PlanningLibraryTemplate[] };
function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
freeze(catalogue);
function getPlanningLibraryTemplates(kind: PlanningTemplateKind) {
  return freeze(
    catalogue.templates.filter((template) => template.kind === kind),
  );
}

const kinds: PlanningTemplateKind[] = [
  "finding",
  "objective",
  "department-goal",
];
const all = kinds.flatMap((kind) => [...getPlanningLibraryTemplates(kind)]);

test("library API responses preserve empty results and reject malformed or wrong-kind data", () => {
  assert.deepEqual(readPlanningLibraryTemplates([], "finding"), []);
  const findings = getPlanningLibraryTemplates("finding");
  assert.deepEqual(readPlanningLibraryTemplates(findings, "finding"), findings);
  for (const payload of [
    null,
    {},
    { message: "API unavailable" },
    getPlanningLibraryTemplates("objective"),
    [{ ...findings[0], fields: null }],
    [{ ...findings[0], notes: [null] }],
  ]) {
    assert.throws(
      () => readPlanningLibraryTemplates(payload, "finding"),
      /invalid response/,
    );
  }
});

function example(kind: PlanningTemplateKind, code: string) {
  const result = getPlanningLibraryTemplates(kind).find(
    (item) => item.sourceCode === code,
  );
  assert.ok(result, `Missing workbook example ${code}`);
  return result;
}

test("the database seed contains all 162 distinct examples without copying summary tabs", () => {
  assert.equal(getPlanningLibraryTemplates("finding").length, 120);
  assert.equal(getPlanningLibraryTemplates("objective").length, 10);
  assert.equal(getPlanningLibraryTemplates("department-goal").length, 32);
  assert.equal(new Set(all.map((item) => item.id)).size, 162);
  assert.deepEqual([...new Set(all.map((item) => item.sourceSheet))].sort(), [
    "Department Goals",
    "SWOT Register",
  ]);
  assert.equal(
    new Set(
      getPlanningLibraryTemplates("department-goal").map(
        (item) => item.department,
      ),
    ).size,
    11,
  );
  for (const item of all) {
    assert.ok(item.title.length > 0 && item.title.length <= 350);
    assert.ok(item.notes.some((note) => /illustrative/i.test(note)));
  }
});

test("all six canonical pillars have five findings in each SWOT quadrant", () => {
  const findings = getPlanningLibraryTemplates("finding");
  for (const pillar of ["LEX", "PEX", "OPX", "CMX", "SGEX", "FPEX"]) {
    for (const category of ["S", "W", "O", "T"]) {
      assert.equal(
        findings.filter(
          (item) => item.pillar === pillar && item.category === category,
        ).length,
        5,
        `${pillar}/${category}`,
      );
    }
  }
  assert.equal(example("finding", "MEX-W01").fields.pillar, "CMX");
  assert.equal(example("finding", "SGX-W01").fields.pillar, "SGEX");
  assert.equal(example("finding", "FEX-W01").fields.pillar, "FPEX");
  assert.equal(example("objective", "MEX-2027-OBJ04").pillar, "CMX");
});

test("source content and business-focus alignment populate editable finding fields", () => {
  const template = example("finding", "LEX-S01");
  const fields = templateDraftFields(template);
  assert.equal(template.sourceRow, 9);
  assert.equal(
    fields.title,
    "Top management actively supports continuous improvement.",
  );
  assert.match(String(fields.explanation), /10 of 12/);
  assert.match(String(fields.evidence), /Jul-Sep 2026/);
  assert.deepEqual(fields.alignments, ["OTHER"]);
  assert.equal(fields.otherBusinessFocus, "Leadership commitment");
  assert.equal(fields.weightage, 8);
  assert.equal(fields.priority, "HIGH");
  assert.equal(fields.response, "");
  assert.ok(!("reviewStatus" in fields));
  assert.ok(!("basis" in fields));
});

test("percentage fractions become form percentages and zero remains a valid target", () => {
  const objective = templateDraftFields(example("objective", "OPX-2027-OBJ02"));
  assert.equal(objective.baseline, 80);
  assert.equal(objective.target, 95);
  assert.equal(objective.unit, "%");
  assert.equal(objective.direction, "HIGHER");
  const goal = templateDraftFields(
    example("department-goal", "FEX-2027-OBJ05-SAL-G01"),
  );
  assert.equal(goal.baseline, 88);
  assert.equal(goal.target, 95);
  assert.equal(
    templateDraftFields(example("objective", "LEX-2027-OBJ01")).target,
    0,
  );
  const cash = templateDraftFields(example("objective", "FEX-2027-OBJ05"));
  assert.equal(cash.baseline, 3);
  assert.equal(cash.target, 3);
  assert.equal(cash.direction, "MAINTAIN_MIN");
  const stock = templateDraftFields(
    example("department-goal", "FEX-2027-OBJ05-STO-G01"),
  );
  assert.equal(stock.baseline, 6000000);
  assert.equal(stock.target, 4200000);
});

test("unknown baselines and blank date columns are not fabricated", () => {
  const goals = getPlanningLibraryTemplates("department-goal");
  assert.equal(
    goals.filter((item) => item.fields.baseline === null).length,
    22,
  );
  assert.equal(
    goals.filter((item) => typeof item.fields.baseline === "number").length,
    10,
  );
  const unknown = templateDraftFields(
    example("department-goal", "LEX-2027-OBJ01-PRD-G01"),
  );
  assert.equal(unknown.baseline, null);
  assert.equal(unknown.target, 0);
  for (const item of all.filter((item) => item.kind !== "finding")) {
    assert.ok(!("startDate" in templateDraftFields(item)));
    assert.ok(!("endDate" in templateDraftFields(item)));
    assert.ok(item.notes.some((note) => /date cell is blank/i.test(note)));
  }
});

test("department templates carry measurement and achievement content without creating parent or owner links", () => {
  const template = example("department-goal", "OPX-2027-OBJ02-PRD-G01");
  const fields = templateDraftFields(template);
  assert.equal(template.parentObjectiveCode, "OPX-2027-OBJ02");
  assert.equal(template.department, "Production");
  assert.ok(template.ownerRole);
  assert.match(String(fields.title), /52 minutes/);
  assert.equal(fields.baseline, 52);
  assert.equal(fields.target, 30);
  assert.equal(fields.unit, "minutes");
  assert.equal(fields.direction, "LOWER");
  assert.ok(String(fields.measure).length > 0);
  assert.ok(String(fields.definition).length >= String(fields.measure).length);
  assert.ok(String(fields.approach).length > 0);
  assert.ok(String(fields.relevance).length > 0);
  assert.match(String(fields.source), /Achievable check/);
  assert.ok(!("parent" in fields));
  assert.ok(!("ownerId" in fields));
  assert.ok(!("departmentIds" in fields));
});

test("only editable content can cross from any library entry into a draft", () => {
  const protectedFields = {
    id: "foreign-record",
    code: "COPY-123",
    parent: { documentId: "other-org", goalId: "foreign", version: 1 },
    objectiveId: "foreign-objective",
    sources: [{ documentId: "other-org", findingId: "foreign", version: 1 }],
    ownerId: "another-org-owner",
    departmentIds: ["another-org-department"],
    departmentCode: "IMPORTED",
    goalNo: 1,
    scopeId: "another-org",
    status: "APPROVED",
    reviewStatus: "REVIEWED",
    reviewedAt: "2027-01-01",
    approvedBy: "someone-else",
    effectiveDate: "2027-01-01",
    createdAt: "2027-01-01",
    createdBy: "someone-else",
    history: [{ action: "APPROVE" }],
    itemApprovals: [{ status: "APPROVED" }],
  };
  for (const kind of kinds) {
    const original = getPlanningLibraryTemplates(kind)[0];
    const changed: PlanningLibraryTemplate = {
      ...original,
      fields: { ...original.fields, ...protectedFields },
    };
    const fields = templateDraftFields(changed);
    assert.equal(fields.title, original.fields.title);
    for (const key of Object.keys(protectedFields)) {
      assert.ok(!(key in fields), `${kind} must not copy ${key}`);
    }
  }
  for (const template of getPlanningLibraryTemplates("objective")) {
    const fields = templateDraftFields({
      ...template,
      fields: { ...template.fields, priority: 10, weightage: 100 },
    });
    assert.ok(!("priority" in fields));
    assert.ok(!("weightage" in fields));
  }
});

test("editing a template draft never changes the shared library or another organisation's draft", () => {
  const library = getPlanningLibraryTemplates("finding");
  const template = library[0];
  const before = JSON.stringify(template);
  const firstOrganisation = templateDraftFields(template);
  const secondOrganisation = templateDraftFields(template);
  firstOrganisation.title = "My editable local draft";
  (firstOrganisation.alignments as string[]).push("Q");
  assert.notEqual(firstOrganisation.title, secondOrganisation.title);
  assert.deepEqual(secondOrganisation.alignments, ["OTHER"]);
  assert.equal(JSON.stringify(template), before);
  assert.ok(Object.isFrozen(library));
  assert.ok(Object.isFrozen(template));
  assert.ok(Object.isFrozen(template.fields));
  assert.ok(Object.isFrozen(template.fields.alignments));
  assert.ok(Object.isFrozen(template.notes));
  assert.deepEqual(templateDraftFields(template), secondOrganisation);
});
