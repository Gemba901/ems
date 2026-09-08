import { DwmsService } from '../dwms.service';

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
        alert: { findMany: jest.fn().mockResolvedValue([]) },
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
            organizationId: 'org',
            OR: expect.arrayContaining([
              { recipientEmployeeIds: { has: 'recipient' } },
            ]),
          }),
        }),
      );
    },
  );
});
