import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from 'db';
import { ChargePreparationService } from './charge-preparation.service';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  CreateChargePreparationDto,
  SelectMaterialLotsDto,
  VerifyChargeMaterialDto,
  ReleaseChargeDto,
  CloseFurnaceHandoverDto,
} from './dto/charge-preparation.dto';

interface PrismaMock {
  employee: { findFirst: jest.Mock };
  steelProductionPlan: { findFirst: jest.Mock };
  steelMaterialIntake: { findMany: jest.Mock };
  steelChargePreparation: {
    create: jest.Mock;
    update: jest.Mock;
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
  };
  steelChargeMaterialLot: { createMany: jest.Mock; findMany: jest.Mock };
  steelChargePreparationActivityLog: { create: jest.Mock };
  $transaction: jest.Mock;
}

// Minimal Prisma mock: `$transaction` supports both the callback form
// (used by every write) and the array form (used by getAll/getSummary),
// matching how the service actually calls it.
function createPrismaMock(): PrismaMock {
  const prisma = {
    employee: { findFirst: jest.fn() },
    steelProductionPlan: { findFirst: jest.fn() },
    steelMaterialIntake: { findMany: jest.fn() },
    steelChargePreparation: {
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    steelChargeMaterialLot: { createMany: jest.fn(), findMany: jest.fn() },
    steelChargePreparationActivityLog: { create: jest.fn() },
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

describe('ChargePreparationService', () => {
  let service: ChargePreparationService;
  let prisma: ReturnType<typeof createPrismaMock>;

  beforeEach(async () => {
    prisma = createPrismaMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChargePreparationService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<ChargePreparationService>(ChargePreparationService);
    prisma.employee.findFirst.mockResolvedValue(EMPLOYEE);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── Create charge preparation ──
  describe('createChargePreparation', () => {
    it('creates a charge preparation against a released production plan, org-scoped', async () => {
      prisma.steelProductionPlan.findFirst.mockResolvedValue({
        id: 'plan-1',
        organizationId: ORG_ID,
        status: 'RELEASED',
      });
      prisma.steelChargePreparation.count.mockResolvedValue(0);
      prisma.steelChargePreparation.create.mockResolvedValue({ id: 'cp-1' });
      prisma.steelChargePreparation.findUnique.mockResolvedValue({
        id: 'cp-1',
        stage: 'A01_REQUIREMENT_REVIEWED',
        status: 'IN_PROGRESS',
      });

      const result = await service.createChargePreparation(
        { planId: 'plan-1' } as unknown as CreateChargePreparationDto,
        USER_ID,
        ORG_ID,
      );

      expect(prisma.steelProductionPlan.findFirst).toHaveBeenCalledWith({
        where: { id: 'plan-1', organizationId: ORG_ID },
      });
      expect(prisma.steelChargePreparation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            organizationId: ORG_ID,
            planId: 'plan-1',
            createdById: EMPLOYEE.id,
            stage: 'A01_REQUIREMENT_REVIEWED',
            status: 'IN_PROGRESS',
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            prepNumber: expect.stringMatching(/^CP-\d{4}-00001$/),
          }),
        }),
      );
      expect(result).toEqual(
        expect.objectContaining({
          id: 'cp-1',
          stage: 'A01_REQUIREMENT_REVIEWED',
        }),
      );
    });

    it('throws NotFoundException when the production plan does not exist', async () => {
      prisma.steelProductionPlan.findFirst.mockResolvedValue(null);

      await expect(
        service.createChargePreparation(
          { planId: 'missing' } as unknown as CreateChargePreparationDto,
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.steelChargePreparation.create).not.toHaveBeenCalled();
    });

    it('rejects charge preparation against a plan that is not released (P01-A12)', async () => {
      prisma.steelProductionPlan.findFirst.mockResolvedValue({
        id: 'plan-1',
        organizationId: ORG_ID,
        status: 'DRAFT',
      });

      await expect(
        service.createChargePreparation(
          { planId: 'plan-1' } as unknown as CreateChargePreparationDto,
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.steelChargePreparation.create).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when the caller has no linked employee profile', async () => {
      prisma.employee.findFirst.mockResolvedValue(null);

      await expect(
        service.createChargePreparation(
          { planId: 'plan-1' } as unknown as CreateChargePreparationDto,
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ── Stage transitions ──
  describe('stage transitions', () => {
    it('recordScrapSorting succeeds from A02 and advances to A03 (valid transition)', async () => {
      prisma.steelChargePreparation.findFirst.mockResolvedValue({
        id: 'cp-1',
        organizationId: ORG_ID,
        stage: 'A02_LOTS_SELECTED',
        status: 'IN_PROGRESS',
      });
      prisma.steelChargePreparation.update.mockResolvedValue({ id: 'cp-1' });
      prisma.steelChargePreparation.findUnique.mockResolvedValue({
        id: 'cp-1',
        stage: 'A03_SCRAP_SORTED',
      });

      const result = await service.recordScrapSorting(
        'cp-1',
        { sortedWeightTonnes: 10 } as any,
        USER_ID,
        ORG_ID,
      );

      expect(prisma.steelChargePreparation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({ stage: 'A03_SCRAP_SORTED' }),
        }),
      );
      expect(result).toEqual(
        expect.objectContaining({ stage: 'A03_SCRAP_SORTED' }),
      );
    });

    it('rejects recordScrapSorting when lots have not been selected yet (invalid: too early)', async () => {
      prisma.steelChargePreparation.findFirst.mockResolvedValue({
        id: 'cp-1',
        organizationId: ORG_ID,
        stage: 'A01_REQUIREMENT_REVIEWED',
        status: 'IN_PROGRESS',
      });

      await expect(
        service.recordScrapSorting(
          'cp-1',
          { sortedWeightTonnes: 10 } as any,
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(ConflictException);
      expect(prisma.steelChargePreparation.update).not.toHaveBeenCalled();
    });

    it('rejects selectMaterialLots when the preparation has already moved past that stage (invalid: already done)', async () => {
      prisma.steelChargePreparation.findFirst.mockResolvedValue({
        id: 'cp-1',
        organizationId: ORG_ID,
        stage: 'A05_CONTAMINANTS_REMOVED',
        status: 'IN_PROGRESS',
      });

      await expect(
        service.selectMaterialLots(
          'cp-1',
          { intakeIds: ['mi-1'] } as unknown as SelectMaterialLotsDto,
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects an unrecognized-id lookup with NotFoundException', async () => {
      prisma.steelChargePreparation.findFirst.mockResolvedValue(null);

      await expect(service.getById('missing', ORG_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── Lot selection ──
  describe('selectMaterialLots', () => {
    it('rejects a lot that is not in a released/available status', async () => {
      prisma.steelChargePreparation.findFirst.mockResolvedValue({
        id: 'cp-1',
        organizationId: ORG_ID,
        stage: 'A01_REQUIREMENT_REVIEWED',
        status: 'IN_PROGRESS',
      });
      prisma.steelMaterialIntake.findMany.mockResolvedValue([
        { id: 'mi-1', intakeNumber: 'MI-2026-00001', status: 'IN_PROGRESS' },
      ]);

      await expect(
        service.selectMaterialLots(
          'cp-1',
          { intakeIds: ['mi-1'] } as unknown as SelectMaterialLotsDto,
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.steelChargeMaterialLot.createMany).not.toHaveBeenCalled();
    });

    it('rejects lot ids that do not exist / are not in the org', async () => {
      prisma.steelChargePreparation.findFirst.mockResolvedValue({
        id: 'cp-1',
        organizationId: ORG_ID,
        stage: 'A01_REQUIREMENT_REVIEWED',
        status: 'IN_PROGRESS',
      });
      prisma.steelMaterialIntake.findMany.mockResolvedValue([]);

      await expect(
        service.selectMaterialLots(
          'cp-1',
          { intakeIds: ['missing'] } as unknown as SelectMaterialLotsDto,
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('accepts released lots and advances to A02', async () => {
      prisma.steelChargePreparation.findFirst.mockResolvedValue({
        id: 'cp-1',
        organizationId: ORG_ID,
        stage: 'A01_REQUIREMENT_REVIEWED',
        status: 'IN_PROGRESS',
      });
      prisma.steelMaterialIntake.findMany.mockResolvedValue([
        { id: 'mi-1', intakeNumber: 'MI-2026-00001', status: 'RELEASED' },
      ]);
      prisma.steelChargeMaterialLot.findMany.mockResolvedValue([]);
      prisma.steelChargeMaterialLot.createMany.mockResolvedValue({ count: 1 });
      prisma.steelChargePreparation.update.mockResolvedValue({ id: 'cp-1' });
      prisma.steelChargePreparation.findUnique.mockResolvedValue({
        id: 'cp-1',
        stage: 'A02_LOTS_SELECTED',
      });

      const result = await service.selectMaterialLots(
        'cp-1',
        { intakeIds: ['mi-1'] } as unknown as SelectMaterialLotsDto,
        USER_ID,
        ORG_ID,
      );

      expect(prisma.steelChargeMaterialLot.createMany).toHaveBeenCalled();
      expect(result).toEqual(
        expect.objectContaining({ stage: 'A02_LOTS_SELECTED' }),
      );
    });

    it('accepts multiple released lots and submits every selected id', async () => {
      prisma.steelChargePreparation.findFirst.mockResolvedValue({
        id: 'cp-1',
        organizationId: ORG_ID,
        stage: 'A01_REQUIREMENT_REVIEWED',
        status: 'IN_PROGRESS',
      });
      prisma.steelMaterialIntake.findMany.mockResolvedValue([
        { id: 'mi-1', intakeNumber: 'MI-2026-00001', status: 'RELEASED' },
        { id: 'mi-2', intakeNumber: 'MI-2026-00002', status: 'RELEASED' },
      ]);
      prisma.steelChargeMaterialLot.findMany.mockResolvedValue([]);
      prisma.steelChargeMaterialLot.createMany.mockResolvedValue({ count: 2 });
      prisma.steelChargePreparation.update.mockResolvedValue({ id: 'cp-1' });
      prisma.steelChargePreparation.findUnique.mockResolvedValue({
        id: 'cp-1',
        stage: 'A02_LOTS_SELECTED',
      });

      await service.selectMaterialLots(
        'cp-1',
        {
          intakeIds: ['mi-1', 'mi-2'],
          lotSelectionNotes: 'Two lots',
        } as unknown as SelectMaterialLotsDto,
        USER_ID,
        ORG_ID,
      );

      expect(prisma.steelChargeMaterialLot.createMany).toHaveBeenCalledWith({
        data: [
          { chargePreparationId: 'cp-1', intakeId: 'mi-1' },
          { chargePreparationId: 'cp-1', intakeId: 'mi-2' },
        ],
      });
    });

    it('rejects a released lot that is already allocated to another charge preparation', async () => {
      prisma.steelChargePreparation.findFirst.mockResolvedValue({
        id: 'cp-2',
        organizationId: ORG_ID,
        stage: 'A01_REQUIREMENT_REVIEWED',
        status: 'IN_PROGRESS',
      });
      prisma.steelMaterialIntake.findMany.mockResolvedValue([
        { id: 'mi-1', intakeNumber: 'MI-2026-00001', status: 'RELEASED' },
      ]);
      prisma.steelChargeMaterialLot.findMany.mockResolvedValue([
        {
          chargePreparationId: 'cp-1',
          intakeId: 'mi-1',
          intake: { intakeNumber: 'MI-2026-00001' },
        },
      ]);

      await expect(
        service.selectMaterialLots(
          'cp-2',
          { intakeIds: ['mi-1'] } as unknown as SelectMaterialLotsDto,
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.steelChargeMaterialLot.createMany).not.toHaveBeenCalled();
    });

    it('allows a different released lot that is not allocated elsewhere', async () => {
      prisma.steelChargePreparation.findFirst.mockResolvedValue({
        id: 'cp-2',
        organizationId: ORG_ID,
        stage: 'A01_REQUIREMENT_REVIEWED',
        status: 'IN_PROGRESS',
      });
      prisma.steelMaterialIntake.findMany.mockResolvedValue([
        { id: 'mi-2', intakeNumber: 'MI-2026-00002', status: 'RELEASED' },
      ]);
      prisma.steelChargeMaterialLot.findMany.mockResolvedValue([]);
      prisma.steelChargeMaterialLot.createMany.mockResolvedValue({ count: 1 });
      prisma.steelChargePreparation.update.mockResolvedValue({ id: 'cp-2' });
      prisma.steelChargePreparation.findUnique.mockResolvedValue({
        id: 'cp-2',
        stage: 'A02_LOTS_SELECTED',
      });

      const result = await service.selectMaterialLots(
        'cp-2',
        { intakeIds: ['mi-2'] } as unknown as SelectMaterialLotsDto,
        USER_ID,
        ORG_ID,
      );

      expect(prisma.steelChargeMaterialLot.createMany).toHaveBeenCalled();
      expect(result).toEqual(
        expect.objectContaining({ stage: 'A02_LOTS_SELECTED' }),
      );
    });

    it('rejects cleanly when a concurrent request allocates the same lot first (DB unique constraint)', async () => {
      // Simulates the race: the pre-check passes (findMany returns []) because
      // another request's transaction hasn't committed yet, but the DB unique
      // constraint on intakeId catches the collision at insert time.
      prisma.steelChargePreparation.findFirst.mockResolvedValue({
        id: 'cp-3',
        organizationId: ORG_ID,
        stage: 'A01_REQUIREMENT_REVIEWED',
        status: 'IN_PROGRESS',
      });
      prisma.steelMaterialIntake.findMany.mockResolvedValue([
        { id: 'mi-1', intakeNumber: 'MI-2026-00001', status: 'RELEASED' },
      ]);
      prisma.steelChargeMaterialLot.findMany.mockResolvedValue([]);
      const p2002 = Object.assign(
        new Error('Unique constraint failed on the fields: (`intakeId`)'),
        { code: 'P2002', meta: { target: ['intakeId'] } },
      );
      Object.setPrototypeOf(
        p2002,
        Prisma.PrismaClientKnownRequestError.prototype,
      );
      prisma.steelChargeMaterialLot.createMany.mockRejectedValue(p2002);

      await expect(
        service.selectMaterialLots(
          'cp-3',
          { intakeIds: ['mi-1'] } as unknown as SelectMaterialLotsDto,
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── Verification / release ──
  describe('verifyChargeMaterial and releaseCharge', () => {
    it('computes weight variance against the recipe totals and defaults approval when there is none', async () => {
      prisma.steelChargePreparation.findFirst.mockResolvedValue({
        id: 'cp-1',
        organizationId: ORG_ID,
        stage: 'A09_MATERIAL_STAGED',
        status: 'IN_PROGRESS',
        recipeScrapWeightTonnes: 10,
        recipeDriWeightTonnes: 2,
        recipeAlloyWeightTonnes: 0,
        recipeAdditiveWeightTonnes: 0,
      });
      prisma.steelChargePreparation.update.mockResolvedValue({ id: 'cp-1' });
      prisma.steelChargePreparation.findUnique.mockResolvedValue({
        id: 'cp-1',
        stage: 'A10_VERIFICATION_DONE',
      });

      await service.verifyChargeMaterial(
        'cp-1',
        { actualWeightTonnes: 12 } as unknown as VerifyChargeMaterialDto,
        USER_ID,
        ORG_ID,
      );

      expect(prisma.steelChargePreparation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            weightVarianceTonnes: 0,
            varianceApproved: true,
          }),
        }),
      );
    });

    it('blocks releaseCharge when there is an unresolved (unapproved) variance', async () => {
      prisma.steelChargePreparation.findFirst.mockResolvedValue({
        id: 'cp-1',
        organizationId: ORG_ID,
        stage: 'A10_VERIFICATION_DONE',
        status: 'IN_PROGRESS',
        chargeNumber: null,
        weightVarianceTonnes: 5,
        varianceApproved: false,
      });

      await expect(
        service.releaseCharge(
          'cp-1',
          {} as unknown as ReleaseChargeDto,
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.steelChargePreparation.update).not.toHaveBeenCalled();
    });

    it('releases a Charge ID once variance is approved', async () => {
      prisma.steelChargePreparation.findFirst.mockResolvedValue({
        id: 'cp-1',
        organizationId: ORG_ID,
        stage: 'A10_VERIFICATION_DONE',
        status: 'IN_PROGRESS',
        chargeNumber: null,
        weightVarianceTonnes: 5,
        varianceApproved: true,
      });
      prisma.steelChargePreparation.count.mockResolvedValue(0);
      prisma.steelChargePreparation.update.mockResolvedValue({ id: 'cp-1' });
      prisma.steelChargePreparation.findUnique.mockResolvedValue({
        id: 'cp-1',
        stage: 'A11_CHARGE_RELEASED',
        chargeNumber: 'CH-2026-00001',
      });

      const result = await service.releaseCharge(
        'cp-1',
        {} as unknown as ReleaseChargeDto,
        USER_ID,
        ORG_ID,
      );

      expect(prisma.steelChargePreparation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            chargeNumber: expect.stringMatching(/^CH-\d{4}-00001$/),
            stage: 'A11_CHARGE_RELEASED',
          }),
        }),
      );
      expect(result).toEqual(
        expect.objectContaining({ chargeNumber: 'CH-2026-00001' }),
      );
    });

    it('prevents releasing a Charge ID twice (idempotency guard)', async () => {
      prisma.steelChargePreparation.findFirst.mockResolvedValue({
        id: 'cp-1',
        organizationId: ORG_ID,
        stage: 'A11_CHARGE_RELEASED',
        status: 'IN_PROGRESS',
        chargeNumber: 'CH-2026-00001',
      });

      await expect(
        service.releaseCharge(
          'cp-1',
          {} as unknown as ReleaseChargeDto,
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(ConflictException);
      expect(prisma.steelChargePreparation.update).not.toHaveBeenCalled();
    });
  });

  // ── Furnace handover ──
  describe('closeFurnaceHandover', () => {
    it('blocks handover before the Charge ID has been released (A11)', async () => {
      prisma.steelChargePreparation.findFirst.mockResolvedValue({
        id: 'cp-1',
        organizationId: ORG_ID,
        stage: 'A10_VERIFICATION_DONE',
        status: 'IN_PROGRESS',
        chargeNumber: null,
      });

      await expect(
        service.closeFurnaceHandover(
          'cp-1',
          {
            furnaceReadinessConfirmed: true,
          } as unknown as CloseFurnaceHandoverDto,
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(ConflictException);
      expect(prisma.steelChargePreparation.update).not.toHaveBeenCalled();
    });

    it('closes handover successfully once the charge is released and readiness confirmed', async () => {
      prisma.steelChargePreparation.findFirst.mockResolvedValue({
        id: 'cp-1',
        organizationId: ORG_ID,
        stage: 'A11_CHARGE_RELEASED',
        status: 'IN_PROGRESS',
        chargeNumber: 'CH-2026-00001',
      });
      prisma.steelChargePreparation.update.mockResolvedValue({ id: 'cp-1' });
      prisma.steelChargePreparation.findUnique.mockResolvedValue({
        id: 'cp-1',
        stage: 'A12_HANDOVER_CLOSED',
        status: 'CLOSED',
      });

      const result = await service.closeFurnaceHandover(
        'cp-1',
        {
          furnaceReadinessConfirmed: true,
        } as unknown as CloseFurnaceHandoverDto,
        USER_ID,
        ORG_ID,
      );

      expect(prisma.steelChargePreparation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            stage: 'A12_HANDOVER_CLOSED',
            status: 'CLOSED',
          }),
        }),
      );
      expect(result).toEqual(
        expect.objectContaining({ stage: 'A12_HANDOVER_CLOSED' }),
      );
    });

    it('rejects a second furnace handover attempt on an already-CLOSED record', async () => {
      prisma.steelChargePreparation.findFirst.mockResolvedValue({
        id: 'cp-1',
        organizationId: ORG_ID,
        stage: 'A12_HANDOVER_CLOSED',
        status: 'CLOSED',
        chargeNumber: 'CH-2026-00001',
      });

      await expect(
        service.closeFurnaceHandover(
          'cp-1',
          {
            furnaceReadinessConfirmed: true,
          } as unknown as CloseFurnaceHandoverDto,
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(ConflictException);
      expect(prisma.steelChargePreparation.update).not.toHaveBeenCalled();
    });
  });
});
