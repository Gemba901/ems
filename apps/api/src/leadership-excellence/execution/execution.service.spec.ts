import type { PrismaService } from '../../prisma/prisma.service';
import type { AccessTokenPayload } from '../../auth/access-token-payload';
import { Role } from '../../common/enum/role.enum';
import type { PerformancePlanningService } from '../performance-planning/performance-planning.service';
import {
  blankData,
  itemDefaults,
} from '../performance-planning/planning.rules';
import { emptyPlanningState } from '../performance-planning/planning.seed';
import type {
  Assignment,
  Goal,
  KpiDefinition,
  PlanningDocument,
} from '../performance-planning/planning.types';
import { ExecutionService } from './execution.service';
import {
  emptyExecutionState,
  type ExecutionSource,
} from './execution.projection';
import type { ExecutionState } from './execution.types';

const user: AccessTokenPayload = {
  tokenType: 'ACCESS',
  userId: 'u-worker',
  organizationId: 'org-a',
  roleId: 7,
  roleLevel: Role.EMPLOYEE,
  email: null,
  isAdminOrg: false,
};
function harness() {
  const definition: KpiDefinition = {
    id: 'kpi',
    code: 'K1',
    kraId: 'kra',
    name: 'Waste rate',
    meaning: 'Verified production cost per unit',
    unit: 'KES/unit',
    direction: 'LOWER',
    formula: 'RATIO',
    inputA: 'Cost',
    inputB: 'Units',
    aggregation: 'RATIO',
    source: 'CUSTOM',
  };
  const goal = {
    ...itemDefaults('goal'),
    id: 'goal',
    code: 'G1',
    title: 'Reduce waste',
    ownerId: 'worker',
  } as Goal;
  const assignment = {
    ...itemDefaults('assignment'),
    id: 'assignment',
    code: 'A1',
    goalId: goal.id,
    definitionId: definition.id,
    providerId: 'worker',
    verifierId: 'checker',
    ownerId: 'worker',
    startDate: '2026-01-01',
    endDate: '2026-01-03',
    updateFrequency: 'DAILY',
    reviewFrequency: 'MONTHLY',
    baseline: null,
    baselineReason: '',
    source: 'Production register',
    createdAt: '2026-01-01',
    createdBy: 'checker',
    updatedAt: '2026-01-01',
    updatedBy: 'checker',
    targetMode: 'SAME',
    target: 40,
    upper: null,
    targets: [],
  } as Assignment;
  const data = {
    ...blankData(),
    title: 'Production 2026',
    goals: [goal],
    assignments: [assignment],
  };
  const document: PlanningDocument = {
    id: 'plan',
    code: 'P1',
    kind: 'DEPARTMENT',
    scopeId: 'production',
    departmentId: 'production',
    cycle: '2026',
    status: 'APPROVED',
    data,
    versions: [
      {
        version: 1,
        data: structuredClone(data),
        effectiveDate: '2026-01-01',
        approvedAt: '2026-01-01',
        approvedBy: 'checker',
        definitions: [definition],
        reason: '',
      },
    ],
    revisionReason: '',
    effectiveDate: '',
    history: [],
    acknowledgement: null,
  };
  const source: ExecutionSource = {
    revision: 5,
    state: { ...emptyPlanningState(), documents: [document] },
    actor: {
      userId: user.userId,
      employeeId: 'worker',
      departmentId: 'production',
      name: 'Worker',
      role: 'EMPLOYEE',
    },
    references: {
      people: [],
      departments: [{ id: 'production', name: 'Production' }],
      teams: [],
      pillars: [],
      timeZone: 'UTC',
    },
  };
  type Stored = {
    organizationId: string;
    revision: number;
    state: ExecutionState;
  };
  let rows = new Map<string, Stored>();
  let lockedRevision = 5;
  const db = {
    $queryRaw: async () => [{ revision: lockedRevision }],
    lexExecutionWorkspace: {
      findUnique: async ({ where }: { where: { organizationId: string } }) =>
        structuredClone(rows.get(where.organizationId) || null),
      upsert: async ({ where }: { where: { organizationId: string } }) => {
        if (!rows.has(where.organizationId))
          rows.set(where.organizationId, {
            organizationId: where.organizationId,
            revision: 0,
            state: emptyExecutionState(),
          });
        return structuredClone(rows.get(where.organizationId)!);
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { organizationId: string; revision: number };
        data: { state: ExecutionState; revision: { increment: number } };
      }) => {
        const row = rows.get(where.organizationId);
        if (!row || row.revision !== where.revision) return { count: 0 };
        rows.set(where.organizationId, {
          ...row,
          revision: row.revision + data.revision.increment,
          state: structuredClone(data.state),
        });
        return { count: 1 };
      },
    },
    $transaction: async <T>(work: (tx: unknown) => Promise<T>) => {
      const before = structuredClone(rows);
      try {
        return await work(db);
      } catch (error) {
        rows = before;
        throw error;
      }
    },
  };
  const planning = { getExecutionSource: async () => structuredClone(source) };
  const service = new ExecutionService(
    db as unknown as PrismaService,
    planning as unknown as PerformancePlanningService,
  );
  return {
    service,
    source,
    rows: () => rows,
    changePlan: () => {
      lockedRevision++;
    },
  };
}
const row = (
  periodId: string,
  inputA: number | null = 6000,
  inputB: number | null = 100,
) => ({ periodId, inputA, inputB, note: '', evidence: '' });
const save = (expectedRevision: number, rows: ReturnType<typeof row>[]) => ({
  action: 'SAVE_RESULTS' as const,
  expectedRevision,
  payload: { assignmentKey: 'plan/assignment/v1', rows },
});

