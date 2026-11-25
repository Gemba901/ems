import { BadRequestException } from '@nestjs/common';
import type { AccessTokenPayload } from '../../auth/access-token-payload';
import { Role } from '../../common/enum/role.enum';
import type { PrismaService } from '../../prisma/prisma.service';
import { PerformancePlanningService } from './performance-planning.service';
import type {
  PlanningCalendarContext,
  PlanningCalendarSelection,
} from './planning-dependency.contracts';
import type { PlanningReferencesService } from './planning-references.service';
import type {
  PlanningCalendar,
  PlanningCommand,
  PlanningReferences,
  PlanningState,
} from './planning.types';

function publication(version = 1): PlanningCalendar {
  return {
    id: 'production-calendar',
    version,
    name: 'Production reporting',
    source: 'AREA_02',
    approved: true,
    frequencies: ['MONTHLY'],
    timeZone: 'Asia/Kolkata',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    workingDays: [1, 2, 3, 4, 5],
    holidays: [],
    weekStart: 1,
    fortnightAnchor: '2026-01-05',
    twiceMonthlySplit: 15,
    submissionDueDays: 1,
    area02: {
      audience: {
        kind: 'DEPARTMENTS',
        label: 'Production',
        departmentIds: ['production'],
        employeeIds: [],
      },
      periods: {
        MONTHLY: Array.from({ length: 12 }, (_, month) => {
          const start = `2026-${String(month + 1).padStart(2, '0')}-01`;
          const end = new Date(Date.UTC(2026, month + 1, 0))
            .toISOString()
            .slice(0, 10);
          return {
            key: `monthly:${start}`,
            frequency: 'monthly',
            start,
            end,
            naturalStart: start,
            naturalEnd: end,
            partial: false,
            workingDays: 20,
            scheduled: true,
            reasons: [],
            submitBy: {
              date: new Date(Date.UTC(2026, month + 1, version === 1 ? 5 : 9))
                .toISOString()
                .slice(0, 10),
              time: '09:30',
              timeZone: 'Asia/Kolkata',
            },
            verifyBy: new Date(Date.UTC(2026, month + 1, 12))
              .toISOString()
              .slice(0, 10),
          };
        }),
      },
      reviews: [],
      reviewFrequency: 'MONTHLY',
      exceptions: [],
      responsibilities: {
        owner: 'PLAN_OWNER',
        provider: 'PLAN_ASSIGNEE',
        verifier: 'LINE_MANAGER',
        approver: 'AUTHORISED_APPROVER',
      },
      approvedAt: '2025-12-01T00:00:00Z',
      approvedByUserId: 'calendar-approver',
    },
  };
}

