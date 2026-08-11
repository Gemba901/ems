import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { MaterialIntakeService } from './material-intake.service';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  RecordGrossWeightDto,
  RecordNetWeightDto,
  CreateMaterialIntakeDto,
  VerifyMaterialIntakeDocumentsDto,
  RecordAcceptanceDecisionDto,
  RecordUnloadingDto,
  ReleaseToStockDto,
} from './dto/material-intake.dto';

interface PrismaMock {
  employee: { findFirst: jest.Mock };
  steelSourcingOrder: { findFirst: jest.Mock };
  steelMaterialIntake: {
    create: jest.Mock;
    update: jest.Mock;
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
  };
  steelMaterialIntakeActivityLog: { create: jest.Mock };
  $transaction: jest.Mock;
}

// Minimal Prisma mock: `$transaction` supports both the callback form
// (`$transaction(async (tx) => ...)`, used by every write) and the array
// form (`$transaction([...])`, used by getAll), matching how the service
// actually calls it. Model delegates are jest.fn() so each test can stub
// its own return values.
function createPrismaMock(): PrismaMock {
  const prisma = {
    employee: { findFirst: jest.fn() },
    steelSourcingOrder: { findFirst: jest.fn() },
    steelMaterialIntake: {
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    steelMaterialIntakeActivityLog: { create: jest.fn() },
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

describe('MaterialIntakeService', () => {
  let service: MaterialIntakeService;
  let prisma: ReturnType<typeof createPrismaMock>;

  beforeEach(async () => {
    prisma = createPrismaMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaterialIntakeService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<MaterialIntakeService>(MaterialIntakeService);
    prisma.employee.findFirst.mockResolvedValue(EMPLOYEE);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── 1. Create intake ──
  describe('createIntake', () => {
    it('creates an intake against a ready sourcing order, org-scoped (13. P02 sourcing order must exist / 14. org scoping)', async () => {
      prisma.steelSourcingOrder.findFirst.mockResolvedValue({
        id: 'so-1',
        organizationId: ORG_ID,
        stage: 'A11_INTAKE_INFORMED',
        status: 'IN_PROGRESS',
      });
      prisma.steelMaterialIntake.count.mockResolvedValue(0);
      prisma.steelMaterialIntake.create.mockResolvedValue({ id: 'mi-1' });
      prisma.steelMaterialIntake.findUnique.mockResolvedValue({
        id: 'mi-1',
        stage: 'A01_GATE_ARRIVAL_RECORDED',
        status: 'IN_PROGRESS',
      });

      const result = await service.createIntake(
        {
          sourcingOrderId: 'so-1',
          vehicleNumber: 'TRK-1',
        } as unknown as CreateMaterialIntakeDto,
        USER_ID,
        ORG_ID,
      );

      expect(prisma.steelSourcingOrder.findFirst).toHaveBeenCalledWith({
        where: { id: 'so-1', organizationId: ORG_ID },
      });
      expect(prisma.steelMaterialIntake.create).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            organizationId: ORG_ID,
            sourcingOrderId: 'so-1',
            createdById: EMPLOYEE.id,
            stage: 'A01_GATE_ARRIVAL_RECORDED',
            status: 'IN_PROGRESS',
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            intakeNumber: expect.stringMatching(/^MI-\d{4}-00001$/),
          }),
        }),
      );
      expect(result).toEqual(
        expect.objectContaining({
          id: 'mi-1',
          stage: 'A01_GATE_ARRIVAL_RECORDED',
        }),
      );
    });

    // ── 13. P02 sourcing order must exist ──
    it('throws NotFoundException when the sourcing order does not exist', async () => {
      prisma.steelSourcingOrder.findFirst.mockResolvedValue(null);

      await expect(
        service.createIntake(
          {
            sourcingOrderId: 'missing',
            vehicleNumber: 'TRK-1',
          } as unknown as CreateMaterialIntakeDto,
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.steelMaterialIntake.create).not.toHaveBeenCalled();
    });

    it('rejects intake creation before the sourcing order has informed the intake team (P02-A11)', async () => {
      prisma.steelSourcingOrder.findFirst.mockResolvedValue({
        id: 'so-1',
        organizationId: ORG_ID,
        stage: 'A05_QUOTATIONS_COLLECTED',
        status: 'IN_PROGRESS',
      });

      await expect(
        service.createIntake(
          {
            sourcingOrderId: 'so-1',
            vehicleNumber: 'TRK-1',
          } as unknown as CreateMaterialIntakeDto,
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.steelMaterialIntake.create).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when the caller has no linked employee profile', async () => {
      prisma.employee.findFirst.mockResolvedValue(null);

      await expect(
        service.createIntake(
          {
            sourcingOrderId: 'so-1',
            vehicleNumber: 'TRK-1',
          } as unknown as CreateMaterialIntakeDto,
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ── 2. Valid transition / 3. Invalid transition ──
  describe('stage transitions', () => {
    it('verifyDocuments succeeds from A01 and advances to A02 (valid transition)', async () => {
      prisma.steelMaterialIntake.findFirst.mockResolvedValue({
        id: 'mi-1',
        organizationId: ORG_ID,
        stage: 'A01_GATE_ARRIVAL_RECORDED',
        status: 'IN_PROGRESS',
      });
      prisma.steelMaterialIntake.update.mockResolvedValue({ id: 'mi-1' });
      prisma.steelMaterialIntake.findUnique.mockResolvedValue({
        id: 'mi-1',
        stage: 'A02_DOCUMENTS_VERIFIED',
      });

      const result = await service.verifyDocuments(
        'mi-1',
        {
          purchaseOrderVerified: true,
        } as unknown as VerifyMaterialIntakeDocumentsDto,
        USER_ID,
        ORG_ID,
      );

      expect(prisma.steelMaterialIntake.update).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({ stage: 'A02_DOCUMENTS_VERIFIED' }),
        }),
      );
      expect(result).toEqual(
        expect.objectContaining({ stage: 'A02_DOCUMENTS_VERIFIED' }),
      );
    });

    it('rejects recordGrossWeight when the intake has not passed document verification (invalid: too early)', async () => {
      prisma.steelMaterialIntake.findFirst.mockResolvedValue({
        id: 'mi-1',
        organizationId: ORG_ID,
        stage: 'A01_GATE_ARRIVAL_RECORDED',
        status: 'IN_PROGRESS',
      });

      await expect(
        service.recordGrossWeight(
          'mi-1',
          { grossWeightTonnes: 20 } as unknown as RecordGrossWeightDto,
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(ConflictException);
      expect(prisma.steelMaterialIntake.update).not.toHaveBeenCalled();
    });

    it('rejects verifyDocuments when the intake has already moved past that stage (invalid: already done)', async () => {
      prisma.steelMaterialIntake.findFirst.mockResolvedValue({
        id: 'mi-1',
        organizationId: ORG_ID,
        stage: 'A05_AREA_ASSIGNED',
        status: 'IN_PROGRESS',
      });

      await expect(
        service.verifyDocuments(
          'mi-1',
          {
            purchaseOrderVerified: true,
          } as unknown as VerifyMaterialIntakeDocumentsDto,
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects an unrecognized-id lookup with NotFoundException', async () => {
      prisma.steelMaterialIntake.findFirst.mockResolvedValue(null);

      await expect(service.getById('missing', ORG_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── 4/5/6. Weight validation and net-weight calculation ──
  describe('weighing', () => {
    it('DTO rejects zero/negative gross weight (4. gross weight validation)', async () => {
      const dto = plainToInstance(RecordGrossWeightDto, {
        grossWeightTonnes: 0,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('DTO rejects negative tare weight (5. tare weight validation)', async () => {
      const dto = plainToInstance(RecordNetWeightDto, { tareWeightTonnes: -1 });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rejects tare weight greater than gross weight at the service layer', async () => {
      prisma.steelMaterialIntake.findFirst.mockResolvedValue({
        id: 'mi-1',
        organizationId: ORG_ID,
        stage: 'A11_UNLOADED',
        status: 'IN_PROGRESS',
        grossWeightTonnes: 10,
      });

      await expect(
        service.recordNetWeight(
          'mi-1',
          { tareWeightTonnes: 15 } as unknown as RecordNetWeightDto,
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('computes net weight server-side as gross - tare (6. net weight calculation)', async () => {
      prisma.steelMaterialIntake.findFirst.mockResolvedValue({
        id: 'mi-1',
        organizationId: ORG_ID,
        stage: 'A11_UNLOADED',
        status: 'IN_PROGRESS',
        grossWeightTonnes: 30,
      });
      prisma.steelMaterialIntake.update.mockResolvedValue({ id: 'mi-1' });
      prisma.steelMaterialIntake.findUnique.mockResolvedValue({ id: 'mi-1' });

      // Note: RecordNetWeightDto has no netWeightTonnes field at all, so even
      // a spoofed value here cannot reach the service.
      await service.recordNetWeight(
        'mi-1',
        {
          tareWeightTonnes: 8,
          netWeightTonnes: 999,
        } as unknown as RecordNetWeightDto,
        USER_ID,
        ORG_ID,
      );

      expect(prisma.steelMaterialIntake.update).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            tareWeightTonnes: 8,
            netWeightTonnes: 22,
          }),
        }),
      );
    });
  });

  // ── 7/8/9. Acceptance decision ──
  describe('recordAcceptanceDecision', () => {
    it('accepts without requiring a reason (7. accept)', async () => {
      prisma.steelMaterialIntake.findFirst.mockResolvedValue({
        id: 'mi-1',
        organizationId: ORG_ID,
        stage: 'A09_CERTIFICATE_VERIFIED',
        status: 'IN_PROGRESS',
      });
      prisma.steelMaterialIntake.update.mockResolvedValue({ id: 'mi-1' });
      prisma.steelMaterialIntake.findUnique.mockResolvedValue({ id: 'mi-1' });

      await service.recordAcceptanceDecision(
        'mi-1',
        { decision: 'ACCEPT' } as unknown as RecordAcceptanceDecisionDto,
        USER_ID,
        ORG_ID,
      );

      expect(prisma.steelMaterialIntake.update).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            acceptanceDecision: 'ACCEPT',
            status: 'IN_PROGRESS',
          }),
        }),
      );
    });

    it('rejects HOLD without a reason (8. hold requires reason)', async () => {
      prisma.steelMaterialIntake.findFirst.mockResolvedValue({
        id: 'mi-1',
        organizationId: ORG_ID,
        stage: 'A09_CERTIFICATE_VERIFIED',
        status: 'IN_PROGRESS',
      });

      await expect(
        service.recordAcceptanceDecision(
          'mi-1',
          { decision: 'HOLD' } as unknown as RecordAcceptanceDecisionDto,
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.steelMaterialIntake.update).not.toHaveBeenCalled();
    });

    it('rejects REJECT without a reason (9. reject requires reason)', async () => {
      prisma.steelMaterialIntake.findFirst.mockResolvedValue({
        id: 'mi-1',
        organizationId: ORG_ID,
        stage: 'A09_CERTIFICATE_VERIFIED',
        status: 'IN_PROGRESS',
      });

      await expect(
        service.recordAcceptanceDecision(
          'mi-1',
          { decision: 'REJECT' } as unknown as RecordAcceptanceDecisionDto,
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts a HOLD with a reason and sets status ON_HOLD', async () => {
      prisma.steelMaterialIntake.findFirst.mockResolvedValue({
        id: 'mi-1',
        organizationId: ORG_ID,
        stage: 'A09_CERTIFICATE_VERIFIED',
        status: 'IN_PROGRESS',
      });
      prisma.steelMaterialIntake.update.mockResolvedValue({ id: 'mi-1' });
      prisma.steelMaterialIntake.findUnique.mockResolvedValue({ id: 'mi-1' });

      await service.recordAcceptanceDecision(
        'mi-1',
        {
          decision: 'HOLD',
          decisionNotes: 'Awaiting re-inspection',
        } as unknown as RecordAcceptanceDecisionDto,
        USER_ID,
        ORG_ID,
      );

      expect(prisma.steelMaterialIntake.update).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({ status: 'ON_HOLD' }),
        }),
      );
    });

    it('allows re-deciding a held intake without redoing earlier stages', async () => {
      prisma.steelMaterialIntake.findFirst.mockResolvedValue({
        id: 'mi-1',
        organizationId: ORG_ID,
        stage: 'A10_ACCEPTANCE_DECIDED',
        status: 'ON_HOLD',
      });
      prisma.steelMaterialIntake.update.mockResolvedValue({ id: 'mi-1' });
      prisma.steelMaterialIntake.findUnique.mockResolvedValue({ id: 'mi-1' });

      await service.recordAcceptanceDecision(
        'mi-1',
        { decision: 'ACCEPT' } as unknown as RecordAcceptanceDecisionDto,
        USER_ID,
        ORG_ID,
      );

      expect(prisma.steelMaterialIntake.update).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({ status: 'IN_PROGRESS' }),
        }),
      );
    });

    it('refuses to re-decide a rejected (terminal) intake', async () => {
      prisma.steelMaterialIntake.findFirst.mockResolvedValue({
        id: 'mi-1',
        organizationId: ORG_ID,
        stage: 'A10_ACCEPTANCE_DECIDED',
        status: 'REJECTED',
      });

      await expect(
        service.recordAcceptanceDecision(
          'mi-1',
          { decision: 'ACCEPT' } as unknown as RecordAcceptanceDecisionDto,
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ── 10/11/12. Terminal-state and acceptance-gated progression ──
  describe('terminal states', () => {
    it('rejects any further action once REJECTED (10. rejected cannot be released)', async () => {
      prisma.steelMaterialIntake.findFirst.mockResolvedValue({
        id: 'mi-1',
        organizationId: ORG_ID,
        stage: 'A13_YARD_STORED',
        status: 'REJECTED',
      });

      await expect(
        service.releaseToStock(
          'mi-1',
          {} as unknown as ReleaseToStockDto,
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(ConflictException);
      expect(prisma.steelMaterialIntake.update).not.toHaveBeenCalled();
    });

    it('rejects any further action while ON_HOLD (11. held material cannot be released)', async () => {
      prisma.steelMaterialIntake.findFirst.mockResolvedValue({
        id: 'mi-1',
        organizationId: ORG_ID,
        stage: 'A13_YARD_STORED',
        status: 'ON_HOLD',
      });

      await expect(
        service.releaseToStock(
          'mi-1',
          {} as unknown as ReleaseToStockDto,
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('lets accepted material proceed to unloading (12. accepted material can proceed)', async () => {
      prisma.steelMaterialIntake.findFirst.mockResolvedValue({
        id: 'mi-1',
        organizationId: ORG_ID,
        stage: 'A10_ACCEPTANCE_DECIDED',
        status: 'IN_PROGRESS',
        acceptanceDecision: 'ACCEPT',
      });
      prisma.steelMaterialIntake.update.mockResolvedValue({ id: 'mi-1' });
      prisma.steelMaterialIntake.findUnique.mockResolvedValue({ id: 'mi-1' });

      await service.recordUnloading(
        'mi-1',
        {} as unknown as RecordUnloadingDto,
        USER_ID,
        ORG_ID,
      );

      expect(prisma.steelMaterialIntake.update).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({ stage: 'A11_UNLOADED' }),
        }),
      );
    });

    it('refuses to unload material that was held, not accepted', async () => {
      prisma.steelMaterialIntake.findFirst.mockResolvedValue({
        id: 'mi-1',
        organizationId: ORG_ID,
        stage: 'A10_ACCEPTANCE_DECIDED',
        status: 'IN_PROGRESS',
        acceptanceDecision: 'HOLD',
      });

      await expect(
        service.recordUnloading(
          'mi-1',
          {} as unknown as RecordUnloadingDto,
          USER_ID,
          ORG_ID,
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ── 14. Organization scoping ──
  describe('organization scoping', () => {
    it('scopes reads by organizationId and 404s across tenants', async () => {
      prisma.steelMaterialIntake.findFirst.mockResolvedValue(null);

      await expect(service.getById('mi-1', 'other-org')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.steelMaterialIntake.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'mi-1', organizationId: 'other-org' },
        }),
      );
    });
  });
});
