import type { OrganisationStructure, OrganisationUnit } from "./types";

/** Who's inside whom: sub-units by unit, and the chain above a unit. Loops in the data never hang. */
export function indexUnits(structure: OrganisationStructure) {
  const byId = new Map(structure.units.map((u) => [u.id, u]));
  const children = new Map<string, OrganisationUnit[]>();
  for (const u of structure.units)
    if (u.parentId && byId.has(u.parentId))
      children.set(u.parentId, [...(children.get(u.parentId) ?? []), u]);
  const childrenOf = (id: string) => children.get(id) ?? [];
  const pathTo = (id: string) => {
    const path: OrganisationUnit[] = [];
    const seen = new Set<string>();
    let current = byId.get(id);
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      path.unshift(current);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return path;
  };
  const roots = structure.units.filter(
    (u) => !u.parentId || !byId.has(u.parentId),
  );
  const checksFor = (id: string) =>
    structure.checks.filter((c) => c.unitId === id);
  return { byId, childrenOf, pathTo, roots, checksFor };
}
export type UnitIndex = ReturnType<typeof indexUnits>;

/** Every unit below `id` (inclusive). */
export function within(index: UnitIndex, id: string) {
  const out = new Set<string>();
  const stack = [id];
  while (stack.length) {
    const next = stack.pop()!;
    if (out.has(next)) continue;
    out.add(next);
    stack.push(...index.childrenOf(next).map((u) => u.id));
  }
  return out;
}

/** "Find a unit": the units whose name or type match, plus everything above them (so they stay reachable). */
export function searchUnits(
  index: UnitIndex,
  units: OrganisationUnit[],
  term: string,
) {
  const q = term.trim().toLowerCase();
  if (!q) return null;
  const hits = units.filter((u) =>
    `${u.name} ${u.type} ${u.branch ?? ""} ${u.lead?.name ?? ""}`
      .toLowerCase()
      .includes(q),
  );
  const keep = new Set<string>();
  for (const hit of hits) for (const u of index.pathTo(hit.id)) keep.add(u.id);
  return { hits: new Set(hits.map((u) => u.id)), keep };
}

/** At company level show branches; when focused on a branch show its departments at readable size. */
export function defaultOpen(structure: OrganisationStructure, scope = "") {
  return new Set([scope || "company"]);
}
export const TYPE_LABEL: Record<OrganisationUnit["type"], string> = {
  COMPANY: "Company",
  BRANCH: "Branch / site",
  DEPARTMENT: "Department",
  SECTION: "Section",
};
export function visibleUnits(
  index: UnitIndex,
  scope: string,
  open: Set<string>,
  keep?: Set<string>,
) {
  const root = scope ? index.byId.get(scope) : undefined;
  const stack = root ? [root] : [...index.roots].reverse();
  const out: OrganisationUnit[] = [],
    seen = new Set<string>();
  while (stack.length) {
    const next = stack.pop()!;
    if (seen.has(next.id) || (keep && !keep.has(next.id))) continue;
    seen.add(next.id);
    out.push(next);
    if (open.has(next.id))
      stack.push(...[...index.childrenOf(next.id)].reverse());
  }
  return out;
}
export function initialScope(
  structure: import("./types").OrganogramViewData,
  saved: string | null,
) {
  if (saved === "" || (saved && structure.units.some((u) => u.id === saved)))
    return saved;
  return structure.viewer.branchIds.length === 1
    ? structure.viewer.branchIds[0]
    : "";
}
export function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
}
export function photoUrl(value: string | null) {
  if (!value) return undefined;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    const u = new URL(value);
    return u.protocol === "https:" ? value : undefined;
  } catch {
    return undefined;
  }
}
