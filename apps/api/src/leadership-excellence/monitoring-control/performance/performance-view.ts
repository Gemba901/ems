import type {
  ApprovedKpiAssignment,
  PeriodTarget,
  SubmittedResult,
} from '../../common/contracts';
import {
  achievementPct,
  assess,
  improvementProgressPct,
  summarise,
  toleranceFor,
  variance,
  type Assessment,
  type DataStatus,
  type PeriodPoint,
} from '../calc/performance-calc';

/** A LexOfficialResult row after Decimal → number conversion. */
export interface OfficialRow {
  periodId: string;
  actual: number;
  inputA: number | null;
  inputB: number | null;
  evidence: string | null;
  /** Target as approved when the result was submitted (from the snapshot). */
  target: PeriodTarget;
  revision: number;
  verifiedById: string;
  verifiedAt: Date;
}

export interface PeriodRow {
  periodId: string;
  start: string;
  end: string;
  dueAt: string;
  dataStatus: DataStatus;
  target: number | null;
  upper: number | null;
  /** Official (verified) value only. Pending submissions never appear here. */
  actual: number | null;
  inputA: number | null;
  inputB: number | null;
  evidence: string | null;
  revision: number | null;
  verifiedAt: Date | null;
  /** A correction is waiting; the value above stays official until it is verified. */
  correctionPending: boolean;
  /** Only for verified periods. */
  assessment: Assessment | null;
}

export interface AssignmentView {
  assignmentId: string;
  code: string;
  name: string;
  unit: string;
  direction: ApprovedKpiAssignment['definition']['direction'];
  departmentId: string;
  ownerId: string;
  verifierId: string;
  periods: PeriodRow[];
  completeness: { due: number; verified: number; pending: number };
  summary: {
    actual: number | null;
    target: number | null;
    incomplete: boolean;
  };
  /** All null while the summary is incomplete: no gap or judgement on partial data. */
  assessment: Assessment | null;
  achievementPct: number | null;
  improvementProgressPct: number | null;
  variance: { value: number; favourable: boolean | null } | null;
  latestVerified: PeriodRow | null;
}

const EXPECTED: DataStatus[] = [
  'VERIFIED',
  'PENDING_VERIFICATION',
  'NOT_REPORTED',
];

function dataStatus(
  t: PeriodTarget,
  official: boolean,
  pending: boolean,
  now: Date,
): DataStatus {
  if (!t.scheduled) return 'NOT_SCHEDULED';
  if (official) return 'VERIFIED';
  if (pending) return 'PENDING_VERIFICATION';
  if (now < new Date(t.dueAt)) return 'NOT_YET_DUE';
  return 'NOT_REPORTED';
}

/**
 * One KPI assignment's periods and summary.
 * `until` (YYYY-MM-DD, inclusive) limits the view to periods ending on or before it.
 * `tolerancePct` is the organisation's "needs attention" band, used when the KPI has none.
 */
export function buildAssignmentView(
  a: ApprovedKpiAssignment,
  targets: PeriodTarget[],
  officials: OfficialRow[],
  pending: SubmittedResult[],
  now: Date,
  until?: string,
  tolerancePct = 0,
): AssignmentView {
  const officialBy = new Map(officials.map((o) => [o.periodId, o]));
  const pendingPeriods = new Set(pending.map((p) => p.periodId));
  const dir = a.definition.direction;

  const periods: PeriodRow[] = targets
    .filter((t) => !until || t.end <= until)
    .sort((x, y) => x.start.localeCompare(y.start))
    .map((t) => {
      const o = officialBy.get(t.periodId);
      const status = dataStatus(t, !!o, pendingPeriods.has(t.periodId), now);
      const target = o ? o.target : t;
      return {
        periodId: t.periodId,
        start: t.start,
        end: t.end,
        dueAt: t.dueAt,
        dataStatus: status,
        target: target.value,
        upper: target.upper ?? null,
        actual: o?.actual ?? null,
        inputA: o?.inputA ?? null,
        inputB: o?.inputB ?? null,
        evidence: o?.evidence ?? null,
        revision: o?.revision ?? null,
        verifiedAt: o?.verifiedAt ?? null,
        correctionPending: !!o && pendingPeriods.has(t.periodId),
        assessment: o
          ? assess(
              o.actual,
              { value: target.value, upper: target.upper },
              dir,
              toleranceFor(a.warningTolerance, target.value, tolerancePct),
            )
          : null,
      };
    });

  const points: PeriodPoint[] = periods.map((p) => ({
    periodEnd: p.end,
    due: EXPECTED.includes(p.dataStatus),
    verified: p.dataStatus === 'VERIFIED',
    actual: p.actual,
    target: p.target,
    inputA: p.inputA,
    inputB: p.inputB,
  }));
  const summary = summarise(
    points,
    a.definition.aggregation,
    a.definition.calc === 'percent' ? 100 : 1,
  );
  const verifiedRows = periods.filter((p) => p.dataStatus === 'VERIFIED');
  const latestVerified = verifiedRows.at(-1) ?? null;

  const judge = !summary.incomplete && summary.actual !== null;
  return {
    assignmentId: a.id,
    code: a.code,
    name: a.definition.name,
    unit: a.definition.unit,
    direction: dir,
    departmentId: a.departmentId,
    ownerId: a.ownerId,
    verifierId: a.verifierId,
    periods,
    completeness: {
      due: summary.due,
      verified: summary.verified,
      pending: periods.filter((p) => p.dataStatus === 'PENDING_VERIFICATION')
        .length,
    },
    summary: {
      actual: summary.actual,
      target: summary.target,
      incomplete: summary.incomplete,
    },
    assessment: judge
      ? assess(
          summary.actual,
          { value: summary.target, upper: latestVerified?.upper },
          dir,
          toleranceFor(a.warningTolerance, summary.target, tolerancePct),
        )
      : null,
    achievementPct: judge
      ? achievementPct(summary.actual, summary.target, dir)
      : null,
    improvementProgressPct: judge
      ? improvementProgressPct(a.baseline, a.finalTarget, summary.actual, dir)
      : null,
    variance: judge ? variance(summary.actual, summary.target, dir) : null,
    latestVerified,
  };
}
