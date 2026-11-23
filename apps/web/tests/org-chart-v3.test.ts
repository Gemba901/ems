import test from "node:test";
import assert from "node:assert/strict";
import {
  buildView,
  indexChart,
  initialState,
  layoutChart,
  layoutForViewport,
  searchPeople,
  fitZoom,
  cardMode,
  coloursFor,
  assignColourSlots,
  refreshView,
  colourGroups,
  colourKey,
  OTHER_COLOUR,
  UNRECORDED_COLOUR,
  PALETTE,
  LIGHT_PALETTE,
  outlineRows,
  openTeamsInDrawing,
  readView,
  viewUrl,
  type Person,
  type Drawing,
  type ChartData,
} from "../components/ems/org-chart-v3/model";
import {
  inside,
  printTiles,
  printDocument,
  printOutlineDocument,
} from "../components/ems/org-chart-v3/print";
import {
  fitCamera,
  overviewCamera,
  hitTestPerson,
  limitCamera,
  settleCamera,
  spotCamera,
  centreCamera,
  zoomCamera,
  zoomSelectedCamera,
  anchorCamera,
  screenLine,
} from "../components/ems/org-chart-v3/camera";
const person = (id: string, overrides: Partial<Person> = {}): Person => ({
  id,
  name: id,
  jobTitle: "Operator",
  department: { id: "d1", name: "Production" },
  branch: null,
  branchText: "Head Office",
  managerId: "ceo",
  reportsToBody: null,
  status: "ACTIVE",
  photoUrl: null,
  ...overrides,
});
const data = (people: Person[]): ChartData => ({
  people,
  issues: [],
  source: "Test fixture",
  refreshedAt: "2026-11-19T09:00:00Z",
});
const sample = () =>
  data([
    person("ceo", {
      name: "Surya Pareek",
      managerId: null,
      reportsToBody: "BOARD",
    }),
    person("a", { name: "Jackson Ouma", jobTitle: "Supervisor" }),
    person("b", { name: "Mary Jackson", jobTitle: "Supervisor" }),
    person("c", { name: "Priyanka", managerId: "a" }),
    person("d", {
      name: "Supriya",
      managerId: "b",
      department: { id: "d2", name: "Quality" },
    }),
    person("dup", { name: "Surya Pareek", managerId: null }),
    person("u", { managerId: "dup" }),
  ]);
