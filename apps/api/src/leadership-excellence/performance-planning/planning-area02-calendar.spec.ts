import {
  PlanningArea02CalendarService,
  planningCalendarFromArea02,
} from './planning-area02-calendar.service';
import { RulesCalendarService } from '../organisation-framework/rules-calendar/rules-calendar.service';
import { approvalSnapshot } from '../organisation-framework/rules-calendar/calendar-engine';
import { initialRules } from '../organisation-framework/rules-calendar/calendar-model';
import type {
  ApprovedPerformanceCalendar,
  CalendarRules,
  PerformanceCalendarProvider,
} from '../common/contracts';
import type { PlanningCalendarContext } from './planning-dependency.contracts';
import type { PlanningPeopleSource } from './planning-people.contracts';
import type { PlanningPerson } from './planning.types';

const company: PlanningCalendarContext = {
  kind: 'COMPANY',
  startDate: '2026-01-01',
  endDate: '2026-12-31',
};
const department: PlanningCalendarContext = {
  ...company,
  kind: 'DEPARTMENT',
  departmentId: 'dept-1',
};
const individual: PlanningCalendarContext = {
  ...department,
  kind: 'INDIVIDUAL',
  employeeId: 'emp-1',
};
const audience = (
  kind: 'COMPANY' | 'DEPARTMENTS' | 'PEOPLE',
  ids: string[] = [],
) => ({
  kind,
  label: kind,
  departmentIds: kind === 'DEPARTMENTS' ? ids : [],
  employeeIds: kind === 'PEOPLE' ? ids : [],
});
function publication(
  id: string,
  override: Partial<CalendarRules> = {},
  version = 1,
): ApprovedPerformanceCalendar {
  const rules = {
    ...initialRules(2026, 'Asia/Kolkata'),
    name: `Approved ${id}`,
    audience: audience('COMPANY'),
    ...override,
  };
  return {
    ...approvalSnapshot(rules),
    calendarId: id,
    organizationId: 'org-1',
    version,
    approvedAt: '2026-01-01T00:00:00.000Z',
    approvedByUserId: 'management-user',
  };
}