/** Public service commands with an in-memory transaction; no database connections. */
function harness(initialState?: PlanningState) {
  type Row = { organizationId: string; revision: number; state: PlanningState };
  let row: Row | null = initialState
    ? {
        organizationId: 'org-one',
        revision: 0,
        state: structuredClone(initialState),
      }
    : null;
  const db = {
    $queryRaw: async () => [],
    lexExecutionWorkspace: { findUnique: async () => null },
    lexPlanningWorkspace: {
      findUnique: async () => structuredClone(row),
      upsert: async ({ create }: { create: Omit<Row, 'revision'> }) => {
        row ||= { ...structuredClone(create), revision: 0 };
        return structuredClone(row);
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { organizationId: string; revision: number };
        data: { state: PlanningState; revision: { increment: number } };
      }) => {
        if (
          !row ||
          row.organizationId !== where.organizationId ||
          row.revision !== where.revision
        )
          return { count: 0 };
        row.state = structuredClone(data.state);
        row.revision += data.revision.increment;
        return { count: 1 };
      },
    },
    $transaction: async <T>(work: (tx: unknown) => Promise<T>): Promise<T> => {
      const before = structuredClone(row);
      try {
        return await work(db);
      } catch (error) {
        row = before;
        throw error;
      }
    },
  };
  const publications = [publication(1), publication(2)];
  const references: PlanningReferences = {
    departments: [{ id: 'production', name: 'Production' }],
    people: [
      {
        id: 'leader',
        userId: 'u-leader',
        name: 'Leader',
        role: Role.MANAGEMENT,
        departmentId: 'production',
        position: 'Director',
      },
      {
        id: 'hod',
        userId: 'u-hod',
        name: 'HOD',
        role: Role.HOD,
        departmentId: 'production',
        position: 'Manager',
      },
      {
        id: 'operator',
        userId: 'u-operator',
        name: 'Operator',
        role: Role.EMPLOYEE,
        departmentId: 'production',
        position: 'Operator',
      },
    ],
    teams: [
      {
        id: 'line-one',
        name: 'Line one',
        departmentId: 'production',
        memberIds: ['operator'],
      },
    ],
    positions: [
      {
        id: 'position-operator',
        name: 'Operator',
        departmentId: 'production',
        holderIds: ['operator'],
      },
    ],
    pillars: [],
    timeZone: 'Asia/Kolkata',
    calendar: publication(1),
    calendars: [publication(1)],
  };
  const user: AccessTokenPayload = {
    tokenType: 'ACCESS',
    userId: 'u-leader',
    organizationId: 'org-one',
    roleId: 1,
    roleLevel: Role.MANAGEMENT,
    email: null,
    isAdminOrg: false,
  };
  const resolveCalendar = jest.fn(
    async (
      _user: AccessTokenPayload,
      scope: PlanningCalendarContext,
      selection: PlanningCalendarSelection,
    ) => {
      const selected = publications.find(
        (calendar) =>
          calendar.id === selection.id &&
          calendar.version === selection.version,
      );
      if (!selected || scope.departmentId !== 'production')
        throw new BadRequestException(
          'The selected calendar does not apply to this scope.',
        );
      if (
        (scope.startDate && scope.startDate < selected.startDate) ||
        (scope.endDate && scope.endDate > selected.endDate)
      )
        throw new BadRequestException(
          'The selected calendar does not cover these assignment dates.',
        );
      return structuredClone(selected);
    },
  );
  const refs = {
    get: async () => ({
      references: structuredClone(references),
      actor: {
        userId: user.userId,
        employeeId: 'leader',
        name: 'Leader',
        departmentId: 'production',
        role: Role.MANAGEMENT,
      },
    }),
    resolveCalendar,
  };
  const service = new PerformancePlanningService(
    db as unknown as PrismaService,
    refs as unknown as PlanningReferencesService,
  );
  const view = () => service.getWorkspace(user);
  const command = async (
    action: PlanningCommand['action'],
    payload: Record<string, unknown> = {},
    documentId?: string,
  ) =>
    service.command(user, {
      action,
      payload,
      documentId,
      expectedRevision: row?.revision || 0,
    });
  const document = async (id: string) =>
    (await view()).documents.find((entry) => entry.id === id)!;
  const item = async (
    documentId: string,
    kind: string,
    data: Record<string, unknown>,
    id?: string,
  ) => (await command('SAVE_ITEM', { kind, data, id }, documentId)).focusId;
  const assignmentFields = (goalId: string) => ({
    goalId,
    definitionId: 'ref-kpi-downtime',
    ownerId: 'hod',
    providerId: 'operator',
    verifierId: 'hod',
    baseline: 8,
    startDate: '2026-01-01',
    endDate: '2026-01-31',
    source: 'Downtime log',
    updateFrequency: 'MONTHLY',
    reviewFrequency: 'MONTHLY',
    targetMode: 'SAME',
    target: 4,
  });
  const department = async (selectCalendar = true) => {
    const id = (
      await command('CREATE_PLAN', {
        kind: 'DEPARTMENT',
        scopeId: 'production',
        cycle: '2026',
        ...(selectCalendar
          ? { calendar: { id: publications[0].id, version: 1 } }
          : {}),
      })
    ).focusId;
    const goalId = await item(id, 'goal', {
      title: 'Keep equipment available',
      ongoingReason: 'Essential production responsibility',
      measure: 'Unplanned downtime',
      baseline: 8,
      target: 4,
      unit: 'hours',
      ownerId: 'hod',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      approach: 'Inspect equipment each shift.',
      relevance: 'Maintains the essential production service.',
      noActionReason:
        'Covered by the established routine maintenance programme.',
    });
    const assignmentId = await item(id, 'assignment', assignmentFields(goalId));
    return { id, goalId, assignmentId };
  };
  return {
    command,
    document,
    department,
    item,
    references,
    publications,
    resolveCalendar,
    user,
    assignmentFields,
    snapshot: () => structuredClone(row),
  };
}