describe('Execution persistence boundary', () => {
  it('persists a draft independently of the approved plan and uses tenant isolation', async () => {
    const h = harness();
    const result = await h.service.command(
      user,
      save(0, [row('2026-01-01/2026-01-01')]),
    );
    expect(result.revision).toBe(1);
    expect(result.results[0]).toMatchObject({
      status: 'DRAFT',
      actual: 60,
      official: null,
    });
    expect(
      h.source.state.documents[0].versions[0].data.assignments[0].target,
    ).toBe(40);
    expect(
      (await h.service.getWorkspace({ ...user, organizationId: 'org-b' }))
        .results,
    ).toEqual([]);
  });
  it('rejects stale revisions without overwriting the current update', async () => {
    const h = harness();
    await h.service.command(user, save(0, [row('2026-01-01/2026-01-01')]));
    await expect(
      h.service.command(user, save(0, [row('2026-01-01/2026-01-01', 1, 1)])),
    ).rejects.toThrow('changed');
    expect((await h.service.getWorkspace(user)).results[0].actual).toBe(60);
  });
  it('rolls back the whole batch if a later row fails validation', async () => {
    const h = harness();
    await expect(
      h.service.command(user, {
        ...save(0, [
          row('2026-01-01/2026-01-01'),
          row('2026-01-02/2026-01-02', null, null),
        ]),
        action: 'SUBMIT_RESULTS',
      }),
    ).rejects.toThrow('source figures');
    expect(h.rows().size).toBe(0);
  });
  it('checks planning revision under the shared row lock before writing', async () => {
    const h = harness();
    h.changePlan();
    await expect(
      h.service.command(user, save(0, [row('2026-01-01/2026-01-01')])),
    ).rejects.toThrow('approved plan changed');
    expect(h.rows().size).toBe(0);
  });
  it('persists submitted rows and blocks a second edit while verification is pending', async () => {
    const h = harness();
    const command = {
      ...save(0, [row('2026-01-01/2026-01-01')]),
      action: 'SUBMIT_RESULTS' as const,
    };
    expect((await h.service.command(user, command)).results[0].status).toBe(
      'SUBMITTED',
    );
    await expect(
      h.service.command(user, save(1, [row('2026-01-01/2026-01-01')])),
    ).rejects.toThrow('locked');
    expect((await h.service.getWorkspace(user)).revision).toBe(1);
  });
});
