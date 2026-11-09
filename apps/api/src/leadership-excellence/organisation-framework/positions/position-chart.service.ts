import { Inject, Injectable } from '@nestjs/common';
import { POSITION_CHART_SOURCE, type PositionChart, type PositionChartProvider } from './position-chart.contract';

/** 02.02's service: positions and reporting from whichever source is connected. Exported for later areas. */
@Injectable()
export class PositionChartService implements PositionChartProvider {
  constructor(@Inject(POSITION_CHART_SOURCE) private readonly source: PositionChartProvider) {}
  getPositions(organizationId: string): Promise<PositionChart> { return this.source.getPositions(organizationId); }
}
