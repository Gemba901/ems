import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { AccessTokenPayload } from '../../auth/access-token-payload';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ModuleGuard } from '../../auth/guards/module.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Role } from '../../common/enum/role.enum';
import type { PrismaService } from '../../prisma/prisma.service';
import { TenantGuard } from '../../tenancy/tenant.guard';
import { TENANT_REQUIRED_KEY } from '../../tenancy/tenant-route.decorator';
import { TrustedTenantContextGuard } from '../../tenancy/trusted-tenant-context.guard';
import type { PerformancePlanningService } from '../performance-planning/performance-planning.service';
import {
  blankData,
  itemDefaults,
} from '../performance-planning/planning.rules';
import { emptyPlanningState } from '../performance-planning/planning.seed';
import type {
  ApprovedVersion,
  Assignment,
  DeliveryAction,
  Goal,
  KpiDefinition,
  PlanningActor,
  PlanningDocument,
} from '../performance-planning/planning.types';
import { ExecutionController } from './execution.controller';
import {
  actionKey,
  emptyExecutionState,
  type ExecutionSource,
} from './execution.projection';
import { ExecutionService } from './execution.service';
import type { ExecutionResult, ExecutionState } from './execution.types';

const root = '/leadership-excellence/execution';
const user = (id = 'hod', organizationId = 'org-a'): AccessTokenPayload => ({
  tokenType: 'ACCESS',
  userId: id,
  organizationId,
  roleId: 7,
  roleLevel: id === 'hod' ? Role.HOD : Role.EMPLOYEE,
  email: null,
  isAdminOrg: false,
});
const stamp = (id: string) => ({
  id,
  code: id.toUpperCase(),
  createdAt: '',
  createdBy: '',
  updatedAt: '',
  updatedBy: '',
});
function fixtureDocument(): PlanningDocument {
  const definition: KpiDefinition = {
    id: 'kpi',
    code: 'KPI',
    kraId: 'kra',
    name: 'Output',
    meaning: 'Accepted units',
    unit: 'units',
    direction: 'HIGHER',
    formula: 'DIRECT',
    inputA: 'Units',
    inputB: '',
    aggregation: 'SUM',
    source: 'CUSTOM',
  };
  const goal = {
    ...itemDefaults('goal'),
    ...stamp('goal'),
    title: 'Approved goal',
    ownerId: 'goal-owner',
    definitionId: definition.id,
  } as Goal;
  const assignment: Assignment = {
    ...stamp('assignment'),
    goalId: goal.id,
    definitionId: definition.id,
    ownerId: 'owner',
    providerId: 'provider',
    verifierId: 'verifier',
    baseline: 30,
    baselineReason: '',
    startDate: '2020-01-01',
    endDate: '2020-01-02',
    source: 'Production register',
    updateFrequency: 'DAILY',
    reviewFrequency: 'MONTHLY',
    targetMode: 'SAME',
    target: 40,
    upper: null,
    targets: [
      {
        id: '2020-01-01/2020-01-01',
        label: '1 Jan',
        start: '2020-01-01',
        end: '2020-01-01',
        target: 40,
        upper: null,
        scheduled: true,
      },
      {
        id: '2020-01-02/2020-01-02',
        label: '2 Jan',
        start: '2020-01-02',
        end: '2020-01-02',
        target: null,
        upper: null,
        scheduled: false,
      },
    ],
  };
  const actions: DeliveryAction[] = [
    'action',
    'untouched',
    'blocked',
    'own-check',
  ].map((id) => ({
    ...stamp(id),
    title: id,
    goalId: goal.id,
    parentActionId: '',
    ownerId: id === 'own-check' ? 'hod' : 'owner',
    dueDate: '2020-12-01',
    expectedResult: 'Delivered',
    completionEvidence: 'Signed check',
    support: '',
    sources: [
      { documentId: 'swot', findingId: 'confidential-finding', version: 1 },
    ],
  }));
  const data = {
    ...blankData(),
    title: 'Approved production plan',
    goals: [goal],
    assignments: [assignment],
    actions,
    findings: [
      {
        ...itemDefaults('finding'),
        ...stamp('finding'),
        title: 'CONFIDENTIAL SWOT',
      },
    ] as ReturnType<typeof blankData>['findings'],
  };
  const first: ApprovedVersion = {
    version: 1,
    data,
    definitions: [definition],
    approvedAt: '2020-01-01',
    approvedBy: 'approver',
    effectiveDate: '2020-01-01',
    reason: '',
    approvedItem: { kind: 'goal', itemId: goal.id },
  };
  const second = structuredClone(first);
  second.version = 2;
  second.effectiveDate = '2020-02-01';
  second.data.assignments[0].target = 25;
  second.data.assignments[0].targets[0].target = 25;
  second.definitions[0].meaning = 'Revised definition';
  const future = structuredClone(second);
  future.version = 3;
  future.effectiveDate = '2999-01-01';
  const draft = structuredClone(second.data);
  draft.goals[0].title = 'UNAPPROVED DRAFT';
  draft.assignments[0].targets[0].target = 999;
  return {
    id: 'plan',
    code: 'PLAN',
    kind: 'DEPARTMENT',
    departmentId: 'production',
    scopeId: 'production',
    cycle: '2020',
    status: 'APPROVED',
    data: draft,
    versions: [first, second, future],
    revisionReason: '',
    effectiveDate: '',
    history: [],
    acknowledgement: null,
  };
}

