export type TreeItem = { id: string; parentId: string | null };
export const CARD_WIDTH = 216;
export const CARD_HEIGHT = 108;
const GAP_X = 24,
  GAP_Y = 72,
  ROW_GAP = 44,
  PAD = 24;

/** Compact wrapped teams, inspired by Clyde's V2. Each connector retains its
 * actual parent. Iterative traversal also supports exceptionally deep chains. */
export function layoutChart(items: TreeItem[], viewportWidth?: number) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const children = new Map<string, string[]>(),
    roots: string[] = [];
  for (const item of byId.values()) {
    if (item.parentId && byId.has(item.parentId) && item.parentId !== item.id) {
      const list = children.get(item.parentId) ?? [];
      list.push(item.id);
      children.set(item.parentId, list);
    } else roots.push(item.id);
  }
  const order: { id: string; depth: number; parentId: string | null }[] = [],
    seen = new Set<string>();
  function walk(root: string) {
    const stack = [{ id: root, depth: 0, parentId: null as string | null }];
    while (stack.length) {
      const item = stack.pop()!;
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      order.push(item);
      const kids = children.get(item.id) ?? [];
      for (let i = kids.length - 1; i >= 0; i--)
        stack.push({ id: kids[i], depth: item.depth + 1, parentId: item.id });
    }
  }
  roots.forEach(walk);
  for (const id of byId.keys()) if (!seen.has(id)) walk(id);
  const safeChildren = new Map<string, string[]>();
  for (const item of order)
    if (item.parentId) {
      const list = safeChildren.get(item.parentId) ?? [];
      list.push(item.id);
      safeChildren.set(item.parentId, list);
    }
  // In the readable view, use the actual screen width at normal card size.
  // This budget never depends on zoom, so +/- cannot rearrange a team.
  const available =
    viewportWidth && Number.isFinite(viewportWidth)
      ? Math.max(CARD_WIDTH, viewportWidth - PAD * 2 - 24)
      : null;
  const leafCounts = new Map<string, number>();
  for (let i = order.length - 1; i >= 0; i--) {
    const kids = safeChildren.get(order[i].id) ?? [];
    leafCounts.set(
      order[i].id,
      kids.length
        ? kids.reduce((count, id) => count + leafCounts.get(id)!, 0)
        : 1,
    );
  }
  const budgets = new Map<string, number>();
  const safeRoots = order.filter((item) => !item.parentId);
  if (available !== null) {
    const perRow = Math.max(
      1,
      Math.floor((available + GAP_X * 2) / (CARD_WIDTH + GAP_X * 2)),
    );
    for (let n = 0; n < safeRoots.length; n += perRow) {
      const row = safeRoots.slice(n, n + perRow);
      const spare = Math.max(
        0,
        available - row.length * CARD_WIDTH - (row.length - 1) * GAP_X * 2,
      );
      const weight = row.reduce(
        (sum, root) => sum + leafCounts.get(root.id)! - 1,
        0,
      );
      for (const root of row)
        budgets.set(
          root.id,
          CARD_WIDTH +
            spare *
              (weight
                ? (leafCounts.get(root.id)! - 1) / weight
                : 1 / row.length),
        );
    }
    for (const item of order)
      if (item.parentId) budgets.set(item.id, budgets.get(item.parentId)!);
  }
  type Box = {
    width: number;
    height: number;
    rows: string[][];
    rowWidths: number[];
    rowHeights: number[];
  };
  const boxes = new Map<string, Box>();
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i].id,
      kids = safeChildren.get(id) ?? [];
    const leafTeam = kids.every((k) => !safeChildren.get(k)?.length);
    const columns =
      leafTeam && kids.length > 4
        ? Math.min(16, Math.max(3, Math.ceil(Math.sqrt(kids.length * 0.7))))
        : kids.length > 4
          ? 4
          : Math.max(1, kids.length);
    const rows: string[][] = [];
    const budget = budgets.get(id);
    if (budget !== undefined) {
      let row: string[] = [],
        used = 0;
      for (const child of kids) {
        const width = boxes.get(child)!.width;
        if (row.length && used + GAP_X + width > budget - GAP_X) {
          rows.push(row);
          row = [];
          used = 0;
        }
        used += (row.length ? GAP_X : 0) + width;
        row.push(child);
      }
      if (row.length) rows.push(row);
    } else {
      for (let n = 0; n < kids.length; n += columns)
        rows.push(kids.slice(n, n + columns));
    }
    const rowWidths = rows.map(
      (row) =>
        row.reduce((n, k) => n + boxes.get(k)!.width, 0) +
        GAP_X * (row.length - 1),
    );
    const rowHeights = rows.map((row) =>
      Math.max(...row.map((k) => boxes.get(k)!.height)),
    );
    boxes.set(id, {
      rows,
      rowWidths,
      rowHeights,
      width: Math.max(
        CARD_WIDTH,
        ...rowWidths.map((w) => w + (rows.length > 1 ? GAP_X : 0)),
      ),
      height:
        CARD_HEIGHT +
        (rows.length
          ? GAP_Y +
            rowHeights.reduce((a, b) => a + b, 0) +
            ROW_GAP * (rows.length - 1)
          : 0),
    });
  }
  const positions = new Map<
    string,
    { id: string; x: number; y: number; depth: number }
  >();
  const edges: { parent: string; child: string; path: string }[] = [];
  const places = new Map<string, { left: number; top: number }>();
  let width = CARD_WIDTH + PAD * 2,
    height = CARD_HEIGHT + PAD * 2,
    rootLeft = PAD,
    rootTop = PAD,
    rootRowHeight = 0;
  for (const item of safeRoots) {
    const b = boxes.get(item.id)!;
    if (
      available !== null &&
      rootLeft > PAD &&
      rootLeft + b.width > PAD + available + 0.01
    ) {
      rootLeft = PAD;
      rootTop += rootRowHeight + GAP_Y;
      rootRowHeight = 0;
    }
    places.set(item.id, { left: rootLeft, top: rootTop });
    width = Math.max(width, rootLeft + b.width + PAD);
    height = Math.max(height, rootTop + b.height + PAD);
    rootRowHeight = Math.max(rootRowHeight, b.height);
    rootLeft += b.width + GAP_X * 2;
  }
  for (const item of order) {
    const b = boxes.get(item.id)!,
      { left, top } = places.get(item.id)!;
    const x = left + (b.width - CARD_WIDTH) / 2,
      parentX = x + CARD_WIDTH / 2;
    positions.set(item.id, { id: item.id, x, y: top, depth: item.depth });
    const wrapped = b.rows.length > 1,
      trunk = left + GAP_X / 2,
      firstBus = top + CARD_HEIGHT + GAP_Y / 2;
    let rowTop = top + CARD_HEIGHT + GAP_Y;
    b.rows.forEach((row, r) => {
      let childLeft = wrapped
        ? left + GAP_X
        : left + (b.width - b.rowWidths[r]) / 2;
      const bus = r ? rowTop - ROW_GAP / 2 : firstBus;
      for (const child of row) {
        const childBox = boxes.get(child)!,
          childX = childLeft + childBox.width / 2;
        places.set(child, { left: childLeft, top: rowTop });
        edges.push({
          parent: item.id,
          child,
          path: `M ${parentX} ${top + CARD_HEIGHT + 18} V ${firstBus}${r ? ` H ${trunk} V ${bus}` : ""} H ${childX} V ${rowTop}`,
        });
        childLeft += childBox.width + GAP_X;
      }
      rowTop += b.rowHeights[r] + ROW_GAP;
    });
  }
  return {
    positions,
    edges,
    order,
    width,
    height,
  };
}
/** Fit every visible card in both dimensions, with no arbitrary minimum. */
export function fitChart(
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
) {
  return Math.min(
    1,
    Math.max(1, viewportWidth - 24) / Math.max(1, width),
    Math.max(1, viewportHeight - 24) / Math.max(1, height),
  );
}
export type CardMode = "full" | "name" | "block";
export const cardMode = (zoom: number): CardMode =>
  zoom >= 0.6 ? "full" : zoom >= 0.3 ? "name" : "block";
