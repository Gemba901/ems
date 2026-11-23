import { Inject, Injectable } from "@nestjs/common";
import { EmsDirectoryService } from "src/ems/directory/ems-directory.service";
import {
  ORGANISATION_STRUCTURE_SOURCE,
  type OrganisationStructureProvider,
  type OrganogramViewData,
} from "./organisation-structure.contract";

@Injectable()
export class OrganogramService implements OrganisationStructureProvider {
  constructor(
    @Inject(ORGANISATION_STRUCTURE_SOURCE)
    private readonly source: OrganisationStructureProvider,
    private readonly directory: EmsDirectoryService,
  ) {}
  getStructure(organizationId: string) {
    return this.source.getStructure(organizationId);
  }
  async getView(
    organizationId: string,
    userId: string,
  ): Promise<OrganogramViewData> {
    const [structure, assigned] = await Promise.all([
      this.getStructure(organizationId),
      this.directory.getViewerEmployeeIds(organizationId, userId),
    ]);
    const ids = new Set(assigned),
      units = new Map(structure.units.map((u) => [u.id, u]));
    const branchIds = new Set<string>();
    for (const member of structure.members)
      if (ids.has(member.id)) {
        let unit = units.get(member.unitId);
        const seen = new Set<string>();
        while (unit && !seen.has(unit.id)) {
          seen.add(unit.id);
          if (unit.type === "BRANCH" && unit.branch) {
            branchIds.add(unit.id);
            break;
          }
          unit = unit.parentId ? units.get(unit.parentId) : undefined;
        }
      }
    const branches = [...branchIds].sort();
    return {
      ...structure,
      viewer: {
        branchIds: branches,
        status:
          branches.length === 1
            ? "ASSIGNED"
            : branches.length > 1
              ? "MULTIPLE"
              : "UNASSIGNED",
      },
    };
  }
}
