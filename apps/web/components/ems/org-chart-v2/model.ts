/**
 * Org chart (focus design): the data comes from the existing chart API (GET /api/ems/organisation/chart);
 * this file only turns it into "who is above, who is alongside, who is below" for one focused person.
 */
export type ChartPerson = {
  id: string; name: string; jobTitle: string | null;
  department: { id: string; name: string } | null;
  branch: { id: string; name: string } | null; branchText: string | null;
  managerId: string | null; reportsToBody: string | null;
  status: string | null; active?: boolean; photoUrl: string | null; directReports?: number;
};
export type ChartIssue = { employeeId: string; kind: string };
export type ChartData = {
  capabilities?: { employmentDetails: boolean; inactivePeople: boolean }; people: ChartPerson[]; issues: ChartIssue[]; source: string; refreshedAt: string };

export const BODY_LABEL: Record<string, string> = { BOARD: 'Board', COMMITTEE: 'Committee', MANAGEMENT_COMMITTEE: 'Management Committee', OWNER: 'Owner' };
export const ISSUE_LABEL: Record<string, string> = {
  NO_MANAGER: 'No manager', MANAGER_UNAVAILABLE: 'Manager not found', MANAGER_INACTIVE: 'Manager has left',
  SELF_REPORTING: 'Reports to themselves', LOOP: 'Reporting loop', CONFLICTING_REPORTING: 'Both a manager and a body recorded',
};

export const initials = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? '') + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
};
export const branchName = (p: ChartPerson) => p.branch?.name ?? p.branchText ?? null;
// Natural order, so "Operator 2" comes before "Operator 10".
const byName = (a: ChartPerson, b: ChartPerson) => a.name.localeCompare(b.name, undefined, { numeric: true }) || a.id.localeCompare(b.id);

export type ChartIndex = ReturnType<typeof indexChart>;

/** One pass over the people: who reports to whom, and who sits at the top. Loops and missing managers never hang. */
export function indexChart(data: ChartData) {
  const byId = new Map(data.people.map(p => [p.id, p]));
  const team = new Map<string, ChartPerson[]>();
  for (const p of data.people) {
    if (!p.managerId || p.managerId === p.id || !byId.has(p.managerId)) continue;
    const list = team.get(p.managerId) ?? []; list.push(p); team.set(p.managerId, list);
  }
  for (const list of team.values()) list.sort(byName);
  const issuesFor = new Map<string, string[]>();
  for (const issue of data.issues) issuesFor.set(issue.employeeId, [...(issuesFor.get(issue.employeeId) ?? []), issue.kind]);
  /** The chain above a person, nearest manager last; stops at the top, at a missing manager, or at a loop. */
  const chain = (id: string) => {
    const above: ChartPerson[] = [], seen = new Set([id]);
    let current = byId.get(id);
    while (current?.managerId && byId.has(current.managerId) && !seen.has(current.managerId)) {
      seen.add(current.managerId); current = byId.get(current.managerId)!; above.unshift(current);
    }
    return above;
  };
  const teamOf = (id: string) => team.get(id) ?? [];
  // Team size including everyone below (iterative, guarded against loops).
  const sizeCache = new Map<string, number>();
  const everyoneBelow = (id: string) => {
    if (sizeCache.has(id)) return sizeCache.get(id)!;
    let count = 0; const seen = new Set([id]); const stack = [...teamOf(id)];
    while (stack.length) { const p = stack.pop()!; if (seen.has(p.id)) continue; seen.add(p.id); count++; stack.push(...teamOf(p.id)); }
    sizeCache.set(id, count); return count;
  };
  // The top: people who report to a body, or have no (findable) manager but lead others.
  const tops = data.people.filter(p => (!p.managerId || !byId.has(p.managerId) || p.managerId === p.id) && (p.reportsToBody || teamOf(p.id).length)).sort(byName);
  /** Where to start: the top person with the most people under them (normally the CEO). */
  const start = [...tops].sort((a, b) => everyoneBelow(b.id) - everyoneBelow(a.id) || byName(a, b))[0] ?? data.people[0] ?? null;
  // Not connected: anyone the API flags, except "both recorded" (still connected).
  const unconnected = data.people.filter(p => (issuesFor.get(p.id) ?? []).some(k => k !== 'CONFLICTING_REPORTING')).sort(byName);
  return { byId, teamOf, chain, everyoneBelow, tops, start, unconnected, issuesFor };
}

