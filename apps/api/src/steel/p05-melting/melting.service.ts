import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SteelMeltingStage, SteelMeltingActivity, Prisma } from 'db';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  ConfirmFurnaceAvailabilityDto,
  FurnaceLiningCheckDto,
  FurnaceSystemsCheckDto,
  PreviousHeatReadinessDto,
  VerifyChargeRecipeDto,
  LoadChargeDto,
  StartMeltingDto,
  MonitorPowerDto,
  MonitorTemperatureDto,
  RecordAdditionsDto,
  RemoveSlagDto,
  RecordMeltOutputDto,
  ConfirmLiquidReadyDto,
  RefiningHandoverDto,
  UpdateMeltingStatusDto,
  QueryMeltingsDto,
} from './dto/melting.dto';
import {
  AddHeatMaterialChargeDto,
  QueryHeatMaterialChargesDto,
  RecordHeatCycleEventDto,
  QueryHeatCycleEventsDto,
} from './dto/heat-operations.dto';
import {
  GetMeltingDashboardDto,
  MeltingDashboardRange,
} from './dto/dashboard.dto';

// The order the 14 melting activities must occur in. Mirrors the
// P01/P02/P03/P04 STAGE_ORDER pattern so a step can't be recorded before its
// prerequisite.
const STAGE_ORDER: SteelMeltingStage[] = [
  'A01_CONFIRM_FURNACE_AVAILABILITY',
  'A02_FURNACE_LINING_CHECK',
  'A03_FURNACE_SYSTEMS_CHECK',
  'A04_PREVIOUS_HEAT_READINESS',
  'A05_VERIFY_CHARGE_RECIPE',
  'A06_LOAD_CHARGE',
  'A07_START_MELTING',
  'A08_MONITOR_POWER',
  'A09_MONITOR_TEMPERATURE',
  'A10_RECORD_ADDITIONS',
  'A11_REMOVE_SLAG',
  'A12_RECORD_MELT_OUTPUT',
  'A13_CONFIRM_LIQUID_READY',
  'A14_HANDOVER_TO_REFINING',
] as SteelMeltingStage[];

const meltingInclude = {
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  chargePreparation: {
    select: {
      id: true,
      prepNumber: true,
      chargeNumber: true,
      status: true,
      actualGrade: true,
    },
  },
  furnace: { select: { id: true, code: true, name: true, status: true } },
  lining: {
    select: {
      id: true,
      code: true,
      installedAt: true,
      heatsCompleted: true,
      condition: true,
      status: true,
    },
  },
  activityLogs: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      performedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  },
  _count: { select: { materialCharges: true, cycleEvents: true } },
};

// Actions the frontend can offer, derived from (stage, status) so it never
// has to recreate the state machine itself.
function computeAllowedActions(melting: {
  stage: SteelMeltingStage;
  status: string;
}): string[] {
  if (['CANCELLED', 'CLOSED'].includes(melting.status)) return [];
  if (melting.status === 'ON_HOLD') return [];

  switch (melting.stage) {
    case 'A01_CONFIRM_FURNACE_AVAILABILITY':
      return ['CHECK_LINING'];
    case 'A02_FURNACE_LINING_CHECK':
      return ['CHECK_UTILITIES'];
    case 'A03_FURNACE_SYSTEMS_CHECK':
      return ['CHECK_PREVIOUS_HEAT'];
    case 'A04_PREVIOUS_HEAT_READINESS':
      return ['VERIFY_CHARGE'];
    case 'A05_VERIFY_CHARGE_RECIPE':
      return ['LOAD_CHARGE'];
    case 'A06_LOAD_CHARGE':
      return ['START_MELTING'];
    case 'A07_START_MELTING':
      return ['MONITOR_POWER'];
    case 'A08_MONITOR_POWER':
      return ['MONITOR_TEMPERATURE'];
    case 'A09_MONITOR_TEMPERATURE':
      return ['RECORD_ADDITIONS'];
    case 'A10_RECORD_ADDITIONS':
      return ['REMOVE_SLAG'];
    case 'A11_REMOVE_SLAG':
      return ['RECORD_OUTPUT'];
    case 'A12_RECORD_MELT_OUTPUT':
      return ['CONFIRM_READY'];
    case 'A13_CONFIRM_LIQUID_READY':
      return ['REFINING_HANDOVER'];
    case 'A14_HANDOVER_TO_REFINING':
      return [];
    default:
      return [];
  }
}

/**
 * P05 — Melting.
 *
 * Mirrors the P01-P04 pattern: strict sequential stage progression, one
 * activity-log row per meaningful action, org-scoped reads, transactional
 * writes. Created against a closed P04 charge preparation — a charge
 * preparation can be melted at most once (unique chargePreparationId).
 *
 * Handover (P05-A14) to refining/quality is irreversible and idempotent — it
 * cannot happen twice for the same record. No P06 model/code exists yet in
 * this repository.
 */
@Injectable()
export class MeltingService {
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

  private async findMeltingOrThrow(id: string, organizationId: string) {
    const melting = await this.prisma.steelMelting.findFirst({
      where: { id, organizationId },
      include: meltingInclude,
    });
    if (!melting) throw new NotFoundException('Melting record not found');
    return melting;
  }

  private assertActive(status: string) {
    if (status === 'CANCELLED' || status === 'CLOSED') {
      throw new ConflictException(
        'This melting record is closed and cannot be progressed further.',
      );
    }
    if (status === 'ON_HOLD') {
      throw new ConflictException(
        'This melting record is on hold and cannot be progressed further.',
      );
    }
  }

  private assertStageTransition(
    currentStage: SteelMeltingStage,
    requiredCurrentStage: SteelMeltingStage,
  ) {
    if (currentStage === requiredCurrentStage) return;
    const currentIdx = STAGE_ORDER.indexOf(currentStage);
    const requiredIdx = STAGE_ORDER.indexOf(requiredCurrentStage);
    if (currentIdx < requiredIdx) {
      throw new ConflictException(
        'This step cannot be recorded yet — the previous melting step has not been completed.',
      );
    }
    throw new ConflictException(
      'This melting step has already been completed and the record has moved on.',
    );
  }

  // Like assertStageTransition, but for the A02-A13 activities: instead of
  // unconditionally rejecting a resubmission once the record has moved past
  // this stage, it allows it as a re-edit — provided a reason is given and
  // an activity log for this exact activity already exists (so a step that
  // was genuinely never reached still hits the "not completed yet" error
  // above, not this path). Returns true when this call is a re-edit, so the
  // caller can skip writing `stage` backwards and instead just update the
  // stage's own fields, logging a new history row via `notes` without
  // touching the original.
  private async assertStageTransitionOrReedit(
    meltingId: string,
    currentStage: SteelMeltingStage,
    requiredCurrentStage: SteelMeltingStage,
    activity: SteelMeltingActivity,
    reason: string | undefined,
  ): Promise<boolean> {
    if (currentStage === requiredCurrentStage) return false;
    const currentIdx = STAGE_ORDER.indexOf(currentStage);
    const requiredIdx = STAGE_ORDER.indexOf(requiredCurrentStage);
    if (currentIdx < requiredIdx) {
      throw new ConflictException(
        'This step cannot be recorded yet — the previous melting step has not been completed.',
      );
    }

    const existingLog = await this.prisma.steelMeltingActivityLog.findFirst({
      where: { meltingId, activity },
      select: { id: true },
    });
    if (existingLog && (!reason || !reason.trim())) {
      throw new BadRequestException(
        'This melting step has already been recorded. Provide a reason to re-edit it.',
      );
    }
    return true;
  }

