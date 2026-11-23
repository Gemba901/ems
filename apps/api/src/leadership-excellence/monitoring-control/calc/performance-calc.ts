import { CALC_RULES } from './calc-rules';
import type { KpiAggregation, KpiDirection } from '../../common/contracts';

export type PerformanceStatus =
  | 'ON_TARGET'
  | 'NEEDS_ATTENTION'
  | 'BELOW_TARGET'
  | 'NOT_MEASURED'
  | 'TARGET_INCOMPLETE';

/** Data status is separate from performance; missing data is never zero. */
export type DataStatus =
  | 'NOT_SCHEDULED'
  | 'NOT_YET_DUE'
  | 'NOT_REPORTED'
  | 'PENDING_VERIFICATION'
  | 'VERIFIED';

export interface Target {
  value: number | null;
  upper?: number | null;
}

export interface Assessment {
  status: PerformanceStatus;
  /** actual − target (range: distance outside the band). null when not measurable. */
  gap: number | null;
}

const finite = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n);
const epsFor = (...xs: number[]) => 1e-9 * Math.max(1, ...xs.map(Math.abs));

export function assess(
  actual: number | null,
  target: Target | null,
  direction: KpiDirection,
  warningTolerance = 0,
): Assessment {
  if (!finite(actual) || !target || !finite(target.value)) {
    return { status: 'NOT_MEASURED', gap: null };
  }
  const v = target.value;
  const tol = Math.max(0, warningTolerance);
  let met: boolean;
  let gap: number;

  if (direction === 'range') {
    const upper = target.upper;
    if (!finite(upper) || upper < v)
      return { status: 'TARGET_INCOMPLETE', gap: null };
    const eps = epsFor(actual, v, upper);
    met = actual >= v - eps && actual <= upper + eps;
    gap = met ? 0 : actual < v ? actual - v : actual - upper;
  } else {
    const eps = epsFor(actual, v);
    met = direction === 'higher' ? actual >= v - eps : actual <= v + eps;
    gap = actual - v;
  }

  const eps = epsFor(actual, v);
  if (Math.abs(gap) < eps) gap = 0;
  if (met) return { status: 'ON_TARGET', gap };
  if (direction !== 'zero' && tol > 0 && Math.abs(gap) <= tol + eps) {
    return { status: 'NEEDS_ATTENTION', gap };
  }
  return { status: 'BELOW_TARGET', gap };
}

/** PDF Part 5.2. null = not calculable under the approved rules. */
export function achievementPct(
  actual: number | null,
  target: number | null,
  direction: KpiDirection,
): number | null {
  if (!finite(actual) || !finite(target)) return null;
  if (direction === 'range' || direction === 'zero') return null; // no rule defined yet

  let pct: number;
  if (direction === 'higher') {
    if (target === 0) return null;
    pct = (actual / target) * 100;
  } else {
    if (actual === 0) return CALC_RULES.lowerIsBetterZeroActual;
    pct = (target / actual) * 100;
  }
  const cap = CALC_RULES.achievementCap;
  return cap === null ? pct : Math.min(pct, cap);
}

/** PDF Part 5.3: share of the planned baseline → final-target improvement achieved. */
export function improvementProgressPct(
  baseline: number | null,
  finalTarget: number | null,
  actual: number | null,
  direction: KpiDirection,
): number | null {
  if (!finite(baseline) || !finite(finalTarget) || !finite(actual)) return null;
  if (direction !== 'higher' && direction !== 'lower') return null;

  const span =
    direction === 'higher' ? finalTarget - baseline : baseline - finalTarget;
  if (Math.abs(span) < epsFor(baseline, finalTarget)) return null; // baseline == target
  const moved = direction === 'higher' ? actual - baseline : baseline - actual;
  const pct = (moved / span) * 100;
  return CALC_RULES.allowNegativeProgress ? pct : Math.max(0, pct);
}

/** PDF Part 5.4: signed difference plus whether it is favourable for this direction. */
export function variance(
  actual: number | null,
  target: number | null,
  direction: KpiDirection,
): { value: number; favourable: boolean | null } | null {
  if (!finite(actual) || !finite(target)) return null;
  const value = actual - target;
  if (direction === 'range') return { value, favourable: null };
  return {
    value,
    favourable: direction === 'higher' ? value >= 0 : value <= 0,
  };
}

export interface PeriodPoint {
  periodEnd: string; // YYYY-MM-DD, used for 'closing' / 'milestone'
  due: boolean; // scheduled and ended
  verified: boolean;
  actual: number | null;
  target: number | null;
  inputA?: number | null;
  inputB?: number | null;
}

export interface PeriodSummary {
  actual: number | null;
  target: number | null;
  due: number;
  verified: number;
  /** True when some due periods are unverified; callers must not show a gap or judgement. */
  incomplete: boolean;
}

/**
 * Year-to-date / multi-period summary (PDF Part 5.1, Rule 4).
 * Never adds rate targets; recalculates ratios from combined inputs.
 * Percent KPIs: pass multiplier = 100.
 */
export function summarise(
  points: PeriodPoint[],
  aggregation: KpiAggregation,
  multiplier = 1,
): PeriodSummary {
  const due = points.filter((p) => p.due);
  const ok = due.filter((p) => p.verified && finite(p.actual));
  const base = {
    due: due.length,
    verified: ok.length,
    incomplete: ok.length < due.length,
  };
  if (!ok.length) return { ...base, actual: null, target: null };

  const sum = (xs: (number | null | undefined)[]) =>
    xs.reduce<number>((s, x) => s + (finite(x) ? x : 0), 0);
  const latest = ok
    .slice()
    .sort((a, b) => a.periodEnd.localeCompare(b.periodEnd))
    .at(-1)!;

  switch (aggregation) {
    case 'sum':
      return {
        ...base,
        actual: sum(ok.map((p) => p.actual)),
        target: sum(ok.map((p) => p.target)),
      };
    case 'ratio': {
      const b = sum(ok.map((p) => p.inputB));
      return {
        ...base,
        actual:
          b === 0 ? null : (sum(ok.map((p) => p.inputA)) / b) * multiplier,
        target: latest.target, // TODO: confirm elapsed-period target rule for rates
      };
    }
    case 'average':
      return {
        ...base,
        actual: sum(ok.map((p) => p.actual)) / ok.length,
        target: sum(ok.map((p) => p.target)) / ok.length,
      };
    case 'closing':
    case 'milestone':
      return { ...base, actual: latest.actual, target: latest.target };
  }
}
