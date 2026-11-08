export type TreeItem = { id: string; parentId: string | null };
export type ChartDensity = "cards" | "compact" | "map";
export const CARD_WIDTH = 210;
export const CARD_HEIGHT = 116;
export const SIZES = {
  cards: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    gapX: 20,
    gapY: 46,
    rowGap: 34,
    pad: 18,
  },
  compact: { width: 148, height: 58, gapX: 14, gapY: 32, rowGap: 18, pad: 14 },
  map: { width: 24, height: 18, gapX: 6, gapY: 18, rowGap: 10, pad: 10 },
} as const;

/** Pack whole subtrees, never recursively divide a parent's width among its
 * descendants. Every open unit gets the same usable horizontal budget. This
 * lets departments spread sideways instead of degenerating into a column. */
export function layoutChart(
  items: TreeItem[],
  viewportWidth = 1100,
  density: ChartDensity = "cards",
) {
  const {
    width: cw,
    height: ch,
    gapX: gx,
    gapY: gy,
    rowGap: rg,
    pad,
  } = SIZES[density];
  const available = Math.max(
    cw,
    (Number.isFinite(viewportWidth) ? viewportWidth : 1100) - pad * 2 - gx,
  );
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
  const order: { id: string; parentId: string | null; depth: number }[] = [],
    seen = new Set<string>();
  const walk = (id: string) => {
    const stack = [{ id, parentId: null as string | null, depth: 0 }];
    while (stack.length) {
      const item = stack.pop()!;
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      order.push(item);
      const kids = children.get(item.id) ?? [];
      for (let n = kids.length - 1; n >= 0; n--)
        stack.push({ id: kids[n], parentId: item.id, depth: item.depth + 1 });
    }
  };
  roots.forEach(walk);
  for (const id of byId.keys()) if (!seen.has(id)) walk(id);
  const safe = new Map<string, string[]>();
  for (const item of order)
    if (item.parentId) {
      const kids = safe.get(item.parentId) ?? [];
      kids.push(item.id);
      safe.set(item.parentId, kids);
    }
  type Box = {
    width: number;
    height: number;
    rows: string[][];
    rowWidths: number[];
    rowHeights: number[];
  };
  const boxes = new Map<string, Box>();
  const pack = (ids: string[], budget = available) => {
    const rows: string[][] = [];
    let row: string[] = [],
      used = 0;
    for (const id of ids) {
      const width = boxes.get(id)!.width;
      if (row.length && used + gx + width > budget) {
        rows.push(row);
        row = [];
        used = 0;
      }
      used += (row.length ? gx : 0) + width;
      row.push(id);
    }
    if (row.length) rows.push(row);
    return rows;
  };
  const descendants = new Map<string, number>();
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i].id,
      kids = safe.get(id) ?? [];
    const count = 1 + kids.reduce((sum, k) => sum + descendants.get(k)!, 0);
    descendants.set(id, count);
    const natural = Math.sqrt(count * (cw + gx) * (ch + rg) * 1.8);
    const rounded = Math.ceil((natural + gx) / (cw + gx)) * (cw + gx) - gx;
    let budget = order[i].parentId
      ? Math.min(available + gx, Math.max(cw, rounded))
      : available;
    // An opened branch displaces its neighbours sideways. Reserve room for
    // siblings around it instead of leaving the preceding sibling stranded.
    if (
      !order[i].parentId &&
      kids.some((k) => (safe.get(k)?.length ?? 0) > 0)
    ) {
      const largest = Math.max(...kids.map((k) => boxes.get(k)!.width));
      budget = Math.max(
        budget,
        largest + Math.min(2, kids.length - 1) * (cw + gx),
      );
    }
    const rows = pack(kids, budget);
    const rowWidths = rows.map(
      (row) =>
        row.reduce((sum, k) => sum + boxes.get(k)!.width, 0) +
        gx * (row.length - 1),
    );
    const rowHeights = rows.map((row) =>
      Math.max(...row.map((k) => boxes.get(k)!.height)),
    );
    boxes.set(id, {
      rows,
      rowWidths,
      rowHeights,
      width: Math.max(cw, ...rowWidths) + (rows.length > 1 ? gx : 0),
      height:
        ch +
        (rows.length
          ? gy + rowHeights.reduce((a, b) => a + b, 0) + rg * (rows.length - 1)
          : 0),
    });
  }
  const positions = new Map<
    string,
    { id: string; x: number; y: number; depth: number }
  >();
  const bounds = new Map<
    string,
    { left: number; top: number; width: number; height: number }
  >();
  const edges: { parent: string; child: string; path: string }[] = [];
  const places = new Map<string, { left: number; top: number }>();
  let width = cw + pad * 2,
    height = ch + pad * 2,
    top = pad;
  for (const row of pack(order.filter((x) => !x.parentId).map((x) => x.id))) {
    let left = pad;
    let rowHeight = 0;
    for (const id of row) {
      const b = boxes.get(id)!;
      places.set(id, { left, top });
      width = Math.max(width, left + b.width + pad);
      rowHeight = Math.max(rowHeight, b.height);
      left += b.width + gx;
    }
    height = Math.max(height, top + rowHeight + pad);
    top += rowHeight + gy;
  }
  for (const item of order) {
    const b = boxes.get(item.id)!,
      at = places.get(item.id)!;
    const x = at.left + (b.width - cw) / 2,
      px = x + cw / 2;
    positions.set(item.id, { id: item.id, x, y: at.top, depth: item.depth });
    bounds.set(item.id, { ...at, width: b.width, height: b.height });
    const corridor = at.left + gx / 2,
      firstBus = at.top + ch + gy * 0.65;
    let y = at.top + ch + gy;
    b.rows.forEach((row, r) => {
      // Centre each row, leaving a separate left corridor for later peers.
      let left =
        at.left +
        (b.width - b.rowWidths[r]) / 2 +
        (b.rows.length > 1 ? gx / 2 : 0);
      const bus = r ? y - rg / 2 : firstBus;
      for (const child of row) {
        const cb = boxes.get(child)!;
        const cx = left + cb.width / 2;
        places.set(child, { left, top: y });
        edges.push({
          parent: item.id,
          child,
          path: `M ${px} ${at.top + ch} V ${firstBus}${r ? ` H ${corridor} V ${bus}` : ""} H ${cx} V ${y}`,
        });
        left += cb.width + gx;
      }
      y += b.rowHeights[r] + rg;
    });
  }
  return {
    positions,
    bounds,
    edges,
    order,
    width,
    height,
    density,
    cardWidth: cw,
    cardHeight: ch,
  };
}
export function fitChart(
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
) {
  return Math.min(
    1,
    Math.max(0.001, (viewportWidth - 16) / Math.max(1, width)),
    Math.max(0.001, (viewportHeight - 16) / Math.max(1, height)),
  );
}

