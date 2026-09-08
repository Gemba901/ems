import { Test, TestingModule } from '@nestjs/testing';
import { SteelDashboardService } from './dashboard.service';
import { PrismaService } from 'src/prisma/prisma.service';

interface PrismaMock {
  steelPlanActivityLog: { findMany: jest.Mock };
  steelSourcingActivityLog: { findMany: jest.Mock };
  steelMaterialIntakeActivityLog: { findMany: jest.Mock };
  steelChargePreparationActivityLog: { findMany: jest.Mock };
  steelMeltingActivityLog: { findMany: jest.Mock };
  steelHeatApprovalActivityLog: { findMany: jest.Mock };
  steelMelting: { groupBy: jest.Mock };
  steelHeatApproval: { aggregate: jest.Mock };
  $transaction: jest.Mock;
  $queryRaw: jest.Mock;
}

function createPrismaMock(): PrismaMock {
  const prisma = {
    steelPlanActivityLog: { findMany: jest.fn().mockResolvedValue([]) },
    steelSourcingActivityLog: { findMany: jest.fn().mockResolvedValue([]) },
    steelMaterialIntakeActivityLog: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    steelChargePreparationActivityLog: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    steelMeltingActivityLog: { findMany: jest.fn().mockResolvedValue([]) },
    steelHeatApprovalActivityLog: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    steelMelting: { groupBy: jest.fn().mockResolvedValue([]) },
    steelHeatApproval: {
      aggregate: jest
        .fn()
        .mockResolvedValue({ _avg: { correctionAttempts: null } }),
    },
  } as PrismaMock;
  prisma.$transaction = jest.fn(async (arg: unknown) => {
    if (typeof arg === 'function')
      return (arg as (tx: unknown) => unknown)(prisma);
    return Promise.all(arg as Promise<unknown>[]);
  });
  prisma.$queryRaw = jest.fn().mockResolvedValue([]);
  return prisma;
}

const ORG_ID = 'org-1';

describe('SteelDashboardService', () => {
  let service: SteelDashboardService;
  let prisma: ReturnType<typeof createPrismaMock>;

  beforeEach(async () => {
    prisma = createPrismaMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SteelDashboardService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<SteelDashboardService>(SteelDashboardService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getRecentActivity', () => {
    it('returns an empty, sorted feed when no process has activity', async () => {
      const result = await service.getRecentActivity(ORG_ID);
      expect(result).toEqual([]);
    });
  });

  describe('getKpis', () => {
    it('returns the full KPI shape, computed via SQL aggregation and groupBy — not in-memory table scans', async () => {
      // Each $queryRaw call is consumed in order: (a) kWh/tonne, (b)
      // corrections proxy, then one avgCycleHours call per P01-P06 table.
      prisma.$queryRaw
        .mockResolvedValueOnce([{ avg_kwh_per_tonne: 612.5 }]) // (a)
        .mockResolvedValueOnce([{ avg_corrections: 1.5 }]) // (b)
        .mockResolvedValueOnce([{ avg_hours: 12 }]) // P01
        .mockResolvedValueOnce([{ avg_hours: 24 }]) // P02
        .mockResolvedValueOnce([{ avg_hours: 8 }]) // P03
        .mockResolvedValueOnce([{ avg_hours: 6 }]) // P04
        .mockResolvedValueOnce([{ avg_hours: 4 }]) // P05
        .mockResolvedValueOnce([{ avg_hours: 3 }]); // P06

      prisma.steelMelting.groupBy.mockResolvedValue([
        { furnaceId: 'F1', liningCampaignId: 'LC-1', _count: 7 },
      ]);
      prisma.steelHeatApproval.aggregate.mockResolvedValue({
        _avg: { correctionAttempts: 0.4 },
      });

      const result = await service.getKpis(ORG_ID);

      expect(result).toMatchObject({
        avgKwhPerTonne: 612.5,
        avgChemistryCorrectionsPerHeat: {
          fromActivityLog: 1.5,
          correctionAttempts: 0.4,
        },
        avgCycleTimeHoursByStage: {
          p01: 12,
          p02: 24,
          p03: 8,
          p04: 6,
          p05: 4,
          p06: 3,
        },
      });
      expect(result.liningLifeByFurnace).toEqual([
        {
          furnaceId: 'F1',
          liningCampaignId: 'LC-1',
          heatsSinceCampaignStart: 7,
        },
      ]);

      // Not a full-table in-memory scan: the KPI query goes through
      // $queryRaw/groupBy, never steelMelting.findMany().
      expect(prisma.steelMelting.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          by: ['furnaceId', 'liningCampaignId'],
          where: expect.objectContaining({ organizationId: ORG_ID }) as unknown,
        }),
      );
    });

    it('returns nulls rather than throwing when no data exists yet for a metric', async () => {
      prisma.$queryRaw.mockResolvedValue([{ avg_kwh_per_tonne: null }]);

      const result = await service.getKpis(ORG_ID);

      expect(result.avgKwhPerTonne).toBeNull();
      expect(result.liningLifeByFurnace).toEqual([]);
    });
  });
});
