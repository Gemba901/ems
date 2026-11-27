import { ForbiddenException } from '@nestjs/common';
import type { PrismaService } from 'src/prisma/prisma.service';
import type { AccessTokenPayload } from 'src/auth/access-token-payload';
import { Role } from 'src/common/enum/role.enum';
import type { PerformancePlanningService } from '../performance-planning/performance-planning.service';
import type { ExecutionService } from '../execution/execution.service';
import type {
  ExecutionAction,
  ExecutionAssignment,
  ExecutionResult,
  ExecutionView,
} from '../execution/execution.types';
import { MonitoringExecutionSource } from './monitoring-control.execution-source';

// The org-wide projection is Area 04's own code; the fixture stands in for its output.
jest.mock('../execution/execution.projection', () => ({
  emptyExecutionState: () => ({
    schema: 1,
    results: [],
    actionUpdates: [],
    supportRequests: [],
  }),
  projectExecution: jest.fn(),
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { projectExecution } = require('../execution/execution.projection') as {
  projectExecution: jest.Mock;
};

const user = {
  tokenType: 'ACCESS',
  userId: 'u-verifier',
  organizationId: 'org-1',
  roleId: 1,
  roleLevel: Role.EMPLOYEE,
  email: null,
  isAdminOrg: false,
} as unknown as AccessTokenPayload;

const period = {
  id: '2026-09-01/2026-09-30',
  label: 'Sep',
  start: '2026-09-01',
  end: '2026-09-30',
  target: 95,
  upper: null,
  submissionDate: '2026-10-05',
};
const row = (version: number, current: boolean): ExecutionAssignment =>
  ({
    key: `doc-1/as-1/v${version}`,
    documentId: 'doc-1',
    version,
    cycle: '2026',
    departmentId: 'dept-1',
    goalKey: `doc-1/goal-1/v${version}`,
    goalTitle: 'Quality',
    scope: 'DEPARTMENT',
    current,
    effectiveDate: '2026-01-01',
    assignment: {
      id: 'as-1',
      code: '',
      goalId: 'goal-1',
      definitionId: 'def-1',
      baseline: 90,
      providerId: 'emp-provider',
      verifierId: 'emp-verifier',
      target: version === 2 ? 97 : 95,
      upper: null,
      targets: [],
    },
    definition: {
      id: 'def-1',
      code: 'QA-1',
      name: 'First pass yield',
      unit: '%',
      direction: 'HIGHER',
      formula: 'PERCENT',
      inputA: 'Good units',
      inputB: 'All units',
      aggregation: 'RATIO',
    },
    periods: [period],
    entryPeriodIds: [period.id],
    canEnter: false,
    canVerify: false,
  }) as unknown as ExecutionAssignment;

const result = (over: Partial<ExecutionResult>): ExecutionResult => ({
  id: 'res-1',
  assignmentKey: 'doc-1/as-1/v1',
  periodId: period.id,
  inputA: 96,
  inputB: 100,
  actual: 96,
  note: '',
  evidence: 'QA log',
  status: 'SUBMITTED',
  updatedAt: '2026-10-02T09:00:00.000Z',
  updatedBy: 'u-provider',
  submittedAt: '2026-10-02T09:00:00.000Z',
  verificationNote: '',
  official: null,
  history: [],
  ...over,
});

const action = (status?: string, canCheck = true) => ({
  action: {
    key: 'doc-1/action/act-1',
    documentId: 'doc-1',
    version: 1,
    cycle: '2026',
    departmentId: 'dept-1',
    goalKey: 'doc-1/goal-1/v1',
    goalTitle: 'Quality',
    action: {
      id: 'act-1',
      code: 'A-1',
      title: 'Retrain line 2',
      goalId: 'goal-1',
      ownerId: 'emp-owner',
      dueDate: '2026-10-31',
      expectedResult: '',
      completionEvidence: '',
    },
    canUpdate: false,
    canCheck,
  } as unknown as ExecutionAction,
  update: status && {
    actionKey: 'doc-1/action/act-1',
    status,
    progress: 100,
    note: 'Done',
    evidence: 'Attendance sheet',
    delayReason: '',
    updatedAt: '2026-10-20T10:00:00.000Z',
    updatedBy: 'u-owner',
    history: [],
  },
});

const view = (over: Partial<ExecutionView> = {}): ExecutionView =>
  ({
    revision: 7,
    references: {
      departments: [],
      people: [
        { id: 'emp-provider', userId: 'u-provider' },
        { id: 'emp-verifier', userId: 'u-verifier' },
        { id: 'emp-owner', userId: 'u-owner' },
      ],
    },
    goals: [
      {
        key: 'doc-1/goal-1/v1',
        documentId: 'doc-1',
        itemKind: 'GOAL',
        item: { id: 'goal-1', title: 'Quality', ownerId: 'emp-hod' },
        departmentId: 'dept-1',
        parentKey: 'doc-0/obj-1/v1',
        current: true,
      },
    ],
    assignments: [row(1, true)],
    actions: [],
    actionUpdates: [],
    results: [],
    ...over,
  }) as unknown as ExecutionView;

function setup(orgView: ExecutionView = view()) {
  projectExecution.mockReset();
  projectExecution.mockReturnValue(orgView);
  const prisma = {
    lexExecutionWorkspace: { findUnique: jest.fn(async () => null) },
  };
  const planning = {
    getExecutionSource: jest.fn(async () => ({
      revision: 3,
      state: {},
      actor: { role: 'EMPLOYEE', employeeId: 'x', userId: '' },
      references: {},
    })),
  };
  const execution = {
    getWorkspace: jest.fn(async () => view()),
    verify: jest.fn(
      async (_u: unknown, rev: number) =>
        ({ revision: rev + 1 }) as ExecutionView,
    ),
    command: jest.fn(),
  };
  const source = new MonitoringExecutionSource(
    prisma as unknown as PrismaService,
    planning as unknown as PerformancePlanningService,
    execution as unknown as ExecutionService,
  );
  return { source, execution, planning };
}

describe('MonitoringExecutionSource reads (org-wide)', () => {
  it('projects with a management actor so every plan is visible', async () => {
    const { source, planning } = setup();
    await source.listApprovedAssignments('org-1');
    expect(planning.getExecutionSource).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1', userId: '' }),
    );
    expect(projectExecution.mock.calls[0][0].actor).toEqual(
      expect.objectContaining({ role: 'MANAGEMENT', employeeId: '' }),
    );
  });

  it('maps one assignment per KPI, preferring the current version', async () => {
    const base = view();
    const goalV2 = { ...base.goals[0], key: 'doc-1/goal-1/v2' };
    const { source } = setup(
      view({
        assignments: [row(1, false), row(2, true)],
        goals: [base.goals[0], goalV2],
      }),
    );
    const [a] = await source.listApprovedAssignments('org-1');
    expect(a).toEqual({
      id: 'as-1',
      code: 'QA-1',
      documentId: 'doc-1',
      planVersion: 2,
      departmentId: 'dept-1',
      goalId: 'goal-1',
      definition: {
        name: 'First pass yield',
        unit: '%',
        direction: 'higher',
        calc: 'percent',
        aggregation: 'ratio',
        inputA: 'Good units',
        inputB: 'All units',
      },
      baseline: 90,
      finalTarget: 97,
      warningTolerance: 0,
      ownerId: 'emp-hod', // goal owner when the assignment has none
      providerId: 'emp-provider',
      verifierId: 'emp-verifier',
    });
  });

  it('period targets use the calendar submission date as the deadline', async () => {
    const { source } = setup();
    expect(
      await source.getPeriodTargets('org-1', 'as-1', {
        documentId: 'doc-1',
        version: 1,
      }),
    ).toEqual([
      {
        periodId: period.id,
        start: '2026-09-01',
        end: '2026-09-30',
        scheduled: true,
        dueAt: '2026-10-05T23:59:59.999Z',
        value: 95,
        upper: null,
      },
    ]);
  });

  it('goals carry the parent item id', async () => {
    const { source } = setup();
    expect(await source.listGoals('org-1')).toEqual([
      expect.objectContaining({ id: 'goal-1', parentId: 'obj-1' }),
    ]);
  });

  it('submitted results use employee ids and flag corrections', async () => {
    const { source } = setup(
      view({
        results: [
          result({}),
          result({
            id: 'res-2',
            note: 'Recount',
            official: {
              actual: 90,
              inputA: 90,
              inputB: 100,
              verifiedAt: '2026-10-03T00:00:00.000Z',
              verifiedBy: 'u-verifier',
            },
          }),
          result({ id: 'res-3', status: 'DRAFT' }),
        ],
      }),
    );
    const rows = await source.listSubmitted('org-1');
    expect(rows.map((r) => [r.id, r.correctionReason])).toEqual([
      ['res-1', null],
      ['res-2', 'Recount'],
    ]);
    expect(rows[0]).toEqual(
      expect.objectContaining({
        assignmentId: 'as-1',
        submittedById: 'emp-provider',
        target: expect.objectContaining({ value: 95 }),
      }),
    );
  });

  it('official values come from Area 04, counting re-verifications', async () => {
    const { source } = setup(
      view({
        results: [
          result({
            status: 'VERIFIED',
            official: {
              actual: 96,
              inputA: 96,
              inputB: 100,
              verifiedAt: '2026-10-03T00:00:00.000Z',
              verifiedBy: 'u-verifier',
            },
            history: [
              { at: '', by: '', name: '', event: 'Verified', detail: '' },
              { at: '', by: '', name: '', event: 'Verified', detail: '' },
            ],
          }),
        ],
      }),
    );
    expect(await source.listOfficial('org-1', ['as-1'])).toEqual([
      expect.objectContaining({
        submissionId: 'res-1',
        periodStart: '2026-09-01',
        actual: 96,
        verifiedById: 'emp-verifier',
        revision: 2,
      }),
    ]);
    expect(await source.listOfficial('org-1', ['other'])).toEqual([]);
  });

  it('maps Area 04 action statuses', async () => {
    const rows = ['NOT_STARTED', 'BLOCKED', 'PENDING_CHECK', 'COMPLETED'];
    const out: string[] = [];
    for (const status of rows) {
      const { action: a, update } = action(status);
      const { source } = setup(
        view({ actions: [a], actionUpdates: [update as never] }),
      );
      out.push((await source.listActions('org-1'))[0].status);
    }
    expect(out).toEqual(['OPEN', 'IN_PROGRESS', 'COMPLETED', 'VERIFIED']);
  });
});

describe('MonitoringExecutionSource changes (as the signed-in user)', () => {
  it('verifies one result at a time, chaining the revision', async () => {
    const { source, execution } = setup();
    expect(
      await source.decide(user, ['res-1', 'res-2'], 'VERIFY', 'ok'),
    ).toEqual({ done: ['res-1', 'res-2'], failed: null });
    expect(execution.verify.mock.calls.map((c) => c[1])).toEqual([7, 8]);
    expect(execution.verify.mock.calls[0]).toEqual([
      user,
      7,
      'res-1',
      'VERIFY',
      'ok',
    ]);
  });

  it('stops at the first refusal and reports what was saved', async () => {
    const { source, execution } = setup();
    execution.verify
      .mockResolvedValueOnce({ revision: 8 } as ExecutionView)
      .mockRejectedValueOnce(
        new ForbiddenException(
          'This result requires its separate assigned verifier.',
        ),
      );
    expect(
      await source.decide(user, ['res-1', 'res-2', 'res-3'], 'RETURN', 'fix'),
    ).toEqual({
      done: ['res-1'],
      failed: {
        id: 'res-2',
        message: 'This result requires its separate assigned verifier.',
      },
    });
    expect(execution.verify).toHaveBeenCalledTimes(2);
  });

  it('lists only pending checks the user may make', async () => {
    const { source, execution } = setup();
    const mine = action('PENDING_CHECK');
    const notMine = action('PENDING_CHECK', false);
    notMine.action = { ...notMine.action, key: 'doc-1/action/act-2' };
    execution.getWorkspace.mockResolvedValue(
      view({
        actions: [mine.action, notMine.action],
        actionUpdates: [mine.update as never],
      }),
    );
    expect(await source.listActionsPendingCheck(user)).toEqual([
      expect.objectContaining({
        id: 'act-1',
        status: 'COMPLETED',
        goalId: 'goal-1',
        ownerNote: 'Done',
        evidence: 'Attendance sheet',
        updatedById: 'emp-owner',
      }),
    ]);
  });

  it('sends CHECK_ACTION to Area 04 with the action key', async () => {
    const { source, execution } = setup();
    const { action: a, update } = action('PENDING_CHECK');
    execution.getWorkspace.mockResolvedValue(
      view({ actions: [a], actionUpdates: [update as never] }),
    );
    execution.command.mockResolvedValue(
      view({
        actions: [a],
        actionUpdates: [{ ...update, status: 'COMPLETED' } as never],
      }),
    );
    const out = await source.checkActionCompletion(user, 'act-1', {
      approve: true,
      note: '',
    });
    expect(execution.command).toHaveBeenCalledWith(user, {
      expectedRevision: 7,
      action: 'CHECK_ACTION',
      payload: {
        actionKey: 'doc-1/action/act-1',
        decision: 'COMPLETE',
        note: '',
      },
    });
    expect(out.status).toBe('VERIFIED');
  });

  it('creating a follow-up is not available yet', async () => {
    const { source } = setup();
    await expect(source.createFollowUpAction()).rejects.toThrow(
      /not available from Area 04 yet/,
    );
  });
});
