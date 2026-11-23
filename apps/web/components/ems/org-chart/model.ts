export type Person = {
  id: string;
  name: string;
  jobTitle: string | null;
  department: { id: string; name: string } | null;
  branch: { id: string; name: string } | null;
  branchText: string | null;
  managerId: string | null;
  reportsToBody: string | null;
  status: string | null; active?: boolean;
  photoUrl: string | null;
  directReports: number;
};
export type Issue = { employeeId: string; kind: string };
export type ChartData = {
  capabilities?: { employmentDetails: boolean; inactivePeople: boolean };
  people: Person[];
  issues: Issue[];
  source: string;
  refreshedAt: string;
};
export const issueLabels: Record<string, string> = {
  NO_MANAGER: "No reporting assignment",
  MANAGER_UNAVAILABLE: "Manager unavailable",
  SELF_REPORTING: "Reports to self",
  LOOP: "Reporting loop",
  MANAGER_INACTIVE: "Manager inactive",
  CONFLICTING_REPORTING: "Manager and reporting body both assigned",
};
export const bodyLabels: Record<string, string> = {
  BOARD: "Board",
  COMMITTEE: "Committee",
  MANAGEMENT_COMMITTEE: "Management Committee",
  OWNER: "Owner",
};
export const active = (p: Person) => (p.active ?? ["ACTIVE", "PROBATION"].includes(p.status ?? ""));
export function buildView(
  data: ChartData,
  filters: {
    department: string;
    branch: string;
    inactive: boolean;
    issuesOnly: boolean;
    focus: string;
  },
) {
  const byId = new Map(data.people.map((p) => [p.id, p]));
  const issueIds = new Set(data.issues.map((i) => i.employeeId));
  // Cut invalid edges for display only; never alter saved reporting relationships.
  const invalid = new Set(
    data.issues
      .filter((i) =>
        ["LOOP", "SELF_REPORTING", "CONFLICTING_REPORTING"].includes(i.kind),
      )
      .map((i) => i.employeeId),
  );
  const parent = (p: Person) =>
    !invalid.has(p.id) && p.managerId && byId.has(p.managerId)
      ? p.managerId
      : null;
  const children = new Map<string, string[]>();
  data.people.forEach((p) => {
    const id = parent(p);
    if (id) children.set(id, [...(children.get(id) ?? []), p.id]);
  });
  for (const ids of children.values())
    ids.sort(
      (a, b) =>
        byId.get(a)!.name.localeCompare(byId.get(b)!.name, undefined, {
          numeric: true,
        }) || a.localeCompare(b),
    );
  let focused: Set<string> | null = null;
  if (filters.focus && byId.has(filters.focus)) {
    focused = new Set();
    const pending = [filters.focus];
    while (pending.length) {
      const id = pending.pop()!;
      if (focused.has(id)) continue;
      focused.add(id);
      pending.push(...(children.get(id) ?? []));
    }
  }
  const matches = new Set(
    data.people
      .filter(
        (p) =>
          (filters.inactive || active(p)) &&
          (!filters.department || p.department?.id === filters.department) &&
          (!filters.branch ||
            (p.branch?.id ?? p.branchText ?? "") === filters.branch) &&
          (!filters.issuesOnly || issueIds.has(p.id)) &&
          (!focused || focused.has(p.id)),
      )
      .map((p) => p.id),
  );
  const included = new Set(matches);
  let contextTruncated = false;
  for (const id of matches) {
    let p = byId.get(id)!;
    const seen = new Set([id]);
    let count = 0;
    while (parent(p)) {
      if (filters.focus && ++count > 8) {
        contextTruncated = true;
        break;
      }
      const next = parent(p)!;
      if (seen.has(next)) break;
      seen.add(next);
      included.add(next);
      p = byId.get(next)!;
    }
  }
  // Classify the complete saved chain before view filtering or bounded focus.
  // An inactive manager is still valid context; a missing/cut edge is not a body root.
  const connected = new Set<string>();
  const unavailable = new Set(
    data.issues
      .filter((i) => ["MANAGER_UNAVAILABLE", "NO_MANAGER"].includes(i.kind))
      .map((i) => i.employeeId),
  );
  const connectedQueue = data.people
    .filter(
      (p) =>
        !p.managerId &&
        !!bodyLabels[p.reportsToBody ?? ""] &&
        !invalid.has(p.id) &&
        !unavailable.has(p.id),
    )
    .map((p) => p.id);
  for (let i = 0; i < connectedQueue.length; i++) {
    const id = connectedQueue[i];
    if (connected.has(id)) continue;
    connected.add(id);
    connectedQueue.push(...(children.get(id) ?? []));
  }
  const roots = data.people.filter(
    (p) => included.has(p.id) && (!parent(p) || !included.has(parent(p)!)),
  );
  const depths = new Map<string, number>();
  const queue = roots.map((p) => ({ id: p.id, depth: 1 }));
  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    depths.set(item.id, item.depth);
    for (const id of children.get(item.id) ?? [])
      if (included.has(id)) queue.push({ id, depth: item.depth + 1 });
  }
  const managerCounts = [...matches]
    .map(
      (id) =>
        (children.get(id) ?? []).filter((child) => matches.has(child)).length,
    )
    .filter((n) => n > 0);
  return {
    connected,
    connectedRoots: roots.filter((p) => connected.has(p.id)),
    unconnectedRoots: roots.filter((p) => !connected.has(p.id)),
    parents: new Map(data.people.map((p) => [p.id, parent(p)])),
    contextTruncated,
    byId,
    children,
    roots,
    matches,
    included,
    depths,
    layers: Math.max(0, ...depths.values()),
    average: managerCounts.length
      ? managerCounts.reduce((a, b) => a + b, 0) / managerCounts.length
      : 0,
  };
}
