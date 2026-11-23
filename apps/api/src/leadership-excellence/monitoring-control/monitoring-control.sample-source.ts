import { createHash } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import type {
  ApprovedGoal,
  ApprovedKpiAssignment,
  ExecutionProvider,
  FollowUpActionInput,
  KpiDefinitionSnapshot,
  PendingActionCheck,
  PerformancePlanningProvider,
  PeriodTarget,
  SubmittedResult,
  TrackedAction,
} from '../common/contracts';

/**
 * DEV ONLY. Sample Area 03 / 04 data so the Area 05 screens can be built and
 * clicked through before the Area 04 developer's endpoints exist.
 *
 * - Turned on with LEX05_SAMPLE_DATA=true; never used when NODE_ENV=production.
 * - Built from the company's real employees, so sign-in, scope and the
 *   "assigned verifier" rules behave exactly as they will with real data.
 * - Held in memory: restarting the API rebuilds it. Verified results stay
 *   verified (they live in Area 05's own table); returned ones come back.
 *
 * Delete this file once the real providers are bound in the module.
 */
export const sampleDataEnabled = () =>
  process.env.LEX05_SAMPLE_DATA === 'true' &&
  process.env.NODE_ENV !== 'production';

interface Template {
  name: string;
  unit: string;
  direction: KpiDefinitionSnapshot['direction'];
  calc: KpiDefinitionSnapshot['calc'];
  aggregation: KpiDefinitionSnapshot['aggregation'];
  inputA?: string;
  inputB?: string;
  baseline: number;
  final: number;
  upper?: number;
  tolerance: number;
}

const TEMPLATES: Template[] = [
  {
    name: 'Complaints resolved on time',
    unit: '%',
    direction: 'higher',
    calc: 'percent',
    aggregation: 'ratio',
    inputA: 'Resolved on time',
    inputB: 'Complaints received',
    baseline: 75,
    final: 92,
    tolerance: 3,
  },
  {
    name: 'Scrap rate',
    unit: '%',
    direction: 'lower',
    calc: 'percent',
    aggregation: 'ratio',
    inputA: 'Scrapped units',
    inputB: 'Units produced',
    baseline: 4.5,
    final: 2.5,
    tolerance: 0.3,
  },
  {
    name: 'Lost-time safety incidents',
    unit: 'incidents',
    direction: 'zero',
    calc: 'direct',
    aggregation: 'sum',
    baseline: 3,
    final: 0,
    tolerance: 0,
  },
  {
    name: 'Monthly output',
    unit: 'tonnes',
    direction: 'higher',
    calc: 'direct',
    aggregation: 'sum',
    baseline: 1000,
    final: 1250,
    tolerance: 40,
  },
  {
    name: 'Average furnace temperature',
    unit: '°C',
    direction: 'range',
    calc: 'direct',
    aggregation: 'average',
    baseline: 1540,
    final: 1550,
    upper: 1600,
    tolerance: 10,
  },
];

interface Person {
  id: string;
  departmentId: string | null;
  reportingManagerId: string | null;
  userId: string | null;
}

interface SampleState {
  assignments: ApprovedKpiAssignment[];
  targets: Map<string, PeriodTarget[]>;
  goals: ApprovedGoal[];
  submitted: SubmittedResult[];
  actions: Array<TrackedAction & Partial<PendingActionCheck>>;
  people: Map<string, Person>;
  /** (assignmentId|periodId) already official in Area 05's table. */
  done: Set<string>;
  /** Employees who already have their sample KPIs. */
  included: Set<string>;
}

/** How many sign-in employees get sample data up front; others are added when they open a screen. */
const UP_FRONT = 5;

/** Stable UUID from a seed, so ids survive an API restart. */
const sampleId = (...parts: string[]) => {
  const h = createHash('sha1').update(parts.join('|')).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

/** Deterministic 0..1 noise from a seed. */
const noise = (...parts: string[]) =>
  parseInt(
    createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 8),
    16,
  ) / 0xffffffff;

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const round = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;