/** Peers: others with the same manager (or the other top people, for someone at the top). */
export function peersOf(index: ChartIndex, person: ChartPerson) {
  const manager = person.managerId ? index.byId.get(person.managerId) : undefined;
  return (manager ? index.teamOf(manager.id) : index.tops).filter(p => p.id !== person.id);
}

/** Layers from the top person down (the longest chain), and the average team size of people who lead a team. */
export function chartSummary(index: ChartIndex, data: ChartData) {
  let layers = 0;
  for (const p of data.people) layers = Math.max(layers, index.chain(p.id).length + 1);
  const leads = data.people.filter(p => index.teamOf(p.id).length > 0);
  const average = leads.length ? leads.reduce((n, p) => n + index.teamOf(p.id).length, 0) / leads.length : 0;
  return { people: data.people.length, layers, average: Math.round(average * 10) / 10 };
}

/** Find a person by name, job title or department; best name matches first. */
export function findPeople(data: ChartData, term: string, limit = 8) {
  const q = term.trim().toLowerCase();
  if (!q) return [];
  const score = (p: ChartPerson) => {
    const name = p.name.toLowerCase();
    if (name.startsWith(q)) return 0;
    if (name.split(/\s+/).some(w => w.startsWith(q))) return 1;
    if (name.includes(q)) return 2;
    if ((p.jobTitle ?? '').toLowerCase().includes(q) || (p.department?.name ?? '').toLowerCase().includes(q)) return 3;
    return 9;
  };
  return data.people.map(p => [score(p), p] as const).filter(([s]) => s < 9).sort((a, b) => a[0] - b[0] || byName(a[1], b[1])).slice(0, limit).map(([, p]) => p);
}

/** The top people of a department: in the department, but their manager isn't. */
export function departmentTops(index: ChartIndex, data: ChartData, departmentId: string) {
  return data.people.filter(p => p.department?.id === departmentId
    && (!p.managerId || index.byId.get(p.managerId)?.department?.id !== departmentId)).sort(byName);
}

/** The outline for the List layout: rows to show, given which people are opened. */
export function outlineRows(index: ChartIndex, open: Set<string>) {
  const rows: { person: ChartPerson; depth: number }[] = []; const seen = new Set<string>();
  const stack = [...index.tops].reverse().map(person => ({ person, depth: 0 }));
  while (stack.length) {
    const { person, depth } = stack.pop()!;
    if (seen.has(person.id)) continue; seen.add(person.id); rows.push({ person, depth });
    if (open.has(person.id)) [...index.teamOf(person.id)].reverse().forEach(child => stack.push({ person: child, depth: depth + 1 }));
  }
  return rows;
}

// ---------- Chart view: a top-down tree with lines ----------

// levelGap and chipClear leave room for the +/− button under each card, so it never sits on a line.
// A team whose members have no open teams of their own stacks in `leafColumns` columns once it has more than
// `leafRowMax` people: the chart stays narrow enough to see the whole company at a glance.
export const SUMMARY_STRIP = 34;
export const CARD = { width: 208, height: 76, gap: 20, levelGap: 72, rowGap: 40, wrapAt: 12, perRow: 6, leafRowMax: 4, leafColumns: 2, chipClear: 18 } as const;
/**
 * A card on the chart. `summary` is set on a manager whose team is shown as a strip under their card
 * ("12 people ▸") instead of one card each; the strip adds `CARD.summaryStrip` to the card's height.
 */
