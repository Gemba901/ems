import {
  EmsDirectoryService,
  emsDetailTier,
  EMS_DIRECTORY_LIMIT,
} from './ems-directory.service';

const person = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  firstName: id,
  middleName: 'N/A',
  lastName: 'Test',
  employeeCode: ` ${id} `,
  jobTitle: 'Operator',
  departmentId: 'dept-a',
  plantBranch: ' Head Office (Main) ',
  section: null,
  employmentStatus: 'ACTIVE',
  avatarUrl: null,
  reportingManagerId: null,
  reportsToBoard: false,
  reportingBody: null,
  pendingReportingRecordId: null,
  ...extra,
});
function fixture() {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    organization: {
      findUnique: jest.fn().mockResolvedValue({ id: 'a', name: 'A' }),
    },
    department: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'dept-a', name: 'Production' },
        { id: 'empty', name: 'Empty' },
      ]),
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: 'dept-a', name: 'Production' }),
    },
    employee: {
      findMany: jest.fn().mockResolvedValue([person('worker')]),
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(1),
    },
    userOrganization: {
      findUnique: jest.fn().mockResolvedValue({
        role: { name: 'EMPLOYEE' },
        organization: {
          status: 'ACTIVE',
          modules: ['EMS'],
          isAdminOrg: false,
        },
      }),
    },
    emsDepartmentHod: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const db = { $transaction: jest.fn(async (fn) => fn(tx)) };
  return { tx, db, service: new EmsDirectoryService(db as never) };
}

