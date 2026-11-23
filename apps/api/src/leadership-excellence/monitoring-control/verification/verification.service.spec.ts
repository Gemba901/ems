import { UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import type { AccessTokenPayload } from 'src/auth/access-token-payload';
import { Role } from 'src/common/enum/role.enum';
import type {
  ApprovedKpiAssignment,
  DecisionOutcome,
  ExecutionProvider,
  PeriodTarget,
  SubmittedResult,
} from '../../common/contracts';
import {
  VerificationService,
  type VerifierContext,
} from './verification.service';

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
const target = (over: Partial<PeriodTarget> = {}): PeriodTarget => ({
  periodId: 'p-sep',
  start: '2026-09-01',
  end: '2026-09-30',
  scheduled: true,
  dueAt: '2026-10-05T00:00:00.000Z',
  value: 108,
  ...over,
});
const submission = (over: Partial<SubmittedResult> = {}): SubmittedResult => ({
  id: 'sub-1',
  assignmentId: 'kpi-1',
  periodId: 'p-sep',
  actual: 110,
  inputA: null,
  inputB: null,
  evidence: 'Production log SEP-26',
  note: null,
  correctionReason: null,
  submittedById: 'emp-provider',
  submittedAt: new Date('2026-10-02T09:00:00.000Z'),
  assignment: assignment(),
  target: target(),
  ...over,
});
const user = (roleLevel = Role.EMPLOYEE): AccessTokenPayload => ({
  tokenType: 'ACCESS',
  userId: 'user-1',
  organizationId: 'org-1',
  roleId: 1,
  roleLevel,
  email: null,
  isAdminOrg: false,
});

type Official = { assignmentId: string; periodId: string; actual: number };

function makeDb(
  me: { id: string; departmentId?: string; employmentStatus?: string } | null,
) {
  const db: any = {
    employee: {
      findFirst: jest.fn(
        async () =>
          me && { departmentId: 'dept-1', employmentStatus: 'ACTIVE', ...me },
      ),
      findMany: jest.fn(async () => []),
    },
    lexVerificationEvent: {
      create: jest.fn(async () => ({})),
      createMany: jest.fn(async () => ({ count: 1 })),
      findMany: jest.fn(async () => []),
    },
    $executeRaw: jest.fn(async () => 1),
  };
  db.$transaction = jest.fn(async (work: (tx: unknown) => unknown) => work(db));
  return db;
}
const makeExecution = (rows: SubmittedResult[], official: Official[]) => ({
  listSubmitted: jest.fn(async () => rows),
  listOfficial: jest.fn(async () => official),
  listActions: jest.fn(async () => []),
  getAction: jest.fn(async () => null),
  decide: jest.fn(
    async (_user: unknown, ids: string[]): Promise<DecisionOutcome> => ({
      done: ids,
      failed: null,
    }),
  ),
});
const make = (
  db: any,
  rows: SubmittedResult[] = [],
  official: Official[] = [],
) => {
  const execution = makeExecution(rows, official);
  const service = new VerificationService(
    db as unknown as PrismaService,
    execution as unknown as ExecutionProvider,
  );
  return { service, execution };
};

describe('VerificationService.checkSubmission (05.01 rules)', () => {
  const { service } = make(makeDb(null));
  const verifier: VerifierContext = {
    employeeId: 'emp-verifier',
    active: true,
  };
  const check = (
    s: SubmittedResult,
    actor = verifier,
    existing: { actual: number } | null = null,
  ) => service.checkSubmission(actor, s, existing, NOW);

  it('accepts a complete result from someone else, checked by the assigned verifier', () => {
    expect(check(submission())).toEqual([]);
  });
  it('blocks self-verification even when the submitter is also the assigned verifier', () => {
    const s = submission({ submittedById: 'emp-verifier' });
    expect(check(s)).toContain('You cannot verify a result you submitted.');
  });
  it('only the assigned verifier can verify', () => {
    expect(
      check(submission(), { employeeId: 'emp-other', active: true }),
    ).toContain('Only the assigned verifier can decide on this result.');
  });
  it('the verifier must be active', () => {
    expect(
      check(submission(), { employeeId: 'emp-verifier', active: false }),
    ).toContain('Only an active employee can verify results.');
  });
  it('a caller without an employee record gets one clear reason', () => {
    expect(
      service.authorityProblems(
        { employeeId: null, active: false },
        submission(),
      ),
    ).toEqual([
      'You need an employee record in this company to verify results.',
    ]);
  });
  it('the period must be scheduled and ended', () => {
    expect(
      check(submission({ target: target({ scheduled: false }) })),
    ).toContain('This period is not scheduled for this KPI.');
    expect(
      service.checkSubmission(
        verifier,
        submission(),
        null,
        new Date('2026-09-30T23:00:00Z'),
      ),
    ).toContain('This period has not ended yet.');
  });
  it('recalculates ratio / percent actuals from their inputs', () => {
    const pct = assignment({
      definition: {
        name: 'Reject rate',
        unit: '%',
        direction: 'lower',
        calc: 'percent',
        aggregation: 'ratio',
      },
    });
    expect(
      check(submission({ assignment: pct, actual: 2, inputA: 2, inputB: 100 })),
    ).toEqual([]);
    expect(
      check(submission({ assignment: pct, actual: 3, inputA: 2, inputB: 100 })),
    ).toContain('The stored actual does not match its inputs.');
    expect(
      check(
        submission({ assignment: pct, actual: 2, inputA: 2, inputB: null }),
      ),
    ).toContain('Both inputs are required for this KPI.');
    expect(
      check(submission({ assignment: pct, actual: 2, inputA: 2, inputB: 0 })),
    ).toContain('The second input cannot be zero.');
  });
  it('a range target needs a valid upper bound', () => {
    const range = assignment({
      definition: {
        name: 'Stock days',
        unit: 'days',
        direction: 'range',
        calc: 'direct',
        aggregation: 'closing',
      },
    });
    expect(
      check(
        submission({
          assignment: range,
          target: target({ value: 10, upper: null }),
        }),
      ),
    ).toContain('This range target needs a valid upper bound.');
    expect(
      check(
        submission({
          assignment: range,
          target: target({ value: 10, upper: 5 }),
        }),
      ),
    ).toContain('This range target needs a valid upper bound.');
    expect(
      check(
        submission({
          assignment: range,
          actual: 12,
          target: target({ value: 10, upper: 14 }),
        }),
      ),
    ).toEqual([]);
  });
  it('a zero KPI needs target 0 and a non-negative actual', () => {
    const zero = assignment({
      definition: {
        name: 'Lost-time injuries',
        unit: 'cases',
        direction: 'zero',
        calc: 'direct',
        aggregation: 'sum',
      },
    });
    expect(
      check(
        submission({
          assignment: zero,
          actual: 0,
          target: target({ value: 5 }),
        }),
      ),
    ).toContain('A zero-target KPI must have a target of 0.');
    expect(
      check(
        submission({
          assignment: zero,
          actual: -1,
          target: target({ value: 0 }),
        }),
      ),
    ).toContain('The actual cannot be negative for a zero-target KPI.');
  });
  it('requires a target, evidence, and submitter details', () => {
    const problems = check(
      submission({
        target: target({ value: null }),
        evidence: '  ',
        submittedById: '',
        submittedAt: null as any,
      }),
    );
    expect(problems).toEqual(
      expect.arrayContaining([
        'The period target is missing.',
        'Add an evidence or source reference.',
        'The submitter and submission time are missing.',
      ]),
    );
  });
  it('a correction of an official value needs a reason', () => {
    expect(check(submission(), verifier, { actual: 100 })).toContain(
      'A correction of an official value needs a reason.',
    );
    expect(
      check(submission({ correctionReason: 'Recount' }), verifier, {
        actual: 100,
      }),
    ).toEqual([]);
  });
});

describe('VerificationService.getQueue', () => {
  it('lists only results assigned to the caller, with their problems', async () => {
    const db = makeDb({ id: 'emp-verifier' });
    const other = submission({
      id: 'sub-2',
      assignment: assignment({ verifierId: 'emp-x' }),
    });
    const { service } = make(db, [submission({ evidence: null }), other]);
    const rows = await service.getQueue(user(), {});
    expect(rows.map((r) => r.submissionId)).toEqual(['sub-1']);
    expect(rows[0].problems).toEqual(['Add an evidence or source reference.']);
    expect(rows[0].isCorrection).toBe(false);
  });
  it('flags corrections and shows the current official value', async () => {
    const db = makeDb({ id: 'emp-verifier' });
    const { service } = make(
      db,
      [submission({ correctionReason: 'Recount' })],
      [{ assignmentId: 'kpi-1', periodId: 'p-sep', actual: 100 }],
    );
    const [row] = await service.getQueue(user(), {});
    expect(row.isCorrection).toBe(true);
    expect(row.currentOfficial).toBe(100);
  });
  it('a caller with no employee record has an empty queue', async () => {
    const { service, execution } = make(makeDb(null), [submission()]);
    expect(await service.getQueue(user(Role.SUPER_ADMIN), {})).toEqual([]);
    expect(execution.listSubmitted).not.toHaveBeenCalled();
  });
});

describe('VerificationService.verify', () => {
  it('asks Area 04 to verify, then records the history event', async () => {
    const db = makeDb({ id: 'emp-verifier' });
    const { service, execution } = make(db, [submission()]);
    await expect(
      service.verify(user(), { submissionIds: ['sub-1'], note: 'Checked log' }),
    ).resolves.toEqual({
      verified: 1,
    });

    expect(execution.decide).toHaveBeenCalledWith(
      expect.objectContaining({ userId: expect.any(String) }),
      ['sub-1'],
      'VERIFY',
      'Checked log',
    );
    const [event] = db.lexVerificationEvent.createMany.mock.calls[0][0].data;
    expect(event).toEqual(
      expect.objectContaining({
        action: 'VERIFIED',
        submissionId: 'sub-1',
        actual: 110,
        previousActual: null,
        actorId: 'emp-verifier',
      }),
    );
    expect(event.snapshot.verifierNote).toBe('Checked log');
  });

  it('when Area 04 stops part-way, keeps history for the saved ones and says which refused', async () => {
    const db = makeDb({ id: 'emp-verifier' });
    const second = submission({ id: 'sub-2', periodId: 'p-aug' });
    const { service, execution } = make(db, [submission(), second]);
    execution.decide.mockResolvedValueOnce({
      done: ['sub-1'],
      failed: { id: 'sub-2', message: 'Execution records changed.' },
    });
    const err = await service
      .verify(user(), { submissionIds: ['sub-1', 'sub-2'] })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnprocessableEntityException);
    const body = (err as UnprocessableEntityException).getResponse() as any;
    expect(body.message).toMatch(/^1 of 2 results were verified/);
    expect(body.failures).toEqual([
      { submissionId: 'sub-2', problems: ['Execution records changed.'] },
    ]);
    const data = db.lexVerificationEvent.createMany.mock.calls[0][0].data;
    expect(data.map((e: any) => e.submissionId)).toEqual(['sub-1']);
  });

  it('records the replaced value and reason on a correction', async () => {
    const db = makeDb({ id: 'emp-verifier' });
    const { service } = make(
      db,
      [submission({ correctionReason: 'Recount after audit' })],
      [{ assignmentId: 'kpi-1', periodId: 'p-sep', actual: 100 }],
    );
    await service.verify(user(), { submissionIds: ['sub-1'] });
    expect(db.lexVerificationEvent.createMany.mock.calls[0][0].data[0]).toEqual(
      expect.objectContaining({
        previousActual: 100,
        reason: 'Recount after audit',
      }),
    );
  });

  it('changes nothing when any selected row fails, and says which', async () => {
    const db = makeDb({ id: 'emp-verifier' });
    const mine = submission({
      id: 'sub-2',
      periodId: 'p-aug',
      submittedById: 'emp-verifier',
    });
    const { service, execution } = make(db, [submission(), mine]);

    const err = await service
      .verify(user(), { submissionIds: ['sub-1', 'sub-2', 'sub-missing'] })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnprocessableEntityException);
    const { failures } = (
      err as UnprocessableEntityException
    ).getResponse() as any;
    expect(failures.map((f: any) => f.submissionId)).toEqual([
      'sub-2',
      'sub-missing',
    ]);
    expect(db.lexVerificationEvent.createMany).not.toHaveBeenCalled();
    expect(execution.decide).not.toHaveBeenCalled();
  });

  it('rejects two submissions for the same KPI period in one batch', async () => {
    const db = makeDb({ id: 'emp-verifier' });
    const { service, execution } = make(db, [
      submission(),
      submission({ id: 'sub-2' }),
    ]);
    await expect(
      service.verify(user(), { submissionIds: ['sub-1', 'sub-2'] }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(execution.decide).not.toHaveBeenCalled();
  });
});

describe('VerificationService.returnForCorrection', () => {
  it('logs RETURNED with the reason and leaves the official value alone', async () => {
    const db = makeDb({ id: 'emp-verifier' });
    // Bad data is exactly why you return it: only authority is checked.
    const { service, execution } = make(db, [submission({ evidence: null })]);
    await expect(
      service.returnForCorrection(user(), {
        submissionIds: ['sub-1'],
        reason: '  Attach the log  ',
      }),
    ).resolves.toEqual({ returned: 1 });
    expect(db.lexVerificationEvent.createMany.mock.calls[0][0].data[0]).toEqual(
      expect.objectContaining({
        action: 'RETURNED',
        reason: 'Attach the log',
        actorId: 'emp-verifier',
      }),
    );
    expect(execution.decide).toHaveBeenCalledWith(
      expect.anything(),
      ['sub-1'],
      'RETURN',
      'Attach the log',
    );
  });
  it('only the assigned verifier can return', async () => {
    const db = makeDb({ id: 'emp-other' });
    const { service, execution } = make(db, [submission()]);
    await expect(
      service.returnForCorrection(user(), {
        submissionIds: ['sub-1'],
        reason: 'Fix it',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(execution.decide).not.toHaveBeenCalled();
  });
  it('a blank reason is refused', async () => {
    const { service } = make(makeDb({ id: 'emp-verifier' }), [submission()]);
    await expect(
      service.returnForCorrection(user(), {
        submissionIds: ['sub-1'],
        reason: '   ',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});

describe('VerificationService.getHistory', () => {
  const event = (id: string, departmentId: string) => ({
    id,
    submissionId: `sub-${id}`,
    assignmentId: `kpi-${id}`,
    periodId: 'p-sep',
    action: 'VERIFIED',
    actual: '110',
    previousActual: null,
    reason: null,
    actorId: 'emp-verifier',
    createdAt: NOW,
    snapshot: {
      assignment: assignment({
        id: `kpi-${id}`,
        departmentId,
        verifierId: 'emp-x',
        ownerId: 'emp-y',
        providerId: 'emp-z',
      }),
    },
  });

  it('an HOD sees their own department only', async () => {
    const db = makeDb({ id: 'emp-hod', departmentId: 'dept-1' });
    db.lexVerificationEvent.findMany.mockResolvedValue([
      event('a', 'dept-1'),
      event('b', 'dept-2'),
    ]);
    const { service } = make(db);
    const rows = await service.getHistory(user(Role.HOD), {});
    expect(rows.map((r) => r.id)).toEqual(['a']);
    expect(rows[0].actual).toBe(110);
  });
  it('filters by month on the decision date', async () => {
    const db = makeDb({ id: 'emp-admin' });
    const { service } = make(db);
    await service.getHistory(user(Role.ADMIN), { month: '2026-10' });
    expect(
      db.lexVerificationEvent.findMany.mock.calls[0][0].where.createdAt,
    ).toEqual({
      gte: new Date('2026-10-01T00:00:00.000Z'),
      lt: new Date('2026-11-01T00:00:00.000Z'),
    });
  });
});
