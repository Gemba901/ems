import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  SteelIntakeStage,
  SteelIntakeActivity,
  SteelSourcingStage,
  Prisma,
} from 'db';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  CreateMaterialIntakeDto,
  VerifyMaterialIntakeDocumentsDto,
  RecordGrossWeightDto,
  RecordSafetyCheckDto,
  AssignUnloadingAreaDto,
  RecordInspectionDto,
  RecordAcceptanceDecisionDto,
  RecordUnloadingDto,
  RecordNetWeightDto,
  AssignYardLocationDto,
  ReleaseToStockDto,
  UpdateMaterialIntakeStatusDto,
  QueryMaterialIntakesDto,
} from './dto/material-intake.dto';

// The order the 14 intake activities must occur in. Mirrors the P01/P02
// STAGE_ORDER pattern so a step can't be recorded before its prerequisite.
const STAGE_ORDER: SteelIntakeStage[] = [
  'A01_GATE_ARRIVAL_RECORDED',
  'A02_DOCUMENTS_VERIFIED',
  'A03_GROSS_WEIGHT_CAPTURED',
  'A04_SAFETY_CHECKED',
  'A05_AREA_ASSIGNED',
  'A06_VISUAL_INSPECTED',
  'A07_HAZARD_CHECKED',
  'A08_RADIATION_CHECKED',
  'A09_CERTIFICATE_VERIFIED',
  'A10_ACCEPTANCE_DECIDED',
  'A11_UNLOADED',
  'A12_NET_WEIGHT_CAPTURED',
  'A13_YARD_STORED',
  'A14_STOCK_RELEASED',
] as SteelIntakeStage[];

// Local copy of the P02 sourcing stage order, needed only to check that a
// sourcing order is far enough along to receive against (P02-A11 onward).
// Not imported from steel-sourcing.service.ts to avoid coupling P03 to P02's
// internals — this is the same ordering P02 already declares for itself.
const SOURCING_STAGE_ORDER: SteelSourcingStage[] = [
  'A01_REQUIREMENT_REVIEWED',
  'A02_MATERIAL_TYPE_IDENTIFIED',
  'A03_SUPPLIER_CHECKED',
  'A04_SUPPLIER_RISK_REVIEWED',
  'A05_QUOTATIONS_COLLECTED',
  'A06_SUPPLIER_SELECTED',
  'A07_SPEC_CONFIRMED',
  'A08_PO_CREATED',
  'A09_DELIVERY_CONFIRMED',
  'A10_LOGISTICS_PREPARED',
  'A11_INTAKE_INFORMED',
  'A12_HANDOVER_CLOSED',
] as SteelSourcingStage[];

const intakeInclude = {
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  sourcingOrder: {
    select: {
      id: true,
      sourcingNumber: true,
      materialType: true,
      supplier: { select: { id: true, name: true } },
      plan: { select: { id: true, planNumber: true } },
    },
  },
  activityLogs: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      performedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  },
};

// Actions the future frontend can offer, derived from (stage, status,
// acceptanceDecision) so it never has to recreate the state machine itself.
function computeAllowedActions(intake: {
  stage: SteelIntakeStage;
  status: string;
  acceptanceDecision: string | null;
}): string[] {
  if (['REJECTED', 'CANCELLED', 'RELEASED'].includes(intake.status)) return [];
  if (intake.status === 'ON_HOLD') return ['RECORD_ACCEPTANCE_DECISION'];

  switch (intake.stage) {
    case 'A01_GATE_ARRIVAL_RECORDED':
      return ['VERIFY_DOCUMENTS'];
    case 'A02_DOCUMENTS_VERIFIED':
      return ['RECORD_GROSS_WEIGHT'];
    case 'A03_GROSS_WEIGHT_CAPTURED':
      return ['RECORD_SAFETY_CHECK'];
    case 'A04_SAFETY_CHECKED':
      return ['ASSIGN_UNLOADING_AREA'];
    case 'A05_AREA_ASSIGNED':
    case 'A06_VISUAL_INSPECTED':
    case 'A07_HAZARD_CHECKED':
    case 'A08_RADIATION_CHECKED':
      return ['RECORD_INSPECTION'];
    case 'A09_CERTIFICATE_VERIFIED':
      return ['RECORD_ACCEPTANCE_DECISION'];
    case 'A10_ACCEPTANCE_DECIDED':
      return intake.acceptanceDecision === 'ACCEPT' ? ['RECORD_UNLOADING'] : [];
    case 'A11_UNLOADED':
      return ['RECORD_NET_WEIGHT'];
    case 'A12_NET_WEIGHT_CAPTURED':
      return ['ASSIGN_YARD_LOCATION'];
    case 'A13_YARD_STORED':
      return ['RELEASE_TO_STOCK'];
    case 'A14_STOCK_RELEASED':
      return [];
    default:
      return [];
  }
}

