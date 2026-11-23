import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from 'db';
import { PrismaService } from 'src/prisma/prisma.service';
import { tenantTransaction } from 'src/prisma/tenant-transaction';
import type { AccessTokenPayload } from 'src/auth/access-token-payload';
import { Role } from 'src/common/enum/role.enum';
import type {
  ApprovedKpiAssignment,
  ExecutionProvider,
  PerformancePlanningProvider,
} from '../../common/contracts';
import { AlertQueryDto, LinkFollowUpDto } from '../dto/monitoring-control.dto';
import {
  MONITORING_EXECUTION_SOURCE,
  MONITORING_PLANNING_SOURCE,
} from '../monitoring-control.sources';
import {
  isOrgWide,
  loadActor,
  type MonitoringActor,
} from '../monitoring-scope';
import { PerformanceService } from '../performance/performance.service';

type AlertKind = 'MISSING_RESULT' | 'VERIFIED_GAP' | 'OVERDUE_ACTION';
type AlertRow = Prisma.LexMonitoringAlertGetPayload<object>;

/** An issue that exists right now. sync() makes the alert table match this set. */
interface Condition {
  kind: AlertKind;
  title: string;
  detail: string;
  assignmentId: string | null;
  actionId: string | null;
  departmentId: string | null;
  ownerId: string;
}

const FINISHED_ACTIONS = ['VERIFIED', 'CANCELLED'];