test("same name records remain separate, and a missing-manager team is not promoted to company leadership", () => {
  const i = indexChart(sample());
  assert.equal(i.byId.size, 7);
  assert(i.connected.has("ceo"));
  assert(!i.connected.has("dup"));
  assert(!i.connected.has("u"));
  assert.deepEqual(i.peers("dup"), []);
});
test("cycles and conflicting reporting are bounded even without API issue flags", () => {
  const i = indexChart(
    data([
      person("a", { managerId: "b" }),
      person("b", { managerId: "a" }),
      person("c", { managerId: "a" }),
      person("d", { managerId: "c", reportsToBody: "BOARD" }),
    ]),
  );
  assert(i.issues.get("a")?.includes("LOOP"));
  assert(i.issues.get("d")?.includes("CONFLICTING_REPORTING"));
  const d = layoutChart(i, new Set(i.byId.keys()), new Set(i.byId.keys()));
  assert.equal(d.nodes.filter((n) => !n.body).length, 4);
});
test("inactive managers remain context and do not detach a valid team", () => {
  const i = indexChart(
    data([
      person("ceo", {
        managerId: null,
        reportsToBody: "BOARD",
        status: "INACTIVE",
      }),
      person("a"),
    ]),
  );
  const v = buildView(i, initialState());
  assert(v.matches.has("a"));
  assert(!v.matches.has("ceo"));
  assert(v.included.has("ceo"));
  assert(i.connected.has("a"));
});
test("department and branch filters keep only matching people plus ancestors", () => {
  const i = indexChart(sample());
  const v = buildView(i, { ...initialState(), departments: ["d2"] });
  assert.deepEqual([...v.matches], ["d"]);
  assert.deepEqual([...v.included].sort(), ["b", "ceo", "d"]);
  assert.equal(
    buildView(i, { ...initialState(), branch: "Other" }).matches.size,
    0,
  );
});
test("prefix search precedes substring search; general roles and names return every match", () => {
  const d = sample();
  assert.deepEqual(
    searchPeople(d.people, "pri").map((p) => p.id),
    ["c", "d"],
  );
  assert.deepEqual(
    searchPeople(d.people, "jackson").map((p) => p.id),
    ["a", "b"],
  );
  assert.deepEqual(
    searchPeople(d.people, "supervisor").map((p) => p.id),
    ["a", "b"],
  );
  const many = Array.from({ length: 90 }, (_, n) =>
    person(`person-${n}`, { name: `Jackson ${n}` }),
  );
  assert.equal(searchPeople(many, "jackson").length, 90);
});
test("isolation includes peers without including their teams", () => {
  const i = indexChart(sample());
  const v = buildView(i, { ...initialState(), isolate: "a" });
  assert(v.matches.has("a"));
  assert(v.matches.has("b"));
  assert(v.matches.has("c"));
  assert(v.included.has("ceo"));
  assert(!v.included.has("d"));
});
test("expansion stays horizontal and each manager centres over their whole subtree", () => {
  const i = indexChart(sample());
  const v = buildView(i, initialState());
  const d = layoutChart(i, v.included, new Set(v.included));
  const a = d.nodes.find((n) => n.id === "a")!,
    b = d.nodes.find((n) => n.id === "b")!,
    ceo = d.nodes.find((n) => n.id === "ceo")!;
  assert.equal(a.y, b.y);
  assert(a.x < ceo.x && b.x > ceo.x);
  const cards = d.nodes.filter((n) => !n.body);
  for (let x = 0; x < cards.length; x++)
    for (let y = x + 1; y < cards.length; y++) {
      const a = cards[x],
        b = cards[y];
      assert(
        a.x + a.width <= b.x ||
          b.x + b.width <= a.x ||
          a.y + a.height <= b.y ||
          b.y + b.height <= a.y,
      );
    }
});
test("show all keeps every person above 300 and Fit covers all bounds", () => {
  const people = [
    person("ceo", { managerId: null, reportsToBody: "BOARD" }),
    ...Array.from({ length: 550 }, (_, n) => person(`p${n}`)),
  ];
  const i = indexChart(data(people));
  const d = layoutChart(i, new Set(i.byId.keys()), new Set(i.byId.keys()));
  assert.equal(d.nodes.filter((n) => !n.body).length, 551);
  const z = fitZoom(d, 1100, 650);
  assert(d.width * z <= 1036.001);
  assert(d.height * z <= 586.001);
});
test("zoom text modes depend only on present zoom, never the zoom direction", () => {
  assert.equal(cardMode(0.41), "name");
  assert.equal(cardMode(0.49), "name");
  assert.equal(cardMode(0.2), "block");
  assert.equal(cardMode(0.72), "full");
  [0.41, 0.49, 0.59].forEach((z) => {
    cardMode(1);
    assert.equal(cardMode(z), "name");
    cardMode(0.2);
    assert.equal(cardMode(z), "name");
  });
});
test("view URL preserves filters, isolation, selection and literal search characters", () => {
  const s = {
    ...initialState(),
    query: "Jackson & team",
    departments: ["d2"],
    branch: "Nai",
    inactive: true,
    issuesOnly: true,
    scope: "all" as const,
    isolate: "a",
    selected: "b",
  };
  assert.deepEqual(readView(viewUrl(s)), s);
});
test("print pages include every whole card, retain all branches, and escape untrusted labels", () => {
  const d = sample();
  d.people[0].name = '<script>alert("x")</script>';
  const i = indexChart(d);
  const draw = layoutChart(i, new Set(i.byId.keys()), new Set(i.byId.keys()));
  for (const node of draw.nodes)
    assert(printTiles(draw, "pages").some((t) => inside(node, t)));
  const html = printDocument(
    draw,
    i,
    coloursFor(d.people),
    "pages",
    "<unsafe>",
    "Test",
    "19 Nov 2026",
  );
  assert(!html.includes("<script>"));
  assert(html.includes("&lt;unsafe&gt;"));
  assert(html.includes("Surya Pareek"));
});
test("large and deep charts paginate without losing individual nodes", () => {
  const people = [
    person("ceo", { managerId: null, reportsToBody: "BOARD" }),
    ...Array.from({ length: 120 }, (_, n) =>
      person(`p${n}`, { managerId: n < 40 ? "ceo" : `p${n - 40}` }),
    ),
  ];
  const i = indexChart(data(people));
  const d = layoutChart(i, new Set(i.byId.keys()), new Set(i.byId.keys()));
  const tiles = printTiles(d, "pages");
  assert(tiles.length > 1);
  d.nodes.forEach((n) =>
    assert(
      tiles.some((t) => inside(n, t)),
      n.id,
    ),
  );
});

test("a company-sized team occupies multiple compact rows rather than a one-pixel strip", () => {
  const people = [
    person("ceo", { managerId: null, reportsToBody: "BOARD" }),
    ...Array.from({ length: 1350 }, (_, n) => person(`p${n}`)),
  ];
  const i = indexChart(data(people)),
    d = layoutChart(i, new Set(i.byId.keys()), new Set(i.byId.keys()));
  const z = fitZoom(d, 1500, 650);
  assert.equal(d.nodes.filter((n) => !n.body).length, 1351);
  assert(
    d.width / d.height > 1 && d.width / d.height < 3,
    "the map should make use of width and height",
  );
  assert(
    244 * z >= 15,
    "fitted people must remain distinct tiles at this test viewport",
  );
  assert(
    new Set(d.nodes.filter((n) => n.id.startsWith("p")).map((n) => n.y)).size >
      1,
  );
});

test("an unavailable manager does not become an unassigned-manager message", () => {
  const d = data([person("missing", { managerId: null })]);
  d.issues = [{ employeeId: "missing", kind: "MANAGER_UNAVAILABLE" }];
  assert.deepEqual(indexChart(d).issues.get("missing"), [
    "MANAGER_UNAVAILABLE",
  ]);
});

