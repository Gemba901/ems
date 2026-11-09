import assert from "node:assert/strict";
import { test } from "node:test";
import {
  defaultOpen,
  childUnitLabel,
  highlightedUnits,
  indexUnits,
  initialScope,
  searchUnits,
  visibleUnits,
  within,
} from "../components/leadership-excellence/organisation-framework/organogram/organogram";
import {
  layoutChart,
  fitChart,
  CARD_WIDTH,
  CARD_HEIGHT,
} from "../components/leadership-excellence/organisation-framework/organogram/organogram-layout";
import type {
  OrganogramViewData,
  OrganisationUnit,
} from "../components/leadership-excellence/organisation-framework/organogram/types";
const people = { total: 1, active: 1, probation: 0, inactive: 0 };
const u = (
  id: string,
  parentId: string | null,
  type: OrganisationUnit["type"],
): OrganisationUnit => ({
  id,
  parentId,
  type,
  name: id,
  branch: type === "BRANCH" ? id : null,
  departmentId: null,
  lead: null,
  people,
});
const units = [
  u("company", null, "COMPANY"),
  u("b1", "company", "BRANCH"),
  u("b2", "company", "BRANCH"),
  u("d1", "b1", "DEPARTMENT"),
  u("d2", "b1", "DEPARTMENT"),
  u("s1", "d1", "SECTION"),
];
const s: OrganogramViewData = {
  source: { kind: "SAMPLE", label: "Test", loadedAt: "" },
  company: { id: "org", name: "Co" },
  units,
  multiBranch: true,
  people: { ...people, withoutDepartment: 0 },
  members: [],
  checks: [],
  viewer: { status: "ASSIGNED", branchIds: ["b1"] },
};
test("branch defaults and saved preferences are scoped to valid units", () => {
  assert.equal(initialScope(s, null), "b1");
  assert.equal(initialScope(s, ""), "");
  assert.equal(initialScope(s, "b2"), "b2");
  assert.equal(initialScope(s, "gone"), "b1");
  assert.equal(
    initialScope(
      { ...s, viewer: { status: "MULTIPLE", branchIds: ["b1", "b2"] } },
      null,
    ),
    "",
  );
});
test("company starts with branches; focused branch shows departments, with ancestors in search", () => {
  const index = indexUnits(s);
  assert.deepEqual(
    visibleUnits(index, "", defaultOpen(s)).map((u) => u.id),
    ["company", "b1", "b2"],
  );
  assert.deepEqual(
    visibleUnits(index, "b1", defaultOpen(s, "b1")).map((u) => u.id),
    ["b1", "d1", "d2"],
  );
  const search = searchUnits(index, s.units, "s1")!;
  assert.deepEqual([...search.keep], ["company", "b1", "d1", "s1"]);
  assert.deepEqual([...within(index, "b1")], ["b1", "d2", "d1", "s1"]);
});
function noOverlap(tree: ReturnType<typeof layoutChart>) {
  const nodes = [...tree.positions.values()];
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i],
        b = nodes[j];
      assert.ok(
        Math.abs(a.x - b.x) >= CARD_WIDTH - 0.01 ||
          Math.abs(a.y - b.y) >= CARD_HEIGHT - 0.01,
        `${a.id} overlaps ${b.id}`,
      );
    }
  for (const p of nodes) {
    assert.ok(p.x >= 0 && p.y >= 0);
    assert.ok(p.x + CARD_WIDTH <= tree.width + 0.01);
    assert.ok(p.y + CARD_HEIGHT <= tree.height + 0.01);
  }
}
test("opening branches moves neighbours horizontally, closing restores layout", () => {
  const closed = layoutChart(units.slice(0, 3), 1500),
    opened = layoutChart(units, 1500);
  noOverlap(opened);
  assert.ok(opened.positions.get("b2")!.x > closed.positions.get("b2")!.x);
  assert.equal(opened.positions.get("b2")!.y, opened.positions.get("b1")!.y);
  assert.deepEqual(
    layoutChart(units.slice(0, 3), 1500).positions,
    closed.positions,
  );
});
test("department rows use screen width and every wrapped child retains its branch connector", () => {
  const items = [
    u("branch", null, "BRANCH"),
    ...Array.from({ length: 12 }, (_, i) =>
      u(`dept${i}`, "branch", "DEPARTMENT"),
    ),
  ];
  const narrow = layoutChart(items, 620),
    wide = layoutChart(items, 1500);
  noOverlap(narrow);
  noOverlap(wide);
  assert.ok(
    new Set(
      [...wide.positions.values()]
        .filter((x) => x.id !== "branch")
        .map((x) => x.x),
    ).size >
      new Set(
        [...narrow.positions.values()]
          .filter((x) => x.id !== "branch")
          .map((x) => x.x),
      ).size,
  );
  assert.equal(wide.edges.length, 12);
  assert.ok(wide.edges.every((e) => e.parent === "branch"));
  assert.ok(wide.height < narrow.height);
});
test("nested wrapping, narrow phones, many units and malformed loops stay finite", () => {
  for (const width of [320, 720, 1400, 2200]) {
    const nodes = [u("company", null, "COMPANY")];
    for (let b = 0; b < 4; b++) {
      nodes.push(u(`b${b}`, "company", "BRANCH"));
      for (let d = 0; d < 8; d++) {
        nodes.push(u(`b${b}d${d}`, `b${b}`, "DEPARTMENT"));
        for (let z = 0; z < 3; z++)
          nodes.push(u(`b${b}d${d}s${z}`, `b${b}d${d}`, "SECTION"));
      }
    }
    const tree = layoutChart(nodes, width);
    noOverlap(tree);
    assert.equal(tree.positions.size, nodes.length);
    assert.equal(tree.edges.length, nodes.length - 1);
  }
  const cyclic = layoutChart(
    [u("a", "b", "BRANCH"), u("b", "a", "BRANCH")],
    1000,
  );
  assert.equal(cyclic.positions.size, 2);
  noOverlap(cyclic);
});
test("Fit includes large structures below the old arbitrary minimum", () => {
  const z = fitChart(100000, 10000, 1000, 500);
  assert.ok(z < 0.02);
  assert.ok(100000 * z <= 1000);
  assert.ok(10000 * z <= 500);
  assert.equal(fitChart(200, 100, 1000, 500), 1);
});

