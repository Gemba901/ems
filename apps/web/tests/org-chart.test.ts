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
      `M ${boss.x + CARD_WIDTH / 2} ${boss.y + CARD_HEIGHT + 18}`,
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

import { cardMode } from "../components/ems/org-chart/chart-layout";
import {
  teamContext,
  reportingPath,
  findChartPeople,
  departmentPalette,
} from "../components/ems/org-chart/chart-presentation";
test("wide teams wrap under their real manager without overlapping cards", () => {
  const items = [
    { id: "boss", parentId: null },
    ...Array.from({ length: 40 }, (_, i) => ({
      id: "p" + i,
      parentId: "boss",
    })),
    ...Array.from({ length: 7 }, (_, i) => ({ id: "g" + i, parentId: "p2" })),
  ];
  const layout = layoutChart(items),
    nodes = [...layout.positions.values()];
  assert.equal(nodes.length, 48);
  assert.ok(layout.width < 6000);
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i],
        b = nodes[j];
      assert.ok(
        a.x + CARD_WIDTH <= b.x ||
          b.x + CARD_WIDTH <= a.x ||
          a.y + CARD_HEIGHT <= b.y ||
          b.y + CARD_HEIGHT <= a.y,
        `overlap ${a.id}/${b.id}`,
      );
    }
  for (const edge of layout.edges) {
    assert.equal(items.find((i) => i.id === edge.child)?.parentId, edge.parent);
    assert.ok(
      layout.positions.get(edge.child)!.y >
        layout.positions.get(edge.parent)!.y,
    );
  }
  assert.ok(
    new Set(
      Array.from({ length: 40 }, (_, i) => layout.positions.get("p" + i)!.y),
    ).size > 1,
  );
});
test("leaf-only company uses compact columns and the complete company fits", () => {
  const layout = layoutChart([
    { id: "boss", parentId: null },
    ...Array.from({ length: 550 }, (_, i) => ({
      id: String(i),
      parentId: "boss",
    })),
  ]);
  assert.ok(layout.width < 4000);
  assert.equal(layout.positions.size, 551);
  const zoom = fitChart(layout.width, layout.height, 1200, 600);
  assert.ok(zoom > 0);
  assert.ok(layout.height * zoom < 600);
  assert.equal(cardMode(zoom), "block");
});
test("a person without reports shows colleagues, with a safe complete reporting path", () => {
  const v = buildView(
    data([
      p("boss"),
      p("manager", "boss"),
      p("Anna", "manager"),
      p("Ben", "manager"),
    ]),
    filters,
  );
  const c = teamContext(v, "Anna")!;
  assert.deepEqual(
    c.colleagues.map((p) => p.id),
    ["Anna", "Ben"],
  );
  assert.equal(c.manager?.id, "manager");
  assert.deepEqual(
    c.path.map((p) => p.id),
    ["boss", "manager", "Anna"],
  );
  assert.equal(c.direct.length, 0);
  assert.equal(c.body, "Board");
  const m = teamContext(v, "manager")!;
  assert.equal(m.descendants, 2);
  assert.equal(m.direct.length, 2);
  assert.equal(m.colleagues.length, 0);
});
test("reporting detail never reconstructs edges cut for a loop or conflict", () => {
  const v = buildView(
    data(
      [p("a", "b"), p("b", "a"), p("child", "a")],
      [
        { employeeId: "a", kind: "LOOP" },
        { employeeId: "b", kind: "LOOP" },
      ],
    ),
    filters,
  );
  assert.deepEqual(
    reportingPath(v, "child").map((p) => p.id),
    ["a", "child"],
  );
  assert.equal(teamContext(v, "a")!.descendants, 1);
  assert.equal(teamContext(v, "missing"), null);
});
test("multiword search and natural sibling order support disambiguation", () => {
  const people = [
    p("a", null, { name: "d kendi" }),
    p("b", "a", { name: "Operator 10" }),
    p("c", "a", { name: "Operator 2" }),
  ];
  assert.deepEqual(
    findChartPeople(data(people), "d ken").map((p) => p.id),
    ["a"],
  );
  assert.deepEqual(buildView(data(people), filters).children.get("a"), [
    "c",
    "b",
  ]);
});
test("department colour does not change when a different filter is used", () => {
  const people = [
    p("a", null, { department: { id: "z", name: "Z" } }),
    p("b", "a", { department: { id: "a", name: "A" } }),
  ];
  const first = departmentPalette(people),
    reverse = departmentPalette([...people].reverse());
  assert.equal(first.colour(people[0]), reverse.colour(people[0]));
  assert.notEqual(first.colour(people[0]), first.colour(people[1]));
});

test("readable leadership uses more columns on wider screens while retaining every real link", () => {
  const items = [
    { id: "board", parentId: null },
    { id: "other-chief", parentId: "board" },
    { id: "owner", parentId: null },
    { id: "chief", parentId: "owner" },
    ...Array.from({ length: 18 }, (_, i) => ({
      id: "leader" + i,
      parentId: "chief",
    })),
  ];
  const narrow = layoutChart(items, 1000),
    wide = layoutChart(items, 1800);
  const columns = (layout: ReturnType<typeof layoutChart>) => {
    const firstY = layout.positions.get("leader0")!.y;
    return [...layout.positions.values()].filter(
      (p) => p.id.startsWith("leader") && p.y === firstY,
    ).length;
  };
  assert.ok(columns(wide) >= 5);
  assert.ok(columns(wide) > columns(narrow));
  assert.ok(wide.height < narrow.height);
  assert.ok(wide.width <= 1800 - 24);
  assert.equal(wide.positions.get("board")!.y, wide.positions.get("owner")!.y);
  assert.equal(wide.positions.size, items.length);
  assert.equal(wide.edges.length, 20);
  for (const edge of wide.edges)
    assert.equal(
      items.find((item) => item.id === edge.child)!.parentId,
      edge.parent,
    );
});

test("responsive layout supports narrow screens, mixed teams and separate roots without card overlap", () => {
  const items = [
    { id: "chief", parentId: null },
    ...Array.from({ length: 18 }, (_, i) => ({
      id: "leader" + i,
      parentId: "chief",
    })),
    ...Array.from({ length: 12 }, (_, i) => ({
      id: "employee" + i,
      parentId: "leader" + (i % 3),
    })),
    ...Array.from({ length: 12 }, (_, i) => ({
      id: "root" + i,
      parentId: null,
    })),
  ];
  for (const width of [360, 1000, 1800]) {
    const layout = layoutChart(items, width),
      nodes = [...layout.positions.values()];
    assert.equal(nodes.length, items.length);
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i],
          b = nodes[j];
        assert.ok(
          a.x + CARD_WIDTH <= b.x ||
            b.x + CARD_WIDTH <= a.x ||
            a.y + CARD_HEIGHT <= b.y ||
            b.y + CARD_HEIGHT <= a.y,
          `overlap at ${width}: ${a.id}/${b.id}`,
        );
      }
    assert.ok(Number.isFinite(layout.width) && Number.isFinite(layout.height));
  }
});