/** Run the actual owner service against a tenant-aware, read-only persistence double. */
function fixture(
  publications: ApprovedPerformanceCalendar[] = [publication('company')],
) {
  const people = [
    {
      id: 'emp-1',
      organizationId: 'org-1',
      firstName: 'Asha',
      lastName: 'Patel',
      departmentId: 'dept-1',
      employmentStatus: 'PROBATION',
      reportingManagerId: 'manager-1',
    },
    {
      id: 'manager-1',
      organizationId: 'org-1',
      firstName: 'Mira',
      lastName: 'Patel',
      departmentId: 'dept-1',
      employmentStatus: 'ACTIVE',
      reportingManagerId: null,
    },
    {
      id: 'former',
      organizationId: 'org-1',
      firstName: 'Former',
      lastName: 'Employee',
      departmentId: 'dept-1',
      employmentStatus: 'RESIGNED',
      reportingManagerId: null,
    },
  ];
  const rows = [
    ...new Map(
      publications.map((value) => [
        value.calendarId,
        {
          id: value.calendarId,
          organizationId: value.organizationId,
          currentVersion: Math.max(
            ...publications
              .filter((p) => p.calendarId === value.calendarId)
              .map((p) => p.version),
          ),
          draft: { name: 'UNAPPROVED EDIT' },
        },
      ]),
    ).values(),
  ];
  const versions = publications.map(
    ({
      calendarId,
      organizationId,
      version,
      approvedAt,
      approvedByUserId,
      ...snapshot
    }) => ({
      calendarId,
      organizationId,
      version,
      approvedAt: new Date(approvedAt),
      approvedByUserId,
      snapshot,
    }),
  );
  const match = (row: Record<string, unknown>, where: Record<string, any>) =>
    Object.entries(where).every(([key, value]) =>
      typeof value === 'object' && value !== null
        ? value.gt !== undefined
          ? Number(row[key]) > value.gt
          : value.in?.includes(row[key])
        : row[key] === value,
    );
  const db = {
    $transaction: jest.fn(),
    $executeRaw: jest.fn(),
    lexPerformanceCalendar: {
      findMany: jest.fn().mockImplementation(async ({ where, take }: any) =>
        rows
          .filter((row) => match(row, where))
          .slice(0, take)
          .map((row) => ({
            ...row,
            versions: versions
              .filter(
                (version) =>
                  version.calendarId === row.id &&
                  version.organizationId === row.organizationId,
              )
              .sort((a, b) => b.version - a.version)
              .slice(0, 1),
          })),
      ),
      findFirst: jest
        .fn()
        .mockImplementation(
          async ({ where }: any) =>
            rows.find((row) => match(row, where)) || null,
        ),
    },
    lexPerformanceCalendarVersion: {
      findFirst: jest
        .fn()
        .mockImplementation(
          async ({ where }: any) =>
            versions.find((row) => match(row, where)) || null,
        ),
    },
    employee: {
      findFirst: jest
        .fn()
        .mockImplementation(
          async ({ where }: any) =>
            people.find((row) => match(row, where)) || null,
        ),
      findMany: jest
        .fn()
        .mockImplementation(async ({ where }: any) =>
          people.filter((row) => match(row, where)),
        ),
    },
    department: {
      findFirst: jest
        .fn()
        .mockImplementation(async ({ where }: any) =>
          where.organizationId === 'org-1' && where.id === 'dept-1'
            ? { id: 'dept-1' }
            : null,
        ),
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: 'dept-1', name: 'Production' }]),
    },
  };
  db.$transaction.mockImplementation(async (work) => work(db));
  const peopleSource = {
    findEligibleEmployee: jest.fn(
      async (organizationId: string, employeeId: string) => {
        const person = people.find(
          (row) =>
            row.organizationId === organizationId &&
            row.id === employeeId &&
            ['ACTIVE', 'PROBATION'].includes(row.employmentStatus),
        );
        return person
          ? {
              id: person.id,
              departmentId: person.departmentId,
              reportingManagerId: person.reportingManagerId,
            }
          : null;
      },
    ),
    departmentExists: jest.fn(
      async (organizationId: string, departmentId: string) =>
        organizationId === 'org-1' && departmentId === 'dept-1',
    ),
  } satisfies Pick<
    PlanningPeopleSource,
    'findEligibleEmployee' | 'departmentExists'
  >;
  const owner = new RulesCalendarService(db as never);
  const service = new PlanningArea02CalendarService(
    peopleSource,
    owner,
  );
  return { service, owner, db, rows, versions, people, peopleSource };
}

