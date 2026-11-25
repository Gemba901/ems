import { Inject, Injectable } from '@nestjs/common';
import { POSITION_CHART_SOURCE, type PersonDetails, type PositionChart, type PositionChartProvider } from './position-chart.contract';

/** 02.02's service: positions and reporting, and one person's details for one viewer. Exported for later areas. */
@Injectable()
export class PositionChartService {
  constructor(@Inject(POSITION_CHART_SOURCE) private readonly source: PositionChartProvider) {}

  getPositions(organizationId: string): Promise<PositionChart> { return this.source.getPositions(organizationId); }

  /** A person's details, limited to what this viewer may see (their tier is resolved by EMS, never taken from the request). */
  async getPerson(organizationId: string, userId: string, employeeId: string): Promise<PersonDetails> {
    return this.source.getPerson(organizationId, userId, employeeId);
  }
}
