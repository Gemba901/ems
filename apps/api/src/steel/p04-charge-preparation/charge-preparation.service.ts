import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SteelChargeStage, SteelChargeActivity, Prisma } from 'db';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  CreateChargePreparationDto,
  SelectMaterialLotsDto,
  RecordScrapSortingDto,
  RecordScrapCuttingDto,
  RecordContaminantRemovalDto,
  PrepareAdditivesDto,
  RecordReturnScrapCheckDto,
  PrepareChargeRecipeDto,
  StageChargeMaterialDto,
  VerifyChargeMaterialDto,
  ReleaseChargeDto,
  CloseFurnaceHandoverDto,
  UpdateChargePreparationStatusDto,
  QueryChargePreparationsDto,
} from './dto/charge-preparation.dto';

// The order the 12 charge-preparation activities must occur in. Mirrors the
// P01/P02/P03 STAGE_ORDER pattern so a step can't be recorded before its
// prerequisite.
const STAGE_ORDER: SteelChargeStage[] = [
  'A01_REQUIREMENT_REVIEWED',
  'A02_LOTS_SELECTED',
  'A03_SCRAP_SORTED',
  'A04_SCRAP_CUT',
  'A05_CONTAMINANTS_REMOVED',
  'A06_ADDITIVES_PREPARED',
  'A07_RETURN_SCRAP_CHECKED',
  'A08_RECIPE_PREPARED',
  'A09_MATERIAL_STAGED',
  'A10_VERIFICATION_DONE',
  'A11_CHARGE_RELEASED',
  'A12_HANDOVER_CLOSED',
] as SteelChargeStage[];

// Statuses on SteelMaterialIntake that mean the lot is available to be drawn
// against by a charge preparation (i.e. released stock, not yet held/rejected).
const AVAILABLE_INTAKE_STATUSES = ['RELEASED'];

const chargePrepInclude = {
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  plan: { select: { id: true, planNumber: true, status: true } },
  materialLots: {
    include: {
      intake: {
        select: {
          id: true,
          intakeNumber: true,
          materialType: true,
          grade: true,
          netWeightTonnes: true,
          status: true,
        },
      },
    },
  },
  activityLogs: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      performedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  },
};

// Actions the future frontend can offer, derived from (stage, status) so it
// never has to recreate the state machine itself.
function computeAllowedActions(prep: {
  stage: SteelChargeStage;
  status: string;
}): string[] {
  if (['CANCELLED', 'CLOSED'].includes(prep.status)) return [];
  if (prep.status === 'ON_HOLD') return [];

  switch (prep.stage) {
    case 'A01_REQUIREMENT_REVIEWED':
      return ['SELECT_LOTS'];
    case 'A02_LOTS_SELECTED':
      return ['RECORD_SCRAP_SORTING'];
    case 'A03_SCRAP_SORTED':
      return ['RECORD_SCRAP_CUTTING'];
    case 'A04_SCRAP_CUT':
      return ['REMOVE_CONTAMINANTS'];
    case 'A05_CONTAMINANTS_REMOVED':
      return ['PREPARE_ADDITIVES'];
    case 'A06_ADDITIVES_PREPARED':
      return ['CHECK_RETURN_SCRAP'];
    case 'A07_RETURN_SCRAP_CHECKED':
      return ['PREPARE_RECIPE'];
    case 'A08_RECIPE_PREPARED':
      return ['STAGE_MATERIAL'];
    case 'A09_MATERIAL_STAGED':
      return ['VERIFY_MATERIAL'];
    case 'A10_VERIFICATION_DONE':
      return ['RELEASE_CHARGE'];
    case 'A11_CHARGE_RELEASED':
      return ['CLOSE_HANDOVER'];
    case 'A12_HANDOVER_CLOSED':
      return [];
    default:
      return [];
  }
}

/**
 * P04 — Raw Material Preparation, Sorting, Cutting and Charge Planning.
 *
 * Mirrors the P01/P02/P03 pattern: strict sequential stage progression, one
 * activity-log row per meaningful action, org-scoped reads, transactional
 * writes. Draws its material lots directly from released `SteelMaterialIntake`
 * records — there is no separate "lot" model in this repository (confirmed
 * absent; intake already serves that role).
 *
 * Verification (P04-A10): an unresolved weight variance between the actual
 * material and the planned recipe blocks Charge ID release (P04-A11) unless
 * explicitly approved. Charge ID release is idempotent — it cannot happen
 * twice for the same record. Handover (P04-A12) cannot occur before the
 * Charge ID has been released.
 *
 * Hands off to P05 (furnace) once closed — no P05 model/code exists yet in
 * this repository, per Phase 9B scope.
 */
