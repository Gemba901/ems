import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SteelHeatApprovalStage, SteelHeatApprovalActivity, Prisma } from 'db';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  TakeSampleDto,
  AnalyzeSampleDto,
  CompareChemistryDto,
  DecideCorrectionDto,
  AddCorrectionMaterialDto,
  RetestChemistryDto,
  CheckTemperatureDto,
  CheckLadleReadinessDto,
  ApproveChemistryTemperatureDto,
  ConfirmHeatNumberDto,
  TappingApprovalDto,
  TapToLadleDto,
  ReleaseToCastingDto,
  UpdateHeatApprovalStatusDto,
  QueryHeatApprovalsDto,
} from './dto/heat-approval.dto';

// The order the 13 heat-approval activities must occur in. Mirrors the
// P01-P05 STAGE_ORDER pattern so a step can't be recorded before its
// prerequisite.
const STAGE_ORDER: SteelHeatApprovalStage[] = [
  'A01_TAKE_SAMPLE',
  'A02_ANALYZE_SAMPLE',
  'A03_COMPARE_CHEMISTRY',
  'A04_DECIDE_CORRECTION',
  'A05_ADD_CORRECTION_MATERIAL',
  'A06_RETEST_CHEMISTRY',
  'A07_CHECK_TEMPERATURE',
  'A08_CHECK_LADLE_READINESS',
  'A09_APPROVE_CHEMISTRY_TEMPERATURE',
  'A10_CONFIRM_HEAT_NUMBER',
  'A11_TAPPING_APPROVAL',
  'A12_TAP_TO_LADLE',
  'A13_RELEASE_TO_CASTING',
] as SteelHeatApprovalStage[];

const heatApprovalInclude = {
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  melting: {
    select: {
      id: true,
      heatInProcessNumber: true,
      chargeNumberSnapshot: true,
      status: true,
      stage: true,
    },
  },
  activityLogs: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      performedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  },
};

// Actions the frontend can offer, derived from (stage, status) so it never
// has to recreate the state machine itself.
function computeAllowedActions(heatApproval: {
  stage: SteelHeatApprovalStage;
  status: string;
}): string[] {
  if (['CANCELLED', 'CLOSED'].includes(heatApproval.status)) return [];
  if (heatApproval.status === 'ON_HOLD') return [];

  switch (heatApproval.stage) {
    case 'A01_TAKE_SAMPLE':
      return ['ANALYZE_SAMPLE'];
    case 'A02_ANALYZE_SAMPLE':
      return ['COMPARE_CHEMISTRY'];
    case 'A03_COMPARE_CHEMISTRY':
      return ['DECIDE_CORRECTION'];
    case 'A04_DECIDE_CORRECTION':
      return ['ADD_CORRECTION_MATERIAL'];
    case 'A05_ADD_CORRECTION_MATERIAL':
      return ['RETEST_CHEMISTRY'];
    case 'A06_RETEST_CHEMISTRY':
      return ['CHECK_TEMPERATURE'];
    case 'A07_CHECK_TEMPERATURE':
      return ['CHECK_LADLE_READINESS'];
    case 'A08_CHECK_LADLE_READINESS':
      return ['APPROVE_CHEMISTRY_TEMPERATURE'];
    case 'A09_APPROVE_CHEMISTRY_TEMPERATURE':
      return ['CONFIRM_HEAT_NUMBER'];
    case 'A10_CONFIRM_HEAT_NUMBER':
      return ['TAPPING_APPROVAL'];
    case 'A11_TAPPING_APPROVAL':
      return ['TAP_TO_LADLE'];
    case 'A12_TAP_TO_LADLE':
      return ['RELEASE_TO_CASTING'];
    case 'A13_RELEASE_TO_CASTING':
      return [];
    default:
      return [];
  }
}

/**
 * P06 — Heat Approval.
 *
 * Mirrors the P01-P05 pattern: strict sequential stage progression, one
 * activity-log row per meaningful action, org-scoped reads, transactional
 * writes. Created against a P05 melting record that has completed its
 * refining handover (A14_HANDOVER_TO_REFINING / CLOSED) — a melting record
 * can be sent for heat approval at most once (unique meltingId).
 *
 * Release to casting (P06-A13) is irreversible and idempotent — it cannot
 * happen twice for the same record. No P07 model/code exists yet in this
 * repository.
 */
