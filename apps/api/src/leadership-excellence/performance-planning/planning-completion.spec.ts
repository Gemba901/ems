import { Role } from '../../common/enum/role.enum';
import type { AccessTokenPayload } from '../../auth/access-token-payload';
import type { PrismaService } from '../../prisma/prisma.service';
import { PerformancePlanningService } from './performance-planning.service';
import type { PlanningReferencesService } from './planning-references.service';
import type {
  PlanningCommand,
  PlanningReferences,
  PlanningState,
} from './planning.types';

// Exercise the public command boundary with transactional persistence. These
// fixtures never connect to, seed, or modify a developer/shared database.
function harness(initialState?: PlanningState) {
  type Row = { organizationId: string; revision: number; state: PlanningState };
  let rows = new Map<string, Row>();
  if (initialState)
    rows.set('org-one', {
      organizationId: 'org-one',
      revision: 0,
      state: structuredClone(initialState),
    });
  const db = {
    lexPlanningWorkspace: {
      findUnique: async ({ where }: { where: { organizationId: string } }) =>
        structuredClone(rows.get(where.organizationId) ?? null),
      upsert: async ({
        where,
        create,
      }: {
        where: { organizationId: string };
        create: { organizationId: string; state: PlanningState };
      }) => {
        if (!rows.has(where.organizationId))
          rows.set(where.organizationId, {
            ...structuredClone(create),
            revision: 0,
          });
        return structuredClone(rows.get(where.organizationId)!);
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { organizationId: string; revision: number };
        data: { state: PlanningState; revision: { increment: number } };
      }) => {
        const row = rows.get(where.organizationId);
        if (!row || row.revision !== where.revision) return { count: 0 };
        row.state = structuredClone(data.state);
        row.revision += data.revision.increment;
        return { count: 1 };
      },
    },
    $transaction: async <T>(work: (tx: unknown) => Promise<T>): Promise<T> => {
      const before = structuredClone(rows);
      try {
        return await work(db);
      } catch (error) {
        rows = before;
        throw error;
      }
    },
  };
  const references: PlanningReferences = {
    departments: [
      { id: 'production', name: 'Production' },
      { id: 'quality', name: 'Quality' },
    ],
    people: [
      {
        id: 'leader',
        userId: 'u-leader',
        name: 'Alex Leader',
        role: Role.MANAGEMENT,
        departmentId: 'production',
        position: 'Director',
      },
      {
        id: 'hod',
        userId: 'u-hod',
        name: 'Casey Manager',
        role: Role.HOD,
        departmentId: 'production',
        position: 'Production Manager',
      },
      {
        id: 'operator',
        userId: 'u-operator',
        name: 'Sam Operator',
        role: Role.EMPLOYEE,
        departmentId: 'production',
        position: 'Operator',
      },
      {
        id: 'other',
        userId: 'u-other',
        name: 'Lee Quality',
        role: Role.EMPLOYEE,
        departmentId: 'quality',
        position: 'Analyst',
      },
    ],
    teams: [],
    pillars: [
      { code: 'LEX', name: 'Leadership' },
      { code: 'PEX', name: 'People' },
      { code: 'OPX', name: 'Operations' },
      { code: 'CMX', name: 'Customer' },
      { code: 'SGEX', name: 'Governance' },
      { code: 'FPEX', name: 'Finance' },
    ],
    timeZone: 'Asia/Kolkata',
    positions: [
      {
        id: 'position-operator',
        name: 'Operator',
        departmentId: 'production',
        holderIds: ['operator'],
      },
    ],
  };
  const leader: AccessTokenPayload = {
    tokenType: 'ACCESS',
    userId: 'u-leader',
    organizationId: 'org-one',
    roleId: 1,
    roleLevel: Role.MANAGEMENT,
    email: null,
    isAdminOrg: false,
  };
  const employee: AccessTokenPayload = {
    ...leader,
    userId: 'u-operator',
    roleLevel: Role.EMPLOYEE,
  };
  const refs = {
    get: async (user: AccessTokenPayload) => {
      const person = references.people.find((p) => p.userId === user.userId)!;
      return {
        references,
        actor: {
          userId: user.userId,
          employeeId: person.id,
          name: person.name,
          departmentId: person.departmentId || '',
          role: user.roleLevel,
          positionIds: references.positions
            ?.filter((p) => p.holderIds.includes(person.id))
            .map((p) => p.id),
        },
      };
    },
  };
  const service = new PerformancePlanningService(
    db as unknown as PrismaService,
    refs as unknown as PlanningReferencesService,
  );
  const view = (who = leader) => service.getWorkspace(who);
  const command = async (
    action: PlanningCommand['action'],
    payload: Record<string, unknown> = {},
    documentId?: string,
    who = leader,
  ) =>
    service.command(who, {
      action,
      payload,
      documentId,
      expectedRevision: (await view(who)).revision,
    });
  const plan = async (kind: string, scopeId = '') =>
    (await command('CREATE_PLAN', { kind, scopeId, cycle: '2026' })).focusId;
  const item = async (
    documentId: string,
    kind: string,
    data: Record<string, unknown>,
    id?: string,
  ) => (await command('SAVE_ITEM', { kind, data, id }, documentId)).focusId;
  const document = async (id: string, who = leader) =>
    (await view(who)).documents.find((d) => d.id === id)!;
  const goalData = (extra: Record<string, unknown> = {}) => ({
    title: 'Keep production equipment available',
    ongoingReason: 'Essential production responsibility',
    measure: 'Unplanned downtime',
    baseline: 8,
    target: 4,
    unit: 'hours',
    ownerId: 'hod',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    approach: 'Operators maintain and inspect equipment each shift.',
    noActionReason: 'Covered by the existing approved routine work programme.',
    ...extra,
  });
  const assignment = async (
    documentId: string,
    goalId: string,
    extra: Record<string, unknown> = {},
  ) =>
    item(documentId, 'assignment', {
      goalId,
      definitionId: 'ref-kpi-downtime',
      ownerId: 'hod',
      baseline: 8,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      providerId: 'operator',
      verifierId: 'hod',
      source: 'Shift downtime log',
      updateFrequency: 'MONTHLY',
      reviewFrequency: 'QUARTERLY',
      targetMode: 'SAME',
      target: 4,
      ...extra,
    });
  const department = async (withAction = false) => {
    const id = await plan('DEPARTMENT', 'production');
    const goalId = await item(
      id,
      'goal',
      goalData(withAction ? { noActionReason: '' } : {}),
    );
    await assignment(id, goalId);
    const actionId = withAction
      ? await item(id, 'action', {
          title: 'Inspect the drive assembly',
          goalId,
          ownerId: 'operator',
          dueDate: '2026-12-01',
          expectedResult: 'Find wear before an unplanned stop',
          completionEvidence: 'Signed inspection record',
        })
      : '';
    return { id, goalId, actionId };
  };
  const swot = async (extra: Record<string, unknown> = {}) => {
    const id = await plan('SWOT');
    const findingId = await item(id, 'finding', {
      pillar: 'OPX',
      category: 'W',
      title: 'Unplanned downtime',
      response: 'OBJECTIVE',
      ...extra,
    });
    for (const pillar of references.pillars)
      await command('CONSIDER_PILLAR', { pillar: pillar.code }, id);
    return { id, findingId };
  };
  const considerPillars = async (id: string) => {
    const considered = (await document(id)).data.consideredPillars;
    for (const pillar of references.pillars)
      if (!considered.includes(pillar.code))
        await command('CONSIDER_PILLAR', { pillar: pillar.code }, id);
  };
  return {
    service,
    view,
    command,
    plan,
    item,
    document,
    goalData,
    assignment,
    department,
    swot,
    considerPillars,
    leader,
    employee,
    references,
    snapshot: () => structuredClone(rows),
  };
}