/** Six ended months, the current month and two ahead. */
function monthlyTargets(t: Template, now: Date, seed: string): PeriodTarget[] {
  const out: PeriodTarget[] = [];
  const total = 9;
  for (let i = -6; i <= 2; i++) {
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1),
    );
    const end = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0),
    );
    const due = new Date(end);
    due.setUTCDate(due.getUTCDate() + 5);
    due.setUTCHours(17, 0, 0, 0);
    const step = (i + 6) / (total - 1);
    const value =
      t.direction === 'zero'
        ? 0
        : round(t.baseline + (t.final - t.baseline) * step);
    out.push({
      periodId: sampleId(seed, ymd(start)),
      start: ymd(start),
      end: ymd(end),
      scheduled: true,
      dueAt: due.toISOString(),
      value,
      upper: t.direction === 'range' ? (t.upper ?? null) : undefined,
    });
  }
  return out;
}

/** A plausible result near the target; some periods land below it. */
function sampleResult(t: Template, target: PeriodTarget, seed: string) {
  const r = noise(seed);
  const value = target.value ?? 0;
  if (t.direction === 'zero') {
    return { actual: r < 0.7 ? 0 : 1, inputA: null, inputB: null };
  }
  if (t.calc === 'percent') {
    const inputB = 200 + Math.floor(r * 300);
    const miss =
      t.direction === 'higher' ? 1 - (r - 0.4) * 0.15 : 1 + (r - 0.4) * 0.35;
    const inputA = Math.max(0, Math.round((value / 100) * miss * inputB));
    return { actual: (inputA / inputB) * 100, inputA, inputB };
  }
  if (t.direction === 'range') {
    return { actual: round(1530 + r * 80, 1), inputA: null, inputB: null };
  }
  return {
    actual: Math.round(value * (0.92 + r * 0.14)),
    inputA: null,
    inputB: null,
  };
}