export type TreeNode = { key: string; person: ChartPerson; x: number; y: number; teamSize: number; open: boolean; summary?: number };
export type TreeLine = { x1: number; y1: number; x2: number; y2: number };
/** The path a line takes from a manager down to one team member, as points; used to colour a single route. */
export type Route = [number, number][];

/**
 * Positions for every visible card and the lines between them. Teams hang directly under their manager; a team of
 * `wrapAt` or more wraps onto rows of `perRow`, still under its manager, joined by a trunk on the left.
 * Branches that are open may run wider than the screen: the canvas scrolls both ways.
 */
export type LayoutShape = { perRow: number; leafColumns: number };
export function layoutTree(index: ChartIndex, roots: ChartPerson[], open: Set<string>, shape: Partial<LayoutShape> = {}, summarised: Set<string> = new Set()) {
  const { width: W, height: H, gap, levelGap, rowGap, chipClear } = CARD;
  // How big teams wrap: by default rows of 6 (once 12+) and 2 columns for members-only teams; bestLayout tries others.
  const perRow = shape.perRow ?? CARD.perRow, leafColumns = shape.leafColumns ?? CARD.leafColumns;
  const wrapAt = shape.perRow ? perRow + 1 : CARD.wrapAt, leafRowMax = Math.max(CARD.leafRowMax, leafColumns);
  const seen = new Set<string>();
  type Box = { person: ChartPerson; width: number; height: number; rows: Box[][]; open: boolean; summary?: number };
  const measure = (person: ChartPerson): Box => {
    seen.add(person.id);
    const team = index.teamOf(person.id).filter(p => !seen.has(p.id));
    const isOpen = open.has(person.id) && team.length > 0;
    if (!isOpen) return { person, width: W, height: H, rows: [], open: false };
    // A summarised team: a strip under the manager's card instead of a card per member (no extra level or lines).
    if (summarised.has(person.id)) {
      team.forEach(p => seen.add(p.id));
      return { person, width: W, height: H + SUMMARY_STRIP, rows: [], open: false, summary: team.length };
    }
    const children = team.map(measure);
    const leaves = children.every(c => !c.open);
    const size = leaves && children.length > leafRowMax ? leafColumns : children.length >= wrapAt ? perRow : children.length;
    const rows: Box[][] = [];
    for (let i = 0; i < children.length; i += size) rows.push(children.slice(i, i + size));
    const rowWidth = (row: Box[]) => row.reduce((n, b) => n + b.width, 0) + gap * (row.length - 1);
    const block = Math.max(...rows.map(rowWidth)) + (rows.length > 1 ? gap : 0); // room for the trunk when wrapped
    const height = H + levelGap + rows.reduce((n, row) => n + Math.max(...row.map(b => b.height)), 0) + rowGap * (rows.length - 1);
    return { person, width: Math.max(W, block), height, rows, open: true };
  };
  const nodes: TreeNode[] = [], lines: TreeLine[] = [], routes = new Map<string, Route>();
  const place = (box: Box, left: number, top: number) => {
    const x = left + (box.width - W) / 2;
    nodes.push({ key: box.person.id, person: box.person, x, y: top, teamSize: index.teamOf(box.person.id).length, open: box.open, summary: box.summary });
    if (!box.rows.length) return;
    const wrapped = box.rows.length > 1, parentX = x + W / 2;
    const trunkX = left + gap / 2;
    const stemTop = top + H + chipClear, firstBus = top + H + levelGap / 2;
    let rowTop = top + H + levelGap;
    const widthOf = (row: Box[]) => row.reduce((n, b) => n + b.width, 0) + gap * (row.length - 1);
    const widest = Math.max(...box.rows.map(widthOf));
    box.rows.forEach((row, r) => {
      const rowWidth = widthOf(row);
      // Wrapped rows line up in columns (a shorter last row starts on the left); a single row is centred under the manager.
      let cursor = wrapped ? left + gap + (box.width - gap - widest) / 2 : left + (box.width - rowWidth) / 2;
      // The first row's line sits halfway down the gap under the manager; later rows' lines sit in the gap between rows.
      const bus = r === 0 ? rowTop - levelGap / 2 : rowTop - rowGap / 2;
      const centres = row.map(child => {
        const c = cursor + child.width / 2;
        routes.set(child.person.id, [[parentX, stemTop], [parentX, firstBus],
          ...(r === 0 ? [] : [[trunkX, firstBus], [trunkX, bus]] as Route), [c, bus], [c, rowTop]]);
        place(child, cursor, rowTop); cursor += child.width + gap; return c;
      });
      // Each row's line reaches its manager (first row) and, when wrapped, the trunk on the left that joins the rows.
      const ends = [...centres, ...(r === 0 ? [parentX] : []), ...(wrapped ? [trunkX] : [])];
      lines.push({ x1: Math.min(...ends), y1: bus, x2: Math.max(...ends), y2: bus });
      centres.forEach(c => lines.push({ x1: c, y1: bus, x2: c, y2: rowTop }));
      rowTop += Math.max(...row.map(b => b.height)) + rowGap;
    });
    lines.push({ x1: parentX, y1: stemTop, x2: parentX, y2: firstBus });
    if (wrapped) {
      const lastBus = rowTop - rowGap - Math.max(...box.rows[box.rows.length - 1].map(b => b.height)) - rowGap / 2;
      lines.push({ x1: trunkX, y1: firstBus, x2: trunkX, y2: lastBus });
    }
  };
  let left = 0, height = 0;
  for (const root of roots) {
    if (seen.has(root.id)) continue;
    const box = measure(root); place(box, left, 0); left += box.width + gap * 2; height = Math.max(height, box.height);
  }
  return { nodes, lines, routes, width: Math.max(0, left - gap * 2), height };
}

