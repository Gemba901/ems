import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TraceabilityService } from './traceability.service';
import { PrismaService } from 'src/prisma/prisma.service';

interface PrismaMock {
  steelHeatApproval: { findFirst: jest.Mock };
}

function createPrismaMock(): PrismaMock {
  return { steelHeatApproval: { findFirst: jest.fn() } };
}

const ORG_ID = 'org-1';

const FULL_CHAIN_RECORD = {
  id: 'ha-1',
  approvalNumber: 'HA-2026-00001',
  heatNumber: 'HP-2026-00001',
  stage: 'A13_RELEASE_TO_CASTING',
  status: 'CLOSED',
  releasedToCastingAt: new Date('2026-01-05'),
  createdAt: new Date('2026-01-01'),
  melting: {
    id: 'melt-1',
    heatInProcessNumber: 'HP-2026-00001',
    stage: 'A14_HANDOVER_TO_REFINING',
    status: 'CLOSED',
    handoverToRefiningAt: new Date('2026-01-04'),
    createdAt: new Date('2026-01-02'),
    chargePreparation: {
      id: 'charge-1',
      prepNumber: 'CP-2026-00001',
      chargeNumber: 'CH-2026-00001',
      stage: 'A12_HANDOVER_CLOSED',
      status: 'CLOSED',
      chargeReleasedAt: new Date('2026-01-03'),
      createdAt: new Date('2026-01-01'),
      plan: {
        id: 'plan-1',
        planNumber: 'PP-2026-00001',
        stage: 'A11_ORDER_RELEASED',
        status: 'CLOSED',
        createdAt: new Date('2025-12-01'),
      },
      materialLots: [
        {
          id: 'lot-1',
          createdAt: new Date('2026-01-01'),
          intake: {
            id: 'intake-1',
            intakeNumber: 'IN-2026-00001',
            stage: 'A14_STOCK_RELEASED',
            status: 'CLOSED',
            heatNumber: null,
            stockReleasedAt: new Date('2025-12-20'),
            createdAt: new Date('2025-12-15'),
            sourcingOrder: {
              id: 'sourcing-1',
              sourcingNumber: 'SO-2026-00001',
              stage: 'A12_HANDOVER_CLOSED',
              status: 'CLOSED',
              handoverClosedAt: new Date('2025-12-10'),
              createdAt: new Date('2025-12-01'),
              plan: {
                id: 'plan-1',
                planNumber: 'PP-2026-00001',
                stage: 'A11_ORDER_RELEASED',
                status: 'CLOSED',
                createdAt: new Date('2025-12-01'),
              },
            },
          },
        },
      ],
    },
  },
};

describe('TraceabilityService', () => {
  let service: TraceabilityService;
  let prisma: ReturnType<typeof createPrismaMock>;

  beforeEach(async () => {
    prisma = createPrismaMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TraceabilityService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<TraceabilityService>(TraceabilityService);
  });

  it('resolves the full chain from heat approval down to the production plan', async () => {
    prisma.steelHeatApproval.findFirst.mockResolvedValue(FULL_CHAIN_RECORD);

    const result = await service.getHeatTraceability('HP-2026-00001', ORG_ID);

    expect(result.heatApproval).toMatchObject({
      id: 'ha-1',
      approvalNumber: 'HA-2026-00001',
    });
    expect(result.melting).toMatchObject({ id: 'melt-1' });
    expect(result.chargePreparation).toMatchObject({ id: 'charge-1' });
    expect(result.materialIntakes).toHaveLength(1);
    expect(result.materialIntakes[0]).toMatchObject({
      id: 'intake-1',
      sourcingOrder: expect.objectContaining({
        id: 'sourcing-1',
        productionPlan: expect.objectContaining({ id: 'plan-1' }) as unknown,
      }) as unknown,
    });
    expect(result.productionPlan).toMatchObject({ id: 'plan-1' });

    expect(prisma.steelHeatApproval.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { heatNumber: 'HP-2026-00001', organizationId: ORG_ID },
      }),
    );
  });

  it('throws NotFoundException when the heat number does not resolve to a heat approval record', async () => {
    prisma.steelHeatApproval.findFirst.mockResolvedValue(null);

    await expect(
      service.getHeatTraceability('does-not-exist', ORG_ID),
    ).rejects.toThrow(NotFoundException);
  });

  it('is org-scoped — a heat number belonging to another organization resolves as not found', async () => {
    prisma.steelHeatApproval.findFirst.mockResolvedValue(null);

    await service
      .getHeatTraceability('HP-2026-00001', 'other-org')
      .catch(() => undefined);

    expect(prisma.steelHeatApproval.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { heatNumber: 'HP-2026-00001', organizationId: 'other-org' },
      }),
    );
  });

  it('degrades gracefully when the charge preparation has no material lots selected yet (partial upstream link)', async () => {
    prisma.steelHeatApproval.findFirst.mockResolvedValue({
      ...FULL_CHAIN_RECORD,
      melting: {
        ...FULL_CHAIN_RECORD.melting,
        chargePreparation: {
          ...FULL_CHAIN_RECORD.melting.chargePreparation,
          materialLots: [],
        },
      },
    });

    const result = await service.getHeatTraceability('HP-2026-00001', ORG_ID);

    expect(result.materialIntakes).toEqual([]);
    expect(result.chargePreparation).not.toBeNull();
    expect(result.productionPlan).not.toBeNull();
  });
});
