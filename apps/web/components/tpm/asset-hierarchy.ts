import type { Asset } from "./asset-preview";

export type AssetHierarchyNode = {
  asset: Asset;
  children: AssetHierarchyNode[];
  matches: boolean;
  issue?: "missing-parent" | "cycle";
};

/** Keep every asset visible once, including older records with broken links. */
export function buildAssetHierarchy(
  assets: readonly Asset[],
  matchingIds: ReadonlySet<string>,
  sort = "code",
) {
  const ordered = [...assets].sort((a, b) =>
    sort === "name"
      ? a.name.localeCompare(b.name)
      : sort === "updated"
        ? b.updatedAt.localeCompare(a.updatedAt)
        : a.code.localeCompare(b.code, undefined, { numeric: true }),
  );
  const nodes = new Map<string, AssetHierarchyNode>();
  for (const asset of ordered)
    nodes.set(asset.id, {
      asset,
      children: [],
      matches: matchingIds.has(asset.id),
    });

  const parents = new Map<string, string>();
  for (const [id, node] of nodes) {
    const parent = node.asset.parentId;
    if (parent && !nodes.has(parent)) node.issue = "missing-parent";
    parents.set(id, parent && nodes.has(parent) ? parent : "");
  }

  // Break one display edge per cycle. Never change the saved relationship.
  const settled = new Set<string>();
  for (const id of nodes.keys()) {
    const path = new Set<string>();
    let cursor = id;
    while (cursor && !settled.has(cursor)) {
      if (path.has(cursor)) {
        parents.set(cursor, "");
        nodes.get(cursor)!.issue = "cycle";
        break;
      }
      path.add(cursor);
      cursor = parents.get(cursor) ?? "";
    }
    for (const item of path) settled.add(item);
  }

  // Include ancestors of matches so filtering never detaches a child from its path.
  const included = new Set<string>();
  for (const id of matchingIds) {
    let cursor = nodes.has(id) ? id : "";
    while (cursor && !included.has(cursor)) {
      included.add(cursor);
      cursor = parents.get(cursor) ?? "";
    }
  }
  const roots: AssetHierarchyNode[] = [];
  const branches = new Set<string>();
  for (const [id, node] of nodes) {
    if (!included.has(id)) continue;
    const parent = parents.get(id);
    if (parent) {
      nodes.get(parent)!.children.push(node);
      branches.add(parent);
    } else roots.push(node);
  }
  return {
    roots,
    branches,
    total: included.size,
    contextCount: [...included].filter((id) => !matchingIds.has(id)).length,
  };
}