function harness() {
  const documents = [fixtureDocument()];
  const state = emptyExecutionState();
  for (const id of ['action', 'blocked', 'own-check'])
    state.actionUpdates.push({
      actionKey: actionKey('plan', id),
      status: id === 'blocked' ? 'BLOCKED' : 'PENDING_CHECK',
      progress: id === 'blocked' ? 20 : 100,
      note: 'Completion submitted',
      evidence: 'Signed delivery evidence',
      delayReason: '',
      updatedAt: '2020-03-01',
      updatedBy: id === 'own-check' ? 'hod' : 'owner',
      history: [],
    });
  const result: ExecutionResult = {
    id: 'result',
    assignmentKey: 'plan/assignment/v1',
    periodId: '2020-01-01/2020-01-01',
    inputA: 42,
    inputB: null,
    actual: 42,
    note: 'Submission',
    evidence: 'Signed register',
    status: 'SUBMITTED',
    updatedAt: '2020-03-01',
    updatedBy: 'provider',
    submittedAt: '2020-03-01',
    verificationNote: '',
    history: [],
    official: {
      actual: 38,
      inputA: 38,
      inputB: null,
      verifiedAt: '2020-02-01',
      verifiedBy: 'verifier',
    },
  };
  state.results.push(result);
  type Stored = {
    organizationId: string;
    revision: number;
    state: ExecutionState;
  };
  let rows = new Map<string, Stored>([
    ['org-a', { organizationId: 'org-a', revision: 8, state }],
  ]);
  let planningRevision = 12;
  const db = {
    $queryRaw: jest.fn(async () => [{ revision: planningRevision }]),
    lexExecutionWorkspace: {
      findUnique: jest.fn(
        async ({ where }: { where: { organizationId: string } }) =>
          structuredClone(rows.get(where.organizationId) ?? null),
      ),
      upsert: jest.fn(
        async ({ where }: { where: { organizationId: string } }) => {
          if (!rows.has(where.organizationId))
            rows.set(where.organizationId, {
              organizationId: where.organizationId,
              revision: 0,
              state: emptyExecutionState(),
            });
          return structuredClone(rows.get(where.organizationId)!);
        },
      ),
      updateMany: jest.fn(
        async ({
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
      ),
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
  const planning = {
    getExecutionSource: jest.fn(
      async (actorUser: AccessTokenPayload): Promise<ExecutionSource> => {
        const actor: PlanningActor = {
          userId: actorUser.userId,
          employeeId: actorUser.userId,
          name: actorUser.userId,
          role: actorUser.userId === 'hod' ? 'HOD' : 'EMPLOYEE',
          departmentId: actorUser.userId === 'hod' ? 'production' : 'quality',
        };
        return {
          revision: 12,
          actor,
          state: {
            ...emptyPlanningState(),
            documents:
              actorUser.organizationId === 'org-a'
                ? structuredClone(documents)
                : [],
          },
          references: {
            departments: [{ id: 'production', name: 'Production' }],
            people: [],
            teams: [],
            pillars: [],
            timeZone: 'UTC',
          },
        };
      },
    ),
  };
  const service = new ExecutionService(
    db as unknown as PrismaService,
    planning as unknown as PerformancePlanningService,
  );
  return {
    service,
    db,
    planning,
    documents,
    rows: () => rows,
    changePlan: () => planningRevision++,
  };
}

describe('Area 04 execution workspace and commands', () => {
  let h: ReturnType<typeof harness>;
  let app: INestApplication;
  beforeEach(async () => {
    h = harness();
    const builder = Test.createTestingModule({
      controllers: [ExecutionController],
      providers: [{ provide: ExecutionService, useValue: h.service }],
    });
    // Only authentication/tenant transport is replaced. Real projection, DTOs,
    // controller, service and command rules run against the isolated repository.
    builder.overrideGuard(TrustedTenantContextGuard).useValue({
      canActivate: (context: {
        switchToHttp(): {
          getRequest(): {
            user: AccessTokenPayload;
            headers: Record<string, string>;
          };
        };
      }) => {
        const incoming = context.switchToHttp().getRequest();
        incoming.user = user(
          incoming.headers['x-test-user'] || 'hod',
          incoming.headers['x-test-tenant'] || 'org-a',
        );
        return true;
      },
    });
    for (const guard of [JwtAuthGuard, TenantGuard, RolesGuard, ModuleGuard])
      builder.overrideGuard(guard).useValue({ canActivate: () => true });
    app = (await builder.compile()).createNestApplication();
    await app.init();
  });
  afterEach(async () => {
    await app?.close();
  });

  it('retains all tenant, authentication, role and module guards', () => {
    expect(Reflect.getMetadata(TENANT_REQUIRED_KEY, ExecutionController)).toBe(
      true,
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, ExecutionController)).toEqual([
      TrustedTenantContextGuard,
      JwtAuthGuard,
      TenantGuard,
      RolesGuard,
      ModuleGuard,
    ]);
  });

  it('keeps approved goals, KPI periods and actions available through the Area 04 workspace', async () => {
    const response = await request(app.getHttpServer())
      .get(root + '/workspace')
      .set('x-test-user', 'owner')
      .expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toMatchObject({ revision: 8, planningRevision: 12 });
    expect(response.body.goals.length).toBeGreaterThan(0);
    expect(response.body.assignments.length).toBeGreaterThan(0);
    expect(response.body.assignments[0].periods.length).toBeGreaterThan(0);
    expect(response.body.actions.length).toBeGreaterThan(0);
    expect(JSON.stringify(response.body)).not.toMatch(
      /CONFIDENTIAL|UNAPPROVED/,
    );
    const outsider = await request(app.getHttpServer())
      .get(root + '/workspace')
      .set('x-test-user', 'outsider')
      .expect(200);
    expect(outsider.body.goals).toEqual([]);
    expect(outsider.body.actions).toEqual([]);
  });

  it('keeps action progress and completion checks working through existing commands', async () => {
    const plans = structuredClone(h.documents);
    const updated = await request(app.getHttpServer())
      .post(root + '/commands')
      .set('x-test-user', 'owner')
      .send({
        expectedRevision: 8,
        action: 'UPDATE_ACTION',
        payload: {
          actionKey: 'plan/action/untouched',
          status: 'IN_PROGRESS',
          progress: 25,
          note: 'First setup checks complete',
        },
      })
      .expect(201);
    expect(
      updated.body.actionUpdates.find(
        (row: { actionKey: string }) =>
          row.actionKey === 'plan/action/untouched',
      ),
    ).toMatchObject({ status: 'IN_PROGRESS', progress: 25 });
    const checked = await request(app.getHttpServer())
      .post(root + '/commands')
      .send({
        expectedRevision: 9,
        action: 'CHECK_ACTION',
        payload: {
          actionKey: 'plan/action/action',
          decision: 'COMPLETE',
          note: 'Evidence confirmed',
        },
      })
      .expect(201);
    expect(
      checked.body.actionUpdates.find(
        (row: { actionKey: string }) => row.actionKey === 'plan/action/action',
      ),
    ).toMatchObject({ status: 'COMPLETED', progress: 100 });
    expect(h.rows().get('org-a')!.state.results[0].status).toBe('SUBMITTED');
    expect(h.documents).toEqual(plans);
  });

  it('retains the existing verifier-scoped submissions queue', async () => {
    const verifier = await request(app.getHttpServer())
      .get(root + '/submissions')
      .set('x-test-user', 'verifier')
      .expect(200);
    expect(verifier.body.results).toHaveLength(1);
    expect(verifier.body.results[0]).toMatchObject({
      id: 'result',
      status: 'SUBMITTED',
    });
    const provider = await request(app.getHttpServer())
      .get(root + '/submissions')
      .set('x-test-user', 'provider')
      .expect(200);
    expect(provider.body.results).toEqual([]);
  });

  it('does not expose the removed Area 05 integration routes', async () => {
    for (const route of [
      '/actions',
      '/actions/pending-check',
      '/actions/action',
      '/assignments',
      '/assignments/assignment/targets',
      '/goals',
    ])
      await request(app.getHttpServer())
        .get(root + route)
        .expect(404);
    for (const route of [
      '/actions/follow-up',
      '/actions/action/completion-check',
      '/results/result/verify',
      '/results/result/return',
    ])
      await request(app.getHttpServer())
        .post(root + route)
        .send({})
        .expect(404);
    expect(h.db.lexExecutionWorkspace.updateMany).not.toHaveBeenCalled();
  });

  function seedSupport() {
    h.rows().get('org-a')!.state.supportRequests.push({
      id: 'support-acceptance',
      goalKey: 'plan/goal/v2',
      actionKey: null,
      title: 'Need a setup checklist',
      request: 'Please provide the approved checklist before the next shift.',
      requestorId: 'provider',
      assignedToId: 'owner',
      dueDate: '2027-01-31',
      status: 'OPEN',
      response: '',
      createdAt: '2020-01-01T09:00:00.000Z',
      history: [],
    });
  }

  it('persists recipient acknowledgement through the command API and exposes it to the sender', async () => {
    seedSupport();
    const result = await request(app.getHttpServer())
      .post(`${root}/commands`)
      .set('x-test-user', 'owner')
      .send({
        expectedRevision: 8,
        action: 'ACKNOWLEDGE_SUPPORT',
        payload: { id: 'support-acceptance', at: '1990-01-01', by: 'forged' },
      })
      .expect(201);
    const accepted = result.body.supportRequests.find(
      (row: { id: string }) => row.id === 'support-acceptance',
    );
    expect(accepted.status).toBe('IN_PROGRESS');
    expect(accepted.acknowledgement).toMatchObject({
      by: 'owner',
      name: 'owner',
    });
    expect(new Date(accepted.acknowledgement.at).getTime()).toBeGreaterThan(
      new Date('2020-01-01').getTime(),
    );
    expect(
      h.rows().get('org-a')!.state.supportRequests[0].acknowledgement,
    ).toEqual(accepted.acknowledgement);
    const sender = await request(app.getHttpServer())
      .get(`${root}/workspace`)
      .set('x-test-user', 'provider')
      .expect(200);
    expect(sender.body.supportRequests[0].acknowledgement).toEqual(
      accepted.acknowledgement,
    );
    expect(sender.body.supportRequests[0].canAcknowledge).toBe(false);
    await request(app.getHttpServer())
      .post(`${root}/commands`)
      .set('x-test-user', 'owner')
      .send({
        expectedRevision: 9,
        action: 'ACKNOWLEDGE_SUPPORT',
        payload: { id: accepted.id },
      })
      .expect(201);
    expect(
      h.rows().get('org-a')!.state.supportRequests[0].acknowledgement,
    ).toEqual(accepted.acknowledgement);
    expect(
      h.rows().get('org-a')!.state.supportRequests[0].history,
    ).toHaveLength(1);
  });

  it('rejects sender or cross-tenant acceptance and stale revisions without changing support records', async () => {
    seedSupport();
    const before = structuredClone(h.rows().get('org-a'));
    const command = {
      expectedRevision: 8,
      action: 'ACKNOWLEDGE_SUPPORT',
      payload: { id: 'support-acceptance' },
    };
    await request(app.getHttpServer())
      .post(`${root}/commands`)
      .set('x-test-user', 'provider')
      .send(command)
      .expect(403);
    await request(app.getHttpServer())
      .post(`${root}/commands`)
      .set('x-test-user', 'owner')
      .set('x-test-tenant', 'org-b')
      .send({ ...command, expectedRevision: 0 })
      .expect(404);
    await request(app.getHttpServer())
      .post(`${root}/commands`)
      .set('x-test-user', 'owner')
      .send({ ...command, expectedRevision: 7 })
      .expect(409);
    expect(h.rows().get('org-a')).toEqual(before);
    expect(h.rows().has('org-b')).toBe(false);
  });
});
