import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import type { AccessTokenPayload } from '../../auth/access-token-payload';
import { Role } from '../../common/enum/role.enum';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PerformancePlanningService } from '../performance-planning/performance-planning.service';
import {
  blankData,
  itemDefaults,
} from '../performance-planning/planning.rules';
import { emptyPlanningState } from '../performance-planning/planning.seed';
import type {
  Goal,
  PlanningActor,
  PlanningDocument,
} from '../performance-planning/planning.types';
import { ExecutionCommandDto } from './dto/execution.dto';
import {
  emptyExecutionState,
  projectExecution,
  type ExecutionSource,
} from './execution.projection';
import { applyExecutionCommand } from './execution.rules';
import { ExecutionService } from './execution.service';
import type {
  ExecutionCommand,
  ExecutionState,
  ExecutionSupportRequest,
} from './execution.types';

const acceptedAt = '2026-11-19T12:00:00.000Z';
const actor = (id = 'support', role = 'EMPLOYEE'): PlanningActor => ({
  userId: `user-${id}`,
  employeeId: id,
  departmentId: id === 'hod' ? 'production' : 'quality',
  name: `${id} name`,
  role,
});
function source(person = actor()): ExecutionSource {
  const goal = {
    ...itemDefaults('goal'),
    id: 'goal',
    code: 'G1',
    title: 'Approved production goal',
    ownerId: 'requester',
  } as Goal;
  const data = { ...blankData(), title: 'Production plan', goals: [goal] };
  const document: PlanningDocument = {
    id: 'plan',
    code: 'P1',
    kind: 'DEPARTMENT',
    scopeId: 'production',
    departmentId: 'production',
    cycle: '2026',
    status: 'APPROVED',
    data: {
      ...structuredClone(data),
      goals: [goal, { ...goal, id: 'draft', title: 'Confidential draft' }],
    },
    versions: [
      {
        version: 1,
        data,
        effectiveDate: '2026-01-01',
        approvedAt: '2026-01-01T00:00:00Z',
        approvedBy: 'user-hod',
        definitions: [],
        reason: '',
      },
    ],
    revisionReason: '',
    effectiveDate: '',
    history: [],
    acknowledgement: null,
  };
  return {
    revision: 7,
    actor: person,
    state: { ...emptyPlanningState(), documents: [document] },
    references: {
      departments: [
        { id: 'production', name: 'Production' },
        { id: 'quality', name: 'Quality' },
      ],
      people: ['requester', 'support', 'other'].map((id) => ({
        id,
        name: `${id} name`,
        departmentId: 'quality',
        position: 'Engineer',
        role: 'EMPLOYEE',
        userId: `user-${id}`,
      })),
      teams: [],
      pillars: [],
      timeZone: 'UTC',
    },
  };
}
const supportRequest = (
  overrides: Partial<ExecutionSupportRequest> = {},
): ExecutionSupportRequest => ({
  id: 'support-request',
  goalKey: 'plan/goal/v1',
  actionKey: null,
  title: 'Calibrate scale',
  request: 'Please calibrate the production scale.',
  requestorId: 'requester',
  assignedToId: 'support',
  dueDate: '2026-11-25',
  status: 'OPEN',
  response: '',
  createdAt: '2026-11-18T09:00:00.000Z',
  history: [
    {
      at: '2026-11-18T09:00:00.000Z',
      by: 'user-requester',
      name: 'requester name',
      event: 'Support requested',
      detail: 'Please calibrate the production scale.',
    },
  ],
  ...overrides,
});
const stateWith = (overrides: Partial<ExecutionSupportRequest> = {}) => ({
  ...emptyExecutionState(),
  supportRequests: [supportRequest(overrides)],
});
const view = (state: ExecutionState, person = actor()) =>
  projectExecution(source(person), state, 0, '2026-11-19');
const command = (
  action: ExecutionCommand['action'] = 'ACKNOWLEDGE_SUPPORT',
  payload: Record<string, unknown> = { id: 'support-request' },
): ExecutionCommand => ({ expectedRevision: 0, action, payload });
const update = (status: string) =>
  command('UPDATE_SUPPORT', {
    id: 'support-request',
    status,
    response: 'Calibration update',
  });

