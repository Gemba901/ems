import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import type { AccessTokenPayload } from 'src/auth/access-token-payload';
import { Role } from 'src/common/enum/role.enum';
import { PerformancePlanningService } from '../performance-planning/performance-planning.service';
import { ExecutionService } from '../execution/execution.service';
import {
  emptyExecutionState,
  projectExecution,
} from '../execution/execution.projection';
import type {
  ExecutionAction,
  ExecutionActionUpdate,
  ExecutionAssignment,
  ExecutionResult,
  ExecutionState,
  ExecutionView,
} from '../execution/execution.types';
import type { TargetPeriod } from '../performance-planning/planning.types';
import type {
  ActionFacts,
  ApprovedGoal,
  ApprovedKpiAssignment,
  DecisionOutcome,
  ExecutionProvider,
  KpiDefinitionSnapshot,
  OfficialValue,
  PendingActionCheck,
  PerformancePlanningProvider,
  PeriodTarget,
  ReviewablePlan,
  SubmittedResult,
  TrackedAction,
} from '../common/contracts';

/** End of a YYYY-MM-DD day, as an ISO instant. */
const endOfDay = (date: string) => `${date}T23:59:59.999Z`;
/** `${documentId}/${itemId}/v${n}` → itemId. */
const itemIdOf = (key: string | null) => key?.split('/')[1] ?? null;

const STATUS: Record<ExecutionActionUpdate['status'], TrackedAction['status']> =
  {
    NOT_STARTED: 'OPEN',
    IN_PROGRESS: 'IN_PROGRESS',
    BLOCKED: 'IN_PROGRESS',
    PENDING_CHECK: 'COMPLETED', // owner says done; waiting for the check
    COMPLETED: 'VERIFIED', // checked and accepted
  };

/**
 * Area 05's only door into Areas 03 and 04. Reads use one organisation-wide
 * projection of the Area 04 workspace (alerts and dashboards are org-wide and
 * Area 05 applies its own visibility rules). Changes go through Area 04's own
 * services as the signed-in user, so Area 04 keeps enforcing its permissions.
 *
 * TEMPORARY: the org-wide read rebuilds the projection with a management actor.
 * Replace it with an Area 04 org-level read method once one is exported.
 */
