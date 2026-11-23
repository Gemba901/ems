import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import type { AccessTokenPayload } from 'src/auth/access-token-payload';
import { Role } from 'src/common/enum/role.enum';
import type {
  ApprovedKpiAssignment,
  ExecutionProvider,
  PerformancePlanningProvider,
  PeriodTarget,
  TrackedAction,
} from '../../common/contracts';
import { PerformanceService } from '../performance/performance.service';
import { AlertsService } from './alerts.service';

const NOW = new Date('2026-11-01T08:00:00.000Z');
const LATER = new Date('2026-11-02T08:00:00.000Z');

const kpi: ApprovedKpiAssignment = {
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
};
const sep: PeriodTarget = {
  periodId: 'p-sep',
  start: '2026-09-01',
  end: '2026-09-30',
  scheduled: true,
  dueAt: '2026-10-05T00:00:00.000Z',
  value: 108,
};
const officialRow = (actual: number) => ({
  assignmentId: 'kpi-1',
  periodId: 'p-sep',
  actual: String(actual),
  inputA: null,
  inputB: null,
  evidence: 'log',
  snapshot: { target: sep },
  revision: 1,
  verifiedById: 'emp-verifier',
  verifiedAt: NOW,
});

type Employee = {
  id: string;
  userId: string;
  departmentId: string;
  reportingManagerId: string | null;
};
const EMPLOYEES: Employee[] = [
  {
    id: 'emp-owner',
    userId: 'u-owner',
    departmentId: 'dept-1',
    reportingManagerId: 'emp-manager',
  },
  {
    id: 'emp-manager',
    userId: 'u-manager',
    departmentId: 'dept-1',
    reportingManagerId: null,
  },
  {
    id: 'emp-verifier',
    userId: 'u-verifier',
    departmentId: 'dept-3',
    reportingManagerId: null,
  },
  {
    id: 'emp-stranger',
    userId: 'u-stranger',
    departmentId: 'dept-2',
    reportingManagerId: null,
  },
  {
    id: 'emp-hod2',
    userId: 'u-hod2',
    departmentId: 'dept-2',
    reportingManagerId: null,
  },
  {
    id: 'emp-lonely',
    userId: 'u-lonely',
    departmentId: 'dept-1',
    reportingManagerId: null,
  },
];
const user = (
  userId: string,
  roleLevel = Role.EMPLOYEE,
): AccessTokenPayload => ({
  tokenType: 'ACCESS',
  userId,
  organizationId: 'org-1',
  roleId: 1,
  roleLevel,
  email: null,
  isAdminOrg: false,
});

/** In-memory stand-in for the Prisma calls AlertsService makes. */
function setup() {
  const state = {
    official: [] as ReturnType<typeof officialRow>[],
    actions: [] as TrackedAction[],
  };
  const alerts: any[] = [];
  const events: any[] = [];
  let n = 0;
  const matches = (row: any, where: Record<string, any>) =>
    Object.entries(where).every(([k, v]) =>
      v && typeof v === 'object' && 'not' in v
        ? row[k] !== v.not
        : row[k] === v,
    );
  const employees = EMPLOYEES.map((e) => ({
    ...e,
    organizationId: 'org-1',
    employmentStatus: 'ACTIVE',
  }));

  const db: any = {
    $executeRaw: jest.fn(async () => 1),
    employee: {
      findFirst: jest.fn(
        async ({ where }) => employees.find((e) => matches(e, where)) ?? null,
      ),
      findMany: jest.fn(async ({ where }) =>
        employees.filter((e) => matches(e, where)),
      ),
    },
    lexOfficialResult: { findMany: jest.fn(async () => state.official) },
    lexMonitoringAlert: {
      findMany: jest.fn(async ({ where }) =>
        alerts.filter((a) => matches(a, where)).map((a) => ({ ...a })),
      ),
      findFirst: jest.fn(async ({ where }) => {
        const a = alerts.find((x) => matches(x, where));
        return a ? { ...a } : null;
      }),
      create: jest.fn(async ({ data }) => {
        const a = {
          id: `alert-${++n}`,
          status: 'OPEN',
          openedAt: NOW,
          closedAt: null,
          escalatedToId: null,
          linkedActionId: null,
          comment: null,
          ...data,
        };
        alerts.push(a);
        return { ...a };
      }),
      update: jest.fn(async ({ where, data }) => {
        const a = alerts.find((x) => x.id === where.id);
        Object.assign(a, data);
        return { ...a };
      }),
    },
    lexMonitoringAlertEvent: {
      create: jest.fn(async ({ data }) => {
        events.push(data);
        return data;
      }),
    },
  };
  db.$transaction = jest.fn(async (work: (tx: unknown) => unknown) => work(db));

  const planning: PerformancePlanningProvider = {
    listApprovedAssignments: jest.fn(async () => [kpi]),
    getPeriodTargets: jest.fn(async () => [sep]),
    listGoals: jest.fn(async () => []),
  };
  const execution = {
    listSubmitted: jest.fn(async () => []),
    listActions: jest.fn(async () => state.actions),
    getAction: jest.fn(
      async (_org: string, id: string) =>
        state.actions.find((a) => a.id === id) ?? null,
    ),
  } as unknown as ExecutionProvider;
  const prisma = db as unknown as PrismaService;
  const service = new AlertsService(
    prisma,
    new PerformanceService(prisma, planning, execution),
    planning,
    execution,
  );
  return { service, state, alerts, events, db };
}

