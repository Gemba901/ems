import { Prisma } from "db";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import type {
  OrganisationStructure,
  OrganisationStructureProvider,
} from "./organisation-structure.contract";
import { buildOrganisationStructure } from "./organisation-structure";

/**
 * TEMPORARY source for 02.01 until the EMS service is on this branch.
 *
 * Reads the shared core records (organisation, departments, employees), read-only and for the current company only,
 * and builds the agreed structure. When EMS merges, the module binds ORGANISATION_STRUCTURE_SOURCE to EMS's service
 * instead and this file is deleted; the page and the contract don't change.
 */
@Injectable()
export class CoreRecordsStructureSource implements OrganisationStructureProvider {
  constructor(private readonly db: PrismaService) {}

  async getStructure(organizationId: string): Promise<OrganisationStructure> {
    // One consistent snapshot of the three reads.
    const [organization, departments, employees] = await this.db.$transaction(
      [
        this.db.organization.findUniqueOrThrow({
          where: { id: organizationId },
          select: { id: true, name: true },
        }),
        this.db.department.findMany({
          where: { organizationId },
          select: { id: true, name: true },
        }),
        this.db.employee.findMany({
          where: { organizationId },
          select: {
            id: true,
            firstName: true,
            middleName: true,
            lastName: true,
            jobTitle: true,
            avatarUrl: true,
            departmentId: true,
            plantBranch: true,
            section: true,
            employmentStatus: true,
            reportingManagerId: true,
          },
        }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return buildOrganisationStructure({
      company: organization,
      departments,
      employees,
      source: {
        kind: "CORE_RECORDS",
        label:
          "Core people records (temporary, until the EMS service is connected)",
        loadedAt: new Date().toISOString(),
      },
    });
  }
}