  // Retries `fn` when it fails on a unique-constraint violation of `field`
  // (Prisma P2002). Needed because number generation reads a count() and
  // creates a row in separate steps — two concurrent requests can read the
  // same count before either writes, producing duplicate numbers. The
  // number FORMAT is unchanged; this only makes generate-then-create safe
  // under concurrency by regenerating and retrying on conflict. Conflicts
  // on other fields (e.g. chargePreparationId) are rethrown untouched.
  // P2002's offending-field list lives at err.meta.target on the legacy
  // engine, but the Prisma 7 driver-adapter (@prisma/adapter-pg) engine
  // instead puts it at err.meta.constraint.fields or
  // err.cause.constraint.fields, leaving meta.target undefined.
  private uniqueConstraintFields(
    err: Prisma.PrismaClientKnownRequestError,
  ): string[] {
    const meta = err.meta as
      | { target?: string[]; constraint?: { fields?: string[] } }
      | undefined;
    const cause = (
      err as unknown as {
        cause?: { constraint?: { fields?: string[] } };
      }
    ).cause;
    return (
      meta?.target ??
      meta?.constraint?.fields ??
      cause?.constraint?.fields ??
      []
    );
  }

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
          this.uniqueConstraintFields(err).includes(field);
        if (!isConflict || attempt === maxAttempts) throw err;
      }
    }
    /* istanbul ignore next — loop always returns or throws above */
    throw new Error('withUniqueRetry: exhausted attempts');
  }

  private async generateHeatInProcessNumber(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ) {
    const year = new Date().getFullYear();
    const count = await tx.steelMelting.count({
      where: {
        organizationId,
        createdAt: {
          gte: new Date(`${year}-01-01T00:00:00.000Z`),
          lt: new Date(`${year + 1}-01-01T00:00:00.000Z`),
        },
      },
    });
    const sequence = String(count + 1).padStart(5, '0');
    return `HP-${year}-${sequence}`;
  }

  private async logActivity(
    tx: Prisma.TransactionClient,
    meltingId: string,
    activity: SteelMeltingActivity,
    performedById: string,
    notes?: string,
    data?: Record<string, unknown>,
  ) {
    await tx.steelMeltingActivityLog.create({
      data: {
        meltingId,
        activity,
        performedById,
        notes,
        data: data ? (data as Prisma.InputJsonValue) : undefined,
      },
    });
  }

  // ── P05-A01 — Confirm furnace availability and planned heat ──
  async createMelting(
    dto: ConfirmFurnaceAvailabilityDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);

    const charge = await this.prisma.steelChargePreparation.findFirst({
      where: { id: dto.chargePreparationId, organizationId },
    });
    if (!charge) throw new NotFoundException('Charge preparation not found');
    if (charge.status !== 'CLOSED' || !charge.chargeNumber) {
      throw new BadRequestException(
        'Melting can only be started against a charge preparation that has been released and closed (P04-A11/A12).',
      );
    }

    if (dto.furnaceRefId) {
      const furnace = await this.prisma.furnace.findFirst({
        where: { id: dto.furnaceRefId, organizationId },
      });
      if (!furnace) throw new NotFoundException('Furnace not found');
      if (furnace.status !== 'READY') {
        throw new BadRequestException(
          `Furnace ${furnace.code} is not ready (status: ${furnace.status}).`,
        );
      }
    }

    try {
      return await this.withUniqueRetry('heatInProcessNumber', () =>
        this.prisma.$transaction(async (tx) => {
          const heatInProcessNumber = await this.generateHeatInProcessNumber(
            tx,
            organizationId,
          );

          const melting = await tx.steelMelting.create({
            data: {
              heatInProcessNumber,
              organizationId,
              chargePreparationId: dto.chargePreparationId,
              createdById: employee.id,
              stage: 'A01_CONFIRM_FURNACE_AVAILABILITY',
              status: 'IN_PROGRESS',
              chargeNumberSnapshot: charge.chargeNumber,
              recipeScrapWeightSnapshot: charge.recipeScrapWeightTonnes,
              recipeDriWeightSnapshot: charge.recipeDriWeightTonnes,
              recipeAlloyWeightSnapshot: charge.recipeAlloyWeightTonnes,
              recipeAdditiveWeightSnapshot: charge.recipeAdditiveWeightTonnes,
              furnaceId: dto.furnaceId,
              furnaceRefId: dto.furnaceRefId,
              plannedHeatRef: dto.plannedHeatRef,
              operatorName: dto.operatorName,
              shift: dto.shift,
            },
          });

          await this.logActivity(
            tx,
            melting.id,
            'A01',
            employee.id,
            undefined,
            {
              ...dto,
            },
          );
          return tx.steelMelting.findUnique({
            where: { id: melting.id },
            include: meltingInclude,
          });
        }),
      );
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        this.uniqueConstraintFields(err).includes('chargePreparationId')
      ) {
        throw new BadRequestException(
          'This charge has already been handed over to melting.',
        );
      }
      throw err;
    }
  }

  // ── P05-A02 — Check furnace lining condition before charging ──
  async furnaceLiningCheck(
    id: string,
    dto: FurnaceLiningCheckDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const melting = await this.findMeltingOrThrow(id, organizationId);
    this.assertActive(melting.status);
    const isReedit = await this.assertStageTransitionOrReedit(
      id,
      melting.stage,
      'A01_CONFIRM_FURNACE_AVAILABILITY',
      'A02',
      dto.reason,
    );

    if (!dto.liningVisualCondition || !dto.liningVisualCondition.trim()) {
      throw new BadRequestException(
        'The furnace lining visual condition must be recorded before charging can proceed.',
      );
    }

    if (dto.liningRefId) {
      const lining = await this.prisma.furnaceLining.findFirst({
        where: { id: dto.liningRefId, organizationId },
      });
      if (!lining) throw new NotFoundException('Furnace lining not found');
      if (lining.status !== 'ACTIVE') {
        throw new BadRequestException(
          'This lining has been retired and cannot be used for a new heat.',
        );
      }
      if (melting.furnaceRefId && lining.furnaceId !== melting.furnaceRefId) {
        throw new BadRequestException(
          'This lining does not belong to the furnace selected for this heat.',
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelMelting.update({
        where: { id },
        data: {
          liningCampaignId: dto.liningCampaignId,
          liningRefId: dto.liningRefId,
          liningHeatCount: dto.liningHeatCount,
          liningVisualCondition: dto.liningVisualCondition,
          ...(isReedit ? {} : { stage: 'A02_FURNACE_LINING_CHECK' as const }),
        },
      });
      await this.logActivity(tx, id, 'A02', employee.id, dto.reason, {
        ...dto,
      });
      return tx.steelMelting.findUnique({
        where: { id: updated.id },
        include: meltingInclude,
      });
    });
  }

  // ── P05-A03 — Check cooling water, power, hydraulic, and furnace systems ──
  async furnaceSystemsCheck(
    id: string,
    dto: FurnaceSystemsCheckDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const melting = await this.findMeltingOrThrow(id, organizationId);
    this.assertActive(melting.status);
    const isReedit = await this.assertStageTransitionOrReedit(
      id,
      melting.stage,
      'A02_FURNACE_LINING_CHECK',
      'A03',
      dto.reason,
    );

    if (
      !dto.waterPressureFlowOk ||
      !dto.powerSystemOk ||
      !dto.hydraulicSystemOk ||
      !dto.alarmsOk
    ) {
      throw new BadRequestException(
        'All furnace systems (cooling water, power, hydraulic, alarms) must be confirmed OK before charging can proceed.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelMelting.update({
        where: { id },
        data: {
          waterPressureFlowOk: dto.waterPressureFlowOk,
          powerSystemOk: dto.powerSystemOk,
          hydraulicSystemOk: dto.hydraulicSystemOk,
          alarmsOk: dto.alarmsOk,
          ...(isReedit ? {} : { stage: 'A03_FURNACE_SYSTEMS_CHECK' as const }),
        },
      });
      await this.logActivity(tx, id, 'A03', employee.id, dto.reason, {
        ...dto,
      });
      return tx.steelMelting.findUnique({
        where: { id: updated.id },
        include: meltingInclude,
      });
    });
  }

  // ── P05-A04 — Confirm furnace is ready from previous heat ──
  async previousHeatReadiness(
    id: string,
    dto: PreviousHeatReadinessDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const melting = await this.findMeltingOrThrow(id, organizationId);
    this.assertActive(melting.status);
    const isReedit = await this.assertStageTransitionOrReedit(
      id,
      melting.stage,
      'A03_FURNACE_SYSTEMS_CHECK',
      'A04',
      dto.reason,
    );

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelMelting.update({
        where: { id },
        data: {
          previousHeatRef: dto.previousHeatRef,
          slagCleaningStatus: dto.slagCleaningStatus,
          readinessDelayReason: dto.readinessDelayReason,
          ...(isReedit ? {} : { stage: 'A04_PREVIOUS_HEAT_READINESS' as const }),
        },
      });
      await this.logActivity(
        tx,
        id,
        'A04',
        employee.id,
        isReedit
          ? [dto.readinessDelayReason, dto.reason].filter(Boolean).join(' | ')
          : dto.readinessDelayReason,
        { ...dto },
      );
      return tx.steelMelting.findUnique({
        where: { id: updated.id },
        include: meltingInclude,
      });
    });
  }

  // ── P05-A05 — Verify Charge ID and recipe before loading ──
  async verifyChargeRecipe(
    id: string,
    dto: VerifyChargeRecipeDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const melting = await this.findMeltingOrThrow(id, organizationId);
    this.assertActive(melting.status);
    const isReedit = await this.assertStageTransitionOrReedit(
      id,
      melting.stage,
      'A04_PREVIOUS_HEAT_READINESS',
      'A05',
      dto.reason,
    );

    if (!dto.actualWeightVsRecipeOk) {
      throw new BadRequestException(
        'The charge material and recipe must be verified as matching before loading can proceed.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelMelting.update({
        where: { id },
        data: {
          materialLotRef: dto.materialLotRef,
          actualWeightVsRecipeOk: dto.actualWeightVsRecipeOk,
          ...(isReedit ? {} : { stage: 'A05_VERIFY_CHARGE_RECIPE' as const }),
        },
      });
      await this.logActivity(tx, id, 'A05', employee.id, dto.reason, {
        ...dto,
      });
      return tx.steelMelting.findUnique({
        where: { id: updated.id },
        include: meltingInclude,
      });
    });
  }

  // ── P05-A06 — Load charge into furnace ──
  async loadCharge(
    id: string,
    dto: LoadChargeDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const melting = await this.findMeltingOrThrow(id, organizationId);
    this.assertActive(melting.status);
    const isReedit = await this.assertStageTransitionOrReedit(
      id,
      melting.stage,
      'A05_VERIFY_CHARGE_RECIPE',
      'A06',
      dto.reason,
    );

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelMelting.update({
        where: { id },
        data: {
          loadingTime: dto.loadingTime ? new Date(dto.loadingTime) : new Date(),
          loadingEquipment: dto.loadingEquipment,
          chargeSequence: dto.chargeSequence,
          ...(isReedit ? {} : { stage: 'A06_LOAD_CHARGE' as const }),
        },
      });
      await this.logActivity(tx, id, 'A06', employee.id, dto.reason, {
        ...dto,
      });
      return tx.steelMelting.findUnique({
        where: { id: updated.id },
        include: meltingInclude,
      });
    });
  }

  // ── P05-A07 — Start melting operation ──
  async startMelting(
    id: string,
    dto: StartMeltingDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const melting = await this.findMeltingOrThrow(id, organizationId);
    this.assertActive(melting.status);
    const isReedit = await this.assertStageTransitionOrReedit(
      id,
      melting.stage,
      'A06_LOAD_CHARGE',
      'A07',
      dto.reason,
    );

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelMelting.update({
        where: { id },
        data: {
          meltingStartTime: dto.meltingStartTime
            ? new Date(dto.meltingStartTime)
            : new Date(),
          meltingFurnaceId: dto.meltingFurnaceId,
          meltingOperator: dto.meltingOperator,
          meltingChargeId: melting.chargePreparation.chargeNumber,
          ...(isReedit ? {} : { stage: 'A07_START_MELTING' as const }),
        },
      });
      await this.logActivity(tx, id, 'A07', employee.id, dto.reason, {
        ...dto,
      });
      return tx.steelMelting.findUnique({
        where: { id: updated.id },
        include: meltingInclude,
      });
    });
  }

  // ── P05-A08 — Monitor power consumption during melting ──
  async monitorPower(
    id: string,
    dto: MonitorPowerDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const melting = await this.findMeltingOrThrow(id, organizationId);
    this.assertActive(melting.status);
    const isReedit = await this.assertStageTransitionOrReedit(
      id,
      melting.stage,
      'A07_START_MELTING',
      'A08',
      dto.reason,
    );

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelMelting.update({
        where: { id },
        data: {
          powerKwh: dto.powerKwh,
          powerElapsedMinutes: dto.powerElapsedMinutes,
          powerTonnage: dto.powerTonnage,
          powerInterruptions: dto.powerInterruptions,
          ...(isReedit ? {} : { stage: 'A08_MONITOR_POWER' as const }),
        },
      });
      await this.logActivity(tx, id, 'A08', employee.id, dto.reason, {
        ...dto,
      });
      return tx.steelMelting.findUnique({
        where: { id: updated.id },
        include: meltingInclude,
      });
    });
  }

  // ── P05-A09 — Monitor melting time and temperature ──
  async monitorTemperature(
    id: string,
    dto: MonitorTemperatureDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const melting = await this.findMeltingOrThrow(id, organizationId);
    this.assertActive(melting.status);
    const isReedit = await this.assertStageTransitionOrReedit(
      id,
      melting.stage,
      'A08_MONITOR_POWER',
      'A09',
      dto.reason,
    );

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelMelting.update({
        where: { id },
        data: {
          temperatureCelsius: dto.temperatureCelsius,
          temperatureElapsedMinutes: dto.temperatureElapsedMinutes,
          temperatureDelayReason: dto.temperatureDelayReason,
          ...(isReedit ? {} : { stage: 'A09_MONITOR_TEMPERATURE' as const }),
        },
      });
      await this.logActivity(
        tx,
        id,
        'A09',
        employee.id,
        isReedit
          ? [dto.temperatureDelayReason, dto.reason].filter(Boolean).join(' | ')
          : dto.temperatureDelayReason,
        { ...dto },
      );
      return tx.steelMelting.findUnique({
        where: { id: updated.id },
        include: meltingInclude,
      });
    });
  }

  // ── P05-A10 — Add extra material if required and record it ──
  async recordAdditions(
    id: string,
    dto: RecordAdditionsDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const melting = await this.findMeltingOrThrow(id, organizationId);
    this.assertActive(melting.status);
    const isReedit = await this.assertStageTransitionOrReedit(
      id,
      melting.stage,
      'A09_MONITOR_TEMPERATURE',
      'A10',
      dto.editReason,
    );

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelMelting.update({
        where: { id },
        data: {
          additions: dto.additions
            ? (dto.additions as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          ...(isReedit ? {} : { stage: 'A10_RECORD_ADDITIONS' as const }),
        },
      });
      await this.logActivity(tx, id, 'A10', employee.id, dto.editReason, {
        ...dto,
      });
      return tx.steelMelting.findUnique({
        where: { id: updated.id },
        include: meltingInclude,
      });
    });
  }

  // ── P05-A11 — Remove slag or unwanted material if applicable ──
  async removeSlag(
    id: string,
    dto: RemoveSlagDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const melting = await this.findMeltingOrThrow(id, organizationId);
    this.assertActive(melting.status);
    const isReedit = await this.assertStageTransitionOrReedit(
      id,
      melting.stage,
      'A10_RECORD_ADDITIONS',
      'A11',
      dto.reason,
    );

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelMelting.update({
        where: { id },
        data: {
          slagNotApplicable: dto.slagNotApplicable,
          slagRemovalTime: dto.slagRemovalTime
            ? new Date(dto.slagRemovalTime)
            : undefined,
          slagQuantityEstimate: dto.slagQuantityEstimate,
          slagIssueFound: dto.slagIssueFound,
          ...(isReedit ? {} : { stage: 'A11_REMOVE_SLAG' as const }),
        },
      });
      await this.logActivity(
        tx,
        id,
        'A11',
        employee.id,
        isReedit
          ? [dto.slagIssueFound, dto.reason].filter(Boolean).join(' | ')
          : dto.slagIssueFound,
        { ...dto },
      );
      return tx.steelMelting.findUnique({
        where: { id: updated.id },
        include: meltingInclude,
      });
    });
  }

  // ── P05-A12 — Record melting output and heat-in-process details ──
  async recordMeltOutput(
    id: string,
    dto: RecordMeltOutputDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const melting = await this.findMeltingOrThrow(id, organizationId);
    this.assertActive(melting.status);
    const isReedit = await this.assertStageTransitionOrReedit(
      id,
      melting.stage,
      'A11_REMOVE_SLAG',
      'A12',
      dto.reason,
    );

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelMelting.update({
        where: { id },
        data: {
          outputChargeId:
            dto.outputChargeId ?? melting.chargePreparation.chargeNumber,
          outputFurnaceId: dto.outputFurnaceId,
          outputMeltTimeMinutes: dto.outputMeltTimeMinutes,
          outputEnergyTotalKwh: dto.outputEnergyTotalKwh,
          outputAdditionsSummary: dto.outputAdditionsSummary,
          outputWeightTonnes: dto.outputWeightTonnes,
          ...(isReedit ? {} : { stage: 'A12_RECORD_MELT_OUTPUT' as const }),
        },
      });
      await this.logActivity(tx, id, 'A12', employee.id, dto.reason, {
        ...dto,
      });
      return tx.steelMelting.findUnique({
        where: { id: updated.id },
        include: meltingInclude,
      });
    });
  }

  // ── P05-A13 — Confirm liquid steel ready for sample/refining ──
  async confirmLiquidReady(
    id: string,
    dto: ConfirmLiquidReadyDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const melting = await this.findMeltingOrThrow(id, organizationId);
    this.assertActive(melting.status);
    const isReedit = await this.assertStageTransitionOrReedit(
      id,
      melting.stage,
      'A12_RECORD_MELT_OUTPUT',
      'A13',
      dto.reason,
    );

    if (!dto.liquidReady) {
      throw new BadRequestException(
        'Liquid steel must be confirmed ready before proceeding to handover.',
      );
    }
    if (!dto.liquidOperatorConfirmed) {
      throw new BadRequestException(
        'The operator must confirm liquid steel readiness before proceeding to handover.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelMelting.update({
        where: { id },
        data: {
          liquidReady: dto.liquidReady,
          liquidTemperatureCelsius: dto.liquidTemperatureCelsius,
          liquidOperatorConfirmed: dto.liquidOperatorConfirmed,
          ...(isReedit ? {} : { stage: 'A13_CONFIRM_LIQUID_READY' as const }),
        },
      });
      await this.logActivity(tx, id, 'A13', employee.id, dto.reason, {
        ...dto,
      });
      return tx.steelMelting.findUnique({
        where: { id: updated.id },
        include: meltingInclude,
      });
    });
  }

  // ── P05-A14 — Handover melting record to refining/quality ──
  async refiningHandover(
    id: string,
    dto: RefiningHandoverDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const melting = await this.findMeltingOrThrow(id, organizationId);
    this.assertActive(melting.status);

    if (melting.handoverToRefiningAt) {
      throw new ConflictException(
        'This melting record has already been handed over to refining.',
      );
    }
    this.assertStageTransition(melting.stage, 'A13_CONFIRM_LIQUID_READY');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelMelting.update({
        where: { id },
        data: {
          handoverToRefiningAt: new Date(),
          stage: 'A14_HANDOVER_TO_REFINING',
          status: 'CLOSED',
        },
      });
      if (melting.liningRefId) {
        await tx.furnaceLining.update({
          where: { id: melting.liningRefId },
          data: { heatsCompleted: { increment: 1 } },
        });
      }
      await this.logActivity(tx, id, 'A14', employee.id, dto.notes, {
        ...dto,
      });
      return tx.steelMelting.findUnique({
        where: { id: updated.id },
        include: meltingInclude,
      });
    });
  }

  // Administrative override for exceptional cases (e.g. putting a melting
  // record ON_HOLD or CANCELLED outside the normal A01-A14 flow). Restricted
  // to RELEASE_ROLES at the controller. Deliberately does not re-validate
  // stage/status transitions the way the staged A01-A14 actions do — that's
  // the point of an override — but it is transactional and logged like every
  // other write, so the change is auditable.
  async updateStatus(
    id: string,
    dto: UpdateMeltingStatusDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const melting = await this.findMeltingOrThrow(id, organizationId);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelMelting.update({
        where: { id },
        data: { status: dto.status },
        include: meltingInclude,
      });
      await this.logActivity(
        tx,
        id,
        'STATUS_OVERRIDE',
        employee.id,
        dto.notes,
        { previousStatus: melting.status, newStatus: dto.status },
      );
      return updated;
    });
  }

  // ── Material charges (P05-A06 onward) ──
  //
  // Itemized per-material charge rows, supplementary to the staged A01-A14
  // flow above rather than a stage of their own — a heat can accept charge
  // rows any time it's active (from A06 Load Charge through A10 Record
  // Additions), and multiple rows are expected per heat.

  async addMaterialCharge(
    meltingId: string,
    dto: AddHeatMaterialChargeDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const melting = await this.findMeltingOrThrow(meltingId, organizationId);
    this.assertActive(melting.status);

    return this.prisma.$transaction(async (tx) => {
      const last = await tx.heatMaterialCharge.findFirst({
        where: { meltingId },
        orderBy: { sequence: 'desc' },
        select: { sequence: true },
      });
      return tx.heatMaterialCharge.create({
        data: {
          organizationId,
          meltingId,
          sequence: (last?.sequence ?? 0) + 1,
          material: dto.material,
          materialCategory: dto.materialCategory,
          grade: dto.grade,
          batchRef: dto.batchRef,
          plannedQuantity: dto.plannedQuantity,
          actualQuantity: dto.actualQuantity,
          unit: dto.unit,
          chargedAt: dto.chargedAt ? new Date(dto.chargedAt) : new Date(),
          chargedById: employee.id,
        },
      });
    });
  }

  async getMaterialCharges(
    meltingId: string,
    organizationId: string,
    query: QueryHeatMaterialChargesDto,
  ) {
    await this.findMeltingOrThrow(meltingId, organizationId);
    return this.prisma.heatMaterialCharge.findMany({
      where: {
        meltingId,
        organizationId,
        ...(query.materialCategory && {
          materialCategory: query.materialCategory,
        }),
      },
      include: {
        chargedBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { sequence: 'asc' },
    });
  }

  // ── Heat-cycle events (P05-A07 onward) ──
  //
  // Operational timeline entries (temperature readings, alarms, delays,
  // interventions) — distinct from SteelMeltingActivityLog, which records
  // stage-transition actions. Like material charges, these are supplementary
  // to the staged flow: any active heat can accept event rows.

  async recordCycleEvent(
    meltingId: string,
    dto: RecordHeatCycleEventDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const melting = await this.findMeltingOrThrow(meltingId, organizationId);
    this.assertActive(melting.status);

    return this.prisma.heatCycleEvent.create({
      data: {
        organizationId,
        meltingId,
        eventType: dto.eventType,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
        temperatureCelsius: dto.temperatureCelsius,
        quantity: dto.quantity,
        unit: dto.unit,
        notes: dto.notes,
        recordedById: employee.id,
      },
    });
  }

  async getCycleEvents(
    meltingId: string,
    organizationId: string,
    query: QueryHeatCycleEventsDto,
  ) {
    await this.findMeltingOrThrow(meltingId, organizationId);
    return this.prisma.heatCycleEvent.findMany({
      where: {
        meltingId,
        organizationId,
        ...(query.eventType && { eventType: query.eventType }),
      },
      include: {
        recordedBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { occurredAt: 'asc' },
    });
  }

  // ── Heat efficiency summary (P05 efficiency review) ──
  //
  // Only formulas explicitly supported by the business requirement are
  // computed here: total material input (sum of actual charge quantities)
  // and yield % (output / input × 100), both server-side so the frontend
  // can't spoof them. Energy-per-tonne and lining "efficiency" are NOT
  // computed — no formula for either is defined by the business yet; only
  // the raw stored measurements needed to derive them later are returned.
  async getHeatSummary(meltingId: string, organizationId: string) {
    const melting = await this.findMeltingOrThrow(meltingId, organizationId);

    const [charges, eventCount, additionEventCount] = await Promise.all([
      this.prisma.heatMaterialCharge.findMany({
        where: { meltingId, organizationId },
        select: { actualQuantity: true, unit: true },
      }),
      this.prisma.heatCycleEvent.count({
        where: { meltingId, organizationId },
      }),
      this.prisma.heatCycleEvent.count({
        where: { meltingId, organizationId, eventType: 'MATERIAL_ADDITION' },
      }),
    ]);

    const totalMaterialInput = charges.reduce(
      (sum, c) => sum + c.actualQuantity,
      0,
    );
    const totalOutputTonnes = melting.outputWeightTonnes ?? null;
    const materialLossTonnes =
      totalOutputTonnes !== null && charges.length > 0
        ? totalMaterialInput - totalOutputTonnes
        : null;
    const yieldPercent =
      totalOutputTonnes !== null && totalMaterialInput > 0
        ? (totalOutputTonnes / totalMaterialInput) * 100
        : null;

    const cycleDurationMinutes =
      melting.meltingStartTime && melting.handoverToRefiningAt
        ? (melting.handoverToRefiningAt.getTime() -
            melting.meltingStartTime.getTime()) /
          60000
        : null;

    return {
      heatId: melting.id,
      heatInProcessNumber: melting.heatInProcessNumber,
      furnace: melting.furnace,
      lining: melting.lining,
      stage: melting.stage,
      status: melting.status,

      // Stored measurements
      totalMaterialInput,
      totalOutputTonnes,
      materialAdditionsCount: additionEventCount,
      eventsCount: eventCount,
      targetTemperatureCelsius: null, // not captured on SteelMelting; A01 has no target-temp field yet
      liquidTemperatureCelsius: melting.liquidTemperatureCelsius,
      outputEnergyTotalKwh: melting.outputEnergyTotalKwh,
      meltingStartTime: melting.meltingStartTime,
      handoverToRefiningAt: melting.handoverToRefiningAt,

      // Derived — computed here, never trusted from the client
      materialLossTonnes,
      yieldPercent,
      cycleDurationMinutes,
      // Energy/tonne and lining-efficiency formulas are not implemented —
      // not defined by the business. Consumers should treat their absence
      // as "not yet available", not "zero".
      energyPerTonne: null,
    };
  }

  // ── P05 management dashboard ──
  //
  // Aggregated read for the P05 operations dashboard. Every derived number
  // is computed here, server-side, from the same data model getHeatSummary
  // uses for a single heat — nothing new is invented. Metrics with no
  // business-approved formula (lining "efficiency", energy/tonne) are
  // deliberately absent rather than guessed.
  private resolveDashboardRange(dto: GetMeltingDashboardDto): {
    gte: Date;
    lte: Date;
  } {
    const now = new Date();
    if (dto.range === MeltingDashboardRange.CUSTOM) {
      return {
        gte: dto.from ? new Date(dto.from) : new Date(0),
        lte: dto.to ? new Date(dto.to) : now,
      };
    }
    if (dto.range === MeltingDashboardRange.SEVEN_DAYS) {
      return { gte: new Date(now.getTime() - 7 * 86400000), lte: now };
    }
    if (dto.range === MeltingDashboardRange.THIRTY_DAYS) {
      return { gte: new Date(now.getTime() - 30 * 86400000), lte: now };
    }
    // TODAY (default)
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    return { gte: startOfDay, lte: now };
  }

  async getDashboard(organizationId: string, query: GetMeltingDashboardDto) {
    const range = this.resolveDashboardRange(query);
    const furnaceFilter = query.furnaceId
      ? { furnaceRefId: query.furnaceId }
      : {};

    const activeHeatsWhere: Prisma.SteelMeltingWhereInput = {
      organizationId,
      status: 'IN_PROGRESS',
      ...furnaceFilter,
    };
    const completedHeatsWhere: Prisma.SteelMeltingWhereInput = {
      organizationId,
      status: 'CLOSED',
      handoverToRefiningAt: { gte: range.gte, lte: range.lte },
      ...furnaceFilter,
    };

    const [
      activeHeatsCount,
      completedHeatsCount,
      completedHeats,
      activeHeats,
      furnaces,
      inputAgg,
      outputAgg,
      recentEvents,
      readyCharges,
    ] = await Promise.all([
      this.prisma.steelMelting.count({ where: activeHeatsWhere }),
      this.prisma.steelMelting.count({ where: completedHeatsWhere }),
      // Bounded to the 200 most recent closed heats in range — powers
      // per-heat averages, furnace comparison, and the history table.
      // KPI totals below come from separate aggregate queries so they stay
      // accurate even beyond this bound.
      this.prisma.steelMelting.findMany({
        where: completedHeatsWhere,
        select: {
          id: true,
          heatInProcessNumber: true,
          chargeNumberSnapshot: true,
          chargePreparationId: true,
          stage: true,
          status: true,
          furnaceRefId: true,
          furnace: { select: { id: true, code: true, name: true } },
          liningRefId: true,
          liningCampaignId: true,
          lining: { select: { id: true, code: true, installedAt: true, heatsCompleted: true } },
          meltingStartTime: true,
          handoverToRefiningAt: true,
          outputWeightTonnes: true,
          outputMeltTimeMinutes: true,
          recipeScrapWeightSnapshot: true,
          recipeDriWeightSnapshot: true,
          recipeAlloyWeightSnapshot: true,
          recipeAdditiveWeightSnapshot: true,
          chargePreparation: { select: { actualGrade: true } },
        },
        orderBy: { handoverToRefiningAt: 'desc' },
        take: 200,
      }),
      this.prisma.steelMelting.findMany({
        where: activeHeatsWhere,
        select: {
          id: true,
          heatInProcessNumber: true,
          chargeNumberSnapshot: true,
          chargePreparationId: true,
          stage: true,
          status: true,
          furnaceRefId: true,
          furnace: { select: { id: true, code: true, name: true } },
          liningRefId: true,
          liningCampaignId: true,
          lining: { select: { id: true, code: true, installedAt: true, heatsCompleted: true } },
          meltingStartTime: true,
          createdAt: true,
          temperatureCelsius: true,
          powerKwh: true,
          outputEnergyTotalKwh: true,
          recipeScrapWeightSnapshot: true,
          recipeDriWeightSnapshot: true,
          recipeAlloyWeightSnapshot: true,
          recipeAdditiveWeightSnapshot: true,
          chargePreparation: { select: { actualGrade: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.furnace.findMany({
        where: { organizationId },
        include: {
          linings: { where: { status: 'ACTIVE' }, take: 1 },
        },
        orderBy: { code: 'asc' },
      }),
      // "Material Processed" KPI — total actual quantity charged in range,
      // across active and completed heats alike. Units are whatever each
      // charge row recorded (HeatMaterialCharge.unit is free text); this sum
      // assumes a consistent unit across charges and is not unit-converted.
      this.prisma.heatMaterialCharge.aggregate({
        where: {
          organizationId,
          chargedAt: { gte: range.gte, lte: range.lte },
          ...(query.furnaceId
            ? { melting: { furnaceRefId: query.furnaceId } }
            : {}),
        },
        _sum: { actualQuantity: true },
      }),
      this.prisma.steelMelting.aggregate({
        where: completedHeatsWhere,
        _sum: { outputWeightTonnes: true },
      }),
      this.prisma.heatCycleEvent.findMany({
        where: {
          organizationId,
          ...(query.furnaceId
            ? { melting: { furnaceRefId: query.furnaceId } }
            : {}),
        },
        orderBy: { occurredAt: 'desc' },
        take: 20,
        include: {
          melting: { select: { id: true, heatInProcessNumber: true } },
          recordedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      // Charge preparations that are P04-CLOSED with a released charge
      // number but have no SteelMelting yet — i.e. "ready charge, no heat
      // started" (P04 CLOSED is NOT a P05 status; it only means the charge
      // is ready to become a new heat). `melting: null` uses the optional
      // 1:1 back-relation on SteelChargePreparation, so this can never
      // include a charge that already has a melting record.
      this.prisma.steelChargePreparation.findMany({
        where: {
          organizationId,
          status: 'CLOSED',
          chargeNumber: { not: null },
          melting: null,
        },
        select: {
          id: true,
          prepNumber: true,
          chargeNumber: true,
          actualGrade: true,
          actualWeightTonnes: true,
          sortedWeightTonnes: true,
          recipeScrapWeightTonnes: true,
          recipeDriWeightTonnes: true,
          recipeAlloyWeightTonnes: true,
          recipeAdditiveWeightTonnes: true,
          furnaceReadinessConfirmed: true,
          plannedHeatReference: true,
          chargeReleasedAt: true,
        },
        orderBy: { chargeReleasedAt: 'desc' },
        take: 10,
      }),
    ]);

    // Per-heat material input for the bounded completed-heats list — one
    // groupBy instead of N queries.
    const chargeSums = completedHeats.length
      ? await this.prisma.heatMaterialCharge.groupBy({
          by: ['meltingId'],
          where: { meltingId: { in: completedHeats.map((h) => h.id) } },
          _sum: { actualQuantity: true },
        })
      : [];
    const inputByMelting = new Map(
      chargeSums.map((c) => [c.meltingId, c._sum.actualQuantity ?? 0]),
    );

    // Same for active heats — "current input charged so far" per heat.
    const activeChargeSums = activeHeats.length
      ? await this.prisma.heatMaterialCharge.groupBy({
          by: ['meltingId'],
          where: { meltingId: { in: activeHeats.map((h) => h.id) } },
          _sum: { actualQuantity: true },
        })
      : [];
    const activeInputByMelting = new Map(
      activeChargeSums.map((c) => [c.meltingId, c._sum.actualQuantity ?? 0]),
    );

    const computedHeats = completedHeats.map((h) => {
      const materialInput = inputByMelting.get(h.id) ?? null;
      const output = h.outputWeightTonnes;
      const materialLoss =
        materialInput !== null && output !== null
          ? materialInput - output
          : null;
      const yieldPercent =
        materialInput !== null && materialInput > 0 && output !== null
          ? (output / materialInput) * 100
          : null;
      const cycleDurationMinutes =
        h.meltingStartTime && h.handoverToRefiningAt
          ? (h.handoverToRefiningAt.getTime() - h.meltingStartTime.getTime()) /
            60000
          : null;
      // "Target" here is the P04 recipe's planned charge weight (the actual
      // real number the operator designed this heat around) — there is no
      // separate business-defined output target anywhere in the schema, so
      // this is the only honest stand-in. Null (not 0) when no recipe
      // snapshot was captured, so the frontend can tell "no target" from
      // "target is zero".
      const plannedChargeTonnes =
        h.recipeScrapWeightSnapshot === null &&
        h.recipeDriWeightSnapshot === null &&
        h.recipeAlloyWeightSnapshot === null &&
        h.recipeAdditiveWeightSnapshot === null
          ? null
          : (h.recipeScrapWeightSnapshot ?? 0) +
            (h.recipeDriWeightSnapshot ?? 0) +
            (h.recipeAlloyWeightSnapshot ?? 0) +
            (h.recipeAdditiveWeightSnapshot ?? 0);
      const varianceTonnes =
        output !== null && plannedChargeTonnes !== null
          ? output - plannedChargeTonnes
          : null;
      return {
        ...h,
        materialInput,
        output,
        materialLoss,
        yieldPercent,
        cycleDurationMinutes,
        grade: h.chargePreparation?.actualGrade ?? null,
        plannedChargeTonnes,
        varianceTonnes,
      };
    });

    const yieldedHeats = computedHeats.filter((h) => h.yieldPercent !== null);
    const averageYieldPercent = yieldedHeats.length
      ? yieldedHeats.reduce((sum, h) => sum + (h.yieldPercent ?? 0), 0) /
        yieldedHeats.length
      : null;

    const timedHeats = computedHeats.filter(
      (h) => h.cycleDurationMinutes !== null,
    );
    const averageCycleDurationMinutes = timedHeats.length
      ? timedHeats.reduce((sum, h) => sum + (h.cycleDurationMinutes ?? 0), 0) /
        timedHeats.length
      : null;

    const totalLossTonnes = computedHeats.reduce(
      (sum, h) => sum + (h.materialLoss ?? 0),
      0,
    );

    // Furnace comparison — grouped in-memory from the already-fetched
    // bounded completedHeats list (no extra query).
    const furnacePerformance = furnaces.map((f) => {
      const heats = computedHeats.filter((h) => h.furnaceRefId === f.id);
      const heatYields = heats.filter((h) => h.yieldPercent !== null);
      const heatDurations = heats.filter(
        (h) => h.cycleDurationMinutes !== null,
      );
      return {
        furnaceId: f.id,
        code: f.code,
        name: f.name,
        heatsCompleted: heats.length,
        averageYieldPercent: heatYields.length
          ? heatYields.reduce((s, h) => s + (h.yieldPercent ?? 0), 0) /
            heatYields.length
          : null,
        averageCycleDurationMinutes: heatDurations.length
          ? heatDurations.reduce(
              (s, h) => s + (h.cycleDurationMinutes ?? 0),
              0,
            ) / heatDurations.length
          : null,
        totalMaterialInput: heats.reduce(
          (s, h) => s + (h.materialInput ?? 0),
          0,
        ),
        totalOutputTonnes: heats.reduce((s, h) => s + (h.output ?? 0), 0),
      };
    });

    const activeHeatByFurnace = new Map(
      activeHeats
        .filter((h) => h.furnaceRefId)
        .map((h) => [h.furnaceRefId as string, h]),
    );

    const furnaceStatus = furnaces.map((f) => {
      const activeHeat = activeHeatByFurnace.get(f.id) ?? null;
      const lining = f.linings[0] ?? null;
      return {
        id: f.id,
        code: f.code,
        name: f.name,
        status: f.status,
        activeHeat: activeHeat
          ? {
              id: activeHeat.id,
              heatInProcessNumber: activeHeat.heatInProcessNumber,
              chargeNumberSnapshot: activeHeat.chargeNumberSnapshot,
              stage: activeHeat.stage,
              temperatureCelsius: activeHeat.temperatureCelsius,
              meltingStartTime: activeHeat.meltingStartTime,
            }
          : null,
        lining: lining
          ? {
              id: lining.id,
              code: lining.code,
              installedAt: lining.installedAt,
              heatsCompleted: lining.heatsCompleted,
              condition: lining.condition,
              thicknessRemainingMm: lining.thicknessRemainingMm,
              status: lining.status,
            }
          : null,
      };
    });

    const liningStatus = furnaceStatus
      .filter((f) => f.lining)
      .map((f) => ({
        furnaceId: f.id,
        furnaceCode: f.code,
        ...f.lining!,
      }));

    const furnacesRunning = activeHeatByFurnace.size;

    // "Target" tonnage for the KPI strip = sum of the P04 recipe (planned
    // charge) weights for heats completed in range — the same honest
    // stand-in as plannedChargeTonnes per-heat above, just summed. null when
    // nothing in range has a recipe snapshot, so the frontend can render
    // "not set" instead of a misleading 0%.
    const heatsWithPlan = computedHeats.filter(
      (h) => h.plannedChargeTonnes !== null,
    );
    const plannedChargeTonnesTotal = heatsWithPlan.length
      ? heatsWithPlan.reduce((s, h) => s + (h.plannedChargeTonnes ?? 0), 0)
      : null;
    const onTargetPercent =
      plannedChargeTonnesTotal !== null && plannedChargeTonnesTotal > 0
        ? ((outputAgg._sum.outputWeightTonnes ?? 0) /
            plannedChargeTonnesTotal) *
          100
        : null;

    const readyChargesMapped = readyCharges.map((c) => {
      const plannedChargeTonnes =
        c.recipeScrapWeightTonnes === null &&
        c.recipeDriWeightTonnes === null &&
        c.recipeAlloyWeightTonnes === null &&
        c.recipeAdditiveWeightTonnes === null
          ? null
          : (c.recipeScrapWeightTonnes ?? 0) +
            (c.recipeDriWeightTonnes ?? 0) +
            (c.recipeAlloyWeightTonnes ?? 0) +
            (c.recipeAdditiveWeightTonnes ?? 0);
      return {
        chargePreparationId: c.id,
        prepNumber: c.prepNumber,
        chargeNumber: c.chargeNumber,
        grade: c.actualGrade,
        weightTonnes: c.actualWeightTonnes ?? c.sortedWeightTonnes ?? null,
        plannedChargeTonnes,
        furnaceReadinessConfirmed: c.furnaceReadinessConfirmed,
        plannedHeatReference: c.plannedHeatReference,
        chargeReleasedAt: c.chargeReleasedAt,
      };
    });

    return {
      period: {
        range: query.range ?? MeltingDashboardRange.TODAY,
        from: range.gte,
        to: range.lte,
      },
      kpis: {
        activeHeats: activeHeatsCount,
        completedHeats: completedHeatsCount,
        averageYieldPercent,
        totalMaterialInput: inputAgg._sum.actualQuantity ?? 0,
        totalOutputTonnes: outputAgg._sum.outputWeightTonnes ?? 0,
        averageCycleDurationMinutes,
        furnacesRunning,
        furnacesTotal: furnaces.length,
        readyChargesCount: readyCharges.length,
        // Both null when nothing completed in range has a captured P04
        // recipe snapshot — there is no other target-tonnage source in the
        // schema. Never render 0% in that case; render "not available".
        plannedChargeTonnes: plannedChargeTonnesTotal,
        onTargetPercent,
      },
      materialOverview: {
        // Scoped to the bounded completed-heats list above (heats with both
        // charge and output data) — may differ slightly from kpis.totalMaterialInput,
        // which sums ALL charges (including active heats) in range.
        totalInputTonnes: computedHeats.reduce(
          (s, h) => s + (h.materialInput ?? 0),
          0,
        ),
        totalOutputTonnes: outputAgg._sum.outputWeightTonnes ?? 0,
        totalLossTonnes,
        averageYieldPercent,
      },
      furnaceStatus,
      activeHeats: activeHeats.map((h) => {
        const plannedChargeTonnes =
          h.recipeScrapWeightSnapshot === null &&
          h.recipeDriWeightSnapshot === null &&
          h.recipeAlloyWeightSnapshot === null &&
          h.recipeAdditiveWeightSnapshot === null
            ? null
            : (h.recipeScrapWeightSnapshot ?? 0) +
              (h.recipeDriWeightSnapshot ?? 0) +
              (h.recipeAlloyWeightSnapshot ?? 0) +
              (h.recipeAdditiveWeightSnapshot ?? 0);
        return {
          id: h.id,
          heatInProcessNumber: h.heatInProcessNumber,
          chargeNumberSnapshot: h.chargeNumberSnapshot,
          // Real UUID so the frontend can deep-link to the P04 record — not
          // trustworthy to derive from the snapshot string above.
          chargePreparationId: h.chargePreparationId,
          grade: h.chargePreparation?.actualGrade ?? null,
          furnace: h.furnace,
          stage: h.stage,
          status: h.status,
          meltingStartTime: h.meltingStartTime,
          startedAt: h.meltingStartTime ?? h.createdAt,
          temperatureCelsius: h.temperatureCelsius,
          powerKwh: h.powerKwh,
          outputEnergyTotalKwh: h.outputEnergyTotalKwh,
          materialInput: activeInputByMelting.get(h.id) ?? 0,
          plannedChargeTonnes,
          // Structured lining master data when linked (P05-A02), falling
          // back to the free-text campaign ID snapshot otherwise. Present
          // on both active and completed heats — same shape, same source
          // fields — so the frontend never has to special-case one state.
          liningRefId: h.liningRefId,
          lining: h.lining,
          liningCampaignId: h.liningCampaignId,
        };
      }),
      furnacePerformance,
      liningStatus,
      readyCharges: readyChargesMapped,
      nextReadyCharge: readyChargesMapped[0] ?? null,
      recentHeats: computedHeats.map((h) => ({
        id: h.id,
        heatInProcessNumber: h.heatInProcessNumber,
        chargeNumberSnapshot: h.chargeNumberSnapshot,
        chargePreparationId: h.chargePreparationId,
        grade: h.grade,
        furnace: h.furnace,
        liningRefId: h.liningRefId,
        lining: h.lining,
        liningCampaignId: h.liningCampaignId,
        status: h.status,
        // meltingStartTime was already selected for completed heats but
        // previously dropped from this mapped response — active heats got
        // startedAt, completed heats silently didn't, purely because the two
        // states go through different map literals below. Both now surface
        // it (still legitimately null for a heat that never captured a
        // start time — not omitted from the type, so the frontend can
        // render an explicit "—" instead of a field that never existed).
        meltingStartTime: h.meltingStartTime,
        startedAt: h.meltingStartTime,
        handoverToRefiningAt: h.handoverToRefiningAt,
        materialInput: h.materialInput,
        output: h.output,
        materialLoss: h.materialLoss,
        yieldPercent: h.yieldPercent,
        cycleDurationMinutes: h.cycleDurationMinutes,
        outputMeltTimeMinutes: h.outputMeltTimeMinutes,
        plannedChargeTonnes: h.plannedChargeTonnes,
        varianceTonnes: h.varianceTonnes,
      })),
      recentEvents: recentEvents.map((e) => ({
        id: e.id,
        occurredAt: e.occurredAt,
        eventType: e.eventType,
        temperatureCelsius: e.temperatureCelsius,
        quantity: e.quantity,
        unit: e.unit,
        notes: e.notes,
        meltingId: e.melting.id,
        heatInProcessNumber: e.melting.heatInProcessNumber,
        recordedBy: e.recordedBy,
      })),
    };
  }

  // ── Reads ──

  async getById(id: string, organizationId: string) {
    const melting = await this.findMeltingOrThrow(id, organizationId);
    return { ...melting, allowedActions: computeAllowedActions(melting) };
  }

  async getAll(organizationId: string, query: QueryMeltingsDto) {
    const { chargePreparationId, stage, status, search, page, limit } = query;

    const where: Prisma.SteelMeltingWhereInput = {
      organizationId,
      ...(chargePreparationId && { chargePreparationId }),
      ...(stage && { stage }),
      ...(status && { status }),
      ...(search && {
        OR: [
          { heatInProcessNumber: { contains: search, mode: 'insensitive' } },
          { chargeNumberSnapshot: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.steelMelting.findMany({
        where,
        include: {
          createdBy: { select: { id: true, firstName: true, lastName: true } },
          chargePreparation: { select: { id: true, prepNumber: true } },
          _count: { select: { activityLogs: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.steelMelting.count({ where }),
    ]);

    return {
      data,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  // Charge preparations eligible to start a new heat from — P04-CLOSED with
  // a released charge number and NOT already claimed by a SteelMelting
  // record. Backs the P05 "New Heat" dropdown. Filtering happens here,
  // server-side, via the `melting: null` optional 1:1 back-relation on
  // SteelChargePreparation (chargePreparationId is unique on SteelMelting),
  // so a charge that already has a heat can never be returned — the
  // frontend must not need to filter this list itself.
  async getAvailableChargePreparations(organizationId: string) {
    return this.prisma.steelChargePreparation.findMany({
      where: {
        organizationId,
        status: 'CLOSED',
        chargeNumber: { not: null },
        melting: null,
      },
      select: {
        id: true,
        prepNumber: true,
        chargeNumber: true,
        plannedHeatReference: true,
        chargeReleasedAt: true,
      },
      orderBy: { chargeReleasedAt: 'desc' },
      take: 200,
    });
  }

  async getSummary(organizationId: string) {
    const [byStage, byStatus, total] = await this.prisma.$transaction([
      this.prisma.steelMelting.groupBy({
        by: ['stage'],
        where: { organizationId },
        orderBy: { stage: 'asc' },
        _count: true,
      }),
      this.prisma.steelMelting.groupBy({
        by: ['status'],
        where: { organizationId },
        orderBy: { status: 'asc' },
        _count: true,
      }),
      this.prisma.steelMelting.count({ where: { organizationId } }),
    ]);

    return {
      total,
      byStage: Object.fromEntries(byStage.map((r) => [r.stage, r._count])),
      byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count])),
    };
  }
}