describe('AlertsService.sync', () => {
  it('opens one MISSING_RESULT alert per KPI, not one per run', async () => {
    const { service, alerts, events } = setup();
    await service.sync('org-1', NOW);
    await service.sync('org-1', LATER);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toEqual(
      expect.objectContaining({
        key: 'missing|kpi-1',
        kind: 'MISSING_RESULT',
        status: 'OPEN',
        ownerId: 'emp-owner',
      }),
    );
    expect(events.map((e) => e.action)).toEqual(['OPENED']);
  });

  it('closes when the result is verified, and reopens the same alert if it goes missing again', async () => {
    const { service, state, alerts, events } = setup();
    await service.sync('org-1', NOW);
    state.official = [officialRow(110)]; // on target: no gap either
    await service.sync('org-1', NOW);
    expect(alerts[0].status).toBe('CLOSED');
    expect(alerts[0].closedAt).toEqual(NOW);

    state.official = [];
    await service.sync('org-1', LATER);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toEqual(
      expect.objectContaining({
        status: 'OPEN',
        closedAt: null,
        openedAt: LATER,
      }),
    );
    expect(events.map((e) => e.action)).toEqual([
      'OPENED',
      'CLOSED',
      'REOPENED',
    ]);
  });

  it('a verified result below target opens a VERIFIED_GAP alert', async () => {
    const { service, state, alerts } = setup();
    state.official = [officialRow(100)];
    await service.sync('org-1', NOW);
    expect(alerts.map((a) => a.key)).toEqual(['gap|kpi-1']);
    expect(alerts[0].title).toBe('OPX-01 · below target');
    expect(alerts[0].detail).toContain('gap -8');
  });

  it('an action past due and not verified/cancelled opens OVERDUE_ACTION; closes once verified', async () => {
    const { service, state, alerts } = setup();
    state.official = [officialRow(110)];
    state.actions = [
      {
        id: 'act-1',
        title: 'Fix line 3',
        ownerId: 'emp-owner',
        departmentId: 'dept-1',
        assignmentId: 'kpi-1',
        dueAt: '2026-10-20T00:00:00.000Z',
        status: 'COMPLETED',
      },
      {
        id: 'act-2',
        title: 'Future',
        ownerId: 'emp-owner',
        departmentId: 'dept-1',
        assignmentId: null,
        dueAt: '2026-12-01T00:00:00.000Z',
        status: 'OPEN',
      },
    ];
    await service.sync('org-1', NOW);
    expect(alerts.map((a) => a.key)).toEqual(['action|act-1']);

    state.actions[0].status = 'VERIFIED';
    await service.sync('org-1', NOW);
    expect(alerts[0].status).toBe('CLOSED');
  });

  it('serialises concurrent syncs with an advisory lock inside the tenant transaction', async () => {
    const { service, db } = setup();
    await service.sync('org-1', NOW);
    const sql = db.$executeRaw.mock.calls.map((c: any[]) => c[0].join('?'));
    expect(sql).toEqual([
      expect.stringContaining('set_config'),
      expect.stringContaining('pg_advisory_xact_lock'),
    ]);
  });
});

