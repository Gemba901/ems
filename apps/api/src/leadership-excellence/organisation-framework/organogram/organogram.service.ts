import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
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
    private readonly db: PrismaService,
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
      this.db.employee.findMany({
        where: {
          organizationId,
          userId,
          employmentStatus: { in: ["ACTIVE", "PROBATION"] },
        },
        select: { id: true },
      }),
    ]);
    const ids = new Set(assigned.map((e) => e.id)),
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