describe('Area 04 support acceptance', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(Date.parse(acceptedAt)));
  afterEach(() => jest.useRealTimers());

  it('accepts the dedicated command through the request DTO', () => {
    expect(
      validateSync(plainToInstance(ExecutionCommandDto, command())),
    ).toEqual([]);
    expect(
      validateSync(
        plainToInstance(ExecutionCommandDto, {
          ...command(),
          action: 'FORGE_SUPPORT_ACCEPTANCE',
        }),
      ),
    ).not.toHaveLength(0);
  });

  it('creates pending support without accepting client supplied timestamps or identity', () => {
    const state = emptyExecutionState();
    applyExecutionCommand(
      state,
      command('CREATE_SUPPORT', {
        goalKey: 'plan/goal/v1',
        title: 'Calibrate scale',
        request: 'Please calibrate.',
        assignedToId: 'support',
        dueDate: '2026-11-25',
        status: 'IN_PROGRESS',
        createdAt: '2000-01-01T00:00:00Z',
        acknowledgement: {
          at: '2000-01-01T00:00:00Z',
          by: 'forged',
          name: 'Forged',
        },
      }),
      view(state, actor('requester')),
    );
    expect(state.supportRequests[0]).toMatchObject({
      status: 'OPEN',
      createdAt: acceptedAt,
      acknowledgement: null,
      requestorId: 'requester',
    });
    expect(
      state.supportRequests[0].history.map((entry) => entry.event),
    ).toEqual(['Support requested']);
  });

  it.each([
    ['employee identifier', actor(), 'support'],
    ['user identifier', { ...actor(), employeeId: '' }, 'user-support'],
    [
      'linked EMS user',
      { ...actor(), employeeId: 'different-employee' },
      'support',
    ],
  ])(
    'recognizes the assigned recipient by %s without granting plan access',
    (_label, person, assignedToId) => {
      const state = stateWith({ assignedToId });
      const projected = view(state, person);
      expect(projected.supportRequests[0].canAcknowledge).toBe(true);
      expect(projected.goals).toEqual([]);
      applyExecutionCommand(state, command(), projected);
      expect(state.supportRequests[0].acknowledgement).toEqual({
        at: acceptedAt,
        by: 'user-support',
        name: 'support name',
      });
    },
  );

  it.each([
    actor('requester'),
    actor('manager', 'MANAGEMENT'),
    actor('hod', 'HOD'),
  ])(
    'prevents $role $name from accepting for the assigned person',
    (person) => {
      const state = stateWith();
      const projected = view(state, person);
      expect(projected.supportRequests[0].canAcknowledge).toBe(false);
      projected.supportRequests[0].canAcknowledge = true;
      expect(() =>
        applyExecutionCommand(
          state,
          command('ACKNOWLEDGE_SUPPORT', {
            id: 'support-request',
            assignedToId: person.employeeId,
            acknowledgement: {
              at: acceptedAt,
              by: person.userId,
              name: person.name,
            },
          }),
          projected,
        ),
      ).toThrow(/Only the assigned support person/);
      expect(state.supportRequests[0]).not.toHaveProperty('acknowledgement');
      expect(state.supportRequests[0].history).toHaveLength(1);
    },
  );

  it('uses server identity and time, preserves the response, and records acceptance once', () => {
    const state = stateWith({ response: 'Existing management note' });
    applyExecutionCommand(
      state,
      command('ACKNOWLEDGE_SUPPORT', {
        id: 'support-request',
        at: '2000-01-01T00:00:00Z',
        by: 'forged',
        name: 'Forged',
        acknowledgement: {
          at: '2000-01-01T00:00:00Z',
          by: 'forged',
          name: 'Forged',
        },
      }),
      view(state),
    );
    const request = state.supportRequests[0];
    expect(request).toMatchObject({
      status: 'IN_PROGRESS',
      response: 'Existing management note',
      acknowledgement: {
        at: acceptedAt,
        by: 'user-support',
        name: 'support name',
      },
    });
    expect(request.history.at(-1)).toMatchObject({
      event: 'Support accepted',
      at: acceptedAt,
      by: 'user-support',
      name: 'support name',
    });
    expect(view(state).supportRequests[0].canAcknowledge).toBe(false);
    const first = structuredClone(request.acknowledgement);
    jest.setSystemTime(Date.parse('2026-11-20T18:00:00Z'));
    for (const status of ['IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const) {
      request.status = status;
      applyExecutionCommand(state, command(), view(state));
      expect(request.acknowledgement).toEqual(first);
      expect(request.status).toBe(status);
      expect(request.history).toHaveLength(2);
    }
  });

  it.each(['RESOLVED', 'CLOSED'] as const)(
    'does not fabricate acceptance for legacy %s requests',
    (status) => {
      const state = stateWith({ status });
      expect(view(state).supportRequests[0].canAcknowledge).toBe(false);
      expect(view(state).supportRequests[0]).not.toHaveProperty(
        'acknowledgement',
      );
      expect(() =>
        applyExecutionCommand(state, command(), view(state)),
      ).toThrow(/open or in-progress/);
      expect(state.supportRequests[0]).not.toHaveProperty('acknowledgement');
      expect(state.supportRequests[0].history).toHaveLength(1);
    },
  );

  it('allows a legacy in-progress request to be accepted now without inferring a past timestamp', () => {
    const state = stateWith({ status: 'IN_PROGRESS' });
    state.supportRequests[0].history.push({
      at: '2026-11-18T11:00:00Z',
      by: 'user-manager',
      name: 'Manager',
      event: 'IN_PROGRESS',
      detail: 'Manager started coordination',
    });
    expect(view(state).supportRequests[0]).not.toHaveProperty(
      'acknowledgement',
    );
    applyExecutionCommand(state, command(), view(state));
    expect(state.supportRequests[0].acknowledgement?.at).toBe(acceptedAt);
  });

  it.each(['IN_PROGRESS', 'RESOLVED'])(
    'records first acceptance for the recipient response %s',
    (status) => {
      const state = stateWith({ acknowledgement: null });
      applyExecutionCommand(state, update(status), view(state));
      expect(state.supportRequests[0].acknowledgement).toEqual({
        at: acceptedAt,
        by: 'user-support',
        name: 'support name',
      });
      expect(
        state.supportRequests[0].history.map((entry) => entry.event),
      ).toEqual(['Support requested', 'Support accepted', status]);
      jest.setSystemTime(Date.parse('2026-11-20T18:00:00Z'));
      applyExecutionCommand(state, update('RESOLVED'), view(state));
      expect(state.supportRequests[0].acknowledgement?.at).toBe(acceptedAt);
      expect(
        state.supportRequests[0].history.filter(
          (entry) => entry.event === 'Support accepted',
        ),
      ).toHaveLength(1);
      applyExecutionCommand(
        state,
        update('CLOSED'),
        view(state, actor('requester')),
      );
      expect(state.supportRequests[0].status).toBe('CLOSED');
      expect(state.supportRequests[0].acknowledgement?.at).toBe(acceptedAt);
    },
  );

  it('preserves manager response and requester close permissions without accepting on behalf', () => {
    const state = stateWith({ acknowledgement: null });
    for (const status of ['IN_PROGRESS', 'RESOLVED']) {
      applyExecutionCommand(
        state,
        update(status),
        view(state, actor('manager', 'MANAGEMENT')),
      );
      expect(state.supportRequests[0].acknowledgement).toBeNull();
    }
    applyExecutionCommand(
      state,
      update('CLOSED'),
      view(state, actor('requester')),
    );
    expect(state.supportRequests[0].status).toBe('CLOSED');
    expect(state.supportRequests[0].acknowledgement).toBeNull();
    expect(
      state.supportRequests[0].history.map((entry) => entry.event),
    ).not.toContain('Support accepted');
  });

  it('preserves recipient-only response and requester-only close permissions', () => {
    const state = stateWith();
    expect(() =>
      applyExecutionCommand(
        state,
        update('IN_PROGRESS'),
        view(state, actor('requester')),
      ),
    ).toThrow(/support person/);
    expect(() =>
      applyExecutionCommand(state, update('CLOSED'), view(state)),
    ).toThrow(/requester/);
    expect(state.supportRequests[0].status).toBe('OPEN');
    expect(state.supportRequests[0]).not.toHaveProperty('acknowledgement');
  });

  it('keeps unrelated requests and confidential plans outside the recipient projection', () => {
    const state = stateWith();
    state.supportRequests.push(
      supportRequest({ id: 'other-request', assignedToId: 'other' }),
    );
    const projected = view(state);
    expect(projected.supportRequests.map((row) => row.id)).toEqual([
      'support-request',
    ]);
    expect(projected.supportRequests[0]).toMatchObject({
      cycle: '2026',
      goalTitle: 'Approved production goal',
      canAcknowledge: true,
    });
    expect(projected.goals).toEqual([]);
    expect(projected.assignments).toEqual([]);
    expect(projected.actions).toEqual([]);
    expect(JSON.stringify(projected)).not.toContain('Confidential draft');
    expect(state.supportRequests[0]).not.toHaveProperty('canAcknowledge');
    expect(state.supportRequests[0]).not.toHaveProperty('goalTitle');
    const outsiderView = view(state, actor('outsider'));
    expect(outsiderView.supportRequests).toEqual([]);
    expect(() => applyExecutionCommand(state, command(), outsiderView)).toThrow(
      /not found/,
    );
  });
});

