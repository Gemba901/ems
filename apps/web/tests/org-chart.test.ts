import { test } from "node:test";
import assert from "node:assert/strict";
import { buildView, type Person } from "../components/ems/org-chart/model";
const p = (
  id: string,
  managerId: string | null = null,
  extra: Partial<Person> = {},
): Person => ({
  id,
  name: id,
  jobTitle: null,
  department: null,
  branch: null,
  branchText: null,
  managerId,
  reportsToBody: managerId ? null : "BOARD",
  status: "ACTIVE",
  photoUrl: null,
  directReports: 0,
  ...extra,
});
const filters = {
  department: "",
  branch: "",
  inactive: false,
  issuesOnly: false,
  focus: "",
};
const data = (
  people: Person[],
  issues: { employeeId: string; kind: string }[] = [],
) => ({ people, issues, source: "EMS", refreshedAt: "" });
test("department filter preserves outside manager as context without including peers", () => {
  const v = buildView(
    data([
      p("boss"),
      p("a", "boss", { department: { id: "d", name: "D" } }),
      p("b", "boss"),
    ]),
    { ...filters, department: "d" },
  );
  assert.deepEqual([...v.matches], ["a"]);
  assert.deepEqual([...v.included], ["a", "boss"]);
  assert.equal(v.layers, 2);
});
test("focus includes descendants and ancestors but not sibling teams", () => {
  const v = buildView(
    data([p("boss"), p("a", "boss"), p("b", "boss"), p("c", "a")]),
    { ...filters, focus: "a" },
  );
  assert.deepEqual([...v.matches], ["a", "c"]);
  assert.equal(v.included.has("boss"), true);
  assert.equal(v.included.has("b"), false);
});
test("inactive manager is retained as context", () => {
  const v = buildView(
    data([p("boss", null, { status: "INACTIVE" }), p("a", "boss")]),
    filters,
  );
  assert.equal(v.matches.has("boss"), false);
  assert.equal(v.included.has("boss"), true);
});
test("loop members render as roots; never recurse forever", () => {
  const v = buildView(
    data(
      [p("a", "b"), p("b", "a"), p("c", "a")],
      [
        { employeeId: "a", kind: "LOOP" },
        { employeeId: "b", kind: "LOOP" },
      ],
    ),
    filters,
  );
  assert.equal(v.roots.length, 2);
  assert.equal(v.included.size, 3);
});
test("550-person chain and empty data are supported", () => {
  const people = Array.from({ length: 550 }, (_, i) =>
    p(String(i), i ? String(i - 1) : null),
  );
  assert.equal(buildView(data(people), filters).layers, 550);
  assert.equal(buildView(data([]), filters).layers, 0);
});
test("branch and issues filters intersect", () => {
  const v = buildView(
    data(
      [
        p("a", null, { branchText: "Nairobi" }),
        p("b", null, { branchText: "Mombasa" }),
      ],
      [
        { employeeId: "a", kind: "NO_MANAGER" },
        { employeeId: "b", kind: "NO_MANAGER" },
      ],
    ),
    { ...filters, branch: "Nairobi", issuesOnly: true },
  );
  assert.deepEqual([...v.matches], ["a"]);
});
test("deep person focus keeps a bounded ancestor context so the selected person remains reachable", () => {
  const people = Array.from({ length: 550 }, (_, i) =>
    p(String(i), i ? String(i - 1) : null),
  );
  const v = buildView(data(people), { ...filters, focus: "540" });
  assert.equal(v.contextTruncated, true);
  assert.equal(v.roots[0].id, "532");
  assert.equal(v.included.has("540"), true);
  assert.equal(v.included.size, 18);
});