test("the largest thirteen groups have unique colours and smaller groups stay grey", () => {
  const people = Array.from({ length: 40 }, (_, n) =>
    person(`p${n}`, {
      department: { id: `d${n}`, name: `Department ${n}` },
      branch: { id: `b${n}`, name: `Branch ${n}` },
    }),
  );
  for (const by of ["department", "branch"] as const) {
    const colours = coloursFor(people, by),
      g = colourGroups(people, by);
    assert.equal(g.main.length, 13);
    assert.equal(g.others.length, 27);
    assert.equal(new Set(colours.values()).size, 14);
    g.others.forEach((x) => assert.equal(colours.get(x.id), OTHER_COLOUR));
    assert.deepEqual([...coloursFor([...people].reverse(), by)], [...colours]);
  }
});
test("the outline and print contain exactly the opened chart people in reporting order", () => {
  const i = indexChart(sample()),
    included = new Set(i.byId.keys()),
    d = layoutChart(i, included, new Set(["ceo", "dup"]));
  const rows = outlineRows(i, d);
  assert.equal(rows.length, d.nodes.filter((n) => !n.body).length);
  assert(!rows.some((r) => r.id === "c"));
  assert(
    rows.findIndex((r) => r.id === "ceo") < rows.findIndex((r) => r.id === "a"),
  );
  assert.equal(rows.find((r) => r.id === "a")!.depth, 1);
  const html = printOutlineDocument(
    rows,
    i,
    "Company",
    "Current view",
    "Today",
  );
  assert(html.includes("Jackson Ouma"));
  assert(!html.includes("Priyanka"));
});
test("camera panning can place a far-right person anywhere inside the full viewport", () => {
  const i = indexChart(sample()),
    d = layoutChart(i, new Set(i.byId.keys()), new Set(i.byId.keys()));
  const size = { width: 1500, height: 650 },
    start = fitCamera(d, size),
    n = d.nodes.at(-1)!;
  for (const target of [100, 750, 1400]) {
    const c = { ...start, x: target - n.x * start.zoom };
    assert(Math.abs(n.x * c.zoom + c.x - target) < 0.0001);
  }
  const huge = { x1: 0, y1: 10, x2: 500000, y2: 10, child: "a" };
  const clipped = screenLine(huge, { zoom: 0.02, x: -700, y: 200 }, size)!;
  assert(Math.abs(clipped.x1) < 0.0001);
  assert(Math.abs(clipped.x2 - 1500) < 0.0001);
  assert.equal(clipped.y1, 200.2);
});
test("zoom preserves its focal point, and opening a team preserves the manager position", () => {
  const i = indexChart(sample()),
    ids = new Set(i.byId.keys()),
    before = layoutChart(i, ids, new Set(["ceo"])),
    after = layoutChart(i, ids, new Set(["ceo", "a"]));
  const c = { zoom: 0.8, x: 40, y: 50 },
    point = { x: 700, y: 350 },
    z = zoomCamera(c, 1.3, point);
  assert(
    Math.abs((point.x - z.x) / z.zoom - (point.x - c.x) / c.zoom) < 0.0001,
  );
  const next = anchorCamera(c, before, after, "a"),
    a = before.nodes.find((n) => n.id === "a")!,
    b = after.nodes.find((n) => n.id === "a")!;
  assert(
    Math.abs(
      (a.x + a.width / 2) * c.zoom +
        c.x -
        ((b.x + b.width / 2) * next.zoom + next.x),
    ) < 0.0001,
  );
  assert.equal(a.y * c.zoom + c.y, b.y * next.zoom + next.y);
  assert(
    centreCamera(after, { width: 500, height: 450 }, c, "a", true).zoom >= 0.8,
  );
});

test("small charts cannot be dragged or restored outside the viewport", () => {
  const d = {
    width: 244,
    height: 146,
    nodes: [{ id: "person", x: 0, y: 0, width: 244, height: 146 }],
    lines: [],
  };
  const size = { width: 1200, height: 600 };
  for (const x of [-100000, 100000])
    for (const y of [-100000, 100000]) {
      const c = limitCamera({ zoom: 1, x, y }, d, size);
      assert(c.x >= 32 && c.x + 244 <= 1168);
      assert(c.y >= 32 && c.y + 146 <= 568);
    }
});
test("large charts allow edge people to be centred but cannot be panned indefinitely", () => {
  const d = {
    width: 20000,
    height: 10000,
    nodes: [
      { id: "a", x: 0, y: 0, width: 244, height: 146 },
      { id: "b", x: 19756, y: 9854, width: 244, height: 146 },
    ],
    lines: [],
  };
  const size = { width: 1200, height: 600 };
  assert.deepEqual(limitCamera({ zoom: 1, x: 1e6, y: 1e6 }, d, size), {
    zoom: 1,
    x: 478,
    y: 227,
  });
  assert.deepEqual(limitCamera({ zoom: 1, x: -1e6, y: -1e6 }, d, size), {
    zoom: 1,
    x: -19278,
    y: -9627,
  });
  const inside = { zoom: 1, x: -4000, y: -3000 };
  assert.equal(limitCamera(inside, d, size), inside);
});
test("fitted and recovered charts remain fully visible after movement limits", () => {
  const i = indexChart(sample()),
    d = layoutChart(i, new Set(i.byId.keys()), new Set(i.byId.keys())),
    size = { width: 390, height: 450 };
  const fitted = limitCamera(fitCamera(d, size), d, size);
  for (const n of d.nodes) {
    assert(n.x * fitted.zoom + fitted.x >= 31.99);
    assert(n.y * fitted.zoom + fitted.y >= 31.99);
    assert((n.x + n.width) * fitted.zoom + fitted.x <= 358.01);
    assert((n.y + n.height) * fitted.zoom + fitted.y <= 418.01);
  }
});

