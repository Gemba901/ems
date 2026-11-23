import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import type { AccessTokenPayload } from 'src/auth/access-token-payload';
import type {
  ApprovedKpiAssignment,
  ExecutionProvider,
  PerformancePlanningProvider,
} from '../../common/contracts';
import {
  MonitoringQueryDto,
  MonitoringSettingsDto,
} from '../dto/monitoring-control.dto';
import { tenantTransaction } from 'src/prisma/tenant-transaction';
import { MONITORING_ORG_WIDE } from '../monitoring-control.roles';
import {
  MONITORING_EXECUTION_SOURCE,
  MONITORING_PLANNING_SOURCE,
} from '../monitoring-control.sources';
import { canSeeAssignment, loadActor } from '../monitoring-scope';
import { CALC_RULES } from '../calc/calc-rules';
import { buildAssignmentView, type AssignmentView } from './performance-view';

/** Last day of a YYYY-MM month as YYYY-MM-DD. */
const monthEnd = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

@Injectable()
export class PerformanceService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(MONITORING_PLANNING_SOURCE)
    private readonly planning: PerformancePlanningProvider,
    @Inject(MONITORING_EXECUTION_SOURCE)
    private readonly execution: ExecutionProvider,
  ) {}

  /** 05.02 list: one summary row per KPI assignment in the caller's scope. */
  async getOverview(user: AccessTokenPayload, q: MonitoringQueryDto) {
    const actor = await loadActor(this.prisma, user);
    const assignments = (
      await this.planning.listApprovedAssignments(user.organizationId)
    ).filter(
      (a) =>
        (!q.departmentId || a.departmentId === q.departmentId) &&
        (!q.assignmentId || a.id === q.assignmentId) &&
        canSeeAssignment(actor, a),
    );
    const views = await this.buildViews(
      user.organizationId,
      assignments,
      q.month ? monthEnd(q.month) : undefined,
    );
    // The list does not need every period; the detail endpoint has them.
    return views.map(({ periods, ...row }) => ({
      ...row,
      periodCount: periods.length,
    }));
  }

  /** Period-by-period table for one KPI. 404 also when it is outside the caller's scope. */
  async getAssignmentDetail(
    user: AccessTokenPayload,
    assignmentId: string,
  ): Promise<AssignmentView> {
    const actor = await loadActor(this.prisma, user);
    const a = (
      await this.planning.listApprovedAssignments(user.organizationId)
    ).find((x) => x.id === assignmentId);
    if (!a || !canSeeAssignment(actor, a))
      throw new NotFoundException('KPI not found');
    const [view] = await this.buildViews(user.organizationId, [a]);
    return view;
  }

  /** Shared with AlertsService so alerts use exactly the same rules as the screen. */
  async buildViews(
    organizationId: string,
    assignments: ApprovedKpiAssignment[],
    until?: string,
    now = new Date(),
  ): Promise<AssignmentView[]> {
    if (!assignments.length) return [];
    const ids = assignments.map((a) => a.id);
    const [official, pending, targets, tolerancePct] = await Promise.all([
      this.execution.listOfficial(organizationId, ids),
      this.execution.listSubmitted(organizationId, ids),
      Promise.all(
        assignments.map((a) =>
          this.planning.getPeriodTargets(organizationId, a.id, {
            documentId: a.documentId,
            version: a.planVersion,
          }),
        ),
      ),
      this.warningTolerancePct(organizationId),
    ]);

    return assignments.map((a, i) =>
      buildAssignmentView(
        a,
        targets[i],
        official.filter((o) => o.assignmentId === a.id),
        pending.filter((p) => p.assignmentId === a.id),
        now,
        until,
        tolerancePct,
      ),
    );
  }

  /** Settings screen: current band and whether the caller may change it. */
  async getSettings(user: AccessTokenPayload) {
    return {
      warningTolerancePct: await this.warningTolerancePct(user.organizationId),
      canEdit: MONITORING_ORG_WIDE.includes(user.roleLevel),
    };
  }

  async updateSettings(user: AccessTokenPayload, dto: MonitoringSettingsDto) {
    const organizationId = user.organizationId;
    const data = {
      warningTolerancePct: dto.warningTolerancePct,
      updatedById: user.userId,
    };
    await tenantTransaction(this.prisma, organizationId, (tx) =>
      tx.lexMonitoringSettings.upsert({
        where: { organizationId },
        create: { organizationId, ...data },
        update: data,
      }),
    );
    return this.getSettings(user);
  }

  /** The organisation's "needs attention" band (% of target); default until someone sets it. */
  async warningTolerancePct(organizationId: string): Promise<number> {
    const row = await this.prisma.lexMonitoringSettings.findUnique({
      where: { organizationId },
      select: { warningTolerancePct: true },
    });
    return row
      ? Number(row.warningTolerancePct)
      : CALC_RULES.defaultWarningTolerancePct;
  }
}
