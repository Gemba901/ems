import { personBranchKey } from "../onboarding-person-search";
import {
  PALETTE,
  OTHER_COLOUR,
  UNRECORDED_COLOUR,
  rankColourGroups,
  coloursForGroups,
  colourOf,
  type ColourGroup,
} from "../branch-colours";
export {
  PALETTE,
  OTHER_COLOUR,
  UNRECORDED_COLOUR,
  type ColourGroup,
} from "../branch-colours";
/** Display-only reporting graph. Never changes saved reporting relationships. */
export type Person = {
  id: string;
  name: string;
  employeeCode?: string | null;
  jobTitle: string | null;
  department: { id: string; name: string } | null;
  branch: { id: string; name: string } | null;
  branchText: string | null;
  managerId: string | null;
  reportsToBody: string | null;
  status: string | null; active?: boolean;
  photoUrl: string | null;
  directReports?: number;
};
export type ChartData = {
  capabilities?: { employmentDetails: boolean; inactivePeople: boolean };
  people: Person[];
  issues: { employeeId: string; kind: string }[];
  source: string;
  refreshedAt: string;
};
export const BODY: Record<string, string> = {
  BOARD: "Board",
  OWNER: "Owner",
  COMMITTEE: "Committee",
  MANAGEMENT_COMMITTEE: "Management Committee",
};
export const ISSUE: Record<string, string> = {
  NO_MANAGER: "No reporting assignment",
  MANAGER_UNAVAILABLE: "Manager not found",
  MANAGER_INACTIVE: "Manager inactive",
  SELF_REPORTING: "Reports to themselves",
  LOOP: "Reporting loop",
  CONFLICTING_REPORTING: "Manager and reporting body both assigned",
};
export const active = (p: Person) => (p.active ?? ["ACTIVE", "PROBATION"].includes(p.status ?? ""));
export const branchName = (p: Person) => p.branch?.name || p.branchText || "";
export const branchKey = (p: Person) => personBranchKey(branchName(p));
export const human = (s: string | null | undefined) =>
  s
    ? s
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/^./, (c) => c.toUpperCase())
    : "Not recorded";
export const initials = (name: string) => {
  const w = name.trim().split(/\s+/);
  return [w[0], w.length > 1 ? w[w.length - 1] : ""]
    .map((x) => Array.from(x || "")[0] || "")
    .join("")
    .toUpperCase();
};
export const byName = (a: Person, b: Person) =>
  a.name.localeCompare(b.name, undefined, { numeric: true }) ||
  a.id.localeCompare(b.id);
