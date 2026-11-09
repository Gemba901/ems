import type { Position, PositionChart } from './types';

/** Who reports to whom among positions, the chain above a position, and search. Loops never hang. */
export function indexPositions(chart: PositionChart) {
  const byId = new Map(chart.positions.map(p => [p.id, p]));
  const children = new Map<string, Position[]>();
  for (const p of chart.positions) if (p.parentId && byId.has(p.parentId)) children.set(p.parentId, [...(children.get(p.parentId) ?? []), p]);
  const childrenOf = (id: string) => children.get(id) ?? [];
  const pathTo = (id: string) => {
    const path: Position[] = []; const seen = new Set<string>(); let current = byId.get(id);
    while (current && !seen.has(current.id)) { seen.add(current.id); path.unshift(current); current = current.parentId ? byId.get(current.parentId) : undefined; }
    return path;
  };
  const roots = chart.positions.filter(p => !p.parentId || !byId.has(p.parentId));
  /** People in a position and everything below it. */
  const peopleBelow = (id: string) => {
    let count = 0; const seen = new Set<string>(); const stack = [...childrenOf(id)];
    // Person cards repeat a shared role's holders, so they're skipped (the role already counts them).
    while (stack.length) { const p = stack.pop()!; if (seen.has(p.id) || p.person) continue; seen.add(p.id); count += p.holders.length; stack.push(...childrenOf(p.id)); }
    return count;
  };
  return { byId, childrenOf, pathTo, roots, peopleBelow };
}
export type PositionIndex = ReturnType<typeof indexPositions>;

/** "Find": positions whose title or holder names match, plus the positions above them (so they can be opened). */
export function searchPositions(index: PositionIndex, positions: Position[], term: string) {
  const q = term.trim().toLowerCase();
  if (!q) return null;
  const text = (p: Position) => p.person ? p.person.name : `${p.title} ${p.unit?.name ?? ''} ${p.holders.length === 1 ? p.holders[0].name : ''}`;
  const hits = positions.filter(p => text(p).toLowerCase().includes(q));
  const above = new Set<string>();
  for (const hit of hits) for (const p of index.pathTo(hit.id).slice(0, -1)) above.add(p.id);
  return { hits: new Set(hits.map(p => p.id)), above };
}

/** Open on arrival: the top position(s), so their direct reports show (closed, ready to open one by one). */
export const defaultOpen = (index: PositionIndex) => new Set(index.roots.map(p => p.id));

// ---------- Layout: wide rows on wide screens ----------

export const BOX = { width: 220, height: 104, gap: 18, levelGap: 68, rowGap: 40, chipClear: 18 } as const;

/** Teams spread sideways rather than stacking: at least this many side by side (except on phones). */
export const MIN_PER_ROW = 7;
/**
 * How many positions go side by side in a row, for a chart area this wide (at 100%): as many as fit, but never fewer
 * than MIN_PER_ROW (the chart scrolls sideways instead of stacking). Phones get 1: a team is listed downwards.
 */
export const perRowFor = (areaWidth: number) => areaWidth < 640 ? 1 : Math.max(MIN_PER_ROW, Math.floor((areaWidth - 2 * 28 + BOX.gap) / (BOX.width + BOX.gap)));

/**
 * Splits a team of `n` into rows of at most `maxPerRow`, as evenly as possible: 14 with room for 14 → one row of 14;
 * with room for 10 → two rows of 7 (not 10 + 4).
 */
export function rowSizes(n: number, maxPerRow: number) {
  if (n <= 0) return [];
  const rows = Math.ceil(n / Math.max(1, maxPerRow)), base = Math.floor(n / rows), extra = n % rows;
  return Array.from({ length: rows }, (_, i) => base + (i < extra ? 1 : 0));
}

export type Placed = { position: Position; x: number; y: number; open: boolean; childCount: number };
export type Line = { x1: number; y1: number; x2: number; y2: number };

