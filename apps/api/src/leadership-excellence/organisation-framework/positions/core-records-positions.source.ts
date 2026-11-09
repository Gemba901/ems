import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import type { PositionChart, PositionChartProvider } from './position-chart.contract';
import { buildPositionChart } from './position-chart';

/**
 * TEMPORARY source for 02.02 until EMS keeps position records and its service is on this branch.
 *
 * Reads the shared core records (organisation, departments, employees), read-only and for the current company only,
 * and works positions out from job titles and reporting lines. When EMS's service is connected, the module binds
 * POSITION_CHART_SOURCE to it instead and this file is deleted; the page and the contract don't change.
 */
@Injectable()
export class CoreRecordsPositionsSource implements PositionChartProvider {
  constructor(private readonly db: PrismaService) {}

  async getPositions(organizationId: string): Promise<PositionChart> {
    const [organization, departments, employees] = await this.db.$transaction([
      this.db.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { id: true, name: true } }),
      this.db.department.findMany({ where: { organizationId }, select: { id: true, name: true } }),
      this.db.employee.findMany({
        where: { organizationId },
        select: { id: true, firstName: true, middleName: true, lastName: true, jobTitle: true, departmentId: true,
          plantBranch: true, employmentStatus: true, reportingManagerId: true },
      }),
    ]);
    return buildPositionChart({
      company: organization, departments, employees,
      source: { kind: 'CORE_RECORDS', label: 'Core people records (temporary: positions worked out from job titles and reporting lines)', loadedAt: new Date().toISOString() },
    });
  }
}
