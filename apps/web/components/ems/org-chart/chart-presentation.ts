import { bodyLabels, type Person, type ChartData, buildView } from "./model";
export type ChartView = ReturnType<typeof buildView>;
const PALETTE = [
  "#2563eb",
  "#be123c",
  "#047857",
  "#b45309",
  "#7c3aed",
  "#0369a1",
  "#a21caf",
  "#4d7c0f",
  "#c2410c",
  "#475569",
];
export function departmentPalette(people: Person[]) {
  const departments = [
    ...new Map(
      people
        .filter((p) => p.department)
        .map((p) => [p.department!.id, p.department!]),
    ).values(),
  ].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const map = new Map(
    departments.map((d, i) => [d.id, PALETTE[i % PALETTE.length]]),
  );
  return {
    legend: departments.map((d) => ({ ...d, colour: map.get(d.id)! })),
    colour: (p: Person) => map.get(p.department?.id ?? "") ?? "#64748b",
  };
}
export function reportingPath(view: ChartView, id: string) {
  const path: Person[] = [],
    seen = new Set<string>();
  let current: string | null = id;
  while (current && !seen.has(current) && view.byId.has(current)) {
    seen.add(current);
    path.unshift(view.byId.get(current)!);
    current = view.parents.get(current) ?? null;
  }
  return path;
}
export function teamContext(view: ChartView, id: string) {
  const person = view.byId.get(id);
  if (!person) return null;
  const direct = (view.children.get(id) ?? [])
    .map((k) => view.byId.get(k)!)
    .filter(Boolean);
  const parentId = view.parents.get(id),
    manager = parentId ? view.byId.get(parentId) : undefined;
  const colleagues =
    !direct.length && manager
      ? (view.children.get(manager.id) ?? [])
          .map((k) => view.byId.get(k)!)
          .filter(Boolean)
      : [];
  const seen = new Set([id]),
    stack = direct.map((p) => p.id);
  while (stack.length) {
    const k = stack.pop()!;
    if (seen.has(k)) continue;
    seen.add(k);
    stack.push(...(view.children.get(k) ?? []));
  }
  const path = reportingPath(view, id),
    body = view.connected.has(id)
      ? (bodyLabels[path[0]?.reportsToBody ?? ""] ?? null)
      : null;
  return {
    person,
    direct,
    manager,
    colleagues,
    path,
    body,
    descendants: seen.size - 1,
  };
}
/** Multi-word queries match independently, so initials plus surname also work. */
export function findChartPeople(data: ChartData, term: string) {
  const words = term.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return data.people
    .filter((p) => {
      const haystack =
        `${p.name} ${p.jobTitle ?? ""} ${p.department?.name ?? ""} ${p.branch?.name ?? p.branchText ?? ""}`.toLocaleLowerCase();
      return words.every((w) => haystack.includes(w));
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    .slice(0, 20);
}
