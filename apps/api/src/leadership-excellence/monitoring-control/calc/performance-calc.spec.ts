import {
  achievementPct,
  assess,
  improvementProgressPct,
  summarise,
  variance,
} from './performance-calc';

describe('performance-calc (SPMS Part 5 examples)', () => {
  it('achievement, higher is better: 110 vs 108 = 101.85%', () => {
    expect(achievementPct(110, 108, 'higher')).toBeCloseTo(101.85, 2);
  });
  it('achievement, lower is better: 4% vs 5% = 125%', () => {
    expect(achievementPct(4, 5, 'lower')).toBeCloseTo(125, 5);
  });
  it('improvement progress: 100 → 120, actual 110 = 50%', () => {
    expect(improvementProgressPct(100, 120, 110, 'higher')).toBeCloseTo(50, 5);
  });
  it('improvement progress, lower: 40 → 20, actual 30 = 50%', () => {
    expect(improvementProgressPct(40, 20, 30, 'lower')).toBeCloseTo(50, 5);
  });
  it('variance: 110 vs 108 = +2, favourable', () => {
    expect(variance(110, 108, 'higher')).toEqual({
      value: 2,
      favourable: true,
    });
  });
  it('missing data is NOT_MEASURED, never zero', () => {
    expect(assess(null, { value: 100 }, 'higher').status).toBe('NOT_MEASURED');
  });
  it('within warning tolerance = NEEDS_ATTENTION', () => {
    expect(assess(105, { value: 108 }, 'higher', 5).status).toBe(
      'NEEDS_ATTENTION',
    );
  });
  it('ratio KPI recalculates from combined inputs, not averaged rates', () => {
    const s = summarise(
      [
        {
          periodEnd: '2027-01-31',
          due: true,
          verified: true,
          actual: 10,
          target: 5,
          inputA: 1,
          inputB: 10,
        },
        {
          periodEnd: '2027-02-28',
          due: true,
          verified: true,
          actual: 2,
          target: 5,
          inputA: 2,
          inputB: 100,
        },
      ],
      'ratio',
      100,
    );
    expect(s.actual).toBeCloseTo((3 / 110) * 100, 5); // not (10 + 2) / 2
  });
  it('unverified due period marks the summary incomplete', () => {
    const s = summarise(
      [
        {
          periodEnd: '2027-01-31',
          due: true,
          verified: false,
          actual: 9,
          target: 5,
        },
      ],
      'sum',
    );
    expect(s.incomplete).toBe(true);
  });
});
