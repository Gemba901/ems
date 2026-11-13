import test from "node:test";
import assert from "node:assert/strict";
import { linkedFindingObjectives } from "../services/leadership-excellence/performance-planning/finding-objectives";
import type {
  Objective,
  PlanningView,
} from "../services/leadership-excellence/performance-planning/types";

type Document = PlanningView["documents"][number];
const source = { documentId: "swot", findingId: "finding-1" };
const objective = (id: string, version = 1): Objective =>
  ({
    id,
    code: `OBJ-${id}`,
    title: id,
    sources: [{ ...source, version }],
  }) as Objective;
function company(id = "company"): Document {
  return {
    id,
    kind: "COMPANY",
    cycle: "2027",
    permissions: { canRead: true },
    data: { objectives: [] },
    versions: [],
  } as unknown as Document;
}
function approve(
  document: Document,
  rows: Objective[],
  version: number,
  itemId?: string,
) {
  document.versions.push({
    version,
    data: { objectives: rows },
    ...(itemId ? { approvedItem: { kind: "objective", itemId } } : {}),
  } as Document["versions"][number]);
}

test("one finding links to multiple distinct objectives without duplicating versioned links", () => {
  const document = company();
  document.data.objectives = [objective("a"), objective("b", 2)];
  approve(document, [objective("a")], 1, "a");
  approve(document, [objective("a"), objective("b", 2)], 2, "b");
  const before = structuredClone(document);
  const links = linkedFindingObjectives([document], "2027", source);
  assert.deepEqual(
    links.map((link) => link.objective.id),
    ["a", "b"],
  );
  assert(links.every((link) => !link.historical));
  assert.equal(
    [source].filter(
      (finding) =>
        linkedFindingObjectives([document], "2027", finding).length > 0,
    ).length,
    1,
    "Linked metric counts findings rather than objective joins",
  );
  assert.deepEqual(document, before);
});

test("historical links retain their actual approval version and are scoped to readable company plans", () => {
  const document = company();
  document.data.objectives = [
    { ...objective("a"), sources: [] },
    objective("b"),
  ];
  approve(document, [objective("a")], 1, "a");
  approve(document, [objective("a", 5), objective("b")], 3, "b");
  const restricted = company("restricted");
  restricted.permissions.canRead = false;
  restricted.data.objectives = [objective("private")];
  const elsewhere = company("another-period");
  elsewhere.cycle = "2028";
  elsewhere.data.objectives = [objective("elsewhere")];
  const nonCompany = company("department");
  nonCompany.kind = "DEPARTMENT";
  nonCompany.data.objectives = [objective("department-only")];
  const links = linkedFindingObjectives(
    [document, restricted, elsewhere, nonCompany],
    "2027",
    source,
  );
  assert.deepEqual(
    links.map((link) => [link.objective.id, link.historical, link.version]),
    [
      ["b", false, undefined],
      ["a", true, 1],
    ],
  );
  assert.deepEqual(
    linkedFindingObjectives([document], "2027", {
      ...source,
      documentId: "different-swot",
    }),
    [],
  );
});
