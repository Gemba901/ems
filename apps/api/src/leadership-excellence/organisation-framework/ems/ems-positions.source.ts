import { Injectable } from '@nestjs/common';
import { EmsDirectoryService } from 'src/ems/directory/ems-directory.service';
import type { PositionChartProvider } from '../positions/position-chart.contract';
import { buildPositionChart } from '../positions/position-chart';
import { structureEmployee } from './ems-source-mapping';

/** Employee-backed display until recorded positions are available. Its derived IDs remain unsuitable for plans. */
@Injectable()
export class EmsPositionsSource implements PositionChartProvider {
  constructor(private readonly directory: EmsDirectoryService) {}
  async getPositions(organizationId: string) {
    const data = await this.directory.getDirectory(organizationId);
    return buildPositionChart({
      company: data.company,
      departments: data.departments,
      employees: data.people.map(structureEmployee),
      source: {
        kind: 'EMS',
        label:
          'EMS people · positions worked out from job titles and reporting lines',
        loadedAt: data.loadedAt,
      },
    });
  }
  getPerson(organizationId: string, viewerUserId: string, employeeId: string) {
    return this.directory.getPerson(organizationId, viewerUserId, employeeId);
  }
}
