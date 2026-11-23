import { NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import type { AccessTokenPayload } from 'src/auth/access-token-payload';
import { Role } from 'src/common/enum/role.enum';
import type {
  ApprovedKpiAssignment,
  ExecutionProvider,
  PerformancePlanningProvider,
  PeriodTarget,
  SubmittedResult,
} from '../../common/contracts';
import { buildAssignmentView, type OfficialRow } from './performance-view';
import { PerformanceService } from './performance.service';

const NOW = new Date('2026-11-01T08:00:00.000Z');

const assignment = (
  over: Partial<ApprovedKpiAssignment> = {},
): ApprovedKpiAssignment => ({
  id: 'kpi-1',
  code: 'OPX-01',
  documentId: 'doc1',
  planVersion: 1,
  departmentId: 'dept-1',
  goalId: 'goal-1',
  definition: {
    name: 'Units produced',
    unit: 'units',
    direction: 'higher',
    calc: 'direct',
    aggregation: 'sum',
  },
  baseline: 100,
  finalTarget: 120,
  warningTolerance: 0,
  ownerId: 'emp-owner',
  providerId: 'emp-provider',
  verifierId: 'emp-verifier',
  ...over,
});
const month = (m: string, over: Partial<PeriodTarget> = {}): PeriodTarget => {
  const [y, mm] = m.split('-').map(Number);
  const end = new Date(Date.UTC(y, mm, 0)).toISOString().slice(0, 10);
  return {
    periodId: `p-${m}`,
    start: `${m}-01`,
    end,
    scheduled: true,
    dueAt: new Date(Date.UTC(y, mm, 5)).toISOString(), // 5th of next month
    value: 108,
    ...over,
  };
};
const official = (
  t: PeriodTarget,
  actual: number,
  over: Partial<OfficialRow> = {},
): OfficialRow => ({
  periodId: t.periodId,
  actual,
  inputA: null,
  inputB: null,
  evidence: 'log',
  target: t,
  revision: 1,
  verifiedById: 'emp-verifier',
  verifiedAt: NOW,
  ...over,
});
const pending = (periodId: string, actual = 999) =>
  ({ periodId, actual }) as unknown as SubmittedResult;

describe('buildAssignmentView', () => {
  const jul = month('2026-07');
  const aug = month('2026-08');
  const sep = month('2026-09');
  const oct = month('2026-10'); // due 5 Nov: not yet due on NOW
  const nov = month('2026-11', { scheduled: false });

  it('keeps data status separate from performance, and never uses pending values', () => {
    const v = buildAssignmentView(
      assignment(),
      [nov, sep, jul, aug, oct],
      [official(jul, 110)],
      [pending(aug.periodId)],
      NOW,
    );
    expect(v.periods.map((p) => p.dataStatus)).toEqual([
      'VERIFIED',
      'PENDING_VERIFICATION',
      'NOT_REPORTED',
      'NOT_YET_DUE',
      'NOT_SCHEDULED',
    ]);
    expect(v.periods[1].actual).toBeNull(); // pending 999 is not official
    expect(v.periods[2].actual).toBeNull(); // missing is never zero
    expect(v.completeness).toEqual({ due: 3, verified: 1, pending: 1 });
  });

  it('withholds the gap and judgement while the summary is incomplete', () => {
    const v = buildAssignmentView(
      assignment(),
      [jul, aug],
      [official(jul, 110)],
      [],
      NOW,
    );
    expect(v.summary.incomplete).toBe(true);
    expect(v.assessment).toBeNull();
    expect(v.achievementPct).toBeNull();
    expect(v.improvementProgressPct).toBeNull();
    expect(v.variance).toBeNull();
    // The verified period itself is still assessed.
    expect(v.periods[0].assessment).toEqual({ status: 'ON_TARGET', gap: 2 });
  });

  it('judges a complete summary (sum KPI)', () => {
    const v = buildAssignmentView(
      assignment(),
      [jul, aug],
      [official(jul, 110), official(aug, 100)],
      [],
      NOW,
    );
    expect(v.summary).toEqual({ actual: 210, target: 216, incomplete: false });
    expect(v.assessment).toEqual({ status: 'BELOW_TARGET', gap: -6 });
    expect(v.achievementPct).toBeCloseTo((210 / 216) * 100, 6);
    expect(v.variance).toEqual({ value: -6, favourable: false });

    const tolerant = buildAssignmentView(
      assignment({ warningTolerance: 10 }),
      [jul, aug],
      [official(jul, 110), official(aug, 100)],
      [],
      NOW,
    );
    expect(tolerant.assessment?.status).toBe('NEEDS_ATTENTION');
  });

  it('uses the target approved at submission, not a later re-plan', () => {
    const replanned = { ...jul, value: 200 };
    const v = buildAssignmentView(
      assignment(),
      [replanned],
      [official(jul, 110)],
      [],
      NOW,
    );
    expect(v.periods[0].target).toBe(108);
    expect(v.assessment?.status).toBe('ON_TARGET');
  });

  it('a pending correction leaves the official value in place', () => {
    const v = buildAssignmentView(
      assignment(),
      [jul],
      [official(jul, 110)],
      [pending(jul.periodId)],
      NOW,
    );
    expect(v.periods[0]).toEqual(
      expect.objectContaining({
        dataStatus: 'VERIFIED',
        actual: 110,
        correctionPending: true,
      }),
    );
  });

  it('`until` limits the view to periods ending on or before it', () => {
    const v = buildAssignmentView(
      assignment(),
      [jul, aug, sep],
      [],
      [],
      NOW,
      '2026-08-31',
    );
    expect(v.periods.map((p) => p.periodId)).toEqual([
      'p-2026-07',
      'p-2026-08',
    ]);
  });
});

describe('PerformanceService scope', () => {
  const mine = assignment();
  const otherDept = assignment({
    id: 'kpi-2',
    departmentId: 'dept-2',
    ownerId: 'emp-a',
    providerId: 'emp-b',
    verifierId: 'emp-c',
  });
  const reportOwned = assignment({
    id: 'kpi-3',
    departmentId: 'dept-2',
    ownerId: 'emp-report',
    providerId: 'emp-b',
    verifierId: 'emp-c',
  });

  const user = (roleLevel: Role): AccessTokenPayload => ({
    tokenType: 'ACCESS',
    userId: 'user-1',
    organizationId: 'org-1',
    roleId: 1,
    roleLevel,
    email: null,
    isAdminOrg: false,
  });
  const make = (
    me: { id: string; departmentId: string } | null,
    reports: string[] = [],
  ) => {
    const db = {
      employee: {
        findFirst: jest.fn(
          async () => me && { ...me, employmentStatus: 'ACTIVE' },
        ),
        findMany: jest.fn(async () => reports.map((id) => ({ id }))),
      },
      lexOfficialResult: { findMany: jest.fn(async () => []) },
    };
    const planning: PerformancePlanningProvider = {
      listApprovedAssignments: jest.fn(async () => [
        mine,
        otherDept,
        reportOwned,
      ]),
      listGoals: jest.fn(async () => []),
      getPeriodTargets: jest.fn(async () => [month('2026-09')]),
    };
    const execution = {
      listSubmitted: jest.fn(async () => []),
    } as unknown as ExecutionProvider;
    return {
      db,
      service: new PerformanceService(
        db as unknown as PrismaService,
        planning,
        execution,
      ),
    };
  };

  it('an employee sees KPIs they own / provide / verify and their direct reports’', async () => {
    const { service, db } = make(
      { id: 'emp-provider', departmentId: 'dept-9' },
      ['emp-report'],
    );
    const rows = await service.getOverview(user(Role.EMPLOYEE), {});
    expect(rows.map((r) => r.assignmentId)).toEqual(['kpi-1', 'kpi-3']);
    expect(rows[0]).not.toHaveProperty('periods');
    expect(db.lexOfficialResult.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        assignmentId: { in: ['kpi-1', 'kpi-3'] },
      },
    });
  });
  it('an HOD sees their department', async () => {
    const { service } = make({ id: 'emp-hod', departmentId: 'dept-2' });
    const rows = await service.getOverview(user(Role.HOD), {});
    expect(rows.map((r) => r.assignmentId)).toEqual(['kpi-2', 'kpi-3']);
  });
  it('org-wide roles see everything, even with no employee record', async () => {
    const { service } = make(null);
    expect(await service.getOverview(user(Role.SUPER_ADMIN), {})).toHaveLength(
      3,
    );
  });
  it('filters by department and month', async () => {
    const { service } = make(null);
    const rows = await service.getOverview(user(Role.ADMIN), {
      departmentId: 'dept-2',
      month: '2026-08',
    });
    expect(rows.map((r) => r.assignmentId)).toEqual(['kpi-2', 'kpi-3']);
    expect(rows[0].completeness.due).toBe(0); // September is after the chosen month
  });
  it('detail is 404 for a KPI outside the caller’s scope', async () => {
    const { service } = make({ id: 'emp-provider', departmentId: 'dept-1' });
    await expect(
      service.getAssignmentDetail(user(Role.EMPLOYEE), 'kpi-2'),
    ).rejects.toBeInstanceOf(NotFoundException);
    const view = await service.getAssignmentDetail(
      user(Role.EMPLOYEE),
      'kpi-1',
    );
    expect(view.periods).toHaveLength(1);
  });
});
