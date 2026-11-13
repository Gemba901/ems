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

describe('Area 03 completion workflows', () => {
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
  test('programme individual readiness and approval agree when optional KPI assignments are absent', async () => {
    const h = await programmeFixture(),
      individual = await h.plan('INDIVIDUAL', 'operator');
    await h.command(
      'SAVE_GOALS',
      { goals: [{ data: { title: 'Incomplete programme draft' } }] },
      individual,
    );
    const draft = await h.document(individual);
    expect(draft.issues.join(' ')).not.toMatch(
      /add a KPI assignment|add a delivery action|no separate action plan/,
    );
    const goal = draft.data.goals[0];
    await h.command(
      'SAVE_GOALS',
      {
        goals: [
          {
            id: goal.id,
            data: {
              ...h.goalData(),
              title: 'Reduce my setup delays',
              ownerId: 'operator',
              parent: h.parent,
              definition: 'Setup delay minutes per shift',
              source: 'Operator setup log',
              frequency: 'MONTHLY',
              direction: 'LOWER',
            },
          },
        ],
      },
      individual,
    );
    const ready = await h.document(individual);
    expect(ready.issues).toEqual([]);
    expect(ready.programmeIssues?.[goal.id]).toEqual([]);
    expect(ready.data.assignments).toEqual([]);
    await h.command('SUBMIT', {}, individual);
    await h.command('APPROVE', {}, individual);
    expect((await h.document(individual)).versions[0].data.assignments).toEqual(
      [],
    );
  });
  test('nested individual KPI drafts save atomically, force goal identity and preserve omitted assignments', async () => {
    const h = await programmeFixture(),
      individual = await h.plan('INDIVIDUAL', 'operator');
    const row = (title: string) => ({
      data: {
        ...h.goalData(),
        title,
        ownerId: 'operator',
        parent: h.parent,
        definition: 'Setup duration',
        source: 'Setup log',
        frequency: 'MONTHLY',
        direction: 'LOWER',
      },
      assignments: [
        {
          data: {
            goalId: 'untrusted-other-goal',
            definitionId: 'ref-kpi-downtime',
            startDate: '2026-01-01',
            endDate: '2026-12-31',
          },
        },
      ],
    });
    await h.command(
      'SAVE_GOALS',
      { goals: [row('First contribution'), row('Second contribution')] },
      individual,
    );
    const saved = await h.document(individual),
      [first, second] = saved.data.goals,
      [a, b] = saved.data.assignments;
    expect(a.goalId).toBe(first.id);
    expect(b.goalId).toBe(second.id);
    expect(a.baseline).toBeNull();
    expect(a.target).toBeNull();
    expect(a.targets).toHaveLength(12);
    expect(a.targets.every((t) => t.target === null)).toBe(true);
    expect(saved.issues.join(' ')).toMatch(/data provider and verifier/);
    expect(saved.issues.join(' ')).toMatch(/set the target/);
    await expect(h.command('SUBMIT', {}, individual)).rejects.toMatchObject({
      response: { message: saved.issues },
    });
    await expect(h.command('APPROVE', {}, individual)).rejects.toMatchObject({
      response: { message: saved.issues },
    });
    await h.command(
      'SAVE_GOALS',
      {
        goals: [
          {
            id: first.id,
            data: { ...first, title: 'Renamed first contribution' },
          },
        ],
      },
      individual,
    );
    expect((await h.document(individual)).data.assignments).toEqual(
      saved.data.assignments,
    );
    const before = h.snapshot();
    const invalidRows = [
      [
        {
          id: first.id,
          data: { ...first, title: 'Must roll back' },
          assignments: [{ id: a.id, data: { ...a, source: 'Unsaved source' } }],
        },
        { id: second.id, data: second, assignments: [{ id: a.id, data: a }] },
      ],
      [{ id: second.id, data: second, assignments: [{ id: a.id, data: a }] }],
      [
        {
          id: first.id,
          data: first,
          assignments: [
            { id: a.id, data: a },
            { id: a.id, data: a },
          ],
        },
      ],
      [
        {
          id: first.id,
          data: first,
          assignments: [{ id: a.id, data: a }],
          removedAssignmentIds: [a.id],
        },
      ],
      [{ id: first.id, data: first, removedAssignmentIds: [b.id] }],
      [{ id: first.id, data: first, removedAssignmentIds: [a.id, a.id] }],
      [
        {
          id: first.id,
          data: { ...first, title: 'Must roll back' },
          assignments: [
            { id: a.id, data: { ...a, source: 'Unsaved source' } },
            { data: { providerId: 'person-from-another-organisation' } },
          ],
        },
      ],
    ];
    for (const goals of invalidRows) {
      await expect(
        h.command('SAVE_GOALS', { goals }, individual),
      ).rejects.toThrow();
      expect(h.snapshot()).toEqual(before);
    }
    await h.command(
      'SAVE_GOALS',
      { goals: [{ id: first.id, data: first, removedAssignmentIds: [a.id] }] },
      individual,
    );
    expect((await h.document(individual)).data.assignments).toEqual([b]);
    await expect(
      h.command(
        'SAVE_GOALS',
        { goals: [], removedIds: [second.id] },
        individual,
      ),
    ).rejects.toThrow(/linked/);
  });
  test('complete explicit individual KPI assignments validate targets and independent people, then lock in approved snapshots', async () => {
    const h = await programmeFixture(),
      individual = await h.plan('INDIVIDUAL', 'operator');
    const goalFields = {
      ...h.goalData(),
      ownerId: 'operator',
      parent: h.parent,
      definition: 'Setup duration',
      source: 'Setup log',
      frequency: 'MONTHLY',
      direction: 'LOWER',
    };
    const assignmentFields = {
      definitionId: 'ref-kpi-downtime',
      ownerId: 'operator',
      providerId: 'operator',
      verifierId: 'operator',
      baseline: 0,
      source: 'Verified setup log',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      updateFrequency: 'MONTHLY',
      reviewFrequency: 'QUARTERLY',
      targetMode: 'SAME',
      target: 0,
    };
    await h.command(
      'SAVE_GOALS',
      {
        goals: [
          { data: goalFields, assignments: [{ data: assignmentFields }] },
        ],
      },
      individual,
    );
    const draft = await h.document(individual),
      goal = draft.data.goals[0],
      assignment = draft.data.assignments[0];
    expect(draft.issues.join(' ')).toMatch(
      /provider and verifier must be different/,
    );
    expect(draft.programmeIssues?.[goal.id].join(' ')).toMatch(
      /provider and verifier must be different/,
    );
    await expect(h.command('APPROVE', {}, individual)).rejects.toMatchObject({
      response: { message: draft.issues },
    });
    await h.command(
      'SAVE_GOALS',
      {
        goals: [
          {
            id: goal.id,
            data: goalFields,
            assignments: [
              {
                id: assignment.id,
                data: { ...assignmentFields, verifierId: 'hod' },
              },
            ],
          },
        ],
      },
      individual,
    );
    expect((await h.document(individual)).issues).toEqual([]);
    await h.command('SUBMIT', {}, individual);
    await h.command('APPROVE', {}, individual);
    const approved = await h.document(individual);
    expect(approved.versions[0].data.assignments[0]).toMatchObject({
      id: assignment.id,
      goalId: goal.id,
      baseline: 0,
      target: 0,
      providerId: 'operator',
      verifierId: 'hod',
    });
    expect(
      approved.versions[0].data.assignments[0].targets.every(
        (t) => t.target === 0,
      ),
    ).toBe(true);
    expect(
      approved.versions[0].definitions.some((d) => d.id === 'ref-kpi-downtime'),
    ).toBe(true);
    const before = h.snapshot();
    await expect(
      h.command(
        'SAVE_GOALS',
        {
          goals: [
            {
              id: goal.id,
              data: goalFields,
              assignments: [
                { id: assignment.id, data: { ...assignmentFields, target: 5 } },
              ],
            },
          ],
        },
        individual,
      ),
    ).rejects.toThrow(/locked/);
    expect(h.snapshot()).toEqual(before);
  });
  test('department card approval checks and snapshots supplied KPIs without requiring an assignment when none exists', async () => {
    const h = await programmeFixture(),
      department = await h.plan('DEPARTMENT', 'production');
    const goal = await h.item(department, 'goal', {
      ...h.goalData(),
      parent: h.parent,
      goalNo: 1,
      definition: 'Setup duration',
      source: 'Setup log',
      baselinePeriod: 'October 2026',
      frequency: 'MONTHLY',
      direction: 'LOWER',
    });
    const assignment = await h.item(department, 'assignment', {
      goalId: goal,
      definitionId: 'ref-kpi-downtime',
    });
    expect(
      (await h.document(department)).programmeIssues?.[goal].join(' '),
    ).toMatch(/data provider and verifier/);
    await expect(
      h.command(
        'APPROVE_ITEM',
        { kind: 'goal', id: goal, evidenceChecked: true },
        department,
      ),
    ).rejects.toThrow();
    const fields = {
      goalId: goal,
      definitionId: 'ref-kpi-downtime',
      ownerId: 'hod',
      providerId: 'operator',
      verifierId: 'hod',
      baseline: 0,
      source: 'Shift downtime log',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      updateFrequency: 'MONTHLY',
      reviewFrequency: 'QUARTERLY',
      targetMode: 'SAME',
      target: 0,
    };
    await h.item(department, 'assignment', fields, assignment);
    await h.command(
      'APPROVE_ITEM',
      { kind: 'goal', id: goal, evidenceChecked: true },
      department,
    );
    const approved = await h.document(department);
    expect(approved.versions[0].data.assignments.map((a) => a.id)).toEqual([
      assignment,
    ]);
    expect(
      approved.versions[0].definitions.some(
        (d) => d.id === fields.definitionId,
      ),
    ).toBe(true);
    await expect(
      h.item(department, 'assignment', { ...fields, target: 5 }, assignment),
    ).rejects.toThrow(/approved commitment/);
    await expect(h.item(department, 'assignment', fields)).rejects.toThrow(
      /approved commitment/,
    );
    await h.command(
      'REVISE_ITEM',
      {
        kind: 'goal',
        id: goal,
        reason: 'Update KPI targets for the next period',
        effectiveDate: '2026-11-04',
      },
      department,
    );
    await h.item(
      department,
      'assignment',
      { ...fields, target: 1 },
      assignment,
    );
    expect((await h.document(department)).versions[0]).toEqual(
      approved.versions[0],
    );
  });
  test('programme card approval publishes only the selected row, locks it and retains its measurement version after another approval', async () => {
    const h = await programmeFixture();
    const first = structuredClone((await h.document(h.company)).versions[0]);
    await expect(
      h.item(
        h.company,
        'objective',
        {
          ...(await h.document(h.company)).data.objectives[0],
          title: 'Overwrite',
        },
        h.objective,
      ),
    ).rejects.toThrow(/locked/);
    const draft = await h.item(h.company, 'objective', {
      title: 'Unfinished people objective',
      pillar: 'PEX',
      priority: 4,
      weightage: 20,
    });
    expect(
      (await h.document(h.company, h.employee)).data.objectives.map(
        (o) => o.id,
      ),
    ).toEqual([h.objective]);
    const initial = h.snapshot();
    await expect(
      h.command(
        'APPROVE_ITEM',
        { kind: 'objective', id: draft, evidenceChecked: true },
        h.company,
      ),
    ).rejects.toThrow();
    expect(h.snapshot()).toEqual(initial);
    await h.command(
      'SAVE_RESULT',
      {
        itemId: h.objective,
        version: 1,
        periodStart: '2026-10-01',
        periodEnd: '2026-10-31',
        actual: 30,
        source: 'Observation log',
        notes: 'Same scope and method',
      },
      h.company,
    );
    const result = (await h.view()).programmeResults![0];
    await expect(
      h.command(
        'VERIFY_RESULT',
        { id: result.id, decision: 'VERIFIED', note: 'Checked' },
        h.company,
      ),
    ).rejects.toThrow(/own measurement/);
    await expect(
      h.command(
        'SAVE_REVIEW',
        {
          itemId: h.objective,
          version: 1,
          decision: 'SUSTAIN',
          note: 'Reached target',
          nextReviewDate: '2026-12-01',
        },
        h.company,
      ),
    ).rejects.toThrow(/Verify/);
    await h.command(
      'SAVE_REVIEW',
      {
        itemId: h.objective,
        version: 1,
        decision: 'INVESTIGATE',
        note: 'Await independent evidence check',
        nextReviewDate: '2026-12-01',
      },
      h.company,
    );
    const nextFinding = await h
      .item(h.swot.id, 'finding', {
        pillar: 'PEX',
        category: 'W',
        title: 'Training gaps',
        explanation: 'Two operators not trained',
        evidence: 'Training register',
        impact: 'Unstable setup work',
        weightage: 6,
        response: 'OBJECTIVE',
      })
      .catch(() => null);
    expect(nextFinding).toBeNull(); // Whole reviewed assessment remains locked.
    await h.command(
      'REVISE_ITEM',
      {
        kind: 'objective',
        id: h.objective,
        reason: 'Update target after verified study',
        effectiveDate: '2026-11-05',
      },
      h.company,
    );
    expect((await h.document(h.company)).versions[0]).toEqual(first);
    expect(
      (await h.document(h.company)).itemApprovals?.find(
        (a) => a.itemId === h.objective,
      )?.status,
    ).toBe('DRAFT');
  });
  test('department goals allocate sequential server numbers per parent and department and never reuse deleted numbers', async () => {
    const h = await programmeFixture();
    const department = await h.plan('DEPARTMENT', 'production');
    const fields = {
      ...h.goalData(),
      parent: h.parent,
      direction: 'LOWER',
      definition: 'Minutes of downtime',
      source: 'Machine log',
      frequency: 'MONTHLY',
      baselinePeriod: 'October 2026',
    };
    const first = await h.item(department, 'goal', {
      ...fields,
      goalNo: 'ignore this obsolete client field',
    });
    const second = await h.item(department, 'goal', {
      ...fields,
      title: 'Second contribution',
      goalNo: 88,
    });
    const beforeEdit = (await h.document(department)).data.goals.find(
      (g) => g.id === first,
    )!;
    expect(beforeEdit.goalNo).toBe(1);
    expect(beforeEdit.code).toMatch(/-G01$/);
    expect(
      (await h.document(department)).data.goals.find((g) => g.id === second)
        ?.goalNo,
    ).toBe(2);
    await h.item(
      department,
      'goal',
      {
        ...beforeEdit,
        title: 'Renamed contribution',
        goalNo: 51,
        code: 'forged',
        departmentCode: 'forged',
      },
      first,
    );
    expect(
      (await h.document(department)).data.goals.find((g) => g.id === first),
    ).toMatchObject({
      goalNo: 1,
      code: beforeEdit.code,
      departmentCode: beforeEdit.departmentCode,
    });
    await h.command('DELETE_ITEM', { kind: 'goal', id: second }, department);
    const third = await h.item(department, 'goal', fields);
    expect(
      (await h.document(department)).data.goals.find((g) => g.id === third)
        ?.goalNo,
    ).toBe(3);
    const quality = await h.plan('DEPARTMENT', 'quality');
    const qualityGoal = await h.item(quality, 'goal', {
      ...fields,
      ownerId: 'leader',
    });
    expect(
      (await h.document(quality)).data.goals.find((g) => g.id === qualityGoal)
        ?.goalNo,
    ).toBe(1);

    const objectiveFields = (await h.document(h.company)).data.objectives[0];
    const otherObjective = await h.item(h.company, 'objective', {
      ...objectiveFields,
      title: 'Skills for reliable changeovers',
      pillar: 'PEX',
      weightage: 20,
    });
    await h.command(
      'APPROVE_ITEM',
      { kind: 'objective', id: otherObjective, evidenceChecked: true },
      h.company,
    );
    const otherParent = { ...h.parent, goalId: otherObjective, version: 2 };
    const otherGoal = await h.item(department, 'goal', {
      ...fields,
      parent: otherParent,
    });
    expect(
      (await h.document(department)).data.goals.find((g) => g.id === otherGoal)
        ?.goalNo,
    ).toBe(1);
    await h.item(department, 'goal', { ...fields, parent: otherParent }, first);
    const moved = (await h.document(department)).data.goals.find(
      (g) => g.id === first,
    )!;
    expect(moved.goalNo).toBe(2);
    expect(moved.code).not.toBe(beforeEdit.code);
    const fourth = await h.item(department, 'goal', fields);
    expect(
      (await h.document(department)).data.goals.find((g) => g.id === fourth)
        ?.goalNo,
    ).toBe(4);
  });
  test('incomplete department drafts allocate when linked and failed saves do not consume goal numbers', async () => {
    const h = await programmeFixture();
    const department = await h.plan('DEPARTMENT', 'production');
    const draftId = await h.item(department, 'goal', {
      title: 'Unlinked draft',
      goalNo: 77,
    });
    const draft = (await h.document(department)).data.goals[0];
    expect(draft.goalNo).toBeNull();
    const before = h.snapshot();
    await expect(
      h.item(
        department,
        'goal',
        { ...draft, parent: h.parent, definitionId: 'missing-kpi-definition' },
        draftId,
      ),
    ).rejects.toThrow(/existing KPI definition/);
    expect(h.snapshot()).toEqual(before);
    const revision = (await h.view()).revision;
    await expect(
      h.service.command(h.leader, {
        action: 'SAVE_ITEM',
        documentId: department,
        expectedRevision: revision - 1,
        payload: {
          kind: 'goal',
          id: draftId,
          data: { ...draft, parent: h.parent },
        },
      }),
    ).rejects.toThrow();
    expect(h.snapshot()).toEqual(before);
    await h.item(department, 'goal', { ...draft, parent: h.parent }, draftId);
    expect((await h.document(department)).data.goals[0]).toMatchObject({
      id: draftId,
      goalNo: 1,
    });
    expect((await h.document(department)).data.goals[0].code).toMatch(/-G01$/);
  });
  test('legacy history seeds department numbering beyond99 and approved revisions retain their parent and generated identity', async () => {
    const h = await programmeFixture();
    const department = await h.plan('DEPARTMENT', 'production');
    const fields = {
      ...h.goalData(),
      parent: h.parent,
      direction: 'LOWER',
      definition: 'Minutes of downtime',
      source: 'Machine log',
      frequency: 'MONTHLY',
      baselinePeriod: 'October 2026',
    };
    const goalId = await h.item(department, 'goal', fields);
    await h.command(
      'APPROVE_ITEM',
      { kind: 'goal', id: goalId, evidenceChecked: true },
      department,
    );
    const state = h.snapshot().get('org-one')!.state;
    delete state.departmentGoalSequences;
    const legacy = state.documents.find((d) => d.id === department)!;
    for (const data of [legacy.data, ...legacy.versions.map((v) => v.data)]) {
      const goal = data.goals.find((g) => g.id === goalId)!;
      goal.goalNo = 99;
      goal.code = goal.code.replace(/-G01$/, '-G99');
    }
    const resumed = harness(state);
    const approved = structuredClone(
      (await resumed.document(department)).versions[0],
    );
    const next = await resumed.item(department, 'goal', fields);
    expect(
      (await resumed.document(department)).data.goals.find(
        (g) => g.id === next,
      ),
    ).toMatchObject({ goalNo: 100 });
    expect(
      (await resumed.document(department)).data.goals.find((g) => g.id === next)
        ?.code,
    ).toMatch(/-G100$/);
    await resumed.command(
      'DELETE_ITEM',
      { kind: 'goal', id: next },
      department,
    );
    const afterDelete = await resumed.item(department, 'goal', fields);
    expect(
      (await resumed.document(department)).data.goals.find(
        (g) => g.id === afterDelete,
      )?.goalNo,
    ).toBe(101);
    await resumed.command(
      'REVISE_ITEM',
      {
        kind: 'goal',
        id: goalId,
        reason: 'Clarify the delivery method',
        effectiveDate: '2026-11-04',
      },
      department,
    );
    const goal = (await resumed.document(department)).data.goals.find(
      (g) => g.id === goalId,
    )!;
    const before = resumed.snapshot();
    await expect(
      resumed.item(
        department,
        'goal',
        { ...goal, parent: null, goalNo: null },
        goalId,
      ),
    ).rejects.toThrow(/keeps its parent/);
    expect(resumed.snapshot()).toEqual(before);
    await resumed.item(
      department,
      'goal',
      { ...goal, title: 'Revised delivery method', goalNo: 3 },
      goalId,
    );
    expect(
      (await resumed.document(department)).data.goals.find(
        (g) => g.id === goalId,
      ),
    ).toMatchObject({ goalNo: 99, code: goal.code });
    expect((await resumed.document(department)).versions[0]).toEqual(approved);
  });
  test('department card needs a real baseline, gets a stable business ID, and actions recorded afterwards do not count as results', async () => {
    const h = await programmeFixture();
    const department = await h.plan('DEPARTMENT', 'production');
    const goal = await h.item(department, 'goal', {
      ...h.goalData(),
      parent: h.parent,
      goalNo: 1,
      definition: 'Minutes from last acceptable part to first acceptable part',
      direction: 'LOWER',
      baseline: null,
      baselineReason: 'Still checking',
      baselinePeriod: 'October 2026',
      source: 'Setup observation log',
      frequency: 'MONTHLY',
    });
    const draft = (await h.document(department)).data.goals[0];
    expect(draft.code).toMatch(/-G01$/);
    await expect(
      h.command(
        'APPROVE_ITEM',
        { kind: 'goal', id: goal, evidenceChecked: true },
        department,
      ),
    ).rejects.toThrow();
    await h.item(department, 'goal', { ...draft, baseline: 8 }, goal);
    await h.command(
      'APPROVE_ITEM',
      { kind: 'goal', id: goal, evidenceChecked: true },
      department,
    );
    expect((await h.document(department)).versions[0].data.assignments).toEqual(
      [],
    );
    const action = await h.item(department, 'action', {
      title: 'Train setup operators',
      goalId: goal,
      parent: {
        documentId: department,
        goalId: goal,
        version: 1,
        itemKind: 'GOAL',
      },
      ownerId: 'operator',
      dueDate: '2026-12-01',
      expectedResult: 'Consistent setup',
      completionEvidence: 'Signed observed practice',
      support: 'Supervisor time',
    });
    expect(
      (await h.view(h.employee)).programmeActions?.some(
        (a) => a.action.id === action,
      ),
    ).toBe(true);
    await expect(
      h.command(
        'UPDATE_ACTION_PROGRESS',
        { actionId: action, status: 'COMPLETED' },
        department,
        h.employee,
      ),
    ).rejects.toThrow(/evidence/);
    await h.command(
      'UPDATE_ACTION_PROGRESS',
      {
        actionId: action,
        status: 'COMPLETED',
        evidence: 'Signed training register',
      },
      department,
      h.employee,
    );
    expect((await h.view()).programmeResults).toEqual([]);
    await h
      .command(
        'SAVE_RESULT',
        {
          itemId: goal,
          version: 1,
          periodStart: '2026-10-01',
          periodEnd: '2026-10-31',
          actual: 0,
          source: 'Setup log',
          notes: 'Verified no lost minutes',
        },
        department,
        h.employee,
      )
      .catch(() => {});
    // A department employee is not an authorised department result planner.
    expect((await h.view()).programmeResults).toEqual([]);
    const hod = { ...h.leader, userId: 'u-hod', roleLevel: Role.HOD };
    const id = (
      await h.command(
        'SAVE_RESULT',
        {
          itemId: goal,
          version: 1,
          periodStart: '2026-10-01',
          periodEnd: '2026-10-31',
          actual: 0,
          source: 'Setup log',
          notes: 'Same counting method',
        },
        department,
        hod,
      )
    ).focusId;
    await h.command(
      'VERIFY_RESULT',
      { id, decision: 'VERIFIED', note: 'Checked raw observations' },
      department,
    );
    expect((await h.view()).programmeResults![0]).toMatchObject({
      actual: 0,
      status: 'VERIFIED',
      recordedBy: 'u-hod',
      verifiedBy: 'u-leader',
    });
    await expect(
      h.command(
        'SAVE_RESULT',
        {
          itemId: goal,
          version: 1,
          periodStart: '2026-10-01',
          periodEnd: '2026-10-31',
          actual: 1,
          source: 'Duplicate',
          notes: 'Duplicate',
        },
        department,
        hod,
      ),
    ).rejects.toThrow(/already/);
  });
  test('individual contribution batches are atomic and permit an incomplete empty draft', async () => {
    const h = await programmeFixture();
    const individual = await h.plan('INDIVIDUAL', 'operator');
    await h.command('SAVE_GOALS', { goals: [] }, individual);
    const before = h.snapshot();
    await expect(
      h.command(
        'SAVE_GOALS',
        {
          goals: [
            { data: { title: 'One', parent: h.parent } },
            { data: { title: 'Two', parent: { ...h.parent, version: 999 } } },
          ],
        },
        individual,
      ),
    ).rejects.toThrow();
    expect(h.snapshot()).toEqual(before);
    await h.command(
      'SAVE_GOALS',
      {
        goals: [
          { data: { title: 'One', parent: h.parent } },
          { data: { title: 'Two', parent: h.parent } },
        ],
      },
      individual,
    );
    expect((await h.document(individual)).data.goals).toHaveLength(2);
  });
  test('an unrelated card approval never republishes a future objective revision early or changes its result reference', async () => {
    const h = await programmeFixture();
    const original = (await h.document(h.company)).data.objectives[0];
    await h.command(
      'SAVE_RESULT',
      {
        itemId: h.objective,
        version: 1,
        periodStart: '2026-10-01',
        periodEnd: '2026-10-31',
        actual: 30,
        source: 'Log',
        notes: 'Checked counting method',
      },
      h.company,
    );
    await h.command(
      'REVISE_ITEM',
      {
        kind: 'objective',
        id: h.objective,
        reason: 'Lower target after a further study',
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
    await h.command(
      'APPROVE_ITEM',
      { kind: 'objective', id: h.objective, evidenceChecked: true },
      h.company,
    );
    const second = await h.item(h.company, 'objective', {
      ...original,
      pillar: 'LEX',
      title: 'Timely decisions',
      result: 'Reduce late decisions',
      weightage: 10,
      sources: [
        { documentId: h.swot.id, findingId: h.otherFinding, version: 1 },
      ],
    });
    await h.command(
      'APPROVE_ITEM',
      { kind: 'objective', id: second, evidenceChecked: true },
      h.company,
    );
    const employee = await h.document(h.company, h.employee);
    expect(
      employee.data.objectives.find((o) => o.id === h.objective)?.target,
    ).toBe(30);
    expect(employee.data.objectives.find((o) => o.id === second)).toBeDefined();
    expect(
      employee.versions
        .flatMap((v) => v.data.objectives)
        .filter((o) => o.id === h.objective)
        .every((o) => o.target === 30),
    ).toBe(true);
    const handoff = (await h.service.getApproved(h.employee)).find(
      (d) => d.id === h.company,
    )!;
    expect(handoff.itemVersions?.[h.objective]).toBe(1);
    await expect(
      h.command(
        'SAVE_RESULT',
        {
          itemId: h.objective,
          version: 3,
          periodStart: '2026-11-01',
          periodEnd: '2026-11-30',
          actual: 20,
          source: 'Wrong copied version',
          notes: 'Cannot use another item approval',
        },
        h.company,
      ),
    ).rejects.toThrow(/own approval/);
    await expect(
      h.command(
        'SAVE_RESULT',
        {
          itemId: h.objective,
          version: 2,
          periodStart: '2026-11-01',
          periodEnd: '2026-11-30',
          actual: 20,
          source: 'Future version',
          notes: 'Cannot use a future effective target',
        },
        h.company,
      ),
    ).rejects.toThrow(/not effective/);
    expect(
      (await h.view()).approvedParentGoals
        ?.filter((p) => p.goal.id === h.objective)
        .map((p) => p.version),
    ).toEqual([2, 1]);
    expect((await h.view()).programmeResults![0].version).toBe(1);
    jest.setSystemTime(Date.parse('2026-12-02T09:00:00Z'));
    expect(
      (await h.document(h.company, h.employee)).data.objectives.find(
        (o) => o.id === h.objective,
      )?.target,
    ).toBe(20);
  });
  test('review batches roll back mixed failures and direct reviewed-finding actions remain separate from company achievements', async () => {
    const h = harness(),
      swot = await h.plan('SWOT');
    const a = await h.item(swot, 'finding', {
      pillar: 'OPX',
      category: 'W',
      title: 'Leaking valve',
      explanation: 'Two leaks observed',
      evidence: 'Inspection log',
      impact: 'Lost coolant',
      weightage: 6,
      response: 'ACTION',
    });
    const b = await h.item(swot, 'finding', {
      pillar: 'OPX',
      category: 'W',
      title: 'Unconfirmed sound',
      weightage: 4,
      response: 'VERIFY',
      basis: 'NEEDS_CHECKING',
    });
    const before = h.snapshot();
    await expect(
      h.command(
        'REVIEW_FINDINGS',
        {
          ids: [a, b],
          status: 'REVIEWED',
          response: 'ACTION',
          decisionNote: 'Repair safely',
          evidenceChecked: true,
        },
        swot,
      ),
    ).rejects.toThrow();
    expect(h.snapshot()).toEqual(before);
    await h.command(
      'REVIEW_FINDING',
      {
        id: a,
        status: 'REVIEWED',
        response: 'ACTION',
        decisionNote: 'Repair safely',
        evidenceChecked: true,
      },
      swot,
    );
    const action = await h.item(swot, 'action', {
      title: 'Replace leaking seal',
      ownerId: 'operator',
      dueDate: '2026-12-01',
      expectedResult: 'No leaks',
      completionEvidence: 'Leak check',
      sources: [{ documentId: swot, findingId: a, version: 1 }],
    });
    await h.command(
      'UPDATE_ACTION_PROGRESS',
      { actionId: action, status: 'COMPLETED', evidence: 'Signed leak check' },
      swot,
    );
    expect((await h.view()).programmeActionProgress).toHaveLength(1);
    expect((await h.view()).programmeResults).toEqual([]);
    expect((await h.view(h.employee)).programmeActions).toEqual([]);
    const department = await h.plan('DEPARTMENT', 'production');
    const direct = await h.item(department, 'action', {
      title: 'Arrange replacement seal',
      ownerId: 'hod',
      dueDate: '2026-12-01',
      expectedResult: 'Correct replacement available',
      completionEvidence: 'Receipt check',
      sources: [{ documentId: swot, findingId: a, version: 1 }],
    });
    await h.command(
      'UPDATE_ACTION_PROGRESS',
      { actionId: direct, status: 'IN_PROGRESS' },
      department,
    );
    await h.command(
      'UPDATE_ACTION_PROGRESS',
      {
        actionId: direct,
        status: 'COMPLETED',
        evidence: 'Checked received seal',
      },
      department,
    );
    expect(
      (await h.view()).programmeActionProgress?.find(
        (p) => p.actionId === direct,
      )?.status,
    ).toBe('COMPLETED');
    expect((await h.document(department)).data.goals).toEqual([]);
  });
  test('company percentages use valid counts and sustain only their independently verified own measure', async () => {
    const h = await programmeFixture();
    const previous = (await h.document(h.company)).data.objectives[0];
    await h.command(
      'REVISE_ITEM',
      {
        kind: 'objective',
        id: h.objective,
        reason: 'Use the approved delivery measure',
        effectiveDate: '2026-11-04',
      },
      h.company,
    );
    await h.item(
      h.company,
      'objective',
      {
        ...previous,
        result: 'Deliver 95% of orders on time and in full',
        measure: 'OTIF',
        definition: 'Qualifying orders / all orders due in period × 100',
        baseline: 80,
        target: 95,
        unit: '%',
        direction: 'HIGHER',
      },
      h.objective,
    );
    await h.command(
      'APPROVE_ITEM',
      { kind: 'objective', id: h.objective, evidenceChecked: true },
      h.company,
    );
    await h.command('SAVE_SETTINGS', { coordinatorIds: ['hod'] }, h.company);
    const recorder = { ...h.leader, userId: 'u-hod', roleLevel: Role.HOD };
    const payload = {
      itemId: h.objective,
      version: 2,
      periodStart: '2026-11-01',
      periodEnd: '2026-11-30',
      actual: null,
      source: 'Orders due register and confirmations',
      notes: 'Original dates; same scope as baseline',
    };
    const before = h.snapshot();
    await expect(
      h.command(
        'SAVE_RESULT',
        { ...payload, numerator: 301, denominator: 300 },
        h.company,
        recorder,
      ),
    ).rejects.toThrow(/counts/);
    await expect(
      h.command('SAVE_RESULT', payload, h.company, recorder),
    ).rejects.toThrow(/measured value/);
    expect(h.snapshot()).toEqual(before);
    const id = (
      await h.command(
        'SAVE_RESULT',
        { ...payload, numerator: 285, denominator: 300 },
        h.company,
        recorder,
      )
    ).focusId;
    expect((await h.view()).programmeResults![0].actual).toBe(95);
    await expect(
      h.command(
        'SAVE_REVIEW',
        {
          itemId: h.objective,
          version: 2,
          decision: 'SUSTAIN',
          note: 'Hold standard work',
          nextReviewDate: '2026-12-31',
        },
        h.company,
      ),
    ).rejects.toThrow(/Verify/);
    await h.command(
      'VERIFY_RESULT',
      {
        id,
        decision: 'VERIFIED',
        note: 'Checked original order dates and full delivery counts',
      },
      h.company,
    );
    await h.command(
      'SAVE_REVIEW',
      {
        itemId: h.objective,
        version: 2,
        decision: 'SUSTAIN',
        note: 'Hold standard work and sample checks',
        nextReviewDate: '2026-12-31',
      },
      h.company,
    );
    expect((await h.view()).programmeReviews![0].resultId).toBe(id);
    await expect(
      h.command(
        'VERIFY_RESULT',
        { id, decision: 'REJECTED', note: 'Rewrite history' },
        h.company,
      ),
    ).rejects.toThrow(/awaiting verification/);
  });
  test('objective approval retains multiple QCDSMT selections and never rewrites historical Other snapshots', async () => {
    const original = await programmeFixture();
    const state = original.snapshot().get('org-one')!.state;
    const saved = state.documents.find((d) => d.id === original.company)!;
    const historical = saved.versions[0].data.objectives[0];
    historical.alignment = 'OTHER';
    historical.otherBusinessFocus = 'Historical management focus';
    delete (historical as Partial<typeof historical>).alignments;
    saved.data.objectives[0] = structuredClone(historical);
    const before = structuredClone(saved.versions[0]);
    const h = harness(state);
    await h.command(
      'REVISE_ITEM',
      {
        kind: 'objective',
        id: original.objective,
        reason: 'Apply the multiple-alignment planning form',
        effectiveDate: '2026-11-04',
      },
      original.company,
    );
    await h.item(
      original.company,
      'objective',
      {
        ...historical,
        alignments: [],
        alignment: 'D',
        alignmentReason: 'Must not bypass explicit clearing',
      },
      original.objective,
    );
    const cleared = await h.document(original.company);
    expect(cleared.data.objectives[0].alignments).toEqual([]);
    expect(cleared.programmeIssues?.[original.objective]).toContain(
      'Select one or more QCDSMT alignments or Business focus.',
    );
    await expect(
      h.command(
        'APPROVE_ITEM',
        { kind: 'objective', id: original.objective, evidenceChecked: true },
        original.company,
      ),
    ).rejects.toThrow();
    await h.item(
      original.company,
      'objective',
      {
        ...historical,
        alignments: ['Q', 'D', 'T'],
        alignment: 'OTHER',
        otherBusinessFocus: '',
      },
      original.objective,
    );
    await h.command(
      'APPROVE_ITEM',
      { kind: 'objective', id: original.objective, evidenceChecked: true },
      original.company,
    );
    const approved = await h.document(original.company);
    expect(approved.data.objectives[0].alignments).toEqual(['Q', 'D', 'T']);
    expect(approved.versions[1].data.objectives[0].alignments).toEqual([
      'Q',
      'D',
      'T',
    ]);
    expect(approved.versions[0]).toEqual(before);
    expect(approved.versions[0].data.objectives[0].otherBusinessFocus).toBe(
      'Historical management focus',
    );
    await h.command(
      'REVISE_ITEM',
      {
        kind: 'objective',
        id: original.objective,
        reason: 'Include strategic business focus',
        effectiveDate: '2026-11-04',
      },
      original.company,
    );
    await h.item(
      original.company,
      'objective',
      {
        ...approved.data.objectives[0],
        alignments: ['Q', 'OTHER'],
        alignment: 'D',
        otherBusinessFocus: '',
      },
      original.objective,
    );
    expect(
      (await h.document(original.company)).programmeIssues?.[
        original.objective
      ],
    ).toContain('Describe the Business focus.');
    await expect(
      h.command(
        'APPROVE_ITEM',
        { kind: 'objective', id: original.objective, evidenceChecked: true },
        original.company,
      ),
    ).rejects.toThrow();
    await h.item(
      original.company,
      'objective',
      {
        ...approved.data.objectives[0],
        alignments: ['Q', 'OTHER'],
        alignment: 'D',
        otherBusinessFocus: 'Supplier resilience and continuity',
      },
      original.objective,
    );
    await h.command(
      'APPROVE_ITEM',
      { kind: 'objective', id: original.objective, evidenceChecked: true },
      original.company,
    );
    const withFocus = await h.document(original.company);
    expect(withFocus.versions[2].data.objectives[0]).toMatchObject({
      alignments: ['Q', 'OTHER'],
      otherBusinessFocus: 'Supplier resilience and continuity',
    });
    expect(withFocus.versions.slice(0, 2)).toEqual(approved.versions);
  });
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(Date.parse('2026-11-04T09:00:00Z'));
  });
  afterEach(() => jest.useRealTimers());

  test('multi-year periods keep exact boundaries across plan levels without changing annual keys', async () => {
    const h = harness();
    const dates = { startDate: '2026-04-01', endDate: '2029-03-31' };
    const swot = (await h.command('CREATE_PLAN', { kind: 'SWOT', ...dates }))
      .focusId;
    const cycle = '2026-04-01..2029-03-31';
    expect(await h.document(swot)).toMatchObject({ cycle, data: dates });
    expect((await h.document(swot)).code).toMatch(/^SWOT-2026-2029-\d+$/);
    for (const [kind, scopeId] of [
      ['COMPANY', ''],
      ['DEPARTMENT', 'production'],
      ['INDIVIDUAL', 'operator'],
    ]) {
      const id = (await h.command('CREATE_PLAN', { kind, scopeId, cycle }))
        .focusId;
      const plan = await h.document(id);
      expect(plan).toMatchObject({ cycle, data: dates });
      expect(plan.issues.join(' ')).not.toMatch(/two years|planning period/i);
    }
    const annual = (
      await h.command('CREATE_PLAN', {
        kind: 'COMPANY',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      })
    ).focusId;
    expect(await h.document(annual)).toMatchObject({
      cycle: '2026',
      data: { startDate: '2026-01-01', endDate: '2026-12-31' },
    });
    const before = h.snapshot();
    await expect(
      h.command('CREATE_PLAN', { kind: 'COMPANY', cycle: '2026' }),
    ).rejects.toThrow(/already has a plan/);
    await expect(
      h.command('CREATE_PLAN', {
        kind: 'COMPANY',
        cycle: '2026-01-01..2026-12-31',
      }),
    ).rejects.toThrow(/already has a plan/);
    await expect(
      h.command('CREATE_PLAN', { kind: 'SWOT', ...dates }),
    ).rejects.toThrow(/already has a plan/);
    await expect(
      h.command('SAVE_SETTINGS', { endDate: '2030-03-31' }, swot),
    ).rejects.toThrow(/within the selected planning period/);
    expect(h.snapshot()).toEqual(before);
    const different = (
      await h.command('CREATE_PLAN', {
        kind: 'SWOT',
        startDate: '2026-04-02',
        endDate: '2029-03-31',
      })
    ).focusId;
    expect((await h.document(different)).cycle).toBe('2026-04-02..2029-03-31');
    expect((await h.document(different)).code).toMatch(/^SWOT-2026-2029-\d+$/);
    expect((await h.document(different)).code).not.toBe(
      (await h.document(swot)).code,
    );
  });

  test.each([
    { startDate: '2026-01-01' },
    { endDate: '2028-12-31' },
    { startDate: '2026-02-29', endDate: '2028-12-31' },
    { startDate: '2028-01-01', endDate: '2027-12-31' },
    { startDate: '1999-12-31', endDate: '2028-12-31' },
    { startDate: '2028-01-01', endDate: '2201-01-01' },
    { cycle: '2026', startDate: '2026-01-01', endDate: '2028-12-31' },
    { cycle: '2026-01-01..2028-02-30' },
    { cycle: '2026-2028' },
  ])(
    'invalid planning period %j cannot persist a partial record',
    async (period) => {
      const h = harness();
      await h.view();
      const before = h.snapshot();
      await expect(
        h.command('CREATE_PLAN', { kind: 'COMPANY', ...period }),
      ).rejects.toThrow();
      expect(h.snapshot()).toEqual(before);
    },
  );

  test('review requires alignment, Business focus explanation and explicit evidence confirmation', async () => {
    const h = harness(),
      assessment = await h.plan('SWOT');
    const fields = {
      pillar: 'OPX',
      category: 'W',
      title: 'Packaging scrap',
      alignment: '',
      explanation: 'The October report records 12 tonnes of scrap.',
      impact: 'Waste increases material costs.',
      evidence: 'October scrap report',
      basis: 'EVIDENCED',
      weightage: 7,
      response: 'OBJECTIVE',
      decisionNote: 'Reduce material loss.',
    };
    const id = await h.item(assessment, 'finding', fields);
    const before = h.snapshot();
    await expect(
      h.command(
        'REVIEW_FINDING',
        { id, status: 'REVIEWED', evidenceChecked: true },
        assessment,
      ),
    ).rejects.toThrow();
    expect(h.snapshot()).toEqual(before);
    await h.item(assessment, 'finding', { ...fields, alignment: 'OTHER' }, id);
    await expect(
      h.command(
        'REVIEW_FINDING',
        { id, status: 'REVIEWED', evidenceChecked: true },
        assessment,
      ),
    ).rejects.toThrow();
    await h.item(
      assessment,
      'finding',
      {
        ...fields,
        alignment: 'OTHER',
        otherBusinessFocus: 'Regulatory waste reporting',
      },
      id,
    );
    await expect(
      h.command('REVIEW_FINDING', { id, status: 'REVIEWED' }, assessment),
    ).rejects.toThrow();
    await h.command(
      'REVIEW_FINDING',
      { id, status: 'REVIEWED', evidenceChecked: true },
      assessment,
    );
    const reviewed = await h.document(assessment);
    expect(reviewed.findingReviews![0].finding).toMatchObject({
      alignment: 'OTHER',
      otherBusinessFocus: 'Regulatory waste reporting',
      priority: 'MEDIUM',
      weightage: 7,
    });
    expect(reviewed.history.at(-1)?.detail).toContain(
      'evidence confirmed by reviewer',
    );
  });

  test('finding multi-selections and Business focus survive review, while explicit clears and missing explanations block review', async () => {
    const h = harness(),
      assessment = await h.plan('SWOT');
    const fields = {
      pillar: 'OPX',
      category: 'W',
      title: 'Supplier documentation delays',
      explanation: 'Three missing certificates in the monthly sample',
      impact: 'Delayed accepted material',
      evidence: 'October incoming inspection register',
      basis: 'EVIDENCED',
      weightage: 7,
      response: 'OBJECTIVE',
      decisionNote: 'Strengthen supplier assurance',
      alignments: ['Q', 'D', 'OTHER'],
      alignment: 'C',
    };
    const id = await h.item(assessment, 'finding', fields);
    expect((await h.document(assessment)).data.findings[0].alignments).toEqual([
      'Q',
      'D',
      'OTHER',
    ]);
    await expect(
      h.command(
        'REVIEW_FINDING',
        { id, status: 'REVIEWED', evidenceChecked: true },
        assessment,
      ),
    ).rejects.toThrow();
    await h.item(
      assessment,
      'finding',
      { ...fields, otherBusinessFocus: 'Supplier continuity' },
      id,
    );
    await h.command(
      'REVIEW_FINDING',
      { id, status: 'REVIEWED', evidenceChecked: true },
      assessment,
    );
    const reviewed = structuredClone(
      (await h.document(assessment)).findingReviews![0],
    );
    expect(reviewed.finding).toMatchObject({
      alignments: ['Q', 'D', 'OTHER'],
      otherBusinessFocus: 'Supplier continuity',
    });
    await h.command(
      'REOPEN_FINDING',
      { id, reason: 'Reassess selected alignments' },
      assessment,
    );
    await h.item(
      assessment,
      'finding',
      {
        ...fields,
        alignments: [],
        alignment: 'D',
        otherBusinessFocus: 'Must not bypass an empty list',
      },
      id,
    );
    await expect(
      h.command(
        'REVIEW_FINDING',
        { id, status: 'REVIEWED', evidenceChecked: true },
        assessment,
      ),
    ).rejects.toThrow();
    await h.item(
      assessment,
      'finding',
      {
        ...fields,
        alignments: ['Q', 'D'],
        alignment: 'OTHER',
        otherBusinessFocus: '',
      },
      id,
    );
    await h.command(
      'REVIEW_FINDING',
      { id, status: 'REVIEWED', evidenceChecked: true },
      assessment,
    );
    const after = await h.document(assessment);
    expect(after.findingReviews![0]).toEqual(reviewed);
    expect(after.findingReviews![1].finding.alignments).toEqual(['Q', 'D']);
  });

  test('a finding batch saves independent IDs atomically and does not bypass review or tenant permissions', async () => {
    const h = harness();
    const assessment = await h.plan('SWOT');
    const fields = {
      pillar: 'OPX',
      category: 'W',
      weightage: 7,
      response: 'OBJECTIVE',
      reviewStatus: 'REVIEWED',
    };
    const saved = await h.command(
      'SAVE_FINDINGS',
      {
        findings: [
          { ...fields, title: 'Late resin deliveries' },
          { ...fields, title: 'Frequent filling stoppages' },
        ],
      },
      assessment,
    );
    expect(saved.findingIds).toHaveLength(2);
    const findings = (await h.document(assessment)).data.findings;
    expect(new Set(findings.map((f) => f.id)).size).toBe(2);
    expect(new Set(findings.map((f) => f.code)).size).toBe(2);
    expect(findings.map((f) => f.reviewStatus)).toEqual([
      'UNDER_REVIEW',
      'UNDER_REVIEW',
    ]);
    const before = h.snapshot();
    await expect(
      h.command(
        'SAVE_FINDINGS',
        {
          findings: [
            { ...fields, title: 'This row must roll back' },
            { ...fields, title: '' },
          ],
        },
        assessment,
      ),
    ).rejects.toThrow();
    expect(h.snapshot()).toEqual(before);
    await expect(
      h.command(
        'SAVE_FINDINGS',
        { findings: [{ ...fields, title: 'Private' }] },
        assessment,
        h.employee,
      ),
    ).rejects.toThrow();
    expect(h.snapshot()).toEqual(before);
    await expect(
      h.service.command(h.leader, {
        action: 'SAVE_FINDINGS',
        expectedRevision: 0,
        documentId: assessment,
        payload: { findings: [{ ...fields, title: 'Stale' }] },
      }),
    ).rejects.toThrow();
    expect(h.snapshot()).toEqual(before);
  });

  test('one finding can be reviewed and linked while other findings remain pending, and reopening preserves the source snapshot', async () => {
    const h = harness();
    const assessment = await h.plan('SWOT');
    const saved = await h.command(
      'SAVE_FINDINGS',
      {
        findings: [
          {
            pillar: 'OPX',
            category: 'W',
            title: 'Filling motor overheats',
            explanation: 'Twelve stops in the October shift log.',
            impact: 'Six hours of lost output.',
            evidence: 'October shift log, lines 2 and 3',
            alignment: 'D',
            basis: 'EVIDENCED',
            weightage: 8,
            response: 'OBJECTIVE',
            decisionNote: 'Reduce recurring stops.',
          },
          {
            pillar: 'PEX',
            category: 'W',
            title: 'Training evidence missing',
            basis: 'NEEDS_CHECKING',
          },
        ],
      },
      assessment,
    );
    const [findingId] = saved.findingIds!;
    await h.command(
      'REVIEW_FINDING',
      {
        id: findingId,
        status: 'REVIEWED',
        evidenceChecked: true,
        response: 'OBJECTIVE',
        decisionNote:
          'Verified the October shift log; investigate motor cooling.',
      },
      assessment,
    );
    const reviewed = await h.document(assessment);
    expect(reviewed.status).toBe('DRAFT');
    expect(reviewed.data.findings.map((f) => f.reviewStatus)).toEqual([
      'REVIEWED',
      'NEEDS_EVIDENCE',
    ]);
    expect(reviewed.findingReviews).toHaveLength(1);
    const source = {
      documentId: assessment,
      findingId,
      version: reviewed.findingReviews![0].version,
    };
    const company = await h.plan('COMPANY');
    const objective = await h.item(company, 'objective', {
      title: 'Reliable filling',
      meaning: 'Prevent recurring production losses',
      pillar: 'OPX',
      priority: 9,
      weightage: 30,
      sources: [source],
    });
    const relatedObjective = await h.item(company, 'objective', {
      title: 'Improve cooling effectiveness',
      pillar: 'OPX',
      sources: [source],
    });
    expect(relatedObjective).not.toBe(objective);
    expect(
      (await h.document(company)).data.objectives.find(
        (o) => o.id === relatedObjective,
      )?.sources,
    ).toEqual([source]);
    const first = reviewed.data.findings[0];
    await expect(
      h.item(
        assessment,
        'finding',
        { ...first, title: 'Overwritten' },
        findingId,
      ),
    ).rejects.toThrow(/locked/);
    await h.command(
      'REOPEN_FINDING',
      { id: findingId, reason: 'Add the latest cooling inspection' },
      assessment,
    );
    await h.item(
      assessment,
      'finding',
      { ...first, title: 'Cooling airflow restricted' },
      findingId,
    );
    const next = await h.document(assessment);
    expect(next.findingReviews![0].finding.title).toBe(
      'Filling motor overheats',
    );
    expect(next.data.findings[0].reviewStatus).toBe('UNDER_REVIEW');
    expect(
      (await h.document(company)).data.objectives.find(
        (o) => o.id === objective,
      )?.sources,
    ).toEqual([source]);
    await h.command(
      'REVIEW_FINDING',
      {
        id: findingId,
        status: 'REVIEWED',
        evidenceChecked: true,
        decisionNote: 'Checked the cooling inspection.',
      },
      assessment,
    );
    expect(
      (await h.document(assessment)).findingReviews!.map((r) => r.version),
    ).toEqual([1, 2]);
  });

  test('one reviewed finding supports independently approved objectives without duplicating references or rewriting other approvals', async () => {
    const h = await programmeFixture();
    const original = (await h.document(h.company)).data.objectives[0];
    const source = original.sources[0];
    await h.command(
      'REVISE_ITEM',
      {
        kind: 'objective',
        id: h.objective,
        reason: 'Allocate the shared issue across two distinct results',
        effectiveDate: '2026-11-04',
      },
      h.company,
    );
    await h.item(
      h.company,
      'objective',
      { ...original, weightage: 15 },
      h.objective,
    );
    const second = await h.item(h.company, 'objective', {
      ...original,
      title: 'Improve setup material yield',
      result: 'Reduce setup rejects to 200 pieces',
      measure: 'Rejected pieces per setup',
      definition:
        'Rejected units from the last accepted unit to the first accepted unit',
      unit: 'pieces',
      baseline: 420,
      target: 200,
      weightage: 15,
      sources: [source],
    });
    const beforeDuplicate = h.snapshot();
    await expect(
      h.item(h.company, 'objective', {
        title: 'Repeated source in the same objective',
        pillar: 'OPX',
        sources: [source, source],
      }),
    ).rejects.toThrow(/more than once/);
    expect(h.snapshot()).toEqual(beforeDuplicate);
    await h.command(
      'APPROVE_ITEM',
      { kind: 'objective', id: h.objective, evidenceChecked: true },
      h.company,
    );
    await h.command(
      'APPROVE_ITEM',
      { kind: 'objective', id: second, evidenceChecked: true },
      h.company,
    );
    const approved = await h.document(h.company);
    expect(approved.data.objectives.map((o) => o.weightage)).toEqual([15, 15]);
    expect(
      approved.versions[1].data.objectives.find((o) => o.id === h.objective)
        ?.sources,
    ).toEqual([source]);
    expect(
      approved.versions[2].data.objectives.find((o) => o.id === second)
        ?.sources,
    ).toEqual([source]);
    const otherApproved = structuredClone(approved.versions[2]);
    const otherCurrent = structuredClone(
      approved.data.objectives.find((o) => o.id === second),
    );
    await h.command(
      'REVISE',
      { reason: 'Add the follow-up observation', effectiveDate: '2026-11-04' },
      h.swot.id,
    );
    const currentFinding = (await h.document(h.swot.id)).data.findings.find(
      (f) => f.id === source.findingId,
    )!;
    await h.item(
      h.swot.id,
      'finding',
      {
        ...currentFinding,
        explanation: 'Follow-up study confirms repeated setup losses',
      },
      currentFinding.id,
    );
    await h.command(
      'REVIEW_FINDING',
      {
        id: currentFinding.id,
        status: 'REVIEWED',
        evidenceChecked: true,
        decisionNote: 'Confirmed the follow-up setup study',
      },
      h.swot.id,
    );
    const nextSource = { ...source, version: 2 };
    await h.command(
      'REVISE_ITEM',
      {
        kind: 'objective',
        id: h.objective,
        reason: 'Use the new reviewed evidence for the time objective',
        effectiveDate: '2026-11-04',
      },
      h.company,
    );
    await h.item(
      h.company,
      'objective',
      {
        ...approved.data.objectives.find((o) => o.id === h.objective)!,
        sources: [nextSource],
      },
      h.objective,
    );
    await h.command(
      'APPROVE_ITEM',
      { kind: 'objective', id: h.objective, evidenceChecked: true },
      h.company,
    );
    const revised = await h.document(h.company);
    expect(
      revised.data.objectives.find((o) => o.id === h.objective)?.sources,
    ).toEqual([nextSource]);
    expect(revised.data.objectives.find((o) => o.id === second)).toEqual(
      otherCurrent,
    );
    expect(revised.versions[2]).toEqual(otherApproved);
    expect(revised.versions[1]).toEqual(approved.versions[1]);
    expect(
      revised.itemApprovals?.find((a) => a.itemId === second)?.version,
    ).toBe(3);
    expect(
      revised.itemApprovals?.find((a) => a.itemId === h.objective)?.version,
    ).toBe(4);
  });
  test('objective weights keep exact entered values and only active pillars need their fixed allocation', async () => {
    const h = harness(),
      company = await h.plan('COMPANY');
    const id = await h.item(company, 'objective', {
      title: 'Reliable production',
      pillar: 'OPX',
      priority: 8,
      weightage: 12.25,
    });
    expect((await h.document(company)).data.objectives[0].weightage).toBe(
      12.25,
    );
    for (const weightage of [0, 31, 0.5, 1.001])
      await expect(
        h.item(
          company,
          'objective',
          {
            title: 'Reliable production',
            pillar: 'OPX',
            priority: 8,
            weightage,
          },
          id,
        ),
      ).rejects.toThrow(/weightage/);
    await expect(
      h.item(
        company,
        'objective',
        {
          title: 'Reliable production',
          pillar: 'LEX',
          priority: 8,
          weightage: 12.25,
        },
        id,
      ),
    ).rejects.toThrow(/weightage/);
    await expect(
      h.item(
        company,
        'objective',
        {
          title: 'Reliable production',
          pillar: 'OPX',
          priority: 1.5,
          weightage: 12.25,
        },
        id,
      ),
    ).rejects.toThrow(/priority/);
    expect((await h.document(company)).data.objectives[0].weightage).toBe(
      12.25,
    );
    const second = await h.item(company, 'objective', {
      title: 'Improve material quality',
      pillar: 'OPX',
      priority: 7,
      weightage: 17.75,
    });
    const balanced = await h.document(company);
    expect(
      balanced.issues.filter((issue) => issue.includes('weightage')),
    ).toEqual([]);
    expect(balanced.data.objectives.find((o) => o.id === id)?.weightage).toBe(
      12.25,
    );
    expect(
      balanced.data.objectives.find((o) => o.id === second)?.weightage,
    ).toBe(17.75);
    expect(
      balanced.issues.some((issue) =>
        issue.includes('LEX: objective weightages'),
      ),
    ).toBe(false);
    await h.item(
      company,
      'objective',
      {
        title: 'Improve material quality',
        pillar: 'OPX',
        priority: 7,
        weightage: 17.76,
      },
      second,
    );
    expect((await h.document(company)).issues).toContain(
      'OPX: objective weightages must total exactly 30%. Currently 30.01%.',
    );
  });

  test('finding review is restricted to the designated approver and unconfirmed evidence cannot be promoted', async () => {
    const h = harness(),
      assessment = await h.plan('SWOT');
    const finding = await h.item(assessment, 'finding', {
      pillar: 'OPX',
      category: 'W',
      title: 'Unverified quality loss',
      weightage: 6,
      basis: 'NEEDS_CHECKING',
      response: 'VERIFY',
    });
    await h.command('SAVE_SETTINGS', { contributorIds: ['hod'] }, assessment);
    const contributor = { ...h.leader, userId: 'u-hod', roleLevel: Role.HOD };
    await h.command(
      'REVIEW_FINDING',
      {
        id: finding,
        status: 'NEEDS_EVIDENCE',
        decisionNote: 'Need the signed quality log.',
      },
      assessment,
      contributor,
    );
    const before = h.snapshot();
    await expect(
      h.command(
        'REVIEW_FINDING',
        { id: finding, status: 'REVIEWED' },
        assessment,
        contributor,
      ),
    ).rejects.toThrow(/designated approver/);
    await expect(
      h.command(
        'REVIEW_FINDING',
        { id: finding, status: 'REVIEWED' },
        assessment,
      ),
    ).rejects.toThrow();
    expect(h.snapshot()).toEqual(before);
    expect((await h.document(assessment)).findingReviews || []).toHaveLength(0);
  });

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
      const departmentSetupIssue =
        'Create the Production plan for 2026 before submitting. Your draft can be saved now.';
      if (kind === 'INDIVIDUAL')
        expect(draft.issues).not.toContain(departmentSetupIssue);
      else expect(draft.issues).toContain(departmentSetupIssue);
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
      if (kind !== 'INDIVIDUAL')
        expect((await h.document(id)).issues).toContain(departmentSetupIssue);
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

  test('an explained individual responsibility can submit and approve without a home department plan', async () => {
    const h = harness();
    const id = await h.plan('INDIVIDUAL', 'operator');
    const goalId = await h.item(
      id,
      'goal',
      h.goalData({ ownerId: 'operator' }),
    );
    await h.assignment(id, goalId, { ownerId: 'operator' });
    expect((await h.document(id)).issues).toEqual([]);
    await h.item(
      id,
      'goal',
      h.goalData({ ownerId: 'operator', ongoingReason: '' }),
      goalId,
    );
    const before = h.snapshot();
    for (const action of ['SUBMIT', 'APPROVE'] as const) {
      await expect(h.command(action, {}, id)).rejects.toThrow();
      expect(h.snapshot()).toEqual(before);
    }
    await h.item(id, 'goal', h.goalData({ ownerId: 'operator' }), goalId);
    expect((await h.document(id)).issues).toEqual([]);
    await h.command('SUBMIT', {}, id, h.employee);
    await h.command('APPROVE', {}, id);
    expect((await h.document(id)).versions[0].data.goals[0].id).toBe(goalId);
    expect(
      (await h.view()).documents.some((d) => d.kind === 'DEPARTMENT'),
    ).toBe(false);
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
    const { id, findingId } = await h.swot({ priority: 'MEDIUM' });
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
      priority: 'MEDIUM',
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
          after: 'MEDIUM',
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
      priority: 'MEDIUM',
    });
    expect(
      h
        .snapshot()
        .get('org-one')
        ?.state.documents.find((d) => d.id === id)?.data.findings[0],
    ).toMatchObject({ weightage: 7, priority: 'MEDIUM' });
    await h.command(
      'REVISE',
      { reason: 'Reassess the impact', effectiveDate: '2026-11-04' },
      id,
    );
    await h.item(
      id,
      'finding',
      { ...scored.data.findings[0], weightage: 3, priority: 'MEDIUM' },
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
          before: 'MEDIUM',
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
    const { id, findingId } = await fixture.swot({ weightage: 8 });
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

  test('a measurable company objective directly supplies department and individual parents without a duplicate goal', async () => {
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
      priority: 9,
      weightage: 30,
      alignments: ['D'],
      ownerId: 'leader',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      sources: [{ documentId: assessment, findingId, version: 1 }],
      measure: 'Unplanned downtime',
      baseline: 8,
      target: 4,
      unit: 'hours',
      departmentIds: ['production'],
      approach: 'Inspect equipment each shift.',
      selectionReason: 'Recurring breakdowns are the main production loss.',
    });
    const goalId = objectiveId;
    expect((await h.document(company)).data.goals).toEqual([]);
    // A leftover incomplete legacy row cannot leak into a new approved snapshot.
    const staleGoalId = await h.item(company, 'goal', {
      title: 'Old incomplete goal',
      objectiveId,
    });
    const hod = { ...h.leader, userId: 'u-hod', roleLevel: Role.HOD };
    expect((await h.view(hod)).approvedParentGoals).toEqual([]);
    const approved = await h.command('APPROVE', {}, company);
    expect(approved.approvedParentGoals?.[0]).toMatchObject({
      documentId: company,
      version: 1,
      itemKind: 'OBJECTIVE',
      goal: { id: goalId },
    });
    expect((await h.document(company)).versions[0]).toMatchObject({
      companyPlanningModel: 'MEASURABLE_OBJECTIVES',
      data: { goals: [] },
    });
    expect(JSON.stringify(approved.approvedParentGoals)).not.toContain(
      staleGoalId,
    );
    expect(
      (await h.service.getApproved(h.leader)).find(
        (plan) => plan.id === company,
      )?.data.goals,
    ).toEqual([]);
    const choices = (await h.view(hod)).approvedParentGoals;
    expect(choices).toEqual(approved.approvedParentGoals);
    expect(JSON.stringify(choices)).not.toContain(findingId);
    // Direct individual company contributions do not require a department plan.
    const personal = await h.plan('INDIVIDUAL', 'operator');
    const personalGoal = await h.item(
      personal,
      'goal',
      h.goalData({
        ownerId: 'operator',
        parent: {
          documentId: company,
          goalId,
          version: 1,
          itemKind: 'OBJECTIVE',
        },
        noActionReason:
          'Carried out through the employee daily operating checklist.',
      }),
    );
    await h.assignment(personal, personalGoal, { ownerId: 'operator' });
    await h.command('APPROVE', {}, personal);
    expect(
      (await h.document(personal)).versions[0].data.goals[0].parent,
    ).toEqual({
      documentId: company,
      goalId,
      version: 1,
      itemKind: 'OBJECTIVE',
    });
    const department = await h.department();
    const parent = {
      documentId: company,
      goalId,
      version: 1,
      itemKind: 'OBJECTIVE',
    };
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
    ).rejects.toThrow(/approved parent (?:objective or )?goal/i);
    const firstVersion = structuredClone(
      (await h.document(company)).versions[0],
    );
    expect(firstVersion.legacyCompanyGoals?.[0].id).toBe(staleGoalId);
    expect(
      (await h.document(company, h.employee)).versions[0].legacyCompanyGoals,
    ).toBeUndefined();
    await h.command(
      'REVISE',
      { reason: 'Raise the reliability ambition', effectiveDate: '2026-11-04' },
      company,
    );
    expect((await h.document(company)).data.goals[0].id).toBe(staleGoalId);
    const objective = firstVersion.data.objectives[0];
    await h.item(
      company,
      'objective',
      { ...objective, baseline: null, target: null },
      objectiveId,
    );
    expect((await h.document(company)).data.objectives[0].target).toBeNull();
    await expect(h.command('APPROVE', {}, company)).rejects.toThrow();
    await h.item(
      company,
      'objective',
      { ...objective, baseline: 0, target: 0 },
      objectiveId,
    );
    await h.command('APPROVE', {}, company);
    const revised = await h.document(company);
    expect(revised.versions[0]).toEqual(firstVersion);
    expect(revised.versions[1].data.objectives[0]).toMatchObject({
      baseline: 0,
      target: 0,
    });
    expect((await h.document(personal)).data.goals[0].parent?.version).toBe(1);
    expect(
      (await h.service.getApproved(h.leader)).find(
        (plan) => plan.id === company,
      )?.legacyCompanyGoals,
    ).toBeUndefined();
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

  test('saving a parent reference preserves cycle, kind, approval and team/position department restrictions', async () => {
    const h = harness();
    const dept = await h.department();
    await h.command('APPROVE', {}, dept.id);
    const parent = { documentId: dept.id, goalId: dept.goalId, version: 1 };
    const wrongKind = await h.plan('DEPARTMENT', 'quality');
    const otherDepartment = await h.plan('INDIVIDUAL', 'other');
    h.references.teams.push({
      id: 'quality-team',
      name: 'Quality team',
      departmentId: 'quality',
      memberIds: ['other'],
    });
    h.references.positions!.push({
      id: 'quality-position',
      name: 'Quality analyst',
      departmentId: 'quality',
      holderIds: ['other'],
    });
    const team = await h.plan('TEAM', 'quality-team');
    const position = await h.plan('POSITION', 'quality-position');
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
    for (const child of [team, position, otherCycle, wrongKind]) {
      const before = h.snapshot();
      await expect(
        h.item(child, 'goal', h.goalData({ parent })),
      ).rejects.toThrow(/approved parent (?:objective or )?goal/i);
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
    ).rejects.toThrow(/approved parent (?:objective or )?goal/i);
    await expect(
      h.item(
        otherDepartment,
        'goal',
        h.goalData({ parent: { ...parent, version: 2 } }),
      ),
    ).rejects.toThrow(/approved parent (?:objective or )?goal/i);
  });

  test('a cross-department individual commitment exposes only its approved parent and assigned actions, and its owner can retain and submit it', async () => {
    const h = harness();
    const employee = { ...h.employee, userId: 'u-other' };
    const assessment = await h.swot({
      weightage: 7,
      response: 'ACTION',
      explanation: 'Confidential evidence behind the department commitment',
    });
    await h.command('APPROVE', {}, assessment.id);
    const dept = await h.department(true);
    await h.item(
      dept.id,
      'goal',
      h.goalData({ approach: 'Private department planning details' }),
      dept.goalId,
    );
    const action = (await h.document(dept.id)).data.actions[0];
    await h.item(
      dept.id,
      'action',
      {
        ...action,
        ownerId: 'other',
        sources: [
          {
            documentId: assessment.id,
            findingId: assessment.findingId,
            version: 1,
          },
        ],
      },
      action.id,
    );
    const unrelatedGoal = await h.item(
      dept.id,
      'goal',
      h.goalData({ title: 'Unrelated approved department goal' }),
    );
    await h.assignment(dept.id, unrelatedGoal, { ownerId: 'leader' });
    const unrelatedAction = await h.item(dept.id, 'action', {
      ...action,
      title: 'Unrelated approved department action',
      goalId: unrelatedGoal,
      ownerId: 'other',
    });
    const unassignedAction = await h.item(dept.id, 'action', {
      ...action,
      title: 'Action assigned to another employee',
      ownerId: 'operator',
    });
    await h.command('APPROVE', {}, dept.id);
    const approvedParent = (await h.document(dept.id)).versions[0].data
      .goals[0];
    const personal = await h.plan('INDIVIDUAL', 'other');
    await h.command('SAVE_SETTINGS', { ownerId: 'other' }, personal);
    const parent = { documentId: dept.id, goalId: dept.goalId, version: 1 };
    const goalId = await h.item(
      personal,
      'goal',
      h.goalData({ ownerId: 'other', ongoingReason: '', parent }),
    );
    await h.assignment(personal, goalId, {
      ownerId: 'other',
      providerId: 'other',
    });
    await h.command(
      'REVISE',
      { reason: 'Private department revision', effectiveDate: '2026-11-04' },
      dept.id,
    );
    await h.item(
      dept.id,
      'goal',
      h.goalData({ title: 'Private unapproved department goal' }),
      dept.goalId,
    );
    const draftAction = await h.item(dept.id, 'action', {
      ...action,
      title: 'Private unapproved department action',
      ownerId: 'other',
    });
    const beforeParent = await h.document(dept.id);
    const view = await h.view(employee);
    expect(view.documents.map((d) => d.id)).toEqual([personal]);
    expect(view.approvedParentGoals).toEqual([
      {
        documentId: dept.id,
        kind: 'DEPARTMENT',
        cycle: '2026',
        scopeId: 'production',
        departmentId: 'production',
        version: 1,
        effectiveDate: '2026-11-04',
        retainedFor: [{ documentId: personal, goalId }],
        goal: {
          id: dept.goalId,
          code: approvedParent.code,
          title: approvedParent.title,
          departmentIds: [],
          startDate: '2026-01-01',
          endDate: '2026-12-31',
        },
      },
    ]);
    for (const choice of (await h.view()).approvedParentGoals || [])
      expect(choice).not.toHaveProperty('retainedFor');
    expect(view.sharedActions).toHaveLength(1);
    expect(view.sharedActions[0]).toMatchObject({
      documentId: dept.id,
      version: 1,
      action: { id: dept.actionId, ownerId: 'other', sources: [] },
    });
    for (const privateText of [
      assessment.findingId,
      'Private department planning details',
      'Private unapproved department',
      'Confidential evidence',
      'Unrelated approved department',
      'Action assigned to another employee',
    ])
      expect(JSON.stringify(view)).not.toContain(privateText);
    await h.command(
      'SAVE_ITEM',
      {
        kind: 'goal',
        id: goalId,
        data: h.goalData({
          title: 'My agreed cross-department contribution',
          ownerId: 'other',
          ongoingReason: '',
          noActionReason: '',
          parent,
        }),
      },
      personal,
      employee,
    );
    for (const [actionId, version] of [
      [unrelatedAction, 1],
      [unassignedAction, 1],
      [draftAction, 1],
      [dept.actionId, 2],
    ] as const) {
      const before = h.snapshot();
      await expect(
        h.command(
          'LINK_ACTION',
          { goalId, documentId: dept.id, actionId, version },
          personal,
          employee,
        ),
      ).rejects.toThrow();
      expect(h.snapshot()).toEqual(before);
    }
    await h.command(
      'LINK_ACTION',
      { goalId, documentId: dept.id, actionId: dept.actionId, version: 1 },
      personal,
      employee,
    );
    const contribution = await h.document(personal, employee);
    expect(contribution).toMatchObject({
      departmentId: 'quality',
      scopeId: 'other',
      data: { ownerId: 'other', approverId: 'leader' },
      issues: [],
    });
    expect(contribution.data.goals[0].parent).toEqual(parent);
    expect(
      h.references.people.find((p) => p.id === 'other')!.departmentId,
    ).toBe('quality');
    await h.command('SUBMIT', {}, personal, employee);
    await h.command('APPROVE', {}, personal);
    const exported = await h.service.getApproved(employee);
    expect(exported.map((d) => d.id)).toEqual([personal]);
    expect(exported[0].linkedActions[0]).toMatchObject({
      documentId: dept.id,
      version: 1,
      action: { id: dept.actionId, sources: [] },
    });
    expect(await h.document(dept.id)).toEqual(beforeParent);
    expect(
      (await h.view()).documents.some(
        (d) => d.kind === 'DEPARTMENT' && d.scopeId === 'quality',
      ),
    ).toBe(false);
  });

  test('an existing cross-department parent grant cannot be used to guess new parents, goals, versions or another organisation', async () => {
    const h = harness();
    const dept = await h.department();
    const unrelatedGoal = await h.item(
      dept.id,
      'goal',
      h.goalData({ title: 'Another approved goal' }),
    );
    await h.assignment(dept.id, unrelatedGoal, { ownerId: 'leader' });
    await h.command('APPROVE', {}, dept.id);
    await h.command(
      'REVISE',
      { reason: 'New approved version', effectiveDate: '2026-11-04' },
      dept.id,
    );
    await h.command('APPROVE', {}, dept.id);
    const employee = { ...h.employee, userId: 'u-other' };
    const personal = await h.plan('INDIVIDUAL', 'other');
    const parent = { documentId: dept.id, goalId: dept.goalId, version: 1 };
    expect((await h.view(employee)).approvedParentGoals).toEqual([]);
    const beforeAssignment = h.snapshot();
    await expect(
      h.command(
        'SAVE_ITEM',
        { kind: 'goal', data: h.goalData({ ownerId: 'other', parent }) },
        personal,
        employee,
      ),
    ).rejects.toThrow(/approved parent (?:objective or )?goal/i);
    expect(h.snapshot()).toEqual(beforeAssignment);
    const goalId = await h.item(
      personal,
      'goal',
      h.goalData({ ownerId: 'other', parent }),
    );
    expect((await h.view(employee)).approvedParentGoals).toEqual([
      expect.objectContaining({
        version: 1,
        goal: expect.objectContaining({ id: dept.goalId }),
      }),
    ]);
    for (const [id, reference] of [
      [undefined, parent],
      [goalId, { ...parent, goalId: unrelatedGoal }],
      [goalId, { ...parent, version: 2 }],
      [goalId, { ...parent, documentId: 'unavailable-department' }],
    ] as const) {
      const before = h.snapshot();
      await expect(
        h.command(
          'SAVE_ITEM',
          {
            kind: 'goal',
            id,
            data: h.goalData({ ownerId: 'other', parent: reference }),
          },
          personal,
          employee,
        ),
      ).rejects.toThrow(/approved parent (?:objective or )?goal/i);
      expect(h.snapshot()).toEqual(before);
    }
    const anotherTenant = { ...employee, organizationId: 'org-two' };
    const tenantPlan = await h.command(
      'CREATE_PLAN',
      { kind: 'INDIVIDUAL', scopeId: 'other', cycle: '2026' },
      undefined,
      anotherTenant,
    );
    const beforeTenantAttempt = h.snapshot();
    await expect(
      h.command(
        'SAVE_ITEM',
        { kind: 'goal', data: h.goalData({ ownerId: 'other', parent }) },
        tenantPlan.focusId,
        anotherTenant,
      ),
    ).rejects.toThrow(/approved parent (?:objective or )?goal/i);
    expect(h.snapshot()).toEqual(beforeTenantAttempt);
    expect((await h.view(anotherTenant)).approvedParentGoals).toEqual([]);
  });

  test('an employee explicitly authorised to read another department may select its approved goal for their own plan', async () => {
    const h = harness();
    const dept = await h.department();
    await h.command('SAVE_SETTINGS', { coordinatorIds: ['other'] }, dept.id);
    await h.command('APPROVE', {}, dept.id);
    const personal = await h.plan('INDIVIDUAL', 'other');
    const employee = { ...h.employee, userId: 'u-other' };
    const parent = { documentId: dept.id, goalId: dept.goalId, version: 1 };
    await h.command(
      'SAVE_ITEM',
      { kind: 'goal', data: h.goalData({ ownerId: 'other', parent }) },
      personal,
      employee,
    );
    expect((await h.document(personal, employee)).data.goals[0].parent).toEqual(
      parent,
    );
    expect((await h.document(personal)).departmentId).toBe('quality');
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
