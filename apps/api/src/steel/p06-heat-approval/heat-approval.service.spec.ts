import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from 'db';
import { HeatApprovalService } from './heat-approval.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { TakeSampleDto, ReleaseToCastingDto } from './dto/heat-approval.dto';

interface PrismaMock {
  employee: { findFirst: jest.Mock };
  steelMelting: { findFirst: jest.Mock };
  steelHeatApproval: {
    create: jest.Mock;
    update: jest.Mock;
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
    groupBy: jest.Mock;
  };
  steelHeatApprovalActivityLog: { create: jest.Mock };
  $transaction: jest.Mock;
}

// Minimal Prisma mock: `$transaction` supports both the callback form (used
// by every write) and the array form (used by getAll/getSummary), matching
// how the service actually calls it.
function createPrismaMock(): PrismaMock {
  const prisma = {
    employee: { findFirst: jest.fn() },
    steelMelting: { findFirst: jest.fn() },
    steelHeatApproval: {
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    steelHeatApprovalActivityLog: { create: jest.fn() },
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
const MELTING = {
  id: 'melt-1',
  organizationId: ORG_ID,
  status: 'CLOSED',
  stage: 'A14_HANDOVER_TO_REFINING',
  heatInProcessNumber: 'HP-2026-00001',
};

describe('HeatApprovalService', () => {
  let service: HeatApprovalService;
  let prisma: ReturnType<typeof createPrismaMock>;

  beforeEach(async () => {
    prisma = createPrismaMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HeatApprovalService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<HeatApprovalService>(HeatApprovalService);
    prisma.employee.findFirst.mockResolvedValue(EMPLOYEE);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── Create heat approval (P06-A01) — P05 -> P06 handover ──
  describe('createHeatApproval', () => {
    const dto: TakeSampleDto = { meltingId: 'melt-1', sampleRef: 'S-1' };

    it('creates a heat approval record against a melting record that completed refining handover', async () => {
      prisma.steelMelting.findFirst.mockResolvedValue(MELTING);
      prisma.steelHeatApproval.count.mockResolvedValue(0);
      prisma.steelHeatApproval.create.mockResolvedValue({ id: 'ha-1' });
      prisma.steelHeatApproval.findUnique.mockResolvedValue({
        id: 'ha-1',
        stage: 'A01_TAKE_SAMPLE',
        status: 'IN_PROGRESS',
      });

      const result = await service.createHeatApproval(dto, USER_ID, ORG_ID);

      expect(prisma.steelHeatApproval.create).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            meltingId: 'melt-1',
            approvalNumber: 'HA-' + new Date().getFullYear() + '-00001',
          }),
        }),
      );
      expect(result).toMatchObject({ id: 'ha-1' });
    });

    it('rejects when the parent melting record is not found', async () => {
      prisma.steelMelting.findFirst.mockResolvedValue(null);
      await expect(
        service.createHeatApproval(dto, USER_ID, ORG_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects when the melting record has not completed refining handover (wrong status)', async () => {
      prisma.steelMelting.findFirst.mockResolvedValue({
        ...MELTING,
        status: 'IN_PROGRESS',
      });
      await expect(
        service.createHeatApproval(dto, USER_ID, ORG_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when the melting record has not completed refining handover (wrong stage)', async () => {
      prisma.steelMelting.findFirst.mockResolvedValue({
        ...MELTING,
        stage: 'A13_CONFIRM_LIQUID_READY',
      });
      await expect(
        service.createHeatApproval(dto, USER_ID, ORG_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('is org-scoped — a melting record from another organization is treated as not found', async () => {
      prisma.steelMelting.findFirst.mockResolvedValue(null);
      await service
        .createHeatApproval(dto, USER_ID, 'other-org')
        .catch(() => undefined);
      expect(prisma.steelMelting.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'melt-1', organizationId: 'other-org' },
        }),
      );
    });

    it('rejects a melting record already consumed by another heat approval record (unique constraint)', async () => {
      prisma.steelMelting.findFirst.mockResolvedValue(MELTING);
      prisma.steelHeatApproval.count.mockResolvedValue(0);
      prisma.steelHeatApproval.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
          meta: { target: ['meltingId'] },
        }),
      );

      await expect(
        service.createHeatApproval(dto, USER_ID, ORG_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when the acting user has no linked employee profile', async () => {
      prisma.employee.findFirst.mockResolvedValue(null);
      await expect(
        service.createHeatApproval(dto, USER_ID, ORG_ID),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ── Sequential stage transitions ──
  describe('stage transitions', () => {
    it('analyzeSample rejects when called out of order (before A01)', async () => {
      prisma.steelHeatApproval.findFirst.mockResolvedValue({
        id: 'ha-1',
        organizationId: ORG_ID,
        status: 'IN_PROGRESS',
        stage: 'A03_COMPARE_CHEMISTRY', // already past A01
      });

      await expect(
        service.analyzeSample(
          'ha-1',
          { chemistryComposition: { C: 0.2 } },
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('analyzeSample advances the record from A01 to A02', async () => {
      prisma.steelHeatApproval.findFirst.mockResolvedValue({
        id: 'ha-1',
        organizationId: ORG_ID,
        status: 'IN_PROGRESS',
        stage: 'A01_TAKE_SAMPLE',
      });
      prisma.steelHeatApproval.update.mockResolvedValue({ id: 'ha-1' });
      prisma.steelHeatApproval.findUnique.mockResolvedValue({
        id: 'ha-1',
        stage: 'A02_ANALYZE_SAMPLE',
      });

      await service.analyzeSample(
        'ha-1',
        { chemistryComposition: { C: 0.2 } },
        USER_ID,
        ORG_ID,
      );

      expect(prisma.steelHeatApproval.update).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({ stage: 'A02_ANALYZE_SAMPLE' }),
        }),
      );
    });

    it('rejects duplicate execution of a step already completed', async () => {
      prisma.steelHeatApproval.findFirst.mockResolvedValue({
        id: 'ha-1',
        organizationId: ORG_ID,
        status: 'IN_PROGRESS',
        stage: 'A05_ADD_CORRECTION_MATERIAL', // A02 already done
      });

      await expect(
        service.analyzeSample(
          'ha-1',
          { chemistryComposition: { C: 0.2 } },
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects any action on a record that is not found (wrong org or nonexistent)', async () => {
      prisma.steelHeatApproval.findFirst.mockResolvedValue(null);
      await expect(
        service.analyzeSample(
          'ha-x',
          { chemistryComposition: { C: 0.2 } },
          USER_ID,
          'wrong-org',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects any action on a CANCELLED record', async () => {
      prisma.steelHeatApproval.findFirst.mockResolvedValue({
        id: 'ha-1',
        organizationId: ORG_ID,
        status: 'CANCELLED',
        stage: 'A01_TAKE_SAMPLE',
      });
      await expect(
        service.analyzeSample(
          'ha-1',
          { chemistryComposition: { C: 0.2 } },
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects a staged action on a CLOSED record, but allows the manual status override', async () => {
      prisma.steelHeatApproval.findFirst.mockResolvedValue({
        id: 'ha-1',
        organizationId: ORG_ID,
        status: 'CLOSED',
        stage: 'A13_RELEASE_TO_CASTING',
      });

      await expect(
        service.analyzeSample(
          'ha-1',
          { chemistryComposition: { C: 0.2 } },
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(ConflictException);

      prisma.steelHeatApproval.update.mockResolvedValue({
        id: 'ha-1',
        status: 'ON_HOLD',
      });
      await expect(
        service.updateStatus('ha-1', { status: 'ON_HOLD' }, USER_ID, ORG_ID),
      ).resolves.toBeDefined(); // override deliberately bypasses stage/status validation
    });

    it('rejects any staged action on an ON_HOLD record', async () => {
      prisma.steelHeatApproval.findFirst.mockResolvedValue({
        id: 'ha-1',
        organizationId: ORG_ID,
        status: 'ON_HOLD',
        stage: 'A01_TAKE_SAMPLE',
      });
      await expect(
        service.analyzeSample(
          'ha-1',
          { chemistryComposition: { C: 0.2 } },
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ── analyzeSample (P06-A02) — input validation ──
  describe('analyzeSample validation', () => {
    it('rejects an empty chemistry composition and does not advance the stage', async () => {
      prisma.steelHeatApproval.findFirst.mockResolvedValue({
        id: 'ha-1',
        organizationId: ORG_ID,
        status: 'IN_PROGRESS',
        stage: 'A01_TAKE_SAMPLE',
      });

      await expect(
        service.analyzeSample(
          'ha-1',
          { chemistryComposition: {} },
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.steelHeatApproval.update).not.toHaveBeenCalled();
    });
  });

  // ── addCorrectionMaterial (P06-A05) — conditional on A04's decision ──
  describe('addCorrectionMaterial validation', () => {
    it('requires correction materials when correction was determined to be required', async () => {
      prisma.steelHeatApproval.findFirst.mockResolvedValue({
        id: 'ha-1',
        organizationId: ORG_ID,
        status: 'IN_PROGRESS',
        stage: 'A04_DECIDE_CORRECTION',
        correctionRequired: true,
      });

      await expect(
        service.addCorrectionMaterial(
          'ha-1',
          { correctionMaterials: [] },
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.steelHeatApproval.update).not.toHaveBeenCalled();
    });

    it('allows "not applicable" when no correction was required', async () => {
      prisma.steelHeatApproval.findFirst.mockResolvedValue({
        id: 'ha-1',
        organizationId: ORG_ID,
        status: 'IN_PROGRESS',
        stage: 'A04_DECIDE_CORRECTION',
        correctionRequired: false,
      });
      prisma.steelHeatApproval.update.mockResolvedValue({ id: 'ha-1' });
      prisma.steelHeatApproval.findUnique.mockResolvedValue({
        id: 'ha-1',
        stage: 'A05_ADD_CORRECTION_MATERIAL',
      });

      await service.addCorrectionMaterial(
        'ha-1',
        { correctionNotApplicable: true },
        USER_ID,
        ORG_ID,
      );

      expect(prisma.steelHeatApproval.update).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            stage: 'A05_ADD_CORRECTION_MATERIAL',
          }),
        }),
      );
    });

    it('accepts correction materials when correction was required', async () => {
      prisma.steelHeatApproval.findFirst.mockResolvedValue({
        id: 'ha-1',
        organizationId: ORG_ID,
        status: 'IN_PROGRESS',
        stage: 'A04_DECIDE_CORRECTION',
        correctionRequired: true,
      });
      prisma.steelHeatApproval.update.mockResolvedValue({ id: 'ha-1' });
      prisma.steelHeatApproval.findUnique.mockResolvedValue({
        id: 'ha-1',
        stage: 'A05_ADD_CORRECTION_MATERIAL',
      });

      await service.addCorrectionMaterial(
        'ha-1',
        {
          correctionMaterials: [{ material: 'FeSi', quantity: 12, unit: 'kg' }],
        },
        USER_ID,
        ORG_ID,
      );

      expect(prisma.steelHeatApproval.update).toHaveBeenCalled();
    });
  });

  // ── retestChemistry (P06-A06) — conditional on A04's decision ──
  describe('retestChemistry validation', () => {
    it('requires a re-test result when correction was required', async () => {
      prisma.steelHeatApproval.findFirst.mockResolvedValue({
        id: 'ha-1',
        organizationId: ORG_ID,
        status: 'IN_PROGRESS',
        stage: 'A05_ADD_CORRECTION_MATERIAL',
        correctionRequired: true,
      });

      await expect(
        service.retestChemistry(
          'ha-1',
          { retestChemistryComposition: {} },
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.steelHeatApproval.update).not.toHaveBeenCalled();
    });

    it('allows "not applicable" when no correction was required', async () => {
      prisma.steelHeatApproval.findFirst.mockResolvedValue({
        id: 'ha-1',
        organizationId: ORG_ID,
        status: 'IN_PROGRESS',
        stage: 'A05_ADD_CORRECTION_MATERIAL',
        correctionRequired: false,
      });
      prisma.steelHeatApproval.update.mockResolvedValue({ id: 'ha-1' });
      prisma.steelHeatApproval.findUnique.mockResolvedValue({
        id: 'ha-1',
        stage: 'A06_RETEST_CHEMISTRY',
      });

      await service.retestChemistry(
        'ha-1',
        { retestNotApplicable: true },
        USER_ID,
        ORG_ID,
      );

      expect(prisma.steelHeatApproval.update).toHaveBeenCalled();
    });
  });

  // ── checkLadleReadiness (P06-A08) — safety-gate validation ──
  describe('checkLadleReadiness validation', () => {
    const baseHeatApproval = {
      id: 'ha-1',
      organizationId: ORG_ID,
      status: 'IN_PROGRESS',
      stage: 'A07_CHECK_TEMPERATURE',
    };

    it('succeeds and advances the stage when the ladle is ready with a recorded condition', async () => {
      prisma.steelHeatApproval.findFirst.mockResolvedValue(baseHeatApproval);
      prisma.steelHeatApproval.update.mockResolvedValue({ id: 'ha-1' });
      prisma.steelHeatApproval.findUnique.mockResolvedValue({
        id: 'ha-1',
        stage: 'A08_CHECK_LADLE_READINESS',
      });

      await service.checkLadleReadiness(
        'ha-1',
        { ladleLiningCondition: 'Good', ladleReady: true },
        USER_ID,
        ORG_ID,
      );

      expect(prisma.steelHeatApproval.update).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            stage: 'A08_CHECK_LADLE_READINESS',
          }),
        }),
      );
    });

    it('rejects an empty lining condition', async () => {
      prisma.steelHeatApproval.findFirst.mockResolvedValue(baseHeatApproval);
      await expect(
        service.checkLadleReadiness(
          'ha-1',
          { ladleLiningCondition: '', ladleReady: true },
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.steelHeatApproval.update).not.toHaveBeenCalled();
    });

    it('rejects when the ladle is not ready', async () => {
      prisma.steelHeatApproval.findFirst.mockResolvedValue(baseHeatApproval);
      await expect(
        service.checkLadleReadiness(
          'ha-1',
          { ladleLiningCondition: 'Good', ladleReady: false },
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.steelHeatApproval.update).not.toHaveBeenCalled();
    });
  });

  // ── approveChemistryTemperature (P06-A09) — authority gate ──
  describe('approveChemistryTemperature validation', () => {
    it('rejects when not approved', async () => {
      prisma.steelHeatApproval.findFirst.mockResolvedValue({
        id: 'ha-1',
        organizationId: ORG_ID,
        status: 'IN_PROGRESS',
        stage: 'A08_CHECK_LADLE_READINESS',
      });
      await expect(
        service.approveChemistryTemperature(
          'ha-1',
          { chemistryTemperatureApproved: false },
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.steelHeatApproval.update).not.toHaveBeenCalled();
    });
  });

  // ── confirmHeatNumber (P06-A10) ──
  describe('confirmHeatNumber', () => {
    it('defaults to the melting record heat-in-process number when none is supplied', async () => {
      prisma.steelHeatApproval.findFirst.mockResolvedValue({
        id: 'ha-1',
        organizationId: ORG_ID,
        status: 'IN_PROGRESS',
        stage: 'A09_APPROVE_CHEMISTRY_TEMPERATURE',
        melting: { heatInProcessNumber: 'HP-2026-00001' },
      });
      prisma.steelHeatApproval.update.mockResolvedValue({ id: 'ha-1' });
      prisma.steelHeatApproval.findUnique.mockResolvedValue({
        id: 'ha-1',
        heatNumber: 'HP-2026-00001',
      });

      await service.confirmHeatNumber('ha-1', {}, USER_ID, ORG_ID);

      expect(prisma.steelHeatApproval.update).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({ heatNumber: 'HP-2026-00001' }),
        }),
      );
    });

    it('rejects a heat number already used by another record (unique constraint)', async () => {
      prisma.steelHeatApproval.findFirst.mockResolvedValue({
        id: 'ha-1',
        organizationId: ORG_ID,
        status: 'IN_PROGRESS',
        stage: 'A09_APPROVE_CHEMISTRY_TEMPERATURE',
        melting: { heatInProcessNumber: 'HP-2026-00001' },
      });
      prisma.steelHeatApproval.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
          meta: { target: ['heatNumber'] },
        }),
      );

      await expect(
        service.confirmHeatNumber('ha-1', {}, USER_ID, ORG_ID),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── tappingApproval (P06-A11) — authority gate ──
  describe('tappingApproval validation', () => {
    it('rejects when tapping is not approved', async () => {
      prisma.steelHeatApproval.findFirst.mockResolvedValue({
        id: 'ha-1',
        organizationId: ORG_ID,
        status: 'IN_PROGRESS',
        stage: 'A10_CONFIRM_HEAT_NUMBER',
      });
      await expect(
        service.tappingApproval(
          'ha-1',
          { tappingApproved: false },
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.steelHeatApproval.update).not.toHaveBeenCalled();
    });
  });

  // ── releaseToCasting (P06-A13) — terminal/irreversible ──
  describe('releaseToCasting', () => {
    const dto: ReleaseToCastingDto = { notes: 'Ready for casting' };

    it('closes the heat approval record on successful release', async () => {
      prisma.steelHeatApproval.findFirst.mockResolvedValue({
        id: 'ha-1',
        organizationId: ORG_ID,
        status: 'IN_PROGRESS',
        stage: 'A12_TAP_TO_LADLE',
        releasedToCastingAt: null,
      });
      prisma.steelHeatApproval.update.mockResolvedValue({ id: 'ha-1' });
      prisma.steelHeatApproval.findUnique.mockResolvedValue({
        id: 'ha-1',
        status: 'CLOSED',
        stage: 'A13_RELEASE_TO_CASTING',
      });

      const result = await service.releaseToCasting(
        'ha-1',
        dto,
        USER_ID,
        ORG_ID,
      );

      expect(prisma.steelHeatApproval.update).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({ status: 'CLOSED' }),
        }),
      );
      expect(result).toMatchObject({ status: 'CLOSED' });
    });

    it('rejects a duplicate/idempotent release attempt', async () => {
      prisma.steelHeatApproval.findFirst.mockResolvedValue({
        id: 'ha-1',
        organizationId: ORG_ID,
        status: 'IN_PROGRESS',
        stage: 'A13_RELEASE_TO_CASTING',
        releasedToCastingAt: new Date(),
      });

      await expect(
        service.releaseToCasting('ha-1', dto, USER_ID, ORG_ID),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects release when the tap-to-ladle step has not been completed', async () => {
      prisma.steelHeatApproval.findFirst.mockResolvedValue({
        id: 'ha-1',
        organizationId: ORG_ID,
        status: 'IN_PROGRESS',
        stage: 'A11_TAPPING_APPROVAL',
        releasedToCastingAt: null,
      });

      await expect(
        service.releaseToCasting('ha-1', dto, USER_ID, ORG_ID),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ── Reads ──
  describe('getById', () => {
    it('embeds allowedActions computed from stage and status', async () => {
      prisma.steelHeatApproval.findFirst.mockResolvedValue({
        id: 'ha-1',
        organizationId: ORG_ID,
        status: 'IN_PROGRESS',
        stage: 'A01_TAKE_SAMPLE',
      });

      const result = await service.getById('ha-1', ORG_ID);
      expect(result.allowedActions).toEqual(['ANALYZE_SAMPLE']);
    });

    it('returns no allowed actions once terminal (CLOSED)', async () => {
      prisma.steelHeatApproval.findFirst.mockResolvedValue({
        id: 'ha-1',
        organizationId: ORG_ID,
        status: 'CLOSED',
        stage: 'A13_RELEASE_TO_CASTING',
      });

      const result = await service.getById('ha-1', ORG_ID);
      expect(result.allowedActions).toEqual([]);
    });
  });
});