describe('Area 03 real Area 02 calendar consumer', () => {
  it('lists only tenant-scoped approved publications and never leaks draft labels', async () => {
    const current = publication('company', {}, 2);
    const foreign = { ...publication('foreign'), organizationId: 'other-org' };
    const { service, owner, rows, db } = fixture([
      publication('company'),
      current,
      foreign,
    ]);
    rows.push({
      id: 'draft',
      organizationId: 'org-1',
      currentVersion: 0,
      draft: { name: 'Draft only' },
    });
    const listing = jest.spyOn(owner, 'listApproved');
    const result = await service.listApproved('org-1');
    expect(listing).toHaveBeenCalledWith('org-1');
    expect(
      result.map((calendar) => [calendar.id, calendar.version, calendar.name]),
    ).toEqual([['company', 2, 'Approved company']]);
    expect(db.lexPerformanceCalendar.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org-1', currentVersion: { gt: 0 } },
      }),
    );
    expect(Object.keys(db.lexPerformanceCalendar)).toEqual([
      'findMany',
      'findFirst',
    ]);
  });

  it('can read the shared calendar contract without access to Area 02 storage', async () => {
    const source = publication('contract-calendar');
    const provider: PerformanceCalendarProvider = {
      listApproved: jest.fn().mockResolvedValue([
        {
          calendarId: source.calendarId,
          version: source.version,
          name: source.rules.name,
          start: source.rules.start,
          end: source.rules.end,
          timeZone: source.rules.timeZone,
          audience: { kind: 'COMPANY', label: 'Company' },
          frequencies: ['monthly', 'quarterly'],
        },
      ]),
      getApproved: jest.fn().mockResolvedValue(source),
      getCurrentAssignment: jest.fn(),
      getDepartmentAssignment: jest.fn(),
    };
    const service = new PlanningArea02CalendarService({} as never, provider);
    const [calendar] = await service.listApproved('org-1');
    expect(provider.listApproved).toHaveBeenCalledWith('org-1');
    expect(provider.getApproved).toHaveBeenCalledWith(
      'org-1',
      'contract-calendar',
      1,
    );
    expect(calendar.area02?.periods.MONTHLY).toEqual(source.periods.monthly);
    (provider.getApproved as jest.Mock).mockResolvedValue(null);
    await expect(service.listApproved('org-1')).rejects.toThrow(
      'version is missing',
    );
  });

  it('preserves approved custom and two-month periods, deadline times, reviews and working exceptions exactly', () => {
    const source = publication('custom', {
      enabledFrequencies: ['custom', 'every-two-months'],
      customInterval: { every: 11, unit: 'DAYS', anchor: '2026-01-01' },
      twoMonthAnchor: '2026-01-01',
      verificationBasis: 'ACTUAL_SUBMISSION',
      exceptions: [
        {
          date: '2026-01-03',
          kind: 'WORKING',
          reason: 'Approved Saturday',
          source: 'MANUAL',
        },
      ],
    });
    source.periods.custom![0].submitBy = {
      date: '2026-01-19',
      time: '14:35',
      timeZone: 'Asia/Kolkata',
    };
    const mapped = planningCalendarFromArea02(source);
    expect(mapped.frequencies).toEqual(['CUSTOM', 'EVERY_TWO_MONTHS']);
    expect(mapped.area02?.periods.CUSTOM).toEqual(source.periods.custom);
    expect(mapped.area02?.periods.EVERY_TWO_MONTHS).toEqual(
      source.periods['every-two-months'],
    );
    expect(mapped.area02?.reviews).toEqual(source.reviews);
    expect(mapped.area02?.exceptions).toEqual(source.rules.exceptions);
    expect(
      mapped.area02?.periods.CUSTOM?.[0].verificationPendingSubmission,
    ).toBe(true);
    source.periods.custom![0].submitBy!.time = '23:00';
    source.rules.workdays.push(0);
    expect(mapped.area02?.periods.CUSTOM?.[0].submitBy?.time).toBe('14:35');
    expect(mapped.workingDays).not.toContain(0);
  });

  it('chooses company and department calendars with scope precedence', async () => {
    const { service, owner, peopleSource } = fixture([
      publication('company'),
      publication('department', {
        audience: audience('DEPARTMENTS', ['dept-1']),
      }),
      publication('person', { audience: audience('PEOPLE', ['emp-1']) }),
    ]);
    const assignment = jest.spyOn(owner, 'getDepartmentAssignment');
    expect((await service.resolve('org-1', company))?.id).toBe('company');
    expect((await service.resolve('org-1', department))?.id).toBe('department');
    expect(peopleSource.departmentExists).toHaveBeenCalledWith('org-1', 'dept-1');
    expect(assignment).toHaveBeenCalledWith('org-1', 'dept-1', '2026-01-01');
    expect(assignment).toHaveBeenCalledWith('org-1', 'dept-1', '2026-12-31');
    expect(
      (
        await service.applicable(
          'org-1',
          company,
          await service.listApproved('org-1'),
        )
      ).map((calendar) => calendar.id),
    ).toEqual(['company']);
    expect(
      (
        await service.applicable(
          'org-1',
          department,
          await service.listApproved('org-1'),
        )
      ).map((calendar) => calendar.id),
    ).toEqual(['company', 'department']);
  });

  it('honours the owning department resolver when its answer conflicts or changes concurrently', async () => {
    const { service, owner } = fixture();
    const assignment = jest.spyOn(owner, 'getDepartmentAssignment');
    assignment.mockResolvedValue({
      status: 'CONFLICT',
      basis: 'CURRENT_PEOPLE_RECORDS',
      candidates: [
        { calendarId: 'first', version: 1, name: 'Production A' },
        { calendarId: 'second', version: 1, name: 'Production B' },
      ],
    });
    await expect(service.resolve('org-1', department)).rejects.toThrow(
      'Production A, Production B',
    );
    assignment.mockResolvedValue({
      status: 'ASSIGNED',
      basis: 'CURRENT_PEOPLE_RECORDS',
      calendarId: 'company',
      version: 2,
      candidates: [],
    });
    await expect(service.resolve('org-1', department)).rejects.toThrow(
      'Refresh the planning references',
    );
  });

  it('uses the real employee assignment service including probation staff and people-level precedence', async () => {
    const { service, owner, peopleSource } = fixture([
      publication('company'),
      publication('department', {
        audience: audience('DEPARTMENTS', ['dept-1']),
      }),
      publication('person', { audience: audience('PEOPLE', ['emp-1']) }),
    ]);
    const assignment = jest.spyOn(owner, 'getCurrentAssignment');
    expect((await service.resolve('org-1', individual))?.id).toBe('person');
    expect(peopleSource.findEligibleEmployee).toHaveBeenCalledWith(
      'org-1',
      'emp-1',
    );
    expect(assignment).toHaveBeenCalledWith('org-1', 'emp-1', '2026-01-01');
    await expect(
      service.resolve('org-1', { ...individual, employeeId: 'former' }),
    ).rejects.toThrow('eligible employee');
  });

  it('loads an exact older version without reassigning to the current version', async () => {
    const { service, owner } = fixture([
      publication('company', { name: 'Original approved' }, 1),
      publication('company', { name: 'Current approved' }, 2),
    ]);
    const assignment = jest.spyOn(owner, 'getCurrentAssignment');
    const approved = jest.spyOn(owner, 'getApproved');
    const selected = await service.resolve('org-1', individual, {
      id: 'company',
      version: 1,
    });
    expect(selected).toMatchObject({
      id: 'company',
      version: 1,
      name: 'Original approved',
    });
    expect(approved).toHaveBeenCalledWith('org-1', 'company', 1);
    expect(assignment).not.toHaveBeenCalled();
    await expect(
      service.resolve('org-1', company, { id: 'company', version: 9 }),
    ).rejects.toThrow('version is unavailable');
  });

  it.each([
    { organizationId: 'other-org' },
    { calendarId: 'another-calendar' },
    { version: 2 },
  ])('rejects a mismatched explicit publication %j', async (mismatch) => {
    const { service, owner } = fixture();
    const approved = jest.spyOn(owner, 'getApproved').mockResolvedValue({
      ...publication('company'),
      ...mismatch,
    });
    await expect(
      service.resolve('org-1', company, { id: 'company', version: 1 }),
    ).rejects.toThrow(
      'The approved calendar does not match the requested company and version.',
    );
    expect(approved).toHaveBeenCalledWith('org-1', 'company', 1);
  });

  it.each([
    { id: 'company', version: 0 },
    { id: 'company', version: '1' },
    { id: '', version: 1 },
  ])('rejects malformed exact selections %j', async (selection) => {
    const { service } = fixture();
    await expect(
      service.resolve('org-1', company, selection as never),
    ).rejects.toThrow('exact published version');
  });

  it('rejects foreign tenants, mismatched audiences and uncovered dates without fallback', async () => {
    const { service } = fixture([
      publication('department', {
        audience: audience('DEPARTMENTS', ['dept-1']),
      }),
    ]);
    await expect(
      service.resolve('org-1', company, { id: 'department', version: 1 }),
    ).rejects.toThrow('audience and date range');
    await expect(
      service.resolve('other-org', company, { id: 'department', version: 1 }),
    ).rejects.toThrow('version is unavailable');
    await expect(
      service.resolve(
        'org-1',
        { ...department, endDate: '2027-01-01' },
        { id: 'department', version: 1 },
      ),
    ).rejects.toThrow('audience and date range');
    await expect(
      service.resolve(
        'org-1',
        { ...individual, departmentId: 'wrong-dept' },
        { id: 'department', version: 1 },
      ),
    ).rejects.toThrow('department changed');
  });

  it('returns unassigned for no approved match and refuses ambiguous automatic selection', async () => {
    const empty = fixture([]);
    expect(await empty.service.resolve('org-1', company)).toBeNull();
    const ambiguous = fixture([publication('first'), publication('second')]);
    await expect(ambiguous.service.resolve('org-1', company)).rejects.toThrow(
      'More than one approved',
    );
    expect(
      (
        await ambiguous.service.resolve('org-1', company, {
          id: 'first',
          version: 1,
        })
      )?.id,
    ).toBe('first');
  });

  it.each([
    { context: individual, audience: audience('PEOPLE', ['emp-1']) },
    { context: department, audience: audience('DEPARTMENTS', ['dept-1']) },
  ])(
    'detects a temporary $context.kind assignment even when the start and end match',
    async ({ context, audience: assignedAudience }) => {
      const { service, owner } = fixture([
        publication('company'),
        publication('summer', {
          start: '2026-06-01',
          end: '2026-06-30',
          audience: assignedAudience,
        }),
      ]);
      const resolver = jest.spyOn(
        owner,
        context.kind === 'INDIVIDUAL'
          ? 'getCurrentAssignment'
          : 'getDepartmentAssignment',
      );
      await expect(service.resolve('org-1', context)).rejects.toThrow(
        'changes within',
      );
      expect(resolver).toHaveBeenCalledWith(
        'org-1',
        context.employeeId || context.departmentId,
        '2026-06-01',
      );
    },
  );

  it('fails visibly when an indexed publication is missing instead of providing partial choices', async () => {
    const { service, versions } = fixture();
    versions.length = 0;
    await expect(service.listApproved('org-1')).rejects.toThrow(
      'version is missing',
    );
  });

  it('suggests only existing eligible people and authorised approvers without changing permissions', async () => {
    const { service, peopleSource } = fixture();
    const people: PlanningPerson[] = [
      {
        id: 'emp-1',
        name: 'Asha',
        departmentId: 'dept-1',
        position: 'Operator',
        role: 'EMPLOYEE',
        userId: 'employee-user',
      },
      {
        id: 'manager-1',
        name: 'Mira',
        departmentId: 'dept-1',
        position: 'Supervisor',
        role: 'EMPLOYEE',
        userId: 'manager-user',
      },
      {
        id: 'hod',
        name: 'Head',
        departmentId: 'dept-1',
        position: 'Head',
        role: 'HOD',
        userId: 'hod-user',
      },
      {
        id: 'unlinked-management',
        name: 'Unlinked',
        departmentId: 'dept-1',
        position: 'Manager',
        role: 'MANAGEMENT',
        userId: null,
      },
    ];
    const roles = structuredClone(people);
    const calendar = planningCalendarFromArea02(publication('company'));
    const suggestions = await service.responsibilityDefaults(
      'org-1',
      calendar,
      individual,
      people,
    );
    expect(suggestions).toEqual({
      ownerId: 'hod',
      providerId: 'emp-1',
      verifierId: 'manager-1',
      approverId: 'hod',
      unresolved: [],
    });
    expect(peopleSource.findEligibleEmployee).toHaveBeenCalledWith(
      'org-1',
      'emp-1',
    );
    expect(people).toEqual(roles);
    calendar.area02!.responsibilities.approver = 'PLAN_ASSIGNEE';
    calendar.area02!.responsibilities.owner = 'DEPARTMENT_SUPERVISOR';
    calendar.area02!.responsibilities.verifier = 'PLAN_ASSIGNEE';
    expect(
      await service.responsibilityDefaults(
        'org-1',
        calendar,
        individual,
        people,
      ),
    ).toEqual({
      providerId: 'emp-1',
      unresolved: ['owner', 'approver', 'verifier'],
    });
  });
});