describe('Shared EMS directory', () => {
  it('returns a complete, company-scoped snapshot including empty departments and probation; no personal fields or draft employees', async () => {
    const { service, tx, db } = fixture();
    tx.employee.findMany.mockResolvedValue([
      person('probation', { employmentStatus: 'PROBATION' }),
      person('left', { employmentStatus: 'RESIGNED' }),
    ]);
    const data = await service.getDirectory('a');
    expect(data.company.id).toBe('a');
    expect(data.departments.map((d) => d.id)).toContain('empty');
    expect(data.people[0]).toMatchObject({
      id: 'probation',
      name: 'probation Test',
      employeeCode: 'probation',
      branchKey: 'headoffice',
      active: true,
    });
    expect(data.people[1].active).toBe(false);
    expect(data.capabilities.recordedPositions).toBe(false);
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
    });
    expect(tx.$executeRaw).toHaveBeenCalledWith(expect.anything(), 'a');
    for (const read of [tx.employee.findMany, tx.department.findMany])
      expect(read.mock.calls[0][0].where).toEqual({ organizationId: 'a' });
    for (const field of [
      'email',
      'phone',
      'userId',
      'dateOfBirth',
      'nationalId',
      'homeAddress',
      'importedExtraFields',
      'notificationPreferences',
    ]) {
      expect(tx.employee.findMany.mock.calls[0][0].select).not.toHaveProperty(
        field,
      );
      expect(data.people[0]).not.toHaveProperty(field);
    }
  });
  it('strips cross-company department and manager references without calling them intentional top-level roles', async () => {
    const { service, tx } = fixture();
    tx.employee.findMany.mockResolvedValue([
      person('worker', {
        departmentId: 'foreign-dept',
        reportingManagerId: 'foreign-manager',
      }),
    ]);
    const data = await service.getDirectory('a');
    expect(data.people[0]).toMatchObject({
      departmentId: null,
      reporting: { managerId: null, state: 'UNAVAILABLE' },
    });
    expect(JSON.stringify(data)).not.toContain('foreign-');
  });
  it('keeps reporting bodies, pending registration, conflicts and inactive managers distinct', async () => {
    const { service, tx } = fixture();
    tx.employee.findMany.mockResolvedValue([
      person('left', { employmentStatus: 'RESIGNED' }),
      person('body', { reportsToBoard: true }),
      person('owner', { reportingBody: 'OWNER' }),
      person('pending', { pendingReportingRecordId: 'draft-id' }),
      person('conflict', { reportsToBoard: true, reportingManagerId: 'left' }),
      person('worker', { reportingManagerId: 'left' }),
    ]);
    const data = await service.getDirectory('a');
    expect(data.people.map((p) => p.reporting.state)).toEqual([
      'UNASSIGNED',
      'BODY',
      'BODY',
      'PENDING',
      'CONFLICT',
      'MANAGER_INACTIVE',
    ]);
    expect(data.people[1].reporting.body).toBe('BOARD');
    expect(JSON.stringify(data)).not.toContain('draft-id');
  });
  it('rejects a partial whole-company view above the limit', async () => {
    const { service, tx } = fixture();
    tx.employee.findMany.mockResolvedValue(
      Array(EMS_DIRECTORY_LIMIT + 1).fill(person('worker')),
    );
    await expect(service.getDirectory('a')).rejects.toThrow(
      /no partial organisation/,
    );
  });
  it('flags contradictory body choices and unknown body/manager combinations', async () => {
    const { service, tx } = fixture();
    tx.employee.findMany.mockResolvedValue([
      person('lead'),
      person('both', { reportsToBoard: true, reportingBody: 'OWNER' }),
      person('unknown', {
        reportingBody: 'INVALID',
        reportingManagerId: 'lead',
      }),
      person('legacy', { reportsToBoard: true, reportingBody: 'BOARD' }),
    ]);
    expect(
      (await service.getDirectory('a')).people.map((p) => p.reporting.state),
    ).toEqual(['UNASSIGNED', 'CONFLICT', 'CONFLICT', 'BODY']);
  });
  it('reuses the caller transaction without opening or switching it', async () => {
    const { service, tx, db } = fixture();
    await service.readDirectory(tx as never, 'a');
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
  it('rejects missing company context before querying', async () => {
    const { service, db, tx } = fixture();
    expect(() => service.getDirectory('')).toThrow(/Company context/);
    await expect(service.readDirectory(tx as never, '')).rejects.toThrow(
      /Company context/,
    );
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(tx.employee.findMany).not.toHaveBeenCalled();
  });
  it('does not turn a missing company into an empty successful directory', async () => {
    const { service, tx } = fixture();
    tx.organization.findUnique.mockResolvedValue(null);
    await expect(service.getDirectory('missing')).rejects.toThrow(
      'Company not found',
    );
  });
  it('provides bounded paged choices and searches names, codes and titles within the company', async () => {
    const { service, tx } = fixture();
    const result = await service.listPeople('a', {
      search: 'Ann supervisor',
      page: 2,
      pageSize: 25,
    });
    expect(result.pagination).toEqual({
      page: 2,
      pageSize: 25,
      total: 1,
      pages: 1,
    });
    expect(tx.employee.findMany.mock.calls[0][0]).toMatchObject({
      skip: 25,
      take: 25,
      where: {
        organizationId: 'a',
        employmentStatus: { in: ['ACTIVE', 'PROBATION'] },
        AND: expect.any(Array),
      },
    });
    expect(tx.employee.findMany.mock.calls[0][0].where.AND).toHaveLength(2);
  });
  it.each([
    { pageSize: 101 },
    { page: 0 },
    { search: 'a'.repeat(121) },
    { activity: 'unknown' },
    { search: 42 },
    { departmentId: ' ' },
    null,
  ])('rejects invalid paging/filter options %j', async (options) => {
    const { service, db } = fixture();
    await expect(service.listPeople('a', options as never)).rejects.toThrow(
      'Invalid directory filters',
    );
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('rejects a foreign department filter and supports inactive-only choices', async () => {
    const { service, tx } = fixture();
    tx.department.findFirst.mockResolvedValue(null);
    await expect(
      service.listPeople('a', { departmentId: 'foreign' }),
    ).rejects.toThrow(/Department not found/);
    await service.listPeople('a', { activity: 'INACTIVE' });
    expect(tx.employee.count.mock.calls[0][0].where.employmentStatus).toEqual({
      notIn: ['ACTIVE', 'PROBATION'],
    });
  });
});

describe('Recorded department HODs', () => {
  const row = (extra: Record<string, unknown>) => ({
    departmentId: 'dept-a',
    branchKey: 'headoffice',
    branchLabel: 'Head Office',
    employeeId: null,
    pendingRecordId: null,
    employee: null,
    pendingRecord: null,
    isUnassigned: false,
    ...extra,
  });
  it('reads recorded scopes in the company and never infers an HOD from a title', async () => {
    const { service, tx } = fixture();
    tx.emsDepartmentHod.findMany.mockResolvedValue([
      row({
        employeeId: 'lead',
        employee: {
          ...person('lead', { employmentStatus: 'PROBATION' }),
          organizationId: 'a',
        },
      }),
    ]);
    const result = await service.getOrganisation('a');
    expect(result.hodAssignments[0]).toMatchObject({
      state: 'ASSIGNED',
      branchKey: 'headoffice',
      person: { id: 'lead' },
    });
    expect(tx.emsDepartmentHod.findMany.mock.calls[0][0].where).toEqual({
      department: { organizationId: 'a' },
    });
  });
  it.each([
    ['UNASSIGNED', row({ isUnassigned: true })],
    [
      'PENDING',
      row({
        pendingRecordId: 'draft',
        pendingRecord: {
          organizationId: 'a',
          status: 'READY',
          batch: { organizationId: 'a', status: 'READY' },
        },
      }),
    ],
    [
      'NEEDS_ATTENTION',
      row({
        employeeId: 'foreign',
        employee: { ...person('foreign'), organizationId: 'b' },
      }),
    ],
    [
      'NEEDS_ATTENTION',
      row({
        employeeId: 'left',
        employee: {
          ...person('left', { employmentStatus: 'RESIGNED' }),
          organizationId: 'a',
        },
      }),
    ],
    [
      'NEEDS_ATTENTION',
      row({
        pendingRecordId: 'draft',
        pendingRecord: {
          organizationId: 'a',
          status: 'READY',
          batch: { organizationId: 'b', status: 'READY' },
        },
      }),
    ],
    [
      'NEEDS_ATTENTION',
      row({
        pendingRecordId: 'draft',
        pendingRecord: {
          organizationId: 'a',
          status: 'READY',
          batch: { organizationId: 'a', status: 'CANCELLED' },
        },
      }),
    ],
    [
      'NEEDS_ATTENTION',
      row({
        pendingRecordId: 'draft',
        pendingRecord: {
          organizationId: 'a',
          status: 'REGISTERED',
          batch: { organizationId: 'a', status: 'REGISTERED' },
        },
      }),
    ],
    ['NEEDS_ATTENTION', row({ employeeId: 'lead', isUnassigned: true })],
  ])(
    'returns %s without leaking draft or unavailable identities',
    async (state, input) => {
      const { service, tx } = fixture();
      tx.emsDepartmentHod.findMany.mockResolvedValue([input]);
      const result = await service.readDepartmentHods(tx as never, 'a');
      expect(result[0]).toMatchObject({ state, person: null });
      expect(JSON.stringify(result)).not.toMatch(/foreign|draft/);
    },
  );
});

describe('Employee detail access', () => {
  const links = [
    person('top'),
    person('manager', { reportingManagerId: 'top' }),
    person('worker', { reportingManagerId: 'manager' }),
    person('other'),
  ];
  it.each(['SUPER_ADMIN', 'ADMIN', 'HR'])('%s gets full work details', (role) =>
    expect(emsDetailTier(role, [], 'worker', links)).toBe('FULL'),
  );
  it('preserves management, self, reporting-chain and unrelated-person tiers', () => {
    expect(emsDetailTier('MANAGEMENT', [], 'other', links)).toBe('MANAGER');
    expect(emsDetailTier('EMPLOYEE', ['worker'], 'worker', links)).toBe(
      'MANAGER',
    );
    expect(emsDetailTier('HOD', ['manager'], 'worker', links)).toBe('MANAGER');
    expect(emsDetailTier('HOD', ['manager'], 'other', links)).toBe('BASIC');
    expect(emsDetailTier('EMPLOYEE', ['worker'], 'top', links)).toBe('BASIC');
  });
  it('does not grant reporting access through inactive people, loops, conflicts or missing managers', () => {
    for (const extra of [
      { employmentStatus: 'RESIGNED' },
      { reportingManagerId: 'worker' },
      { reportingManagerId: 'foreign' },
      { reportsToBoard: true },
    ]) {
      const broken = links.map((p) =>
        p.id === 'manager' ? { ...p, ...extra } : p,
      );
      expect(emsDetailTier('HOD', ['manager'], 'worker', broken)).toBe('BASIC');
    }
  });
  it.each(['BASIC', 'MANAGER', 'FULL'])(
    'returns only %s fields and resolves each related record inside the company',
    async (tier) => {
      const { service, tx } = fixture();
      tx.userOrganization.findUnique.mockResolvedValue({
        role: {
          name:
            tier === 'FULL'
              ? 'HR'
              : tier === 'MANAGER'
                ? 'MANAGEMENT'
                : 'EMPLOYEE',
        },
        organization: { status: 'ACTIVE', modules: ['EMS'], isAdminOrg: false },
      });
      tx.employee.findMany.mockImplementation(async (args) =>
        args.where.userId ? [] : links,
      );
      tx.employee.findFirst.mockImplementation(async (args) =>
        args.where.id === 'worker'
          ? {
              ...person('worker'),
              subSection: null,
              reportingManagerId: 'foreign-manager',
              dateJoined: new Date('2026-01-15T00:00:00Z'),
              employmentType: 'FULL_TIME',
              shift: 'A',
              hrRecordOwnerId: 'foreign-hr',
              canBeLeader: false,
              canBeMember: true,
              canBeAssignedTasks: true,
            }
          : null,
      );
      tx.department.findFirst.mockResolvedValue(null);
      const data = await service.getPerson('a', 'viewer', 'worker');
      expect(data.tier).toBe(tier);
      expect(data.department).toBeNull();
      expect(data.manager).toBeNull();
      expect('work' in data).toBe(tier !== 'BASIC');
      expect('role' in data).toBe(tier === 'FULL');
      if (tier !== 'BASIC') expect(data.work?.dateJoined).toBe('2026-01-15');
      expect(data.emsProfileUrl).toBe(
        tier === 'FULL' ? '/ems/employees/worker' : null,
      );
      const select = tx.employee.findFirst.mock.calls[0][0].select;
      expect('dateJoined' in select).toBe(tier !== 'BASIC');
      expect('hrRecordOwnerId' in select).toBe(tier === 'FULL');
      for (const key of [
        'email',
        'phone',
        'userId',
        'nationalId',
        'dateOfBirth',
        'homeAddress',
        'importedExtraFields',
      ])
        expect(select).not.toHaveProperty(key);
      for (const [args] of tx.employee.findFirst.mock.calls)
        expect(args.where.organizationId).toBe('a');
      expect(JSON.stringify(data)).not.toContain('foreign-');
    },
  );
  it('rejects removed membership, inactive company and missing target', async () => {
    const { service, tx } = fixture();
    tx.userOrganization.findUnique.mockResolvedValueOnce(null);
    await expect(service.getPerson('a', 'removed', 'worker')).rejects.toThrow(
      'Company access denied',
    );
    tx.userOrganization.findUnique.mockResolvedValueOnce({
      role: { name: 'HR' },
      organization: { status: 'SUSPENDED' },
    });
    await expect(service.getPerson('a', 'viewer', 'worker')).rejects.toThrow(
      'Company access denied',
    );
    await expect(service.getPerson('a', 'viewer', 'foreign')).rejects.toThrow(
      'Person not found',
    );
  });
  it('does not advertise an EMS profile route when EMS is disabled', async () => {
    const { service, tx } = fixture();
    tx.userOrganization.findUnique.mockResolvedValue({
      role: { name: 'HR' },
      organization: { status: 'ACTIVE', modules: [], isAdminOrg: false },
    });
    tx.employee.findFirst.mockResolvedValue({
      ...person('worker'),
      subSection: null,
    });
    expect(
      (await service.getPerson('a', 'viewer', 'worker')).emsProfileUrl,
    ).toBeNull();
    expect(tx.employee.findMany).not.toHaveBeenCalled();
  });
  it('uses all current employee records linked to the viewer, rather than an arbitrary first record', async () => {
    const { service, tx } = fixture();
    tx.employee.findMany.mockImplementation(async (args) =>
      args.where.userId ? [{ id: 'other' }, { id: 'manager' }] : links,
    );
    tx.employee.findFirst.mockImplementation(async (args) =>
      args.where.id === 'worker'
        ? { ...person('worker'), subSection: null }
        : null,
    );
    expect((await service.getPerson('a', 'viewer', 'worker')).tier).toBe(
      'MANAGER',
    );
    expect(tx.employee.findMany.mock.calls[0][0].where).toEqual({
      organizationId: 'a',
      userId: 'viewer',
      employmentStatus: { in: ['ACTIVE', 'PROBATION'] },
    });
  });
});

it.each([
  [undefined, 'worker'],
  [' ', 'worker'],
  ['viewer', undefined],
  ['viewer', ' '],
])(
  'rejects missing viewer/employee identifiers before querying (%s, %s)',
  (viewer, employee) => {
    const { service, db } = fixture();
    expect(() =>
      service.getPerson('a', viewer as string, employee as string),
    ).toThrow(/required/);
    expect(db.$transaction).not.toHaveBeenCalled();
  },
);