// Default cap on how many times the A05<->A06 correction/re-test cycle can
// loop before the heat is escalated to ON_HOLD. Configurable via
// STEEL_P06_MAX_CORRECTION_ATTEMPTS for environments that want a different
// threshold without a code change.
const DEFAULT_MAX_CORRECTION_ATTEMPTS = 3;

@Injectable()
export class HeatApprovalService {
  private readonly maxCorrectionAttempts: number;

  constructor(private prisma: PrismaService) {
    const configured = Number(process.env.STEEL_P06_MAX_CORRECTION_ATTEMPTS);
    this.maxCorrectionAttempts =
      Number.isInteger(configured) && configured > 0
        ? configured
        : DEFAULT_MAX_CORRECTION_ATTEMPTS;
  }

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

  private async findHeatApprovalOrThrow(id: string, organizationId: string) {
    const heatApproval = await this.prisma.steelHeatApproval.findFirst({
      where: { id, organizationId },
      include: heatApprovalInclude,
    });
    if (!heatApproval)
      throw new NotFoundException('Heat approval record not found');
    return heatApproval;
  }

  private assertActive(status: string) {
    if (status === 'CANCELLED' || status === 'CLOSED') {
      throw new ConflictException(
        'This heat approval record is closed and cannot be progressed further.',
      );
    }
    if (status === 'ON_HOLD') {
      throw new ConflictException(
        'This heat approval record is on hold and cannot be progressed further.',
      );
    }
  }

  private assertStageTransition(
    currentStage: SteelHeatApprovalStage,
    requiredCurrentStage: SteelHeatApprovalStage,
  ) {
    if (currentStage === requiredCurrentStage) return;
    const currentIdx = STAGE_ORDER.indexOf(currentStage);
    const requiredIdx = STAGE_ORDER.indexOf(requiredCurrentStage);
    if (currentIdx < requiredIdx) {
      throw new ConflictException(
        'This step cannot be recorded yet — the previous heat approval step has not been completed.',
      );
    }
    throw new ConflictException(
      'This heat approval step has already been completed and the record has moved on.',
    );
  }

  private async generateApprovalNumber(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ) {
    const year = new Date().getFullYear();
    const count = await tx.steelHeatApproval.count({
      where: {
        organizationId,
        createdAt: {
          gte: new Date(`${year}-01-01T00:00:00.000Z`),
          lt: new Date(`${year + 1}-01-01T00:00:00.000Z`),
        },
      },
    });
    const sequence = String(count + 1).padStart(5, '0');
    return `HA-${year}-${sequence}`;
  }

  private async logActivity(
    tx: Prisma.TransactionClient,
    heatApprovalId: string,
    activity: SteelHeatApprovalActivity,
    performedById: string,
    notes?: string,
    data?: Record<string, unknown>,
  ) {
    await tx.steelHeatApprovalActivityLog.create({
      data: {
        heatApprovalId,
        activity,
        performedById,
        notes,
        data: data ? (data as Prisma.InputJsonValue) : undefined,
      },
    });
  }

  // ── P06-A01 — Take liquid steel sample ──
  async createHeatApproval(
    dto: TakeSampleDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);

