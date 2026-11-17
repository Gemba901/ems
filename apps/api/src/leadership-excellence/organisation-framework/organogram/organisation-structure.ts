import type {
  OrganisationStructure,
  OrganisationUnit,
  StructureCheck,
  UnitLead,
  StructurePerson,
} from "./organisation-structure.contract";

export type StructureEmployee = {
  id: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  jobTitle: string | null;
  avatarUrl?: string | null;
  departmentId: string | null;
  plantBranch: string | null;
  section: string | null;
  employmentStatus: string;
  reportingManagerId: string | null;
};
export type StructureInput = {
  company: { id: string; name: string };
  departments: { id: string; name: string }[];
  employees: StructureEmployee[];
  source: OrganisationStructure["source"];
};
const ACTIVE = new Set(["ACTIVE", "PROBATION"]);
const isActive = (e: StructureEmployee) => ACTIVE.has(e.employmentStatus);
const clean = (s: string | null | undefined) => {
  const value = (s ?? "").replace(/\s+/g, " ").trim();
  return value && !/^(n\/?a|none|-+|\.)$/i.test(value) ? value : null;
};
export const personName = (e: StructureEmployee) =>
  [clean(e.firstName), clean(e.middleName), clean(e.lastName)]
    .filter(Boolean)
    .join(" ") || "Name not recorded";
const key = (s: string | null | undefined) => clean(s)?.toLowerCase() ?? null;

/** Company → recorded branch → department occurrence → recorded section.
 * A department can occur at several branches while retaining its one source departmentId.
 * Missing branch labels never become a fabricated company-wide assignment. */
