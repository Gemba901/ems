import {
  buildOrganisationStructure,
  type StructureEmployee,
} from "./organisation-structure";
const person = (
  id: string,
  extra: Partial<StructureEmployee> = {},
): StructureEmployee => ({
  id,
  firstName: id,
  lastName: "Test",
  jobTitle: "Officer",
  departmentId: "prod",
  plantBranch: "Nairobi",
  section: null,
  employmentStatus: "ACTIVE",
  reportingManagerId: null,
  ...extra,
});
const build = (
  employees: StructureEmployee[],
  departments = [{ id: "prod", name: "Production" }],
) =>
  buildOrganisationStructure({
    company: { id: "org", name: "Company" },
    departments,
    employees,
    source: {
      kind: "SAMPLE",
      label: "Fixture",
      loadedAt: "2026-11-08T00:00:00Z",
    },
  });
describe("Organogram source model", () => {
  it("retains a single recorded branch and its people even when their department is missing", () => {
    const s = build([
      person("a"),
      person("b", { departmentId: null }),
      person("c", { departmentId: "other-company" }),
    ]);
    const branch = s.units.find((u) => u.type === "BRANCH")!;
    expect(branch.name).toBe("Nairobi");
    expect(branch.people.total).toBe(3);
    expect(s.people.withoutDepartment).toBe(2);
    expect(s.members.filter((p) => p.unitId === branch.id)).toHaveLength(2);
    expect(s.units.some((u) => u.departmentId === "other-company")).toBe(false);
  });
  it("preserves department identity across branches and keeps unrecorded branch data separate", () => {
    const s = build([
      person("a"),
      person("b", { plantBranch: "Mombasa" }),
      person("c", { plantBranch: null }),
      person("d", { plantBranch: " nairobi " }),
    ]);
    const departments = s.units.filter((u) => u.type === "DEPARTMENT");
    expect(departments).toHaveLength(3);
    expect(new Set(departments.map((u) => u.departmentId))).toEqual(
      new Set(["prod"]),
    );
    expect(
      s.units.find((u) => u.type === "BRANCH" && !u.branch)?.people.total,
    ).toBe(1);
    expect(s.people.total).toBe(4);
    expect(
      s.units
        .filter((u) => u.type === "BRANCH")
        .reduce((n, u) => n + u.people.total, 0),
    ).toBe(4);
  });
  it("uses collision-safe keys for punctuation, sentinel-looking labels and sections", () => {
    const s = build([
      person("a", { plantBranch: "unassigned", section: "A:B" }),
      person("b", { plantBranch: null, section: "A:B" }),
      person("c", { plantBranch: "x:y", section: "z" }),
      person("d", { plantBranch: "x", section: "y:z" }),
    ]);
    expect(new Set(s.units.map((u) => u.id)).size).toBe(s.units.length);
    expect(s.members.map((p) => p.unitId)).toHaveLength(4);
    expect(new Set(s.members.map((p) => p.unitId)).size).toBe(4);
  });
  it("does not choose an alphabetic lead for tied candidates or an invalid reporting link", () => {
    const s = build([
      person("Alex"),
      person("Zuri"),
      person("bad", { reportingManagerId: "foreign" }),
      person("self", { reportingManagerId: "self" }),
    ]);
    expect(s.units.find((u) => u.type === "DEPARTMENT")?.lead).toBeNull();
    expect(s.checks.some((c) => c.kind === "NO_LEAD")).toBe(true);
    const invalid = build([person("bad", { reportingManagerId: "foreign" })]);
    expect(invalid.units.every((u) => !u.lead)).toBe(true);
  });
  it("marks a unique inferred lead but never declares it a recorded HOD", () => {
    const s = build(
      [
        person("ceo", { departmentId: "exec" }),
        person("hod", { reportingManagerId: "ceo" }),
        person("member", { reportingManagerId: "hod" }),
        person("peer", { reportingManagerId: "ceo" }),
      ],
      [
        { id: "prod", name: "Production" },
        { id: "exec", name: "Executive" },
      ],
    );
    expect(s.units.find((u) => u.departmentId === "prod")?.lead).toMatchObject({
      employeeId: "hod",
      basis: "INFERRED_FROM_REPORTING",
    });
    expect(s.checks.filter((c) => c.kind === "NO_MANAGER")).toHaveLength(0);
  });
  it("detects loops, inactive managers, missing managers and avoids misleading empty labels", () => {
    const s = build(
      [
        person("a", { reportingManagerId: "b" }),
        person("b", { reportingManagerId: "a" }),
        person("self", { reportingManagerId: "self" }),
        person("inactive", {
          employmentStatus: "ON_LEAVE",
          departmentId: "empty",
        }),
        person("orphan", { reportingManagerId: "inactive" }),
        person("foreign", { reportingManagerId: "missing" }),
      ],
      [
        { id: "prod", name: "Production" },
        { id: "empty", name: "Quiet department" },
      ],
    );
    expect(s.checks.find((c) => c.kind === "REPORTING_LOOP")?.count).toBe(3);
    expect(s.checks.find((c) => c.kind === "MANAGER_MISSING")?.count).toBe(1);
    expect(s.checks.find((c) => c.kind === "MANAGER_INACTIVE")?.count).toBe(1);
    expect(
      s.checks.find((c) => c.kind === "EMPTY_DEPARTMENT")?.message,
    ).toContain("1 inactive");
  });
  it("keeps counts inclusive of probation and directory membership unique", () => {
    const e = person("a", {
      section: "Moulding",
      employmentStatus: "PROBATION",
    });
    const s = build([
      e,
      e,
      person("b", { section: "moulding ", employmentStatus: "RESIGNED" }),
    ]);
    expect(s.people).toMatchObject({
      total: 2,
      active: 1,
      probation: 1,
      inactive: 1,
    });
    expect(s.units.filter((u) => u.type === "SECTION")).toHaveLength(1);
    expect(s.members).toHaveLength(2);
  });
  it("retains empty departments without fabricating a branch or company-wide scope", () => {
    const s = build([]);
    expect(s.units.map((u) => u.type)).toEqual(["COMPANY", "DEPARTMENT"]);
    expect(s.people.total).toBe(0);
    expect(s.units[1].branch).toBeNull();
  });
});