test("an empty area between teams settles near a person without changing zoom", () => {
  const d = {
    width: 10244,
    height: 10146,
    nodes: [
      { id: "a", x: 0, y: 0, width: 244, height: 146 },
      { id: "b", x: 10000, y: 10000, width: 244, height: 146 },
    ],
    lines: [],
  };
  const size = { width: 1200, height: 600 },
    c = { zoom: 1, x: -4500, y: -4500 };
  const next = settleCamera(c, d, size);
  assert.equal(next.zoom, 1);
  assert(
    d.nodes.some(
      (n) =>
        Math.min(size.width - 24, n.x + next.x + n.width) -
          Math.max(24, n.x + next.x) >=
          63.99 &&
        Math.min(size.height - 24, n.y + next.y + n.height) -
          Math.max(24, n.y + next.y) >=
          47.99,
    ),
  );
  const useful = { zoom: 1, x: 32, y: 32 };
  assert.equal(settleCamera(useful, d, size), useful);
});
test("settling random pan and zoom positions always leaves a useful part of a person visible", () => {
  const people = [person("ceo", { managerId: null, reportsToBody: "BOARD" })];
  for (let n = 0; n < 130; n++)
    people.push(
      person(`p${n}`, {
        managerId: n < 6 ? "ceo" : `p${Math.floor((n - 6) / 6)}`,
      }),
    );
  const i = indexChart({ people, issues: [], source: "test", refreshedAt: "" }),
    d = layoutChart(i, new Set(i.byId.keys()), new Set(i.byId.keys()));
  let seed = 7127;
  const random = () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (const size of [
    { width: 390, height: 450 },
    { width: 1500, height: 650 },
  ])
    for (let k = 0; k < 150; k++) {
      const z = 0.04 + random() * 1.96,
        next = settleCamera(
          { zoom: z, x: (random() - 0.5) * 40000, y: (random() - 0.5) * 40000 },
          d,
          size,
        );
      assert.equal(next.zoom, z);
      assert(
        d.nodes.some(
          (n) =>
            !n.body &&
            Math.min(size.width - 24, (n.x + n.width) * z + next.x) -
              Math.max(24, n.x * z + next.x) >=
              Math.min(n.width * z, 64) - 0.001 &&
            Math.min(size.height - 24, (n.y + n.height) * z + next.y) -
              Math.max(24, n.y * z + next.y) >=
              Math.min(n.height * z, 48) - 0.001,
        ),
      );
    }
});
test("mixed-size teams retain non-overlapping cards and visible reporting connections", () => {
  let seed = 3451;
  const random = () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let iteration = 0; iteration < 12; iteration++) {
    const people = [
      person("root", { managerId: null, reportsToBody: "BOARD" }),
    ];
    for (let n = 1; n < 150; n++)
      people.push(
        person(`p${n}`, {
          managerId: people[Math.floor(random() * people.length)].id,
        }),
      );
    const i = indexChart({
        people,
        issues: [],
        source: "test",
        refreshedAt: "",
      }),
      d = layoutChart(i, new Set(i.byId.keys()), new Set(i.byId.keys()));
    assert.equal(d.nodes.filter((n) => !n.body).length, people.length);
    for (let a = 0; a < d.nodes.length; a++) {
      const n = d.nodes[a];
      assert(
        n.x >= 0 &&
          n.y >= 0 &&
          n.x + n.width <= d.width &&
          n.y + n.height <= d.height,
      );
      for (let b = a + 1; b < d.nodes.length; b++) {
        const m = d.nodes[b];
        assert(
          !(
            n.x < m.x + m.width &&
            n.x + n.width > m.x &&
            n.y < m.y + m.height &&
            n.y + n.height > m.y
          ),
        );
      }
      if (!n.body)
        assert(
          d.lines.some(
            (l) =>
              l.child === n.id &&
              Math.abs(l.x2 - (n.x + n.width / 2)) < 0.001 &&
              l.y2 === n.y,
          ),
        );
    }
  }
});
test("printing preserves inactive status and warns about unresolved reporting", () => {
  const data = {
    people: [
      person("problem", {
        name: "Test person",
        managerId: "problem",
        status: "INACTIVE",
      }),
    ],
    issues: [],
    source: "test",
    refreshedAt: "",
  };
  const i = indexChart(data),
    d = layoutChart(i, new Set(i.byId.keys()), new Set());
  const outline = printOutlineDocument(
    outlineRows(i, d),
    i,
    "Company",
    "All",
    "Today",
  );
  assert(outline.includes("Needs review"));
  assert(outline.includes("Reports to themselves"));
  assert(outline.includes("Inactive"));
  const chart = printDocument(
    d,
    i,
    coloursFor(data.people),
    "pages",
    "Company",
    "All",
    "Today",
  );
  assert(chart.includes("Inactive"));
  assert(chart.includes("reporting needs review"));
});

test("the key keeps smaller groups together and distinguishes missing group data", () => {
  const people = Array.from({ length: 40 }, (_, n) =>
    person(`p${n}`, {
      department: {
        id: `d${n}`,
        name: `Department ${String(n).padStart(2, "0")}`,
      },
      branch: { id: `b${n}`, name: `Branch ${String(n).padStart(2, "0")}` },
    }),
  );
  for (const by of ["department", "branch"] as const) {
    const colours = coloursFor(people, by);
    const whole = colourKey(people, colours, by);
    assert.equal(whole.length, 14);
    assert.equal(
      whole.find((row) => row.colour === OTHER_COLOUR)?.groups.length,
      27,
    );
    for (const row of whole)
      for (const group of row.groups)
        assert.equal(row.colour, colours.get(group.id));
    const subset = colourKey([people[0], people[10]], colours, by);
    assert.equal(subset.length, 2);
    assert.equal(subset[0].groups.length, 1);
    const unknown = person("unknown", {
      department: null,
      branch: null,
      branchText: null,
    });
    const missing = colourKey([unknown], colours, by);
    assert.equal(missing.length, 1);
    assert.equal(missing[0].colour, UNRECORDED_COLOUR);
    assert.equal(missing[0].groups[0].name, "Not recorded");
    assert.deepEqual(colourKey([], colours, by), []);
  }
});

