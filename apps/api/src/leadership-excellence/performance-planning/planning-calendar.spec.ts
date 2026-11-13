import {
  calendarPeriods,
  resolveAssignmentCalendar,
} from './planning-calendar';
import type { PlanningCalendar } from './planning.types';

const calendar = (
  overrides: Partial<PlanningCalendar> = {},
): PlanningCalendar => ({
  id: 'work-calendar:org',
  version: 'snapshot-1',
  source: 'WORK_SETTINGS',
  approved: false,
  timeZone: 'Africa/Nairobi',
  startDate: '',
  endDate: '',
  workingDays: [1, 2, 3, 4, 5],
  holidays: [],
  weekStart: 1,
  fortnightAnchor: '2026-01-05',
  twiceMonthlySplit: 15,
  submissionDueDays: 2,
  ...overrides,
});

describe('planning calendar snapshots', () => {
  it.each([
    ['MONTHLY', 60],
    ['QUARTERLY', 20],
    ['YEARLY', 5],
  ] as const)(
    'supports five-year %s schedules without shortening the plan',
    (frequency, count) => {
      const rows = calendarPeriods(
        '2026-01-01',
        '2030-12-31',
        frequency,
        calendar(),
      );
      expect(rows).toHaveLength(count);
      expect(rows[0].start).toBe('2026-01-01');
      expect(rows.at(-1)?.end).toBe('2030-12-31');
      expect(rows.every((row) => row.target === null)).toBe(true);
    },
  );

  it('limits generated target rows rather than the overall plan duration', () => {
    expect(() =>
      calendarPeriods('2026-01-01', '2030-12-31', 'DAILY', calendar()),
    ).toThrow(
      'shorter assignment period or a less frequent reporting schedule',
    );
  });
  it('keeps non-working and holiday days as Not scheduled with null targets', () => {
    const rows = calendarPeriods(
      '2026-01-02',
      '2026-01-06',
      'DAILY',
      calendar({ holidays: ['2026-01-05'] }),
    );
    expect(rows.map((row) => [row.start, row.scheduled])).toEqual([
      ['2026-01-02', true],
      ['2026-01-03', false],
      ['2026-01-04', false],
      ['2026-01-05', false],
      ['2026-01-06', true],
    ]);
    expect(rows[1]).toMatchObject({
      target: null,
      upper: null,
      submissionDate: undefined,
    });
    expect(rows[0].submissionDate).toBe('2026-01-04');
  });

  it('aligns weeks to the configured week start, including partial first periods', () => {
    const rows = calendarPeriods(
      '2026-01-07',
      '2026-01-20',
      'WEEKLY',
      calendar(),
    );
    expect(rows.map((row) => row.id)).toEqual([
      '2026-01-07/2026-01-11',
      '2026-01-12/2026-01-18',
      '2026-01-19/2026-01-20',
    ]);
  });

  it('keeps anchored fortnightly cycles distinct from twice-monthly cycles', () => {
    const fortnightly = calendarPeriods(
      '2026-01-01',
      '2026-01-31',
      'FORTNIGHTLY',
      calendar(),
    );
    const twice = calendarPeriods(
      '2026-01-01',
      '2026-01-31',
      'TWICE_MONTHLY',
      calendar(),
    );
    expect(fortnightly.map((row) => row.end)).toEqual([
      '2026-01-04',
      '2026-01-18',
      '2026-01-31',
    ]);
    expect(twice.map((row) => row.end)).toEqual(['2026-01-15', '2026-01-31']);
  });

  it('supports custom twice-monthly boundaries and leap-year deadlines', () => {
    const rows = calendarPeriods(
      '2028-02-01',
      '2028-02-29',
      'TWICE_MONTHLY',
      calendar({ twiceMonthlySplit: 10 }),
    );
    expect(rows.map((row) => row.end)).toEqual(['2028-02-10', '2028-02-29']);
    expect(rows[1].submissionDate).toBe('2028-03-02');
  });

  it('never divides targets or invents target values', () => {
    expect(
      calendarPeriods('2026-01-01', '2026-12-31', 'MONTHLY', calendar()).every(
        (row) => row.target === null && row.upper === null,
      ),
    ).toBe(true);
  });

  it('uses date-only calculations through daylight-saving changes', () => {
    expect(
      calendarPeriods(
        '2026-03-07',
        '2026-03-10',
        'DAILY',
        calendar({ timeZone: 'America/New_York' }),
      ).map((row) => row.start),
    ).toEqual(['2026-03-07', '2026-03-08', '2026-03-09', '2026-03-10']);
  });

  it('accepts only reporting-rule overrides and retains server-owned identity and holidays', () => {
    const original = calendar({ holidays: ['2026-01-01'] });
    const copy = resolveAssignmentCalendar(original, {
      id: 'attacker',
      version: 'fake',
      holidays: [],
      timeZone: 'UTC',
      weekStart: 0,
      submissionDueDays: 5,
    });
    expect(copy).toMatchObject({
      id: original.id,
      version: original.version,
      holidays: original.holidays,
      timeZone: original.timeZone,
      weekStart: 0,
      submissionDueDays: 5,
    });
    expect(original.weekStart).toBe(1);
  });

  it('does not allow assignment overrides to change approved Area 02 rules', () => {
    const approved = calendar({ source: 'AREA_02', approved: true });
    expect(() => resolveAssignmentCalendar(approved, { weekStart: 0 })).toThrow(
      'approved Area 02',
    );
    expect(
      resolveAssignmentCalendar(approved, { weekStart: 1 })?.weekStart,
    ).toBe(1);
  });

  it.each([
    { weekStart: 7 },
    { submissionDueDays: -1 },
    { twiceMonthlySplit: 28 },
    { fortnightAnchor: '2026-02-30' },
    { weekStart: '1' },
  ])('rejects malformed schedule rules %j', (settings) => {
    expect(() => resolveAssignmentCalendar(calendar(), settings)).toThrow();
  });

  it('does not silently generate dates outside the approved performance calendar', () => {
    expect(() =>
      calendarPeriods(
        '2026-12-01',
        '2027-01-01',
        'MONTHLY',
        calendar({
          source: 'AREA_02',
          approved: true,
          startDate: '2026-01-01',
          endDate: '2026-12-31',
        }),
      ),
    ).toThrow('inside the approved reporting calendar');
  });

  it('preserves an earlier snapshot when upstream working days change', () => {
    const saved = resolveAssignmentCalendar(calendar());
    const latest = calendar({
      version: 'snapshot-2',
      workingDays: [0, 1, 2, 3, 4, 5, 6],
    });
    expect(
      calendarPeriods('2026-01-03', '2026-01-03', 'DAILY', saved)[0].scheduled,
    ).toBe(false);
    expect(
      calendarPeriods('2026-01-03', '2026-01-03', 'DAILY', latest)[0].scheduled,
    ).toBe(true);
  });
});