export function buildOrganisationStructure(
  input: StructureInput,
): OrganisationStructure {
  const employees = [
    ...new Map(input.employees.map((e) => [e.id, e])).values(),
  ];
  const byId = new Map(employees.map((e) => [e.id, e]));
  const departments = new Map(input.departments.map((d) => [d.id, d]));
  const branchNames = new Map<string, string>();
  // Deterministic display spelling, independent of DB row order.
  for (const e of [...employees].sort((a, b) =>
    (clean(a.plantBranch) ?? "").localeCompare(
      clean(b.plantBranch) ?? "",
      "en",
    ),
  )) {
    const k = key(e.plantBranch);
    if (k && !branchNames.has(k)) branchNames.set(k, clean(e.plantBranch)!);
  }
  const units = new Map<string, OrganisationUnit>();
  const direct = new Map<string, StructureEmployee[]>();
  const members: StructurePerson[] = [];
  function add(
    id: string,
    parentId: string | null,
    type: OrganisationUnit["type"],
    name: string,
    departmentId: string | null = null,
    branch: string | null = null,
  ) {
    if (!units.has(id))
      units.set(id, {
        id,
        parentId,
        type,
        name,
        departmentId,
        branch,
        lead: null,
        people: { total: 0, active: 0, probation: 0, inactive: 0 },
      });
    return id;
  }
  add("company", null, "COMPANY", input.company.name);
  let withoutDepartment = 0;
  for (const e of employees) {
    const bk = key(e.plantBranch),
      branch = bk ? branchNames.get(bk)! : null;
    const branchId = branchNames.size
      ? add(
          `branch:${JSON.stringify(bk)}`,
          "company",
          "BRANCH",
          branch ?? "Branch not recorded",
          null,
          branch,
        )
      : "company";
    const department = e.departmentId
      ? departments.get(e.departmentId)
      : undefined;
    let unitId = branchId;
    if (department) {
      unitId = add(
        `dept:${JSON.stringify([department.id, bk])}`,
        branchId,
        "DEPARTMENT",
        department.name,
        department.id,
        branch,
      );
      const section = clean(e.section);
      if (section)
        unitId = add(
          `section:${JSON.stringify([department.id, bk, key(section)])}`,
          unitId,
          "SECTION",
          section,
          department.id,
          branch,
        );
    } else if (isActive(e)) withoutDepartment++;
    direct.set(unitId, [...(direct.get(unitId) ?? []), e]);
    members.push({
      id: e.id,
      unitId,
      name: personName(e),
      jobTitle: e.jobTitle,
      avatarUrl: e.avatarUrl ?? null,
      active: isActive(e),
      probation: e.employmentStatus === "PROBATION",
    });
  }
  const used = new Set([...units.values()].map((u) => u.departmentId));
  for (const d of departments.values())
    if (!used.has(d.id))
      add(
        `dept:${JSON.stringify([d.id, null])}`,
        "company",
        "DEPARTMENT",
        d.name,
        d.id,
      );
  const everyone = new Map<string, StructureEmployee[]>();
  for (const [id, people] of direct) {
    let at: string | null = id;
    while (at) {
      everyone.set(at, [...(everyone.get(at) ?? []), ...people]);
      at = units.get(at)!.parentId;
    }
  }
  const reports = new Map<string, StructureEmployee[]>();
  for (const e of employees)
    if (
      isActive(e) &&
      e.reportingManagerId &&
      isActive(
        byId.get(e.reportingManagerId) ?? { ...e, employmentStatus: "MISSING" },
      )
    ) {
      reports.set(e.reportingManagerId, [
        ...(reports.get(e.reportingManagerId) ?? []),
        e,
      ]);
    }
  const loops = new Set<string>(),
    visited = new Set<string>();
  for (const e of employees.filter(isActive)) {
    const path: string[] = [],
      at = new Map<string, number>();
    let current: StructureEmployee | undefined = e;
    while (current && isActive(current) && !visited.has(current.id)) {
      if (at.has(current.id)) {
        for (const id of path.slice(at.get(current.id)!)) loops.add(id);
        break;
      }
      at.set(current.id, path.length);
      path.push(current.id);
      current = current.reportingManagerId
        ? byId.get(current.reportingManagerId)
        : undefined;
    }
    for (const id of path) visited.add(id);
  }
  function leadOf(people: StructureEmployee[]): UnitLead | null {
    const active = people.filter(isActive),
      inside = new Set(active.map((e) => e.id));
    const candidates = active.filter(
      (e) =>
        !loops.has(e.id) &&
        (!e.reportingManagerId ||
          (!inside.has(e.reportingManagerId) &&
            byId.has(e.reportingManagerId) &&
            isActive(byId.get(e.reportingManagerId)!))),
    );
    const scored = candidates
      .map((e) => {
        const seen = new Set([e.id]),
          stack = [...(reports.get(e.id) ?? [])];
        while (stack.length) {
          const next = stack.pop()!;
          if (seen.has(next.id) || !inside.has(next.id)) continue;
          seen.add(next.id);
          stack.push(...(reports.get(next.id) ?? []));
        }
        return { e, score: seen.size - 1 };
      })
      .sort((a, b) => b.score - a.score);
    // Never use name order to resolve tied candidates or manufacture authority.
    const best = scored[0];
    if (!best || (scored[1] && scored[1].score === best.score)) return null;
    return {
      employeeId: best.e.id,
      name: personName(best.e),
      jobTitle: best.e.jobTitle,
      avatarUrl: best.e.avatarUrl ?? null,
      basis: "INFERRED_FROM_REPORTING",
    };
  }
  for (const u of units.values()) {
    const all = everyone.get(u.id) ?? [],
      active = all.filter(isActive);
    u.people = {
      total: all.length,
      active: active.length,
      probation: all.filter((e) => e.employmentStatus === "PROBATION").length,
      inactive: all.length - active.length,
    };
    u.lead = leadOf(all);
  }
  const checks: StructureCheck[] = [],
    active = employees.filter(isActive);
  function check(
    kind: StructureCheck["kind"],
    severity: StructureCheck["severity"],
    count: number,
    message: string,
    unitId: string | null = null,
  ) {
    if (count) checks.push({ kind, severity, count, unitId, message });
  }
  const noManager = active.filter(
    (e) =>
      !e.reportingManagerId && e.id !== units.get("company")!.lead?.employeeId,
  ).length;
  check(
    "NO_MANAGER",
    "WARNING",
    noManager,
    `${noManager} people have no manager recorded. Confirm whether these are intentional top-level roles.`,
  );
  const missing = active.filter(
    (e) => e.reportingManagerId && !byId.has(e.reportingManagerId),
  ).length;
  check(
    "MANAGER_MISSING",
    "ERROR",
    missing,
    `${missing} reporting links point outside the available company records.`,
  );
  check(
    "REPORTING_LOOP",
    "ERROR",
    loops.size,
    `${loops.size} people are in a reporting loop (including self-reporting).`,
  );
  const inactive = active.filter(
    (e) =>
      e.reportingManagerId &&
      byId.has(e.reportingManagerId) &&
      !isActive(byId.get(e.reportingManagerId)!),
  ).length;
  check(
    "MANAGER_INACTIVE",
    "WARNING",
    inactive,
    `${inactive} people report to an inactive employee.`,
  );
  check(
    "NO_DEPARTMENT",
    "WARNING",
    withoutDepartment,
    `${withoutDepartment} active people have no department recorded. They remain included in their branch totals.`,
  );
  for (const u of units.values())
    if (u.type === "DEPARTMENT") {
      if (!u.people.active)
        check(
          "EMPTY_DEPARTMENT",
          "WARNING",
          1,
          `${u.name}${u.branch ? ` · ${u.branch}` : ""}: no active people${u.people.inactive ? ` (${u.people.inactive} inactive)` : ""}.`,
          u.id,
        );
      else if (!u.lead)
        check(
          "NO_LEAD",
          "WARNING",
          1,
          `${u.name}${u.branch ? ` · ${u.branch}` : ""}: a single lead cannot be inferred. Check the recorded HOD in EMS.`,
          u.id,
        );
    }
  const order = { COMPANY: 0, BRANCH: 1, DEPARTMENT: 2, SECTION: 3 };
  return {
    source: input.source,
    company: input.company,
    multiBranch: branchNames.size > 1,
    units: [...units.values()].sort(
      (a, b) =>
        order[a.type] - order[b.type] ||
        Number(a.type === "BRANCH" && !a.branch) -
          Number(b.type === "BRANCH" && !b.branch) ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id),
    ),
    members: members.sort(
      (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
    ),
    people: { ...units.get("company")!.people, withoutDepartment },
    checks,
  };
}
