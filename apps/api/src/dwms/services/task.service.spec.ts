import {
  BadRequestException,
  ForbiddenException,
  ValidationPipe,
} from '@nestjs/common';
import { ActivityScope, TaskFrequency } from 'db';
import { CreateAssignedTaskDto } from '../dto/dwms.dto';
import { DwmsTaskService } from './task.service';

class TestTaskService extends DwmsTaskService {
  constructor(prisma: any, notifications: any) {
    super(prisma, notifications);
  }
  listReportees = jest
    .fn()
    .mockResolvedValue({ users: [{ id: 'owner' }, { id: 'backup' }] });
  listApproverCandidates = jest
    .fn()
    .mockResolvedValue({ users: [{ id: 'approver' }] });
}

describe('DWMS task category serialization', () => {
  const service = new TestTaskService({} as any, {} as any);
  const instance = {
    id: 'instance',
    status: 'PENDING',
    completionPercent: 0,
    scheduledFor: new Date('2026-09-23T00:00:00.000Z'),
    dueAt: new Date('2026-09-23T23:59:59.999Z'),
    completedAt: null,
    completionNote: null,
    completionAttachmentUrl: null,
    completionAttachmentName: null,
    createdAt: new Date('2026-09-23T00:00:00.000Z'),
    updatedAt: new Date('2026-09-23T00:00:00.000Z'),
    comments: [],
    events: [],
    alerts: [],
  };
  const task = {
    id: 'task',
    title: 'Task',
    description: null,
    frequency: TaskFrequency.DAILY,
    ownerId: 'owner',
    ownerName: 'Owner',
    owner: { email: 'owner@example.com', organization: { timeZone: 'UTC' } },
    assignedById: null,
    approvedById: null,
    completionNote: null,
    completionAttachmentUrl: null,
    completionAttachmentName: null,
    requiresCompletionDocument: false,
    completionDocumentName: null,
    createdAt: new Date('2026-09-23T00:00:00.000Z'),
    updatedAt: new Date('2026-09-23T00:00:00.000Z'),
    isAdhoc: false,
    acknowledgedAt: new Date('2026-09-23T00:00:00.000Z'),
    priority: 'MEDIUM',
    department: null,
  };

  it.each([
    [ActivityScope.ORGANISATION, 'GOOD_PRACTICE'],
    [ActivityScope.DEPARTMENT, 'GOOD_PRACTICE'],
    [ActivityScope.JOB_TITLE, 'JOB_RESPONSIBILITY'],
    [ActivityScope.EMPLOYEE, 'JOB_RESPONSIBILITY'],
  ])('maps %s activities to %s', (scope, expected) => {
    const result = service.serializeTaskInstance(
      { ...task, activity: { id: 'activity', scope } },
      instance,
    );
    expect(result.taskCategory).toBe(expected);
  });

  it('gives a manual assignment precedence over its linked activity', () => {
    const result = service.serializeTaskInstance(
      {
        ...task,
        assignedById: 'assigner',
        assignedByName: 'Assigner',
        assignedBy: { email: 'assigner@example.com' },
        activity: { id: 'activity', scope: ActivityScope.DEPARTMENT },
      },
      instance,
    );
    expect(result.taskCategory).toBe('ASSIGNED_TASK');
  });

  it('serializes immutable task content from the occurrence snapshot', () => {
    const result = service.serializeTaskInstance(
      {
        ...task,
        title: 'Updated shared title',
        description: 'Updated shared description',
        requiresCompletionDocument: true,
        completionDocumentName: 'Updated evidence',
        activity: { id: 'activity', scope: ActivityScope.ORGANISATION },
      },
      {
        ...instance,
        titleSnapshot: 'Original title',
        descriptionSnapshot: 'Original description',
        requiresDocumentSnapshot: false,
        documentNameSnapshot: null,
      },
    );

    expect(result).toMatchObject({
      title: 'Original title',
      description: 'Original description',
      requiresCompletionDocument: false,
      completionDocumentName: null,
    });
  });

  it('rejects a task that has neither an assigner nor an activity scope', () => {
    expect(() =>
      service.serializeTaskInstance(
        { ...task, activity: null },
        instance,
      ),
    ).toThrow('Task category cannot be determined');
  });
});