/**
 * Top-down layout. Each open position's team sits directly under it, in rows as wide as the screen allows (wrapping
 * evenly when it doesn't), with the position centred above its team. Opening a position pushes its neighbours
 * sideways. Rows after the first are joined by a trunk on the left. `routes` gives each position's line from its
 * manager, for colouring the path to the selected position.
 */
export function layoutPositions(index: PositionIndex, roots: Position[], open: Set<string>, maxPerRow: number, shown?: Set<string>) {
  const { width: W, height: H, gap, levelGap, rowGap, chipClear } = BOX;
  type Box = { position: Position; width: number; height: number; rows: Box[][]; open: boolean };
  const seen = new Set<string>();
  const measure = (position: Position): Box => {
    seen.add(position.id);
    const team = index.childrenOf(position.id).filter(p => !seen.has(p.id) && (!shown || shown.has(p.id)));
    if (!open.has(position.id) || !team.length) return { position, width: W, height: H, rows: [], open: false };
    const children = team.map(measure);
    const rows: Box[][] = []; let at = 0;
    for (const size of rowSizes(children.length, maxPerRow)) { rows.push(children.slice(at, at + size)); at += size; }
    const rowWidth = (row: Box[]) => row.reduce((n, b) => n + b.width, 0) + gap * (row.length - 1);
    const block = Math.max(...rows.map(rowWidth)) + (rows.length > 1 ? gap : 0);
    const height = H + levelGap + rows.reduce((n, row) => n + Math.max(...row.map(b => b.height)), 0) + rowGap * (rows.length - 1);
    return { position, width: Math.max(W, block), height, rows, open: true };
  };
  const placed: Placed[] = [], lines: Line[] = [], routes = new Map<string, [number, number][]>();
  const place = (box: Box, left: number, top: number) => {
    const x = left + (box.width - W) / 2;
    placed.push({ position: box.position, x, y: top, open: box.open, childCount: index.childrenOf(box.position.id).filter(p => !shown || shown.has(p.id)).length });
    if (!box.rows.length) return;
    const wrapped = box.rows.length > 1, parentX = x + W / 2, trunkX = left + gap / 2;
    const stemTop = top + H + chipClear, firstBus = top + H + levelGap / 2;
    const widthOf = (row: Box[]) => row.reduce((n, b) => n + b.width, 0) + gap * (row.length - 1);
    const widest = Math.max(...box.rows.map(widthOf));
    let rowTop = top + H + levelGap;
    box.rows.forEach((row, r) => {
      // Rows line up in columns under a centred block; a single row is centred under its manager.
      let cursor = wrapped ? left + gap + (box.width - gap - widest) / 2 : left + (box.width - widthOf(row)) / 2;
      const bus = r === 0 ? firstBus : rowTop - rowGap / 2;
      const centres = row.map(child => {
        const c = cursor + child.width / 2;
        routes.set(child.position.id, [[parentX, stemTop], [parentX, firstBus], ...(r === 0 ? [] : [[trunkX, firstBus], [trunkX, bus]] as [number, number][]), [c, bus], [c, rowTop]]);
        place(child, cursor, rowTop); cursor += child.width + gap; return c;
      });
      const ends = [...centres, ...(r === 0 ? [parentX] : []), ...(wrapped ? [trunkX] : [])];
      lines.push({ x1: Math.min(...ends), y1: bus, x2: Math.max(...ends), y2: bus });
      centres.forEach(c => lines.push({ x1: c, y1: bus, x2: c, y2: rowTop }));
      rowTop += Math.max(...row.map(b => b.height)) + rowGap;
    });
    lines.push({ x1: parentX, y1: stemTop, x2: parentX, y2: firstBus });
    if (wrapped) lines.push({ x1: trunkX, y1: firstBus, x2: trunkX, y2: rowTop - rowGap - Math.max(...box.rows[box.rows.length - 1].map(b => b.height)) - rowGap / 2 });
  };
  let left = 0, height = 0;
  for (const root of roots) { if (seen.has(root.id) || (shown && !shown.has(root.id))) continue; const box = measure(root); place(box, left, 0); left += box.width + gap * 2; height = Math.max(height, box.height); }
  return { placed, lines, routes, width: Math.max(0, left - gap * 2), height };
}

