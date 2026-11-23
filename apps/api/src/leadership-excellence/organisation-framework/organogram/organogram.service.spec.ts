import { EmsDirectoryService } from "src/ems/directory/ems-directory.service";
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
  it("resolves only the authenticated viewer’s active assignments within the company", async () => {
    const findMany = jest.fn(async () => ["employee-0"]);
    const source = { getStructure: jest.fn(async () => structure) };
    const service = new OrganogramService(source, {
      getViewerEmployeeIds: findMany,
    } as unknown as EmsDirectoryService);
    const view = await service.getView("a", "viewer");
    expect(source.getStructure).toHaveBeenCalledWith("a");
    expect(findMany).toHaveBeenCalledWith("a", "viewer");
    expect(view.viewer.status).toBe("ASSIGNED");
    expect(view.viewer.branchIds).toHaveLength(1);
    expect(view.members[0]).not.toHaveProperty("userId");
  });
  it("provides a chooser for several assignments and company fallback for none", async () => {
    let assigned = ["employee-0", "employee-1"];
    const service = new OrganogramService(
      { getStructure: async () => structure },
      {
        getViewerEmployeeIds: async () => assigned,
      } as unknown as EmsDirectoryService,
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