@Injectable()
export class MonitoringExecutionSource
  implements PerformancePlanningProvider, ExecutionProvider
{
  private readonly cache = new Map<
    string,
    { at: number; view: Promise<ExecutionView> }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly planning: PerformancePlanningService,
    private readonly execution: ExecutionService,
  ) {}

  // ── organisation view ───────────────────────────────────────────────────

  private orgView(organizationId: string): Promise<ExecutionView> {
    const hit = this.cache.get(organizationId);
    if (hit && Date.now() - hit.at < 2500) return hit.view;
    const view = this.buildOrgView(organizationId);
    this.cache.set(organizationId, { at: Date.now(), view });
    view.catch(() => this.cache.delete(organizationId));
    return view;
  }

  private forget(organizationId: string) {
    this.cache.delete(organizationId);
  }

  private async buildOrgView(organizationId: string): Promise<ExecutionView> {
    const reader: AccessTokenPayload = {
      tokenType: 'ACCESS',
      userId: '',
      organizationId,
      roleId: 0,
      roleLevel: Role.EMPLOYEE,
      email: '',
      isAdminOrg: false,
    } as AccessTokenPayload;
    try {
      const [source, stored] = await Promise.all([
        this.planning.getExecutionSource(reader),
        this.prisma.lexExecutionWorkspace.findUnique({
          where: { organizationId },
        }),
      ]);
      // Projection only: a management actor sees every approved plan. Never
      // used for a write.
      const actor = { ...source.actor, role: 'MANAGEMENT', employeeId: '' };
      return projectExecution(
        { ...source, actor },
        this.readState(stored?.state),
        stored?.revision || 0,
      );
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2021')
        throw new ServiceUnavailableException(
          'Performance execution storage is not installed. Apply the Area 04 database migration.',
        );
      throw error;
    }
  }

  private readState(value: unknown): ExecutionState {
    if (!value) return emptyExecutionState();
    const data = value as ExecutionState;
    if (
      data.schema !== 1 ||
      !Array.isArray(data.results) ||
      !Array.isArray(data.actionUpdates) ||
      !Array.isArray(data.supportRequests)
    )
      throw new ConflictException(
        'The execution data needs an updated application version.',
      );
    return data;
  }

  /** Area 04 records user ids; Area 05 works with employee ids. */
  private personOf(view: ExecutionView, userId: string) {
    return (
      view.references.people.find((p) => p.userId === userId)?.id ?? userId
    );
  }

  // ── Area 03 (approved plans) ────────────────────────────────────────────

  /** The row to report for each assignment: current version, else newest. */
  private chosenRows(view: ExecutionView) {
    const byAssignment = new Map<string, ExecutionAssignment>();
    for (const row of view.assignments) {
      const key = `${row.documentId}/${row.assignment.id}`;
      const prev = byAssignment.get(key);
      if (
        !prev ||
        (row.current && !prev.current) ||
        (row.current === prev.current && row.version > prev.version)
      )
        byAssignment.set(key, row);
    }
    return [...byAssignment.values()];
  }

  private definitionOf(row: ExecutionAssignment): KpiDefinitionSnapshot {
    const d = row.definition;
    return {
      name: d.name,
      unit: d.unit,
      // A milestone is scored as "reach the target", i.e. higher is better.
      direction:
        d.direction === 'MILESTONE'
          ? 'higher'
          : (d.direction.toLowerCase() as KpiDefinitionSnapshot['direction']),
      calc: d.formula.toLowerCase() as KpiDefinitionSnapshot['calc'],
      aggregation:
        d.aggregation.toLowerCase() as KpiDefinitionSnapshot['aggregation'],
      inputA: d.inputA || undefined,
      inputB: d.inputB || undefined,
    };
  }

  private toAssignment(
    view: ExecutionView,
    row: ExecutionAssignment,
  ): ApprovedKpiAssignment {
    const a = row.assignment;
    const goal = view.goals.find((g) => g.key === row.goalKey);
    const lastTarget = row.periods
      .filter((p) => p.scheduled !== false && p.target != null)
      .at(-1)?.target;
    return {
      id: a.id,
      code: a.code || row.definition.code,
      documentId: row.documentId,
      planVersion: row.version,
      departmentId: row.departmentId,
      goalId: itemIdOf(row.goalKey) ?? '',
      definition: this.definitionOf(row),
      baseline: a.baseline ?? null,
      finalTarget: a.target ?? lastTarget ?? null,
      warningTolerance: 0,
      ownerId: a.ownerId || goal?.item.ownerId || a.providerId,
      providerId: a.providerId,
      verifierId: a.verifierId,
    };
  }

  private toTarget(p: TargetPeriod): PeriodTarget {
    return {
      periodId: p.id,
      start: p.start,
      end: p.end,
      scheduled: p.scheduled !== false,
      dueAt: endOfDay(p.submissionDate ?? p.end),
      value: p.target ?? null,
      upper: p.upper ?? null,
    };
  }

  async listApprovedAssignments(
    organizationId: string,
  ): Promise<ApprovedKpiAssignment[]> {
    const view = await this.orgView(organizationId);
    return this.chosenRows(view).map((row) => this.toAssignment(view, row));
  }

  async getPeriodTargets(
    organizationId: string,
    assignmentId: string,
    ref: { documentId: string; version: number },
  ): Promise<PeriodTarget[]> {
    const view = await this.orgView(organizationId);
    const row =
      view.assignments.find(
        (r) =>
          r.assignment.id === assignmentId &&
          r.documentId === ref.documentId &&
          r.version === ref.version,
      ) ?? this.chosenRows(view).find((r) => r.assignment.id === assignmentId);
    return row ? row.periods.map((p) => this.toTarget(p)) : [];
  }

  async listGoals(organizationId: string): Promise<ApprovedGoal[]> {
    const view = await this.orgView(organizationId);
    const goals = new Map<string, ApprovedGoal>();
    for (const g of view.goals) {
      const key = `${g.documentId}/${g.item.id}`;
      if (goals.has(key) && !g.current) continue;
      goals.set(key, {
        id: g.item.id,
        documentId: g.documentId,
        kind: g.itemKind,
        title: g.item.title,
        ownerId: g.item.ownerId,
        departmentId: g.departmentId || null,
        parentId: itemIdOf(g.parentKey),
      });
    }
    return [...goals.values()];
  }

  // ── Area 04 (results) ───────────────────────────────────────────────────

  private rowOf(view: ExecutionView, result: ExecutionResult) {
    return view.assignments.find((r) => r.key === result.assignmentKey);
  }

  private periodOf(row: ExecutionAssignment, result: ExecutionResult) {
    const period = row.periods.find((p) => p.id === result.periodId);
    const [start, end] = result.periodId.split('/');
    return period
      ? this.toTarget(period)
      : {
          periodId: result.periodId,
          start: result.periodStart ?? start,
          end: result.periodEnd ?? end,
          scheduled: true,
          dueAt: endOfDay(result.periodEnd ?? end),
          value: null,
          upper: null,
        };
  }

  async listSubmitted(
    organizationId: string,
    assignmentIds?: string[],
  ): Promise<SubmittedResult[]> {
    const view = await this.orgView(organizationId);
    const wanted = assignmentIds && new Set(assignmentIds);
    return view.results.flatMap((r) => {
      if (r.status !== 'SUBMITTED' || r.actual == null) return [];
      const row = this.rowOf(view, r);
      if (!row || (wanted && !wanted.has(row.assignment.id))) return [];
      return [
        {
          id: r.id,
          assignmentId: row.assignment.id,
          periodId: r.periodId,
          actual: r.actual,
          inputA: r.inputA,
          inputB: r.inputB,
          evidence: r.evidence || null,
          note: r.note || null,
          correctionReason: r.official ? r.note || null : null,
          submittedById: this.personOf(view, r.updatedBy),
          submittedAt: new Date(r.submittedAt ?? r.updatedAt),
          assignment: this.toAssignment(view, row),
          target: this.periodOf(row, r),
        },
      ];
    });
  }

  async listOfficial(
    organizationId: string,
    assignmentIds?: string[],
  ): Promise<OfficialValue[]> {
    const view = await this.orgView(organizationId);
    const wanted = assignmentIds && new Set(assignmentIds);
    return view.results.flatMap((r) => {
      if (!r.official) return [];
      const row = this.rowOf(view, r);
      if (!row || (wanted && !wanted.has(row.assignment.id))) return [];
      const target = this.periodOf(row, r);
      return [
        {
          submissionId: r.id,
          assignmentId: row.assignment.id,
          periodId: r.periodId,
          periodStart: target.start,
          periodEnd: target.end,
          actual: r.official.actual,
          inputA: r.official.inputA,
          inputB: r.official.inputB,
          evidence: r.evidence || null,
          target,
          verifiedById: this.personOf(view, r.official.verifiedBy),
          verifiedAt: new Date(r.official.verifiedAt),
          revision: Math.max(
            1,
            r.history.filter((h) => h.event === 'Verified').length,
          ),
        },
      ];
    });
  }

  async decide(
    user: AccessTokenPayload,
    submissionIds: string[],
    decision: 'VERIFY' | 'RETURN',
    note: string,
  ): Promise<DecisionOutcome> {
    const done: string[] = [];
    let failed: DecisionOutcome['failed'] = null;
    try {
      // Area 04 changes one result per call; each call bumps the revision.
      let revision = (await this.execution.getWorkspace(user)).revision;
      for (const id of submissionIds) {
        try {
          revision = (
            await this.execution.verify(user, revision, id, decision, note)
          ).revision;
          done.push(id);
        } catch (error) {
          failed = {
            id,
            message:
              error instanceof Error ? error.message : 'Could not be saved.',
          };
          break;
        }
      }
    } finally {
      this.forget(user.organizationId);
    }
    return { done, failed };
  }

  // ── Area 04 (actions) ───────────────────────────────────────────────────

  private toAction(
    a: ExecutionAction,
    update: ExecutionActionUpdate | undefined,
  ): TrackedAction {
    return {
      id: a.action.id,
      title: a.action.title,
      ownerId: a.action.ownerId,
      departmentId: a.departmentId || null,
      assignmentId: null,
      dueAt: endOfDay(a.action.dueDate),
      status: STATUS[update?.status ?? 'NOT_STARTED'],
      documentId: a.documentId,
    };
  }

  private updateOf(view: ExecutionView, a: ExecutionAction) {
    return view.actionUpdates.find((u) => u.actionKey === a.key);
  }

  async listActions(organizationId: string): Promise<TrackedAction[]> {
    const view = await this.orgView(organizationId);
    return view.actions.map((a) => this.toAction(a, this.updateOf(view, a)));
  }

  async getAction(
    organizationId: string,
    actionId: string,
    documentId?: string,
  ): Promise<TrackedAction | null> {
    const view = await this.orgView(organizationId);
    const a = view.actions.find(
      (x) =>
        x.action.id === actionId &&
        (!documentId || x.documentId === documentId),
    );
    return a ? this.toAction(a, this.updateOf(view, a)) : null;
  }

  async listActionsPendingCheck(
    user: AccessTokenPayload,
  ): Promise<PendingActionCheck[]> {
    // The user's own view says which actions they may check (canCheck).
    const view = await this.execution.getWorkspace(user);
    return view.actions.flatMap((a) => {
      const update = this.updateOf(view, a);
      if (!a.canCheck || update?.status !== 'PENDING_CHECK') return [];
      return [
        {
          ...this.toAction(a, update),
          goalId: itemIdOf(a.goalKey),
          ownerNote: update.note || null,
          evidence: update.evidence || null,
          updatedById: this.personOf(view, update.updatedBy),
          updatedAt: new Date(update.updatedAt),
        },
      ];
    });
  }

  async checkActionCompletion(
    user: AccessTokenPayload,
    actionId: string,
    decision: { approve: boolean; note: string },
  ): Promise<TrackedAction> {
    const view = await this.execution.getWorkspace(user);
    const a = view.actions.find((x) => x.action.id === actionId);
    if (!a) throw new NotFoundException('Action not found.');
    if (!decision.approve && !decision.note.trim())
      throw new BadRequestException('Explain what still needs to be done.');
    try {
      const next = await this.execution.command(user, {
        expectedRevision: view.revision,
        action: 'CHECK_ACTION',
        payload: {
          actionKey: a.key,
          decision: decision.approve ? 'COMPLETE' : 'RETURN',
          note: decision.note,
        },
      });
      const updated = next.actions.find((x) => x.key === a.key) ?? a;
      return this.toAction(updated, this.updateOf(next, updated));
    } finally {
      this.forget(user.organizationId);
    }
  }

  // ── Area 06 (reviews read plans and action facts) ───────────────────────

  /** Current approved department and individual plans, with their goals and KPIs. */
  async listReviewablePlans(organizationId: string): Promise<ReviewablePlan[]> {
    const view = await this.orgView(organizationId);
    const plans = new Map<string, ReviewablePlan>();
    for (const g of view.goals) {
      if (!g.current || (g.kind !== 'DEPARTMENT' && g.kind !== 'INDIVIDUAL'))
        continue;
      let plan = plans.get(g.documentId);
      if (!plan) {
        plan = {
          documentId: g.documentId,
          version: g.version,
          kind: g.kind,
          cycle: g.cycle,
          title: g.planTitle,
          departmentId: g.departmentId || null,
          scopeId: g.scopeId,
          goals: [],
          assignments: [],
        };
        plans.set(g.documentId, plan);
      }
      plan.goals.push({
        id: g.item.id,
        code: g.item.code,
        title: g.item.title,
        ownerId: g.item.ownerId,
        kind: g.itemKind,
      });
    }
    for (const row of view.assignments) {
      const plan = plans.get(row.documentId);
      if (!plan || !row.current) continue;
      const a = row.assignment;
      const goal = view.goals.find((g) => g.key === row.goalKey);
      plan.assignments.push({
        id: a.id,
        code: a.code || row.definition.code,
        name: row.definition.name,
        unit: row.definition.unit,
        ownerId: a.ownerId || goal?.item.ownerId || a.providerId,
        reviewFrequency: String(a.reviewFrequency || ''),
      });
    }
    return [...plans.values()];
  }

  /** Every Area 04 action (current plan version) with its check details. */
  async listActionFacts(organizationId: string): Promise<ActionFacts[]> {
    const view = await this.orgView(organizationId);
    return view.actions.map((a) => {
      const update = this.updateOf(view, a);
      const tracked = this.toAction(a, update);
      const goal = view.goals.find((g) => g.key === a.goalKey);
      const check =
        tracked.status === 'VERIFIED'
          ? update?.history.filter((h) => h.event === 'COMPLETED').at(-1)
          : undefined;
      return {
        ...tracked,
        goalId: itemIdOf(a.goalKey),
        goalTitle: a.goalTitle,
        goalOwnerId: goal?.item.ownerId ?? null,
        expectedResult: a.action.expectedResult || '',
        evidence: update?.evidence || null,
        checkedById: check ? this.personOf(view, check.by) : null,
        checkedAt: check?.at ?? null,
      };
    });
  }

  /** Not offered by Area 04 yet; the screen links an existing action instead. */
  createFollowUpAction(): Promise<TrackedAction> {
    return Promise.reject(
      new ServiceUnavailableException(
        'Creating follow-up actions from an alert is not available from Area 04 yet. Add the action to the department plan, then link it here.',
      ),
    );
  }
}
