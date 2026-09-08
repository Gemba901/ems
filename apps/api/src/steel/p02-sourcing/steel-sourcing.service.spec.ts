import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SteelSourcingService } from './steel-sourcing.service';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  CreateSteelSourcingOrderDto,
  SelectMaterialSourceDto,
  SelectSteelSupplierDto,
  IdentifySteelMaterialTypeDto,
} from './dto/steel-sourcing.dto';

interface PrismaMock {
  employee: { findFirst: jest.Mock };
  steelProductionPlan: { findFirst: jest.Mock };
  supplier: { findFirst: jest.Mock };
  steelSourcingOrder: {
    create: jest.Mock;
    update: jest.Mock;
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
  };
  steelSourcingQuotation: { deleteMany: jest.Mock; createMany: jest.Mock };
  steelSourcingActivityLog: { create: jest.Mock };
  $transaction: jest.Mock;
}

// Minimal Prisma mock, mirroring the convention used in the P01/P03/P04
// specs: `$transaction` supports both the callback form (used by every
// write) and the array form (used by getAll/getSummary).
function createPrismaMock(): PrismaMock {
  const prisma = {
    employee: { findFirst: jest.fn() },
    steelProductionPlan: { findFirst: jest.fn() },
    supplier: { findFirst: jest.fn() },
    steelSourcingOrder: {
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    steelSourcingQuotation: { deleteMany: jest.fn(), createMany: jest.fn() },
    steelSourcingActivityLog: { create: jest.fn() },
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

describe('SteelSourcingService', () => {
  let service: SteelSourcingService;
  let prisma: ReturnType<typeof createPrismaMock>;

  beforeEach(async () => {
    prisma = createPrismaMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SteelSourcingService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<SteelSourcingService>(SteelSourcingService);
    prisma.employee.findFirst.mockResolvedValue(EMPLOYEE);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── createOrder: plan-status boundary ──
  describe('createOrder', () => {
    it('creates a sourcing order against a released production plan', async () => {
      prisma.steelProductionPlan.findFirst.mockResolvedValue({
        id: 'plan-1',
        organizationId: ORG_ID,
        stage: 'A12_PLAN_RELEASED',
        status: 'RELEASED',
      });
      prisma.steelSourcingOrder.count.mockResolvedValue(0);
      prisma.steelSourcingOrder.create.mockResolvedValue({ id: 'order-1' });
      prisma.steelSourcingOrder.findUnique.mockResolvedValue({
        id: 'order-1',
        stage: 'A01_REQUIREMENT_REVIEWED',
      });

      const result = await service.createOrder(
        { planId: 'plan-1' } as unknown as CreateSteelSourcingOrderDto,
        USER_ID,
        ORG_ID,
      );

      expect(prisma.steelSourcingOrder.create).toHaveBeenCalled();
      expect(result).toEqual(
        expect.objectContaining({ stage: 'A01_REQUIREMENT_REVIEWED' }),
      );
    });

    it('rejects when the referenced production plan does not exist', async () => {
      prisma.steelProductionPlan.findFirst.mockResolvedValue(null);

      await expect(
        service.createOrder(
          { planId: 'missing-plan' } as unknown as CreateSteelSourcingOrderDto,
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.steelSourcingOrder.create).not.toHaveBeenCalled();
    });

    it('rejects a plan that has not reached A12_PLAN_RELEASED', async () => {
      prisma.steelProductionPlan.findFirst.mockResolvedValue({
        id: 'plan-1',
        organizationId: ORG_ID,
        stage: 'A08_CAPACITY_CHECKED',
        status: 'IN_PROGRESS',
      });

      await expect(
        service.createOrder(
          { planId: 'plan-1' } as unknown as CreateSteelSourcingOrderDto,
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.steelSourcingOrder.create).not.toHaveBeenCalled();
    });

    it('rejects a plan that reached A12 by stage but was administratively cancelled', async () => {
      prisma.steelProductionPlan.findFirst.mockResolvedValue({
        id: 'plan-1',
        organizationId: ORG_ID,
        stage: 'A12_PLAN_RELEASED',
        status: 'CANCELLED',
      });

      await expect(
        service.createOrder(
          { planId: 'plan-1' } as unknown as CreateSteelSourcingOrderDto,
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.steelSourcingOrder.create).not.toHaveBeenCalled();
    });

    it('rejects a plan that reached A12 by stage but is on hold', async () => {
      prisma.steelProductionPlan.findFirst.mockResolvedValue({
        id: 'plan-1',
        organizationId: ORG_ID,
        stage: 'A12_PLAN_RELEASED',
        status: 'ON_HOLD',
      });

      await expect(
        service.createOrder(
          { planId: 'plan-1' } as unknown as CreateSteelSourcingOrderDto,
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.steelSourcingOrder.create).not.toHaveBeenCalled();
    });

    it('is organization-scoped when looking up the plan', async () => {
      prisma.steelProductionPlan.findFirst.mockResolvedValue(null);

      await expect(
        service.createOrder(
          {
            planId: 'plan-in-other-org',
          } as unknown as CreateSteelSourcingOrderDto,
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.steelProductionPlan.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'plan-in-other-org', organizationId: ORG_ID },
        }),
      );
    });
  });

  // ── stage transitions ──
  describe('stage transitions', () => {
    it('rejects recording an activity out of order', async () => {
      prisma.steelSourcingOrder.findFirst.mockResolvedValue({
        id: 'order-1',
        organizationId: ORG_ID,
        stage: 'A01_REQUIREMENT_REVIEWED',
      });

      await expect(
        service.reviewSupplierRisk(
          'order-1',
          {} as unknown as Parameters<typeof service.reviewSupplierRisk>[1],
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects re-recording an activity already completed', async () => {
      prisma.steelSourcingOrder.findFirst.mockResolvedValue({
        id: 'order-1',
        organizationId: ORG_ID,
        stage: 'A05_QUOTATIONS_COLLECTED',
      });

      await expect(
        service.identifyMaterialType(
          'order-1',
          { materialType: 'MS' } as unknown as IdentifySteelMaterialTypeDto,
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── EXISTING_STOCK vs EXTERNAL_SUPPLIER ──
  describe('selectMaterialSource', () => {
    it('EXTERNAL_SUPPLIER requires a valid, organization-scoped supplier', async () => {
      prisma.steelSourcingOrder.findFirst.mockResolvedValue({
        id: 'order-1',
        organizationId: ORG_ID,
        stage: 'A02_MATERIAL_TYPE_IDENTIFIED',
      });
      prisma.supplier.findFirst.mockResolvedValue(null);

      await expect(
        service.selectMaterialSource(
          'order-1',
          {
            source: 'EXTERNAL_SUPPLIER',
            supplierId: 'sup-missing',
          } as unknown as SelectMaterialSourceDto,
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('EXTERNAL_SUPPLIER advances to A03 without skipping any purchasing stage', async () => {
      prisma.steelSourcingOrder.findFirst.mockResolvedValue({
        id: 'order-1',
        organizationId: ORG_ID,
        stage: 'A02_MATERIAL_TYPE_IDENTIFIED',
      });
      prisma.supplier.findFirst.mockResolvedValue({
        id: 'sup-1',
        organizationId: ORG_ID,
        approvalStatus: 'APPROVED',
      });
      prisma.steelSourcingOrder.update.mockResolvedValue({ id: 'order-1' });
      prisma.steelSourcingOrder.findUnique.mockResolvedValue({
        id: 'order-1',
        stage: 'A03_SUPPLIER_CHECKED',
        materialSource: 'EXTERNAL_SUPPLIER',
      });

      const result = await service.selectMaterialSource(
        'order-1',
        {
          source: 'EXTERNAL_SUPPLIER',
          supplierId: 'sup-1',
          supplierApprovalConfirmed: true,
        } as unknown as SelectMaterialSourceDto,
        USER_ID,
        ORG_ID,
      );

      expect(result).toEqual(
        expect.objectContaining({ stage: 'A03_SUPPLIER_CHECKED' }),
      );
    });

    it('EXISTING_STOCK skips supplier/quote/PO stages and jumps to A08_PO_CREATED', async () => {
      prisma.steelSourcingOrder.findFirst.mockResolvedValue({
        id: 'order-1',
        organizationId: ORG_ID,
        stage: 'A02_MATERIAL_TYPE_IDENTIFIED',
      });
      prisma.steelSourcingOrder.update.mockResolvedValue({ id: 'order-1' });
      prisma.steelSourcingOrder.findUnique.mockResolvedValue({
        id: 'order-1',
        stage: 'A08_PO_CREATED',
        materialSource: 'EXISTING_STOCK',
      });

      const result = await service.selectMaterialSource(
        'order-1',
        {
          source: 'EXISTING_STOCK',
          stockFulfillmentNotes: 'Covered from yard stock.',
        } as unknown as SelectMaterialSourceDto,
        USER_ID,
        ORG_ID,
      );

      expect(prisma.supplier.findFirst).not.toHaveBeenCalled();
      expect(result).toEqual(
        expect.objectContaining({
          stage: 'A08_PO_CREATED',
          materialSource: 'EXISTING_STOCK',
        }),
      );
    });
  });

  // ── selectSupplier: must be one of the collected quotations ──
  describe('selectSupplier', () => {
    it('rejects a supplier that never submitted a quotation for this order', async () => {
      prisma.steelSourcingOrder.findFirst.mockResolvedValue({
        id: 'order-1',
        organizationId: ORG_ID,
        stage: 'A05_QUOTATIONS_COLLECTED',
        quotations: [{ supplierId: 'sup-1' }],
      });

      await expect(
        service.selectSupplier(
          'order-1',
          {
            selectedSupplierId: 'sup-2',
          } as unknown as SelectSteelSupplierDto,
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.steelSourcingOrder.update).not.toHaveBeenCalled();
    });
  });

  // ── organization scoping ──
  describe('organization scoping', () => {
    it('does not find an order belonging to a different organization', async () => {
      prisma.steelSourcingOrder.findFirst.mockResolvedValue(null);

      await expect(service.getById('order-1', ORG_ID)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.steelSourcingOrder.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'order-1', organizationId: ORG_ID },
        }),
      );
    });
  });
});
