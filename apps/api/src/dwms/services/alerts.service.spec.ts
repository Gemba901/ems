import { DwmsService } from '../dwms.service';
import { AlertStatus, Severity } from 'db';

describe('DWMS selected recipient visibility', () => {
  it.each(['OPERATOR', 'HOD'])(
    'includes addressed alerts for %s while keeping organization scope',
    async (roleLevel) => {
      const prisma: any = {
        employee: {
          findFirst: jest.fn().mockResolvedValue({ id: 'recipient' }),
          findMany: jest.fn().mockResolvedValue([]),
        },
        dwmsPermissionConfig: {
          findUnique: jest.fn().mockResolvedValue({ alertViewLevel: 'OWN' }),
        },
        alert: {
          findMany: jest.fn().mockResolvedValue([]),
          count: jest.fn().mockResolvedValue(0),
        },
      };
      const service = new DwmsService(prisma, {} as any);
      await service.getAlerts({
        userId: 'user',
        organizationId: 'org',
        roleLevel,
      });
      expect(prisma.alert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              expect.objectContaining({
                organizationId: 'org',
                OR: expect.arrayContaining([
                  { recipientEmployeeIds: { has: 'recipient' } },
                ]),
              }),
            ]),
          }),
          skip: 0,
          take: 20,
        }),
      );
    },
  );

  it('applies tab filters before pagination and returns the filtered total', async () => {
    const prisma: any = {
      employee: {
        findFirst: jest.fn().mockResolvedValue({ id: 'recipient' }),
      },
      dwmsPermissionConfig: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ alertViewLevel: 'ORGANIZATION' }),
      },
      alert: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(45),
      },
    };
    const service = new DwmsService(prisma, {} as any);

    const result = await service.getAlerts(
      { userId: 'user', organizationId: 'org', roleLevel: 'MANAGEMENT' },
      'ABNORMALITIES',
      '2',
      '20',
      'OPEN',
      'HIGH',
      'pump',
    );

    expect(prisma.alert.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            { isAbnormality: true },
            { status: 'OPEN' },
            { severity: 'HIGH' },
          ]),
        }),
        skip: 20,
        take: 20,
      }),
    );
    expect(result.pagination).toEqual({
      page: 2,
      limit: 20,
      total: 45,
      pages: 3,
    });
  });
});

describe('DWMS alert action safeguards', () => {
  const user = { userId: 'user', organizationId: 'org', roleLevel: 'OPERATOR' };
  let prisma: any;
  let service: DwmsService;

  beforeEach(() => {
    prisma = {
      employee: {
        findFirst: jest.fn().mockResolvedValue({ id: 'employee', departmentId: 'department' }),
      },
      alert: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'alert',
          organizationId: 'org',
          raisedById: 'raiser',
          againstUserId: 'owner',
          taskInstanceId: 'instance',
          status: AlertStatus.OPEN,
        }),
        create: jest.fn(),
        update: jest.fn(),
      },
      taskInstance: { findUnique: jest.fn() },
      notification: { findFirst: jest.fn() },
    };
    service = new DwmsService(prisma, { create: jest.fn() } as any);
  });

  it('rejects unrelated target fields during alert creation', async () => {
    prisma.employee.findFirst.mockResolvedValue({ id: 'employee', departmentId: 'department' });
    prisma.employee.findUnique = jest.fn().mockResolvedValue({ id: 'owner' });
    await expect(service.createAlert(user, {
      title: 'Issue',
      description: 'Details',
      severity: Severity.HIGH,
      targetType: 'GENERAL',
      againstUserId: 'owner',
    })).rejects.toThrow('Alert target fields must match targetType');
    expect(prisma.alert.create).not.toHaveBeenCalled();
  });

  it('rejects blank corrective action before changing the alert', async () => {
    await expect(service.logCorrectiveAction(user, 'alert', '   ')).rejects.toThrow('Corrective action is required');
    expect(prisma.alert.update).not.toHaveBeenCalled();
  });

  it.each([
    ['remind', () => service.remindAlertOwner(user, 'alert')],
    ['reassign', () => service.reassignEscalatedTask(user, 'alert', 'new-owner')],
    ['escalate', () => service.escalateAlertFurther(user, 'alert')],
  ])('denies an unrelated employee the ability to %s an alert', async (_action, invoke) => {
    await expect(invoke()).rejects.toThrow('not authorized');
    expect(prisma.alert.update).not.toHaveBeenCalled();
    expect(prisma.taskInstance.findUnique).not.toHaveBeenCalled();
  });
});