describe('Area 02 calendars at the public planning command boundary', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(Date.parse('2026-01-10T09:00:00Z'));
  });
  afterEach(() => jest.useRealTimers());

  test.each([
    ['DEPARTMENT', 'production', undefined],
    ['INDIVIDUAL', 'operator', 'operator'],
    ['TEAM', 'line-one', undefined],
    ['POSITION', 'position-operator', undefined],
  ])(
    'CREATE_PLAN resolves the selected %s scope and ignores client calendar contents',
    async (kind, scopeId, employeeId) => {
      const h = harness();
      const result = await h.command('CREATE_PLAN', {
        kind,
        scopeId,
        cycle: '2026',
        calendar: {
          id: 'production-calendar',
          version: 1,
          source: 'WORK_SETTINGS',
          approved: false,
          timeZone: 'Pacific/Honolulu',
          submissionDueDays: 99,
          area02: { periods: {} },
        },
      });
      expect(h.resolveCalendar).toHaveBeenCalledWith(
        h.user,
        expect.objectContaining({
          kind,
          departmentId: 'production',
          employeeId,
          assigneeId: employeeId,
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          ownerId: 'leader',
        }),
        { id: 'production-calendar', version: 1 },
      );
      expect((await h.document(result.focusId)).data.calendar).toEqual(
        publication(1),
      );
    },
  );

  test('settings and assignment edits retain the exact pin when live references advance', async () => {
    const h = harness();
    const { id, assignmentId, goalId } = await h.department();
    h.references.calendar = publication(2);
    h.references.calendars = [publication(2)];
    await h.command('SAVE_SETTINGS', { title: 'Reworded production plan' }, id);
    await h.item(
      id,
      'assignment',
      {
        ...h.assignmentFields(goalId),
        target: 3,
        calendar: {
          id: 'production-calendar',
          version: 1,
          timeZone: 'Pacific/Honolulu',
          area02: { periods: {} },
        },
        targets: [
          {
            id: '2026-01-01/2026-01-31',
            start: '2026-01-01',
            end: '2026-01-31',
            scheduled: false,
            submissionDate: '2026-02-01',
            target: 999,
          },
        ],
      },
      assignmentId,
    );
    const saved = await h.document(id);
    expect(saved.data.calendar).toEqual(publication(1));
    expect(saved.data.assignments[0].calendar).toEqual(publication(1));
    expect(saved.data.assignments[0].targets[0]).toMatchObject({
      calendarPeriodKey: 'monthly:2026-01-01',
      scheduled: true,
      target: 3,
      submissionDate: '2026-02-05',
      submissionTime: '09:30',
      submissionTimeZone: 'Asia/Kolkata',
      verificationDate: '2026-02-12',
    });
    expect(h.resolveCalendar).toHaveBeenCalledTimes(1);
  });

  test('an unselected calendar permits saving a draft but prevents approval', async () => {
    const h = harness();
    const { id } = await h.department(false);
    const saved = await h.document(id);
    expect(saved.status).toBe('DRAFT');
    expect(saved.data.calendar).toBeUndefined();
    expect(saved.data.assignments[0].calendar).toBeUndefined();
    expect(saved.issues).toContain(
      'Choose an applicable approved Area 02 calendar in plan settings before approval.',
    );
    const before = h.snapshot();
    await expect(h.command('APPROVE', {}, id)).rejects.toMatchObject({
      response: {
        message: expect.arrayContaining([
          'Choose an applicable approved Area 02 calendar in plan settings before approval.',
        ]),
      },
    });
    expect(h.snapshot()).toEqual(before);
    expect(h.resolveCalendar).not.toHaveBeenCalled();
  });

  test('an invalid explicit calendar selection fails without falling back to the current publication', async () => {
    const h = harness();
    await expect(
      h.command('CREATE_PLAN', {
        kind: 'DEPARTMENT',
        scopeId: 'production',
        cycle: '2026',
        calendar: { id: 'production-calendar', version: 999 },
      }),
    ).rejects.toThrow(/does not apply/);
    expect(h.snapshot()).toBeNull();
  });

  test('SAVE_GOALS resolves a nested custom assignment independently of the plan calendar', async () => {
    const h = harness();
    const next = h.publications[1];
    next.frequencies = ['MONTHLY', 'CUSTOM'];
    next.area02!.periods.CUSTOM = [
      {
        key: 'custom:first',
        frequency: 'custom',
        start: '2026-01-01',
        end: '2026-01-10',
        naturalStart: '2026-01-01',
        naturalEnd: '2026-01-10',
        partial: false,
        workingDays: 7,
        scheduled: true,
        reasons: [],
        submitBy: {
          date: '2026-01-13',
          time: '16:45',
          timeZone: 'Asia/Kolkata',
        },
        verifyBy: '2026-01-15',
      },
      {
        key: 'custom:second',
        frequency: 'custom',
        start: '2026-01-11',
        end: '2026-01-31',
        naturalStart: '2026-01-11',
        naturalEnd: '2026-01-31',
        partial: false,
        workingDays: 15,
        scheduled: true,
        reasons: [],
        submitBy: {
          date: '2026-02-04',
          time: '16:45',
          timeZone: 'Asia/Kolkata',
        },
        verifyBy: '2026-02-06',
      },
    ];
    const id = (
      await h.command('CREATE_PLAN', {
        kind: 'INDIVIDUAL',
        scopeId: 'operator',
        cycle: '2026',
        calendar: { id: 'production-calendar', version: 1 },
      })
    ).focusId;
    await h.command(
      'SAVE_GOALS',
      {
        calendar: { id: 'production-calendar', version: 1 },
        goals: [
          {
            data: {
              title: 'My production contribution',
              ownerId: 'operator',
              startDate: '2026-01-01',
              endDate: '2026-12-31',
            },
            assignments: [
              {
                data: {
                  ...h.assignmentFields('untrusted-goal'),
                  ownerId: 'operator',
                  startDate: '2026-01-05',
                  endDate: '2026-01-20',
                  updateFrequency: 'CUSTOM',
                  calendar: {
                    id: 'production-calendar',
                    version: 2,
                    area02: { periods: {} },
                  },
                },
              },
            ],
          },
        ],
      },
      id,
    );
    const saved = await h.document(id);
    const assigned = saved.data.assignments[0];
    expect(saved.data.calendar).toEqual(publication(1));
    expect(assigned.calendar).toEqual(next);
    expect(assigned.goalId).toBe(saved.data.goals[0].id);
    expect(assigned.targets).toEqual([
      expect.objectContaining({
        id: '2026-01-05/2026-01-10',
        calendarPeriodKey: 'custom:first',
        partial: true,
        submissionDate: '2026-01-13',
        submissionTime: '16:45',
        submissionTimeZone: 'Asia/Kolkata',
        verificationDate: '2026-01-15',
      }),
      expect.objectContaining({
        id: '2026-01-11/2026-01-20',
        calendarPeriodKey: 'custom:second',
        partial: true,
        submissionDate: '2026-02-04',
        submissionTime: '16:45',
        submissionTimeZone: 'Asia/Kolkata',
        verificationDate: '2026-02-06',
      }),
    ]);
    expect(h.resolveCalendar).toHaveBeenLastCalledWith(
      h.user,
      expect.objectContaining({
        kind: 'INDIVIDUAL',
        departmentId: 'production',
        employeeId: 'operator',
        startDate: '2026-01-05',
        endDate: '2026-01-20',
      }),
      { id: 'production-calendar', version: 2 },
    );

    h.references.calendar = publication(3);
    h.references.calendars = [publication(3)];
    const fields = { ...assigned };
    delete fields.calendar;
    await h.command(
      'SAVE_GOALS',
      {
        goals: [
          {
            id: saved.data.goals[0].id,
            data: saved.data.goals[0],
            assignments: [{ id: assigned.id, data: { ...fields, target: 2 } }],
          },
        ],
      },
      id,
    );
    const edited = (await h.document(id)).data.assignments[0];
    expect(edited.calendar).toEqual(next);
    expect(edited.targets[0]).toMatchObject({
      submissionDate: '2026-01-13',
      target: 2,
    });
  });

  test('SAVE_GOALS checks every nested assignment date scope before an atomic batch save', async () => {
    const h = harness();
    const id = (
      await h.command('CREATE_PLAN', {
        kind: 'INDIVIDUAL',
        scopeId: 'operator',
        cycle: '2026',
        calendar: { id: 'production-calendar', version: 1 },
      })
    ).focusId;
    const before = h.snapshot();
    await expect(
      h.command(
        'SAVE_GOALS',
        {
          goals: [
            {
              data: { title: 'Draft contribution' },
              assignments: [
                {
                  data: {
                    ...h.assignmentFields(''),
                    calendar: { id: 'production-calendar', version: 2 },
                  },
                },
                {
                  data: {
                    ...h.assignmentFields(''),
                    startDate: '2027-01-01',
                    endDate: '2027-01-31',
                    calendar: { id: 'production-calendar', version: 2 },
                  },
                },
              ],
            },
          ],
        },
        id,
      ),
    ).rejects.toThrow(/does not cover these assignment dates/);
    expect(h.resolveCalendar).toHaveBeenLastCalledWith(
      h.user,
      expect.objectContaining({
        kind: 'INDIVIDUAL',
        departmentId: 'production',
        employeeId: 'operator',
        startDate: '2027-01-01',
        endDate: '2027-01-31',
      }),
      { id: 'production-calendar', version: 2 },
    );
    expect(h.snapshot()).toEqual(before);
  });

  test('approved items keep their calendar locked even while the enclosing plan is a draft', async () => {
    const original = harness();
    const { id, goalId } = await original.department();
    await original.command('APPROVE', {}, id);
    const initial = original.snapshot()!.state;
    // Item approvals leave the collection editable while retaining approved versions.
    initial.documents[0].status = 'DRAFT';
    const h = harness(initial);
    const before = h.snapshot();
    await expect(
      h.command(
        'SAVE_SETTINGS',
        {
          calendar: { id: 'production-calendar', version: 2 },
        },
        id,
      ),
    ).rejects.toThrow(/revision with a reason and effective date/);
    expect(h.snapshot()).toEqual(before);
    await h.command(
      'REVISE_ITEM',
      {
        kind: 'goal',
        id: goalId,
        reason: 'Change reporting dates for this commitment',
        effectiveDate: '2026-02-01',
      },
      id,
    );
    await h.command(
      'SAVE_SETTINGS',
      { calendar: { id: 'production-calendar', version: 2 } },
      id,
    );
    const saved = await h.document(id);
    expect(saved.data.calendar).toEqual(publication(2));
    expect(saved.versions).toEqual(initial.documents[0].versions);
  });

  test('approved calendar changes require a dated revision and preserve previous approved assignments', async () => {
    const h = harness();
    const { id, goalId, assignmentId } = await h.department();
    await h.command('APPROVE', {}, id);
    const before = h.snapshot();
    const first = (await h.document(id)).versions[0];
    h.references.calendar = publication(2);
    h.references.calendars = [publication(2)];
    await expect(
      h.command(
        'SAVE_SETTINGS',
        { calendar: { id: 'production-calendar', version: 2 } },
        id,
      ),
    ).rejects.toThrow();
    await expect(
      h.command('REVISE', { reason: 'New reporting agreement' }, id),
    ).rejects.toThrow(/reason and an effective date/);
    expect(h.snapshot()).toEqual(before);

    await h.command(
      'REVISE',
      { reason: 'New reporting agreement', effectiveDate: '2026-02-01' },
      id,
    );
    await h.command(
      'SAVE_SETTINGS',
      { calendar: { id: 'production-calendar', version: 2 } },
      id,
    );
    await h.item(
      id,
      'assignment',
      {
        ...h.assignmentFields(goalId),
        calendar: { id: 'production-calendar', version: 2 },
      },
      assignmentId,
    );
    await h.command('APPROVE', {}, id);
    const saved = await h.document(id);
    expect(saved.versions).toHaveLength(2);
    expect(saved.versions[0]).toEqual(first);
    expect(
      saved.versions[0].data.assignments[0].targets[0].submissionDate,
    ).toBe('2026-02-05');
    expect(saved.versions[1]).toMatchObject({
      calendar: { id: 'production-calendar', version: 2 },
      effectiveDate: '2026-02-01',
      reason: 'New reporting agreement',
    });
    expect(saved.versions[1].data.assignments[0].calendar).toEqual(
      publication(2),
    );
    expect(
      saved.versions[1].data.assignments[0].targets[0].submissionDate,
    ).toBe('2026-02-09');
    expect(h.resolveCalendar).toHaveBeenLastCalledWith(
      h.user,
      expect.objectContaining({
        kind: 'DEPARTMENT',
        departmentId: 'production',
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      }),
      { id: 'production-calendar', version: 2 },
    );
  });
});