    const melting = await this.prisma.steelMelting.findFirst({
      where: { id: dto.meltingId, organizationId },
    });
    if (!melting) throw new NotFoundException('Melting record not found');
    if (
      melting.status !== 'CLOSED' ||
      melting.stage !== 'A14_HANDOVER_TO_REFINING'
    ) {
      throw new BadRequestException(
        'Heat approval can only be started against a melting record that has completed refining handover (P05-A14).',
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const approvalNumber = await this.generateApprovalNumber(
          tx,
          organizationId,
        );

        const heatApproval = await tx.steelHeatApproval.create({
          data: {
            approvalNumber,
            organizationId,
            meltingId: dto.meltingId,
            createdById: employee.id,
            stage: 'A01_TAKE_SAMPLE',
            status: 'IN_PROGRESS',
            sampleRef: dto.sampleRef,
            sampleTakenAt: dto.sampleTakenAt
              ? new Date(dto.sampleTakenAt)
              : new Date(),
          },
        });

        await this.logActivity(
          tx,
          heatApproval.id,
          'A01',
          employee.id,
          undefined,
          { ...dto },
        );
        return tx.steelHeatApproval.findUnique({
          where: { id: heatApproval.id },
          include: heatApprovalInclude,
        });
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        (err.meta?.target as string[] | undefined)?.includes('meltingId')
      ) {
        throw new BadRequestException(
          'This heat has already been sent for chemistry approval.',
        );
      }
      throw err;
    }
  }

  // ── P06-A02 — Analyze sample in spectrometer/lab ──
  async analyzeSample(
    id: string,
    dto: AnalyzeSampleDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const heatApproval = await this.findHeatApprovalOrThrow(id, organizationId);
    this.assertActive(heatApproval.status);
    this.assertStageTransition(heatApproval.stage, 'A01_TAKE_SAMPLE');

    if (
      !dto.chemistryComposition ||
      Object.keys(dto.chemistryComposition).length === 0
    ) {
      throw new BadRequestException(
        'Chemistry composition results must be recorded before the sample can be compared to the required grade.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelHeatApproval.update({
        where: { id },
        data: {
          chemistryComposition:
            dto.chemistryComposition as Prisma.InputJsonValue,
          labRef: dto.labRef,
          stage: 'A02_ANALYZE_SAMPLE',
        },
      });
      await this.logActivity(tx, id, 'A02', employee.id, undefined, {
        ...dto,
      });
      return tx.steelHeatApproval.findUnique({
        where: { id: updated.id },
        include: heatApprovalInclude,
      });
    });
  }

  // ── P06-A03 — Compare chemistry with required grade ──
  async compareChemistry(
    id: string,
    dto: CompareChemistryDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const heatApproval = await this.findHeatApprovalOrThrow(id, organizationId);
    this.assertActive(heatApproval.status);
    this.assertStageTransition(heatApproval.stage, 'A02_ANALYZE_SAMPLE');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelHeatApproval.update({
        where: { id },
        data: {
          requiredGrade: dto.requiredGrade,
          chemistryMatchesGrade: dto.chemistryMatchesGrade,
          chemistryDeviationNotes: dto.chemistryDeviationNotes,
          stage: 'A03_COMPARE_CHEMISTRY',
        },
      });
      await this.logActivity(
        tx,
        id,
        'A03',
        employee.id,
        dto.chemistryDeviationNotes,
        { ...dto },
      );
      return tx.steelHeatApproval.findUnique({
        where: { id: updated.id },
        include: heatApprovalInclude,
      });
    });
  }

  // ── P06-A04 — Decide correction requirement ──
  async decideCorrection(
    id: string,
    dto: DecideCorrectionDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const heatApproval = await this.findHeatApprovalOrThrow(id, organizationId);
    this.assertActive(heatApproval.status);
    this.assertStageTransition(heatApproval.stage, 'A03_COMPARE_CHEMISTRY');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelHeatApproval.update({
        where: { id },
        data: {
          correctionRequired: dto.correctionRequired,
          correctionReason: dto.correctionReason,
          stage: 'A04_DECIDE_CORRECTION',
        },
      });
      await this.logActivity(tx, id, 'A04', employee.id, dto.correctionReason, {
        ...dto,
      });
      return tx.steelHeatApproval.findUnique({
        where: { id: updated.id },
        include: heatApprovalInclude,
      });
    });
  }

  // ── P06-A05 — Add alloy, carbon raiser, lime, or correction material (conditional) ──
  async addCorrectionMaterial(
    id: string,
    dto: AddCorrectionMaterialDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const heatApproval = await this.findHeatApprovalOrThrow(id, organizationId);
    this.assertActive(heatApproval.status);
    this.assertStageTransition(heatApproval.stage, 'A04_DECIDE_CORRECTION');

    if (
      heatApproval.correctionRequired &&
      (!dto.correctionMaterials || dto.correctionMaterials.length === 0)
    ) {
      throw new BadRequestException(
        'Correction materials must be recorded — chemistry was determined to need correction.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelHeatApproval.update({
        where: { id },
        data: {
          correctionMaterials: dto.correctionMaterials
            ? (dto.correctionMaterials as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          correctionNotApplicable: dto.correctionNotApplicable,
          stage: 'A05_ADD_CORRECTION_MATERIAL',
        },
      });
      await this.logActivity(tx, id, 'A05', employee.id, undefined, {
        ...dto,
      });
      return tx.steelHeatApproval.findUnique({
        where: { id: updated.id },
        include: heatApprovalInclude,
      });
    });
  }

  // ── P06-A06 — Re-test chemistry if required (conditional) ──
  async retestChemistry(
    id: string,
    dto: RetestChemistryDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const heatApproval = await this.findHeatApprovalOrThrow(id, organizationId);
    this.assertActive(heatApproval.status);
    this.assertStageTransition(
      heatApproval.stage,
      'A05_ADD_CORRECTION_MATERIAL',
    );

    if (
      heatApproval.correctionRequired &&
      (!dto.retestChemistryComposition ||
        Object.keys(dto.retestChemistryComposition).length === 0)
    ) {
      throw new BadRequestException(
        'Chemistry must be re-tested and recorded after a correction was made.',
      );
    }

    // A correction was required and the re-test still doesn't match the
    // grade — loop back to A04_DECIDE_CORRECTION for another correction
    // pass, capped at MAX_CORRECTION_ATTEMPTS since repeated correction is
    // itself a cost/delay signal (matches the workbook).
    const stillNeedsCorrection =
      !!heatApproval.correctionRequired && dto.retestMatchesGrade === false;

    if (stillNeedsCorrection) {
      const nextAttempts = heatApproval.correctionAttempts + 1;

      if (nextAttempts >= this.maxCorrectionAttempts) {
        await this.prisma.$transaction(async (tx) => {
          await tx.steelHeatApproval.update({
            where: { id },
            data: {
              retestChemistryComposition: dto.retestChemistryComposition
                ? (dto.retestChemistryComposition as Prisma.InputJsonValue)
                : Prisma.JsonNull,
              correctionAttempts: nextAttempts,
              status: 'ON_HOLD',
            },
          });
          await this.logActivity(
            tx,
            id,
            'A06',
            employee.id,
            `Correction attempt limit (${this.maxCorrectionAttempts}) reached — escalated to hold`,
            { ...dto, correctionAttempts: nextAttempts },
          );
        });
        throw new ConflictException(
          `Chemistry correction has been attempted ${nextAttempts} time(s) without success — this heat has been placed on hold pending escalation.`,
        );
      }

      return this.prisma.$transaction(async (tx) => {
        const updated = await tx.steelHeatApproval.update({
          where: { id },
          data: {
            retestChemistryComposition: dto.retestChemistryComposition
              ? (dto.retestChemistryComposition as Prisma.InputJsonValue)
              : Prisma.JsonNull,
            correctionAttempts: nextAttempts,
            stage: 'A04_DECIDE_CORRECTION',
          },
        });
        await this.logActivity(
          tx,
          id,
          'A06',
          employee.id,
          'Retest still does not match the required grade — looping back for another correction attempt',
          { ...dto, correctionAttempts: nextAttempts },
        );
        return tx.steelHeatApproval.findUnique({
          where: { id: updated.id },
          include: heatApprovalInclude,
        });
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelHeatApproval.update({
        where: { id },
        data: {
          retestChemistryComposition: dto.retestChemistryComposition
            ? (dto.retestChemistryComposition as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          retestNotApplicable: dto.retestNotApplicable,
          stage: 'A06_RETEST_CHEMISTRY',
        },
      });
      await this.logActivity(tx, id, 'A06', employee.id, undefined, {
        ...dto,
      });
      return tx.steelHeatApproval.findUnique({
        where: { id: updated.id },
        include: heatApprovalInclude,
      });
    });
  }

  // ── P06-A07 — Check liquid steel temperature ──
  async checkTemperature(
    id: string,
    dto: CheckTemperatureDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const heatApproval = await this.findHeatApprovalOrThrow(id, organizationId);
    this.assertActive(heatApproval.status);
    this.assertStageTransition(heatApproval.stage, 'A06_RETEST_CHEMISTRY');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelHeatApproval.update({
        where: { id },
        data: {
          liquidTemperatureCelsius: dto.liquidTemperatureCelsius,
          stage: 'A07_CHECK_TEMPERATURE',
        },
      });
      await this.logActivity(tx, id, 'A07', employee.id, undefined, {
        ...dto,
      });
      return tx.steelHeatApproval.findUnique({
        where: { id: updated.id },
        include: heatApprovalInclude,
      });
    });
  }

  // ── P06-A08 — Check ladle readiness and lining condition ──
  async checkLadleReadiness(
    id: string,
    dto: CheckLadleReadinessDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const heatApproval = await this.findHeatApprovalOrThrow(id, organizationId);
    this.assertActive(heatApproval.status);
    this.assertStageTransition(heatApproval.stage, 'A07_CHECK_TEMPERATURE');

    if (!dto.ladleLiningCondition || !dto.ladleLiningCondition.trim()) {
      throw new BadRequestException(
        'The ladle lining condition must be recorded before tapping approval can proceed.',
      );
    }
    if (!dto.ladleReady) {
      throw new BadRequestException(
        'The ladle must be confirmed ready before tapping approval can proceed.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelHeatApproval.update({
        where: { id },
        data: {
          ladleId: dto.ladleId,
          ladleLiningCondition: dto.ladleLiningCondition,
          ladleReady: dto.ladleReady,
          stage: 'A08_CHECK_LADLE_READINESS',
        },
      });
      await this.logActivity(tx, id, 'A08', employee.id, undefined, {
        ...dto,
      });
      return tx.steelHeatApproval.findUnique({
        where: { id: updated.id },
        include: heatApprovalInclude,
      });
    });
  }

  // ── P06-A09 — Approve chemistry and temperature ──
  async approveChemistryTemperature(
    id: string,
    dto: ApproveChemistryTemperatureDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const heatApproval = await this.findHeatApprovalOrThrow(id, organizationId);
    this.assertActive(heatApproval.status);
    this.assertStageTransition(heatApproval.stage, 'A08_CHECK_LADLE_READINESS');

    if (!dto.chemistryTemperatureApproved) {
      throw new BadRequestException(
        'Chemistry and temperature must be approved before the heat number can be created.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelHeatApproval.update({
        where: { id },
        data: {
          chemistryTemperatureApproved: dto.chemistryTemperatureApproved,
          approvalNotes: dto.approvalNotes,
          stage: 'A09_APPROVE_CHEMISTRY_TEMPERATURE',
        },
      });
      await this.logActivity(tx, id, 'A09', employee.id, dto.approvalNotes, {
        ...dto,
      });
      return tx.steelHeatApproval.findUnique({
        where: { id: updated.id },
        include: heatApprovalInclude,
      });
    });
  }

  // ── P06-A10 — Create or confirm heat number ──
  async confirmHeatNumber(
    id: string,
    dto: ConfirmHeatNumberDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const heatApproval = await this.findHeatApprovalOrThrow(id, organizationId);
    this.assertActive(heatApproval.status);
    this.assertStageTransition(
      heatApproval.stage,
      'A09_APPROVE_CHEMISTRY_TEMPERATURE',
    );

    const heatNumber =
      dto.heatNumber?.trim() || heatApproval.melting.heatInProcessNumber;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.steelHeatApproval.update({
          where: { id },
          data: { heatNumber, stage: 'A10_CONFIRM_HEAT_NUMBER' },
        });
        await this.logActivity(tx, id, 'A10', employee.id, undefined, {
          heatNumber,
        });
        return tx.steelHeatApproval.findUnique({
          where: { id: updated.id },
          include: heatApprovalInclude,
        });
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        (err.meta?.target as string[] | undefined)?.includes('heatNumber')
      ) {
        throw new BadRequestException(
          'This heat number is already in use by another heat approval record.',
        );
      }
      throw err;
    }
  }

  // ── P06-A11 — Give tapping approval ──
  async tappingApproval(
    id: string,
    dto: TappingApprovalDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const heatApproval = await this.findHeatApprovalOrThrow(id, organizationId);
    this.assertActive(heatApproval.status);
    this.assertStageTransition(heatApproval.stage, 'A10_CONFIRM_HEAT_NUMBER');

    if (!dto.tappingApproved) {
      throw new BadRequestException(
        'Tapping approval must be confirmed before tapping can proceed.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelHeatApproval.update({
        where: { id },
        data: {
          tappingApproved: dto.tappingApproved,
          stage: 'A11_TAPPING_APPROVAL',
        },
      });
      await this.logActivity(tx, id, 'A11', employee.id, undefined, {
        ...dto,
      });
      return tx.steelHeatApproval.findUnique({
        where: { id: updated.id },
        include: heatApprovalInclude,
      });
    });
  }

  // ── P06-A12 — Tap liquid steel into ladle ──
  async tapToLadle(
    id: string,
    dto: TapToLadleDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const heatApproval = await this.findHeatApprovalOrThrow(id, organizationId);
    this.assertActive(heatApproval.status);
    this.assertStageTransition(heatApproval.stage, 'A11_TAPPING_APPROVAL');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelHeatApproval.update({
        where: { id },
        data: {
          tapStartTime: dto.tapStartTime
            ? new Date(dto.tapStartTime)
            : new Date(),
          tapEndTime: dto.tapEndTime ? new Date(dto.tapEndTime) : undefined,
          tapOperator: dto.tapOperator,
          stage: 'A12_TAP_TO_LADLE',
        },
      });
      await this.logActivity(tx, id, 'A12', employee.id, undefined, {
        ...dto,
      });
      return tx.steelHeatApproval.findUnique({
        where: { id: updated.id },
        include: heatApprovalInclude,
      });
    });
  }

  // ── P06-A13 — Release approved heat to casting ──
  async releaseToCasting(
    id: string,
    dto: ReleaseToCastingDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const heatApproval = await this.findHeatApprovalOrThrow(id, organizationId);
    this.assertActive(heatApproval.status);

    if (heatApproval.releasedToCastingAt) {
      throw new ConflictException(
        'This heat approval record has already been released to casting.',
      );
    }
    this.assertStageTransition(heatApproval.stage, 'A12_TAP_TO_LADLE');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelHeatApproval.update({
        where: { id },
        data: {
          releasedToCastingAt: new Date(),
          stage: 'A13_RELEASE_TO_CASTING',
          status: 'CLOSED',
        },
      });
      await this.logActivity(tx, id, 'A13', employee.id, dto.notes, {
        ...dto,
      });
      return tx.steelHeatApproval.findUnique({
        where: { id: updated.id },
        include: heatApprovalInclude,
      });
    });
  }

  // Administrative override for exceptional cases (e.g. putting a heat
  // approval record ON_HOLD or CANCELLED outside the normal A01-A13 flow).
  // Restricted to RELEASE_ROLES at the controller. Deliberately does not
  // re-validate stage/status transitions the way the staged A01-A13 actions
  // do — that's the point of an override — but it is transactional and
  // logged like every other write, so the change is auditable.
  async updateStatus(
    id: string,
    dto: UpdateHeatApprovalStatusDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const heatApproval = await this.findHeatApprovalOrThrow(id, organizationId);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelHeatApproval.update({
        where: { id },
        data: { status: dto.status },
        include: heatApprovalInclude,
      });
      await this.logActivity(
        tx,
        id,
        'STATUS_OVERRIDE',
        employee.id,
        dto.notes,
        { previousStatus: heatApproval.status, newStatus: dto.status },
      );
      return updated;
    });
  }

  // ── Reads ──

  async getById(id: string, organizationId: string) {
    const heatApproval = await this.findHeatApprovalOrThrow(id, organizationId);
    return {
      ...heatApproval,
      allowedActions: computeAllowedActions(heatApproval),
    };
  }

  async getAll(organizationId: string, query: QueryHeatApprovalsDto) {
    const { meltingId, stage, status, search, page, limit } = query;

    const where: Prisma.SteelHeatApprovalWhereInput = {
      organizationId,
      ...(meltingId && { meltingId }),
      ...(stage && { stage }),
      ...(status && { status }),
      ...(search && {
        OR: [
          { approvalNumber: { contains: search, mode: 'insensitive' } },
          { heatNumber: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.steelHeatApproval.findMany({
        where,
        include: {
          createdBy: { select: { id: true, firstName: true, lastName: true } },
          melting: { select: { id: true, heatInProcessNumber: true } },
          _count: { select: { activityLogs: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.steelHeatApproval.count({ where }),
    ]);

    return {
      data,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async getSummary(organizationId: string) {
    const [byStage, byStatus, total] = await this.prisma.$transaction([
      this.prisma.steelHeatApproval.groupBy({
        by: ['stage'],
        where: { organizationId },
        orderBy: { stage: 'asc' },
        _count: true,
      }),
      this.prisma.steelHeatApproval.groupBy({
        by: ['status'],
        where: { organizationId },
        orderBy: { status: 'asc' },
        _count: true,
      }),
      this.prisma.steelHeatApproval.count({ where: { organizationId } }),
    ]);

    return {
      total,
      byStage: Object.fromEntries(byStage.map((r) => [r.stage, r._count])),
      byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count])),
    };
  }
}
