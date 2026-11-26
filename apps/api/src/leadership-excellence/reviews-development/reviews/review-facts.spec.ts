import type { OfficialValue, PeriodTarget } from '../../common/contracts';
import { buildSnapshot, fingerprint, planOwners } from './review-facts';
import {
  PEOPLE,
  action,
  plan,
  people,
} from '../development.fixtures.spec-helper';

const period = (
  start: string,
  end: string,
  over: Partial<PeriodTarget> = {},
): PeriodTarget => ({
  periodId: `${start}/${end}`,
  start,
  end,
  scheduled: true,
  dueAt: `${end}T23:59:59.999Z`,
  value: 100,
  ...over,
});
const official = (p: PeriodTarget, actual: number): OfficialValue => ({
  submissionId: `s-${p.periodId}`,
  assignmentId: 'kpi-1',
  periodId: p.periodId,
  periodStart: p.start,
  periodEnd: p.end,
  actual,
  inputA: null,
  inputB: null,
  evidence: null,
  target: p,
  verifiedById: 'ver',
  verifiedAt: new Date('2026-10-05T00:00:00.000Z'),
  revision: 1,
});

describe('planOwners', () => {
  it('reviews an individual plan with the employee’s reporting manager', () => {
    expect(planOwners(plan(), PEOPLE)).toMatchObject({
      type: 'PERSONAL',
      subjectId: 'emp-1',
      reviewerId: 'mgr-1',
    });
  });

  it('uses the first active goal owner for a department plan', () => {
    const p = plan({
      kind: 'DEPARTMENT',
      scopeId: 'dept-1',
      goals: [
        { id: 'a', code: '', title: '', ownerId: 'gone', kind: 'GOAL' },
        { id: 'b', code: '', title: '', ownerId: 'hod-1', kind: 'GOAL' },
      ],
    });
    const ppl = people({ id: 'gone', active: false }, { id: 'hod-1' });
    expect(planOwners(p, ppl)).toMatchObject({
      type: 'DEPARTMENT',
      subjectId: 'hod-1',
      reviewerId: 'hod-1',
      departmentId: 'dept-1',
    });
  });
});

describe('buildSnapshot', () => {
  const sep = period('2026-09-01', '2026-09-30');
  const oct = period('2026-10-01', '2026-10-31');
  const base = {
    plan: plan(),
    start: '2026-09-01',
    end: '2026-10-31',
    asOf: '2026-11-10',
    subjectId: 'emp-1',
    targets: new Map([['kpi-1', [sep, oct]]]),
    actions: [
      action(),
      action({ id: 'act-x', documentId: 'other', ownerId: 'someone' }),
    ],
  };

  it('uses verified results only and reports gaps without a score', () => {
    const s = buildSnapshot({ ...base, official: [official(sep, 90)] });
    const m = s.measures[0];
    expect(m.records.map((r) => r.status)).toEqual(['VERIFIED', 'MISSING']);
    expect(m.records[0].actual).toBe(90);
    expect(m).toMatchObject({ verified: 1, scheduled: 2, complete: false });
    expect(s.complete).toBe(false);
    expect(s.actions.map((a) => a.id)).toEqual(['act-1']);
    expect(s).not.toHaveProperty('score');
  });

  it('is complete when every scheduled period is verified', () => {
    const s = buildSnapshot({
      ...base,
      official: [official(sep, 90), official(oct, 100)],
    });
    expect(s.complete).toBe(true);
  });

  it('marks a KPI period that crosses the review start as incomplete', () => {
    const s = buildSnapshot({
      ...base,
      start: '2026-09-15',
      official: [official(sep, 90), official(oct, 100)],
    });
    expect(s.measures[0]).toMatchObject({ crossing: true, complete: false });
  });

  it('compares snapshots without the read time', () => {
    const a = buildSnapshot({ ...base, official: [] });
    const b = { ...a, at: '2030-01-01T00:00:00.000Z' };
    expect(fingerprint(a)).toBe(fingerprint(b));
    const c = buildSnapshot({ ...base, official: [official(sep, 1)] });
    expect(fingerprint(a)).not.toBe(fingerprint(c));
  });
});