@Injectable()
export class ChargePreparationService {
  constructor(private prisma: PrismaService) {}

  private async resolveEmployee(userId: string, organizationId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { userId, organizationId },
      select: { id: true },
    });
    if (!employee) {
      throw new ForbiddenException(
        'No employee profile linked to your account',
      );
    }
    return employee;
  }

  private async findPrepOrThrow(id: string, organizationId: string) {
    const prep = await this.prisma.steelChargePreparation.findFirst({
      where: { id, organizationId },
      include: chargePrepInclude,
    });
    if (!prep) throw new NotFoundException('Charge preparation not found');
    return prep;
  }

  // Terminal/blocked statuses that must never allow further stage progress,
  // regardless of what `stage` currently says (defense in depth on top of
  // the stage-adjacency check below).
  private assertActive(status: string) {
    if (status === 'CANCELLED' || status === 'CLOSED') {
      throw new ConflictException(
        'This charge preparation is closed and cannot be progressed further.',
      );
    }
    if (status === 'ON_HOLD') {
      throw new ConflictException(
        'This charge preparation is on hold and cannot be progressed further.',
      );
    }
  }

  private assertStageTransition(
    currentStage: SteelChargeStage,
    requiredCurrentStage: SteelChargeStage,
  ) {
    if (currentStage === requiredCurrentStage) return;
    const currentIdx = STAGE_ORDER.indexOf(currentStage);
    const requiredIdx = STAGE_ORDER.indexOf(requiredCurrentStage);
    if (currentIdx < requiredIdx) {
      throw new ConflictException(
        'This step cannot be recorded yet — the previous charge preparation step has not been completed.',
      );
    }
    throw new ConflictException(
      'This charge preparation step has already been completed and the record has moved on.',
    );
  }

  // Retries `fn` when it fails on a unique-constraint violation of `field`
  // (Prisma P2002). Needed because number generation reads a count() and
  // creates/updates a row in separate steps — two concurrent requests can
  // read the same count before either writes, producing duplicate numbers.
  // The number FORMAT is unchanged; this only makes generate-then-write
  // safe under concurrency by regenerating and retrying on conflict.
  private async withUniqueRetry<T>(
    field: string,
    fn: () => Promise<T>,
    maxAttempts = 5,
  ): Promise<T> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (err) {
        const isConflict =
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002' &&
          (err.meta?.target as string[] | undefined)?.includes(field);
        if (!isConflict || attempt === maxAttempts) throw err;
      }
    }
    /* istanbul ignore next — loop always returns or throws above */
    throw new Error('withUniqueRetry: exhausted attempts');
  }

  private async generatePrepNumber(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ) {
    const year = new Date().getFullYear();
    const count = await tx.steelChargePreparation.count({
      where: {
        organizationId,
        createdAt: {
          gte: new Date(`${year}-01-01T00:00:00.000Z`),
          lt: new Date(`${year + 1}-01-01T00:00:00.000Z`),
        },
      },
    });
    const sequence = String(count + 1).padStart(5, '0');
    return `CP-${year}-${sequence}`;
  }

  private async generateChargeNumber(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ) {
    const year = new Date().getFullYear();
    const count = await tx.steelChargePreparation.count({
      where: {
        organizationId,
        chargeNumber: { not: null },
        createdAt: {
          gte: new Date(`${year}-01-01T00:00:00.000Z`),
          lt: new Date(`${year + 1}-01-01T00:00:00.000Z`),
        },
      },
    });
    const sequence = String(count + 1).padStart(5, '0');
    return `CH-${year}-${sequence}`;
  }

  private async logActivity(
    tx: Prisma.TransactionClient,
    chargePreparationId: string,
    activity: SteelChargeActivity,
    performedById: string,
    notes?: string,
    data?: Record<string, unknown>,
  ) {
    await tx.steelChargePreparationActivityLog.create({
      data: {
        chargePreparationId,
        activity,
        performedById,
        notes,
        data: data ? (data as Prisma.InputJsonValue) : undefined,
      },
    });
  }

  // ── P04-A01 — Review production plan and material requirement ──
  async createChargePreparation(
    dto: CreateChargePreparationDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);

    const plan = await this.prisma.steelProductionPlan.findFirst({
      where: { id: dto.planId, organizationId },
    });
    if (!plan) throw new NotFoundException('Production plan not found');
    if (plan.status !== 'RELEASED') {
      throw new BadRequestException(
        'Charge preparation can only be started against a released production plan (P01-A12).',
      );
    }

    return this.withUniqueRetry('prepNumber', () =>
      this.prisma.$transaction(async (tx) => {
        const prepNumber = await this.generatePrepNumber(tx, organizationId);

        const prep = await tx.steelChargePreparation.create({
          data: {
            prepNumber,
            organizationId,
            planId: dto.planId,
            createdById: employee.id,
            stage: 'A01_REQUIREMENT_REVIEWED',
            status: 'IN_PROGRESS',
            stockAvailabilityConfirmed: dto.stockAvailabilityConfirmed,
            requirementNotes: dto.requirementNotes,
          },
        });

        await this.logActivity(tx, prep.id, 'A01', employee.id, undefined, {
          ...dto,
        });
        return tx.steelChargePreparation.findUnique({
          where: { id: prep.id },
          include: chargePrepInclude,
        });
      }),
    );
  }

  // ── P04-A02 — Select raw material lots for preparation ──
  async selectMaterialLots(
    id: string,
    dto: SelectMaterialLotsDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const prep = await this.findPrepOrThrow(id, organizationId);
    this.assertActive(prep.status);
    this.assertStageTransition(prep.stage, 'A01_REQUIREMENT_REVIEWED');

    const uniqueIds = Array.from(new Set(dto.intakeIds));
    const intakes = await this.prisma.steelMaterialIntake.findMany({
      where: { id: { in: uniqueIds }, organizationId },
    });
    if (intakes.length !== uniqueIds.length) {
      throw new NotFoundException(
        'One or more selected material lots were not found.',
      );
    }
    const unavailable = intakes.filter(
      (i) => !AVAILABLE_INTAKE_STATUSES.includes(i.status),
    );
    if (unavailable.length > 0) {
      throw new BadRequestException(
        `The following lots are not available for selection (must be released stock): ${unavailable
          .map((i) => i.intakeNumber)
          .join(', ')}`,
      );
    }

    // A released intake must not be selectable into more than one charge
    // preparation — otherwise the same physical material could be counted
    // twice. This is checked here for a fast, descriptive rejection in the
    // common case, and is additionally enforced by a unique DB constraint
    // (SteelChargeMaterialLot.intakeId) so that two concurrent requests
    // selecting the same lot can't both pass this check and both insert —
    // the loser hits the constraint and is translated to the same
    // business-level error below.
    const alreadyAllocated = await this.prisma.steelChargeMaterialLot.findMany({
      where: { intakeId: { in: uniqueIds } },
      include: { intake: { select: { intakeNumber: true } } },
    });
    if (alreadyAllocated.length > 0) {
      throw new BadRequestException(
        `The following lots are already allocated to another charge preparation: ${alreadyAllocated
          .map((l) => l.intake.intakeNumber)
          .join(', ')}`,
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.steelChargeMaterialLot.createMany({
          data: uniqueIds.map((intakeId) => ({
            chargePreparationId: id,
            intakeId,
          })),
        });
        const updated = await tx.steelChargePreparation.update({
          where: { id },
          data: {
            lotSelectionNotes: dto.lotSelectionNotes,
            stage: 'A02_LOTS_SELECTED',
          },
        });
        await this.logActivity(
          tx,
          id,
          'A02',
          employee.id,
          dto.lotSelectionNotes,
          {
            intakeIds: uniqueIds,
          },
        );
        return tx.steelChargePreparation.findUnique({
          where: { id: updated.id },
          include: chargePrepInclude,
        });
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        (err.meta?.target as string[] | undefined)?.includes('intakeId')
      ) {
        throw new BadRequestException(
          'One or more of the selected lots were just allocated to another charge preparation. Please refresh and select different lots.',
        );
      }
      throw err;
    }
  }

  // ── P04-A03 — Sort scrap by grade and usability ──
  async recordScrapSorting(
    id: string,
    dto: RecordScrapSortingDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const prep = await this.findPrepOrThrow(id, organizationId);
    this.assertActive(prep.status);
    this.assertStageTransition(prep.stage, 'A02_LOTS_SELECTED');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelChargePreparation.update({
        where: { id },
        data: {
          sortedWeightTonnes: dto.sortedWeightTonnes,
          rejectedItemsNotes: dto.rejectedItemsNotes,
          scrapGradeNotes: dto.scrapGradeNotes,
          stage: 'A03_SCRAP_SORTED',
        },
      });
      await this.logActivity(tx, id, 'A03', employee.id, undefined, {
        ...dto,
      });
      return tx.steelChargePreparation.findUnique({
        where: { id: updated.id },
        include: chargePrepInclude,
      });
    });
  }

  // ── P04-A04 — Cut oversized scrap if needed ──
  async recordScrapCutting(
    id: string,
    dto: RecordScrapCuttingDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const prep = await this.findPrepOrThrow(id, organizationId);
    this.assertActive(prep.status);
    this.assertStageTransition(prep.stage, 'A03_SCRAP_SORTED');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelChargePreparation.update({
        where: { id },
        data: {
          cuttingRequired: dto.cuttingRequired,
          cuttingTimeMinutes: dto.cuttingTimeMinutes,
          cuttingPowerOrGasUsed: dto.cuttingPowerOrGasUsed,
          cutQuantityTonnes: dto.cutQuantityTonnes,
          stage: 'A04_SCRAP_CUT',
        },
      });
      await this.logActivity(tx, id, 'A04', employee.id, undefined, {
        ...dto,
      });
      return tx.steelChargePreparation.findUnique({
        where: { id: updated.id },
        include: chargePrepInclude,
      });
    });
  }

  // ── P04-A05 — Remove contaminants and unsafe items ──
  async recordContaminantRemoval(
    id: string,
    dto: RecordContaminantRemovalDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const prep = await this.findPrepOrThrow(id, organizationId);
    this.assertActive(prep.status);
    this.assertStageTransition(prep.stage, 'A04_SCRAP_CUT');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelChargePreparation.update({
        where: { id },
        data: {
          contaminantsRemoved: dto.contaminantsRemoved,
          removedItemsNotes: dto.removedItemsNotes,
          contaminationIssueNotes: dto.contaminationIssueNotes,
          stage: 'A05_CONTAMINANTS_REMOVED',
        },
      });
      await this.logActivity(
        tx,
        id,
        'A05',
        employee.id,
        dto.contaminationIssueNotes,
        { ...dto },
      );
      return tx.steelChargePreparation.findUnique({
        where: { id: updated.id },
        include: chargePrepInclude,
      });
    });
  }

  // ── P04-A06 — Prepare additives and alloys ──
  async prepareAdditives(
    id: string,
    dto: PrepareAdditivesDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const prep = await this.findPrepOrThrow(id, organizationId);
    this.assertActive(prep.status);
    this.assertStageTransition(prep.stage, 'A05_CONTAMINANTS_REMOVED');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelChargePreparation.update({
        where: { id },
        data: {
          additivesPrepared: dto.additivesPrepared
            ? (dto.additivesPrepared as Prisma.InputJsonValue)
            : undefined,
          additivesNotes: dto.additivesNotes,
          stage: 'A06_ADDITIVES_PREPARED',
        },
      });
      await this.logActivity(tx, id, 'A06', employee.id, dto.additivesNotes, {
        ...dto,
      });
      return tx.steelChargePreparation.findUnique({
        where: { id: updated.id },
        include: chargePrepInclude,
      });
    });
  }

  // ── P04-A07 — Check internal return scrap availability ──
  async recordReturnScrapCheck(
    id: string,
    dto: RecordReturnScrapCheckDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const prep = await this.findPrepOrThrow(id, organizationId);
    this.assertActive(prep.status);
    this.assertStageTransition(prep.stage, 'A06_ADDITIVES_PREPARED');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelChargePreparation.update({
        where: { id },
        data: {
          returnScrapAvailable: dto.returnScrapAvailable,
          returnScrapQtyTonnes: dto.returnScrapQtyTonnes,
          returnScrapSource: dto.returnScrapSource,
          returnScrapGrade: dto.returnScrapGrade,
          returnScrapContaminationNotes: dto.returnScrapContaminationNotes,
          stage: 'A07_RETURN_SCRAP_CHECKED',
        },
      });
      await this.logActivity(tx, id, 'A07', employee.id, undefined, {
        ...dto,
      });
      return tx.steelChargePreparation.findUnique({
        where: { id: updated.id },
        include: chargePrepInclude,
      });
    });
  }

  // ── P04-A08 — Prepare furnace charge recipe ──
  async prepareChargeRecipe(
    id: string,
    dto: PrepareChargeRecipeDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const prep = await this.findPrepOrThrow(id, organizationId);
    this.assertActive(prep.status);
    this.assertStageTransition(prep.stage, 'A07_RETURN_SCRAP_CHECKED');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelChargePreparation.update({
        where: { id },
        data: {
          recipeScrapWeightTonnes: dto.recipeScrapWeightTonnes,
          recipeDriWeightTonnes: dto.recipeDriWeightTonnes,
          recipeAlloyWeightTonnes: dto.recipeAlloyWeightTonnes,
          recipeAdditiveWeightTonnes: dto.recipeAdditiveWeightTonnes,
          targetChemistry: dto.targetChemistry
            ? (dto.targetChemistry as Prisma.InputJsonValue)
            : undefined,
          recipeNotes: dto.recipeNotes,
          stage: 'A08_RECIPE_PREPARED',
        },
      });
      await this.logActivity(tx, id, 'A08', employee.id, dto.recipeNotes, {
        ...dto,
      });
      return tx.steelChargePreparation.findUnique({
        where: { id: updated.id },
        include: chargePrepInclude,
      });
    });
  }

  // ── P04-A09 — Stage material near furnace charging area ──
  async stageChargeMaterial(
    id: string,
    dto: StageChargeMaterialDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const prep = await this.findPrepOrThrow(id, organizationId);
    this.assertActive(prep.status);
    this.assertStageTransition(prep.stage, 'A08_RECIPE_PREPARED');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelChargePreparation.update({
        where: { id },
        data: {
          stagingLocation: dto.stagingLocation,
          stagedWeightTonnes: dto.stagedWeightTonnes,
          stagingSequence: dto.stagingSequence,
          stage: 'A09_MATERIAL_STAGED',
        },
      });
      await this.logActivity(tx, id, 'A09', employee.id, undefined, {
        ...dto,
      });
      return tx.steelChargePreparation.findUnique({
        where: { id: updated.id },
        include: chargePrepInclude,
      });
    });
  }

  // ── P04-A10 — Verify actual material against charge recipe ──
  async verifyChargeMaterial(
    id: string,
    dto: VerifyChargeMaterialDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const prep = await this.findPrepOrThrow(id, organizationId);
    this.assertActive(prep.status);
    this.assertStageTransition(prep.stage, 'A09_MATERIAL_STAGED');

    const recipeTotal =
      (prep.recipeScrapWeightTonnes ?? 0) +
      (prep.recipeDriWeightTonnes ?? 0) +
      (prep.recipeAlloyWeightTonnes ?? 0) +
      (prep.recipeAdditiveWeightTonnes ?? 0);
    const weightVarianceTonnes = dto.actualWeightTonnes - recipeTotal;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelChargePreparation.update({
        where: { id },
        data: {
          actualWeightTonnes: dto.actualWeightTonnes,
          actualGrade: dto.actualGrade,
          weightVarianceTonnes,
          varianceApproved: dto.varianceApproved ?? weightVarianceTonnes === 0,
          verificationNotes: dto.verificationNotes,
          stage: 'A10_VERIFICATION_DONE',
        },
      });
      await this.logActivity(
        tx,
        id,
        'A10',
        employee.id,
        dto.verificationNotes,
        {
          ...dto,
          weightVarianceTonnes,
        },
      );
      return tx.steelChargePreparation.findUnique({
        where: { id: updated.id },
        include: chargePrepInclude,
      });
    });
  }

  // ── P04-A11 — Create and release Charge ID ──
  async releaseCharge(
    id: string,
    dto: ReleaseChargeDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const prep = await this.findPrepOrThrow(id, organizationId);
    this.assertActive(prep.status);

    if (prep.chargeNumber) {
      throw new ConflictException(
        'A Charge ID has already been released for this preparation.',
      );
    }
    this.assertStageTransition(prep.stage, 'A10_VERIFICATION_DONE');

    if (
      prep.weightVarianceTonnes != null &&
      prep.weightVarianceTonnes !== 0 &&
      !prep.varianceApproved
    ) {
      throw new BadRequestException(
        'The variance between actual material and the planned recipe (P04-A10) must be approved before the Charge ID can be released.',
      );
    }

    return this.withUniqueRetry('chargeNumber', () =>
      this.prisma.$transaction(async (tx) => {
        const chargeNumber = await this.generateChargeNumber(
          tx,
          organizationId,
        );
        const updated = await tx.steelChargePreparation.update({
          where: { id },
          data: {
            chargeNumber,
            chargeReleasedAt: new Date(),
            stage: 'A11_CHARGE_RELEASED',
          },
        });
        await this.logActivity(tx, id, 'A11', employee.id, dto.releaseNotes, {
          chargeNumber,
        });
        return tx.steelChargePreparation.findUnique({
          where: { id: updated.id },
          include: chargePrepInclude,
        });
      }),
    );
  }

  // ── P04-A12 — Close preparation handover to furnace ──
  async closeFurnaceHandover(
    id: string,
    dto: CloseFurnaceHandoverDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const prep = await this.findPrepOrThrow(id, organizationId);
    this.assertActive(prep.status);
    this.assertStageTransition(prep.stage, 'A11_CHARGE_RELEASED');

    if (!prep.chargeNumber) {
      throw new ConflictException(
        'The Charge ID must be released (P04-A11) before handover to the furnace can be closed.',
      );
    }
    if (!dto.furnaceReadinessConfirmed) {
      throw new BadRequestException(
        'Furnace readiness must be confirmed to close the handover.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelChargePreparation.update({
        where: { id },
        data: {
          furnaceReadinessConfirmed: dto.furnaceReadinessConfirmed,
          plannedHeatReference: dto.plannedHeatReference,
          handoverNotes: dto.handoverNotes,
          handoverClosedAt: new Date(),
          stage: 'A12_HANDOVER_CLOSED',
          status: 'CLOSED',
        },
      });
      await this.logActivity(tx, id, 'A12', employee.id, dto.handoverNotes, {
        ...dto,
      });
      return tx.steelChargePreparation.findUnique({
        where: { id: updated.id },
        include: chargePrepInclude,
      });
    });
  }

  // Manual override for exceptional cases (e.g. putting a charge prep ON_HOLD or CANCELLED)
  // Administrative override for exceptional cases (e.g. putting a charge
  // preparation ON_HOLD or CANCELLED outside the normal A01-A12 flow).
  // Restricted to RELEASE_ROLES at the controller. Deliberately does not
  // re-validate stage/status transitions the way the staged A01-A12 actions
  // do — that's the point of an override — but it is transactional and
  // logged like every other write, so the change is auditable.
  async updateStatus(
    id: string,
    dto: UpdateChargePreparationStatusDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const prep = await this.findPrepOrThrow(id, organizationId);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelChargePreparation.update({
        where: { id },
        data: { status: dto.status },
        include: chargePrepInclude,
      });
      await this.logActivity(
        tx,
        id,
        'STATUS_OVERRIDE',
        employee.id,
        dto.notes,
        { previousStatus: prep.status, newStatus: dto.status },
      );
      return updated;
    });
  }

  // ── Reads ──

  async getById(id: string, organizationId: string) {
    const prep = await this.findPrepOrThrow(id, organizationId);
    return { ...prep, allowedActions: computeAllowedActions(prep) };
  }

  async getAll(organizationId: string, query: QueryChargePreparationsDto) {
    const { planId, stage, status, search, page, limit } = query;

    const where: Prisma.SteelChargePreparationWhereInput = {
      organizationId,
      ...(planId && { planId }),
      ...(stage && { stage }),
      ...(status && { status }),
      ...(search && {
        OR: [
          { prepNumber: { contains: search, mode: 'insensitive' } },
          { chargeNumber: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.steelChargePreparation.findMany({
        where,
        include: {
          createdBy: { select: { id: true, firstName: true, lastName: true } },
          plan: { select: { id: true, planNumber: true } },
          _count: { select: { materialLots: true, activityLogs: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.steelChargePreparation.count({ where }),
    ]);

    return {
      data,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async getSummary(organizationId: string) {
    const [byStage, byStatus, total] = await this.prisma.$transaction([
      this.prisma.steelChargePreparation.groupBy({
        by: ['stage'],
        where: { organizationId },
        orderBy: { stage: 'asc' },
        _count: true,
      }),
      this.prisma.steelChargePreparation.groupBy({
        by: ['status'],
        where: { organizationId },
        orderBy: { status: 'asc' },
        _count: true,
      }),
      this.prisma.steelChargePreparation.count({ where: { organizationId } }),
    ]);

    return {
      total,
      byStage: Object.fromEntries(byStage.map((r) => [r.stage, r._count])),
      byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count])),
    };
  }
}
