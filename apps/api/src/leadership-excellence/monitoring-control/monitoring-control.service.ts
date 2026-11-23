import { Inject, Injectable } from '@nestjs/common';
import type {
  ExecutionProvider,
  MonitoringProvider,
  OfficialResult,
} from '../common/contracts';
import { MONITORING_EXECUTION_SOURCE } from './monitoring-control.sources';

/**
 * What Areas 06 and 07 inject. Only verified (official) results leave Area 05.
 * Area 04 stores the official values; this passes them on unchanged.
 */
@Injectable()
export class MonitoringControlService implements MonitoringProvider {
  constructor(
    @Inject(MONITORING_EXECUTION_SOURCE)
    private readonly execution: ExecutionProvider,
  ) {}

  async getOfficialResults(
    organizationId: string,
    assignmentId: string,
  ): Promise<OfficialResult[]> {
    const rows = await this.execution.listOfficial(organizationId, [
      assignmentId,
    ]);
    return rows
      .sort((a, b) => a.periodStart.localeCompare(b.periodStart))
      .map((r) => ({
        assignmentId: r.assignmentId,
        periodId: r.periodId,
        periodStart: r.periodStart,
        periodEnd: r.periodEnd,
        actual: r.actual,
        target: r.target,
        verifiedById: r.verifiedById,
        verifiedAt: r.verifiedAt,
        revision: r.revision,
      }));
  }
}
