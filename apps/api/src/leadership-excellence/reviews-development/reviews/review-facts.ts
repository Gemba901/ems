import type {
  ActionFacts,
  OfficialValue,
  PeriodTarget,
  ReviewablePlan,
} from '../../common/contracts';
import type { People } from '../development-scope';

/** Who a plan's review is about, and who reviews it. */
export function planOwners(plan: ReviewablePlan, people: People) {
  if (plan.kind === 'INDIVIDUAL') {
    const subjectId = plan.scopeId;
    return {
      type: 'PERSONAL' as const,
      subjectId,
      // The employee's reporting manager in core records.
      reviewerId: people.get(subjectId)?.managerId ?? null,
      departmentId:
        plan.departmentId ?? people.get(subjectId)?.departmentId ?? null,
    };
  }
  // Department plan: the first goal owner who is still active (else a KPI owner)
  // reflects on and reviews the department's results.
  const subjectId =
    plan.goals.find((g) => people.get(g.ownerId)?.active)?.ownerId ??
    plan.assignments[0]?.ownerId ??
    null;
  return {
    type: 'DEPARTMENT' as const,
    subjectId,
    reviewerId: subjectId,
    departmentId: plan.departmentId ?? plan.scopeId,
  };
}

export interface MeasureRecord {
  periodId: string;
  start: string;
  end: string;
  scheduled: boolean;
  target: number | null;
  upper: number | null;
  actual: number | null;
  verifiedAt: string | null;
  verifiedById: string | null;
  revision: number | null;
  status: 'NOT_SCHEDULED' | 'VERIFIED' | 'NOT_YET_DUE' | 'MISSING';
}

export interface ReviewSnapshot {
  /** When the facts were read; ignored when comparing. */
  at: string;
  planDocumentId: string;
  planVersion: number;
  planTitle: string;
  period: { start: string; end: string };
  goals: ReviewablePlan['goals'];
  measures: {
    id: string;
    code: string;
    name: string;
    unit: string;
    ownerId: string;
    records: MeasureRecord[];
    verified: number;
    scheduled: number;
    /** Every scheduled period in the review is verified and none crosses its boundary. */
    complete: boolean;
    /** A KPI period starts before the review period: results are not split. */
    crossing: boolean;
  }[];
  actions: {
    id: string;
    title: string;
    ownerId: string;
    dueAt: string;
    status: ActionFacts['status'];
    evidence: string | null;
  }[];
  complete: boolean;
}

/**
 * The review's facts: verified results only (no score is calculated), the
 * plan's goals and its actions. Built from the approved plan version.
 */
export function buildSnapshot(input: {
  plan: ReviewablePlan;
  start: string;
  end: string;
  asOf: string;
  subjectId: string;
  targets: Map<string, PeriodTarget[]>;
  official: OfficialValue[];
  actions: ActionFacts[];
}): ReviewSnapshot {
  const { plan, start, end, asOf } = input;
  const measures = plan.assignments.map((a) => {
    const periods = (input.targets.get(a.id) ?? []).filter(
      (p) => p.end >= start && p.end <= end,
    );
    const records: MeasureRecord[] = periods.map((p) => {
      const o = input.official.find(
        (v) => v.assignmentId === a.id && v.periodId === p.periodId,
      );
      return {
        periodId: p.periodId,
        start: p.start,
        end: p.end,
        scheduled: p.scheduled,
        target: p.value,
        upper: p.upper ?? null,
        actual: o?.actual ?? null,
        verifiedAt: o ? new Date(o.verifiedAt).toISOString() : null,
        verifiedById: o?.verifiedById ?? null,
        revision: o?.revision ?? null,
        status: !p.scheduled
          ? 'NOT_SCHEDULED'
          : o
            ? 'VERIFIED'
            : p.end > asOf
              ? 'NOT_YET_DUE'
              : 'MISSING',
      };
    });
    const scheduled = records.filter((r) => r.scheduled);
    const verified = scheduled.filter((r) => r.status === 'VERIFIED').length;
    const crossing = periods.some((p) => p.start < start);
    return {
      id: a.id,
      code: a.code,
      name: a.name,
      unit: a.unit,
      ownerId: a.ownerId,
      records,
      verified,
      scheduled: scheduled.length,
      complete: !crossing && verified === scheduled.length,
      crossing,
    };
  });
  const actions = input.actions
    .filter(
      (a) =>
        a.status !== 'CANCELLED' &&
        (a.documentId === plan.documentId ||
          (plan.kind === 'INDIVIDUAL' && a.ownerId === input.subjectId)),
    )
    .map((a) => ({
      id: a.id,
      title: a.title,
      ownerId: a.ownerId,
      dueAt: a.dueAt,
      status: a.status,
      evidence: a.evidence,
    }))
    .sort((x, y) => x.id.localeCompare(y.id));
  return {
    at: new Date().toISOString(),
    planDocumentId: plan.documentId,
    planVersion: plan.version,
    planTitle: plan.title,
    period: { start, end },
    goals: plan.goals,
    measures,
    actions,
    complete: measures.every((m) => m.complete),
  };
}

/** Compare two snapshots, ignoring when they were read. */
export function fingerprint(snapshot: unknown): string {
  if (!snapshot || typeof snapshot !== 'object') return '';
  const rest: Record<string, unknown> = { ...snapshot };
  delete rest.at;
  return JSON.stringify(rest);
}