/** Explicit Fit/Open all balances the *layout* to the viewport before scaling.
 * Change representation before names become unreadable; never show 5% cards. */
export function fitPresentation(
  items: TreeItem[],
  width: number,
  height: number,
  start: ChartDensity = "cards",
) {
  const densities: ChartDensity[] =
    start === "map"
      ? ["map"]
      : start === "compact"
        ? ["compact", "map"]
        : ["cards", "compact", "map"];
  for (const density of densities) {
    const s = SIZES[density];
    const screenTree = layoutChart(items, width, density);
    const screenZoom = fitChart(
      screenTree.width,
      screenTree.height,
      width,
      height,
    );
    if (screenZoom >= 0.8)
      return {
        density,
        tree: screenTree,
        layoutWidth: width,
        zoom: screenZoom,
      };
    const ideal = Math.sqrt(
      (Math.max(1, items.length) *
        (s.width + s.gapX) *
        (s.height + s.gapY) *
        width) /
        Math.max(1, height),
    );
    let best: {
      tree: ReturnType<typeof layoutChart>;
      layoutWidth: number;
      zoom: number;
    } | null = null;
    for (const budget of [
      ...new Set([
        width,
        ...[0.65, 0.85, 1, 1.25, 1.6, 2].map((k) =>
          Math.max(s.width + 2 * s.pad, ideal * k),
        ),
      ]),
    ]) {
      const tree = layoutChart(items, budget, density),
        zoom = fitChart(tree.width, tree.height, width, height);
      // Prefer a full-size fit; then a balanced canvas instead of unused width.
      const score =
        zoom * 1000 -
        Math.abs(tree.width / tree.height - width / Math.max(1, height));
      const old = best
        ? best.zoom * 1000 -
          Math.abs(
            best.tree.width / best.tree.height - width / Math.max(1, height),
          )
        : -Infinity;
      if (score > old) best = { tree, layoutWidth: budget, zoom };
    }
    if (best && (best.zoom >= 0.8 || density === "map"))
      return { density, ...best };
  }
  throw new Error("No chart presentation");
}
