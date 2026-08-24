// P01 test-depth audit (Steel module fix-prompt item 5): this file
// previously covered only getAll's date-range filtering (~117 lines),
// far below the ~300-700 lines of coverage P02-P06's service specs carry.
// Added in this pass, mirroring the P05/P06 spec pattern (org scope,
// employee-profile guard, stage-transition guards, input validation,
// admin override, reads):
//   - createDemand: success (plan-number generation) + no-employee-profile rejection
//   - stage-transition guards: premature call, duplicate/already-past call,
//     record-not-found (wrong org), reused across a representative staged
//     action (confirmPriority) plus the two activities with extra
//     service-level input validation
//   - confirmPriority: success path, advances stage and logs activity
//   - prepareProductionPlan (A10): rejects plannedEndDate before plannedStartDate
//   - communicatePlan (A11): rejects an empty department list; success creates
//     department acks and advances the stage
//   - acknowledgeDepartment: rejects before the plan has been communicated;
//     rejects a department that wasn't included; success updates the ack
//   - releasePlan (A12): releases regardless of department ack state —
//     department acknowledgement is informational only, not a release gate
//   - updateStatus: administrative override bypasses stage/status validation
//   - getById / getSummary: shape checks
import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { SteelService } from './steel.service';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  ConfirmSteelPriorityDto,
  CreateSteelDemandDto,
  QuerySteelPlansDto,
} from './dto/steel.dto';

