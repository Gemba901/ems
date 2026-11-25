import { CoreRecordsPlanningPeopleMetadataSource } from './planning-people-metadata.source';

function fixture() {
  const db = {
    employee: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    userOrganization: { findUnique: jest.fn().mockResolvedValue(null) },
    organization: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  return {
    db,
    source: new CoreRecordsPlanningPeopleMetadataSource(db as never),
  };
}

describe('planning people metadata source', () => {
  it('limits reads to requested eligible employees and roles in the requested organisation', async () => {
    const { db, source } = fixture();
    const updatedAt = new Date('2026-11-01T10:00:00Z');
    const candidate = {
      id: 'active',
      organizationId: 'org-1',
      employmentStatus: 'ACTIVE',
      departmentId: 'department-1',
      section: ' Packaging ',
      updatedAt,
      userId: 'account-1',
      user: {
        organizations: [
          { organizationId: 'org-2', role: { name: 'SUPER_ADMIN' } },
          { organizationId: 'org-1', role: { name: 'HOD' } },
        ],
      },
      email: 'private@example.test',
      phone: 'private-phone',
    };
    const candidates = [
      candidate,
      { ...candidate, id: 'probation', employmentStatus: 'PROBATION' },
      { ...candidate, id: 'resigned', employmentStatus: 'RESIGNED' },
      { ...candidate, id: 'suspended', employmentStatus: 'SUSPENDED' },
      { ...candidate, id: 'foreign', organizationId: 'org-2' },
      { ...candidate, id: 'not-requested' },
    ];
    db.employee.findMany.mockImplementation(async ({ where, select }) =>
      candidates
        .filter(
          (employee) =>
            employee.organizationId === where.organizationId &&
            where.id.in.includes(employee.id) &&
            where.employmentStatus.in.includes(employee.employmentStatus),
        )
        .map((employee) => ({
          ...employee,
          user: {
            organizations: employee.user.organizations.filter(
              (membership) =>
                membership.organizationId ===
                select.user.select.organizations.where.organizationId,
            ),
          },
        })),
    );
    const employeeIds = [
      'active',
      'probation',
      'resigned',
      'suspended',
      'foreign',
    ];

    const metadata = await source.getPeopleMetadata('org-1', employeeIds);

    expect(metadata).toEqual(
      ['active', 'probation'].map((id) => ({
        id,
        departmentId: 'department-1',
        section: ' Packaging ',
        updatedAt: '2026-11-01T10:00:00.000Z',
        userId: 'account-1',
        role: 'HOD',
      })),
    );
    // This selection is also the privacy boundary: names and personal contacts
    // come from neither employee nor account records in this metadata query.
    expect(db.employee.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        id: { in: employeeIds },
        employmentStatus: { in: ['ACTIVE', 'PROBATION'] },
      },
      select: {
        id: true,
        departmentId: true,
        section: true,
        updatedAt: true,
        userId: true,
        user: {
          select: {
            organizations: {
              where: { organizationId: 'org-1' },
              select: { role: { select: { name: true } } },
            },
          },
        },
      },
    });
  });

  it('retains employees without accounts and hides accounts without local membership', async () => {
    const { db, source } = fixture();
    db.employee.findMany.mockResolvedValue([
      {
        id: 'unlinked',
        departmentId: null,
        userId: null,
        user: null,
        section: null,
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      },
      {
        id: 'foreign-account',
        departmentId: 'department-2',
        userId: 'foreign-user',
        user: { organizations: [] },
        section: '',
        updatedAt: new Date('2026-02-01T00:00:00Z'),
      },
    ]);

    await expect(
      source.getPeopleMetadata('org-1', ['unlinked', 'foreign-account']),
    ).resolves.toEqual([
      {
        id: 'unlinked',
        departmentId: null,
        userId: null,
        role: 'EMPLOYEE',
        section: null,
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'foreign-account',
        departmentId: 'department-2',
        userId: null,
        role: 'EMPLOYEE',
        section: '',
        updatedAt: '2026-02-01T00:00:00.000Z',
      },
    ]);
  });

  it('does not query metadata when the shared directory has no employees', async () => {
    const { db, source } = fixture();
    await expect(source.getPeopleMetadata('org-1', [])).resolves.toEqual([]);
    expect(db.employee.findMany).not.toHaveBeenCalled();
  });

  it('returns no metadata when none of the requested employees are eligible', async () => {
    const { source } = fixture();
    await expect(
      source.getPeopleMetadata('org-1', ['missing']),
    ).resolves.toEqual([]);
  });

  it('reads an account name only through membership in the requested organisation', async () => {
    const { db, source } = fixture();
    db.userOrganization.findUnique.mockImplementation(async ({ where }) =>
      where.userId_organizationId.organizationId === 'org-1' &&
      where.userId_organizationId.userId === 'account-1'
        ? { user: { name: 'Asha Account' } }
        : null,
    );

    await expect(source.getAccountName('org-1', 'account-1')).resolves.toBe(
      'Asha Account',
    );
    await expect(
      source.getAccountName('org-2', 'account-1'),
    ).resolves.toBeNull();
    await expect(source.getAccountName('org-1', 'missing')).resolves.toBeNull();
    expect(db.userOrganization.findUnique).toHaveBeenNthCalledWith(1, {
      where: {
        userId_organizationId: {
          userId: 'account-1',
          organizationId: 'org-1',
        },
      },
      select: { user: { select: { name: true } } },
    });
  });

  it.each([
    [{ timeZone: 'Africa/Nairobi' }, 'Africa/Nairobi'],
    [{ timeZone: '' }, 'UTC'],
    [null, 'UTC'],
  ])(
    'preserves the organisation time zone fallback for %j',
    async (row, expected) => {
      const { db, source } = fixture();
      db.organization.findUnique.mockResolvedValue(row);
      await expect(source.getTimeZone('org-1')).resolves.toBe(expected);
      expect(db.organization.findUnique).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        select: { timeZone: true },
      });
    },
  );

  it.each(['ACTIVE', 'PROBATION', 'RESIGNED', 'SUSPENDED'])(
    'limits employee context to eligible records for %s',
    async (employmentStatus) => {
      const { db, source } = fixture();
      const context = {
        id: 'employee-1',
        departmentId: 'department-1',
        reportingManagerId: 'manager-1',
      };
      db.employee.findFirst.mockImplementation(async ({ where }) =>
        where.organizationId === 'org-1' &&
        where.id === context.id &&
        where.employmentStatus.in.includes(employmentStatus)
          ? context
          : null,
      );

      await expect(
        source.findEligibleEmployee('org-1', 'employee-1'),
      ).resolves.toEqual(
        ['ACTIVE', 'PROBATION'].includes(employmentStatus) ? context : null,
      );
      await expect(
        source.findEligibleEmployee('org-2', 'employee-1'),
      ).resolves.toBeNull();
      await expect(
        source.findEligibleEmployee('org-1', 'missing'),
      ).resolves.toBeNull();
      expect(db.employee.findFirst).toHaveBeenNthCalledWith(1, {
        where: {
          organizationId: 'org-1',
          id: 'employee-1',
          employmentStatus: { in: ['ACTIVE', 'PROBATION'] },
        },
        select: { id: true, departmentId: true, reportingManagerId: true },
      });
    },
  );
});
