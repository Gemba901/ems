import { resultSchedules } from './planning-result-periods';
import { blankData } from './planning.rules';
import type {
  ApprovedVersion,
  Goal,
  PlanningCalendar,
  PlanningDocument,
} from './planning.types';

const goal: Goal = {
  id: 'g',
  code: 'G1',
  createdAt: '',
  createdBy: '',
  updatedAt: '',
  updatedBy: '',
  title: 'Reduce waste',
  objectiveId: '',
  parent: null,
  ongoingReason: '',
  measure: 'Waste',
  definitionId: '',
  baseline: 50,
  baselineReason: '',
  target: 30,
  unit: 'count',
  ownerId: 'owner',
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  approach: '',
  departmentIds: [],
  frequency: 'MONTHLY',
};
const calendar: PlanningCalendar = {
  id: 'calendar',
  version: 1,
  source: 'AREA_02',
  approved: true,
  timeZone: 'UTC',
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  workingDays: [1, 2, 3, 4, 5],
  holidays: ['2026-01-01'],
  weekStart: 1,
  fortnightAnchor: '2026-01-05',
  twiceMonthlySplit: 15,
  submissionDueDays: 1,
};
function snapshot(
  version: number,
  effectiveDate: string,
  target = 30,
): ApprovedVersion {
  return {
    version,
    effectiveDate,
    approvedAt: effectiveDate,
    approvedBy: 'approver',
    reason: '',
    approvedItem: { kind: 'goal', itemId: 'g' },
    definitions: [],
    calendar: structuredClone(calendar),
    data: {
      ...blankData(),
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      goals: [{ ...goal, target }],
    },
  };
}
function plan(versions = [snapshot(1, '2026-01-01')]): PlanningDocument {
  return {
    id: 'doc',
    code: 'DOC',
    kind: 'DEPARTMENT',
    scopeId: 'production',
    departmentId: 'production',
    cycle: '2026',
    status: 'APPROVED',
    data: structuredClone(versions.at(-1)?.data || blankData()),
    versions,
    revisionReason: '',
    effectiveDate: '',
    history: [],
    acknowledgement: null,
  };
}
describe('approved programme result schedule API projection', () => {
  test('late November result offers November v1 target even after December v2 starts', () => {
    const schedules = resultSchedules(
      plan([snapshot(1, '2026-01-01'), snapshot(2, '2026-12-01', 20)]),
      'g',
      'UTC',
      '2026-12-05',
    );
    expect(
      schedules[0].periods.find((p) => p.start === '2026-11-01'),
    ).toMatchObject({ target: 30, canRecord: true });
    expect(schedules[1].periods.some((p) => p.start === '2026-11-01')).toBe(
      false,
    );
    expect(
      schedules[1].periods.find((p) => p.start === '2026-12-01'),
    ).toMatchObject({ target: 20, canRecord: false });
  });
  test('future versions and copied whole-plan approvals are not separate result versions', () => {
    const whole = snapshot(3, '2026-11-01', 20);
    delete whole.approvedItem;
    whole.itemVersions = { g: 2 };
    const schedules = resultSchedules(
      plan([snapshot(1, '2026-01-01'), snapshot(2, '2026-12-01', 20), whole]),
      'g',
      'UTC',
      '2026-11-19',
    );
    expect(schedules.map((s) => s.version)).toEqual([1]);
  });
  test('a mid-month revision produces disjoint periods with separate targets', () => {
    const schedules = resultSchedules(
      plan([snapshot(1, '2026-01-01'), snapshot(2, '2026-11-15', 20)]),
      'g',
      'UTC',
      '2026-12-01',
    );
    expect(
      schedules[0].periods.find((p) => p.start === '2026-11-01'),
    ).toMatchObject({ end: '2026-11-14', target: 30 });
    expect(
      schedules[1].periods.find((p) => p.start === '2026-11-15'),
    ).toMatchObject({ end: '2026-11-30', target: 20 });
  });
  test.each([
    'DAILY',
    'WEEKLY',
    'FORTNIGHTLY',
    'TWICE_MONTHLY',
    'MONTHLY',
    'QUARTERLY',
    'HALF_YEARLY',
    'YEARLY',
  ] as const)('%s keeps its own approved reporting schedule', (frequency) => {
    const approved = snapshot(1, '2026-01-01');
    approved.data.goals[0].frequency = frequency;
    const [result] = resultSchedules(
      plan([approved]),
      'g',
      'UTC',
      '2026-12-31',
    );
    expect(result.frequency).toBe(frequency);
    expect(result.periods.length).toBeGreaterThan(0);
    if (frequency === 'DAILY')
      expect(result.periods[0]).toMatchObject({
        start: '2026-01-01',
        end: '2026-01-01',
        scheduled: false,
        canRecord: false,
      });
    if (frequency === 'QUARTERLY') expect(result.periods).toHaveLength(4);
    if (frequency === 'YEARLY') expect(result.periods).toHaveLength(1);
  });
  test('missing and draft-only commitments are rejected', () => {
    expect(() => resultSchedules(plan(), 'missing')).toThrow(
      /No effective approved/,
    );
    expect(() => resultSchedules(plan([]), 'g')).toThrow(
      /No effective approved/,
    );
  });
});