interface PrismaMock {
  employee: { findFirst: jest.Mock };
  customer: { findFirst: jest.Mock };
  steelProduct: { findFirst: jest.Mock };
  steelProductSpecification: { findFirst: jest.Mock };
  steelProductionRoute: { findFirst: jest.Mock };
  steelProductionRouteStep: { findMany: jest.Mock };
  steelFinishedGoodsStock: { findMany: jest.Mock };
  steelProductionPlan: {
    create: jest.Mock;
    update: jest.Mock;
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
    groupBy: jest.Mock;
  };
  steelPlanActivityLog: { create: jest.Mock };
  steelPlanDepartmentAck: {
    createMany: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  $transaction: jest.Mock;
}

// Prisma mock covering every model the service touches. `$transaction`
// supports both the callback form (used by every write) and the array form
// (used by getAll/getSummary), matching how the service actually calls it.
function createPrismaMock(): PrismaMock {
  const prisma = {
    employee: { findFirst: jest.fn() },
    customer: { findFirst: jest.fn() },
    steelProduct: { findFirst: jest.fn() },
    steelProductSpecification: { findFirst: jest.fn() },
    steelProductionRoute: { findFirst: jest.fn() },
    steelProductionRouteStep: { findMany: jest.fn().mockResolvedValue([]) },
    steelFinishedGoodsStock: { findMany: jest.fn().mockResolvedValue([]) },
    steelProductionPlan: {
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    steelPlanActivityLog: { create: jest.fn() },
    steelPlanDepartmentAck: {
      createMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  } as PrismaMock;
  prisma.$transaction = jest.fn(async (arg: unknown) => {
    if (typeof arg === 'function')
      return (arg as (tx: unknown) => unknown)(prisma);
    return Promise.all(arg as Promise<unknown>[]);
  });
  return prisma;
}

const EMPLOYEE = { id: 'emp-1' };
const ORG_ID = 'org-1';
const USER_ID = 'user-1';

function baseQuery(
  overrides: Partial<QuerySteelPlansDto> = {},
): QuerySteelPlansDto {
  return {
    sortBy: 'createdAt',
    sortOrder: 'desc',
    page: 1,
    limit: 10,
    ...overrides,
  } as QuerySteelPlansDto;
}

describe('SteelService', () => {
  let service: SteelService;
  let prisma: ReturnType<typeof createPrismaMock>;

  beforeEach(async () => {
    prisma = createPrismaMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [SteelService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<SteelService>(SteelService);
    prisma.employee.findFirst.mockResolvedValue(EMPLOYEE);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── Create demand (P01-A01) ──
  describe('createDemand', () => {
    const dto: CreateSteelDemandDto = {
      demandSource: 'SALES_ORDER' as CreateSteelDemandDto['demandSource'],
      requestedQuantityTonnes: 10,
    };

    it('creates a production plan with a generated plan number', async () => {
      prisma.steelProductionPlan.count.mockResolvedValue(0);
      prisma.steelProductionPlan.create.mockResolvedValue({ id: 'plan-1' });
      prisma.steelProductionPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        stage: 'A01_DEMAND_CAPTURED',
        status: 'IN_PROGRESS',
      });

      const result = await service.createDemand(dto, USER_ID, ORG_ID);

      expect(prisma.steelProductionPlan.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: ORG_ID,
            planNumber: 'PP-' + new Date().getFullYear() + '-00001',
            requestedQuantityTonnes: 10,
          }) as unknown,
        }),
      );
      expect(result).toMatchObject({ id: 'plan-1' });
    });

    it('rejects when the acting user has no linked employee profile', async () => {
      prisma.employee.findFirst.mockResolvedValue(null);
      await expect(service.createDemand(dto, USER_ID, ORG_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects a CUSTOMER_ORDER demand with no customer reference', async () => {
      await expect(
        service.createDemand(
          { demandSource: 'CUSTOMER_ORDER', requestedQuantityTonnes: 10 },
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('derives customerName/dealerName from the selected master-data customer', async () => {
      prisma.customer.findFirst.mockResolvedValue({
        id: 'cust-1',
        organizationId: ORG_ID,
        name: 'Acme Steel',
        dealerName: 'Acme Dealer Co',
      });
      prisma.steelProductionPlan.count.mockResolvedValue(0);
      prisma.steelProductionPlan.create.mockResolvedValue({ id: 'plan-1' });
      prisma.steelProductionPlan.findUnique.mockResolvedValue({ id: 'plan-1' });

      await service.createDemand(
        {
          demandSource: 'CUSTOMER_ORDER',
          customerId: 'cust-1',
          requestedQuantityTonnes: 10,
        },
        USER_ID,
        ORG_ID,
      );

      expect(prisma.steelProductionPlan.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            customerId: 'cust-1',
            customerName: 'Acme Steel',
            dealerName: 'Acme Dealer Co',
          }) as unknown,
        }),
      );
    });
  });

  // ── Sequential stage transitions (shared assertStage guard) ──
  describe('stage transitions', () => {
    it('rejects a staged action called out of order (before its prerequisite)', async () => {
      prisma.steelProductionPlan.findFirst.mockResolvedValue({
        id: 'plan-1',
        organizationId: ORG_ID,
        stage: 'A01_DEMAND_CAPTURED', // A03 requires A02 first
        departmentAcks: [],
      });

      await expect(
        service.confirmProduct(
          'plan-1',
          { productType: 'BILLET', productStandard: 'IS 2830' } as never,
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects duplicate execution of a step already completed', async () => {
      prisma.steelProductionPlan.findFirst.mockResolvedValue({
        id: 'plan-1',
        organizationId: ORG_ID,
        stage: 'A05_STOCK_CHECKED', // A02 already long done
        departmentAcks: [],
      });

      const dto: ConfirmSteelPriorityDto = {
        priority: 'NORMAL' as ConfirmSteelPriorityDto['priority'],
      };
      await expect(
        service.confirmPriority('plan-1', dto, USER_ID, ORG_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects any action on a record that is not found (wrong org or nonexistent)', async () => {
      prisma.steelProductionPlan.findFirst.mockResolvedValue(null);
      const dto: ConfirmSteelPriorityDto = {
        priority: 'NORMAL' as ConfirmSteelPriorityDto['priority'],
      };
      await expect(
        service.confirmPriority('plan-x', dto, USER_ID, 'wrong-org'),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.steelProductionPlan.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'plan-x', organizationId: 'wrong-org' },
        }),
      );
    });
  });

  // ── confirmPriority (P01-A02) — success path ──
  describe('confirmPriority', () => {
    it('advances the plan from A01 to A02 and logs the activity', async () => {
      prisma.steelProductionPlan.findFirst.mockResolvedValue({
        id: 'plan-1',
        organizationId: ORG_ID,
        stage: 'A01_DEMAND_CAPTURED',
        demandSource: 'CUSTOMER_ORDER',
        departmentAcks: [],
      });
      prisma.steelProductionPlan.update.mockResolvedValue({ id: 'plan-1' });
      prisma.steelProductionPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        stage: 'A02_PRIORITY_CONFIRMED',
      });

      // NORMAL matches the default derived from CUSTOMER_ORDER, so this
      // exercises the pass-through path without triggering the
      // override-requires-notes guard.
      const dto: ConfirmSteelPriorityDto = {
        priority: 'NORMAL' as ConfirmSteelPriorityDto['priority'],
      };
      await service.confirmPriority('plan-1', dto, USER_ID, ORG_ID);

      expect(prisma.steelProductionPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            stage: 'A02_PRIORITY_CONFIRMED',
          }) as unknown,
        }),
      );
      expect(prisma.steelPlanActivityLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ activity: 'A02' }) as unknown,
        }),
      );
    });
  });

  // ── prepareProductionPlan (P01-A10) — input validation ──
  describe('prepareProductionPlan', () => {
    const baseDto = { productionSequence: [{ batch: 'B1' }] };

    it('rejects when the planned end date is before the planned start date', async () => {
      prisma.steelProductionPlan.findFirst.mockResolvedValue({
        id: 'plan-1',
        organizationId: ORG_ID,
        stage: 'A09_CAPACITY_CHECKED',
        departmentAcks: [],
      });

      await expect(
        service.prepareProductionPlan(
          'plan-1',
          {
            ...baseDto,
            plannedStartDate: '2026-02-10',
            plannedEndDate: '2026-02-01',
          } as never,
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.steelProductionPlan.update).not.toHaveBeenCalled();
    });

    it('accepts a valid date range and advances to A10', async () => {
      prisma.steelProductionPlan.findFirst.mockResolvedValue({
        id: 'plan-1',
        organizationId: ORG_ID,
        stage: 'A09_CAPACITY_CHECKED',
        departmentAcks: [],
      });
      prisma.steelProductionPlan.update.mockResolvedValue({ id: 'plan-1' });
      prisma.steelProductionPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        stage: 'A10_PLAN_DRAFTED',
      });

      await service.prepareProductionPlan(
        'plan-1',
        {
          ...baseDto,
          plannedStartDate: '2026-02-01',
          plannedEndDate: '2026-02-10',
        } as never,
        USER_ID,
        ORG_ID,
      );

      expect(prisma.steelProductionPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            stage: 'A10_PLAN_DRAFTED',
          }) as unknown,
        }),
      );
    });
  });

  // ── decideStockOrProduction (P01-A06) — shortfall-based suggestion ──
  describe('decideStockOrProduction', () => {
    it('defaults to PRODUCTION_REQUIRED when stock falls short and no decision given', async () => {
      prisma.steelProductionPlan.findFirst.mockResolvedValue({
        id: 'plan-1',
        organizationId: ORG_ID,
        stage: 'A05_STOCK_CHECKED',
        requestedQuantityTonnes: 10,
        certifiedStockAvailableQty: 4,
        departmentAcks: [],
      });
      prisma.steelProductionPlan.update.mockResolvedValue({ id: 'plan-1' });
      prisma.steelProductionPlan.findUnique.mockResolvedValue({ id: 'plan-1' });

      await service.decideStockOrProduction('plan-1', {}, USER_ID, ORG_ID);

      expect(prisma.steelProductionPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            stockDecision: 'PRODUCTION_REQUIRED',
          }) as unknown,
        }),
      );
    });

    it('rejects overriding the suggested decision without a note', async () => {
      prisma.steelProductionPlan.findFirst.mockResolvedValue({
        id: 'plan-1',
        organizationId: ORG_ID,
        stage: 'A05_STOCK_CHECKED',
        requestedQuantityTonnes: 10,
        certifiedStockAvailableQty: 4,
        departmentAcks: [],
      });

      await expect(
        service.decideStockOrProduction(
          'plan-1',
          { stockDecision: 'DISPATCH_FROM_STOCK' },
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── selectRoute (P01-A07) — plantRoute derived from master-data route ──
  describe('selectRoute', () => {
    it('derives plantRoute from the selected production route', async () => {
      prisma.steelProductionPlan.findFirst.mockResolvedValue({
        id: 'plan-1',
        organizationId: ORG_ID,
        stage: 'A06_STOCK_DECISION_MADE',
        departmentAcks: [],
      });
      prisma.steelProductionRoute.findFirst.mockResolvedValue({
        id: 'route-1',
        organizationId: ORG_ID,
        plantRoute: 'INTEGRATED_PLANT',
      });
      prisma.steelProductionPlan.update.mockResolvedValue({ id: 'plan-1' });
      prisma.steelProductionPlan.findUnique.mockResolvedValue({ id: 'plan-1' });

      await service.selectRoute(
        'plan-1',
        { productionRouteId: 'route-1' },
        USER_ID,
        ORG_ID,
      );

      expect(prisma.steelProductionPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            productionRouteId: 'route-1',
            plantRoute: 'INTEGRATED_PLANT',
          }) as unknown,
        }),
      );
    });

    it('rejects when neither productionRouteId nor plantRoute is given', async () => {
      prisma.steelProductionPlan.findFirst.mockResolvedValue({
        id: 'plan-1',
        organizationId: ORG_ID,
        stage: 'A06_STOCK_DECISION_MADE',
        departmentAcks: [],
      });

      await expect(
        service.selectRoute('plan-1', {}, USER_ID, ORG_ID),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── communicatePlan (P01-A11) — input validation ──
  describe('communicatePlan', () => {
    it('rejects an empty department list', async () => {
      prisma.steelProductionPlan.findFirst.mockResolvedValue({
        id: 'plan-1',
        organizationId: ORG_ID,
        stage: 'A10_PLAN_DRAFTED',
        departmentAcks: [],
      });

      await expect(
        service.communicatePlan(
          'plan-1',
          { departments: [] } as never,
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.steelPlanDepartmentAck.createMany).not.toHaveBeenCalled();
    });

    it('creates department acks and advances to A11', async () => {
      prisma.steelProductionPlan.findFirst.mockResolvedValue({
        id: 'plan-1',
        organizationId: ORG_ID,
        stage: 'A10_PLAN_DRAFTED',
        departmentAcks: [],
      });
      prisma.steelProductionPlan.update.mockResolvedValue({ id: 'plan-1' });
      prisma.steelProductionPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        stage: 'A11_PLAN_COMMUNICATED',
      });

      await service.communicatePlan(
        'plan-1',
        { departments: ['PRODUCTION', 'QUALITY'] } as never,
        USER_ID,
        ORG_ID,
      );

      expect(prisma.steelPlanDepartmentAck.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [
            { planId: 'plan-1', department: 'PRODUCTION' },
            { planId: 'plan-1', department: 'QUALITY' },
          ],
        }),
      );
    });
  });

  // ── acknowledgeDepartment — support action for P01-A11 ──
  describe('acknowledgeDepartment', () => {
    it('rejects when the plan has not been communicated yet', async () => {
      prisma.steelProductionPlan.findFirst.mockResolvedValue({
        id: 'plan-1',
        organizationId: ORG_ID,
        stage: 'A10_PLAN_DRAFTED',
        planCommunicatedAt: null,
        departmentAcks: [],
      });

      await expect(
        service.acknowledgeDepartment(
          'plan-1',
          'PRODUCTION' as never,
          {},
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects a department that wasn't included in the communication", async () => {
      prisma.steelProductionPlan.findFirst.mockResolvedValue({
        id: 'plan-1',
        organizationId: ORG_ID,
        stage: 'A11_PLAN_COMMUNICATED',
        planCommunicatedAt: new Date(),
        departmentAcks: [],
      });
      prisma.steelPlanDepartmentAck.findUnique.mockResolvedValue(null);

      await expect(
        service.acknowledgeDepartment(
          'plan-1',
          'QUALITY' as never,
          {},
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('acknowledges an included department', async () => {
      prisma.steelProductionPlan.findFirst.mockResolvedValue({
        id: 'plan-1',
        organizationId: ORG_ID,
        stage: 'A11_PLAN_COMMUNICATED',
        planCommunicatedAt: new Date(),
        departmentAcks: [],
      });
      prisma.steelPlanDepartmentAck.findUnique.mockResolvedValue({
        id: 'ack-1',
      });
      prisma.steelPlanDepartmentAck.update.mockResolvedValue({
        id: 'ack-1',
        acknowledged: true,
      });

      const result = await service.acknowledgeDepartment(
        'plan-1',
        'PRODUCTION' as never,
        {},
        USER_ID,
        ORG_ID,
      );

      expect(prisma.steelPlanDepartmentAck.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ack-1' },
          data: expect.objectContaining({ acknowledged: true }) as unknown,
        }),
      );
      expect(result).toMatchObject({ acknowledged: true });
    });
  });

  // ── releasePlan (P01-A12) — terminal gate ──
  describe('releasePlan', () => {
    it('releases the plan even with outstanding department acknowledgements — departments are informational only, not a release gate', async () => {
      prisma.steelProductionPlan.findFirst.mockResolvedValue({
        id: 'plan-1',
        organizationId: ORG_ID,
        stage: 'A11_PLAN_COMMUNICATED',
        departmentAcks: [
          { department: 'PRODUCTION', acknowledged: true },
          { department: 'QUALITY', acknowledged: false },
        ],
      });
      prisma.steelProductionPlan.update.mockResolvedValue({ id: 'plan-1' });
      prisma.steelProductionPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        stage: 'A12_PLAN_RELEASED',
        status: 'RELEASED',
      });

      const result = await service.releasePlan(
        'plan-1',
        { releaseNotes: 'Approved' },
        USER_ID,
        ORG_ID,
      );

      expect(prisma.steelProductionPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'RELEASED' }) as unknown,
        }),
      );
      expect(result).toMatchObject({ status: 'RELEASED' });
    });

    it('releases the plan once every department has acknowledged (also unblocked, same as any other ack state)', async () => {
      prisma.steelProductionPlan.findFirst.mockResolvedValue({
        id: 'plan-1',
        organizationId: ORG_ID,
        stage: 'A11_PLAN_COMMUNICATED',
        departmentAcks: [
          { department: 'PRODUCTION', acknowledged: true },
          { department: 'QUALITY', acknowledged: true },
        ],
      });
      prisma.steelProductionPlan.update.mockResolvedValue({ id: 'plan-1' });
      prisma.steelProductionPlan.findUnique.mockResolvedValue({
        id: 'plan-1',
        stage: 'A12_PLAN_RELEASED',
        status: 'RELEASED',
      });

      const result = await service.releasePlan(
        'plan-1',
        { releaseNotes: 'Approved' },
        USER_ID,
        ORG_ID,
      );

      expect(prisma.steelProductionPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'RELEASED' }) as unknown,
        }),
      );
      expect(result).toMatchObject({ status: 'RELEASED' });
    });
  });

  // ── updateStatus — administrative override ──
  describe('updateStatus', () => {
    it('bypasses stage/status validation (deliberately) and logs the override', async () => {
      prisma.steelProductionPlan.findFirst.mockResolvedValue({
        id: 'plan-1',
        organizationId: ORG_ID,
        stage: 'A03_PRODUCT_CONFIRMED',
        status: 'IN_PROGRESS',
        departmentAcks: [],
      });
      prisma.steelProductionPlan.update.mockResolvedValue({
        id: 'plan-1',
        status: 'ON_HOLD',
      });

      const result = await service.updateStatus(
        'plan-1',
        { status: 'ON_HOLD' } as never,
        USER_ID,
        ORG_ID,
      );

      expect(prisma.steelPlanActivityLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            activity: 'STATUS_OVERRIDE',
          }) as unknown,
        }),
      );
      expect(result).toMatchObject({ status: 'ON_HOLD' });
    });
  });

  // ── Reads ──
  describe('getById', () => {
    it('returns the plan for the given org', async () => {
      prisma.steelProductionPlan.findFirst.mockResolvedValue({
        id: 'plan-1',
        organizationId: ORG_ID,
      });
      const result = await service.getById('plan-1', ORG_ID);
      expect(result).toMatchObject({ id: 'plan-1' });
    });

    it('throws NotFoundException for a nonexistent/wrong-org plan', async () => {
      prisma.steelProductionPlan.findFirst.mockResolvedValue(null);
      await expect(service.getById('plan-x', ORG_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getSummary', () => {
    it('returns totals grouped by stage, status, and the stage/status cross-tab', async () => {
      prisma.steelProductionPlan.groupBy
        .mockResolvedValueOnce([{ stage: 'A01_DEMAND_CAPTURED', _count: 2 }])
        .mockResolvedValueOnce([{ status: 'IN_PROGRESS', _count: 2 }])
        .mockResolvedValueOnce([
          { stage: 'A01_DEMAND_CAPTURED', status: 'IN_PROGRESS', _count: 2 },
        ]);
      prisma.steelProductionPlan.count.mockResolvedValue(2);

      const result = await service.getSummary(ORG_ID);

      expect(result.total).toBe(2);
      expect(result.byStage).toEqual({ A01_DEMAND_CAPTURED: 2 });
      expect(result.byStatus).toEqual({ IN_PROGRESS: 2 });
      expect(result.byStageStatus).toEqual([
        { stage: 'A01_DEMAND_CAPTURED', status: 'IN_PROGRESS', count: 2 },
      ]);
    });
  });
});

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
    await service.getAll(
      ORG_ID,
      baseQuery({ fromDate: '2026-01-01', toDate: '2026-01-31' }),
    );
    const where = prisma.steelProductionPlan.findMany.mock.calls[0][0].where;
    expect(where.plannedStartDate.gte).toEqual(new Date('2026-01-01'));
    expect(where.plannedStartDate.lte.getDate()).toBe(31);
  });

  it('combines scheduledOnly with a date range without overwriting either clause', async () => {
    await service.getAll(
      ORG_ID,
      baseQuery({ scheduledOnly: true, fromDate: '2026-01-01' }),
    );
    const where = prisma.steelProductionPlan.findMany.mock.calls[0][0].where;
    expect(where.plannedStartDate.not).toBeNull();
    expect(where.plannedStartDate.gte).toEqual(new Date('2026-01-01'));
  });

  it('rejects fromDate after toDate without querying the database', async () => {
    await expect(
      service.getAll(
        ORG_ID,
        baseQuery({ fromDate: '2026-02-01', toDate: '2026-01-01' }),
      ),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.steelProductionPlan.findMany).not.toHaveBeenCalled();
  });

  it('accepts fromDate equal to toDate (single-day range)', async () => {
    await expect(
      service.getAll(
        ORG_ID,
        baseQuery({ fromDate: '2026-01-15', toDate: '2026-01-15' }),
      ),
    ).resolves.toBeDefined();
  });

  it('leaves stage/status/search/scheduledOnly/sort behavior untouched when no dates are given', async () => {
    await service.getAll(
      ORG_ID,
      baseQuery({
        stage: 'A10_PLAN_DRAFTED',
        status: 'IN_PROGRESS',
        search: 'ACME',
      }),
    );
    const call = prisma.steelProductionPlan.findMany.mock.calls[0][0];
    expect(call.where.stage).toBe('A10_PLAN_DRAFTED');
    expect(call.where.status).toBe('IN_PROGRESS');
    expect(call.where.OR).toBeDefined();
    expect(call.orderBy).toEqual({ createdAt: 'desc' });
  });
});
