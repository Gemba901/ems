import { DwmsService } from '../dwms.service';

describe('DWMS employee performance access', () => {
  const baseUser = {
    userId: 'viewer-user',
    organizationId: 'org',
    roleLevel: 'MANAGEMENT',
  };
  let prisma: any;
  let service: DwmsService;

  beforeEach(() => {
    prisma = {
      employee: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'target' }, { id: 'peer' }]),
        findUnique: jest.fn().mockResolvedValue({ reportingManagerId: null }),
        findFirst: jest.fn().mockImplementation(({ where }) => {
          if (where.userId === 'viewer-user') {
            return {
              id: 'viewer',
              userId: 'viewer-user',
              organizationId: 'org',
              departmentId: 'department',
            };
          }
          if (where.OR) {
            return {
              id: where.OR[0]?.id ?? 'target',
              userId: 'target-user',
              organizationId: 'org',
              departmentId: 'department',
              firstName: 'Target',
              lastName: 'Employee',
              email: 'target@example.com',
              jobTitle: 'Operator',
              department: { name: 'Operations' },
            };
          }
          return null;
        }),
      },
      organization: {
        findUnique: jest.fn().mockResolvedValue({ timeZone: 'UTC' }),
      },
      dwmsPermissionConfig: {
        findUnique: jest.fn().mockResolvedValue({
          alertViewLevel: 'OWN',
          analyticsViewLevel: 'ORGANIZATION',
        }),
      },
    };
    service = new DwmsService(prisma, { create: jest.fn() } as any);
  });

  function mockSuccessfulEmployeeReport() {
    jest
      .spyOn(service as any, 'getPerformanceMetrics')
      .mockResolvedValue({ completionRate: 0 });
    jest
      .spyOn(service as any, 'getTaskCategoryStatusBreakdown')
      .mockResolvedValue({});
    jest.spyOn(service as any, 'getTrendsForEntity').mockResolvedValue({});
    jest.spyOn(service as any, 'listReporteesRecursive').mockResolvedValue([]);
    jest.spyOn(service as any, 'getEmployeeScoreboard').mockResolvedValue([]);
  }

  it.each(['MANAGEMENT', 'ADMIN', 'SUPER_ADMIN', 'HR'])(
    'allows %s to view any employee in the organization',
    async (roleLevel) => {
      mockSuccessfulEmployeeReport();

      await expect(
        service.getEmployeeStats({ ...baseUser, roleLevel }, 'target', '7'),
      ).resolves.toEqual(
        expect.objectContaining({
          employee: expect.objectContaining({ id: 'target' }),
        }),
      );
    },
  );

  it('rejects a non-management user even with organization analytics', async () => {
    await expect(
      service.getEmployeeStats(
        { ...baseUser, roleLevel: 'EMPLOYEE' },
        'peer',
        '7',
      ),
    ).rejects.toThrow(
      'You can only view performance for employees in your reporting line',
    );
  });

  it('allows HOD access to another employee in their department', async () => {
    mockSuccessfulEmployeeReport();

    await expect(
      service.getEmployeeStats(
        { ...baseUser, roleLevel: 'HOD' },
        'descendant',
        '7',
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        employee: expect.objectContaining({ id: 'descendant' }),
      }),
    );
  });

  it('allows a normal employee to view a recursive reportee', async () => {
    mockSuccessfulEmployeeReport();
    jest.spyOn(service as any, 'isSuperior').mockResolvedValue(true);

    await expect(
      service.getEmployeeStats(
        { ...baseUser, roleLevel: 'EMPLOYEE' },
        'descendant',
        '7',
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        employee: expect.objectContaining({ id: 'descendant' }),
      }),
    );
  });

  it('allows every role to view their own performance', async () => {
    prisma.employee.findFirst.mockImplementation(({ where }) => {
      if (where.userId === 'viewer-user' || where.OR) {
        return {
          id: 'viewer',
          userId: 'viewer-user',
          organizationId: 'org',
          departmentId: 'department',
          firstName: 'Current',
          lastName: 'Employee',
          email: 'current@example.com',
          jobTitle: 'Operator',
          department: { name: 'Operations' },
        };
      }
      return null;
    });
    mockSuccessfulEmployeeReport();

    await expect(
      service.getEmployeeStats(
        { ...baseUser, roleLevel: 'EMPLOYEE' },
        'viewer-user',
        '7',
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        employee: expect.objectContaining({ id: 'viewer' }),
      }),
    );
  });

  it('returns every other organization employee to eligible roles', async () => {
    jest
      .spyOn(service as any, 'listTeamEmployeeIds')
      .mockResolvedValue(['direct', 'indirect']);
    prisma.employee.findMany.mockResolvedValue([
      { id: 'direct' },
      { id: 'indirect' },
      { id: 'peer' },
    ]);

    await expect(service.getDwmsAccessCapabilities(baseUser)).resolves.toEqual(
      expect.objectContaining({
        currentEmployeeId: 'viewer',
        hasReportees: true,
        teamPerformanceEmployeeIds: ['direct', 'indirect'],
        canViewEmployeePerformance: true,
        employeePerformanceEmployeeIds: ['direct', 'indirect', 'peer'],
      }),
    );
  });

  it('does not expose employee performance ids to an ineligible role', async () => {
    jest
      .spyOn(service as any, 'listTeamEmployeeIds')
      .mockResolvedValue(['direct']);

    await expect(
      service.getDwmsAccessCapabilities({ ...baseUser, roleLevel: 'HOD' }),
    ).resolves.toEqual(
      expect.objectContaining({
        hasReportees: true,
        teamPerformanceEmployeeIds: ['direct'],
        canViewEmployeePerformance: false,
        employeePerformanceEmployeeIds: [],
      }),
    );
  });

  it('uses every other organization employee as the management team scope', async () => {
    await expect(service.getDwmsAccessCapabilities(baseUser)).resolves.toEqual(
      expect.objectContaining({
        teamPerformanceEmployeeIds: ['target', 'peer'],
      }),
    );
  });

  it('uses every other department employee as the HOD team scope', async () => {
    await expect(
      service.getDwmsAccessCapabilities({ ...baseUser, roleLevel: 'HOD' }),
    ).resolves.toEqual(
      expect.objectContaining({
        teamPerformanceEmployeeIds: ['target', 'peer'],
      }),
    );
    expect(prisma.employee.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org',
          departmentId: 'department',
          id: { not: 'viewer' },
        }),
      }),
    );
  });

  it('uses recursive reportees as the normal employee team scope', async () => {
    jest.spyOn(service as any, 'listReporteesRecursive').mockResolvedValue([
      { id: 'direct', organizationId: 'org' },
      { id: 'indirect', organizationId: 'org' },
      { id: 'foreign', organizationId: 'other-org' },
    ]);

    await expect(
      service.getDwmsAccessCapabilities({ ...baseUser, roleLevel: 'EMPLOYEE' }),
    ).resolves.toEqual(
      expect.objectContaining({
        teamPerformanceEmployeeIds: ['direct', 'indirect'],
      }),
    );
  });
});

