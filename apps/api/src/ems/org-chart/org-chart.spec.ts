import "reflect-metadata";
import { analysePeople, type ChartPerson } from "./org-chart.model";
import { EmsOrgChartService } from "./org-chart.service";
import { EmsOrgChartController } from "./org-chart.controller";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { TrustedTenantContextGuard } from "src/tenancy/trusted-tenant-context.guard";
import { JwtAuthGuard } from "src/auth/guards/jwt-auth.guard";
import { TenantGuard } from "src/tenancy/tenant.guard";
const p = (
  id: string,
  managerId: string | null = null,
  extra: Partial<ChartPerson> = {},
): ChartPerson => ({
  id,
  name: id,
  jobTitle: null,
  department: null,
  branch: null,
  branchText: null,
  managerId,
  reportsToBody: managerId ? null : "BOARD",
  status: "ACTIVE",
  photoUrl: null,
  ...extra,
});
describe("EMS org chart", () => {
  it("finds all loop members but not their reports", () => {
    expect(
      analysePeople([p("a", "b"), p("b", "a"), p("c", "a")]).issues,
    ).toEqual([
      { employeeId: "a", kind: "LOOP" },
      { employeeId: "b", kind: "LOOP" },
    ]);
  });
  it("flags self, missing, inactive and conflicting assignments", () => {
    const result = analysePeople([
      p("a", "a"),
      p("b", "unknown"),
      p("c", null, { reportsToBody: null }),
      p("d", null, { status: "LEFT" }),
      p("e", "d"),
      p("f", "d", { reportsToBody: "OWNER" }),
    ]);
    expect(result.issues.map((i) => i.kind)).toEqual(
      expect.arrayContaining([
        "SELF_REPORTING",
        "MANAGER_UNAVAILABLE",
        "NO_MANAGER",
        "MANAGER_INACTIVE",
        "CONFLICTING_REPORTING",
      ]),
    );
  });
  it("handles a 550-person chain", () => {
    const result = analysePeople(
      Array.from({ length: 550 }, (_, i) =>
        p(String(i), i ? String(i - 1) : null),
      ),
    );
    expect(result.issues).toEqual([]);
    expect(result.people[0].directReports).toBe(1);
  });
  it("uses tenant guard before business reads", () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, EmsOrgChartController).slice(0, 3),
    ).toEqual([TrustedTenantContextGuard, JwtAuthGuard, TenantGuard]);
    const chart = { read: jest.fn() };
    expect(() =>
      new EmsOrgChartController(chart as any).read({} as any),
    ).toThrow("Company context");
    expect(chart.read).not.toHaveBeenCalled();
  });
  it("scopes queries and strips foreign manager/department IDs and private fields", async () => {
    const tx = {
      $executeRaw: jest.fn(),
      employee: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            {
              id: "a",
              employeeCode: "EMP-0042",
              firstName: "Jane",
              middleName: "N/A",
              lastName: "Test",
              jobTitle: "Engineer",
              departmentId: "foreign-dept",
              plantBranch: "Nairobi",
              reportingManagerId: "foreign-user",
              reportsToBoard: false,
              reportingBody: null,
              employmentStatus: "ACTIVE",
              avatarUrl: null,
            },
          ]),
      },
      department: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const db = { $transaction: jest.fn((fn) => fn(tx)) };
    const result = await new EmsOrgChartService(db as any).read("org-a");
    expect(tx.employee.findMany.mock.calls[0][0].where).toEqual({
      organizationId: "org-a",
    });
    expect(tx.department.findMany.mock.calls[0][0].where).toEqual({
      organizationId: "org-a",
    });
    expect(result.people[0]).toMatchObject({
      name: "Jane Test",
      employeeCode: "EMP-0042",
      managerId: null,
      department: null,
    });
    expect(JSON.stringify(result)).not.toContain("foreign-");
    expect(result.issues).toContainEqual({
      employeeId: "a",
      kind: "MANAGER_UNAVAILABLE",
    });
    const fields = Object.keys(tx.employee.findMany.mock.calls[0][0].select);
    expect(fields).toContain("employeeCode");
    for (const field of ["email", "phone", "userId", "dateOfBirth"])
      expect(fields).not.toContain(field);
  });
});