test("multiple departments are combined and survive URL round trips including older single-department links", () => {
  const i = indexChart(sample()),
    s = {
      ...initialState(),
      departments: ["d1", "d2"],
      colourFocus: ["d2", "d1"],
      colourMode: "custom" as const,
      personal: "department" as const,
    };
  const v = buildView(i, s);
  assert(v.matches.has("a"));
  assert(v.matches.has("d"));
  assert.deepEqual(readView(viewUrl(s)), s);
  assert.deepEqual(readView("?department=d2").departments, ["d2"]);
  assert.deepEqual(
    readView("?department=d2&department=d2&department=d1").departments,
    ["d2", "d1"],
  );
});
test("a name search highlights matches without dropping the wider audience", () => {
  const i = indexChart(sample()),
    v = buildView(i, { ...initialState(), query: "Priyanka" });
  assert.equal(v.matches.size, 1);
  assert(v.matches.has("c"));
  assert(v.audience.has("a"));
  assert(v.included.has("d"));
  const none = buildView(i, { ...initialState(), query: "not a person" });
  assert.equal(none.matches.size, 0);
  assert(none.included.size > 0);
});
test("department ranking uses active and probation people before inactive counts", () => {
  const people = [
    person("a", { department: { id: "tiny", name: "Tiny" } }),
    ...Array.from({ length: 20 }, (_, n) =>
      person(`x${n}`, {
        department: { id: "inactive", name: "Former" },
        status: "INACTIVE",
      }),
    ),
    ...Array.from({ length: 2 }, (_, n) =>
      person(`y${n}`, {
        department: { id: "probation", name: "New" },
        status: "PROBATION",
      }),
    ),
  ];
  assert.deepEqual(
    colourGroups(people).main.map((g) => g.id),
    ["probation", "tiny", "inactive"],
  );
});
test("chosen small departments get distinct colours and other groups become grey", () => {
  const people = Array.from({ length: 40 }, (_, n) =>
    person(`p${n}`, { department: { id: `d${n}`, name: `D ${n}` } }),
  );
  const c = coloursFor(people, "department", ["d39", "d38"]);
  assert.notEqual(c.get("d39"), c.get("d38"));
  assert.equal(c.get("d0"), OTHER_COLOUR);
  assert.equal(c.get("d39"), PALETTE[0]);
  assert.equal(c.get("d38"), PALETTE[1]);
  const limited = coloursFor(
    people,
    "department",
    people.map((p) => p.department!.id),
  );
  assert.equal(
    [...limited.values()].filter((c) => c !== OTHER_COLOUR).length,
    13,
  );
});
test("moving the spotter preserves zoom and avoids panning while the person is already visible", () => {
  const d = {
    nodes: [
      { id: "a", x: 100, y: 100, width: 244, height: 146 },
      { id: "b", x: 3000, y: 100, width: 244, height: 146 },
    ],
    lines: [],
    width: 3300,
    height: 400,
  };
  const size = { width: 1200, height: 600 },
    c = { zoom: 0.2, x: 50, y: 50 };
  assert.deepEqual(spotCamera(d, size, c, "a"), c);
  const closer = { zoom: 1, x: 0, y: 0 },
    next = spotCamera(d, size, closer, "b");
  assert.equal(next.zoom, 1);
  assert.equal(next.y, 0);
  assert(next.x < 0);
  assert.deepEqual(spotCamera(d, size, next, "b"), next);
});

test("inactive-only finds connected and unconnected people while keeping active managers as context", () => {
  const fixture = sample();
  fixture.people = fixture.people.map((p) =>
    p.id === "c" || p.id === "u" ? { ...p, status: "INACTIVE" } : p,
  );
  const i = indexChart(fixture);
  const s = {
    ...initialState(),
    scope: "all" as const,
    inactive: true,
    inactiveOnly: true,
  };
  const v = buildView(i, s);
  assert.deepEqual([...v.audience].sort(), ["c", "u"]);
  assert(v.included.has("a") && v.included.has("ceo") && v.included.has("dup"));
  assert(!v.matches.has("a"));
  const drawn = layoutChart(i, v.included, new Set(v.included));
  assert(
    drawn.nodes.some((n) => n.id === "c") &&
      drawn.nodes.some((n) => n.id === "u"),
  );
  assert.deepEqual(readView(viewUrl(s)), s);
  assert.equal(readView("?inactive=1").inactiveOnly, false);
  assert.equal(readView("?inactive=1").inactive, true);
  assert.equal(readView("?status=all").inactive, true);
});

test("an empty custom highlight selection stays empty after reload instead of returning to main colours", () => {
  const people = sample().people;
  const s = { ...initialState(), colourMode: "custom" as const };
  assert.deepEqual(readView(viewUrl(s)), s);
  const custom = coloursFor(people, s.colourBy, [], true);
  assert([...custom.values()].every((c) => c === OTHER_COLOUR));
  const main = coloursFor(people, s.colourBy, [], false);
  assert([...main.values()].some((c) => c !== OTHER_COLOUR));
  assert.equal(readView("?highlight=d2").colourMode, "custom");
});

test("Centre selected preserves both a far overview and a close-up; Read card explicitly chooses readable scale", () => {
  const d = {
    nodes: [{ id: "person", x: 2000, y: 800, width: 244, height: 146 }],
    lines: [],
    width: 2500,
    height: 1200,
  };
  const size = { width: 900, height: 500 };
  for (const zoom of [0.12, 1.4]) {
    const c = centreCamera(d, size, { zoom, x: 0, y: 0 }, "person");
    assert.equal(c.zoom, zoom);
    assert.equal((2000 + 122) * c.zoom + c.x, size.width / 2);
    assert.equal((800 + 73) * c.zoom + c.y, size.height / 2);
  }
  assert(
    centreCamera(d, size, { zoom: 0.12, x: 0, y: 0 }, "person", true).zoom >=
      0.8,
  );
});