@Injectable()
export class SampleMonitoringSource
  implements PerformancePlanningProvider, ExecutionProvider
{
  private readonly orgs = new Map<string, Promise<SampleState>>();

  constructor(private readonly prisma: PrismaService) {}

  private state(organizationId: string) {
    let s = this.orgs.get(organizationId);
    if (!s) {
      s = this.build(organizationId);
      this.orgs.set(organizationId, s);
      s.catch(() => this.orgs.delete(organizationId));
    }
    return s;
  }

  /** Called per request (dev only) so whoever is signed in has their own sample KPIs. */
  async include(organizationId: string, employeeId: string) {
    const s = await this.state(organizationId);
    const me = s.people.get(employeeId);
    if (me) this.addPerson(organizationId, s, me);
  }

  private async build(organizationId: string): Promise<SampleState> {
    const people: Person[] = await this.prisma.employee.findMany({
      where: {
        organizationId,
        employmentStatus: { in: ['ACTIVE', 'PROBATION'] },
      },
      select: {
        id: true,
        departmentId: true,
        reportingManagerId: true,
        userId: true,
      },
      orderBy: { id: 'asc' },
    });
    const official = await this.prisma.lexOfficialResult.findMany({
      where: { organizationId },
      select: { assignmentId: true, periodId: true },
    });

    const state: SampleState = {
      assignments: [],
      targets: new Map(),
      goals: [],
      submitted: [],
      actions: [],
      people: new Map(people.map((p) => [p.id, p])),
      done: new Set(official.map((o) => `${o.assignmentId}|${o.periodId}`)),
      included: new Set(),
    };

    // One goal per department, owned by its first employee.
    const deptOwner = new Map<string, string>();
    for (const p of people)
      if (p.departmentId && !deptOwner.has(p.departmentId))
        deptOwner.set(p.departmentId, p.id);
    for (const [departmentId, ownerId] of deptOwner) {
      state.goals.push({
        id: sampleId(organizationId, 'goal', departmentId),
        documentId: sampleId(organizationId, 'plan'),
        kind: 'GOAL',
        title: 'Deliver the department’s 2026 improvement targets',
        ownerId,
        departmentId,
        parentId: null,
      });
    }

    for (const me of people.filter((p) => p.userId).slice(0, UP_FRONT))
      this.addPerson(organizationId, state, me);
    return state;
  }

  /** Gives one employee a colleague's KPI to verify, a KPI of their own, and three actions. */
  private addPerson(organizationId: string, state: SampleState, me: Person) {
    if (state.included.has(me.id)) return;
    state.included.add(me.id);
    const now = new Date();
    const all = [...state.people.values()];
    const other =
      all.find(
        (p) =>
          p.id !== me.id &&
          !!p.departmentId &&
          p.departmentId === me.departmentId,
      ) ?? all.find((p) => p.id !== me.id && !!p.departmentId);
    if (!other) return;

    const addKpi = (
      role: string,
      owner: Person,
      provider: Person,
      verifier: Person,
    ) => {
      const seed = `${organizationId}|kpi|${me.id}|${role}`;
      const t = TEMPLATES[Math.floor(noise(seed, 'tpl') * TEMPLATES.length)];
      const departmentId = owner.departmentId ?? verifier.departmentId;
      if (!departmentId) return null;
      const id = sampleId(seed);
      const a: ApprovedKpiAssignment = {
        id,
        code: `KPI-${id.slice(0, 4).toUpperCase()}`,
        documentId: sampleId(organizationId, 'plan'),
        planVersion: 1,
        departmentId,
        goalId: sampleId(organizationId, 'goal', departmentId),
        definition: {
          name: t.name,
          unit: t.unit,
          direction: t.direction,
          calc: t.calc,
          aggregation: t.aggregation,
          inputA: t.inputA,
          inputB: t.inputB,
        },
        baseline: t.baseline,
        finalTarget: t.final,
        warningTolerance: t.tolerance,
        ownerId: owner.id,
        providerId: provider.id,
        verifierId: verifier.id,
      };
      const targets = monthlyTargets(t, now, seed);
      state.assignments.push(a);
      state.targets.set(a.id, targets);

      const ended = targets.filter((p) => ymd(now) > p.end);
      // About a third of KPIs leave their latest ended period unreported.
      const skipLatest = noise(seed, 'skip') < 0.34;
      ended.forEach((p, i) => {
        if (skipLatest && i === ended.length - 1) return;
        if (state.done.has(`${a.id}|${p.periodId}`)) return;
        const r = sampleResult(t, p, `${seed}|${p.periodId}`);
        state.submitted.push({
          id: sampleId(seed, 'result', p.periodId),
          assignmentId: a.id,
          periodId: p.periodId,
          ...r,
          // The oldest row of some KPIs has no evidence, to show a blocked row.
          evidence:
            i === 0 && noise(seed, 'evidence') < 0.5
              ? null
              : `Monthly report ${p.end.slice(0, 7)}`,
          note: null,
          correctionReason: null,
          submittedById: provider.id,
          submittedAt: new Date(new Date(p.dueAt).getTime() - 2 * 86_400_000),
          assignment: a,
          target: p,
        });
      });
      return a;
    };

    // I verify a colleague's KPI…
    addKpi('verify', other, other, me);
    // …and own one that my manager (or a colleague) verifies.
    const verifier =
      (me.reportingManagerId && state.people.get(me.reportingManagerId)) ||
      other;
    const mine = addKpi('own', me, me, verifier);

    const dept = me.departmentId;
    const action = (
      key: string,
      title: string,
      status: TrackedAction['status'],
      dueInDays: number,
    ) => {
      state.actions.push({
        id: sampleId(organizationId, 'action', me.id, key),
        title,
        ownerId: me.id,
        departmentId: dept,
        assignmentId: mine?.id ?? null,
        dueAt: new Date(now.getTime() + dueInDays * 86_400_000).toISOString(),
        status,
        documentId: sampleId(organizationId, 'plan'),
        goalId: dept ? sampleId(organizationId, 'goal', dept) : null,
        ownerNote:
          status === 'COMPLETED' ? 'Done; see the attached checklist.' : null,
        evidence: status === 'COMPLETED' ? 'Checklist signed off' : null,
        updatedById: me.id,
        updatedAt: now,
      });
    };
    action(
      'overdue',
      'Retrain shift leads on the new checklist',
      'IN_PROGRESS',
      -9,
    );
    action('open', 'Review supplier quality agreement', 'OPEN', 21);
    action('done', 'Fix recurring defect on line 2', 'COMPLETED', 3);
  }

  // ── PerformancePlanningProvider ──────────────────────
  async listApprovedAssignments(organizationId: string) {
    return (await this.state(organizationId)).assignments;
  }

  async getPeriodTargets(organizationId: string, assignmentId: string) {
    return (await this.state(organizationId)).targets.get(assignmentId) ?? [];
  }

  async listGoals(organizationId: string) {
    return (await this.state(organizationId)).goals;
  }

  // ── ExecutionProvider ────────────────────────────────
  async listSubmitted(organizationId: string, assignmentIds?: string[]) {
    const all = (await this.state(organizationId)).submitted;
    return assignmentIds
      ? all.filter((s) => assignmentIds.includes(s.assignmentId))
      : all;
  }

  async listActions(organizationId: string): Promise<TrackedAction[]> {
    return (await this.state(organizationId)).actions;
  }

  async getAction(organizationId: string, actionId: string) {
    return (
      (await this.state(organizationId)).actions.find(
        (a) => a.id === actionId,
      ) ?? null
    );
  }

  async listActionsPendingCheck(organizationId: string, checkerId: string) {
    return (await this.state(organizationId)).actions.filter(
      (a) => a.status === 'COMPLETED' && a.ownerId !== checkerId,
    ) as PendingActionCheck[];
  }

  async checkActionCompletion(
    organizationId: string,
    actionId: string,
    decision: { approve: boolean; note: string; checkerId: string },
  ) {
    const a = await this.getAction(organizationId, actionId);
    if (!a) throw new NotFoundException('Action not found');
    if (a.status !== 'COMPLETED')
      throw new BadRequestException('This action is not waiting for a check.');
    a.status = decision.approve ? 'VERIFIED' : 'IN_PROGRESS';
    return a;
  }

  async createFollowUpAction(
    organizationId: string,
    input: FollowUpActionInput,
    createdById: string,
  ) {
    const s = await this.state(organizationId);
    const goal = s.goals.find((g) => g.id === input.goalId);
    if (!goal) throw new BadRequestException('Goal not found');
    const action = {
      id: sampleId(
        organizationId,
        'follow-up',
        input.sourceAlertKey,
        String(s.actions.length),
      ),
      title: input.title,
      ownerId: input.ownerId,
      departmentId: goal.departmentId,
      assignmentId: null,
      dueAt: new Date(`${input.dueAt}T17:00:00.000Z`).toISOString(),
      status: 'OPEN' as const,
      documentId: goal.documentId,
      goalId: goal.id,
      ownerNote: null,
      evidence: input.evidence,
      updatedById: createdById,
      updatedAt: new Date(),
    };
    s.actions.push(action);
    return action;
  }

  async markVerified(_tx: unknown, organizationId: string, ids: string[]) {
    const s = await this.state(organizationId);
    s.submitted = s.submitted.filter((r) => !ids.includes(r.id));
  }

  async markReturned(_tx: unknown, organizationId: string, ids: string[]) {
    await this.markVerified(_tx, organizationId, ids);
  }
}