export function indexChart(data: ChartData) {
  const byId = new Map(data.people.map((p) => [p.id, p]));
  const issues = new Map<string, string[]>();
  const flag = (id: string, kind: string) =>
    issues.set(id, [...new Set([...(issues.get(id) || []), kind])]);
  data.issues.forEach((i) => flag(i.employeeId, i.kind));
  const parent = new Map<string, string | null>();
  for (const p of data.people) {
    if (p.managerId === p.id) flag(p.id, "SELF_REPORTING");
    else if (p.managerId && !byId.has(p.managerId))
      flag(p.id, "MANAGER_UNAVAILABLE");
    else if (p.managerId && p.reportsToBody)
      flag(p.id, "CONFLICTING_REPORTING");
    else if (
      !p.managerId &&
      !BODY[p.reportsToBody || ""] &&
      !(issues.get(p.id) || []).includes("MANAGER_UNAVAILABLE")
    )
      flag(p.id, "NO_MANAGER");
    const invalid = (issues.get(p.id) || []).some((k) =>
      ["SELF_REPORTING", "LOOP", "CONFLICTING_REPORTING"].includes(k),
    );
    parent.set(
      p.id,
      !invalid && p.managerId && byId.has(p.managerId) ? p.managerId : null,
    );
  }
  // Also detect cycles when an older API did not flag them. Linear and iterative.
  const done = new Set<string>();
  for (const p of data.people) {
    const path: string[] = [],
      at = new Map<string, number>();
    let id: string | null = p.id;
    while (id && !done.has(id) && !at.has(id)) {
      at.set(id, path.length);
      path.push(id);
      id = parent.get(id) || null;
    }
    if (id && at.has(id))
      for (const cycleId of path.slice(at.get(id))) {
        parent.set(cycleId, null);
        flag(cycleId, "LOOP");
      }
    path.forEach((x) => done.add(x));
  }
  const children = new Map<string, string[]>();
  for (const p of data.people) {
    const id = parent.get(p.id);
    if (id) {
      const list = children.get(id) || [];
      list.push(p.id);
      children.set(id, list);
    }
  }
  children.forEach((ids) =>
    ids.sort((a, b) => byName(byId.get(a)!, byId.get(b)!)),
  );
  const roots = data.people
    .filter((p) => !parent.get(p.id))
    .sort(byName)
    .map((p) => p.id);
  const connected = new Set<string>();
  const queue = roots.filter((id) => {
    const p = byId.get(id)!;
    return (
      !p.managerId &&
      !!BODY[p.reportsToBody || ""] &&
      !(issues.get(id) || []).some((k) =>
        ["LOOP", "CONFLICTING_REPORTING"].includes(k),
      )
    );
  });
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    if (connected.has(id)) continue;
    connected.add(id);
    queue.push(...(children.get(id) || []));
  }
  const ancestors = (id: string) => {
    const result: string[] = [];
    let current = parent.get(id);
    while (current) {
      result.push(current);
      current = parent.get(current);
    }
    return result.reverse();
  };
  const descendants = (id: string) => {
    const result: string[] = [],
      pending = [...(children.get(id) || [])];
    while (pending.length) {
      const next = pending.pop()!;
      result.push(next);
      pending.push(...(children.get(next) || []));
    }
    return result;
  };
  const peers = (id: string) => {
    const manager = parent.get(id),
      person = byId.get(id);
    if (manager) return (children.get(manager) || []).filter((x) => x !== id);
    // Missing-manager roots are not assumed to be colleagues of the CEO.
    return person && !person.managerId && BODY[person.reportsToBody || ""]
      ? roots.filter(
          (x) =>
            x !== id &&
            !byId.get(x)!.managerId &&
            byId.get(x)!.reportsToBody === person.reportsToBody,
        )
      : [];
  };
  return {
    byId,
    parent,
    children,
    roots,
    connected,
    issues,
    ancestors,
    descendants,
    peers,
  };
}
export type Index = ReturnType<typeof indexChart>;
const normal = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
/** Unlimited results; rank name beginnings before substrings and role/department matches. */
export function searchPeople(people: Person[], term: string) {
  const q = normal(term),
    tokens = q.split(/\s+/);
  if (!q) return [];
  return people
    .map((p) => {
      const name = normal(p.name),
        title = normal(p.jobTitle || "");
      const all = normal(
        [p.name, p.jobTitle, p.department?.name, branchName(p)].join(" "),
      );
      const score = !tokens.every((t) => all.includes(t))
        ? 99
        : name === q
          ? 0
          : name.startsWith(q)
            ? 1
            : name.split(/\s+/).some((w) => w.startsWith(q))
              ? 2
              : name.includes(q)
                ? 3
                : title.includes(q)
                  ? 4
                  : 5;
      return { p, score };
    })
    .filter((x) => x.score < 99)
    .sort((a, b) => a.score - b.score || byName(a.p, b.p))
    .map((x) => x.p);
}
export type Scope = "connected" | "unconnected" | "all";
export type ViewState = {
  scope: Scope;
  departments: string[];
  branch: string;
  inactive: boolean;
  inactiveOnly: boolean;
  issuesOnly: boolean;
  query: string;
  searchPicked: boolean;
  isolate: string;
  selected: string;
  expanded: string[];
  listView: boolean;
  colourBy: "department" | "branch";
  colourFocus: string[];
  colourSlots: string[];
  colourMode: "main" | "custom";
  colourTone: "standard" | "lighter";
  personal: "" | "department" | "branch";
};
export const initialState = (): ViewState => ({
  scope: "connected",
  departments: [],
  branch: "",
  inactive: false,
  inactiveOnly: false,
  issuesOnly: false,
  query: "",
  searchPicked: false,
  isolate: "",
  selected: "",
  expanded: [],
  listView: false,
  colourBy: "department",
  colourFocus: [],
  colourSlots: [],
  colourMode: "main",
  colourTone: "standard",
  personal: "",
});
export function buildView(
  index: Index,
  state: Pick<
    ViewState,
    | "scope"
    | "departments"
    | "branch"
    | "inactive"
    | "inactiveOnly"
    | "issuesOnly"
    | "query"
    | "isolate"
  >,
) {
  const people = [...index.byId.values()];
  const isolated = state.isolate
    ? new Set(
        index.byId.has(state.isolate)
          ? [
              state.isolate,
              ...index.descendants(state.isolate),
              ...index.peers(state.isolate),
            ]
          : [],
      )
    : null;
  const eligible = people.filter(
    (p) =>
      (state.inactiveOnly ? !active(p) : state.inactive || active(p)) &&
      (!state.departments.length ||
        state.departments.includes(p.department?.id || "")) &&
      (!state.branch || branchKey(p) === state.branch) &&
      (!state.issuesOnly || index.issues.has(p.id)) &&
      (!isolated || isolated.has(p.id)) &&
      (state.scope === "all" ||
        index.connected.has(p.id) === (state.scope === "connected")),
  );
  const matching = state.query.trim()
    ? searchPeople(eligible, state.query)
    : eligible.sort(byName);
  const matches = new Set(matching.map((p) => p.id)),
    audience = new Set(eligible.map((p) => p.id)),
    included = new Set(audience);
  audience.forEach((id) => index.ancestors(id).forEach((x) => included.add(x)));
  return {
    matching,
    matches,
    audience,
    included,
    roots: index.roots.filter((id) => included.has(id)),
  };
}
/** Reconcile new directory data without resetting filters or reopening manually closed teams. */
export function refreshView(
  previous: Index,
  index: Index,
  state: ViewState,
): ViewState {
  const before = buildView(previous, state),
    after = buildView(index, state);
  const expanded = new Set(state.expanded.filter((id) => index.byId.has(id)));
  const priorParents = [...before.included].filter((id) =>
    (previous.children.get(id) || []).some((child) =>
      before.included.has(child),
    ),
  );
  const wasAllOpen =
    priorParents.some((id) => !before.roots.includes(id)) &&
    priorParents.every((id) => state.expanded.includes(id));
  if (wasAllOpen)
    for (const id of after.included)
      if (
        (index.children.get(id) || []).some((child) =>
          after.included.has(child),
        )
      )
        expanded.add(id);
  const targeted = !!(
    state.query ||
    state.departments.length ||
    state.branch ||
    state.issuesOnly ||
    state.inactiveOnly ||
    state.isolate
  );
  for (const id of after.matches) {
    if (
      targeted &&
      (!before.matches.has(id) ||
        JSON.stringify(previous.ancestors(id)) !==
          JSON.stringify(index.ancestors(id)))
    ) {
      index.ancestors(id).forEach((parent) => expanded.add(parent));
    }
  }
  const selected = after.included.has(state.selected) ? state.selected : "";
  if (
    selected &&
    JSON.stringify(previous.ancestors(selected)) !==
      JSON.stringify(index.ancestors(selected))
  )
    index.ancestors(selected).forEach((parent) => expanded.add(parent));
  const { main, others } = colourGroups(
    [...index.byId.values()],
    state.colourBy,
  );
  const valid = new Set([...main, ...others].map((g) => g.id));
  const colourFocus = state.colourFocus.filter((id) => valid.has(id));
  return {
    ...state,
    selected,
    searchPicked: !!(state.searchPicked && selected && !state.query),
    expanded: [...expanded],
    colourFocus,
    colourSlots:
      state.colourMode === "custom"
        ? assignColourSlots(colourFocus, state.colourSlots)
        : [],
  };
}
export const CARD = {
  width: 244,
  height: 146,
  gap: 28,
  levelGap: 88,
  bodyHeight: 52,
};
export type Node = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  body?: string;
};
export type Line = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  child: string;
};
export type Drawing = {
  nodes: Node[];
  lines: Line[];
  width: number;
  height: number;
};
/** Teams wrap into compact rows. Callers may choose portrait proportions; zoom never reflows teams. */
export function layoutChart(
  index: Index,
  included: Set<string>,
  open: Set<string>,
  _wrapRoots = false,
  options: {
    compact?: boolean;
    aspectRatio?: number;
    columns?: { teams: number; people: number };
  } = {},
): Drawing {
  const {
    width: W,
    height: H,
    levelGap,
    bodyHeight,
  } = options.compact
    ? { width: 240, height: 90, levelGap: 50, bodyHeight: 36 }
    : CARD;
  const gap = options.compact ? 24 : 36,
    rowGap = options.compact ? 40 : 64,
    gutter = options.compact ? 24 : 36;
  const targetAspect = Math.max(0.5, Math.min(5, options.aspectRatio || 1.8));
  type Item = { id: string; body?: string; kids: string[]; height: number };
  type Box = {
    width: number;
    height: number;
    rows: string[][];
    widths: number[];
    heights: number[];
  };
  const items = new Map<string, Item>(),
    boxes = new Map<string, Box>();
  for (const id of included)
    items.set(id, {
      id,
      height: H,
      kids: open.has(id)
        ? (index.children.get(id) || []).filter((k) => included.has(k))
        : [],
    });
  const roots: string[] = [];
  for (const id of index.roots.filter((id) => included.has(id))) {
    const p = index.byId.get(id)!;
    if (index.connected.has(id) && !p.managerId && p.reportsToBody) {
      const key = `body:${p.reportsToBody}`;
      if (!items.has(key)) {
        items.set(key, {
          id: key,
          body: BODY[p.reportsToBody] || p.reportsToBody,
          height: bodyHeight,
          kids: [],
        });
        roots.push(key);
      }
      items.get(key)!.kids.push(id);
    } else roots.push(id);
  }
  function pack(ids: string[], headHeight: number): Box {
    if (!ids.length)
      return {
        width: W,
        height: headHeight,
        rows: [],
        widths: [],
        heights: [],
      };
    let best: Box | undefined,
      bestScore = Infinity;
    const area = ids.reduce(
      (n, id) => n + boxes.get(id)!.width * boxes.get(id)!.height,
      0,
    );
    const first = ids.length > 1 ? 2 : 1;
    const columnChoices = options.columns
      ? [
          Math.max(
            1,
            Math.min(
              ids.length,
              ids.every((id) => !items.get(id)!.kids.length)
                ? options.columns.people
                : options.columns.teams,
            ),
          ),
        ]
      : Array.from(
          { length: Math.min(64, ids.length) - first + 1 },
          (_, n) => n + first,
        );
    for (const columns of columnChoices) {
      const rows: string[][] = [];
      for (let n = 0; n < ids.length; n += columns)
        rows.push(ids.slice(n, n + columns));
      const widths = rows.map(
        (row) =>
          row.reduce((n, id) => n + boxes.get(id)!.width, 0) +
          Math.max(0, row.length - 1) * gap,
      );
      const heights = rows.map((row) =>
        Math.max(...row.map((id) => boxes.get(id)!.height)),
      );
      const width = Math.max(W, ...widths) + (rows.length > 1 ? gutter : 0);
      const height =
        headHeight +
        (headHeight ? levelGap : 0) +
        heights.reduce((a, b) => a + b, 0) +
        Math.max(0, rows.length - 1) * rowGap;
      const score =
        (width * height) / Math.max(1, area) +
        1.8 * Math.abs(Math.log(width / Math.max(1, height) / targetAspect));
      if (score < bestScore) {
        bestScore = score;
        best = { width, height, rows, widths, heights };
      }
    }
    return best!;
  }
  roots.sort(
    (a, b) => Number(!a.startsWith("body:")) - Number(!b.startsWith("body:")),
  );
  const stack = roots.map((id) => ({ id, done: false }));
  while (stack.length) {
    const item = stack.pop()!,
      p = items.get(item.id)!;
    if (!item.done) {
      stack.push({ id: item.id, done: true });
      p.kids.forEach((id) => stack.push({ id, done: false }));
    } else boxes.set(item.id, pack(p.kids, p.height));
  }
  if (!roots.length) return { nodes: [], lines: [], width: W, height: H };
  const forest = pack(roots, 0),
    nodes: Node[] = [],
    lines: Line[] = [];
  const places: { id: string; left: number; top: number }[] = [];
  let rootY = 0;
  forest.rows.forEach((row, r) => {
    let x = (forest.width - forest.widths[r]) / 2;
    row.forEach((id) => {
      places.push({ id, left: x, top: rootY });
      x += boxes.get(id)!.width + gap;
    });
    rootY += forest.heights[r] + rowGap;
  });
  places.reverse();
  while (places.length) {
    const { id, left, top } = places.pop()!,
      item = items.get(id)!,
      box = boxes.get(id)!;
    const x = left + (box.width - W) / 2,
      px = x + W / 2;
    nodes.push({
      id,
      body: item.body,
      x,
      y: top,
      width: W,
      height: item.height,
    });
    const firstBus = top + item.height + levelGap / 2,
      trunk = left + gutter / 2;
    let y = top + item.height + levelGap;
    box.rows.forEach((row, r) => {
      const bus = r ? y - rowGap / 2 : firstBus;
      let cursor =
        box.rows.length > 1
          ? left + gutter
          : left + (box.width - box.widths[r]) / 2;
      for (const child of row) {
        const b = boxes.get(child)!,
          cx = cursor + b.width / 2;
        lines.push({
          x1: px,
          y1: top + item.height,
          x2: px,
          y2: firstBus,
          child,
        });
        if (r)
          lines.push(
            { x1: px, y1: firstBus, x2: trunk, y2: firstBus, child },
            { x1: trunk, y1: firstBus, x2: trunk, y2: bus, child },
          );
        lines.push(
          { x1: r ? trunk : px, y1: bus, x2: cx, y2: bus, child },
          { x1: cx, y1: bus, x2: cx, y2: y, child },
        );
        places.push({ id: child, left: cursor, top: y });
        cursor += b.width + gap;
      }
      y += box.heights[r] + rowGap;
    });
  }
  return { nodes, lines, width: forest.width, height: forest.height };
}
/** The outline uses the same opened teams and people as the drawing. */
/** Compare complete arrangements at the available viewport; zoom does not change this choice. */
export function layoutForViewport(
  index: Index,
  included: Set<string>,
  open: Set<string>,
  width: number,
  height: number,
  compact = false,
): Drawing {
  let best = layoutChart(index, included, open, false, {
    compact,
    aspectRatio: width <= 760 || compact ? width / Math.max(1, height) : 1.8,
  });
  let score = fitZoom(best, width, height);
  for (const teams of [2, 4, 6, 8, 12])
    for (const people of [2, 3, 4, 6, 8]) {
      const candidate = layoutChart(index, included, open, false, {
        compact,
        columns: { teams, people },
      });
      const next = fitZoom(candidate, width, height);
      if (next > score * 1.02) {
        best = candidate;
        score = next;
      }
    }
  return best;
}

