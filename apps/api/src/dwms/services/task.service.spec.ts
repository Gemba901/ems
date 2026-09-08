import {
  BadRequestException,
  ForbiddenException,
  ValidationPipe,
} from '@nestjs/common';
import { TaskFrequency } from 'db';
import { CreateAssignedTaskDto } from '../dto/dwms.dto';
import { DwmsTaskService } from './task.service';

class TestTaskService extends DwmsTaskService {
  constructor(prisma: any, notifications: any) {
    super(prisma, notifications);
  }
  listReportees = jest
    .fn()
    .mockResolvedValue({ users: [{ id: 'owner' }, { id: 'backup' }] });
  listOverdueAlertCandidates = jest
    .fn()
    .mockResolvedValue({ users: [{ id: 'approver' }] });
  listApproverCandidates = jest
    .fn()
    .mockResolvedValue({ users: [{ id: 'approver' }] });
}

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

  it('allows authorized system generation without applying the importing user reportee scope', async () => {
    service.listReportees.mockResolvedValue({ users: [] });
    const result = await service.createAssignedTask(user, dto, {
      systemGenerated: true,
      notifyAssignee: false,
    });
    expect(result.task.assignedById).toBeNull();
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('persists selected overdue recipients', async () => {
    const result = await service.createAssignedTask(user, {
      ...dto,
      overdueAlertToEmployeeIds: ['approver'],
    });
    expect(result.task.overdueAlertToEmployeeIds).toEqual(['approver']);
  });

  it.each(['foreign', 'owner'])(
    'rejects ineligible overdue recipients (%s)',
    async (id) => {
      await expect(
        service.createAssignedTask(user, {
          ...dto,
          overdueAlertToEmployeeIds: [id],
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.task.create).not.toHaveBeenCalled();
    },
  );

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
        findFirst: jest
          .fn()
          .mockResolvedValue({
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
    jest
      .spyOn(service as any, 'closeDelayAlertsForCompletedInstance')
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
