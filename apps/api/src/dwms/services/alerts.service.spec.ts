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
