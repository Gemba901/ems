import { CoreRecordsStructureSource } from "./core-records-structure.source";
import { OrganogramService } from "./organogram.service";
import { OrganogramController } from "./organogram.controller";
import { PrismaService } from "src/prisma/prisma.service";
import type { TenantRequest } from "src/tenancy/tenant-context";
import { buildOrganisationStructure } from "./organisation-structure";

describe("Organogram provider and viewer isolation", () => {
  const structure = buildOrganisationStructure({
    company: { id: "a", name: "A" },
    departments: [],
    employees: ["One", "Two"].map((plantBranch, i) => ({
      id: `employee-${i}`,
      firstName: "Name",
      lastName: "Only",
      jobTitle: null,
      departmentId: null,
      plantBranch,
      section: null,
      employmentStatus: "ACTIVE",
      reportingManagerId: null,
    })),
    source: { kind: "SAMPLE", label: "Test", loadedAt: "" },
  });
  it("constrains every source read to the verified company and requests a consistent snapshot", async () => {
    const db = {
      organization: {
        findUniqueOrThrow: jest.fn((_args: unknown) => ({
          id: "a",
          name: "A",
        })),
      },
      department: { findMany: jest.fn((_args: unknown) => []) },
      employee: { findMany: jest.fn((_args: unknown) => []) },
      $transaction: jest.fn(async (q) => Promise.all(q)),
    };
    const source = new CoreRecordsStructureSource(
      db as unknown as PrismaService,
    );
    await source.getStructure("a");
    expect(db.organization.findUniqueOrThrow.mock.calls[0][0]).toEqual(
      expect.objectContaining({ where: { id: "a" } }),
    );
    for (const call of [db.department.findMany, db.employee.findMany])
      expect(call.mock.calls[0][0]).toEqual(
        expect.objectContaining({ where: { organizationId: "a" } }),
      );
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Array), {
      isolationLevel: "RepeatableRead",
    });
    const selection = (db.employee.findMany.mock.calls[0][0] as any).select;
    expect(selection.avatarUrl).toBe(true);
    expect(selection.email).toBeUndefined();
    expect(selection.userId).toBeUndefined();
  });
  it("resolves only the authenticated viewer’s active assignments within the company", async () => {
    const findMany = jest.fn(async () => [{ id: "employee-0" }]);
    const source = { getStructure: jest.fn(async () => structure) };
    const service = new OrganogramService(source, {
      employee: { findMany },
    } as unknown as PrismaService);
    const view = await service.getView("a", "viewer");
    expect(source.getStructure).toHaveBeenCalledWith("a");
    expect(findMany).toHaveBeenCalledWith({
      where: {
        organizationId: "a",
        userId: "viewer",
        employmentStatus: { in: ["ACTIVE", "PROBATION"] },
      },
      select: { id: true },
    });
    expect(view.viewer.status).toBe("ASSIGNED");
    expect(view.viewer.branchIds).toHaveLength(1);
    expect(view.members[0]).not.toHaveProperty("userId");
  });
  it("provides a chooser for several assignments and company fallback for none", async () => {
    let assigned = [{ id: "employee-0" }, { id: "employee-1" }];
    const service = new OrganogramService(
      { getStructure: async () => structure },
      {
        employee: { findMany: async () => assigned },
      } as unknown as PrismaService,
    );
    expect((await service.getView("a", "viewer")).viewer.status).toBe(
      "MULTIPLE",
    );
    assigned = [];
    expect((await service.getView("a", "viewer")).viewer).toEqual({
      status: "UNASSIGNED",
      branchIds: [],
    });
  });
  it("rejects missing context and never uses caller-supplied company or viewer IDs", async () => {
    const getView = jest.fn();
    const controller = new OrganogramController({
      getView,
    } as unknown as OrganogramService);
    expect(() => controller.structure({} as TenantRequest)).toThrow();
    controller.structure({
      tenant: { organizationId: "a" },
      user: { userId: "real" },
      query: { organizationId: "b", userId: "attacker" },
    } as unknown as TenantRequest);
    expect(getView).toHaveBeenCalledWith("a", "real");
  });
});
