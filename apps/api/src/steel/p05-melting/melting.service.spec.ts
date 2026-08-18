import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from 'db';
import { MeltingService } from './melting.service';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  ConfirmFurnaceAvailabilityDto,
  ConfirmLiquidReadyDto,
  RefiningHandoverDto,
} from './dto/melting.dto';

interface PrismaMock {
  employee: { findFirst: jest.Mock };
  steelChargePreparation: { findFirst: jest.Mock };
  steelMelting: {
    create: jest.Mock;
    update: jest.Mock;
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
    groupBy: jest.Mock;
  };
  steelMeltingActivityLog: { create: jest.Mock };
  $transaction: jest.Mock;
}

// Minimal Prisma mock: `$transaction` supports both the callback form (used
// by every write) and the array form (used by getAll/getSummary), matching
// how the service actually calls it.
function createPrismaMock(): PrismaMock {
  const prisma = {
    employee: { findFirst: jest.fn() },
    steelChargePreparation: { findFirst: jest.fn() },
    steelMelting: {
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    steelMeltingActivityLog: { create: jest.fn() },
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
const CHARGE = {
  id: 'charge-1',
  organizationId: ORG_ID,
  status: 'CLOSED',
  chargeNumber: 'CH-2026-00001',
  recipeScrapWeightTonnes: 10,
  recipeDriWeightTonnes: 1,
  recipeAlloyWeightTonnes: 0.5,
  recipeAdditiveWeightTonnes: 0.2,
};

describe('MeltingService', () => {
  let service: MeltingService;
  let prisma: ReturnType<typeof createPrismaMock>;

  beforeEach(async () => {
    prisma = createPrismaMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [MeltingService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<MeltingService>(MeltingService);
    prisma.employee.findFirst.mockResolvedValue(EMPLOYEE);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── Create melting (P05-A01) — P04 -> P05 handover ──
  describe('createMelting', () => {
    const dto: ConfirmFurnaceAvailabilityDto = {
      chargePreparationId: 'charge-1',
      furnaceId: 'F1',
    };

    it('creates a melting record against a closed, charge-numbered preparation', async () => {
      prisma.steelChargePreparation.findFirst.mockResolvedValue(CHARGE);
      prisma.steelMelting.count.mockResolvedValue(0);
      prisma.steelMelting.create.mockResolvedValue({ id: 'melt-1' });
      prisma.steelMelting.findUnique.mockResolvedValue({
        id: 'melt-1',
        stage: 'A01_CONFIRM_FURNACE_AVAILABILITY',
        status: 'IN_PROGRESS',
      });

      const result = await service.createMelting(dto, USER_ID, ORG_ID);

      expect(prisma.steelMelting.create).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            chargePreparationId: 'charge-1',
            chargeNumberSnapshot: 'CH-2026-00001',
            heatInProcessNumber: 'HP-' + new Date().getFullYear() + '-00001',
          }),
        }),
      );
      expect(result).toMatchObject({ id: 'melt-1' });
    });

    it('rejects when the parent charge preparation is not found', async () => {
      prisma.steelChargePreparation.findFirst.mockResolvedValue(null);
      await expect(service.createMelting(dto, USER_ID, ORG_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects when the charge preparation is not closed', async () => {
      prisma.steelChargePreparation.findFirst.mockResolvedValue({
        ...CHARGE,
        status: 'IN_PROGRESS',
      });
      await expect(service.createMelting(dto, USER_ID, ORG_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects when the charge preparation has no released charge number', async () => {
      prisma.steelChargePreparation.findFirst.mockResolvedValue({
        ...CHARGE,
        chargeNumber: null,
      });
      await expect(service.createMelting(dto, USER_ID, ORG_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('is org-scoped — a charge from another organization is treated as not found', async () => {
      prisma.steelChargePreparation.findFirst.mockResolvedValue(null);
      await service
        .createMelting(dto, USER_ID, 'other-org')
        .catch(() => undefined);
      expect(prisma.steelChargePreparation.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'charge-1', organizationId: 'other-org' },
        }),
      );
    });

    it('rejects a charge preparation already consumed by another melting record (unique constraint)', async () => {
      prisma.steelChargePreparation.findFirst.mockResolvedValue(CHARGE);
      prisma.steelMelting.count.mockResolvedValue(0);
      prisma.steelMelting.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
          meta: { target: ['chargePreparationId'] },
        }),
      );

      await expect(service.createMelting(dto, USER_ID, ORG_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects when the acting user has no linked employee profile', async () => {
      prisma.employee.findFirst.mockResolvedValue(null);
      await expect(service.createMelting(dto, USER_ID, ORG_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ── Sequential stage transitions ──
  describe('stage transitions', () => {
    it('furnaceLiningCheck rejects when called out of order (before A01)', async () => {
      prisma.steelMelting.findFirst.mockResolvedValue({
        id: 'melt-1',
        organizationId: ORG_ID,
        status: 'IN_PROGRESS',
        stage: 'A03_FURNACE_SYSTEMS_CHECK', // already past A01
      });

      await expect(
        service.furnaceLiningCheck(
          'melt-1',
          { liningVisualCondition: 'Good' },
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('furnaceLiningCheck advances the record from A01 to A02', async () => {
      prisma.steelMelting.findFirst.mockResolvedValue({
        id: 'melt-1',
        organizationId: ORG_ID,
        status: 'IN_PROGRESS',
        stage: 'A01_CONFIRM_FURNACE_AVAILABILITY',
      });
      prisma.steelMelting.update.mockResolvedValue({ id: 'melt-1' });
      prisma.steelMelting.findUnique.mockResolvedValue({
        id: 'melt-1',
        stage: 'A02_FURNACE_LINING_CHECK',
      });

      await service.furnaceLiningCheck(
        'melt-1',
        { liningVisualCondition: 'Good' },
        USER_ID,
        ORG_ID,
      );

      expect(prisma.steelMelting.update).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            stage: 'A02_FURNACE_LINING_CHECK',
          }),
        }),
      );
    });

    it('rejects duplicate execution of a step already completed', async () => {
      prisma.steelMelting.findFirst.mockResolvedValue({
        id: 'melt-1',
        organizationId: ORG_ID,
        status: 'IN_PROGRESS',
        stage: 'A05_VERIFY_CHARGE_RECIPE', // A02 already done
      });

      await expect(
        service.furnaceLiningCheck(
          'melt-1',
          { liningVisualCondition: 'Good' },
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects any action on a record that is not found (wrong org or nonexistent)', async () => {
      prisma.steelMelting.findFirst.mockResolvedValue(null);
      await expect(
        service.furnaceLiningCheck(
          'melt-x',
          { liningVisualCondition: 'Good' },
          USER_ID,
          'wrong-org',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects any action on a CANCELLED record', async () => {
      prisma.steelMelting.findFirst.mockResolvedValue({
        id: 'melt-1',
        organizationId: ORG_ID,
        status: 'CANCELLED',
        stage: 'A01_CONFIRM_FURNACE_AVAILABILITY',
      });
      await expect(
        service.furnaceLiningCheck(
          'melt-1',
          { liningVisualCondition: 'Good' },
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects a staged action on a CLOSED record, but allows the manual status override', async () => {
      prisma.steelMelting.findFirst.mockResolvedValue({
        id: 'melt-1',
        organizationId: ORG_ID,
        status: 'CLOSED',
        stage: 'A14_HANDOVER_TO_REFINING',
      });

      await expect(
        service.furnaceLiningCheck(
          'melt-1',
          { liningVisualCondition: 'Good' },
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(ConflictException);

      prisma.steelMelting.update.mockResolvedValue({
        id: 'melt-1',
        status: 'ON_HOLD',
      });
      await expect(
        service.updateStatus('melt-1', { status: 'ON_HOLD' }, USER_ID, ORG_ID),
      ).resolves.toBeDefined(); // override deliberately bypasses stage/status validation
    });

    it('rejects any staged action on an ON_HOLD record', async () => {
      prisma.steelMelting.findFirst.mockResolvedValue({
        id: 'melt-1',
        organizationId: ORG_ID,
        status: 'ON_HOLD',
        stage: 'A01_CONFIRM_FURNACE_AVAILABILITY',
      });
      await expect(
        service.furnaceLiningCheck(
          'melt-1',
          { liningVisualCondition: 'Good' },
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ── furnaceLiningCheck (P05-A02) — input validation ──
  describe('furnaceLiningCheck validation', () => {
    const baseMelting = {
      id: 'melt-1',
      organizationId: ORG_ID,
      status: 'IN_PROGRESS',
      stage: 'A01_CONFIRM_FURNACE_AVAILABILITY',
    };

    it('succeeds and advances the stage when a lining condition is provided', async () => {
      prisma.steelMelting.findFirst.mockResolvedValue(baseMelting);
      prisma.steelMelting.update.mockResolvedValue({ id: 'melt-1' });
      prisma.steelMelting.findUnique.mockResolvedValue({
        id: 'melt-1',
        stage: 'A02_FURNACE_LINING_CHECK',
      });

      await service.furnaceLiningCheck(
        'melt-1',
        { liningVisualCondition: 'Good — no visible cracks' },
        USER_ID,
        ORG_ID,
      );

      expect(prisma.steelMelting.update).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            liningVisualCondition: 'Good — no visible cracks',
            stage: 'A02_FURNACE_LINING_CHECK',
          }),
        }),
      );
    });

    it('rejects an empty lining condition and does not advance the stage', async () => {
      prisma.steelMelting.findFirst.mockResolvedValue(baseMelting);

      await expect(
        service.furnaceLiningCheck(
          'melt-1',
          { liningVisualCondition: '' },
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.steelMelting.update).not.toHaveBeenCalled();
    });
  });

  // ── furnaceSystemsCheck (P05-A03) — safety-gate validation ──
  describe('furnaceSystemsCheck validation', () => {
    const baseMelting = {
      id: 'melt-1',
      organizationId: ORG_ID,
      status: 'IN_PROGRESS',
      stage: 'A02_FURNACE_LINING_CHECK',
    };
    const allOk = {
      waterPressureFlowOk: true,
      powerSystemOk: true,
      hydraulicSystemOk: true,
      alarmsOk: true,
    };

    it('succeeds and advances the stage when all four systems are confirmed OK', async () => {
      prisma.steelMelting.findFirst.mockResolvedValue(baseMelting);
      prisma.steelMelting.update.mockResolvedValue({ id: 'melt-1' });
      prisma.steelMelting.findUnique.mockResolvedValue({
        id: 'melt-1',
        stage: 'A03_FURNACE_SYSTEMS_CHECK',
      });

      await service.furnaceSystemsCheck('melt-1', allOk, USER_ID, ORG_ID);

      expect(prisma.steelMelting.update).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({ stage: 'A03_FURNACE_SYSTEMS_CHECK' }),
        }),
      );
    });

    it('rejects when a single system is not OK', async () => {
      prisma.steelMelting.findFirst.mockResolvedValue(baseMelting);

      await expect(
        service.furnaceSystemsCheck(
          'melt-1',
          { ...allOk, hydraulicSystemOk: false },
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.steelMelting.update).not.toHaveBeenCalled();
    });

    it('rejects when multiple systems are not OK', async () => {
      prisma.steelMelting.findFirst.mockResolvedValue(baseMelting);

      await expect(
        service.furnaceSystemsCheck(
          'melt-1',
          { ...allOk, powerSystemOk: false, alarmsOk: false },
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.steelMelting.update).not.toHaveBeenCalled();
    });

    it('rejects when all four systems are not OK', async () => {
      prisma.steelMelting.findFirst.mockResolvedValue(baseMelting);

      await expect(
        service.furnaceSystemsCheck(
          'melt-1',
          {
            waterPressureFlowOk: false,
            powerSystemOk: false,
            hydraulicSystemOk: false,
            alarmsOk: false,
          },
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.steelMelting.update).not.toHaveBeenCalled();
    });

    it('still rejects out-of-order execution before validating the safety gate', async () => {
      prisma.steelMelting.findFirst.mockResolvedValue({
        ...baseMelting,
        stage: 'A05_VERIFY_CHARGE_RECIPE', // already past A03
      });

      await expect(
        service.furnaceSystemsCheck('melt-1', allOk, USER_ID, ORG_ID),
      ).rejects.toThrow(ConflictException);
    });

    it('still rejects the check on a terminal (CLOSED) record', async () => {
      prisma.steelMelting.findFirst.mockResolvedValue({
        ...baseMelting,
        status: 'CLOSED',
      });

      await expect(
        service.furnaceSystemsCheck('melt-1', allOk, USER_ID, ORG_ID),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ── verifyChargeRecipe — input validation ──
  describe('verifyChargeRecipe', () => {
    it('rejects when the recipe/weight mismatch is not confirmed OK', async () => {
      prisma.steelMelting.findFirst.mockResolvedValue({
        id: 'melt-1',
        organizationId: ORG_ID,
        status: 'IN_PROGRESS',
        stage: 'A04_PREVIOUS_HEAT_READINESS',
      });

      await expect(
        service.verifyChargeRecipe(
          'melt-1',
          { actualWeightVsRecipeOk: false },
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── confirmLiquidReady (P05-A13) — input validation ──
  describe('confirmLiquidReady', () => {
    const baseMelting = {
      id: 'melt-1',
      organizationId: ORG_ID,
      status: 'IN_PROGRESS',
      stage: 'A12_RECORD_MELT_OUTPUT',
    };

    it('succeeds and advances the stage when ready and operator-confirmed', async () => {
      prisma.steelMelting.findFirst.mockResolvedValue(baseMelting);
      prisma.steelMelting.update.mockResolvedValue({ id: 'melt-1' });
      prisma.steelMelting.findUnique.mockResolvedValue({
        id: 'melt-1',
        stage: 'A13_CONFIRM_LIQUID_READY',
      });

      const dto: ConfirmLiquidReadyDto = {
        liquidReady: true,
        liquidOperatorConfirmed: true,
      };
      await service.confirmLiquidReady('melt-1', dto, USER_ID, ORG_ID);

      expect(prisma.steelMelting.update).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({ stage: 'A13_CONFIRM_LIQUID_READY' }),
        }),
      );
    });

    it('rejects when liquid steel is not confirmed ready', async () => {
      prisma.steelMelting.findFirst.mockResolvedValue(baseMelting);
      const dto: ConfirmLiquidReadyDto = {
        liquidReady: false,
        liquidOperatorConfirmed: false,
      };
      await expect(
        service.confirmLiquidReady('melt-1', dto, USER_ID, ORG_ID),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.steelMelting.update).not.toHaveBeenCalled();
    });

    it('rejects when ready but the operator has not confirmed', async () => {
      prisma.steelMelting.findFirst.mockResolvedValue(baseMelting);
      const dto: ConfirmLiquidReadyDto = {
        liquidReady: true,
        liquidOperatorConfirmed: false,
      };
      await expect(
        service.confirmLiquidReady('melt-1', dto, USER_ID, ORG_ID),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.steelMelting.update).not.toHaveBeenCalled();
    });

    it('rejects when operator-confirmed but not actually ready', async () => {
      prisma.steelMelting.findFirst.mockResolvedValue(baseMelting);
      const dto: ConfirmLiquidReadyDto = {
        liquidReady: false,
        liquidOperatorConfirmed: true,
      };
      await expect(
        service.confirmLiquidReady('melt-1', dto, USER_ID, ORG_ID),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.steelMelting.update).not.toHaveBeenCalled();
    });
  });

  // ── refiningHandover (P05-A14) — terminal/irreversible ──
  describe('refiningHandover', () => {
    const dto: RefiningHandoverDto = { notes: 'Ready for refining' };

    it('closes the melting record on successful handover', async () => {
      prisma.steelMelting.findFirst.mockResolvedValue({
        id: 'melt-1',
        organizationId: ORG_ID,
        status: 'IN_PROGRESS',
        stage: 'A13_CONFIRM_LIQUID_READY',
        handoverToRefiningAt: null,
      });
      prisma.steelMelting.update.mockResolvedValue({ id: 'melt-1' });
      prisma.steelMelting.findUnique.mockResolvedValue({
        id: 'melt-1',
        status: 'CLOSED',
        stage: 'A14_HANDOVER_TO_REFINING',
      });

      const result = await service.refiningHandover(
        'melt-1',
        dto,
        USER_ID,
        ORG_ID,
      );

      expect(prisma.steelMelting.update).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({ status: 'CLOSED' }),
        }),
      );
      expect(result).toMatchObject({ status: 'CLOSED' });
    });

    it('rejects a duplicate/idempotent handover attempt', async () => {
      prisma.steelMelting.findFirst.mockResolvedValue({
        id: 'melt-1',
        organizationId: ORG_ID,
        status: 'IN_PROGRESS',
        stage: 'A14_HANDOVER_TO_REFINING',
        handoverToRefiningAt: new Date(),
      });

      await expect(
        service.refiningHandover('melt-1', dto, USER_ID, ORG_ID),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects handover when the liquid-ready step has not been completed', async () => {
      prisma.steelMelting.findFirst.mockResolvedValue({
        id: 'melt-1',
        organizationId: ORG_ID,
        status: 'IN_PROGRESS',
        stage: 'A12_RECORD_MELT_OUTPUT',
        handoverToRefiningAt: null,
      });

      await expect(
        service.refiningHandover('melt-1', dto, USER_ID, ORG_ID),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ── Reads ──
  describe('getById', () => {
    it('embeds allowedActions computed from stage and status', async () => {
      prisma.steelMelting.findFirst.mockResolvedValue({
        id: 'melt-1',
        organizationId: ORG_ID,
        status: 'IN_PROGRESS',
        stage: 'A01_CONFIRM_FURNACE_AVAILABILITY',
      });

      const result = await service.getById('melt-1', ORG_ID);
      expect(result.allowedActions).toEqual(['CHECK_LINING']);
    });

    it('returns no allowed actions once terminal (CLOSED)', async () => {
      prisma.steelMelting.findFirst.mockResolvedValue({
        id: 'melt-1',
        organizationId: ORG_ID,
        status: 'CLOSED',
        stage: 'A14_HANDOVER_TO_REFINING',
      });

      const result = await service.getById('melt-1', ORG_ID);
      expect(result.allowedActions).toEqual([]);
    });
  });
});