function serviceHarness() {
  type Stored = { revision: number; state: ExecutionState };
  let rows = new Map<string, Stored>([
    ['org-a', { revision: 0, state: stateWith() }],
  ]);
  const db = {
    $queryRaw: async () => [{ revision: 7 }],
    lexExecutionWorkspace: {
      findUnique: async ({ where }: { where: { organizationId: string } }) =>
        structuredClone(rows.get(where.organizationId) ?? null),
      upsert: async ({ where }: { where: { organizationId: string } }) => {
        if (!rows.has(where.organizationId))
          rows.set(where.organizationId, {
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
          revision: row.revision + data.revision.increment,
          state: JSON.parse(JSON.stringify(data.state)) as ExecutionState,
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
  const planning = { getExecutionSource: async () => source() };
  return {
    service: new ExecutionService(
      db as unknown as PrismaService,
      planning as unknown as PerformancePlanningService,
    ),
    stored: () => rows.get('org-a')!,
  };
}

describe('Support acceptance persistence', () => {
  it('round-trips first acceptance through JSON storage and keeps tenant and revision boundaries', async () => {
    const { service, stored } = serviceHarness();
    const user: AccessTokenPayload = {
      tokenType: 'ACCESS',
      userId: 'user-support',
      organizationId: 'org-a',
      roleId: 7,
      roleLevel: Role.EMPLOYEE,
      email: null,
      isAdminOrg: false,
    };
    const result = await service.command(user, command());
    expect(result.revision).toBe(1);
    const first = result.supportRequests[0].acknowledgement;
    expect(first).toMatchObject({ by: 'user-support', name: 'support name' });
    expect(first?.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(
      (await service.getWorkspace(user)).supportRequests[0].acknowledgement,
    ).toEqual(first);
    expect(stored().state.supportRequests[0]).not.toHaveProperty(
      'canAcknowledge',
    );
    expect(stored().state.supportRequests[0]).not.toHaveProperty('cycle');
    await expect(service.command(user, command())).rejects.toThrow(/changed/);
    const repeated = await service.command(user, {
      ...command(),
      expectedRevision: 1,
    });
    expect(repeated.supportRequests[0].acknowledgement).toEqual(first);
    expect(repeated.supportRequests[0].history).toHaveLength(2);
    expect(
      (await service.getWorkspace({ ...user, organizationId: 'org-b' }))
        .supportRequests,
    ).toEqual([]);
    await expect(
      service.command({ ...user, organizationId: 'org-b' }, command()),
    ).rejects.toThrow(/not found/);
    expect(stored().state.supportRequests[0].acknowledgement).toEqual(first);
  });
});
