import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { SteelService } from './steel.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { QuerySteelPlansDto } from './dto/steel.dto';

interface PrismaMock {
  steelProductionPlan: {
    findMany: jest.Mock;
    count: jest.Mock;
  };
  $transaction: jest.Mock;
}

// Minimal Prisma mock — only what getAll touches. `$transaction` supports
// the array form used by getAll.
function createPrismaMock(): PrismaMock {
  const prisma = {
    steelProductionPlan: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
  } as PrismaMock;
  prisma.$transaction = jest.fn(async (arg: unknown) => {
    if (typeof arg === 'function')
      return (arg as (tx: unknown) => unknown)(prisma);
    return Promise.all(arg as Promise<unknown>[]);
  });
  return prisma;
}

const ORG_ID = 'org-1';

function baseQuery(overrides: Partial<QuerySteelPlansDto> = {}): QuerySteelPlansDto {
  return {
    sortBy: 'createdAt',
    sortOrder: 'desc',
    page: 1,
    limit: 10,
    ...overrides,
  } as QuerySteelPlansDto;
}

describe('SteelService.getAll — date-range filtering', () => {
  let service: SteelService;
  let prisma: ReturnType<typeof createPrismaMock>;

  beforeEach(async () => {
    prisma = createPrismaMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [SteelService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<SteelService>(SteelService);
  });

  it('applies no plannedStartDate filter when no date params are given (backward compatible)', async () => {
    await service.getAll(ORG_ID, baseQuery());
    const where = prisma.steelProductionPlan.findMany.mock.calls[0][0].where;
    expect(where.plannedStartDate).toBeUndefined();
  });

  it('filters by fromDate only (gte)', async () => {
    await service.getAll(ORG_ID, baseQuery({ fromDate: '2026-01-01' }));
    const where = prisma.steelProductionPlan.findMany.mock.calls[0][0].where;
    expect(where.plannedStartDate.gte).toEqual(new Date('2026-01-01'));
    expect(where.plannedStartDate.lte).toBeUndefined();
  });

  it('filters by toDate only (lte, inclusive end of day)', async () => {
    await service.getAll(ORG_ID, baseQuery({ toDate: '2026-01-31' }));
    const where = prisma.steelProductionPlan.findMany.mock.calls[0][0].where;
    const expectedEnd = new Date('2026-01-31');
    expectedEnd.setHours(23, 59, 59, 999);
    expect(where.plannedStartDate.lte).toEqual(expectedEnd);
    expect(where.plannedStartDate.gte).toBeUndefined();
  });

  it('combines fromDate and toDate into a single range', async () => {
    await service.getAll(ORG_ID, baseQuery({ fromDate: '2026-01-01', toDate: '2026-01-31' }));
    const where = prisma.steelProductionPlan.findMany.mock.calls[0][0].where;
    expect(where.plannedStartDate.gte).toEqual(new Date('2026-01-01'));
    expect(where.plannedStartDate.lte.getDate()).toBe(31);
  });

  it('combines scheduledOnly with a date range without overwriting either clause', async () => {
    await service.getAll(ORG_ID, baseQuery({ scheduledOnly: true, fromDate: '2026-01-01' }));
    const where = prisma.steelProductionPlan.findMany.mock.calls[0][0].where;
    expect(where.plannedStartDate.not).toBeNull();
    expect(where.plannedStartDate.gte).toEqual(new Date('2026-01-01'));
  });

  it('rejects fromDate after toDate without querying the database', async () => {
    await expect(
      service.getAll(ORG_ID, baseQuery({ fromDate: '2026-02-01', toDate: '2026-01-01' })),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.steelProductionPlan.findMany).not.toHaveBeenCalled();
  });

  it('accepts fromDate equal to toDate (single-day range)', async () => {
    await expect(
      service.getAll(ORG_ID, baseQuery({ fromDate: '2026-01-15', toDate: '2026-01-15' })),
    ).resolves.toBeDefined();
  });

  it('leaves stage/status/search/scheduledOnly/sort behavior untouched when no dates are given', async () => {
    await service.getAll(
      ORG_ID,
      baseQuery({ stage: 'A10_PLAN_DRAFTED', status: 'IN_PROGRESS', search: 'ACME' }),
    );
    const call = prisma.steelProductionPlan.findMany.mock.calls[0][0];
    expect(call.where.stage).toBe('A10_PLAN_DRAFTED');
    expect(call.where.status).toBe('IN_PROGRESS');
    expect(call.where.OR).toBeDefined();
    expect(call.orderBy).toEqual({ createdAt: 'desc' });
  });
});