export function outlineRows(index: Index, drawing: Drawing) {
  const visible = new Set(
    drawing.nodes.filter((n) => !n.body).map((n) => n.id),
  );
  const result: { id: string; depth: number }[] = [],
    todo = index.roots
      .filter((id) => visible.has(id))
      .reverse()
      .map((id) => ({ id, depth: 0 }));
  while (todo.length) {
    const row = todo.pop()!;
    result.push(row);
    const kids = (index.children.get(row.id) || []).filter((id) =>
      visible.has(id),
    );
    for (let n = kids.length - 1; n >= 0; n--)
      todo.push({ id: kids[n], depth: row.depth + 1 });
  }
  return result;
}
export const fitZoom = (d: Drawing, width: number, height: number) =>
  Math.max(
    0.0001,
    Math.min(1, (width - 64) / d.width, (height - 64) / d.height),
  );
export const cardMode = (zoom: number) =>
  zoom >= 0.72 ? "full" : zoom >= 0.4 ? "name" : "block";
// Rank once from the whole loaded company. Filters and zoom never reassign colours.
// Smaller groups use a separate lighter set, never the same saturated swatches.
export const LIGHT_PALETTE = [
  "#87bfdd",
  "#f5ce7b",
  "#7ecab1",
  "#bba0d1",
  "#f6ed91",
  "#e4b4d0",
  "#bc9b7a",
  "#a5daf3",
  "#cedd86",
  "#edb48a",
  "#ee9294",
  "#9aaaca",
  "#adc58b",
];
export function colourGroups(
  people: Person[],
  by: "department" | "branch" = "department",
) {
  const groups = new Map<string, ColourGroup>();
  const labels = new Map<string, Map<string, number>>();
  for (const p of people) {
    const id = by === "branch" ? branchKey(p) : p.department?.id || "";
    if (!id) continue;
    const name = (
      by === "branch" ? branchName(p) : p.department?.name || ""
    ).trim();
    const group = groups.get(id) || { id, name, people: 0, activePeople: 0 };
    group.people++;
    if (active(p)) group.activePeople++;
    groups.set(id, group);
    const spellings = labels.get(id) || new Map<string, number>();
    if (name) spellings.set(name, (spellings.get(name) || 0) + 1);
    labels.set(id, spellings);
  }
  // Same display spelling and totals as the directory's company-wide branches list.
  // Include employees without departments; never rank a filtered or opened subset.
  for (const [id, group] of groups)
    group.name =
      [...labels.get(id)!].sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
      )[0]?.[0] || group.name;
  return rankColourGroups([...groups.values()]);
}
/** Keep remaining groups in their existing palette slots. New choices fill empty slots. */
export function assignColourSlots(chosen: string[], previous: string[] = []) {
  const ids = [...new Set(chosen.filter(Boolean))].slice(0, PALETTE.length);
  const used = new Set<string>();
  const slots = Array.from({ length: PALETTE.length }, (_, n) => {
    const id = previous[n];
    if (!id || !ids.includes(id) || used.has(id)) return "";
    used.add(id);
    return id;
  });
  for (const id of ids)
    if (!used.has(id)) {
      slots[slots.indexOf("")] = id;
      used.add(id);
    }
  while (slots.length && !slots[slots.length - 1]) slots.pop();
  return slots;
}
export function coloursFor(
  people: Person[],
  by: "department" | "branch" = "department",
  focus: string[] = [],
  custom = focus.length > 0,
  previousSlots: string[] = [],
  tone: "standard" | "lighter" = "standard",
) {
  const { main, others } = colourGroups(people, by),
    all = [...main, ...others];
  if (!custom && tone === "standard") return coloursForGroups(all);
  const chosen = custom
    ? [...new Set(focus)]
        .filter((id) => all.some((g) => g.id === id))
        .slice(0, PALETTE.length)
    : main.map((g) => g.id);
  const slots = assignColourSlots(chosen, custom ? previousSlots : []);
  return new Map(
    all.map((g) => [
      g.id,
      chosen.includes(g.id)
        ? (tone === "lighter" ? LIGHT_PALETTE : PALETTE)[slots.indexOf(g.id)]
        : OTHER_COLOUR,
    ]),
  );
}
export const personColour = (
  p: Person,
  colours: Map<string, string>,
  by: "department" | "branch" = "department",
) => {
  const id = by === "branch" ? branchKey(p) : p.department?.id || "";
  return colourOf(colours, id);
};
export function colourKey(
  people: Person[],
  colours: Map<string, string>,
  by: "department" | "branch",
) {
  const { main, others } = colourGroups(people, by);
  const rows = new Map<string, { colour: string; groups: ColourGroup[] }>();
  for (const g of [...main, ...others]) {
    const colour = colours.get(g.id) || OTHER_COLOUR;
    const row = rows.get(colour) || { colour, groups: [] };
    row.groups.push(g);
    rows.set(colour, row);
  }
  const missing = people.filter((p) =>
    by === "branch" ? !branchKey(p) : !p.department?.id,
  ).length;
  if (missing)
    rows.set(UNRECORDED_COLOUR, {
      colour: UNRECORDED_COLOUR,
      groups: [
        { id: "", name: "Not recorded", people: missing, activePeople: 0 },
      ],
    });
  return [...rows.values()];
}
export function readView(search: string): ViewState {
  const p = new URLSearchParams(search),
    s = initialState();
  const scope = p.get("scope");
  if (scope === "unconnected" || scope === "all") s.scope = scope;
  for (const key of ["branch", "query", "isolate", "selected"] as const)
    s[key] = p.get(key) || "";
  s.departments = [...new Set(p.getAll("department").filter(Boolean))];
  s.searchPicked = p.get("picked") === "1" && !!s.selected && !s.query;
  s.colourFocus = [...new Set(p.getAll("highlight").filter(Boolean))].slice(
    0,
    PALETTE.length,
  );
  s.personal =
    p.get("personal") === "department"
      ? "department"
      : p.get("personal") === "branch"
        ? "branch"
        : "";
  s.inactiveOnly = p.get("status") === "inactive";
  s.inactive =
    s.inactiveOnly || p.get("status") === "all" || p.get("inactive") === "1";
  s.colourMode =
    p.get("colourMode") === "custom" || s.colourFocus.length
      ? "custom"
      : "main";
  s.colourSlots =
    s.colourMode === "custom" && p.has("colourSlot")
      ? assignColourSlots(
          s.colourFocus,
          p.getAll("colourSlot").slice(0, PALETTE.length),
        )
      : [];
  s.colourTone =
    s.colourMode === "custom" && p.get("colourTone") === "lighter"
      ? "lighter"
      : "standard";
  s.issuesOnly = p.get("issues") === "1";
  s.listView = p.get("view") === "list";
  s.colourBy = p.get("colours") === "branch" ? "branch" : "department";
  return s;
}
export function viewUrl(s: ViewState) {
  const p = new URLSearchParams();
  p.set("scope", s.scope);
  s.departments.forEach((id) => p.append("department", id));
  s.colourFocus.forEach((id) => p.append("highlight", id));
  if (s.colourMode === "custom")
    s.colourSlots.forEach((id) => p.append("colourSlot", id));
  if (s.personal) p.set("personal", s.personal);
  for (const key of ["branch", "query", "isolate", "selected"] as const)
    if (s[key]) p.set(key, s[key]);
  if (s.searchPicked && s.selected && !s.query) p.set("picked", "1");
  if (s.inactiveOnly) p.set("status", "inactive");
  else if (s.inactive) p.set("inactive", "1");
  if (s.colourMode === "custom") p.set("colourMode", "custom");
  if (s.colourMode === "custom" && s.colourTone === "lighter")
    p.set("colourTone", "lighter");
  if (s.issuesOnly) p.set("issues", "1");
  if (s.listView) p.set("view", "list");
  if (s.colourBy === "branch") p.set("colours", "branch");
  return p.toString();
}