// ---------- Chart view: zoom ----------

export const ZOOM = { min: 0.05, max: 1.5, step: 1.25, compact: 0.6, blocks: 0.3 } as const;
export const clampZoom = (zoom: number) => Math.min(ZOOM.max, Math.max(ZOOM.min, Math.round(zoom * 100) / 100));
/** The zoom at which the whole drawing fits the visible area (never above 100%). */
// Rounded down, so the fitted drawing is never a few pixels wider than the screen.
export const fitZoom = (drawingWidth: number, drawingHeight: number, viewWidth: number, viewHeight: number) =>
  clampZoom(Math.floor(Math.min(1, viewWidth / Math.max(1, drawingWidth), viewHeight / Math.max(1, drawingHeight)) * 100) / 100);
/** How cards draw at a zoom: full cards, name-only cards, or department-coloured blocks (the organisation's shape). */
export const cardMode = (zoom: number) => zoom >= ZOOM.compact ? 'FULL' as const : zoom >= ZOOM.blocks ? 'NAME' as const : 'BLOCK' as const;
/**
 * Where to scroll after zooming so the point under the cursor (or the centre) stays put.
 * `point` is in visible-area pixels; returns the new scroll position.
 */
export function zoomAround(scroll: { left: number; top: number }, point: { x: number; y: number }, from: number, to: number) {
  const contentX = (scroll.left + point.x) / from, contentY = (scroll.top + point.y) / from;
  return { left: Math.max(0, contentX * to - point.x), top: Math.max(0, contentY * to - point.y) };
}