@Injectable()
export class AlertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly performance: PerformanceService,
    @Inject(MONITORING_PLANNING_SOURCE)
    private readonly planning: PerformancePlanningProvider,
    @Inject(MONITORING_EXECUTION_SOURCE)
    private readonly execution: ExecutionProvider,
  ) {}

  /** What alerts should exist now, keyed one per issue. */
  async conditions(
    organizationId: string,
    assignments: ApprovedKpiAssignment[],
    now: Date,
  ): Promise<Map<string, Condition>> {
    const [views, actions] = await Promise.all([
      this.performance.buildViews(organizationId, assignments, undefined, now),
      this.execution.listActions(organizationId),
    ]);
    const out = new Map<string, Condition>();

    for (const v of views) {
      const base = {
        assignmentId: v.assignmentId,
        actionId: null,
        departmentId: v.departmentId,
        ownerId: v.ownerId,
      };
      const missing = v.periods.filter((p) => p.dataStatus === 'NOT_REPORTED');
      if (missing.length) {
        out.set(`missing|${v.assignmentId}`, {
          ...base,
          kind: 'MISSING_RESULT',
          title: `${v.code} · result not reported`,
          detail: `${missing.length} period(s) past the deadline with no result: ${missing.map((p) => p.end).join(', ')}`,
        });
      }
      const last = v.latestVerified;
      const st = last?.assessment?.status;
      if (last && (st === 'NEEDS_ATTENTION' || st === 'BELOW_TARGET')) {
        out.set(`gap|${v.assignmentId}`, {
          ...base,
          kind: 'VERIFIED_GAP',
          title: `${v.code} · ${st === 'BELOW_TARGET' ? 'below target' : 'needs attention'}`,
          detail: `Verified ${last.actual} ${v.unit} against target ${last.target} for the period ending ${last.end} (gap ${last.assessment!.gap}).`,
        });
      }
    }

    for (const a of actions) {
      if (FINISHED_ACTIONS.includes(a.status) || new Date(a.dueAt) >= now)
        continue;
      out.set(`action|${a.id}`, {
        kind: 'OVERDUE_ACTION',
        title: `Action overdue · ${a.title}`,
        detail: `Was due ${a.dueAt.slice(0, 10)}.`,
        assignmentId: a.assignmentId,
        actionId: a.id,
        departmentId: a.departmentId,
        ownerId: a.ownerId,
      });
    }
    return out;
  }

  /**
   * Reconcile LexMonitoringAlert with the current conditions:
   * new issue → OPENED; closed issue back → REOPENED; issue gone → CLOSED.
   * Returns the approved assignments it read (list() reuses them for scope).
   * Called from list() for now; move to a scheduled job when volumes grow.
   */
  async sync(
    organizationId: string,
    now = new Date(),
  ): Promise<ApprovedKpiAssignment[]> {
    const assignments =
      await this.planning.listApprovedAssignments(organizationId);
    const conds = await this.conditions(organizationId, assignments, now);

    await tenantTransaction(this.prisma, organizationId, async (tx) => {
      // Two requests syncing at once would otherwise both create the same alert.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`lex05-alerts:${organizationId}`}))`;
      const existing = await tx.lexMonitoringAlert.findMany({
        where: { organizationId },
      });
      const byKey = new Map(existing.map((a) => [a.key, a]));
      const log = (
        alertId: string,
        action: Prisma.LexMonitoringAlertEventCreateManyInput['action'],
        note?: string,
      ) =>
        tx.lexMonitoringAlertEvent.create({
          data: {
            alertId,
            organizationId,
            action,
            note: note ?? null,
            actorId: null,
          },
        });

      for (const [key, c] of conds) {
        const ex = byKey.get(key);
        if (!ex) {
          const created = await tx.lexMonitoringAlert.create({
            data: { organizationId, key, ...c },
          });
          await log(created.id, 'OPENED');
        } else if (ex.status === 'CLOSED') {
          await tx.lexMonitoringAlert.update({
            where: { id: ex.id },
            data: {
              ...c,
              status: 'OPEN',
              openedAt: now,
              closedAt: null,
              escalatedToId: null,
              linkedActionId: null,
              comment: null,
            },
          });
          await log(ex.id, 'REOPENED');
        } else if (
          ex.title !== c.title ||
          ex.detail !== c.detail ||
          ex.ownerId !== c.ownerId ||
          ex.departmentId !== c.departmentId
        ) {
          // Same issue, new numbers: refresh the text, keep status and history.
          await tx.lexMonitoringAlert.update({ where: { id: ex.id }, data: c });
        }
      }
      for (const ex of existing) {
        if (ex.status === 'CLOSED' || conds.has(ex.key)) continue;
        await tx.lexMonitoringAlert.update({
          where: { id: ex.id },
          data: { status: 'CLOSED', closedAt: now },
        });
        await log(ex.id, 'CLOSED', 'The condition is no longer present.');
      }
    });
    return assignments;
  }

  /** Alerts the caller may handle. Default: everything not closed. */
  async list(user: AccessTokenPayload, q: AlertQueryDto) {
    const orgId = user.organizationId;
    const assignments = await this.sync(orgId);
    const actor = await loadActor(this.prisma, user);
    const verifierOf = new Map(assignments.map((a) => [a.id, a.verifierId]));

    const status: Prisma.LexMonitoringAlertWhereInput['status'] =
      !q.status || q.status === 'ACTIVE'
        ? { not: 'CLOSED' }
        : (q.status as AlertRow['status']);
    const alerts = await this.prisma.lexMonitoringAlert.findMany({
      where: { organizationId: orgId, status },
      include: { events: { orderBy: { createdAt: 'asc' } } },
      orderBy: { openedAt: 'desc' },
    });
    return alerts.filter((a) =>
      this.canHandle(actor, a, verifierOf.get(a.assignmentId ?? '')),
    );
  }

  /** Records a note. Does NOT close the alert: a measured gap stays until the data changes. */
  async acknowledge(user: AccessTokenPayload, alertId: string, note: string) {
    const { actor, alert } = await this.loadForAction(user, alertId);
    return this.record(
      user.organizationId,
      alert,
      actor,
      'ACKNOWLEDGED',
      note,
      {
        status: alert.status === 'OPEN' ? 'ACKNOWLEDGED' : alert.status,
      },
    );
  }

  /** Sends the alert to the owner's reporting manager. In-app only for now. */
  async escalate(user: AccessTokenPayload, alertId: string, note: string) {
    const { actor, alert } = await this.loadForAction(user, alertId);
    if (alert.status === 'ESCALATED')
      throw new BadRequestException('This alert is already escalated.');
    const owner = await this.prisma.employee.findFirst({
      where: { id: alert.ownerId, organizationId: user.organizationId },
      select: { reportingManagerId: true },
    });
    const to = owner?.reportingManagerId;
    if (!to)
      throw new BadRequestException(
        'The owner has no reporting manager to escalate to.',
      );
    if (to === actor.employeeId) {
      throw new BadRequestException(
        'You are the owner’s reporting manager; link a follow-up action instead.',
      );
    }
    return this.record(user.organizationId, alert, actor, 'ESCALATED', note, {
      status: 'ESCALATED',
      escalatedToId: to,
    });
  }

  /** Links an existing follow-up / improvement action (Area 04). The alert stays open. */
  async linkFollowUp(
    user: AccessTokenPayload,
    alertId: string,
    dto: LinkFollowUpDto,
  ) {
    const { actor, alert } = await this.loadForAction(user, alertId);
    const action = await this.execution.getAction(
      user.organizationId,
      dto.actionId,
    );
    if (!action) throw new BadRequestException('Follow-up action not found.');
    if (action.status === 'CANCELLED')
      throw new BadRequestException(
        'A cancelled action cannot be the follow-up.',
      );
    return this.record(
      user.organizationId,
      alert,
      actor,
      'FOLLOW_UP_LINKED',
      dto.note,
      {
        status: 'FOLLOW_UP_LINKED',
        linkedActionId: action.id,
      },
    );
  }

  /** Owner, owner's reporting manager, department HOD, KPI verifier, escalated-to, org-wide roles. */
  canHandle(actor: MonitoringActor, a: AlertRow, verifierId?: string): boolean {
    if (isOrgWide(actor)) return true;
    if (
      actor.role === Role.HOD &&
      actor.departmentId &&
      a.departmentId === actor.departmentId
    )
      return true;
    const me = actor.employeeId;
    if (!me) return false;
    return (
      a.ownerId === me ||
      a.escalatedToId === me ||
      verifierId === me ||
      actor.reportIds.has(a.ownerId)
    );
  }

  /** Open Area 04 actions the caller could link as a follow-up (same scope rules as alerts). */
  async linkableActions(user: AccessTokenPayload) {
    const actor = await loadActor(this.prisma, user);
    const actions = await this.execution.listActions(user.organizationId);
    return actions.filter(
      (a) =>
        a.status !== 'CANCELLED' &&
        a.status !== 'VERIFIED' &&
        (isOrgWide(actor) ||
          (actor.role === Role.HOD &&
            !!actor.departmentId &&
            a.departmentId === actor.departmentId) ||
          a.ownerId === actor.employeeId ||
          actor.reportIds.has(a.ownerId)),
    );
  }

  // ── helpers ────────────────────────────────────────────

  private async loadForAction(user: AccessTokenPayload, alertId: string) {
    const actor = await loadActor(this.prisma, user);
    if (!actor.employeeId) {
      throw new ForbiddenException(
        'You need an employee record in this company to act on alerts.',
      );
    }
    const alert = await this.prisma.lexMonitoringAlert.findFirst({
      where: { id: alertId, organizationId: user.organizationId },
    });
    if (!alert) throw new NotFoundException('Alert not found');

    let allowed = this.canHandle(actor, alert);
    if (!allowed && alert.assignmentId) {
      const a = (
        await this.planning.listApprovedAssignments(user.organizationId)
      ).find((x) => x.id === alert.assignmentId);
      allowed = this.canHandle(actor, alert, a?.verifierId);
    }
    // 404, not 403: do not reveal alerts outside the caller's scope.
    if (!allowed) throw new NotFoundException('Alert not found');
    if (alert.status === 'CLOSED') {
      throw new BadRequestException(
        'This alert is closed; the condition is no longer present.',
      );
    }
    return { actor, alert };
  }

  private record(
    organizationId: string,
    alert: AlertRow,
    actor: MonitoringActor,
    action: 'ACKNOWLEDGED' | 'ESCALATED' | 'FOLLOW_UP_LINKED',
    note: string,
    data: Prisma.LexMonitoringAlertUpdateInput,
  ) {
    const text = note.trim();
    if (!text) throw new BadRequestException('Add a note.');
    return tenantTransaction(this.prisma, organizationId, async (tx) => {
      const updated = await tx.lexMonitoringAlert.update({
        where: { id: alert.id },
        data: { ...data, comment: text },
      });
      await tx.lexMonitoringAlertEvent.create({
        data: {
          alertId: alert.id,
          organizationId,
          action,
          note: text,
          actorId: actor.employeeId,
        },
      });
      return updated;
    });
  }
}
