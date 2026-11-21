import { DwmsService } from '../dwms.service';

describe('DWMS alert histories', () => {
  const user = { userId: 'user', organizationId: 'org', roleLevel: 'OPERATOR' };
  let prisma: any;
  let notifications: any;
  let service: DwmsService;

  beforeEach(() => {
    prisma = {
      employee: {
        findFirst: jest.fn().mockResolvedValue({ id: 'manager', departmentId: 'department' }),
        findMany: jest.fn().mockResolvedValue([
          { id: 'direct' },
          { id: 'indirect' },
        ]),
      },
      dwmsPermissionConfig: {
        findUnique: jest.fn().mockResolvedValue({ alertViewLevel: 'OWN', analyticsViewLevel: 'DEPARTMENT' }),
      },
      alert: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn(),
      },
      alertOccurrence: { updateMany: jest.fn(), count: jest.fn() },
    };
    notifications = { create: jest.fn() };
    service = new DwmsService(prisma, notifications);
    jest.spyOn(service as any, 'listReporteesRecursive').mockResolvedValue([
      { id: 'direct', organizationId: 'org' },
      { id: 'indirect', organizationId: 'org' },
    ]);
  });

  it.each([false, true])('allows a higher manager to view and comment on abnormality=%s', async (isAbnormality) => {
    prisma.employee.findMany.mockImplementation(({ where }) => Promise.resolve(
      where.reportingManagerId?.in?.includes('manager') ? [{ id: 'direct' }] :
      where.reportingManagerId?.in?.includes('direct') ? [{ id: 'indirect' }] : [],
    ));
    jest.spyOn(service, 'getDwmsAccessCapabilities').mockResolvedValue({ hasReportees: false, alertViewLevel: 'OWN' } as any);
    prisma.alert.findFirst.mockResolvedValue({ id: 'alert', title: 'Inspection', isAbnormality, againstUserId: 'indirect', occurrences: [] });
    prisma.alertComment = { findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue({ id: 'comment', comment: 'Please review', createdAt: new Date(), updatedAt: new Date(), author: { id: 'manager', firstName: 'Higher', lastName: 'Manager' } }) };
    await expect(service.getAlertDetail(user, 'alert')).resolves.toMatchObject({ alert: { id: 'alert' } });
    await expect(service.addAlertComment(user, 'alert', { comment: 'Please review' })).resolves.toMatchObject({ message: 'Comment added' });
    expect(prisma.alert.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org', OR: expect.arrayContaining([{ againstUserId: { in: ['direct', 'indirect'] } }]) }) }));
    for (const [query] of prisma.employee.findMany.mock.calls) expect(query.where.organizationId).toBe('org');
  });

  it('does not let an unrelated employee comment on an inaccessible alert', async () => {
    prisma.employee.findMany.mockResolvedValue([]);
    prisma.alert.findFirst.mockResolvedValue(null);
    prisma.alertComment = { create: jest.fn() };
    await expect(service.addAlertComment(user, 'other-alert', { comment: 'Hello' })).rejects.toThrow('Alert not found');
    expect(prisma.alertComment.create).not.toHaveBeenCalled();
  });

  it.each(['MANAGEMENT', 'HR', 'ADMIN', 'SUPER_ADMIN'])('allows %s organization-wide alert and abnormality details and comments', async (roleLevel) => {
    prisma.employee.findMany.mockResolvedValue([]);
    jest.spyOn(service, 'getDwmsAccessCapabilities').mockResolvedValue({ alertViewLevel: 'OWN' } as any);
    prisma.alertComment = { findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue({ id: 'comment', comment: 'Review', createdAt: new Date(), updatedAt: new Date() }) };
    for (const isAbnormality of [false, true]) {
      prisma.alert.findFirst.mockResolvedValue({ id: 'alert', isAbnormality, occurrences: [] });
      await expect(service.getAlertDetail({ ...user, roleLevel }, 'alert')).resolves.toMatchObject({ alert: { id: 'alert' } });
      await expect(service.addAlertComment({ ...user, roleLevel }, 'alert', { comment: 'Review' })).resolves.toMatchObject({ message: 'Comment added' });
      expect(prisma.alert.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({ where: { id: 'alert', organizationId: 'org' } }));
    }
    prisma.alert.findFirst.mockResolvedValue(null);
    await expect(service.getAlertDetail({ ...user, roleLevel }, 'other-org-alert')).rejects.toThrow('Alert not found');
  });

  it('separates own and indirect team alerts', async () => {
    await service.getAlerts(user, 'MY_ALERTS');
    expect(prisma.alert.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { AND: [{ organizationId: 'org', againstUserId: 'manager', isAbnormality: false }] },
    }));
    await service.getAlerts(user, 'TEAM_ALERTS');
    expect(prisma.alert.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { AND: [{ organizationId: 'org', againstUserId: { in: ['direct', 'indirect'] }, raisedById: { not: 'manager' }, isAbnormality: false }] },
    }));
  });

  it('enforces configured target-level alert visibility', async () => {
    await expect(service.getAlerts(user, 'DEPARTMENTAL')).rejects.toThrow(
      'Department alert access is required',
    );

    prisma.dwmsPermissionConfig.findUnique.mockResolvedValue({
      alertViewLevel: 'DEPARTMENT',
      analyticsViewLevel: 'DEPARTMENT',
    });
    await expect(service.getAlerts(user, 'DEPARTMENTAL')).resolves.toEqual(
      expect.objectContaining({ alerts: [] }),
    );
    await expect(service.getAlerts(user, 'ORGANISATIONAL')).rejects.toThrow(
      'Organization alert access is required',
    );
  });

  it('separates management person, department, and organization targets', async () => {
    const management = { ...user, roleLevel: 'MANAGEMENT' };

    await service.getAlerts(management, 'TEAM_ALERTS');
    expect(prisma.alert.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { AND: [{ organizationId: 'org', againstUserId: { not: null }, isAbnormality: false }] },
    }));

    await service.getAlerts(management, 'DEPARTMENTAL');
    expect(prisma.alert.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { AND: [{ organizationId: 'org', departmentId: { not: null }, againstUserId: null, isAbnormality: false }] },
    }));

    await service.getAlerts(management, 'ORGANISATIONAL');
    expect(prisma.alert.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { AND: [{ organizationId: 'org', departmentId: null, againstUserId: null, taskInstanceId: null, isAbnormality: false }] },
    }));

    await service.getAlerts(management, 'TEAM_ABNORMALITIES');
    expect(prisma.alert.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { AND: [{ organizationId: 'org', againstUserId: { not: null }, isAbnormality: true }] },
    }));
  });

  it('creates a person alert with one occurrence requiring acknowledgment', async () => {
    prisma.employee.findFirst.mockResolvedValue({ id: 'manager', departmentId: 'department' });
    jest.spyOn(service as any, 'isSuperior').mockResolvedValue(true);
    prisma.alert.create = jest.fn().mockResolvedValue({
      id: 'alert', title: 'Inspection', againstUserId: 'direct',
      raiseCount: 1, isAbnormality: false, occurrences: [],
    });
    await service.createAlert(user, {
      title: 'Inspection', description: 'Checklist missing',
      severity: 'HIGH' as any, targetType: 'PERSON', againstUserId: 'direct',
    });
    expect(prisma.alert.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        againstUserId: 'direct',
        raiseCount: 1,
        occurrences: { create: { raisedById: 'manager' } },
      }),
    }));
    expect(notifications.create).toHaveBeenCalledWith(expect.objectContaining({ employeeId: 'direct' }));
  });

  it('does not assign an individual to a department alert', async () => {
    prisma.department = { findFirst: jest.fn().mockResolvedValue({ id: 'department' }) };
    prisma.alert.create = jest.fn().mockResolvedValue({
      id: 'alert', title: 'Maintenance', againstUserId: null,
      raiseCount: 1, isAbnormality: false, occurrences: [],
    });
    await service.createAlert(user, {
      title: 'Maintenance', description: 'Machine fault',
      severity: 'HIGH' as any, targetType: 'DEPARTMENT', departmentId: 'department',
    });
    expect(prisma.alert.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ againstUserId: null }),
    }));
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('allows the original assigner to alert the task owner outside their team', async () => {
    jest.spyOn(service as any, 'isSuperior').mockResolvedValue(false);
    prisma.taskInstance = {
      findFirst: jest.fn()
        .mockResolvedValueOnce({ ownerId: 'outside' })
        .mockResolvedValueOnce({ id: 'instance' }),
    };
    prisma.alert.create = jest.fn().mockResolvedValue({
      id: 'alert', title: 'Late work', againstUserId: 'outside',
      raiseCount: 1, isAbnormality: false, occurrences: [],
    });
    await service.createAlert(user, {
      title: 'Late work', description: 'Due today',
      severity: 'HIGH' as any, targetType: 'TASK', taskInstanceId: 'instance',
    });
    expect(prisma.alert.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ againstUserId: 'outside', taskInstanceId: 'instance' }),
    }));
  });

  it('limits person history to direct alerts raised by the current employee', async () => {
    jest.spyOn(service as any, 'isSuperior').mockResolvedValue(true);

    await service.getAlertHistories(user, 'PERSON', 'direct');

    expect(prisma.alert.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organizationId: 'org',
        AND: [
          {
            againstUserId: 'direct',
            taskInstanceId: null,
            departmentId: null,
          },
          {
            OR: [
              { raisedById: 'manager' },
              { occurrences: { some: { raisedById: 'manager' } } },
            ],
          },
        ],
      },
    }));
  });

  it('loads history for the exact selected task', async () => {
    jest.spyOn(service as any, 'isSuperior').mockResolvedValue(true);
    prisma.taskInstance = {
      findFirst: jest.fn().mockResolvedValue({ ownerId: 'direct' }),
    };

    await service.getAlertHistories(user, 'TASK', 'task-instance');

    expect(prisma.alert.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        AND: expect.arrayContaining([{ taskInstanceId: 'task-instance' }]),
      }),
    }));
  });

  it('loads history for the exact selected department', async () => {
    prisma.department = {
      findFirst: jest.fn().mockResolvedValue({ id: 'department' }),
    };

    await service.getAlertHistories(user, 'DEPARTMENT', 'department');

    expect(prisma.alert.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        AND: expect.arrayContaining([{
          departmentId: 'department',
          againstUserId: null,
          taskInstanceId: null,
        }]),
      }),
    }));
  });

  it('loads organization history raised by the current management employee', async () => {
    await service.getAlertHistories(
      { ...user, roleLevel: 'MANAGEMENT' },
      'GENERAL',
      'organization',
    );

    expect(prisma.alert.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        AND: expect.arrayContaining([{
          departmentId: null,
          againstUserId: null,
          taskInstanceId: null,
        }]),
      }),
    }));
  });

  it('promotes the same record on the third raise', async () => {
    prisma.employee.findFirst.mockResolvedValue({ id: 'manager', departmentId: 'department' });
    prisma.alert.findFirst.mockResolvedValue({
      id: 'alert', organizationId: 'org', againstUserId: 'direct',
      raiseCount: 2, isAbnormality: false, title: 'Inspection',
    });
    jest.spyOn(service as any, 'isSuperior').mockResolvedValue(true);
    const tx: any = {
      alert: {
        update: jest.fn()
          .mockResolvedValueOnce({ raiseCount: 3, isAbnormality: false })
          .mockResolvedValueOnce({ raiseCount: 3, isAbnormality: true }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'alert', title: 'Inspection', againstUserId: 'direct',
          raiseCount: 3, isAbnormality: true, occurrences: [],
        }),
      },
      alertOccurrence: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma.$transaction = jest.fn((work) => work(tx));
    const result = await service.raiseAlertAgain(user, 'alert');
    expect(tx.alert.update).toHaveBeenCalledWith({
      where: { id: 'alert' }, data: { raiseCount: { increment: 1 } },
    });
    expect(tx.alert.update).toHaveBeenCalledWith({
      where: { id: 'alert' }, data: { isAbnormality: true },
    });
    expect(tx.alertOccurrence.create).toHaveBeenCalledWith({
      data: { alertId: 'alert', raisedById: 'manager' },
    });
    expect(result.alert.isAbnormality).toBe(true);
  });

  it('requires the responsible employee and a note to acknowledge', async () => {
    prisma.alert.findFirst.mockResolvedValue({ againstUserId: 'owner' });
    await expect(service.acknowledgeAlertOccurrence(user, 'alert', 'occurrence', { note: 'Read' }))
      .rejects.toThrow('Only the responsible person');
    expect(prisma.alertOccurrence.updateMany).not.toHaveBeenCalled();
    await expect(service.acknowledgeAlertOccurrence(user, 'alert', 'occurrence', { note: '   ' }))
      .rejects.toThrow('Acknowledgment note is required');
  });

  it('acknowledges each occurrence at most once', async () => {
    prisma.employee.findFirst.mockResolvedValue({ id: 'owner' });
    prisma.alert.findFirst.mockResolvedValue({ againstUserId: 'owner' });
    prisma.alertOccurrence.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    await expect(service.acknowledgeAlertOccurrence(user, 'alert', 'occurrence', { note: 'I will review' }))
      .resolves.toEqual({ message: 'Alert acknowledged' });
    await expect(service.acknowledgeAlertOccurrence(user, 'alert', 'occurrence', { note: 'Again' }))
      .rejects.toThrow('already acknowledged');
  });

  it('counts every alert occurrence raised against the current employee', async () => {
    prisma.alertOccurrence.count.mockResolvedValue(3);

    await expect(service.getMyAlertCount(user)).resolves.toEqual({ count: 3 });
    expect(prisma.alertOccurrence.count).toHaveBeenCalledWith({
      where: { alert: { organizationId: 'org', againstUserId: 'manager' } },
    });
  });

  describe('employee work overview', () => {
    const management = { ...user, roleLevel: 'MANAGEMENT' };
    beforeEach(() => {
      prisma.employee.findFirst.mockResolvedValue({
        id: 'manager',
        firstName: 'Kareena',
        lastName: 'Kapoor',
        department: null,
        reportingManager: {
          id: 'reporting-manager',
          firstName: 'Rodgers',
          lastName: 'Munene',
        },
      });
      prisma.task = {
      count: jest.fn().mockResolvedValue(0),
        findMany: jest
          .fn()
          .mockResolvedValue([
            ...Array.from({ length: 21 }, (_, i) => ({
              id: `routine-${i}`,
              activityId: `good-${i}`,
              title: `Good practice ${i}`,
              description: 'Daily safety',
              frequency: 'DAILY',
              assignedById: null,
              activity: {
                id: `good-${i}`,
                scope: 'ORGANISATION',
                code: `GOOD-${i}`,
              },
            })),
            ...Array.from({ length: 21 }, (_, i) => ({
              id: `job-${i}`,
              activityId: `job-activity-${i}`,
              title: `Job responsibility ${i}`,
              description: 'Maintenance',
              frequency: 'DAILY',
              assignedById: null,
              activity: {
                id: `job-activity-${i}`,
                scope: 'JOB_TITLE',
                code: `JOB-${i}`,
              },
            })),
          ]),
      };
      prisma.taskInstance = {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      };
      jest
        .spyOn(service as any, 'listEmployeeRoleActivities')
        .mockResolvedValue({ count: 0, activities: [] });
    });

    it('splits categories before pagination while retaining legacy combined results', async () => {
      const routine = await service.getEmployeeDwmsProfile(
        management,
        'manager',
        { routineCategory: 'GOOD_PRACTICE', routinePage: 2 },
      );
      expect(routine.counts).toMatchObject({
        routineWork: 42,
        goodPractices: 21,
        jobResponsibilities: 21,
      });
      expect(routine.pagination.routineWork).toMatchObject({
        totalItems: 21,
        totalPages: 2,
        page: 2,
      });
      expect(routine.routineWork.map((item) => item.taskId)).toEqual([
        'routine-20',
      ]);
      const jobs = await service.getEmployeeDwmsProfile(management, 'manager', {
        routineCategory: 'JOB_RESPONSIBILITY',
      });
      expect(jobs.routineWork).toHaveLength(20);
      expect(
        jobs.routineWork.every(
          (item) => item.taskCategory === 'JOB_RESPONSIBILITY',
        ),
      ).toBe(true);
      const combined = await service.getEmployeeDwmsProfile(
        management,
        'manager',
      );
      expect(combined.pagination.routineWork.totalItems).toBe(42);
    });

    it('searches all allocations before pagination and scopes alert searches to the employee', async () => {
      const result = await service.getEmployeeDwmsProfile(
        management,
        'manager',
        { routineCategory: 'JOB_RESPONSIBILITY', search: 'job-20' },
      );
      expect(result.routineWork.map((item) => item.taskId)).toEqual(['job-20']);
      expect(result.pagination.routineWork.totalItems).toBe(1);
      expect(prisma.alert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org',
            againstUserId: 'manager',
            OR: [
              { title: { contains: 'job-20', mode: 'insensitive' } },
              { description: { contains: 'job-20', mode: 'insensitive' } },
            ],
          }),
        }),
      );
      await expect(
        service.getEmployeeDwmsProfile(management, 'manager', {
          routineCategory: 'INVALID',
        }),
      ).rejects.toThrow('Invalid routine category');
    });

    it('uses twenty items per page without loading the removed attention section', async () => {
      const result = await service.getEmployeeDwmsProfile(management, 'manager', {
        assignedPage: 2, currentAlertPage: 2, abnormalityPage: 2,
      });
      expect(result).not.toHaveProperty('attention');
      expect(result.pagination.assignedTasks.pageSize).toBe(20);
      expect(result.pagination.currentAlerts.pageSize).toBe(20);
      expect(result.pagination.abnormalities.pageSize).toBe(20);
      expect(prisma.taskInstance.findMany).not.toHaveBeenCalled();
      expect(prisma.task.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ assignedById: { not: null } }), skip: 20, take: 20 }));
      expect(prisma.alert.findMany).toHaveBeenCalledTimes(2);
      for (const [query] of prisma.alert.findMany.mock.calls) {
        expect(query).toMatchObject({ skip: 20, take: 20 });
      }
    });

    it('lists each assigned task once independently of its instances or completion status', async () => {
      prisma.task.findMany.mockImplementation(({ where }) => Promise.resolve(typeof where.assignedById === 'object' && where.assignedById !== null ? [{ id: 'assigned-task', title: 'Weekly inspection', frequency: 'WEEKLY', assignedById: 'manager' }] : []));
      prisma.task.count.mockResolvedValue(1);
      const result = await service.getEmployeeDwmsProfile(management, 'manager');
      expect(result.assignedTasks).toEqual([expect.objectContaining({ taskId: 'assigned-task', frequency: 'WEEKLY' })]);
      expect(result.assignedTasks[0]).not.toHaveProperty('instanceId');
      expect(result.counts.assignedTasks).toBe(1);
      expect(prisma.taskInstance.findMany).not.toHaveBeenCalled();
      expect(prisma.task.count).toHaveBeenCalledWith({ where: { ownerId: 'manager', assignedById: { not: null } } });
    });

    it('enforces profile access before loading work', async () => {
      await expect(
        service.getEmployeeDwmsProfile(user, 'manager'),
      ).rejects.toThrow('not authorized');
      expect(prisma.task.findMany).not.toHaveBeenCalled();
    });
  });

  it('lists allocated routine tasks once instead of scheduled instances', async () => {
    prisma.employee.findFirst.mockResolvedValue({
      id: 'manager',
      firstName: 'Manager',
      lastName: 'Employee',
      department: null,
    });
    prisma.task = {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'routine-task',
          activityId: 'activity',
          title: 'Daily Safe Start Check',
          description: null,
          frequency: 'DAILY',
          assignedById: null,
          activity: {
            id: 'activity',
            name: 'Daily Safe Start Check',
            code: 'GP-001',
            scope: 'ORGANISATION',
          },
        },
        {
          id: 'duplicate-routine-task',
          title: 'Daily Safe Start Check',
          description: null,
          frequency: 'DAILY',
          assignedById: null,
          activityId: 'activity',
          activity: {
            id: 'activity',
            name: 'Daily Safe Start Check',
            code: 'GP-001',
            scope: 'ORGANISATION',
          },
        },
      ]),
    };
    prisma.taskInstance = {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    };
    prisma.alert.findMany.mockResolvedValue([]);
    prisma.alert.count.mockResolvedValue(0);
    jest.spyOn(service as any, 'listEmployeeRoleActivities').mockResolvedValue({
      count: 0,
      activities: [],
    });

    const result = await service.getEmployeeDwmsProfile(
      { ...user, roleLevel: 'MANAGEMENT' },
      'manager',
    );

    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ownerId: 'manager',
          isActive: true,
          assignedById: null,
        }),
      }),
    );
    expect(result.counts.routineWork).toBe(1);
    expect(result.routineWork).toEqual([
      expect.objectContaining({
        taskId: 'routine-task',
        taskCategory: 'GOOD_PRACTICE',
      }),
    ]);
    expect(result.routineWork[0]).not.toHaveProperty('instanceId');
  });
});