describe('AlertsService follow-up actions', () => {
  it('acknowledging records a note but does not close the gap, and sync keeps it acknowledged', async () => {
    const { service, state, alerts, events } = setup();
    state.official = [officialRow(100)];
    await service.sync('org-1', NOW);

    await service.acknowledge(
      user('u-owner'),
      alerts[0].id,
      'Line 3 was down for 2 days',
    );
    expect(alerts[0]).toEqual(
      expect.objectContaining({
        status: 'ACKNOWLEDGED',
        comment: 'Line 3 was down for 2 days',
      }),
    );

    await service.sync('org-1', LATER);
    expect(alerts[0].status).toBe('ACKNOWLEDGED');
    expect(events.at(-1)).toEqual(
      expect.objectContaining({ action: 'ACKNOWLEDGED', actorId: 'emp-owner' }),
    );
  });

  it('escalates to the owner’s reporting manager', async () => {
    const { service, alerts, events } = setup();
    await service.sync('org-1', NOW);
    await service.escalate(
      user('u-owner'),
      alerts[0].id,
      'Need help with data',
    );
    expect(alerts[0]).toEqual(
      expect.objectContaining({
        status: 'ESCALATED',
        escalatedToId: 'emp-manager',
      }),
    );
    expect(events.at(-1)).toEqual(
      expect.objectContaining({
        action: 'ESCALATED',
        note: 'Need help with data',
      }),
    );
    await expect(
      service.escalate(user('u-owner'), alerts[0].id, 'again'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('cannot escalate when the owner has no manager, or to yourself', async () => {
    const { service, alerts } = setup();
    await service.sync('org-1', NOW);
    await expect(
      service.escalate(user('u-manager'), alerts[0].id, 'x'),
    ).rejects.toThrow('link a follow-up');
    alerts[0].ownerId = 'emp-lonely';
    await expect(
      service.escalate(user('u-lonely'), alerts[0].id, 'x'),
    ).rejects.toThrow('no reporting manager');
  });

  it('links an existing, non-cancelled follow-up action', async () => {
    const { service, state, alerts } = setup();
    await service.sync('org-1', NOW);
    await expect(
      service.linkFollowUp(user('u-owner'), alerts[0].id, {
        actionId: 'nope',
        note: 'x',
      }),
    ).rejects.toThrow('Follow-up action not found.');
    state.actions = [
      {
        id: 'act-9',
        title: 'Recount',
        ownerId: 'emp-owner',
        departmentId: 'dept-1',
        assignmentId: 'kpi-1',
        dueAt: '2026-12-01T00:00:00.000Z',
        status: 'OPEN',
      },
    ];
    await service.linkFollowUp(user('u-owner'), alerts[0].id, {
      actionId: 'act-9',
      note: 'Recount planned',
    });
    expect(alerts[0]).toEqual(
      expect.objectContaining({
        status: 'FOLLOW_UP_LINKED',
        linkedActionId: 'act-9',
      }),
    );
  });

  it('closed alerts cannot be acted on; blank notes are refused', async () => {
    const { service, alerts } = setup();
    await service.sync('org-1', NOW);
    await expect(
      service.acknowledge(user('u-owner'), alerts[0].id, '   '),
    ).rejects.toThrow('Add a note.');
    alerts[0].status = 'CLOSED';
    await expect(
      service.acknowledge(user('u-owner'), alerts[0].id, 'ok'),
    ).rejects.toThrow('closed');
  });

  it('outside scope is 404; no employee record is 403', async () => {
    const { service, alerts } = setup();
    await service.sync('org-1', NOW);
    await expect(
      service.acknowledge(user('u-stranger'), alerts[0].id, 'x'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.acknowledge(user('u-ghost', Role.SUPER_ADMIN), alerts[0].id, 'x'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    // The KPI's verifier is in scope through the assignment.
    await expect(
      service.acknowledge(user('u-verifier'), alerts[0].id, 'seen'),
    ).resolves.toBeDefined();
  });
});

describe('AlertsService.list scope', () => {
  const ids = async (u: AccessTokenPayload, status?: string) => {
    const { service } = setup();
    return (await service.list(u, { status })).map((a) => a.key);
  };
  it('owner, their manager, the KPI verifier and org-wide roles see it', async () => {
    expect(await ids(user('u-owner'))).toEqual(['missing|kpi-1']);
    expect(await ids(user('u-manager'))).toEqual(['missing|kpi-1']);
    expect(await ids(user('u-verifier'))).toEqual(['missing|kpi-1']);
    expect(await ids(user('u-ghost', Role.SUPER_ADMIN))).toEqual([
      'missing|kpi-1',
    ]);
  });
  it('unrelated employees and other departments’ HODs do not', async () => {
    expect(await ids(user('u-stranger'))).toEqual([]);
    expect(await ids(user('u-hod2', Role.HOD))).toEqual([]);
  });
  it('status filter: CLOSED shows none of the active ones', async () => {
    expect(await ids(user('u-owner'), 'CLOSED')).toEqual([]);
  });
});
