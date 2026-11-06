export type TreeItem = { id: string; parentId: string | null };
export const CARD_WIDTH = 200;
export const CARD_HEIGHT = 116;
const GAP_X = 24,
  GAP_Y = 64,
  PAD = 24;

/** Presentation-only layout: no inferred reporting relationships, no recursive rendering. */
export function layoutChart(items: TreeItem[]) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const children = new Map<string, string[]>();
  const roots: string[] = [];
  for (const item of byId.values()) {
    if (item.parentId && byId.has(item.parentId) && item.parentId !== item.id) {
      const siblings = children.get(item.parentId) ?? [];
      siblings.push(item.id);
      children.set(item.parentId, siblings);
    } else roots.push(item.id);
  }
  const order: { id: string; depth: number; parentId: string | null }[] = [];
  const seen = new Set<string>();
  const walk = (root: string) => {
    const pending = [{ id: root, depth: 0, parentId: null as string | null }];
    while (pending.length) {
      const item = pending.pop()!;
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      order.push(item);
      const kids = children.get(item.id) ?? [];
      for (let i = kids.length - 1; i >= 0; i--)
        pending.push({ id: kids[i], depth: item.depth + 1, parentId: item.id });
    }
  };
  roots.forEach(walk);
  // Defensive handling for malformed generic input. EMS already cuts invalid edges.
  for (const id of byId.keys()) if (!seen.has(id)) walk(id);
  const safeChildren = new Map<string, string[]>();
  for (const item of order)
    if (item.parentId) {
      const kids = safeChildren.get(item.parentId) ?? [];
      kids.push(item.id);
      safeChildren.set(item.parentId, kids);
    }
  const widths = new Map<string, number>();
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i].id,
      kids = safeChildren.get(id) ?? [];
    widths.set(
      id,
      Math.max(
        CARD_WIDTH,
        kids.reduce((total, child) => total + widths.get(child)!, 0) +
          Math.max(0, kids.length - 1) * GAP_X,
      ),
    );
  }
  let left = PAD;
  const offsets = new Map<string, number>();
  for (const item of order)
    if (!item.parentId) {
      offsets.set(item.id, left);
      left += widths.get(item.id)! + GAP_X;
    }
  const positions = new Map<
    string,
    { id: string; x: number; y: number; depth: number }
  >();
  let maxDepth = 0;
  for (const item of order) {
    const offset = offsets.get(item.id)!;
    positions.set(item.id, {
      id: item.id,
      depth: item.depth,
      x: offset + (widths.get(item.id)! - CARD_WIDTH) / 2,
      y: PAD + item.depth * (CARD_HEIGHT + GAP_Y),
    });
    maxDepth = Math.max(maxDepth, item.depth);
    let childLeft = offset;
    for (const id of safeChildren.get(item.id) ?? []) {
      offsets.set(id, childLeft);
      childLeft += widths.get(id)! + GAP_X;
    }
  }
  const edges = order
    .filter((item) => item.parentId)
    .map((item) => {
      const from = positions.get(item.parentId!)!,
        to = positions.get(item.id)!;
      const x1 = from.x + CARD_WIDTH / 2,
        y1 = from.y + CARD_HEIGHT;
      const x2 = to.x + CARD_WIDTH / 2,
        y2 = to.y,
        middle = y1 + GAP_Y / 2;
      return {
        parent: item.parentId!,
        child: item.id,
        path: `M ${x1} ${y1} V ${middle} H ${x2} V ${y2}`,
      };
    });
  return {
    positions,
    edges,
    order,
    width: Math.max(CARD_WIDTH + PAD * 2, left - GAP_X + PAD),
    height: PAD * 2 + CARD_HEIGHT + maxDepth * (CARD_HEIGHT + GAP_Y),
  };
}

/** Fit both dimensions; no arbitrary zoom floor that clips large trees. */
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
