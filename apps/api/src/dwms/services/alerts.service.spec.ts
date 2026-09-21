import { DwmsService } from '../dwms.service';

describe('DWMS alert histories', () => {
  const user = { userId: 'user', organizationId: 'org', roleLevel: 'OPERATOR' };
  let prisma: any;
  let notifications: any;
  let service: DwmsService;

  beforeEach(() => {
    prisma = {
      employee: { findFirst: jest.fn().mockResolvedValue({ id: 'manager', departmentId: 'department' }) },
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
      { id: 'direct' }, { id: 'indirect' },
    ]);
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
});
