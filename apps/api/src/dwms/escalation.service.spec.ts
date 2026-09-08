import { DwmsEscalationService } from './escalation.service';

describe('DWMS overdue recipient delivery', () => {
  let prisma: any;
  let notifications: any;
  let service: DwmsEscalationService;
  const owner = {
    id: 'owner',
    firstName: 'Task',
    lastName: 'Owner',
    reportingManagerId: 'manager',
  };
  const task = {
    id: 'task',
    title: 'Inspection',
    ownerId: 'owner',
    owner,
    assignedById: 'assigner',
    overdueAlertToEmployeeIds: ['selected', 'selected', 'foreign'],
  };

  beforeEach(() => {
    prisma = {
      dwmsPermissionConfig: {
        findMany: jest.fn().mockResolvedValue([
          {
            organizationId: 'org',
            escalateUnacknowledgedMins: 60,
            escalationContactRules: ['ASSIGNER'],
          },
        ]),
      },
      task: {
        findMany: jest.fn().mockResolvedValueOnce([task]).mockResolvedValue([]),
      },
      taskInstance: { findMany: jest.fn().mockResolvedValue([]) },
      employee: {
        findMany: jest
          .fn()
          .mockImplementation(({ where }) =>
            Promise.resolve(
              [...new Set<string>(where.id.in)]
                .filter(
                  (id) => id !== 'foreign' && where.organizationId === 'org',
                )
                .map((id) => ({ id })),
            ),
          ),
      },
      alert: {
        count: jest.fn().mockResolvedValue(1),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'alert' }),
      },
    };
    notifications = { create: jest.fn().mockResolvedValue({}) };
    service = new DwmsEscalationService(prisma, notifications);
  });

  it('delivers once to selected recipients and excludes employees outside the organization', async () => {
    await (service as any).raiseTaskAlert({
      organizationId: 'org',
      config: {},
      task,
      reason: 'overdue',
    });
    expect(notifications.create).toHaveBeenCalledTimes(2);
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: 'selected' }),
    );
    expect(prisma.alert.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recipientEmployeeIds: ['owner', 'selected'],
        }),
      }),
    );
  });

  it('preserves owner-only defaults without notifying the activity importer', async () => {
    await (service as any).raiseTaskAlert({
      organizationId: 'org',
      config: {},
      task: { ...task, overdueAlertToEmployeeIds: [] },
      reason: 'overdue',
    });
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: 'owner' }),
    );
    expect(notifications.create).toHaveBeenCalledTimes(1);
  });

  it('uses selections for recurring task instances', async () => {
    prisma.task.findMany.mockReset().mockResolvedValue([]);
    prisma.taskInstance.findMany.mockResolvedValue([
      { id: 'instance', ownerId: 'owner', owner, task },
    ]);
    await (service as any).raiseInstanceAlert({
      organizationId: 'org',
      config: {},
      instance: {
        id: 'instance',
        taskId: 'task',
        ownerId: 'owner',
        owner,
        task,
        dueAt: new Date(),
        scheduledFor: new Date(),
      },
    });
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: 'selected' }),
    );
    expect(prisma.alert.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          taskInstanceId: 'instance',
          recipientEmployeeIds: ['owner', 'selected'],
        }),
      }),
    );
  });

  it('does not notify again for an existing alert', async () => {
    prisma.alert.findFirst.mockResolvedValue({ id: 'existing' });
    await (service as any).raiseTaskAlert({
      organizationId: 'org',
      config: {},
      task,
      reason: 'overdue',
    });
    expect(prisma.alert.create).not.toHaveBeenCalled();
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('keeps selected recipients able to open repeated-overdue abnormalities', async () => {
    prisma.alert.count.mockResolvedValue(3);
    await (service as any).raiseInstanceAlert({
      organizationId: 'org', config: {},
      instance: { id: 'instance', taskId: 'task', ownerId: 'owner', owner, task, dueAt: new Date(), scheduledFor: new Date() },
    });
    expect(prisma.alert.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ isAbnormality: true, recipientEmployeeIds: ['owner', 'selected'] }),
    }));
  });
});