test("unconnected people and their valid teams stay out of the connected roots", () => {
  const v = buildView(
    data(
      [
        p("Alice", null, { reportsToBody: null }),
        p("A-team", "Alice"),
        p("Director"),
        p("Manager", "Director"),
      ],
      [{ employeeId: "Alice", kind: "NO_MANAGER" }],
    ),
    filters,
  );
  assert.deepEqual(
    v.connectedRoots.map((p) => p.id),
    ["Director"],
  );
  assert.deepEqual(
    v.unconnectedRoots.map((p) => p.id),
    ["Alice"],
  );
  assert.deepEqual([...v.connected].sort(), ["Director", "Manager"]);
});
test("inactive manager warning keeps a legitimate connected chain", () => {
  const v = buildView(
    data(
      [
        p("Director"),
        p("Manager", "Director", { status: "INACTIVE" }),
        p("Worker", "Manager"),
      ],
      [{ employeeId: "Worker", kind: "MANAGER_INACTIVE" }],
    ),
    filters,
  );
  assert.equal(v.connected.has("Worker"), true);
  assert.equal(v.unconnectedRoots.length, 0);
});
test("body text cannot promote a conflicting or unavailable manager into a connected root", () => {
  for (const kind of [
    "CONFLICTING_REPORTING",
    "MANAGER_UNAVAILABLE",
    "NO_MANAGER",
    "SELF_REPORTING",
    "LOOP",
  ]) {
    const v = buildView(
      data([p("bad"), p("child", "bad")], [{ employeeId: "bad", kind }]),
      filters,
    );
    assert.equal(v.connected.size, 0, kind);
    assert.deepEqual(
      v.unconnectedRoots.map((p) => p.id),
      ["bad"],
    );
  }
});
test("focus truncation keeps the correct connected group even when body is outside the view", () => {
  const people = Array.from({ length: 30 }, (_, i) =>
    p(String(i), i ? String(i - 1) : null),
  );
  const v = buildView(data(people), { ...filters, focus: "25" });
  assert.equal(v.contextTruncated, true);
  assert.equal(v.connectedRoots.length, 1);
  assert.equal(v.unconnectedRoots.length, 0);
});

import {
  layoutChart,
  fitChart,
  CARD_WIDTH,
  CARD_HEIGHT,
} from "../components/ems/org-chart/chart-layout";
test("connectors start at manager centre and end at the actual child's top centre", () => {
  const layout = layoutChart([
    { id: "boss", parentId: null },
    { id: "a", parentId: "boss" },
    { id: "b", parentId: "boss" },
  ]);
  const boss = layout.positions.get("boss")!,
    a = layout.positions.get("a")!,
    b = layout.positions.get("b")!;
  assert.ok(a.x + CARD_WIDTH < b.x);
  assert.equal(boss.x, (a.x + b.x) / 2);
  assert.equal(layout.edges.length, 2);
  assert.ok(
    layout.edges[0].path.startsWith(
      `M ${boss.x + CARD_WIDTH / 2} ${boss.y + CARD_HEIGHT}`,
    ),
  );
  assert.ok(
    layout.edges[0].path.endsWith(`H ${a.x + CARD_WIDTH / 2} V ${a.y}`),
  );
});
test("Fit includes full width and height below 80 percent, including 550-wide and 550-deep trees", () => {
  for (const shape of ["wide", "deep"]) {
    const items = Array.from({ length: 550 }, (_, i) => ({
      id: String(i),
      parentId: i ? (shape === "wide" ? "0" : String(i - 1)) : null,
    }));
    const layout = layoutChart(items);
    assert.equal(layout.positions.size, 550);
    assert.equal(layout.edges.length, 549);
    for (const [width, height] of [
      [1200, 600],
      [360, 400],
    ]) {
      const scale = fitChart(layout.width, layout.height, width, height);
      assert.ok(scale < 0.8);
      assert.ok(scale > 0);
      assert.ok(layout.width * scale <= width - 24 + 0.001);
      assert.ok(layout.height * scale <= height - 24 + 0.001);
    }
  }
});
test("layout supports unordered input and separate roots without inventing links", () => {
  const layout = layoutChart([
    { id: "child", parentId: "boss" },
    { id: "other", parentId: "missing" },
    { id: "boss", parentId: null },
  ]);
  assert.equal(layout.edges.length, 1);
  assert.equal(layout.edges[0].parent, "boss");
  assert.equal(layout.edges[0].child, "child");
  assert.ok(layout.positions.get("child")!.y > layout.positions.get("boss")!.y);
});
test("empty, cyclic and long-chain layout inputs terminate with finite coordinates", () => {
  for (const items of [
    [],
    [
      { id: "a", parentId: "b" },
      { id: "b", parentId: "a" },
    ],
    [{ id: "a", parentId: "a" }],
  ]) {
    const layout = layoutChart(items);
    assert.equal(layout.positions.size, items.length);
    assert.ok(Number.isFinite(layout.width) && Number.isFinite(layout.height));
    for (const position of layout.positions.values())
      assert.ok(Number.isFinite(position.x) && Number.isFinite(position.y));
  }
});
