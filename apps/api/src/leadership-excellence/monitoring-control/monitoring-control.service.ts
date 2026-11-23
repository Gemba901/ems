import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import type {
  MonitoringProvider,
  OfficialResult,
  PeriodTarget,
} from '../common/contracts';
import { ymd } from './monitoring-scope';

/** What Areas 06 and 07 inject. Only verified (official) results leave Area 05. */
@Injectable()
export class MonitoringControlService implements MonitoringProvider {
  constructor(private readonly prisma: PrismaService) {}

  async getOfficialResults(
    organizationId: string,
    assignmentId: string,
  ): Promise<OfficialResult[]> {
    const rows = await this.prisma.lexOfficialResult.findMany({
      where: { organizationId, assignmentId },
      orderBy: { periodStart: 'asc' },
    });
    return rows.map((r) => ({
      assignmentId: r.assignmentId,
      periodId: r.periodId,
      periodStart: ymd(r.periodStart),
      periodEnd: ymd(r.periodEnd),
      actual: Number(r.actual),
      target: (r.snapshot as unknown as { target: PeriodTarget }).target,
      verifiedById: r.verifiedById,
      verifiedAt: r.verifiedAt,
      revision: r.revision,
    }));
  }
}
