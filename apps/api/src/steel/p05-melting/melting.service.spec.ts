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
  steelChargePreparation: { findFirst: jest.Mock; findMany: jest.Mock };
  steelMelting: {
    create: jest.Mock;
    update: jest.Mock;
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
    groupBy: jest.Mock;
    aggregate: jest.Mock;
  };
  steelMeltingActivityLog: { create: jest.Mock; findFirst: jest.Mock };
  furnace: { findFirst: jest.Mock; findMany: jest.Mock };
  furnaceLining: { findFirst: jest.Mock; update: jest.Mock };
  heatMaterialCharge: {
    create: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    groupBy: jest.Mock;
    aggregate: jest.Mock;
  };
  heatCycleEvent: {
    create: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
  };
  $transaction: jest.Mock;
}

// Minimal Prisma mock: `$transaction` supports both the callback form (used
// by every write) and the array form (used by getAll/getSummary), matching
// how the service actually calls it.
function createPrismaMock(): PrismaMock {
  const prisma = {
    employee: { findFirst: jest.fn() },
    steelChargePreparation: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    steelMelting: {
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
      aggregate: jest.fn(),
    },
    steelMeltingActivityLog: { create: jest.fn(), findFirst: jest.fn() },
    furnace: { findFirst: jest.fn(), findMany: jest.fn() },
    furnaceLining: { findFirst: jest.fn(), update: jest.fn() },
    heatMaterialCharge: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      groupBy: jest.fn(),
      aggregate: jest.fn(),
    },
    heatCycleEvent: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
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
    it('furnaceLiningCheck rejects when called out of order (before the previous step is done)', async () => {
      prisma.steelMelting.findFirst.mockResolvedValue({
        id: 'melt-1',
        organizationId: ORG_ID,
        status: 'IN_PROGRESS',
        stage: 'A01_CONFIRM_FURNACE_AVAILABILITY',
      });

      await expect(
        service.furnaceSystemsCheck(
          'melt-1',
          {
            waterPressureFlowOk: true,
            powerSystemOk: true,
            hydraulicSystemOk: true,
            alarmsOk: true,
          },
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

    it('rejects re-editing a step already completed when no reason is given', async () => {
      prisma.steelMelting.findFirst.mockResolvedValue({
        id: 'melt-1',
        organizationId: ORG_ID,
        status: 'IN_PROGRESS',
        stage: 'A05_VERIFY_CHARGE_RECIPE', // A02 already done
      });
      prisma.steelMeltingActivityLog.findFirst.mockResolvedValue({
        id: 'log-a02',
      });

      await expect(
        service.furnaceLiningCheck(
          'melt-1',
          { liningVisualCondition: 'Good' },
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows re-editing a step already completed when a reason is given, without moving the stage backward', async () => {
      prisma.steelMelting.findFirst.mockResolvedValue({
        id: 'melt-1',
        organizationId: ORG_ID,
        status: 'IN_PROGRESS',
        stage: 'A05_VERIFY_CHARGE_RECIPE', // A02 already done
      });
      prisma.steelMeltingActivityLog.findFirst.mockResolvedValue({
        id: 'log-a02',
      });
      prisma.steelMelting.update.mockResolvedValue({ id: 'melt-1' });
      prisma.steelMelting.findUnique.mockResolvedValue({
        id: 'melt-1',
        stage: 'A05_VERIFY_CHARGE_RECIPE',
      });

      await service.furnaceLiningCheck(
        'melt-1',
        { liningVisualCondition: 'Good', reason: 'Corrected condition typo' },
        USER_ID,
        ORG_ID,
      );

      expect(prisma.steelMelting.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({ stage: expect.anything() }),
        }),
      );
      expect(prisma.steelMeltingActivityLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            activity: 'A02',
            notes: 'Corrected condition typo',
          }),
        }),
      );
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

    it('still rejects re-editing an already-completed step before validating the safety gate, when no reason is given', async () => {
      prisma.steelMelting.findFirst.mockResolvedValue({
        ...baseMelting,
        stage: 'A05_VERIFY_CHARGE_RECIPE', // already past A03
      });
      prisma.steelMeltingActivityLog.findFirst.mockResolvedValue({
        id: 'log-a03',
      });

      await expect(
        service.furnaceSystemsCheck('melt-1', allOk, USER_ID, ORG_ID),
      ).rejects.toThrow(BadRequestException);
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

    it('increments the lining heat count when the heat used a referenced lining', async () => {
      prisma.steelMelting.findFirst.mockResolvedValue({
        id: 'melt-1',
        organizationId: ORG_ID,
        status: 'IN_PROGRESS',
        stage: 'A13_CONFIRM_LIQUID_READY',
        handoverToRefiningAt: null,
        liningRefId: 'lining-1',
      });
      prisma.steelMelting.update.mockResolvedValue({ id: 'melt-1' });
      prisma.steelMelting.findUnique.mockResolvedValue({
        id: 'melt-1',
        status: 'CLOSED',
      });

      await service.refiningHandover('melt-1', dto, USER_ID, ORG_ID);

      expect(prisma.furnaceLining.update).toHaveBeenCalledWith({
        where: { id: 'lining-1' },
        data: { heatsCompleted: { increment: 1 } },
      });
    });

    it('does not touch furnaceLining when the heat has no referenced lining', async () => {
      prisma.steelMelting.findFirst.mockResolvedValue({
        id: 'melt-1',
        organizationId: ORG_ID,
        status: 'IN_PROGRESS',
        stage: 'A13_CONFIRM_LIQUID_READY',
        handoverToRefiningAt: null,
        liningRefId: null,
      });
      prisma.steelMelting.update.mockResolvedValue({ id: 'melt-1' });
      prisma.steelMelting.findUnique.mockResolvedValue({ id: 'melt-1' });

      await service.refiningHandover('melt-1', dto, USER_ID, ORG_ID);

      expect(prisma.furnaceLining.update).not.toHaveBeenCalled();
    });
  });

  // ── Structured furnace/lining selection (P05-A01/A02) ──
  describe('furnace/lining reference validation', () => {
    it('rejects createMelting when the referenced furnace is not READY', async () => {
      prisma.steelChargePreparation.findFirst.mockResolvedValue(CHARGE);
      prisma.furnace.findFirst.mockResolvedValue({
        id: 'furnace-1',
        code: 'F1',
        status: 'MAINTENANCE',
      });

      await expect(
        service.createMelting(
          { chargePreparationId: 'charge-1', furnaceRefId: 'furnace-1' },
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects createMelting when the referenced furnace does not exist in this org', async () => {
      prisma.steelChargePreparation.findFirst.mockResolvedValue(CHARGE);
      prisma.furnace.findFirst.mockResolvedValue(null);

      await expect(
        service.createMelting(
          { chargePreparationId: 'charge-1', furnaceRefId: 'furnace-x' },
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects furnaceLiningCheck when the referenced lining is RETIRED', async () => {
      prisma.steelMelting.findFirst.mockResolvedValue({
        id: 'melt-1',
        organizationId: ORG_ID,
        status: 'IN_PROGRESS',
        stage: 'A01_CONFIRM_FURNACE_AVAILABILITY',
        furnaceRefId: 'furnace-1',
      });
      prisma.furnaceLining.findFirst.mockResolvedValue({
        id: 'lining-1',
        furnaceId: 'furnace-1',
        status: 'RETIRED',
      });

      await expect(
        service.furnaceLiningCheck(
          'melt-1',
          { liningVisualCondition: 'Good', liningRefId: 'lining-1' },
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects furnaceLiningCheck when the lining belongs to a different furnace than selected', async () => {
      prisma.steelMelting.findFirst.mockResolvedValue({
        id: 'melt-1',
        organizationId: ORG_ID,
        status: 'IN_PROGRESS',
        stage: 'A01_CONFIRM_FURNACE_AVAILABILITY',
        furnaceRefId: 'furnace-1',
      });
      prisma.furnaceLining.findFirst.mockResolvedValue({
        id: 'lining-1',
        furnaceId: 'furnace-2',
        status: 'ACTIVE',
      });

      await expect(
        service.furnaceLiningCheck(
          'melt-1',
          { liningVisualCondition: 'Good', liningRefId: 'lining-1' },
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── Material charges — multiple rows per heat ──
  describe('addMaterialCharge', () => {
    const activeMelting = {
      id: 'melt-1',
      organizationId: ORG_ID,
      status: 'IN_PROGRESS',
      stage: 'A06_LOAD_CHARGE',
    };

    it('creates the first charge row with sequence 1', async () => {
      prisma.steelMelting.findFirst.mockResolvedValue(activeMelting);
      prisma.heatMaterialCharge.findFirst.mockResolvedValue(null);
      prisma.heatMaterialCharge.create.mockResolvedValue({
        id: 'charge-row-1',
      });

      await service.addMaterialCharge(
        'melt-1',
        {
          material: 'Scrap A',
          materialCategory: 'SCRAP',
          actualQuantity: 5,
          unit: 'MT',
        },
        USER_ID,
        ORG_ID,
      );

      expect(prisma.heatMaterialCharge.create).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({ sequence: 1, material: 'Scrap A' }),
        }),
      );
    });

    it('increments the sequence for subsequent charge rows', async () => {
      prisma.steelMelting.findFirst.mockResolvedValue(activeMelting);
      prisma.heatMaterialCharge.findFirst.mockResolvedValue({ sequence: 3 });
      prisma.heatMaterialCharge.create.mockResolvedValue({
        id: 'charge-row-4',
      });

      await service.addMaterialCharge(
        'melt-1',
        {
          material: 'FeSi',
          materialCategory: 'ALLOY',
          actualQuantity: 0.2,
          unit: 'MT',
        },
        USER_ID,
        ORG_ID,
      );

      expect(prisma.heatMaterialCharge.create).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({ sequence: 4 }),
        }),
      );
    });

    it('rejects a charge against a CLOSED heat', async () => {
      prisma.steelMelting.findFirst.mockResolvedValue({
        ...activeMelting,
        status: 'CLOSED',
      });

      await expect(
        service.addMaterialCharge(
          'melt-1',
          {
            material: 'Scrap A',
            materialCategory: 'SCRAP',
            actualQuantity: 5,
            unit: 'MT',
          },
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(ConflictException);
      expect(prisma.heatMaterialCharge.create).not.toHaveBeenCalled();
    });
  });

  // ── Heat-cycle events ──
  describe('recordCycleEvent', () => {
    it('records an event against an active heat', async () => {
      prisma.steelMelting.findFirst.mockResolvedValue({
        id: 'melt-1',
        organizationId: ORG_ID,
        status: 'IN_PROGRESS',
        stage: 'A08_MONITOR_POWER',
      });
      prisma.heatCycleEvent.create.mockResolvedValue({ id: 'event-1' });

      await service.recordCycleEvent(
        'melt-1',
        { eventType: 'ALARM', notes: 'High temp alarm' },
        USER_ID,
        ORG_ID,
      );

      expect(prisma.heatCycleEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            eventType: 'ALARM',
            notes: 'High temp alarm',
          }),
        }),
      );
    });

    it('rejects an event against a CANCELLED heat', async () => {
      prisma.steelMelting.findFirst.mockResolvedValue({
        id: 'melt-1',
        organizationId: ORG_ID,
        status: 'CANCELLED',
        stage: 'A08_MONITOR_POWER',
      });

      await expect(
        service.recordCycleEvent(
          'melt-1',
          { eventType: 'ALARM' },
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(ConflictException);
      expect(prisma.heatCycleEvent.create).not.toHaveBeenCalled();
    });
  });

  // ── Heat efficiency summary — only business-confirmed formulas computed ──
  describe('getHeatSummary', () => {
    it('computes total material input and yield % from stored charges/output', async () => {
      prisma.steelMelting.findFirst.mockResolvedValue({
        id: 'melt-1',
        organizationId: ORG_ID,
        status: 'CLOSED',
        stage: 'A14_HANDOVER_TO_REFINING',
        heatInProcessNumber: 'HP-2026-00001',
        furnace: null,
        lining: null,
        outputWeightTonnes: 9,
        liquidTemperatureCelsius: 1600,
        outputEnergyTotalKwh: 5000,
        meltingStartTime: new Date('2026-01-01T00:00:00.000Z'),
        handoverToRefiningAt: new Date('2026-01-01T02:00:00.000Z'),
      });
      prisma.heatMaterialCharge.findMany.mockResolvedValue([
        { actualQuantity: 8, unit: 'MT' },
        { actualQuantity: 2, unit: 'MT' },
      ]);
      prisma.heatCycleEvent.count.mockResolvedValue(3);

      const summary = await service.getHeatSummary('melt-1', ORG_ID);

      expect(summary.totalMaterialInput).toBe(10);
      expect(summary.totalOutputTonnes).toBe(9);
      expect(summary.materialLossTonnes).toBe(1);
      expect(summary.yieldPercent).toBe(90);
      expect(summary.cycleDurationMinutes).toBe(120);
      // Not implemented — no business-confirmed formula exists yet.
      expect(summary.energyPerTonne).toBeNull();
    });

    it('leaves yield/loss null when output has not been recorded yet', async () => {
      prisma.steelMelting.findFirst.mockResolvedValue({
        id: 'melt-1',
        organizationId: ORG_ID,
        status: 'IN_PROGRESS',
        stage: 'A08_MONITOR_POWER',
        heatInProcessNumber: 'HP-2026-00001',
        furnace: null,
        lining: null,
        outputWeightTonnes: null,
        meltingStartTime: null,
        handoverToRefiningAt: null,
      });
      prisma.heatMaterialCharge.findMany.mockResolvedValue([
        { actualQuantity: 8, unit: 'MT' },
      ]);
      prisma.heatCycleEvent.count.mockResolvedValue(0);

      const summary = await service.getHeatSummary('melt-1', ORG_ID);

      expect(summary.totalMaterialInput).toBe(8);
      expect(summary.totalOutputTonnes).toBeNull();
      expect(summary.yieldPercent).toBeNull();
      expect(summary.materialLossTonnes).toBeNull();
      expect(summary.cycleDurationMinutes).toBeNull();
    });
  });

  // ── P05 management dashboard ──
  describe('getDashboard', () => {
    const furnaceA = {
      id: 'furnace-a',
      code: 'F1',
      name: 'Furnace 1',
      status: 'READY',
      linings: [
        {
          id: 'lining-a',
          installedAt: new Date('2026-01-01'),
          heatsCompleted: 5,
          condition: 'Good',
          thicknessRemainingMm: 40,
          status: 'ACTIVE',
        },
      ],
    };

    function setupDashboardMocks() {
      prisma.steelMelting.count
        .mockResolvedValueOnce(2) // activeHeatsCount
        .mockResolvedValueOnce(1); // completedHeatsCount
      prisma.steelMelting.findMany
        .mockResolvedValueOnce([
          {
            id: 'melt-closed-1',
            heatInProcessNumber: 'HP-2026-00001',
            chargeNumberSnapshot: 'CH-1',
            stage: 'A14_HANDOVER_TO_REFINING',
            status: 'CLOSED',
            furnaceRefId: 'furnace-a',
            furnace: { id: 'furnace-a', code: 'F1', name: 'Furnace 1' },
            liningRefId: 'lining-a',
            lining: { id: 'lining-a', heatsCompleted: 5 },
            meltingStartTime: new Date('2026-01-01T00:00:00.000Z'),
            handoverToRefiningAt: new Date('2026-01-01T02:00:00.000Z'),
            outputWeightTonnes: 9,
          },
        ]) // completedHeats
        .mockResolvedValueOnce([
          {
            id: 'melt-active-1',
            heatInProcessNumber: 'HP-2026-00002',
            stage: 'A08_MONITOR_POWER',
            status: 'IN_PROGRESS',
            furnaceRefId: 'furnace-a',
            furnace: { id: 'furnace-a', code: 'F1', name: 'Furnace 1' },
            meltingStartTime: new Date('2026-01-01T01:00:00.000Z'),
            createdAt: new Date('2026-01-01T01:00:00.000Z'),
            temperatureCelsius: 1420,
          },
        ]); // activeHeats
      prisma.furnace.findMany.mockResolvedValue([furnaceA]);
      prisma.heatMaterialCharge.aggregate.mockResolvedValue({
        _sum: { actualQuantity: 15 },
      });
      prisma.steelMelting.aggregate.mockResolvedValue({
        _sum: { outputWeightTonnes: 9 },
      });
      prisma.heatCycleEvent.findMany.mockResolvedValue([
        {
          id: 'event-1',
          occurredAt: new Date('2026-01-01T02:00:00.000Z'),
          eventType: 'ALARM',
          temperatureCelsius: null,
          quantity: null,
          unit: null,
          notes: 'High temp',
          melting: {
            id: 'melt-closed-1',
            heatInProcessNumber: 'HP-2026-00001',
          },
          recordedBy: { id: 'emp-1', firstName: 'A', lastName: 'B' },
        },
      ]);
      prisma.heatMaterialCharge.groupBy
        .mockResolvedValueOnce([
          { meltingId: 'melt-closed-1', _sum: { actualQuantity: 10 } },
        ]) // completed
        .mockResolvedValueOnce([
          { meltingId: 'melt-active-1', _sum: { actualQuantity: 3 } },
        ]); // active
    }

    it('computes yield, loss, and cycle duration from stored data only', async () => {
      setupDashboardMocks();

      const dashboard = await service.getDashboard(ORG_ID, {});

      expect(dashboard.kpis.activeHeats).toBe(2);
      expect(dashboard.kpis.completedHeats).toBe(1);
      expect(dashboard.kpis.averageYieldPercent).toBe(90); // 9/10 * 100
      expect(dashboard.materialOverview.totalLossTonnes).toBe(1); // 10 - 9
      expect(dashboard.recentHeats[0].cycleDurationMinutes).toBe(120);
    });

    it('never labels or computes a lining efficiency figure', async () => {
      setupDashboardMocks();
      const dashboard = await service.getDashboard(ORG_ID, {});
      const dashboardJson = JSON.stringify(dashboard).toLowerCase();
      expect(dashboardJson).not.toContain('liningefficiency');
      expect(dashboard.liningStatus[0]).toEqual(
        expect.objectContaining({ heatsCompleted: 5, condition: 'Good' }),
      );
    });

    it('scopes every query by the requested furnaceId', async () => {
      setupDashboardMocks();
      await service.getDashboard(ORG_ID, { furnaceId: 'furnace-a' });

      expect(prisma.steelMelting.count).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          where: expect.objectContaining({ furnaceRefId: 'furnace-a' }),
        }),
      );
    });

    it('reports furnace performance per furnace from the bounded completed-heats list', async () => {
      setupDashboardMocks();
      const dashboard = await service.getDashboard(ORG_ID, {});
      const perf = dashboard.furnacePerformance.find(
        (f) => f.furnaceId === 'furnace-a',
      );
      expect(perf).toMatchObject({
        heatsCompleted: 1,
        averageYieldPercent: 90,
      });
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