/** Zoom that fits the drawing in the area (never above 100%), rounded down so it never overflows. */
export const fitZoom = (drawWidth: number, drawHeight: number, areaWidth: number, areaHeight: number) =>
  Math.max(0.1, Math.floor(Math.min(1, areaWidth / Math.max(1, drawWidth), areaHeight / Math.max(1, drawHeight)) * 100) / 100);

// ---------- How boxes draw at a zoom ----------

/** Full boxes from 60%; titles only (larger) from 30%; below that, department-coloured blocks with a legend. */
export const ZOOM = { readable: 0.6, titles: 0.3, min: 0.05, max: 1.5 } as const;
export type CardMode = "FULL" | "TITLE" | "BLOCK";
export const cardMode = (zoom: number): CardMode => zoom >= ZOOM.readable ? "FULL" : zoom >= ZOOM.titles ? "TITLE" : "BLOCK";

/** The rectangle around some placed positions (in drawing units), for fitting them on screen. */
export function boundsOf(placed: Placed[], ids: Set<string>) {
  const boxes = placed.filter(p => ids.has(p.position.id));
  if (!boxes.length) return null;
  return {
    left: Math.min(...boxes.map(b => b.x)), top: Math.min(...boxes.map(b => b.y)),
    right: Math.max(...boxes.map(b => b.x + BOX.width)), bottom: Math.max(...boxes.map(b => b.y + BOX.height)),
  };
}

// ---------- Colours (zoomed-out blocks, edges, legend): by department or by branch ----------

/** Eight colours (from the chart's scoped palette) for the eight largest groups; the rest share "Other" (slot 0). */
export const COLOUR_SLOTS = 8;
export type ColourBy = "DEPARTMENT" | "BRANCH";
export function chartColours(chart: PositionChart, by: ColourBy) {
  const keyOf = (p: Position) => by === "DEPARTMENT" ? p.unit?.departmentId ?? null : p.unit?.branch ?? null;
  const nameOf = (p: Position) => by === "DEPARTMENT" ? p.unit?.name ?? "" : p.unit?.branch ?? "";
  const groups = new Map<string, { id: string; name: string; people: number }>();
  for (const p of chart.positions) { const key = keyOf(p); if (!key || p.person) continue;
    const entry = groups.get(key) ?? { id: key, name: nameOf(p), people: 0 }; entry.people += p.holders.length; groups.set(key, entry); }
  const ranked = [...groups.values()].sort((a, b) => b.people - a.people || a.name.localeCompare(b.name));
  const coloured = ranked.slice(0, COLOUR_SLOTS).sort((a, b) => a.name.localeCompare(b.name));
  const slot = new Map(coloured.map((g, i) => [g.id, i + 1]));
  return {
    by,
    /** 1–8 for a coloured group; 0 for "Other" (and positions without a department or branch). */
    slotOf: (p: Position) => { const key = keyOf(p); return (key && slot.get(key)) || 0; },
    legend: coloured.map((g, i) => ({ ...g, slot: i + 1 })),
    other: { groups: ranked.length - coloured.length, people: ranked.slice(COLOUR_SLOTS).reduce((n, g) => n + g.people, 0) },
  };
}
/** Department colours (kept for callers and tests that only need departments). */
export const departmentColours = (chart: PositionChart) => {
  const c = chartColours(chart, "DEPARTMENT");
  return { slotOf: c.slotOf, legend: c.legend, other: { departments: c.other.groups, people: c.other.people } };
};

// ---------- Views: whole company, one branch, one department ----------