test("eight branches start with readable full cards inside a laptop canvas", async () => {
  const { fitPresentation } =
    await import("../components/leadership-excellence/organisation-framework/organogram/organogram-layout");
  const nodes = [
    u("co", null, "COMPANY"),
    ...Array.from({ length: 8 }, (_, i) => u(`b${i}`, "co", "BRANCH")),
  ];
  for (const [w, h] of [
    [950, 430],
    [1400, 600],
    [2000, 700],
  ]) {
    const f = fitPresentation(nodes, w, h);
    assert.equal(f.density, "cards");
    assert.ok(f.zoom >= 0.8);
    assert.ok(f.tree.width * f.zoom <= w);
    assert.ok(f.tree.height * f.zoom <= h);
    assert.equal(f.tree.positions.size, 9);
  }
});
test("opening a middle branch spreads departments horizontally and displaces peers", () => {
  const branches = [
    u("co", null, "COMPANY"),
    ...Array.from({ length: 8 }, (_, i) => u(`b${i}`, "co", "BRANCH")),
  ];
  const departments = Array.from({ length: 8 }, (_, i) =>
    u(`d${i}`, "b1", "DEPARTMENT"),
  );
  const closed = layoutChart(branches, 1400),
    opened = layoutChart([...branches, ...departments], 1400);
  noOverlap(opened);
  const cols = new Set(departments.map((d) => opened.positions.get(d.id)!.x));
  assert.ok(cols.size >= 4, `Only ${cols.size} department columns`);
  assert.equal(opened.positions.get("b0")!.y, opened.positions.get("b1")!.y);
  assert.ok(opened.positions.get("b2")!.x > closed.positions.get("b2")!.x);
  assert.ok(
    opened.edges
      .filter((e) => e.child.startsWith("d"))
      .every((e) => e.parent === "b1"),
  );
});
test("Fit changes representation before turning a large organisation into a tiny strip", async () => {
  const { fitPresentation } =
    await import("../components/leadership-excellence/organisation-framework/organogram/organogram-layout");
  const nodes = [u("co", null, "COMPANY")];
  for (let b = 0; b < 8; b++) {
    nodes.push(u(`b${b}`, "co", "BRANCH"));
    for (let d = 0; d < 8; d++) {
      nodes.push(u(`b${b}d${d}`, `b${b}`, "DEPARTMENT"));
      for (let t = 0; t < 3; t++)
        nodes.push(u(`b${b}d${d}s${t}`, `b${b}d${d}`, "SECTION"));
    }
  }
  for (const [w, h] of [
    [950, 430],
    [1400, 600],
    [2000, 700],
  ]) {
    const f = fitPresentation(nodes, w, h);
    assert.notEqual(f.density, "cards");
    assert.ok(f.zoom >= 0.6);
    assert.equal(f.tree.positions.size, nodes.length);
    assert.equal(f.tree.edges.length, nodes.length - 1);
    assert.ok(f.tree.width * f.zoom <= w);
    assert.ok(f.tree.height * f.zoom <= h);
    assert.ok(
      f.tree.width * f.zoom > w * 0.65,
      "Map should use the horizontal space",
    );
    const positions = [...f.tree.positions.values()];
    for (let i = 0; i < positions.length; i++)
      for (let j = i + 1; j < positions.length; j++) {
        const a = positions[i],
          b = positions[j];
        assert.ok(
          Math.abs(a.x - b.x) >= f.tree.cardWidth - 0.01 ||
            Math.abs(a.y - b.y) >= f.tree.cardHeight - 0.01,
        );
      }
  }
});

test("mixed company children are units, not a false branch count", () => {
  assert.equal(
    childUnitLabel([
      u("branch", "company", "BRANCH"),
      u("empty-dept", "company", "DEPARTMENT"),
    ]),
    "units",
  );
  assert.equal(
    childUnitLabel([u("dept", "branch", "DEPARTMENT")]),
    "department",
  );
  assert.equal(
    childUnitLabel([
      u("d1", "branch", "DEPARTMENT"),
      u("d2", "branch", "DEPARTMENT"),
    ]),
    "departments",
  );
});
test("active path and team highlights keep the last two opens without closing older teams", () => {
  const index = indexUnits(s);
  const open = new Set(["company", "b1", "b2", "d1"]);
  const h = highlightedUnits(index, "d1", ["b1", "b2", "d1"], open);
  assert.deepEqual([...h.active], ["company", "b1", "d1"]);
  assert.equal(h.activeEdges.has("s1"), true);
  assert.deepEqual([...h.recentUnits], ["b2", "d1"]);
  assert.equal(open.has("b1"), true);
  open.delete("d1");
  assert.deepEqual(
    [...highlightedUnits(index, null, ["b2", "d1"], open).recentUnits],
    ["b2"],
  );
});