/**
 * P03 — Material Intake & Receiving.
 *
 * Mirrors the P01 (`SteelService`) / P02 (`SteelSourcingService`) pattern:
 * strict sequential stage progression, one activity-log row per meaningful
 * action, org-scoped reads, transactional writes. A04-safety and A08-radiation
 * are hard gates (fail closed — recording a failed check does not advance the
 * stage); A07-hazard/contamination is informational input to the human A10
 * decision, not a hard gate itself. Net weight (P03-A12) is always computed
 * server-side from stored gross/tare weight — never accepted from the client.
 *
 * STEP 7 dependency gap: releasing to stock (A14) only updates
 * `SteelMaterialIntake` — there is no inventory/stock model in this
 * repository to update alongside it (confirmed absent in Phase 6A). That is
 * a real missing dependency, not something to fake here.
 */
@Injectable()
export class MaterialIntakeService {
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

  private async findIntakeOrThrow(id: string, organizationId: string) {
    const intake = await this.prisma.steelMaterialIntake.findFirst({
      where: { id, organizationId },
      include: intakeInclude,
    });
    if (!intake) throw new NotFoundException('Material intake not found');
    return intake;
  }

  // Terminal/blocked statuses that must never allow further stage progress,
  // regardless of what `stage` currently says (defense in depth on top of
  // the stage-adjacency check below).
  private assertActive(status: string) {
    if (status === 'REJECTED' || status === 'CANCELLED') {
      throw new ConflictException(
        'This material intake is closed and cannot be progressed further.',
      );
    }
    if (status === 'ON_HOLD') {
      throw new ConflictException(
        'This material intake is on hold — resolve the hold via the acceptance decision before continuing.',
      );
    }
  }

  private assertStageTransition(
    currentStage: SteelIntakeStage,
    requiredCurrentStage: SteelIntakeStage,
  ) {
    if (currentStage === requiredCurrentStage) return;
    const currentIdx = STAGE_ORDER.indexOf(currentStage);
    const requiredIdx = STAGE_ORDER.indexOf(requiredCurrentStage);
    if (currentIdx < requiredIdx) {
      throw new ConflictException(
        'This step cannot be recorded yet — the previous intake step has not been completed.',
      );
    }
    throw new ConflictException(
      'This intake step has already been completed and the intake has moved on.',
    );
  }

  private async generateIntakeNumber(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ) {
    const year = new Date().getFullYear();
    const count = await tx.steelMaterialIntake.count({
      where: {
        organizationId,
        createdAt: {
          gte: new Date(`${year}-01-01T00:00:00.000Z`),
          lt: new Date(`${year + 1}-01-01T00:00:00.000Z`),
        },
      },
    });
    const sequence = String(count + 1).padStart(5, '0');
    return `MI-${year}-${sequence}`;
  }