export type ChartScope = { kind: "COMPANY" } | { kind: "CONNECTED" } | { kind: "NOT_CONNECTED" } | { kind: "BRANCH"; branch: string } | { kind: "DEPARTMENT"; departmentId: string };

/** The branches and departments the View control offers. */
export function scopeChoices(chart: PositionChart) {
  const branches = [...new Set(chart.positions.map(p => p.unit?.branch).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b));
  const departments = [...new Map(chart.positions.filter(p => p.unit?.departmentId).map(p => [p.unit!.departmentId!, p.unit!.name])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => ({ id, name }));
  return { branches, departments };
}

/**
 * What a view shows: the positions in it, plus the line up to the top for context (drawn faded). `tops` are the
 * highest positions inside the view (opened on arrival).
 */
export function scopeOf(index: PositionIndex, chart: PositionChart, scope: ChartScope) {
  if (scope.kind === "COMPANY") return null;
  if (scope.kind === "CONNECTED" || scope.kind === "NOT_CONNECTED") {
    // The main structure is the top position with the most people below it; any other top is a separate ("floating")
    // structure: someone with no manager recorded who leads a team.
    const main = mainRoot(index);
    const keep = new Set<string>();
    for (const root of index.roots) if ((root.id === main?.id) === (scope.kind === "CONNECTED")) for (const id of subtree(index, root.id)) keep.add(id);
    return { inScope: keep, context: new Set<string>(), shown: keep, tops: index.roots.filter(r => keep.has(r.id)) };
  }
  const inScope = new Set(chart.positions.filter(p => scope.kind === "BRANCH" ? p.unit?.branch === scope.branch : p.unit?.departmentId === scope.departmentId).map(p => p.id));
  const context = new Set<string>();
  for (const id of inScope) for (const p of index.pathTo(id).slice(0, -1)) if (!inScope.has(p.id)) context.add(p.id);
  const tops = chart.positions.filter(p => inScope.has(p.id) && (!p.parentId || !inScope.has(p.parentId)));
  return { inScope, context, shown: new Set([...inScope, ...context]), tops };
}

/** The top position with the most people below it (normally the CEO). */
export const mainRoot = (index: PositionIndex) => [...index.roots].sort((a, b) => index.peopleBelow(b.id) - index.peopleBelow(a.id))[0] ?? null;
/** A position and everything below it. */
export function subtree(index: PositionIndex, id: string) {
  const out = new Set<string>(); const stack = [id];
  while (stack.length) { const next = stack.pop()!; if (out.has(next)) continue; out.add(next); stack.push(...index.childrenOf(next).map(p => p.id)); }
  return out;
}

/** A shared role's people, as person cards under the role (shown when the role is opened). */
export function withPeople(chart: PositionChart): PositionChart {
  const people: Position[] = [];
  for (const p of chart.positions) if (p.holders.length > 1)
    for (const h of p.holders) people.push({ id: `person:${p.id}:${h.employeeId}`, parentId: p.id, title: p.title, unit: p.unit, holders: [h], vacant: false, basis: p.basis, person: h });
  return { ...chart, positions: [...chart.positions, ...people] };
}

/** "The team" of a position, in words: direct reports, positions, shared roles, everyone below and probation. */
export function teamSummary(index: PositionIndex, id: string) {
  const team = index.childrenOf(id).filter(p => !p.person);
  const direct = team.reduce((n, p) => n + p.holders.length, 0), sharedRoles = team.filter(p => p.holders.length > 1).length;
  let below = 0, probation = 0; const seen = new Set<string>(); const stack = [...team];
  while (stack.length) { const p = stack.pop()!; if (seen.has(p.id) || p.person) continue; seen.add(p.id); below += p.holders.length; probation += p.holders.filter(h => h.status === "PROBATION").length; stack.push(...index.childrenOf(p.id)); }
  return { team, direct, positions: team.length, sharedRoles, below, probation };
}
