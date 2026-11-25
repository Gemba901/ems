import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  PlanningEmployeeContext,
  PlanningPeopleMetadataSource,
  PlanningPersonMetadata,
} from './planning-people.contracts';

/** Temporary read-only metadata until the shared EMS directory publishes it. */
@Injectable()
export class CoreRecordsPlanningPeopleMetadataSource implements PlanningPeopleMetadataSource {
  constructor(private readonly db: PrismaService) {}

  async getPeopleMetadata(
    organizationId: string,
    employeeIds: string[],
  ): Promise<PlanningPersonMetadata[]> {
    if (!employeeIds.length) return [];
    const employees = await this.db.employee.findMany({
      where: {
        organizationId,
        id: { in: employeeIds },
        employmentStatus: { in: ['ACTIVE', 'PROBATION'] },
      },
      select: {
        id: true,
        departmentId: true,
        section: true,
        updatedAt: true,
        userId: true,
        user: {
          select: {
            organizations: {
              where: { organizationId },
              select: { role: { select: { name: true } } },
            },
          },
        },
      },
    });
    return employees.map((employee) => {
      const membership = employee.user?.organizations[0];
      return {
        id: employee.id,
        departmentId: employee.departmentId,
        section: employee.section,
        updatedAt: employee.updatedAt.toISOString(),
        userId: membership ? employee.userId : null,
        role: membership?.role.name || 'EMPLOYEE',
      };
    });
  }

  async getAccountName(
    organizationId: string,
    userId: string,
  ): Promise<string | null> {
    const membership = await this.db.userOrganization.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
      select: { user: { select: { name: true } } },
    });
    return membership?.user.name ?? null;
  }

  async getTimeZone(organizationId: string): Promise<string> {
    const organization = await this.db.organization.findUnique({
      where: { id: organizationId },
      select: { timeZone: true },
    });
    return organization?.timeZone || 'UTC';
  }

  async findEligibleEmployee(
    organizationId: string,
    employeeId: string,
  ): Promise<PlanningEmployeeContext | null> {
    return this.db.employee.findFirst({
      where: {
        organizationId,
        id: employeeId,
        employmentStatus: { in: ['ACTIVE', 'PROBATION'] },
      },
      select: { id: true, departmentId: true, reportingManagerId: true },
    });
  }
}