describe('Area 03 completion workflows', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(Date.parse('2026-11-04T09:00:00Z'));
  });
  afterEach(() => jest.useRealTimers());

  test.each([
    ['INDIVIDUAL', 'operator'],
    ['TEAM', 'production-shift'],
    ['POSITION', 'position-operator'],
  ])(
    '%s drafts preserve contributions while department setup is still missing',
    async (kind, scopeId) => {
      const h = harness();
      h.references.teams.push({
        id: 'production-shift',
        name: 'Production shift',
        departmentId: 'production',
        memberIds: ['operator'],
      });
      const id = await h.plan(kind, scopeId);
      const goalId = await h.item(id, 'goal', {
        title: 'Finish this draft later',
      });
      const draft = await h.document(id);
      expect(draft).toMatchObject({
        kind,
        scopeId,
        departmentId: 'production',
        cycle: '2026',
        status: 'DRAFT',
      });
      expect(draft.issues).toContain(
        'Create the Production plan for 2026 before submitting. Your draft can be saved now.',
      );
      expect(draft.data.goals[0]).toMatchObject({
        id: goalId,
        title: 'Finish this draft later',
      });
      await expect(h.plan(kind, scopeId)).rejects.toThrow(
        /already has a plan/i,
      );
      await h.command('CREATE_PLAN', {
        kind: 'DEPARTMENT',
        scopeId: 'production',
        cycle: '2027',
      });
      await h.plan('DEPARTMENT', 'quality');
      expect((await h.document(id)).issues).toContain(
        draft.issues.find((issue) => issue.startsWith('Create the Production')),
      );
      await h.plan('DEPARTMENT', 'production');
      const readyForFurtherEditing = await h.document(id);
      expect(readyForFurtherEditing.data).toEqual(draft.data);
      expect(
        readyForFurtherEditing.issues.some((issue) =>
          issue.startsWith('Create the Production'),
        ),
      ).toBe(false);
    },
  );

  test('a complete individual draft cannot be submitted or approved until its same-year department plan exists', async () => {
    const h = harness();
    const id = await h.plan('INDIVIDUAL', 'operator');
    const goalId = await h.item(
      id,
      'goal',
      h.goalData({ ownerId: 'operator' }),
    );
    await h.assignment(id, goalId, { ownerId: 'operator' });
    expect((await h.document(id)).issues).toEqual([
      'Create the Production plan for 2026 before submitting. Your draft can be saved now.',
    ]);
    const before = h.snapshot();
    for (const action of ['SUBMIT', 'APPROVE'] as const) {
      await expect(h.command(action, {}, id)).rejects.toThrow();
      expect(h.snapshot()).toEqual(before);
    }
    const departmentId = await h.plan('DEPARTMENT', 'production');
    expect((await h.document(id)).issues).toEqual([]);
    await h.command('APPROVE', {}, id);
    expect((await h.document(id)).versions[0].data.goals[0].id).toBe(goalId);
    expect((await h.document(departmentId)).status).toBe('DRAFT');
  });

  test('draft-first creation retains EMS scope, self-service and tenant boundaries', async () => {
    const h = harness();
    const own = await h.command(
      'CREATE_PLAN',
      {
        kind: 'INDIVIDUAL',
        scopeId: 'operator',
        cycle: '2026',
      },
      undefined,
      h.employee,
    );
    expect((await h.document(own.focusId, h.employee)).scopeId).toBe(
      'operator',
    );
    const before = h.snapshot();
    await expect(
      h.command(
        'CREATE_PLAN',
        {
          kind: 'INDIVIDUAL',
          scopeId: 'other',
          cycle: '2026',
        },
        undefined,
        h.employee,
      ),
    ).rejects.toThrow(/cannot create/i);
    await expect(h.plan('INDIVIDUAL', 'unknown-employee')).rejects.toThrow(
      /EMS employee/i,
    );
    h.references.people.find((person) => person.id === 'other')!.departmentId =
      null;
    await expect(h.plan('INDIVIDUAL', 'other')).rejects.toThrow(
      /valid department assignment/i,
    );
    expect(h.snapshot()).toEqual(before);
    const otherTenant = await h.view({
      ...h.employee,
      organizationId: 'org-two',
    });
    expect(otherTenant.documents).toEqual([]);
  });

  test('bulk pillar consideration confirms the missing pillars in one audited revision without changing findings or other plans', async () => {
    const h = harness();
    const id = await h.plan('SWOT');
    const companyId = await h.plan('COMPANY');
    await h.item(id, 'finding', {
      pillar: 'OPX',
      relatedPillars: ['PEX', 'FPEX'],
      category: 'W',
      title: 'Shared equipment and training concern',
      weightage: 7,
    });
    await h.command('CONSIDER_PILLAR', { pillar: 'OPX' }, id);
    await h.command('CONSIDER_PILLAR', { pillar: 'PEX' }, id);
    const before = await h.document(id);
    const companyBefore = await h.document(companyId);
    const revision = (await h.view()).revision;

    const result = await h.command('CONSIDER_ALL_PILLARS', {}, id);
    const after = await h.document(id);
    expect(result.revision).toBe(revision + 1);
    expect(after.data.consideredPillars).toEqual(
      h.references.pillars.map((pillar) => pillar.code),
    );
    expect(after.data.findings).toEqual(before.data.findings);
    expect(await h.document(companyId)).toEqual(companyBefore);
    expect(after.history).toHaveLength(before.history.length + 1);
    expect(after.history.at(-1)).toMatchObject({
      action: 'All pillars marked considered',
      detail: 'Newly considered: LEX, CMX, SGEX, FPEX',
      actorId: 'u-leader',
      actorName: 'Alex Leader',
      at: '2026-11-04T09:00:00.000Z',
      changes: expect.arrayContaining([
        {
          field: 'data.consideredPillars',
          before: ['OPX', 'PEX'],
          after: h.references.pillars.map((pillar) => pillar.code),
        },
      ]),
    });
    expect(
      after.issues.filter((issue) => issue.startsWith('Consider ')),
    ).toEqual([]);
  });

  test('bulk consideration works for empty pillars and repeated requests keep every pillar marked without duplicate audit events', async () => {
    const h = harness();
    const id = await h.plan('SWOT');
    await h.command('CONSIDER_ALL_PILLARS', {}, id);
    const considered = await h.document(id);
    expect(considered.data.findings).toEqual([]);
    expect(considered.data.consideredPillars).toHaveLength(6);
    await h.command('CONSIDER_ALL_PILLARS', {}, id);
    expect(await h.document(id)).toEqual(considered);
    // The existing individual control can still undo one confirmation.
    await h.command('CONSIDER_PILLAR', { pillar: 'LEX' }, id);
    expect((await h.document(id)).data.consideredPillars).not.toContain('LEX');
  });

  test('bulk consideration preserves the confidential SWOT permission boundary and organisation scope', async () => {
    const h = harness();
    const id = await h.plan('SWOT');
    const before = h.snapshot();
    await expect(
      h.command('CONSIDER_ALL_PILLARS', {}, id, h.employee),
    ).rejects.toThrow(/restricted/i);
    expect(h.snapshot()).toEqual(before);
    await expect(
      h.command('CONSIDER_ALL_PILLARS', {}, id, {
        ...h.leader,
        organizationId: 'org-two',
      }),
    ).rejects.toThrow(/not found/i);
    expect(h.snapshot()).toEqual(before);
  });

  test.each(['SUBMIT', 'APPROVE'] as const)(
    'bulk consideration cannot mutate a SWOT assessment locked by %s',
    async (action) => {
      const h = harness();
      const { id } = await h.swot({ weightage: 7 });
      await h.command(action, {}, id);
      const before = h.snapshot();
      await expect(h.command('CONSIDER_ALL_PILLARS', {}, id)).rejects.toThrow(
        /locked/i,
      );
      expect(h.snapshot()).toEqual(before);
    },
  );

  test('bulk consideration is limited to SWOT and rejects a stale workspace revision without a partial update', async () => {
    const h = harness();
    const companyId = await h.plan('COMPANY');
    let before = h.snapshot();
    await expect(
      h.command('CONSIDER_ALL_PILLARS', {}, companyId),
    ).rejects.toThrow(/only available for SWOT/i);
    expect(h.snapshot()).toEqual(before);
    const id = await h.plan('SWOT');
    const expectedRevision = (await h.view()).revision;
    await h.command('CONSIDER_PILLAR', { pillar: 'OPX' }, id);
    before = h.snapshot();
    await expect(
      h.service.command(h.leader, {
        action: 'CONSIDER_ALL_PILLARS',
        payload: {},
        documentId: id,
        expectedRevision,
      }),
    ).rejects.toThrow(/Someone updated/i);
    expect(h.snapshot()).toEqual(before);
  });

  test('editing a shared finding after bulk consideration clears only affected pillars and allows a new bulk confirmation', async () => {
    const h = harness();
    const { id, findingId } = await h.swot({
      weightage: 7,
      relatedPillars: ['PEX', 'FPEX'],
    });
    await h.command('CONSIDER_ALL_PILLARS', {}, id);
    const finding = (await h.document(id)).data.findings[0];
    await h.item(id, 'finding', { ...finding, weightage: 4 }, findingId);
    expect((await h.document(id)).data.consideredPillars).toEqual([
      'LEX',
      'CMX',
      'SGEX',
    ]);
    await h.command('CONSIDER_ALL_PILLARS', {}, id);
    const reconsidered = await h.document(id);
    expect(reconsidered.data.consideredPillars).toHaveLength(6);
    expect(reconsidered.history.at(-1)?.detail).toBe(
      'Newly considered: PEX, OPX, FPEX',
    );
  });

  test('SWOT drafts retain blank weightage; finalisation needs a score and persists the derived priority and audit changes', async () => {
    const h = harness();
    const { id, findingId } = await h.swot({ priority: 'HIGH' });
    const draft = (await h.document(id)).data.findings[0];
    expect(draft).toMatchObject({
      id: findingId,
      weightage: null,
      priority: '',
    });
    expect((await h.document(id)).issues.join(' ')).toMatch(/weightage/i);
    const beforeFinalisation = h.snapshot();
    for (const action of ['SUBMIT', 'APPROVE'] as const) {
      await expect(h.command(action, {}, id)).rejects.toThrow();
      expect(h.snapshot()).toEqual(beforeFinalisation);
    }
    await h.item(
      id,
      'finding',
      { ...draft, weightage: 7, priority: 'LOW' },
      findingId,
    );
    const scored = await h.document(id);
    expect(scored.data.findings[0]).toMatchObject({
      weightage: 7,
      priority: 'HIGH',
    });
    expect(scored.history.at(-1)?.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: expect.stringContaining('weightage'),
          before: null,
          after: 7,
        }),
        expect.objectContaining({
          field: expect.stringContaining('priority'),
          before: '',
          after: 'HIGH',
        }),
      ]),
    );
    await h.considerPillars(id);
    expect((await h.document(id)).issues).toEqual([]);
    expect(
      (await h.command('SUBMIT', {}, id)).documents.find((d) => d.id === id)
        ?.status,
    ).toBe('IN_REVIEW');
    await h.command('APPROVE', {}, id);
    const approved = (await h.document(id)).versions[0];
    expect(approved.data.findings[0]).toMatchObject({
      weightage: 7,
      priority: 'HIGH',
    });
    expect(
      h
        .snapshot()
        .get('org-one')
        ?.state.documents.find((d) => d.id === id)?.data.findings[0],
    ).toMatchObject({ weightage: 7, priority: 'HIGH' });
    await h.command(
      'REVISE',
      { reason: 'Reassess the impact', effectiveDate: '2026-11-04' },
      id,
    );
    await h.item(
      id,
      'finding',
      { ...scored.data.findings[0], weightage: 3, priority: 'HIGH' },
      findingId,
    );
    const revision = await h.document(id);
    expect(revision.versions[0]).toEqual(approved);
    expect(revision.data.findings[0]).toMatchObject({
      weightage: 3,
      priority: 'LOW',
    });
    expect(revision.history.at(-1)?.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: expect.stringContaining('weightage'),
          before: 7,
          after: 3,
        }),
        expect.objectContaining({
          field: expect.stringContaining('priority'),
          before: 'HIGH',
          after: 'LOW',
        }),
      ]),
    );
    await h.considerPillars(id);
    await h.command('APPROVE', {}, id);
    const final = await h.document(id);
    expect(final.versions[0]).toEqual(approved);
    expect(final.versions[1].data.findings[0]).toMatchObject({
      weightage: 3,
      priority: 'LOW',
    });
  });

  test('invalid SWOT weightage is rejected without persisting a draft, revision or history change', async () => {
    const h = harness();
    const { id, findingId } = await h.swot({ weightage: 4 });
    const finding = (await h.document(id)).data.findings[0];
    const before = h.snapshot();
    for (const weightage of [0, 11, 1.5, '7', ' ', NaN, Infinity, true]) {
      await expect(
        h.item(id, 'finding', { ...finding, weightage }, findingId),
      ).rejects.toThrow(/weightage/i);
      expect(h.snapshot()).toEqual(before);
    }
    await h.item(id, 'finding', { ...finding, weightage: '' }, findingId);
    expect((await h.document(id)).data.findings[0]).toMatchObject({
      weightage: null,
      priority: '',
    });
  });

  test('legacy approved SWOT snapshots remain unchanged while their revision requires a new score, never guessed from HIGH', async () => {
    const fixture = harness();
    const { id, findingId } = await fixture.swot({ weightage: 7 });
    await fixture.command('APPROVE', {}, id);
    const legacyState = fixture.snapshot().get('org-one')!.state;
    const legacyDocument = legacyState.documents.find((d) => d.id === id)!;
    delete legacyDocument.data.findings[0].weightage;
    delete legacyDocument.versions[0].data.findings[0].weightage;
    legacyDocument.history = [];
    const legacyApproved = structuredClone(legacyDocument.versions[0]);
    const h = harness(legacyState);
    const beforeRead = h.snapshot();
    const stored = await h.document(id);
    expect(stored.data.findings[0].weightage).toBeUndefined();
    expect(stored.data.findings[0].priority).toBe('HIGH');
    expect(stored.versions[0]).toEqual(legacyApproved);
    expect(h.snapshot()).toEqual(beforeRead);
    await h.command(
      'REVISE',
      { reason: 'Assess the legacy finding', effectiveDate: '2026-11-04' },
      id,
    );
    const revision = await h.document(id);
    expect(revision.data.findings[0].weightage).toBeUndefined();
    expect(revision.issues.join(' ')).toMatch(/weightage/i);
    const beforeFinalisation = h.snapshot();
    for (const action of ['SUBMIT', 'APPROVE'] as const) {
      await expect(h.command(action, {}, id)).rejects.toThrow();
      expect(h.snapshot()).toEqual(beforeFinalisation);
    }
    await h.item(id, 'finding', { ...revision.data.findings[0] }, findingId);
    expect((await h.document(id)).data.findings[0]).toMatchObject({
      weightage: null,
      priority: '',
    });
    await expect(h.command('APPROVE', {}, id)).rejects.toThrow();
    await h.item(
      id,
      'finding',
      { ...revision.data.findings[0], weightage: 10, priority: 'LOW' },
      findingId,
    );
    await h.considerPillars(id);
    await h.command('APPROVE', {}, id);
    const approved = await h.document(id);
    expect(approved.versions[0]).toEqual(legacyApproved);
    expect(approved.versions[0].data.findings[0]).not.toHaveProperty(
      'weightage',
    );
    expect(approved.versions[1].data.findings[0]).toMatchObject({
      weightage: 10,
      priority: 'HIGH',
    });
    expect(
      h
        .snapshot()
        .get('org-one')!
        .state.documents.find((d) => d.id === id)!.versions[0],
    ).toEqual(legacyApproved);
  });

  test('a restored draft cannot finalise with a priority inconsistent with its score', async () => {
    const fixture = harness();
    const { id } = await fixture.swot({ weightage: 2 });
    const restoredState = fixture.snapshot().get('org-one')!.state;
    restoredState.documents.find(
      (d) => d.id === id,
    )!.data.findings[0].priority = 'HIGH';
    const h = harness(restoredState);
    expect((await h.document(id)).issues.join(' ')).toMatch(
      /recalculate.*priority/i,
    );
    const before = h.snapshot();
    for (const action of ['SUBMIT', 'APPROVE'] as const) {
      await expect(h.command(action, {}, id)).rejects.toThrow();
      expect(h.snapshot()).toEqual(before);
    }
  });

  test('an approved company goal becomes a department parent immediately and still requires a contributing department', async () => {
    const h = harness();
    const assessment = await h.plan('SWOT');
    const findingId = await h.item(assessment, 'finding', {
      pillar: 'OPX',
      category: 'W',
      title: 'Restricted planning evidence',
      weightage: 7,
      response: 'OBJECTIVE',
    });
    for (const pillar of h.references.pillars)
      await h.command('CONSIDER_PILLAR', { pillar: pillar.code }, assessment);
    await h.command('APPROVE', {}, assessment);
    const company = await h.plan('COMPANY');
    const objectiveId = await h.item(company, 'objective', {
      title: 'Reliable production',
      meaning: 'Keep production equipment available',
      pillar: 'OPX',
      alignments: ['D'],
      ownerId: 'leader',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      sources: [{ documentId: assessment, findingId, version: 1 }],
    });
    const goalId = await h.item(
      company,
      'goal',
      h.goalData({
        objectiveId,
        ownerId: 'leader',
        departmentIds: ['production'],
      }),
    );
    const hod = { ...h.leader, userId: 'u-hod', roleLevel: Role.HOD };
    expect((await h.view(hod)).approvedParentGoals).toEqual([]);
    const approved = await h.command('APPROVE', {}, company);
    expect(approved.approvedParentGoals?.[0]).toMatchObject({
      documentId: company,
      version: 1,
      goal: { id: goalId },
    });
    const choices = (await h.view(hod)).approvedParentGoals;
    expect(choices).toEqual(approved.approvedParentGoals);
    expect(JSON.stringify(choices)).not.toContain(findingId);
    const department = await h.department();
    const parent = { documentId: company, goalId, version: 1 };
    await h.command(
      'SAVE_ITEM',
      {
        kind: 'goal',
        id: department.goalId,
        data: h.goalData({ parent }),
      },
      department.id,
      hod,
    );
    await h.command('APPROVE', {}, department.id);
    expect(
      (await h.document(department.id)).versions[0].data.goals[0].parent,
    ).toEqual(parent);
    const otherDepartment = await h.plan('DEPARTMENT', 'quality');
    await expect(
      h.item(otherDepartment, 'goal', h.goalData({ parent })),
    ).rejects.toThrow(/approved parent goal/i);
  });

  test('approval immediately supplies planning parents while future revisions keep execution and existing links pinned', async () => {
    const h = harness();
    const dept = await h.department();
    expect((await h.view(h.employee)).approvedParentGoals).toEqual([]);
    const first = await h.command('APPROVE', {}, dept.id);
    expect(first.approvedParentGoals).toEqual([
      expect.objectContaining({
        documentId: dept.id,
        version: 1,
        effectiveDate: '2026-11-04',
        goal: expect.objectContaining({ id: dept.goalId }),
      }),
    ]);
    const personal = await h.plan('INDIVIDUAL', 'operator');
    const originalParent = {
      documentId: dept.id,
      goalId: dept.goalId,
      version: 1,
    };
    const goalId = await h.item(
      personal,
      'goal',
      h.goalData({ ownerId: 'operator', parent: originalParent }),
    );
    await h.assignment(personal, goalId, { ownerId: 'operator' });
    await h.command(
      'REVISE',
      { reason: 'Prepare the next commitment', effectiveDate: '2027-01-01' },
      dept.id,
    );
    await h.item(
      dept.id,
      'goal',
      h.goalData({ title: 'Future approved department commitment' }),
      dept.goalId,
    );
    expect(
      (await h.view(h.employee)).approvedParentGoals?.map(
        (choice) => choice.version,
      ),
    ).toEqual([1]);
    await h.command('APPROVE', {}, dept.id);
    const employeeView = await h.view(h.employee);
    expect(
      employeeView.approvedParentGoals?.map((choice) => choice.version),
    ).toEqual([2, 1]);
    expect(employeeView.approvedParentGoals?.[0].goal.title).toBe(
      'Future approved department commitment',
    );
    expect(
      employeeView.documents
        .find((document) => document.id === dept.id)
        ?.versions.map((version) => version.version),
    ).toEqual([1]);
    expect(
      (await h.service.getApproved(h.employee)).find(
        (document) => document.id === dept.id,
      )?.version,
    ).toBe(1);
    expect((await h.document(personal)).data.goals[0].parent).toEqual(
      originalParent,
    );
    expect((await h.document(personal)).issues).toEqual([]);
    await h.command(
      'SAVE_ITEM',
      {
        kind: 'goal',
        id: goalId,
        data: h.goalData({
          ownerId: 'operator',
          parent: { ...originalParent, version: 2 },
        }),
      },
      personal,
      h.employee,
    );
    await h.command('APPROVE', {}, personal);
    expect(
      (await h.document(personal)).versions[0].data.goals[0].parent?.version,
    ).toBe(2);
    const otherEmployee = { ...h.employee, userId: 'u-other' };
    expect((await h.view(otherEmployee)).approvedParentGoals).toEqual([]);
  });

  test('saving a parent reference rejects another department, cycle, kind or an unapproved goal', async () => {
    const h = harness();
    const dept = await h.department();
    await h.command('APPROVE', {}, dept.id);
    const parent = { documentId: dept.id, goalId: dept.goalId, version: 1 };
    const wrongKind = await h.plan('DEPARTMENT', 'quality');
    const otherDepartment = await h.plan('INDIVIDUAL', 'other');
    await h.command('CREATE_PLAN', {
      kind: 'DEPARTMENT',
      scopeId: 'production',
      cycle: '2027',
    });
    const otherCycle = (
      await h.command('CREATE_PLAN', {
        kind: 'INDIVIDUAL',
        scopeId: 'operator',
        cycle: '2027',
      })
    ).focusId;
    for (const child of [otherDepartment, otherCycle, wrongKind]) {
      const before = h.snapshot();
      await expect(
        h.item(child, 'goal', h.goalData({ parent })),
      ).rejects.toThrow(/approved parent goal/i);
      expect(h.snapshot()).toEqual(before);
    }
    const draftGoal = await h.item(wrongKind, 'goal', h.goalData());
    await expect(
      h.item(
        otherDepartment,
        'goal',
        h.goalData({
          parent: { documentId: wrongKind, goalId: draftGoal, version: 1 },
        }),
      ),
    ).rejects.toThrow(/approved parent goal/i);
  });

  test('incomplete drafts save; an essential department responsibility approves with its own measure and no-action explanation', async () => {
    const h = harness();
    const { id, goalId } = await h.department();
    expect((await h.document(id)).issues).toEqual([]);
    await h.command('APPROVE', {}, id);
    const approved = await h.document(id);
    expect(approved.status).toBe('APPROVED');
    expect(approved.versions[0].data.goals[0]).toMatchObject({
      id: goalId,
      baseline: 8,
      target: 4,
      unit: 'hours',
      parent: null,
    });
    const stateBefore = h.snapshot();
    await expect(
      h.item(id, 'goal', h.goalData({ target: 3 }), goalId),
    ).rejects.toThrow(/locked/i);
    expect(h.snapshot()).toEqual(stateBefore);
  });

  test('no-action reason and duplicate measure assignments block approval without discarding drafts', async () => {
    const h = harness();
    const { id, goalId } = await h.department();
    await h.item(id, 'goal', h.goalData({ noActionReason: '' }), goalId);
    const before = h.snapshot();
    await expect(h.command('APPROVE', {}, id)).rejects.toThrow();
    expect(h.snapshot()).toEqual(before);
    expect((await h.document(id)).issues.join(' ')).toMatch(/action/i);
    await h.item(id, 'goal', h.goalData(), goalId);
    await h.assignment(id, goalId, { target: 3 });
    await expect(h.command('APPROVE', {}, id)).rejects.toThrow();
    expect((await h.document(id)).issues.join(' ')).toMatch(
      /duplicate|overlap|conflict/i,
    );
  });

  test('the employee plan reuses one approved department action, preserves pinned versions, and exports the same identity', async () => {
    const h = harness();
    const dept = await h.department(true);
    await h.command('APPROVE', {}, dept.id);
    const personal = await h.plan('INDIVIDUAL', 'operator');
    const goalId = await h.item(
      personal,
      'goal',
      h.goalData({
        title: 'Inspect assigned equipment',
        ownerId: 'operator',
        ongoingReason: '',
        noActionReason: '',
        parent: { documentId: dept.id, goalId: dept.goalId, version: 1 },
      }),
    );
    await h.assignment(personal, goalId, { ownerId: 'operator' });
    await h.command(
      'LINK_ACTION',
      { goalId, documentId: dept.id, actionId: dept.actionId, version: 1 },
      personal,
    );
    expect((await h.document(personal)).data.actions).toEqual([]);
    expect((await h.document(personal)).data.actionLinks).toHaveLength(1);
    await h.command('APPROVE', {}, personal);
    const exported = (await h.service.getApproved(h.employee)).find(
      (d) => d.id === personal,
    )!;
    expect(exported.linkedActions[0].action.id).toBe(dept.actionId);
    expect(exported.data.actions).toEqual([]);
    await h.command(
      'REVISE',
      { reason: 'Update the inspection evidence', effectiveDate: '2026-11-04' },
      dept.id,
    );
    const existing = (await h.document(dept.id)).data.actions[0];
    await h.item(
      dept.id,
      'action',
      { ...existing, title: 'Revised inspection method' },
      existing.id,
    );
    await h.command('APPROVE', {}, dept.id);
    const unchanged = (await h.service.getApproved(h.employee)).find(
      (d) => d.id === personal,
    )!;
    expect(unchanged.linkedActions[0].action.title).toBe(
      'Inspect the drive assembly',
    );
    expect(unchanged.linkedActions[0].version).toBe(1);
  });

  test('tenant isolation, stale revisions, and action ownership are enforced at the command boundary', async () => {
    const h = harness();
    const dept = await h.department(true);
    await h.command('APPROVE', {}, dept.id);
    await h.plan('DEPARTMENT', 'quality');
    const personal = await h.plan('INDIVIDUAL', 'other');
    const goalId = await h.item(
      personal,
      'goal',
      h.goalData({ ownerId: 'other' }),
    );
    const before = h.snapshot();
    await expect(
      h.command(
        'LINK_ACTION',
        {
          goalId,
          documentId: dept.id,
          actionId: dept.actionId,
          version: 1,
        },
        personal,
      ),
    ).rejects.toThrow();
    expect(h.snapshot()).toEqual(before);
    await expect(
      h.service.command(
        { ...h.leader, organizationId: 'org-two' },
        {
          action: 'REVISE',
          documentId: dept.id,
          expectedRevision: 0,
          payload: { reason: 'Another tenant', effectiveDate: '2026-11-04' },
        },
      ),
    ).rejects.toThrow(/not found/i);
    expect(h.snapshot()).toEqual(before);
    await expect(
      h.service.command(h.leader, {
        action: 'SAVE_SETTINGS',
        documentId: personal,
        expectedRevision: (await h.view()).revision - 1,
        payload: { title: 'Stale edit' },
      }),
    ).rejects.toThrow(/updated|refresh/i);
    expect(h.snapshot()).toEqual(before);
  });

  test('position plans use actual reference IDs and remain distinct from a person plan', async () => {
    const h = harness();
    const dept = await h.department();
    await h.command('APPROVE', {}, dept.id);
    const position = await h.plan('POSITION', 'position-operator');
    const goalId = await h.item(
      position,
      'goal',
      h.goalData({
        ownerId: 'operator',
        ongoingReason: '',
        parent: { documentId: dept.id, goalId: dept.goalId, version: 1 },
      }),
    );
    await h.assignment(position, goalId, { ownerId: 'operator' });
    await h.command('APPROVE', {}, position);
    expect((await h.document(position, h.employee)).scopeId).toBe(
      'position-operator',
    );
    const before = h.snapshot();
    await expect(h.plan('POSITION', 'invented-position')).rejects.toThrow();
    expect(h.snapshot()).toEqual(before);
  });

  test('adapted KPI definitions retain provenance without changing their original or existing assignments', async () => {
    const h = harness();
    const before = (await h.view()).definitions.find(
      (d) => d.id === 'ref-kpi-downtime',
    )!;
    const result = await h.command('SAVE_DEFINITION', {
      ...before,
      name: 'Packaging line downtime',
      meaning: 'Downtime for the packaging line only.',
      adaptedFromId: before.id,
    });
    const after = await h.view();
    expect(after.definitions.find((d) => d.id === before.id)).toEqual(before);
    expect(
      after.definitions.find((d) => d.id === result.focusId),
    ).toMatchObject({
      adaptedFromId: before.id,
      name: 'Packaging line downtime',
    });
  });

  test('audit entries retain before and after values with the real account name', async () => {
    const h = harness();
    const { id, goalId } = await h.department();
    await h.item(id, 'goal', h.goalData({ target: 2 }), goalId);
    const history = (await h.document(id)).history;
    const change = history
      .flatMap((entry) => entry.changes || [])
      .find((entry) => entry.before === 4 && entry.after === 2);
    expect(change).toBeDefined();
    expect(history.at(-1)?.actorName).toBe('Alex Leader');
    expect((await h.view()).references.timeZone).toBe('Asia/Kolkata');
  });

  test('an incomplete objective gets its permanent originating-pillar code when the first pillar is selected', async () => {
    const h = harness();
    const id = await h.plan('COMPANY');
    const objectiveId = await h.item(id, 'objective', {
      title: 'Reliable operations',
    });
    const draft = (await h.document(id)).data.objectives[0];
    expect(draft.id).toBe(objectiveId);
    expect(draft.code).toBe('');
    await h.item(id, 'objective', { ...draft, pillar: 'OPX' }, objectiveId);
    const coded = (await h.document(id)).data.objectives[0];
    expect(coded.code).toMatch(/^OBJ-OPX-2026-/);
    await h.item(id, 'objective', { ...coded, pillar: 'PEX' }, objectiveId);
    expect((await h.document(id)).data.objectives[0].code).toBe(coded.code);
  });

  test('adapting a responsibility area retains its source without modifying the original KRA', async () => {
    const h = harness();
    const view = await h.view();
    const definition = view.definitions.find(
      (d) => d.id === 'ref-kpi-downtime',
    )!;
    const original = view.kras.find((k) => k.id === definition.kraId)!;
    const result = await h.command('SAVE_DEFINITION', {
      ...definition,
      name: 'Packaging reliability downtime',
      adaptedFromId: definition.id,
      kraId: '',
      kraName: 'Packaging reliability',
      adaptedKraFromId: original.id,
    });
    const after = await h.view();
    const adapted = after.kras.find((k) => k.name === 'Packaging reliability')!;
    expect(adapted.adaptedFromId).toBe(original.id);
    expect(after.kras.find((k) => k.id === original.id)).toEqual(original);
    expect(after.definitions.find((d) => d.id === result.focusId)?.kraId).toBe(
      adapted.id,
    );
    const beforeInvalid = h.snapshot();
    await expect(
      h.command('SAVE_DEFINITION', {
        ...definition,
        name: 'Invalid adaptation',
        kraId: '',
        kraName: 'Another KRA',
        adaptedKraFromId: 'missing-kra',
      }),
    ).rejects.toThrow();
    expect(h.snapshot()).toEqual(beforeInvalid);
  });

  test('removed confidential SWOT links cannot leak through the new audit diffs to a department editor', async () => {
    const h = harness();
    const assessment = await h.plan('SWOT');
    const findingId = await h.item(assessment, 'finding', {
      pillar: 'OPX',
      category: 'W',
      title: 'Confidential management finding',
      explanation: 'Restricted evidence detail',
      weightage: 7,
      response: 'ACTION',
    });
    for (const pillar of h.references.pillars)
      await h.command('CONSIDER_PILLAR', { pillar: pillar.code }, assessment);
    await h.command('APPROVE', {}, assessment);
    const dept = await h.department(true);
    const action = (await h.document(dept.id)).data.actions[0];
    await h.item(
      dept.id,
      'action',
      {
        ...action,
        sources: [{ documentId: assessment, findingId, version: 1 }],
      },
      action.id,
    );
    await h.item(dept.id, 'action', { ...action, sources: [] }, action.id);
    const managerView = JSON.stringify(
      await h.view({ ...h.leader, userId: 'u-hod', roleLevel: Role.HOD }),
    );
    expect(managerView).not.toContain(findingId);
    expect(managerView).not.toContain('Restricted evidence detail');
    expect(managerView).not.toContain('Confidential management finding');
  });
});