test("step zoom keeps each corner person centred through movement limits", () => {
  const d = {
    width: 5000,
    height: 4000,
    lines: [],
    nodes: [
      { id: "tl", x: 0, y: 0, width: 244, height: 146 },
      { id: "tr", x: 4756, y: 0, width: 244, height: 146 },
      { id: "bl", x: 0, y: 3854, width: 244, height: 146 },
      { id: "br", x: 4756, y: 3854, width: 244, height: 146 },
    ],
  };
  for (const size of [
    { width: 1200, height: 600 },
    { width: 390, height: 250 },
  ]) {
    for (const n of d.nodes) {
      let c = fitCamera(d, size);
      for (const z of [0.2, 0.4, 0.8, 1.2, 2, 1, 0.4, 0.1]) {
        c = settleCamera(zoomSelectedCamera(d, size, c, z, n.id), d, size);
        assert(
          Math.abs((n.x + n.width / 2) * c.zoom + c.x - size.width / 2) < 0.001,
        );
        assert(
          Math.abs((n.y + n.height / 2) * c.zoom + c.y - size.height / 2) <
            0.001,
        );
      }
    }
  }
});

test("custom colours retain surviving hues through removal, replacement and URL recovery", () => {
  const people = sample().people;
  const base = colourGroups(people).main.map((g) => g.id);
  const before = coloursFor(people);
  const remaining = base.slice(1);
  const slots = assignColourSlots(remaining, base);
  const state = {
    ...initialState(),
    colourMode: "custom" as const,
    colourFocus: remaining,
    colourSlots: slots,
  };
  const restored = readView(viewUrl(state));
  assert.deepEqual(restored.colourSlots, slots);
  const after = coloursFor(
    people,
    "department",
    restored.colourFocus,
    true,
    restored.colourSlots,
  );
  for (const id of remaining) assert.equal(after.get(id), before.get(id));
  assert.equal(after.get(base[0]), OTHER_COLOUR);
  const replacement = assignColourSlots([...remaining, "new"], slots);
  for (const id of remaining)
    assert.equal(replacement.indexOf(id), base.indexOf(id));
  assert.equal(replacement[0], "new");
  assert.equal(
    new Set(replacement.filter(Boolean)).size,
    replacement.filter(Boolean).length,
  );
});
test("refresh clears excluded selection, keeps filters, and opens a moved matching person", () => {
  const first = sample();
  const before = indexChart(first);
  const state = {
    ...initialState(),
    departments: ["d2"],
    selected: "d",
    expanded: ["ceo", "b"],
  };
  const moved = indexChart(
    data(
      first.people.map((p) => (p.id === "d" ? { ...p, managerId: "a" } : p)),
    ),
  );
  const next = refreshView(before, moved, state);
  assert(next.expanded.includes("a"));
  assert.equal(next.selected, "d");
  const excluded = indexChart(
    data(
      first.people.map((p) =>
        p.id === "d"
          ? { ...p, department: { id: "d1", name: "Production" } }
          : p,
      ),
    ),
  );
  const cleared = refreshView(before, excluded, state);
  assert.equal(cleared.selected, "");
  assert.deepEqual(cleared.departments, ["d2"]);
});
test("refresh respects a deliberately collapsed inactive team but opens a new matching path", () => {
  const first = data(
    sample().people.map((p) =>
      p.id === "d" ? { ...p, status: "INACTIVE" } : p,
    ),
  );
  const before = indexChart(first);
  const state = {
    ...initialState(),
    inactive: true,
    inactiveOnly: true,
    expanded: ["ceo"],
  };
  const unchanged = refreshView(before, indexChart(first), state);
  assert(!unchanged.expanded.includes("b"));
  const next = indexChart(
    data([
      ...first.people,
      person("new-manager"),
      person("new-inactive", { managerId: "new-manager", status: "INACTIVE" }),
    ]),
  );
  const refreshed = refreshView(before, next, state);
  assert(refreshed.expanded.includes("new-manager"));
  assert(!refreshed.expanded.includes("b"));
});
test("refresh drops missing custom choices without filling their slots or leaving team scope", () => {
  const first = sample(),
    before = indexChart(first);
  const state = {
    ...initialState(),
    isolate: "b",
    selected: "b",
    colourMode: "custom" as const,
    colourFocus: ["d1", "d2"],
    colourSlots: ["d2", "d1"],
  };
  const after = indexChart(
    data(first.people.filter((p) => !["b", "d"].includes(p.id))),
  );
  const next = refreshView(before, after, state);
  assert.deepEqual(next.colourFocus, ["d1"]);
  assert.deepEqual(next.colourSlots, ["", "d1"]);
  assert.equal(next.selected, "");
  assert.equal(buildView(after, next).included.size, 0);
  assert.equal(next.isolate, "b");
});

test("compact Overview packs to the available shape and keeps readable camera scale in a short window", () => {
  const people = [
    person("ceo", { managerId: null, reportsToBody: "BOARD" }),
    ...Array.from({ length: 18 }, (_, n) => person(`lead-${n}`)),
  ];
  const index = indexChart(data(people)),
    ids = new Set(people.map((p) => p.id));
  const wide = layoutChart(index, ids, new Set(["ceo"]), false, {
    compact: true,
    aspectRatio: 4,
  });
  const tall = layoutChart(index, ids, new Set(["ceo"]), false, {
    compact: true,
    aspectRatio: 0.8,
  });
  assert.equal(wide.nodes.filter((n) => !n.body).length, 19);
  assert(wide.width / wide.height > tall.width / tall.height);
  for (const a of wide.nodes)
    for (const b of wide.nodes) {
      if (a === b) continue;
      assert(
        a.x + a.width <= b.x ||
          b.x + b.width <= a.x ||
          a.y + a.height <= b.y ||
          b.y + b.height <= a.y,
      );
    }
  const size = { width: 1200, height: 200 };
  assert(overviewCamera(wide, size).zoom >= 0.55);
  const fit = fitCamera(wide, size);
  assert(
    fit.zoom < 0.55,
    "explicit Fit remains available below the readable Overview scale",
  );
  for (const n of wide.nodes) {
    assert(n.x * fit.zoom + fit.x >= 0);
    assert((n.x + n.width) * fit.zoom + fit.x <= size.width);
    assert((n.y + n.height) * fit.zoom + fit.y <= size.height);
  }
});