  private async logActivity(
    tx: Prisma.TransactionClient,
    intakeId: string,
    activity: SteelIntakeActivity,
    performedById: string,
    notes?: string,
    data?: Record<string, unknown>,
  ) {
    await tx.steelMaterialIntakeActivityLog.create({
      data: {
        intakeId,
        activity,
        performedById,
        notes,
        data: data ? (data as Prisma.InputJsonValue) : undefined,
      },
    });
  }

  // ── P03-A01 — Record truck/container arrival at gate ──
  async createIntake(
    dto: CreateMaterialIntakeDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);

    const order = await this.prisma.steelSourcingOrder.findFirst({
      where: { id: dto.sourcingOrderId, organizationId },
    });
    if (!order) throw new NotFoundException('Sourcing order not found');
    if (order.status === 'CANCELLED') {
      throw new BadRequestException(
        'Cannot record a material intake against a cancelled sourcing order.',
      );
    }
    const readyIdx = SOURCING_STAGE_ORDER.indexOf('A11_INTAKE_INFORMED');
    const orderIdx = SOURCING_STAGE_ORDER.indexOf(order.stage);
    if (orderIdx < readyIdx) {
      throw new BadRequestException(
        'Material intake can only be recorded once the sourcing order has informed the intake team (P02-A11).',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const intakeNumber = await this.generateIntakeNumber(tx, organizationId);

      const intake = await tx.steelMaterialIntake.create({
        data: {
          intakeNumber,
          organizationId,
          sourcingOrderId: dto.sourcingOrderId,
          createdById: employee.id,
          stage: 'A01_GATE_ARRIVAL_RECORDED',
          status: 'IN_PROGRESS',
          vehicleNumber: dto.vehicleNumber,
          driverName: dto.driverName,
          transporterName: dto.transporterName,
          arrivalDateTime: dto.arrivalDateTime
            ? new Date(dto.arrivalDateTime)
            : new Date(),
          gateEntryRef: dto.gateEntryRef,
        },
      });

      await this.logActivity(tx, intake.id, 'A01', employee.id, undefined, {
        ...dto,
      });
      return tx.steelMaterialIntake.findUnique({
        where: { id: intake.id },
        include: intakeInclude,
      });
    });
  }

  // ── P03-A02 — Verify purchase order and delivery documents ──
  async verifyDocuments(
    id: string,
    dto: VerifyMaterialIntakeDocumentsDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const intake = await this.findIntakeOrThrow(id, organizationId);
    this.assertActive(intake.status);
    this.assertStageTransition(intake.stage, 'A01_GATE_ARRIVAL_RECORDED');

    if (!dto.purchaseOrderVerified) {
      throw new BadRequestException(
        'Purchase order and delivery documents must be verified before the intake can proceed.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelMaterialIntake.update({
        where: { id },
        data: {
          purchaseOrderVerified: dto.purchaseOrderVerified,
          deliveryDocumentRef: dto.deliveryDocumentRef,
          documentVerificationNotes: dto.documentVerificationNotes,
          stage: 'A02_DOCUMENTS_VERIFIED',
        },
      });
      await this.logActivity(
        tx,
        id,
        'A02',
        employee.id,
        dto.documentVerificationNotes,
        {
          ...dto,
        },
      );
      return tx.steelMaterialIntake.findUnique({
        where: { id: updated.id },
        include: intakeInclude,
      });
    });
  }

  // ── P03-A03 — Send vehicle to weighbridge for gross weight ──
  async recordGrossWeight(
    id: string,
    dto: RecordGrossWeightDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const intake = await this.findIntakeOrThrow(id, organizationId);
    this.assertActive(intake.status);
    this.assertStageTransition(intake.stage, 'A02_DOCUMENTS_VERIFIED');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelMaterialIntake.update({
        where: { id },
        data: {
          grossWeightTonnes: dto.grossWeightTonnes,
          grossWeighedAt: new Date(),
          stage: 'A03_GROSS_WEIGHT_CAPTURED',
        },
      });
      await this.logActivity(tx, id, 'A03', employee.id, undefined, { ...dto });
      return tx.steelMaterialIntake.findUnique({
        where: { id: updated.id },
        include: intakeInclude,
      });
    });
  }

  // ── P03-A04 — Perform basic safety and access check ──
  async recordSafetyCheck(
    id: string,
    dto: RecordSafetyCheckDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const intake = await this.findIntakeOrThrow(id, organizationId);
    this.assertActive(intake.status);
    this.assertStageTransition(intake.stage, 'A03_GROSS_WEIGHT_CAPTURED');

    if (!dto.safetyCheckPassed) {
      throw new BadRequestException(
        'The vehicle failed the safety and access check and cannot proceed past the gate.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelMaterialIntake.update({
        where: { id },
        data: {
          safetyCheckPassed: dto.safetyCheckPassed,
          safetyCheckNotes: dto.safetyCheckNotes,
          stage: 'A04_SAFETY_CHECKED',
        },
      });
      await this.logActivity(tx, id, 'A04', employee.id, dto.safetyCheckNotes, {
        ...dto,
      });
      return tx.steelMaterialIntake.findUnique({
        where: { id: updated.id },
        include: intakeInclude,
      });
    });
  }

  // ── P03-A05 — Assign unloading or inspection area ──
  async assignUnloadingArea(
    id: string,
    dto: AssignUnloadingAreaDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const intake = await this.findIntakeOrThrow(id, organizationId);
    this.assertActive(intake.status);
    this.assertStageTransition(intake.stage, 'A04_SAFETY_CHECKED');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelMaterialIntake.update({
        where: { id },
        data: {
          unloadingArea: dto.unloadingArea,
          stage: 'A05_AREA_ASSIGNED',
        },
      });
      await this.logActivity(tx, id, 'A05', employee.id, undefined, { ...dto });
      return tx.steelMaterialIntake.findUnique({
        where: { id: updated.id },
        include: intakeInclude,
      });
    });
  }

  // ── P03-A06–A09 — Visual inspection, hazard/contamination, radiation, certificate/heat/grade ──
  async recordInspection(
    id: string,
    dto: RecordInspectionDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const intake = await this.findIntakeOrThrow(id, organizationId);
    this.assertActive(intake.status);
    this.assertStageTransition(intake.stage, 'A05_AREA_ASSIGNED');

    // P03-A08 — radiation check is a hard gate when required: a failed or
    // unrecorded radiation check must not let the material proceed.
    if (dto.radiationCheckRequired && !dto.radiationCheckPassed) {
      throw new BadRequestException(
        'Radiation check is required for this material and must pass before it can proceed.',
      );
    }

    // P03-A09 — billet-specific identity fields are only required for
    // billet; scrap and other material types are not forced to supply them.
    const materialType =
      dto.materialType ?? intake.sourcingOrder.materialType ?? undefined;
    if (materialType === 'BILLET') {
      const missing: string[] = [];
      if (!dto.heatNumber) missing.push('heat number');
      if (!dto.certificateRef) missing.push('certificate reference');
      if (!dto.grade) missing.push('grade');
      if (missing.length > 0) {
        throw new BadRequestException(
          `Billet material requires ${missing.join(', ')} to be recorded.`,
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelMaterialIntake.update({
        where: { id },
        data: {
          visualInspectionNotes: dto.visualInspectionNotes,
          hazardOrContaminationFound: dto.hazardOrContaminationFound,
          hazardNotes: dto.hazardNotes,
          radiationCheckRequired: dto.radiationCheckRequired,
          radiationCheckPassed: dto.radiationCheckPassed,
          materialType,
          grade: dto.grade,
          heatNumber: dto.heatNumber,
          certificateRef: dto.certificateRef,
          stage: 'A09_CERTIFICATE_VERIFIED',
        },
      });
      await this.logActivity(
        tx,
        id,
        'A09',
        employee.id,
        dto.visualInspectionNotes,
        {
          ...dto,
        },
      );
      return tx.steelMaterialIntake.findUnique({
        where: { id: updated.id },
        include: intakeInclude,
      });
    });
  }

  // ── P03-A10 — Decide accept, hold, or reject material ──
  async recordAcceptanceDecision(
    id: string,
    dto: RecordAcceptanceDecisionDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const intake = await this.findIntakeOrThrow(id, organizationId);

    if (intake.status === 'REJECTED' || intake.status === 'CANCELLED') {
      throw new ConflictException(
        'This material intake is closed and its acceptance decision cannot be changed.',
      );
    }
    // A held intake may be re-decided without redoing earlier steps; any
    // other current stage must be exactly A09 (normal first-time decision).
    const reDeciding =
      intake.stage === 'A10_ACCEPTANCE_DECIDED' && intake.status === 'ON_HOLD';
    if (!reDeciding) {
      this.assertStageTransition(intake.stage, 'A09_CERTIFICATE_VERIFIED');
    }

    if (dto.decision !== 'ACCEPT' && !dto.decisionNotes) {
      throw new BadRequestException(
        dto.decision === 'HOLD'
          ? 'A hold reason is required.'
          : 'A rejection reason is required.',
      );
    }

    const status =
      dto.decision === 'ACCEPT'
        ? 'IN_PROGRESS'
        : dto.decision === 'HOLD'
          ? 'ON_HOLD'
          : 'REJECTED';

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelMaterialIntake.update({
        where: { id },
        data: {
          acceptanceDecision: dto.decision,
          decisionNotes: dto.decisionNotes,
          stage: 'A10_ACCEPTANCE_DECIDED',
          status,
        },
      });
      await this.logActivity(tx, id, 'A10', employee.id, dto.decisionNotes, {
        ...dto,
      });
      return tx.steelMaterialIntake.findUnique({
        where: { id: updated.id },
        include: intakeInclude,
      });
    });
  }

  // ── P03-A11 — Unload approved material safely ──
  async recordUnloading(
    id: string,
    dto: RecordUnloadingDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const intake = await this.findIntakeOrThrow(id, organizationId);
    this.assertActive(intake.status);
    this.assertStageTransition(intake.stage, 'A10_ACCEPTANCE_DECIDED');

    if (intake.acceptanceDecision !== 'ACCEPT') {
      throw new ConflictException('Only accepted material can be unloaded.');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelMaterialIntake.update({
        where: { id },
        data: {
          unloadedAt: dto.unloadedAt ? new Date(dto.unloadedAt) : new Date(),
          stage: 'A11_UNLOADED',
        },
      });
      await this.logActivity(tx, id, 'A11', employee.id, undefined, { ...dto });
      return tx.steelMaterialIntake.findUnique({
        where: { id: updated.id },
        include: intakeInclude,
      });
    });
  }

  // ── P03-A12 — Capture tare weight and net weight ──
  async recordNetWeight(
    id: string,
    dto: RecordNetWeightDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const intake = await this.findIntakeOrThrow(id, organizationId);
    this.assertActive(intake.status);
    this.assertStageTransition(intake.stage, 'A11_UNLOADED');

    const grossWeightTonnes = intake.grossWeightTonnes;
    if (!grossWeightTonnes || grossWeightTonnes <= 0) {
      throw new BadRequestException(
        'Gross weight was not recorded for this intake.',
      );
    }
    if (dto.tareWeightTonnes > grossWeightTonnes) {
      throw new BadRequestException('Tare weight cannot exceed gross weight.');
    }
    // Net weight is always derived server-side — never trust a client-supplied value.
    const netWeightTonnes = grossWeightTonnes - dto.tareWeightTonnes;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelMaterialIntake.update({
        where: { id },
        data: {
          tareWeightTonnes: dto.tareWeightTonnes,
          netWeightTonnes,
          weighedAt: dto.weighedAt ? new Date(dto.weighedAt) : new Date(),
          stage: 'A12_NET_WEIGHT_CAPTURED',
        },
      });
      await this.logActivity(tx, id, 'A12', employee.id, undefined, {
        tareWeightTonnes: dto.tareWeightTonnes,
        netWeightTonnes,
      });
      return tx.steelMaterialIntake.findUnique({
        where: { id: updated.id },
        include: intakeInclude,
      });
    });
  }

  // ── P03-A13 — Store material in correct yard location ──
  async assignYardLocation(
    id: string,
    dto: AssignYardLocationDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const intake = await this.findIntakeOrThrow(id, organizationId);
    this.assertActive(intake.status);
    this.assertStageTransition(intake.stage, 'A12_NET_WEIGHT_CAPTURED');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelMaterialIntake.update({
        where: { id },
        data: {
          yardLocation: dto.yardLocation,
          storedAt: new Date(),
          stage: 'A13_YARD_STORED',
        },
      });
      await this.logActivity(tx, id, 'A13', employee.id, undefined, { ...dto });
      return tx.steelMaterialIntake.findUnique({
        where: { id: updated.id },
        include: intakeInclude,
      });
    });
  }

  // ── P03-A14 — Update stock and release for preparation/use ──
  // No inventory/stock model exists in this repository yet (see class doc
  // comment) — this only updates the intake record itself.
  async releaseToStock(
    id: string,
    dto: ReleaseToStockDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const intake = await this.findIntakeOrThrow(id, organizationId);
    this.assertActive(intake.status);
    this.assertStageTransition(intake.stage, 'A13_YARD_STORED');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelMaterialIntake.update({
        where: { id },
        data: {
          stockReleasedAt: new Date(),
          stockReleaseNotes: dto.stockReleaseNotes,
          stage: 'A14_STOCK_RELEASED',
          status: 'RELEASED',
        },
      });
      await this.logActivity(
        tx,
        id,
        'A14',
        employee.id,
        dto.stockReleaseNotes,
        {
          ...dto,
        },
      );
      return tx.steelMaterialIntake.findUnique({
        where: { id: updated.id },
        include: intakeInclude,
      });
    });
  }

  // Manual override for exceptional cases (e.g. putting an intake ON_HOLD or CANCELLED)
  // Administrative override for exceptional cases (e.g. putting an intake
  // ON_HOLD or CANCELLED outside the normal A01-A14 flow). Restricted to
  // RELEASE_ROLES at the controller. Deliberately does not re-validate
  // stage/status transitions the way the staged A01-A14 actions do — that's
  // the point of an override — but it is transactional and logged like
  // every other write, so the change is auditable.
  async updateStatus(
    id: string,
    dto: UpdateMaterialIntakeStatusDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const intake = await this.findIntakeOrThrow(id, organizationId);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelMaterialIntake.update({
        where: { id },
        data: { status: dto.status },
        include: intakeInclude,
      });
      await this.logActivity(
        tx,
        id,
        'STATUS_OVERRIDE',
        employee.id,
        dto.notes,
        { previousStatus: intake.status, newStatus: dto.status },
      );
      return updated;
    });
  }

  // ── Reads ──

  async getById(id: string, organizationId: string) {
    const intake = await this.findIntakeOrThrow(id, organizationId);
    return { ...intake, allowedActions: computeAllowedActions(intake) };
  }

  async getAll(organizationId: string, query: QueryMaterialIntakesDto) {
    const { sourcingOrderId, stage, status, search, page, limit } = query;

    const where: Prisma.SteelMaterialIntakeWhereInput = {
      organizationId,
      ...(sourcingOrderId && { sourcingOrderId }),
      ...(stage && { stage }),
      ...(status && { status }),
      ...(search && {
        OR: [
          { intakeNumber: { contains: search, mode: 'insensitive' } },
          { vehicleNumber: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.steelMaterialIntake.findMany({
        where,
        include: {
          createdBy: { select: { id: true, firstName: true, lastName: true } },
          sourcingOrder: { select: { id: true, sourcingNumber: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.steelMaterialIntake.count({ where }),
    ]);

    return {
      data,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }
}
