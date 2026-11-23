import { programmeResultPeriods } from './planning.programme';
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
    lexExecutionWorkspace: { findUnique: async () => null },
    $queryRaw: async () => [],
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
  ) =>
    (
      await command(
        'SAVE_ITEM',
        {
          kind,
          data: kind === 'finding' ? { alignment: 'D', ...data } : data,
          id,
        },
        documentId,
      )
    ).focusId;
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

describe('PR 13 planning approval regressions', () => {
  async function programmeFixture() {
    const h = harness();
    const swot = await h.swot({
      explanation: 'Ten changeovers averaged 52 minutes.',
      evidence: 'October observation log',
      impact: 'Lost production time',
      weightage: 9,
    });
    const otherFinding = await h.item(swot.id, 'finding', {
      pillar: 'LEX',
      category: 'W',
      title: 'Overdue management decisions',
      explanation: 'Three overdue decisions',
      evidence: 'October minutes',
      impact: 'Delayed direction',
      weightage: 5,
      response: 'OBJECTIVE',
    });
    await h.considerPillars(swot.id);
    await h.command('APPROVE', {}, swot.id);
    const company = await h.plan('COMPANY');
    const objective = await h.item(company, 'objective', {
      title: 'Reliable production',
      result: 'Reduce changeover time to 30 minutes',
      pillar: 'OPX',
      alignment: 'D',
      measure: 'Average changeover time',
      definition: 'Last acceptable unit to first acceptable unit',
      baseline: 52,
      target: 30,
      unit: 'minutes',
      direction: 'LOWER',
      baselinePeriod: 'October 2026',
      dataSource: 'Ten observed changeovers',
      reviewFrequency: 'MONTHLY',
      guardrails: 'Quality acceptance and safe setup',
      approach: 'Standardise setup work',
      selectionReason: 'Repeated lost production time',
      ownerId: 'leader',
      endDate: '2026-12-31',
      priority: 9,
      weightage: 30,
      sources: [{ documentId: swot.id, findingId: swot.findingId, version: 1 }],
    });
    await h.command(
      'APPROVE_ITEM',
      { kind: 'objective', id: objective, evidenceChecked: true },
      company,
    );
    const parent = {
      documentId: company,
      goalId: objective,
      version: 1,
      itemKind: 'OBJECTIVE',
    };
    return { ...h, company, objective, parent, swot, otherFinding };
  }

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(Date.parse('2026-11-04T09:00:00Z'));
  });
  afterEach(() => jest.useRealTimers());

  test('whole-plan approval must preserve a future item effective date', async () => {
    const h = await programmeFixture();
    const original = (await h.document(h.company)).data.objectives[0];
    await h.command(
      'REVISE_ITEM',
      {
        kind: 'objective',
        id: h.objective,
        reason: 'Lower target starting in December',
        effectiveDate: '2026-12-01',
      },
      h.company,
    );
    await h.item(
      h.company,
      'objective',
      { ...original, target: 20 },
      h.objective,
    );
    await h.command('APPROVE', {}, h.company);
    const handedOff = (await h.service.getApproved(h.employee)).find(
      (d) => d.id === h.company,
    )!;
    expect(
      handedOff.data.objectives.find((o) => o.id === h.objective)?.target,
    ).toBe(30);
  });

  test('another goal approval must not publish a future KPI target early', async () => {
    const h = await programmeFixture();
    const department = await h.plan('DEPARTMENT', 'production');
    const fields = {
      ...h.goalData(),
      parent: h.parent,
      definition: 'Setup duration',
      source: 'Setup log',
      baselinePeriod: 'October 2026',
      approach:
        'Use the existing setup team and standard changeover checklist.',
      relevance: 'Faster changeovers support the linked production objective.',
      frequency: 'MONTHLY',
      direction: 'LOWER',
    };
    const goal = await h.item(department, 'goal', fields);
    const assignment = await h.assignment(department, goal, { target: 10 });
    await h.command(
      'APPROVE_ITEM',
      { kind: 'goal', id: goal, evidenceChecked: true },
      department,
    );
    await h.command(
      'REVISE_ITEM',
      {
        kind: 'goal',
        id: goal,
        reason: 'Change target in December',
        effectiveDate: '2026-12-01',
      },
      department,
    );
    const original = (await h.document(department)).data.assignments.find(
      (a) => a.id === assignment,
    )!;
    await h.item(
      department,
      'assignment',
      { ...original, target: 99 },
      assignment,
    );
    await h.command(
      'APPROVE_ITEM',
      { kind: 'goal', id: goal, evidenceChecked: true },
      department,
    );
    const second = await h.item(department, 'goal', {
      ...fields,
      title: 'Another contribution',
    });
    await h.command(
      'APPROVE_ITEM',
      { kind: 'goal', id: second, evidenceChecked: true },
      department,
    );
    const ordinary = await h.document(department, h.employee);
    const handedOff = (await h.service.getApproved(h.employee)).find(
      (d) => d.id === department,
    )!;
    expect(
      ordinary.data.assignments.find((a) => a.id === assignment)?.target,
    ).toBe(10);
    expect(
      handedOff.data.assignments.find((a) => a.id === assignment)?.target,
    ).toBe(10);
  });

  const resultFields = (
    itemId: string,
    version: number,
    periodStart: string,
    periodEnd: string,
    actual = 25,
  ) => ({
    itemId,
    version,
    periodStart,
    periodEnd,
    actual,
    source: 'Production observations',
    notes: 'Checked the approved counting method and scope.',
  });
  async function reviseObjective(
    h: Awaited<ReturnType<typeof programmeFixture>>,
    effectiveDate: string,
    fields: Record<string, unknown> = {},
  ) {
    const original = (await h.document(h.company)).data.objectives[0];
    await h.command(
      'REVISE_ITEM',
      {
        kind: 'objective',
        id: h.objective,
        reason: 'Revised target',
        effectiveDate,
      },
      h.company,
    );
    await h.item(
      h.company,
      'objective',
      { ...original, target: 20, ...fields },
      h.objective,
    );
    await h.command(
      'APPROVE_ITEM',
      { kind: 'objective', id: h.objective, evidenceChecked: true },
      h.company,
    );
  }
  test('late results use the target effective during their reporting period and reject a copied full-plan version', async () => {
    const h = await programmeFixture();
    await reviseObjective(h, '2026-12-01');
    await h.command('APPROVE', {}, h.company);
    expect((await h.document(h.company)).itemApprovals![0]).toMatchObject({
      version: 2,
      effectiveDate: '2026-12-01',
    });
    jest.setSystemTime(Date.parse('2026-12-05T09:00:00Z'));
    const before = h.snapshot();
    await expect(
      h.command(
        'SAVE_RESULT',
        resultFields(h.objective, 2, '2026-11-01', '2026-11-30'),
        h.company,
      ),
    ).rejects.toThrow(/approval version/);
    await expect(
      h.command(
        'SAVE_RESULT',
        resultFields(h.objective, 3, '2026-11-01', '2026-11-30'),
        h.company,
      ),
    ).rejects.toThrow(/own approval/);
    expect(h.snapshot()).toEqual(before);
    await h.command(
      'SAVE_RESULT',
      resultFields(h.objective, 1, '2026-11-01', '2026-11-30'),
      h.company,
    );
    expect((await h.view()).programmeResults![0].version).toBe(1);
  });
  test('future actuals are rejected and a mid-period revision splits the approved calendar period', async () => {
    const h = await programmeFixture();
    await expect(
      h.command(
        'SAVE_RESULT',
        resultFields(h.objective, 1, '2026-12-01', '2026-12-31'),
        h.company,
      ),
    ).rejects.toThrow(/future/);
    await reviseObjective(h, '2026-11-15');
    jest.setSystemTime(Date.parse('2026-12-01T09:00:00Z'));
    const document = await h.document(h.company);
    expect(programmeResultPeriods(document, h.objective, 1)).toContainEqual(
      expect.objectContaining({ start: '2026-11-01', end: '2026-11-14' }),
    );
    expect(programmeResultPeriods(document, h.objective, 2)).toContainEqual(
      expect.objectContaining({ start: '2026-11-15', end: '2026-11-30' }),
    );
    await expect(
      h.command(
        'SAVE_RESULT',
        resultFields(h.objective, 2, '2026-11-01', '2026-11-30'),
        h.company,
      ),
    ).rejects.toThrow(/Split a period/);
    await h.command(
      'SAVE_RESULT',
      resultFields(h.objective, 1, '2026-11-01', '2026-11-14'),
      h.company,
    );
    await h.command(
      'SAVE_RESULT',
      resultFields(h.objective, 2, '2026-11-15', '2026-11-30'),
      h.company,
    );
    expect(
      (await h.view()).programmeResults!.map((result) => result.version),
    ).toEqual([1, 2]);
  });
  test.each([
    ['baseline', -1],
    ['baseline', 1.5],
    ['target', -40],
    ['target', 1.5],
  ])('count %s %s cannot be approved', async (field, value) => {
    const h = await programmeFixture();
    const original = (await h.document(h.company)).data.objectives[0];
    await h.command(
      'REVISE_ITEM',
      {
        kind: 'objective',
        id: h.objective,
        reason: 'Count actions',
        effectiveDate: '2026-11-04',
      },
      h.company,
    );
    await h.item(
      h.company,
      'objective',
      { ...original, unit: 'actions', baseline: 7, target: 0, [field]: value },
      h.objective,
    );
    const before = h.snapshot();
    await expect(
      h.command(
        'APPROVE_ITEM',
        { kind: 'objective', id: h.objective, evidenceChecked: true },
        h.company,
      ),
    ).rejects.toThrow();
    expect(h.snapshot()).toEqual(before);
    expect((await h.document(h.company)).issues.join(' ')).toMatch(
      /nonnegative whole/,
    );
  });
  test('count actuals reject negatives and fractions; zero and negative continuous measurements remain valid', async () => {
    const h = await programmeFixture();
    await reviseObjective(h, '2026-11-04', {
      unit: 'actions',
      baseline: 7,
      target: 0,
    });
    jest.setSystemTime(Date.parse('2026-12-01T09:00:00Z'));
    for (const actual of [-1, 1.5])
      await expect(
        h.command(
          'SAVE_RESULT',
          resultFields(h.objective, 2, '2026-11-04', '2026-11-30', actual),
          h.company,
        ),
      ).rejects.toThrow(/nonnegative whole/);
    await h.command(
      'SAVE_RESULT',
      resultFields(h.objective, 2, '2026-11-04', '2026-11-30', 0),
      h.company,
    );
    await reviseObjective(h, '2026-12-01', {
      unit: 'degrees C',
      baseline: -5,
      target: -10,
    });
    jest.setSystemTime(Date.parse('2027-01-01T09:00:00Z'));
    await h.command(
      'SAVE_RESULT',
      resultFields(h.objective, 3, '2026-12-01', '2026-12-31', -10.5),
      h.company,
    );
    expect(
      (await h.view()).programmeResults!.map((result) => result.actual),
    ).toEqual([0, -10.5]);
  });
  test('an individual objective approves under a partially allocated pillar while full-plan approval requires balance', async () => {
    const h = await programmeFixture();
    await reviseObjective(h, '2026-11-04', { weightage: 15 });
    expect((await h.document(h.company)).itemApprovals![0].status).toBe(
      'APPROVED',
    );
    await expect(h.command('APPROVE', {}, h.company)).rejects.toThrow();
    expect((await h.document(h.company)).issues.join(' ')).toMatch(
      /total exactly 30/,
    );
  });
  test('approved pillar allocation remains pinned when Area 01 later publishes different weights', async () => {
    const h = await programmeFixture();
    h.references.pillarWeights = {
      source: 'AREA_01',
      approved: true,
      version: 2,
      weights: { LEX: 10, PEX: 20, OPX: 10, CMX: 40, SGEX: 10, FPEX: 10 },
    };
    await reviseObjective(h, '2026-11-04');
    const snapshot = (await h.document(h.company)).versions.at(-1)!;
    expect(snapshot.localPillarWeights?.OPX).toBe(30);
    expect(snapshot.pillarWeights).toBeUndefined();
  });
  test('superseded future revision dates do not split the newer effective target period', async () => {
    const h = await programmeFixture();
    await reviseObjective(h, '2026-12-15');
    await reviseObjective(h, '2026-11-15');
    const periods = programmeResultPeriods(await h.document(h.company), h.objective, 3);
    expect(periods.filter((period) => period.start.startsWith('2026-12')))
      .toEqual([expect.objectContaining({ start: '2026-12-01', end: '2026-12-31' })]);
  });
  test('KPI assignments validate discrete baseline and period targets against their definition unit', async () => {
    const h = await programmeFixture();
    const department = await h.plan('DEPARTMENT', 'production');
    const goal = await h.item(department, 'goal', {
      ...h.goalData(),
      parent: h.parent,
      definition: 'Recorded setup delays',
      source: 'Setup log',
      baselinePeriod: 'October 2026',
      frequency: 'MONTHLY',
      direction: 'LOWER',
      relevance: 'Faster setup supports the company production objective.',
    });
    const base = (await h.view()).definitions.find(
      (definition) => definition.id === 'ref-kpi-downtime',
    )!;
    const countDefinition = (
      await h.command('SAVE_DEFINITION', {
        ...base,
        id: undefined,
        name: 'Open setup actions',
        unit: 'actions',
        adaptedFromId: base.id,
      })
    ).focusId;
    const assignment = await h.assignment(department, goal, {
      definitionId: countDefinition,
      baseline: -1,
      target: 2,
    });
    await expect(
      h.command(
        'APPROVE_ITEM',
        { kind: 'goal', id: goal, evidenceChecked: true },
        department,
      ),
    ).rejects.toThrow();
    let saved = (await h.document(department)).data.assignments.find(
      (item) => item.id === assignment,
    )!;
    await h.item(
      department,
      'assignment',
      { ...saved, baseline: 7, target: 1.5 },
      assignment,
    );
    await expect(
      h.command(
        'APPROVE_ITEM',
        { kind: 'goal', id: goal, evidenceChecked: true },
        department,
      ),
    ).rejects.toThrow();
    expect((await h.document(department)).issues.join(' ')).toMatch(
      /nonnegative whole/,
    );
    saved = (await h.document(department)).data.assignments.find(
      (item) => item.id === assignment,
    )!;
    await h.item(department, 'assignment', { ...saved, target: 0 }, assignment);
    await h.command(
      'APPROVE_ITEM',
      { kind: 'goal', id: goal, evidenceChecked: true },
      department,
    );
  });
  test('split reporting segments recompute working days and deadlines from the immutable calendar', async () => {
    const h = await programmeFixture();
    h.references.calendar = {
      id: 'calendar',
      version: 1,
      source: 'AREA_02',
      approved: true,
      timeZone: 'Asia/Kolkata',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      workingDays: [1, 2, 3, 4, 5],
      holidays: [],
      weekStart: 1,
      fortnightAnchor: '2026-01-05',
      twiceMonthlySplit: 15,
      submissionDueDays: 2,
    };
    await reviseObjective(h, '2026-11-04');
    await reviseObjective(h, '2026-11-09');
    const snapshot = (await h.document(h.company)).versions[1];
    expect(snapshot.calendar?.version).toBe(1);
    h.references.calendar.holidays.push('2026-11-04');
    const periods = programmeResultPeriods(
      await h.document(h.company),
      h.objective,
      2,
    );
    expect(periods).toContainEqual(
      expect.objectContaining({
        start: '2026-11-04',
        end: '2026-11-08',
        scheduled: true,
        submissionDate: '2026-11-10',
      }),
    );
    // A second pair of revisions isolates a weekend under the pinned calendar.
    await reviseObjective(h, '2026-11-07');
    await reviseObjective(h, '2026-11-09');
    expect(
      programmeResultPeriods(await h.document(h.company), h.objective, 4),
    ).toContainEqual(
      expect.objectContaining({
        start: '2026-11-07',
        end: '2026-11-08',
        scheduled: false,
      }),
    );
  });
});