test("smaller-group colours use a separate lighter set and their choice survives URL restore", () => {
  const people = Array.from({ length: 20 }, (_, n) =>
    person(`p${n}`, {
      department: { id: `d${n}`, name: `Department ${n}` },
    }),
  );
  const { main, others } = colourGroups(people);
  const ids = others.map((g) => g.id);
  const colours = coloursFor(people, "department", ids, true, [], "lighter");
  assert.equal(new Set(LIGHT_PALETTE).size, 13);
  assert(LIGHT_PALETTE.every((c) => !new Set<string>(PALETTE).has(c)));
  for (const g of main) assert.equal(colours.get(g.id), OTHER_COLOUR);
  for (const g of others) assert(LIGHT_PALETTE.includes(colours.get(g.id)!));
  const state = {
    ...initialState(),
    colourMode: "custom" as const,
    colourTone: "lighter" as const,
    colourFocus: ids,
    colourSlots: assignColourSlots(ids),
  };
  const restored = readView(viewUrl(state));
  assert.equal(restored.colourTone, "lighter");
  assert.deepEqual(
    coloursFor(
      people,
      restored.colourBy,
      restored.colourFocus,
      true,
      restored.colourSlots,
      restored.colourTone,
    ),
    colours,
  );
  assert.equal(
    readView("colourTone=lighter").colourTone,
    "standard",
    "default Largest selection keeps its standard palette",
  );
});

test("open-team list excludes teams hidden under a closed manager", () => {
  const index = indexChart(sample());
  const view = buildView(index, initialState());
  const open = new Set(["a", "b"]);
  const drawing = layoutChart(index, view.included, open);
  assert.deepEqual(openTeamsInDrawing(index, drawing, open), []);
  open.add("ceo");
  const shown = openTeamsInDrawing(
    index,
    layoutChart(index, view.included, open),
    open,
  );
  assert.deepEqual(
    new Set(shown.map((row) => row.person.id)),
    new Set(["ceo", "a", "b"]),
  );
  assert.equal(shown.find((row) => row.person.id === "a")?.shownReports, 1);
});
test("open-team report counts follow filters and omit synthetic governing bodies", () => {
  const index = indexChart(
    data([
      person("ceo", { managerId: null, reportsToBody: "BOARD" }),
      person("a"),
      person("b", { department: { id: "d2", name: "Quality" } }),
    ]),
  );
  const view = buildView(index, { ...initialState(), departments: ["d1"] });
  const open = new Set([...view.included]);
  const teams = openTeamsInDrawing(
    index,
    layoutChart(index, view.included, open),
    open,
  );
  assert.deepEqual(
    teams.map((row) => [row.person.id, row.shownReports]),
    [["ceo", 1]],
  );
});
test("person picked from suggestions survives a link and clears if no longer available", () => {
  const state = { ...initialState(), selected: "a", searchPicked: true };
  const restored = readView(viewUrl(state));
  assert.equal(restored.selected, "a");
  assert.equal(restored.searchPicked, true);
  assert.equal(restored.query, "");
  assert.equal(readView("?picked=1").searchPicked, false);
  assert.equal(readView("?picked=1&selected=a&query=jac").searchPicked, false);
  const before = indexChart(sample());
  const after = indexChart(data(sample().people.filter((p) => p.id !== "a")));
  const refreshed = refreshView(before, after, state);
  assert.equal(refreshed.selected, "");
  assert.equal(refreshed.searchPicked, false);
});

test("viewport packing keeps all 1351 people and improves the portrait fit without overlap", () => {
  const people = [person("ceo", { managerId: null })];
  for (let m = 0; m < 18; m++) {
    people.push(person(`m${m}`));
    for (let k = 0; k < 74; k++)
      people.push(person(`w${m}-${k}`, { managerId: `m${m}` }));
  }
  const index = indexChart(data(people)),
    included = new Set(people.map((p) => p.id));
  for (const [w, h] of [
    [360, 600],
    [1200, 600],
  ]) {
    const old = layoutChart(index, included, included, false, {
      aspectRatio: w <= 760 ? w / h : 1.8,
    });
    const next = layoutForViewport(index, included, included, w, h);
    assert.deepEqual(new Set(next.nodes.map((n) => n.id)), included);
    assert(fitZoom(next, w, h) >= fitZoom(old, w, h));
    if (w === 360) assert(fitZoom(next, w, h) > fitZoom(old, w, h) * 1.1);
    for (let a = 0; a < next.nodes.length; a++)
      for (let b = a + 1; b < next.nodes.length; b++) {
        const x = next.nodes[a],
          y = next.nodes[b];
        assert(
          x.x + x.width <= y.x ||
            y.x + y.width <= x.x ||
            x.y + x.height <= y.y ||
            y.y + y.height <= x.y,
          `Overlap: ${x.id} / ${y.id}`,
        );
      }
    for (const p of people.filter((p) => p.managerId)) {
      const parent = next.nodes.find((n) => n.id === p.managerId)!,
        child = next.nodes.find((n) => n.id === p.id)!;
      assert(
        next.lines.some(
          (l) =>
            l.child === p.id &&
            l.x1 === parent.x + parent.width / 2 &&
            l.y1 === parent.y + parent.height,
        ),
      );
      assert(
        next.lines.some(
          (l) =>
            l.child === p.id &&
            l.x2 === child.x + child.width / 2 &&
            l.y2 === child.y,
        ),
      );
    }
  }
});