/** Only managers with direct reports actually drawn, not hidden expansion flags. */
export function openTeamsInDrawing(
  index: Index,
  drawing: Drawing,
  open: ReadonlySet<string>,
) {
  const drawn = new Set(
    drawing.nodes.filter((node) => !node.body).map((node) => node.id),
  );
  return [...drawn]
    .flatMap((id) => {
      const person = index.byId.get(id);
      if (!person || !open.has(id)) return [];
      const shownReports = (index.children.get(id) || []).filter((child) =>
        drawn.has(child),
      ).length;
      return shownReports ? [{ person, shownReports }] : [];
    })
    .sort((a, b) => byName(a.person, b.person));
}

/** Upgrade legacy branch IDs/raw labels without discarding unrelated saved filters or colour slots. */
export function normaliseBranchView(
  state: ViewState,
  people: readonly Person[],
): ViewState {
  const aliases = new Map<string, string>();
  for (const person of people) {
    const key = branchKey(person);
    for (const legacy of [
      person.branch?.id || person.branchText,
      branchName(person),
    ])
      if (legacy) aliases.set(legacy, key);
  }
  const keyOf = (value: string) =>
    value ? (aliases.get(value) ?? personBranchKey(value)) : "";
  const branch = keyOf(state.branch);
  if (state.colourBy !== "branch") return { ...state, branch };
  const colourFocus = [
    ...new Set(state.colourFocus.map(keyOf).filter(Boolean)),
  ];
  return {
    ...state,
    branch,
    colourFocus,
    colourSlots:
      state.colourMode === "custom"
        ? assignColourSlots(colourFocus, state.colourSlots.map(keyOf))
        : [],
  };
}