// Department colours: the 10 largest departments get clearly different colours, the rest share grey ("Other").
// None is close to violet (focus path) or teal (just opened).
const PALETTE = ['#2563EB', '#DC2626', '#84CC16', '#F59E0B', '#EC4899', '#92400E', '#334155', '#166534', '#38BDF8', '#EA580C'];
export const OTHER_COLOUR = '#CBD5E1';
export function departmentColours(people: ChartPerson[]) {
  const counts = new Map<string, { id: string; name: string; people: number }>();
  for (const p of people) if (p.department) {
    const entry = counts.get(p.department.id) ?? { id: p.department.id, name: p.department.name, people: 0 };
    entry.people++; counts.set(p.department.id, entry);
  }
  const ranked = [...counts.values()].sort((a, b) => b.people - a.people || a.name.localeCompare(b.name));
  const coloured = ranked.slice(0, PALETTE.length).sort((a, b) => a.name.localeCompare(b.name));
  const colours = new Map(coloured.map((d, i) => [d.id, PALETTE[i]]));
  const others = ranked.slice(PALETTE.length);
  return {
    colourOf: (p: ChartPerson) => (p.department && colours.get(p.department.id)) || OTHER_COLOUR,
    legend: coloured.map(d => ({ id: d.id, name: d.name, colour: colours.get(d.id)!, people: d.people })),
    others: { departments: others.length, people: others.reduce((n, d) => n + d.people, 0) },
  };
}

/**
 * The arrangement that shows the most at once on this screen: tries several ways of wrapping big teams and keeps the
 * one whose Fit zoom is largest (wide screens get wider rows, narrow screens stack). Ties keep the default.
 */
export function bestLayout(index: ChartIndex, roots: ChartPerson[], open: Set<string>, viewWidth: number, viewHeight: number, summarised: Set<string> = new Set()) {
  const shapes: LayoutShape[] = [{ perRow: CARD.perRow, leafColumns: CARD.leafColumns }];
  for (const perRow of [4, 6, 8, 12, 20]) for (const leafColumns of [1, 2, 3, 4, 6]) shapes.push({ perRow, leafColumns });
  const zoomFor = (t: { width: number; height: number }) => Math.min(viewWidth / Math.max(1, t.width + 64), viewHeight / Math.max(1, t.height + 88));
  const first = layoutTree(index, roots, open, shapes[0], summarised);
  let best = { tree: first, shape: shapes[0], zoom: zoomFor(first) };
  for (const shape of shapes.slice(1)) {
    const tree = layoutTree(index, roots, open, shape, summarised), zoom = zoomFor(tree);
    if (zoom > best.zoom * 1.02) best = { tree, shape, zoom };
  }
  return best;
}

// ---------- Opening views ----------

/** Readable: names can be read without zooming in. */
export const READABLE_ZOOM = 0.5;
/** Above this many people, "Open all" summarises members-only teams. */
export const SUMMARY_FROM = 300;

/**
 * The leadership view: the top person's team, then each further level, as long as everything still fits the screen
 * readably. Always at least the top person's own team.
 */
export function leadershipOpen(index: ChartIndex, viewWidth: number, viewHeight: number) {
  let open = new Set(index.tops.map(p => p.id));
  let level = index.tops.flatMap(p => index.teamOf(p.id));
  while (level.length) {
    const leads = level.filter(p => index.teamOf(p.id).length);
    if (!leads.length) break;
    const next = new Set([...open, ...leads.map(p => p.id)]);
    if (bestLayout(index, index.tops, next, viewWidth, viewHeight).zoom < READABLE_ZOOM) break;
    open = next; level = leads.flatMap(p => index.teamOf(p.id));
  }
  return open;
}

/** "Open all": every manager open; for big companies, teams where nobody has their own team become one box each. */
export function wholeCompany(index: ChartIndex, people: ChartPerson[]) {
  const managers = people.filter(p => index.teamOf(p.id).length).map(p => p.id);
  const summarised = people.length > SUMMARY_FROM ? managers.filter(id => index.teamOf(id).every(p => !index.teamOf(p.id).length)) : [];
  return { open: new Set(managers), summarised: new Set(summarised) };
}
