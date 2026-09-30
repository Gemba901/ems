import {
  ActivityScope,
  ActivityStatus,
  EmployeeActivityStatus,
  EmploymentStatus,
  TaskFrequency,
  TaskStatus,
} from 'db';
import { ForbiddenException } from '@nestjs/common';
import { DwmsService } from '../dwms.service';

describe('DWMS employee activity management', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  const viewer = { id: 'viewer-employee' };
  const employee = {
    id: 'employee-1',
    firstName: 'Asha',
    lastName: 'Patel',
    employeeCode: 'EMP-001',
    jobTitle: 'Shift Supervisor',
    departmentId: 'department-1',
    employmentStatus: EmploymentStatus.ACTIVE,
    department: { id: 'department-1', name: 'Operations' },
  };
  const activity = {
    id: 'activity-1',
    organizationId: 'org-1',
    name: 'Daily line check',
    code: 'ACT-001',
    frequency: TaskFrequency.DAILY,
    status: ActivityStatus.ACTIVE,
    scope: ActivityScope.ORGANISATION,
    parentActivityId: null,
  };

  function createPrisma() {
    const prisma: any = {
      employee: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      activity: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      employeeActivityAssignment: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        upsert: jest.fn(),
        updateMany: jest.fn(),
      },
      task: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      taskInstance: { deleteMany: jest.fn() },
      organization: { findUnique: jest.fn() },
    };
    prisma.$transaction = jest.fn((callback) => callback(prisma));
    return prisma;
  }

  const user = (roleLevel = 'ADMIN') => ({
    userId: 'user-1',
    organizationId: 'org-1',
    roleLevel,
  });

  it.each(['SUPER_ADMIN', 'ADMIN', 'MANAGEMENT', 'HR', 'HOD'])(
    'searches active employees by tokenized name or job title for %s',
    async (roleLevel) => {
      const prisma = createPrisma();
      prisma.employee.findFirst.mockResolvedValue(viewer);
      prisma.employee.findMany.mockResolvedValue([employee]);
      prisma.employee.count.mockResolvedValue(1);
      const service = new DwmsService(prisma, { createMany: jest.fn() } as never);

      const result = await service.searchActivityEmployees(user(roleLevel), {
        search: 'Asha Supervisor',
        page: 2,
        limit: 15,
      });

      expect(result.data[0]).toMatchObject({
        id: 'employee-1',
        name: 'Asha Patel',
        jobTitle: 'Shift Supervisor',
      });
      expect(result.pagination).toEqual({
        page: 2,
        limit: 15,
        total: 1,
        pages: 1,
      });
      expect(prisma.employee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-1',
            employmentStatus: EmploymentStatus.ACTIVE,
            AND: expect.arrayContaining([
              expect.objectContaining({ OR: expect.any(Array) }),
            ]),
          }),
          skip: 15,
          take: 15,
        }),
      );
    },
  );

  it('rejects employee search for ordinary employees', async () => {
    const prisma = createPrisma();
    prisma.employee.findFirst.mockResolvedValue(viewer);
    const service = new DwmsService(prisma, { createMany: jest.fn() } as never);

    await expect(
      service.searchActivityEmployees(user('EMPLOYEE'), {
        page: 1,
        limit: 20,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('combines applicable activities with prior assignments without duplicates', async () => {
    const prisma = createPrisma();
    prisma.employee.findFirst
      .mockResolvedValueOnce(viewer)
      .mockResolvedValueOnce(employee);
    const priorActivity = {
      ...activity,
      id: 'activity-2',
      name: 'Former role check',
      code: 'ACT-002',
      status: ActivityStatus.ARCHIVED,
      scope: ActivityScope.JOB_TITLE,
      scopeJobTitle: 'former role',
    };
    prisma.activity.findMany.mockResolvedValue([activity]);
    prisma.employeeActivityAssignment.findMany.mockResolvedValue([
      {
        id: 'assignment-1',
        activityId: activity.id,
        status: EmployeeActivityStatus.ACTIVE,
        activity,
      },
      {
        id: 'assignment-2',
        activityId: priorActivity.id,
        status: EmployeeActivityStatus.INACTIVE,
        activity: priorActivity,
      },
    ]);
    const service = new DwmsService(prisma, { createMany: jest.fn() } as never);

    const result = await service.listEmployeeRoleActivities(
      user(),
      employee.id,
    );

    expect(result.count).toBe(2);
    expect(result.activities.map((item) => item.activity.id)).toEqual([
      activity.id,
      priorActivity.id,
    ]);
    expect(result.activities[1]).toMatchObject({
      status: EmployeeActivityStatus.INACTIVE,
      activity: { status: ActivityStatus.ARCHIVED },
    });
  });

  it('deactivates atomically and removes only untouched instances after today', async () => {
    jest
      .useFakeTimers()
      .setSystemTime(new Date('2026-09-24T08:00:00.000Z').getTime());
    const prisma = createPrisma();
    prisma.employee.findFirst
      .mockResolvedValueOnce(viewer)
      .mockResolvedValueOnce(employee);
    prisma.activity.findFirst.mockResolvedValue(activity);
    prisma.employeeActivityAssignment.findUnique
      .mockResolvedValueOnce({
        id: 'assignment-1',
        activityId: activity.id,
        status: EmployeeActivityStatus.ACTIVE,
      })
      .mockResolvedValueOnce({
        id: 'assignment-1',
        activityId: activity.id,
        status: EmployeeActivityStatus.INACTIVE,
      });
    prisma.organization.findUnique.mockResolvedValue({ timeZone: 'Asia/Kolkata' });
    prisma.task.findMany.mockResolvedValue([{ id: 'task-1' }]);
    prisma.taskInstance.deleteMany.mockResolvedValue({ count: 3 });
    const service = new DwmsService(prisma, { createMany: jest.fn() } as never);

    const result = await service.updateEmployeeActivityAssignment(
      user('HOD'),
      employee.id,
      activity.id,
      { status: EmployeeActivityStatus.INACTIVE },
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.task.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['task-1'] } },
      data: { isActive: false },
    });
    expect(prisma.taskInstance.deleteMany).toHaveBeenCalledWith({
      where: {
        taskId: { in: ['task-1'] },
        scheduledFor: { gte: new Date('2026-09-25T00:00:00.000Z') },
        status: TaskStatus.PENDING,
        completionPercent: 0,
      },
    });
    expect(result.removedFutureInstances).toBe(3);
  });

  it('reactivates a recurring task and regenerates eligible instances', async () => {
    const prisma = createPrisma();
    prisma.employee.findFirst
      .mockResolvedValueOnce(viewer)
      .mockResolvedValueOnce(employee);
    prisma.activity.findFirst.mockResolvedValue(activity);
    prisma.employeeActivityAssignment.findUnique.mockResolvedValue({
      id: 'assignment-1',
      status: EmployeeActivityStatus.INACTIVE,
    });
    prisma.employeeActivityAssignment.upsert.mockResolvedValue({
      id: 'assignment-1',
      activityId: activity.id,
      status: EmployeeActivityStatus.ACTIVE,
    });
    prisma.task.findFirst.mockResolvedValue({ id: 'task-1' });
    const service = new DwmsService(prisma, { createMany: jest.fn() } as never);
    const regenerate = jest
      .spyOn(service as any, 'generateUpcomingInstancesForTaskId')
      .mockResolvedValue(undefined);

    const result = await service.updateEmployeeActivityAssignment(
      user('MANAGEMENT'),
      employee.id,
      activity.id,
      { status: EmployeeActivityStatus.ACTIVE },
    );

    expect(prisma.task.update).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: { isActive: true },
    });
    expect(regenerate).toHaveBeenCalledWith('task-1', 'org-1');
    expect(result).toMatchObject({
      message: 'Employee activity activated',
      removedFutureInstances: 0,
    });
  });
});