test("viewport packing respects closed teams, filtered people, separate roots and compact overview cards", () => {
  const people = [
    person("ceo", { managerId: null, reportsToBody: "BOARD" }),
    person("m1"),
    person("m2"),
    person("a", { managerId: "m1" }),
    person("b", { managerId: "m2" }),
    person("other", { managerId: null }),
  ];
  const index = indexChart(data(people));
  const included = new Set(people.filter((p) => p.id !== "b").map((p) => p.id)),
    open = new Set(["ceo", "m2"]);
  const expected = layoutChart(index, included, open, true, { compact: true });
  const actual = layoutForViewport(index, included, open, 320, 560, true);
  assert.deepEqual(
    new Set(actual.nodes.map((n) => n.id)),
    new Set(expected.nodes.map((n) => n.id)),
  );
  assert(!actual.nodes.some((n) => n.id === "a" || n.id === "b"));
  assert(actual.nodes.some((n) => n.id === "other"));
  assert(actual.nodes.filter((n) => !n.body).every((n) => n.height === 90));
});

test("phone Overview fits every node rather than imposing the desktop minimum zoom", () => {
  const people = [
    person("ceo", { managerId: null, reportsToBody: "BOARD" }),
    ...Array.from({ length: 18 }, (_, n) => person(`lead-${n}`)),
  ];
  const index = indexChart(data(people));
  const included = new Set(people.map((p) => p.id));
  for (const size of [
    { width: 320, height: 380 },
    { width: 360, height: 600 },
    { width: 430, height: 500 },
  ]) {
    const drawing = layoutForViewport(
      index,
      included,
      new Set(["ceo"]),
      size.width,
      size.height,
      true,
    );
    const camera = overviewCamera(drawing, size, true);
    assert.deepEqual(camera, fitCamera(drawing, size));
    assert(
      camera.zoom < 0.55,
      "fixture exercises the former minimum-zoom crop",
    );
    for (const n of drawing.nodes) {
      assert(n.x * camera.zoom + camera.x >= 0);
      assert(n.y * camera.zoom + camera.y >= 0);
      assert((n.x + n.width) * camera.zoom + camera.x <= size.width);
      assert((n.y + n.height) * camera.zoom + camera.y <= size.height);
    }
    assert(
      overviewCamera(drawing, size).zoom >= 0.55,
      "desktop behaviour stays unchanged",
    );
  }
});

test("small-tile selection prefers actual hits and then the nearest visible edge", () => {
  const d = {
    width: 100,
    height: 100,
    nodes: [
      { id: "a", x: 10, y: 10, width: 10, height: 6 },
      { id: "b", x: 28, y: 10, width: 10, height: 6 },
    ],
    lines: [],
  } as Drawing;
  const c = { zoom: 1, x: 0, y: 0 };
  assert.equal(hitTestPerson(d, c, { x: 19, y: 14 }, 12), "a");
  assert.equal(hitTestPerson(d, c, { x: 21, y: 14 }, 5), "a");
  assert.equal(hitTestPerson(d, c, { x: 27, y: 14 }, 5), "b");
  assert.equal(
    hitTestPerson(d, c, { x: 24, y: 14 }, 5),
    undefined,
    "ambiguous gap must not choose an arbitrary neighbour",
  );
  assert.equal(hitTestPerson(d, c, { x: 12, y: 22 }, 5), undefined);
  assert.equal(
    hitTestPerson(d, c, { x: 12, y: 22 }, 12),
    "a",
    "touch has a little more tolerance",
  );
});
test("hit testing follows zoom/pan and excludes governing labels and invisible nodes", () => {
  const d = {
    width: 1000,
    height: 1000,
    nodes: [
      { id: "body:BOARD", body: "Board", x: 0, y: 0, width: 100, height: 20 },
      { id: "a", x: 100, y: 100, width: 100, height: 60 },
      { id: "hidden", x: -200, y: 100, width: 100, height: 60 },
    ],
    lines: [],
  } as Drawing;
  const c = { zoom: 0.1, x: 10, y: 20 };
  assert.equal(hitTestPerson(d, c, { x: 25, y: 33 }, 5), "a");
  assert.equal(hitTestPerson(d, c, { x: 15, y: 21 }, 2), undefined);
  assert.equal(
    hitTestPerson(d, c, { x: 1, y: 33 }, 12, { width: 100, height: 100 }),
    undefined,
    "fully clipped people are not selectable near the edge",
  );
  assert.equal(
    hitTestPerson(d, c, { x: -1, y: 33 }, 12, { width: 100, height: 100 }),
    undefined,
  );
});

// The public API sends current eligibility separately from restricted HR status.
test("current employees remain searchable and connected when employment status is redacted", () => {
  const people = [
    {id:"m",name:"Manager",jobTitle:"Lead",department:null,branch:null,branchText:null,managerId:null,reportsToBody:"BOARD",status:null,active:true,photoUrl:null},
    {id:"e",name:"Employee",jobTitle:"Technician",department:null,branch:null,branchText:null,managerId:"m",reportsToBody:null,status:null,active:true,photoUrl:null},
  ];
  const index = indexChart({people,issues:[],source:"EMS",refreshedAt:""});
  const view = buildView(index,{...initialState(),query:"Technician"});
  assert.ok(view.matches.has("e"));
  assert.ok(view.included.has("m"));
});