describe('DWMS performance alert scopes', () => {
  const service = new DwmsService({} as any, { create: jest.fn() } as any);

  it('includes employee and directly targeted alerts in department performance', () => {
    expect(
      (service as any).getAlertPerformanceScope(
        'org',
        ['employee-1', 'employee-2'],
        'department',
        false,
      ),
    ).toEqual({
      organizationId: 'org',
      OR: [
        { againstUser: { departmentId: 'department' } },
        { departmentId: 'department' },
      ],
    });
  });

  it('loads every alert target type needed for organisational KPI breakdowns', () => {
    expect(
      (service as any).getAlertPerformanceScope(
        'org',
        ['employee-1', 'employee-2'],
        undefined,
        true,
      ),
    ).toEqual({ organizationId: 'org' });
  });

  it('keeps employee performance limited to alerts against that employee', () => {
    expect(
      (service as any).getAlertPerformanceScope(
        'org',
        ['employee-1'],
        undefined,
        false,
      ),
    ).toEqual({
      organizationId: 'org',
      againstUserId: { in: ['employee-1'] },
    });
  });

  it('keeps Total Alerts limited to employee and task targets', () => {
    const occurrences = [
      { id: 'employee', alert: { againstUserId: 'employee-1' } },
      { id: 'task', alert: { againstUserId: 'employee-2' } },
      { id: 'department', alert: { againstUserId: null } },
      { id: 'organization', alert: { againstUserId: null } },
    ];

    expect((service as any).employeeTargetOccurrences(occurrences)).toEqual([
      occurrences[0],
      occurrences[1],
    ]);
  });

  it('counts the third and later occurrences as abnormalities', () => {
    const occurrences = [
      {
        id: 'fourth',
        alertId: 'alert-1',
        raisedAt: new Date('2026-01-04T00:00:00Z'),
      },
      {
        id: 'second',
        alertId: 'alert-1',
        raisedAt: new Date('2026-01-02T00:00:00Z'),
      },
      {
        id: 'first',
        alertId: 'alert-1',
        raisedAt: new Date('2026-01-01T00:00:00Z'),
      },
      {
        id: 'third',
        alertId: 'alert-1',
        raisedAt: new Date('2026-01-03T00:00:00Z'),
      },
    ];

    expect(
      (service as any).splitAlertOccurrencesBySequence(occurrences),
    ).toEqual({
      alerts: [occurrences[2], occurrences[1]],
      abnormalities: [occurrences[3], occurrences[0]],
    });
  });

  it('counts direct department and organization targets separately', () => {
    expect(
      (service as any).countDirectAlertTargets([
        {
          alert: {
            departmentId: null,
            againstUserId: 'employee-1',
            taskInstanceId: null,
          },
        },
        {
          alert: {
            departmentId: null,
            againstUserId: 'employee-2',
            taskInstanceId: 'task-instance',
          },
        },
        {
          alert: {
            departmentId: 'department-1',
            againstUserId: null,
            taskInstanceId: null,
          },
        },
        {
          alert: {
            departmentId: 'department-2',
            againstUserId: null,
            taskInstanceId: null,
          },
        },
        {
          alert: {
            departmentId: null,
            againstUserId: null,
            taskInstanceId: null,
          },
        },
      ]),
    ).toEqual({
      departmentAlertsCount: 2,
      organizationAlertsCount: 1,
    });
  });
});