describe('DWMS task creation', () => {
  const user = { userId: 'user', organizationId: 'org', roleLevel: 'HOD' };
  const dto = {
    title: ' Inspect equipment ',
    assignedToId: 'owner',
    frequency: TaskFrequency.DAILY,
  };
  let prisma: any;
  let notifications: any;
  let service: TestTaskService;

  beforeEach(() => {
    prisma = {
      employee: {
        findFirst: jest.fn().mockImplementation(({ where }) => {
          if (where.userId)
            return { id: 'creator', firstName: 'Task', lastName: 'Creator' };
          if (
            ['owner', 'backup', 'approver'].includes(where.id) &&
            where.organizationId === 'org'
          ) {
            return { id: where.id, firstName: 'Task', lastName: 'Owner' };
          }
          return null;
        }),
      },
      task: {
        create: jest
          .fn()
          .mockImplementation(({ data }) => ({ id: 'task', ...data })),
      },
    };
    notifications = { create: jest.fn().mockResolvedValue({}) };
    service = new TestTaskService(prisma, notifications);
    jest
      .spyOn(service as any, 'getOrganizationTimeZone')
      .mockResolvedValue('UTC');
    jest
      .spyOn(service as any, 'assertDueDateIsOfficeOpen')
      .mockResolvedValue(undefined);
    jest
      .spyOn(service as any, 'generateInstancesForTask')
      .mockResolvedValue(undefined);
  });

  it('rejects malformed task-list and summary dates', async () => {
    await expect(
      service.getMyDwmsTasks(user, undefined, '2026-02-30'),
    ).rejects.toThrow('Invalid date');
    await expect(
      service.getMyDwmsTaskSummary(user, 'bad-date'),
    ).rejects.toThrow('Invalid date');
  });

  it.each([
    ['routine', { activityId: { not: null }, assignedById: null }],
    ['assigned', { assignedById: { not: null } }],
  ])('filters %s tasks and summary counts by activity and assigner', async (source, taskFilter) => {
    prisma.taskInstance = {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    };

    await service.getMyDwmsTasks(
      user, undefined, undefined, 'pending', '1', '20', source,
    );
    const expectedTaskFilter = source === 'routine'
      ? taskFilter
      : { ...taskFilter, acknowledgedAt: { not: null } };
    expect(prisma.taskInstance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          task: expectedTaskFilter,
        }),
      }),
    );
    expect(prisma.taskInstance.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        task: expectedTaskFilter,
      }),
    });

    prisma.taskInstance.count.mockClear();
    await service.getMyDwmsTaskSummary(user, undefined, source);
    expect(prisma.taskInstance.count).toHaveBeenCalledTimes(6);
    for (const [{ where }] of prisma.taskInstance.count.mock.calls) {
      expect(where.task).toEqual(expect.objectContaining(taskFilter));
    }
  });

  it('limits routine Pending instances and its count to the current day, week, or month', async () => {
    prisma.taskInstance = {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    };
    const currentPeriods = [
      { frequency: TaskFrequency.DAILY, scheduledFor: { gte: new Date('2026-09-19'), lt: new Date('2026-09-20') } },
      { frequency: TaskFrequency.WEEKLY, scheduledFor: { gte: new Date('2026-09-14'), lt: new Date('2026-09-21') } },
      { frequency: TaskFrequency.MONTHLY, scheduledFor: { gte: new Date('2026-09-01'), lt: new Date('2026-10-01') } },
    ];

    await service.getMyDwmsTasks(user, undefined, '2026-09-19', 'pending', '1', '20', 'routine');
    expect(prisma.taskInstance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: currentPeriods,
          task: { activityId: { not: null }, assignedById: null },
        }),
      }),
    );
    await service.getMyDwmsTaskSummary(user, '2026-09-19', 'routine');
    expect(prisma.taskInstance.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        OR: currentPeriods,
        task: { activityId: { not: null }, assignedById: null },
      }),
    });
  });

  it.each([
    ['not_acknowledged', { acknowledgedAt: null }],
    ['pending', { acknowledgedAt: { not: null } }],
  ])(
    'paginates the %s task subset at the database query',
    async (scope, acknowledgementFilter) => {
      prisma.taskInstance = {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      };

      const result = await service.getMyDwmsTasks(
        user,
        undefined,
        undefined,
        scope,
        '1',
        '20',
      );

      expect(prisma.taskInstance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            task: acknowledgementFilter,
          }),
          skip: 0,
          take: 20,
        }),
      );
      expect(prisma.taskInstance.count).toHaveBeenCalledWith({
        where: expect.objectContaining({ task: acknowledgementFilter }),
      });
      expect(result.pagination).toMatchObject({ total: 0, pages: 0 });
    },
  );

  it('allows authorized system generation without applying the importing user reportee scope', async () => {
    service.listReportees.mockResolvedValue({ users: [] });
    const result = await service.createAssignedTask(user, dto, {
      systemGenerated: true,
      notifyAssignee: false,
    });
    expect(result.task.assignedById).toBeNull();
    expect(result.task.assignedByName).toBeNull();
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('creates an authorized task with eligible approval and backup ownership', async () => {
    const result = await service.createAssignedTask(user, {
      ...dto,
      approvedById: 'approver',
      backupOwnerId: 'backup',
      frequency: TaskFrequency.DAILY,
    });
    expect(result.task).toMatchObject({
      title: 'Inspect equipment',
      ownerId: 'owner',
      assignedById: 'creator',
      approvedById: 'approver',
      backupOwnerId: 'backup',
    });
    expect(notifications.create).toHaveBeenCalledTimes(1);
  });

  it('rejects an assignee outside the organization before writing or notifying', async () => {
    await expect(
      service.createAssignedTask(user, { ...dto, assignedToId: 'foreign' }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.task.create).not.toHaveBeenCalled();
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('rejects an organization member outside the creator assignment scope', async () => {
    service.listReportees.mockResolvedValue({ users: [] });
    await expect(service.createAssignedTask(user, dto)).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it('rejects a forged approver', async () => {
    await expect(
      service.createAssignedTask(user, { ...dto, approvedById: 'owner' }),
    ).rejects.toThrow('eligible approver');
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it('rejects an approver outside the organization even if the directory returns it', async () => {
    service.listApproverCandidates.mockResolvedValue({
      users: [{ id: 'foreign' }],
    });
    await expect(
      service.createAssignedTask(user, { ...dto, approvedById: 'foreign' }),
    ).rejects.toThrow('current organization');
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it('rejects a backup owner outside the organization', async () => {
    await expect(
      service.createAssignedTask(user, {
        ...dto,
        frequency: TaskFrequency.WEEKLY,
        backupOwnerId: 'foreign',
      }),
    ).rejects.toThrow('current organization');
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it('rejects a backup owner outside the assignment scope', async () => {
    service.listReportees.mockResolvedValue({ users: [{ id: 'owner' }] });
    await expect(
      service.createAssignedTask(user, {
        ...dto,
        frequency: TaskFrequency.DAILY,
        backupOwnerId: 'backup',
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it.each(['', '   ', '\n\t'])('rejects blank titles (%j)', async (title) => {
    await expect(
      service.createAssignedTask(user, { ...dto, title }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it.each(['not-a-date', '2000-01-01'])(
    'rejects invalid or past due dates (%s)',
    async (dueDate) => {
      await expect(
        service.createAssignedTask(user, {
          ...dto,
          frequency: TaskFrequency.PLANNED,
          dueDate,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.task.create).not.toHaveBeenCalled();
    },
  );

  it('accepts today as a due date', async () => {
    await expect(
      service.createAssignedTask(user, {
        ...dto,
        frequency: TaskFrequency.PLANNED,
        dueDate: new Date().toISOString().slice(0, 10),
      }),
    ).resolves.toHaveProperty('task');
  });

  it.each(['2026-02-30', '2026-13-01', 'invalid'])(
    'rejects malformed dates at the API validation boundary (%s)',
    async (dueDate) => {
      const pipe = new ValidationPipe({ whitelist: true });
      await expect(
        pipe.transform(
          { ...dto, frequency: TaskFrequency.PLANNED, dueDate },
          { type: 'body', metatype: CreateAssignedTaskDto },
        ),
      ).rejects.toThrow(BadRequestException);
    },
  );

  it('strips activity linkage from manual task payloads at the API boundary', async () => {
    const pipe = new ValidationPipe({ whitelist: true });
    const payload = await pipe.transform(
      { ...dto, activityId: 'activity' },
      { type: 'body', metatype: CreateAssignedTaskDto },
    );

    expect(payload).not.toHaveProperty('activityId');
  });
});

describe('DWMS assigned task acknowledgement', () => {
  const user = {
    userId: 'owner-user',
    organizationId: 'org',
    roleLevel: 'OPERATOR',
  };

  it.each([TaskFrequency.PLANNED, TaskFrequency.DAILY])(
    'acknowledges the parent %s task without resolving an occurrence',
    async (frequency) => {
      const task = {
        id: 'task',
        title: 'Inspect equipment',
        ownerId: 'owner',
        assignedById: null,
        isAdhoc: true,
        frequency,
        status: 'PENDING',
        acknowledgedAt: null,
        updatedAt: new Date('2026-10-08T00:00:00.000Z'),
      };
      const prisma = {
        employee: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'owner',
            firstName: 'Task',
            lastName: 'Owner',
          }),
        },
        task: {
          findFirst: jest.fn().mockResolvedValue(task),
          update: jest.fn().mockResolvedValue({
            ...task,
            acknowledgedAt: new Date('2026-10-08T01:00:00.000Z'),
          }),
        },
        taskInstance: {
          findFirst: jest.fn(),
        },
      };
      const service = new TestTaskService(prisma, {
        create: jest.fn(),
      });

      const result = await service.acknowledgeAssignedTask(user, 'task');

      expect(prisma.task.findFirst).toHaveBeenCalledWith({
        where: { id: 'task', ownerId: 'owner', isAdhoc: true },
      });
      expect(prisma.task.update).toHaveBeenCalledWith({
        where: {
          id: 'task',
          status: 'PENDING',
          updatedAt: task.updatedAt,
        },
        data: { acknowledgedAt: expect.any(Date) },
      });
      expect(prisma.taskInstance.findFirst).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        message: 'Task acknowledged successfully',
        task: { id: 'task', acknowledgedAt: expect.any(Date) },
      });
    },
  );
});

describe('DWMS occurrence progress and approval', () => {
  const user = {
    userId: 'owner',
    organizationId: 'org',
    roleLevel: 'OPERATOR',
  };
  let service: TestTaskService;
  let prisma: any;
  let notifications: any;
  let instance: any;
  beforeEach(() => {
    instance = {
      id: 'instance',
      taskId: 'task',
      ownerId: 'owner',
      status: 'PENDING',
      updatedAt: new Date('2026-09-08T08:00:00Z'),
      dueAt: new Date('2099-09-08T20:00:00Z'),
      task: {
        id: 'task',
        title: 'Inspection',
        ownerId: 'owner',
        approvedById: 'approver',
        isAdhoc: true,
      },
    };
    prisma = {
      employee: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'owner',
          firstName: 'Task',
          lastName: 'Owner',
        }),
      },
      taskInstance: {
        findFirst: jest.fn().mockImplementation(async () => ({ ...instance })),
        update: jest
          .fn()
          .mockImplementation(async ({ data }) => ({ ...instance, ...data })),
      },
      taskInstanceComment: { create: jest.fn().mockResolvedValue({}) },
    };
    notifications = { create: jest.fn().mockResolvedValue({}) };
    service = new TestTaskService(prisma, notifications);
    jest
      .spyOn(service as any, 'assertParentActivitiesDoneBeforeStatusChange')
      .mockResolvedValue(undefined);
    jest
      .spyOn(service as any, 'recordTaskInstanceEvent')
      .mockResolvedValue(undefined);
  });

  it.each(['DONE', 'NOT_APPLICABLE', 'APPROVAL_PENDING'])(
    'locks %s occurrences',
    async (status) => {
      instance.status = status;
      await expect(
        service.updateAssignedTaskProgress(user, 'instance', {
          status: 'IN_PROGRESS',
        }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.completeAssignedTask(user, 'instance', {}),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.taskInstance.update).not.toHaveBeenCalled();
    },
  );

  it('allows progress beyond less than 50 percent and retains the requested percentage', async () => {
    instance.status = 'LESS_THAN_50';
    const result = await service.updateAssignedTaskProgress(user, 'instance', {
      status: 'PARTLY_DONE',
      completionPercent: 65,
    });
    expect(result.instance).toMatchObject({
      status: 'PARTLY_DONE',
      completionPercent: 65,
    });
  });

  it('keeps overdue completion subject to approval', async () => {
    instance.status = 'OVERDUE';
    instance.dueAt = new Date('2000-01-01T00:00:00Z');
    const result = await service.completeAssignedTask(user, 'instance', {});
    expect(result.instance).toMatchObject({
      status: 'APPROVAL_PENDING',
      completionPercent: 100,
    });
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ employeeId: 'approver' }),
    );
  });

  it('uses the occurrence snapshot when an old task did not require a document', async () => {
    instance.requiresDocumentSnapshot = false;
    instance.task.requiresCompletionDocument = true;

    await expect(
      service.completeAssignedTask(user, 'instance', {}),
    ).resolves.toMatchObject({ instance: { status: 'APPROVAL_PENDING' } });
  });

  it('requires a document when the occurrence snapshot requires one', async () => {
    instance.requiresDocumentSnapshot = true;
    instance.task.requiresCompletionDocument = false;

    await expect(
      service.completeAssignedTask(user, 'instance', {}),
    ).rejects.toThrow('Completion document is required');
    expect(prisma.taskInstance.update).not.toHaveBeenCalled();
  });

  it.each(['approveTask', 'rejectTask'] as const)(
    'rejects concurrent %s before comments or notifications',
    async (method) => {
      instance.status = 'APPROVAL_PENDING';
      prisma.taskInstance.update.mockRejectedValue({ code: 'P2025' });
      await expect(
        service[method](user, 'instance', { comment: 'Reviewed' }),
      ).rejects.toThrow('changed while you were editing');
      expect(prisma.taskInstance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'instance',
            status: 'APPROVAL_PENDING',
            updatedAt: instance.updatedAt,
          },
        }),
      );
      expect(prisma.taskInstanceComment.create).not.toHaveBeenCalled();
      expect(notifications.create).not.toHaveBeenCalled();
    },
  );

  it('rejects concurrent progress without emitting a history entry', async () => {
    prisma.taskInstance.update.mockRejectedValue({ code: 'P2025' });
    await expect(
      service.updateAssignedTaskProgress(user, 'instance', {
        status: 'IN_PROGRESS',
      }),
    ).rejects.toThrow('changed while you were editing');
    expect((service as any).recordTaskInstanceEvent).not.toHaveBeenCalled();
  });
});


describe('DWMS reporting-chain task access', () => {
  const user = { userId: 'manager-user', organizationId: 'org', roleLevel: 'EMPLOYEE' };
  const now = new Date('2026-10-13T00:00:00Z');
  let prisma: any;
  let service: TestTaskService;
  beforeEach(() => {
    prisma = {
      employee: {
        findFirst: jest.fn().mockResolvedValue({ id: 'manager' }),
        findUnique: jest.fn().mockImplementation(({ where }) => Promise.resolve(where.id === 'owner' ? { reportingManagerId: 'direct' } : where.id === 'direct' ? { reportingManagerId: 'manager' } : null)),
        findMany: jest.fn().mockImplementation(({ where }) => Promise.resolve(where.reportingManagerId.in.includes('manager') ? [{ id: 'direct' }] : where.reportingManagerId.in.includes('direct') ? [{ id: 'owner' }] : [])),
      },
      taskInstance: {
        findFirst: jest.fn().mockResolvedValue({ id: 'instance', ownerId: 'owner', status: 'PENDING', frequency: 'DAILY', scheduledFor: now, dueAt: now, comments: [], events: [], alerts: [], task: { ownerId: 'owner', assignedById: null, approvedById: null } }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      taskInstanceComment: { create: jest.fn().mockResolvedValue({ id: 'comment', comment: 'Review this', createdAt: now, updatedAt: now, author: { id: 'manager', firstName: 'Higher', lastName: 'Manager' } }) },
      taskInstanceEvent: { create: jest.fn() },
    };
    service = new TestTaskService(prisma, {});
    jest.spyOn(service, 'serializeTaskInstance').mockReturnValue({ description: 'Full details' } as any);
    jest.spyOn(service as any, 'getOrganizationTimeZone').mockResolvedValue('UTC');
  });

  it('loads paginated task history with status and date filters without generating instances', async () => {
    prisma.task = { findFirst: jest.fn().mockResolvedValue({ id: 'task', title: 'Safety check', ownerId: 'owner', owner: { id: 'owner', firstName: 'Task', lastName: 'Owner' }, frequency: 'DAILY', isActive: true }) };
    prisma.taskInstance.count = jest.fn().mockResolvedValue(21);
    prisma.taskInstance.findMany.mockResolvedValue([{ id: 'occurrence', titleSnapshot: 'Safety check', scheduledFor: now, dueAt: now, status: 'DONE', completionPercent: 100, completedAt: now }]);
    const result = await service.getTaskDefinitionDetail(user, 'task', '2', 'DONE', '2026-10-13');
    expect(result).toMatchObject({ task: { taskId: 'task', frequency: 'DAILY' }, instances: [{ instanceId: 'occurrence', status: 'DONE', isOverdue: false }], pagination: { page: 2, limit: 20, total: 21, pages: 2 } });
    expect(prisma.task.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'task', owner: { organizationId: 'org' } } }));
    expect(prisma.taskInstance.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { taskId: 'task', status: 'DONE', scheduledFor: { gte: now, lte: new Date('2026-10-13T23:59:59.999Z') } }, skip: 20, take: 20 }));
    await expect(service.getTaskDefinitionDetail(user, 'task', '1', 'INVALID')).rejects.toThrow('Invalid task status');
    await expect(service.getTaskDefinitionDetail(user, 'task', '1', undefined, 'invalid')).rejects.toThrow('Invalid instance date');
  });

  it('denies task history to unrelated employees before loading instances', async () => {
    prisma.task = { findFirst: jest.fn().mockResolvedValue({ id: 'task', ownerId: 'owner' }) };
    prisma.employee.findUnique.mockResolvedValue(null);
    await expect(service.getTaskDefinitionDetail(user, 'task')).rejects.toThrow('Task not found');
    expect(prisma.taskInstance.findMany).not.toHaveBeenCalled();
  });

  it.each(['MANAGEMENT', 'HR', 'ADMIN'])('allows %s task history within the organization', async (roleLevel) => {
    prisma.task = { findFirst: jest.fn().mockResolvedValue({ id: 'task', ownerId: 'owner', title: 'Safety', owner: { id: 'owner', firstName: 'Task', lastName: 'Owner' } }) };
    prisma.employee.findUnique.mockResolvedValue(null);
    prisma.taskInstance.count = jest.fn().mockResolvedValue(0);
    await expect(service.getTaskDefinitionDetail({ ...user, roleLevel }, 'task')).resolves.toMatchObject({ instances: [], pagination: { total: 0, pages: 1 } });
    prisma.task.findFirst.mockResolvedValue(null);
    await expect(service.getTaskDefinitionDetail({ ...user, roleLevel }, 'other-org-task')).rejects.toThrow('Task not found');
  });

  it('gives the manager of a manager full task details and comment access', async () => {
    await expect(service.getMyDwmsTaskInstanceDetail(user, 'instance')).resolves.toMatchObject({ access: 'full', task: { description: 'Full details' } });
    await expect(service.addMyDwmsTaskComment(user, 'instance', { comment: 'Review this' })).resolves.toMatchObject({ message: 'Comment added' });
    expect(prisma.taskInstance.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({ task: { owner: { organizationId: 'org' } }, OR: expect.arrayContaining([{ ownerId: { in: ['direct', 'owner'] } }]) }) }));
    for (const [query] of prisma.employee.findUnique.mock.calls) expect(query.where.organizationId).toBe('org');
    for (const [query] of prisma.employee.findMany.mock.calls) expect(query.where.organizationId).toBe('org');
  });

  it('keeps unrelated employees on restricted details and rejects their comments', async () => {
    prisma.employee.findUnique.mockResolvedValue(null);
    prisma.employee.findMany.mockResolvedValue([]);
    await expect(service.getMyDwmsTaskInstanceDetail(user, 'instance')).resolves.toMatchObject({ access: 'relation', task: { description: null } });
    prisma.taskInstance.findFirst.mockResolvedValue(null);
    await expect(service.addMyDwmsTaskComment(user, 'instance', { comment: 'Review this' })).rejects.toThrow('Task instance not found');
    expect(prisma.taskInstanceComment.create).not.toHaveBeenCalled();
  });

  it.each(['MANAGEMENT', 'HR', 'ADMIN', 'SUPER_ADMIN'])('allows %s full task details and comments without a reporting relationship', async (roleLevel) => {
    prisma.employee.findUnique.mockResolvedValue(null);
    prisma.employee.findMany.mockResolvedValue([]);
    await expect(service.getMyDwmsTaskInstanceDetail({ ...user, roleLevel }, 'instance')).resolves.toMatchObject({ access: 'full', task: { description: 'Full details' } });
    await expect(service.addMyDwmsTaskComment({ ...user, roleLevel }, 'instance', { comment: 'Review this' })).resolves.toMatchObject({ message: 'Comment added' });
    expect(prisma.taskInstance.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({ where: { id: 'instance', task: { owner: { organizationId: 'org' } } } }));
    prisma.taskInstance.findFirst.mockResolvedValue(null);
    await expect(service.getMyDwmsTaskInstanceDetail({ ...user, roleLevel }, 'other-org-instance')).rejects.toThrow('Task instance not found');
  });
});
