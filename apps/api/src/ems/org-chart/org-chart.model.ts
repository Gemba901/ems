export type ChartPerson = {
  id: string;
  name: string;
  employeeCode?: string | null;
  jobTitle: string | null;
  department: { id: string; name: string } | null;
  branch: null;
  branchText: string | null;
  managerId: string | null;
  reportsToBody: string | null;
  status: string;
  photoUrl: string | null;
};
export type ChartIssue = {
  employeeId: string;
  kind:
    | "NO_MANAGER"
    | "MANAGER_UNAVAILABLE"
    | "SELF_REPORTING"
    | "LOOP"
    | "MANAGER_INACTIVE"
    | "CONFLICTING_REPORTING";
};
const active = (status: string) =>
  status === "ACTIVE" || status === "PROBATION";
/** Linear graph analysis; no recursion, including for malformed or deep graphs. */
export function analysePeople(people: ChartPerson[]) {
  const byId = new Map(people.map((p) => [p.id, p]));
  const issues: ChartIssue[] = [];
  const direct = new Map<string, number>();
  const parents = new Map<string, string>();
  for (const p of people) {
    if (p.managerId && p.reportsToBody)
      issues.push({ employeeId: p.id, kind: "CONFLICTING_REPORTING" });
    if (p.managerId === p.id)
      issues.push({ employeeId: p.id, kind: "SELF_REPORTING" });
    else if (p.managerId) {
      const manager = byId.get(p.managerId);
      if (!manager)
        issues.push({ employeeId: p.id, kind: "MANAGER_UNAVAILABLE" });
      else {
        parents.set(p.id, manager.id);
        direct.set(manager.id, (direct.get(manager.id) ?? 0) + 1);
        if (!active(manager.status))
          issues.push({ employeeId: p.id, kind: "MANAGER_INACTIVE" });
      }
    } else if (!p.reportsToBody)
      issues.push({ employeeId: p.id, kind: "NO_MANAGER" });
  }
  const done = new Set<string>();
  for (const p of people) {
    const path: string[] = [];
    const index = new Map<string, number>();
    let id: string | undefined = p.id;
    while (id && !done.has(id) && !index.has(id)) {
      index.set(id, path.length);
      path.push(id);
      id = parents.get(id);
    }
    if (id && index.has(id))
      for (const member of path.slice(index.get(id)!))
        issues.push({ employeeId: member, kind: "LOOP" });
    path.forEach((member) => done.add(member));
  }
  return {
    people: people.map((p) => ({ ...p, directReports: direct.get(p.id) ?? 0 })),
    issues,
  };
}
