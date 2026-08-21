import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SteelSourcingStage, SteelSourcingActivity, Prisma } from 'db';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  CreateSteelSourcingOrderDto,
  IdentifySteelMaterialTypeDto,
  SelectMaterialSourceDto,
  ReviewSteelSupplierRiskDto,
  CollectSteelQuotationsDto,
  SelectSteelSupplierDto,
  ConfirmSteelSourcingSpecDto,
  CreateSteelPurchaseOrderDto,
  ConfirmSteelDeliveryScheduleDto,
  PrepareSteelImportLogisticsDto,
  InformSteelIntakeTeamDto,
  CloseSteelSourcingHandoverDto,
  UpdateSteelSourcingStatusDto,
  QuerySteelSourcingOrdersDto,
  CreateSupplierDto,
  QuerySuppliersDto,
} from './dto/steel-sourcing.dto';

// The order the 12 sourcing activities must occur in. Mirrors the P01 STAGE_ORDER
// pattern so an activity can't be recorded before its prerequisite is done.
const STAGE_ORDER: SteelSourcingStage[] = [
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

const orderInclude = {
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  supplier: true,
  quotations: {
    orderBy: { price: 'asc' as const },
    include: { supplier: true },
  },
  activityLogs: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      performedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  },
  plan: {
    select: {
      id: true,
      planNumber: true,
      plantRoute: true,
      customerName: true,
    },
  },
};

@Injectable()
export class SteelSourcingService {
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

  private async findOrderOrThrow(id: string, organizationId: string) {
    const order = await this.prisma.steelSourcingOrder.findFirst({
      where: { id, organizationId },
      include: orderInclude,
    });
    if (!order) throw new NotFoundException('Sourcing order not found');
    return order;
  }

  private assertStage(
    currentStage: SteelSourcingStage,
    requiredStage: SteelSourcingStage,
  ) {
    const currentIdx = STAGE_ORDER.indexOf(currentStage);
    const requiredIdx = STAGE_ORDER.indexOf(requiredStage);
    if (currentIdx < requiredIdx - 1) {
      throw new BadRequestException(
        'This activity cannot be recorded yet — the previous sourcing step has not been completed.',
      );
    }
    if (currentIdx > requiredIdx - 1) {
      throw new BadRequestException(
        'This sourcing step has already been completed and the order has moved on.',
      );
    }
  }

  // Retries `fn` when it fails on a unique-constraint violation of `field`
  // (Prisma P2002). Needed because number generation reads a count() and
  // creates a row in separate steps — two concurrent requests can read the
  // same count before either writes, producing duplicate numbers. The
  // number FORMAT is unchanged; this only makes generate-then-create safe
  // under concurrency by regenerating and retrying on conflict.
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

  private async generateSourcingNumber(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ) {
    const year = new Date().getFullYear();
    const count = await tx.steelSourcingOrder.count({
      where: {
        organizationId,
        createdAt: {
          gte: new Date(`${year}-01-01T00:00:00.000Z`),
          lt: new Date(`${year + 1}-01-01T00:00:00.000Z`),
        },
      },
    });
    const sequence = String(count + 1).padStart(5, '0');
    return `PO-SRC-${year}-${sequence}`;
  }

  private async logActivity(
    tx: Prisma.TransactionClient,
    sourcingId: string,
    activity: SteelSourcingActivity,
    performedById: string,
    notes?: string,
    data?: Record<string, unknown>,
  ) {
    await tx.steelSourcingActivityLog.create({
      data: {
        sourcingId,
        activity,
        performedById,
        notes,
        data: data ? (data as Prisma.InputJsonValue) : undefined,
      },
    });
  }

  // ── P02-A01 — Review material requirement from production plan ──
  async createOrder(
    dto: CreateSteelSourcingOrderDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);

    const plan = await this.prisma.steelProductionPlan.findFirst({
      where: { id: dto.planId, organizationId },
    });
    if (!plan) throw new NotFoundException('Production plan not found');
    if (plan.stage !== 'A12_PLAN_RELEASED') {
      throw new BadRequestException(
        'Sourcing can only start once the production plan has been released (P01-A12).',
      );
    }
    if (plan.status !== 'RELEASED') {
      throw new BadRequestException(
        `This production plan is ${plan.status.replace(/_/g, ' ').toLowerCase()} and is not currently available for sourcing.`,
      );
    }

    return this.withUniqueRetry('sourcingNumber', () =>
      this.prisma.$transaction(async (tx) => {
        const sourcingNumber = await this.generateSourcingNumber(
          tx,
          organizationId,
        );

        const order = await tx.steelSourcingOrder.create({
          data: {
            sourcingNumber,
            organizationId,
            planId: dto.planId,
            createdById: employee.id,
            stage: 'A01_REQUIREMENT_REVIEWED',
            status: 'IN_PROGRESS',
            materialRequirementNotes: dto.materialRequirementNotes,
            requiredByDate: dto.requiredByDate
              ? new Date(dto.requiredByDate)
              : null,
          },
        });

        await this.logActivity(
          tx,
          order.id,
          'A01',
          employee.id,
          dto.materialRequirementNotes,
          { ...dto },
        );
        return tx.steelSourcingOrder.findUnique({
          where: { id: order.id },
          include: orderInclude,
        });
      }),
    );
  }

  // ── P02-A02 — Identify material type needed ──
  async identifyMaterialType(
    id: string,
    dto: IdentifySteelMaterialTypeDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const order = await this.findOrderOrThrow(id, organizationId);
    this.assertStage(order.stage, 'A02_MATERIAL_TYPE_IDENTIFIED');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelSourcingOrder.update({
        where: { id },
        data: {
          materialType: dto.materialType,
          materialTypeNotes: dto.materialTypeNotes,
          stage: 'A02_MATERIAL_TYPE_IDENTIFIED',
        },
      });
      await this.logActivity(
        tx,
        id,
        'A02',
        employee.id,
        dto.materialTypeNotes,
        { ...dto },
      );
      return tx.steelSourcingOrder.findUnique({
        where: { id: updated.id },
        include: orderInclude,
      });
    });
  }

  // ── P02-A03 — Select material source (existing stock or external supplier) ──
  //
  // EXTERNAL_SUPPLIER preserves the original supplier-check behavior exactly
  // and continues through A04-A12 unchanged.
  //
  // EXISTING_STOCK has no supplier to check, so supplier assessment, quote
  // comparison, supplier selection, specification, and PO creation
  // (A04-A08) don't apply — the order advances directly to A08_PO_CREATED
  // (the last purchasing-specific stage) so A09 onward — delivery/logistics
  // scheduling for physically moving the stock, and intake/handover — still
  // apply to both paths. This does NOT verify real stock availability or
  // reserve any quantity: no stock/inventory model exists in the schema yet,
  // so only the fulfillment-source decision itself is recorded. A genuine
  // "how much is available, where" check requires that model to be added
  // first — see the P03 final report / project notes for this limitation.
  async selectMaterialSource(
    id: string,
    dto: SelectMaterialSourceDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const order = await this.findOrderOrThrow(id, organizationId);
    this.assertStage(order.stage, 'A03_SUPPLIER_CHECKED');

    if (dto.source === 'EXTERNAL_SUPPLIER') {
      if (!dto.supplierId) {
        throw new BadRequestException('A supplier must be selected');
      }
      const supplier = await this.prisma.supplier.findFirst({
        where: { id: dto.supplierId, organizationId },
      });
      if (!supplier) throw new NotFoundException('Supplier not found');
      if (
        dto.supplierApprovalConfirmed &&
        supplier.approvalStatus !== 'APPROVED'
      ) {
        throw new BadRequestException(
          `Supplier is not on the approved list (status: ${supplier.approvalStatus}). Approve the supplier first or select a different one.`,
        );
      }

      return this.prisma.$transaction(async (tx) => {
        const updated = await tx.steelSourcingOrder.update({
          where: { id },
          data: {
            materialSource: 'EXTERNAL_SUPPLIER',
            supplierId: dto.supplierId,
            supplierApprovalConfirmed: dto.supplierApprovalConfirmed,
            supplierCheckNotes: dto.supplierCheckNotes,
            stage: 'A03_SUPPLIER_CHECKED',
          },
        });
        await this.logActivity(
          tx,
          id,
          'A03',
          employee.id,
          dto.supplierCheckNotes,
          { ...dto },
        );
        return tx.steelSourcingOrder.findUnique({
          where: { id: updated.id },
          include: orderInclude,
        });
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelSourcingOrder.update({
        where: { id },
        data: {
          materialSource: 'EXISTING_STOCK',
          stockFulfillmentNotes: dto.stockFulfillmentNotes,
          stage: 'A08_PO_CREATED',
        },
      });
      await this.logActivity(
        tx,
        id,
        'A03',
        employee.id,
        dto.stockFulfillmentNotes ??
          'Fulfilled from existing stock — supplier assessment, quote comparison, and PO creation were skipped.',
        { source: 'EXISTING_STOCK' },
      );
      return tx.steelSourcingOrder.findUnique({
        where: { id: updated.id },
        include: orderInclude,
      });
    });
  }

  // ── P02-A04 — Check supplier quality and rejection history ──
  async reviewSupplierRisk(
    id: string,
    dto: ReviewSteelSupplierRiskDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const order = await this.findOrderOrThrow(id, organizationId);
    this.assertStage(order.stage, 'A04_SUPPLIER_RISK_REVIEWED');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelSourcingOrder.update({
        where: { id },
        data: {
          supplierRiskLevel: dto.supplierRiskLevel,
          rejectionRateNotes: dto.rejectionRateNotes,
          complaintHistoryNotes: dto.complaintHistoryNotes,
          stage: 'A04_SUPPLIER_RISK_REVIEWED',
        },
      });
      await this.logActivity(
        tx,
        id,
        'A04',
        employee.id,
        dto.rejectionRateNotes,
        { ...dto },
      );
      return tx.steelSourcingOrder.findUnique({
        where: { id: updated.id },
        include: orderInclude,
      });
    });
  }

  // ── P02-A05 — Collect price and availability confirmation ──
  async collectQuotations(
    id: string,
    dto: CollectSteelQuotationsDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const order = await this.findOrderOrThrow(id, organizationId);
    this.assertStage(order.stage, 'A05_QUOTATIONS_COLLECTED');

    if (!dto.quotations || dto.quotations.length === 0) {
      throw new BadRequestException('At least one quotation is required');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.steelSourcingQuotation.deleteMany({ where: { sourcingId: id } });
      await tx.steelSourcingQuotation.createMany({
        data: dto.quotations.map((q) => ({
          sourcingId: id,
          supplierId: q.supplierId,
          price: q.price,
          currency: q.currency ?? 'USD',
          quantityAvailable: q.quantityAvailable,
          deliveryDate: q.deliveryDate ? new Date(q.deliveryDate) : null,
          paymentTerms: q.paymentTerms,
          qualityRiskNotes: q.qualityRiskNotes,
        })),
      });

      const updated = await tx.steelSourcingOrder.update({
        where: { id },
        data: {
          quotationsCollectedAt: new Date(),
          stage: 'A05_QUOTATIONS_COLLECTED',
        },
      });
      await this.logActivity(tx, id, 'A05', employee.id, undefined, {
        count: dto.quotations.length,
      });
      return tx.steelSourcingOrder.findUnique({
        where: { id: updated.id },
        include: orderInclude,
      });
    });
  }

  // ── P02-A06 — Compare supplier options using QCD logic ──
  async selectSupplier(
    id: string,
    dto: SelectSteelSupplierDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const order = await this.findOrderOrThrow(id, organizationId);
    this.assertStage(order.stage, 'A06_SUPPLIER_SELECTED');

    const quoted = order.quotations.some(
      (q) => q.supplierId === dto.selectedSupplierId,
    );
    if (!quoted) {
      throw new BadRequestException(
        'Selected supplier must be one of the collected quotations',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelSourcingOrder.update({
        where: { id },
        data: {
          selectedSupplierId: dto.selectedSupplierId,
          qcdComparisonNotes: dto.qcdComparisonNotes,
          stage: 'A06_SUPPLIER_SELECTED',
        },
      });
      await this.logActivity(
        tx,
        id,
        'A06',
        employee.id,
        dto.qcdComparisonNotes,
        { ...dto },
      );
      return tx.steelSourcingOrder.findUnique({
        where: { id: updated.id },
        include: orderInclude,
      });
    });
  }

  // ── P02-A07 — Confirm technical specification and documents required ──
  async confirmSpecification(
    id: string,
    dto: ConfirmSteelSourcingSpecDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const order = await this.findOrderOrThrow(id, organizationId);
    this.assertStage(order.stage, 'A07_SPEC_CONFIRMED');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelSourcingOrder.update({
        where: { id },
        data: {
          specificationRequirementNotes: dto.specificationRequirementNotes,
          certificateRequired: dto.certificateRequired,
          documentsRequired: dto.documentsRequired ?? [],
          stage: 'A07_SPEC_CONFIRMED',
        },
      });
      await this.logActivity(
        tx,
        id,
        'A07',
        employee.id,
        dto.specificationRequirementNotes,
        { ...dto },
      );
      return tx.steelSourcingOrder.findUnique({
        where: { id: updated.id },
        include: orderInclude,
      });
    });
  }

  // ── P02-A08 — Create purchase order ──
  async createPurchaseOrder(
    id: string,
    dto: CreateSteelPurchaseOrderDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const order = await this.findOrderOrThrow(id, organizationId);
    this.assertStage(order.stage, 'A08_PO_CREATED');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelSourcingOrder.update({
        where: { id },
        data: {
          poNumber: dto.poNumber,
          poItem: dto.poItem,
          poQuantity: dto.poQuantity,
          poPrice: dto.poPrice,
          poCurrency: dto.poCurrency ?? 'USD',
          poDeliveryTerms: dto.poDeliveryTerms,
          poCreatedAt: new Date(),
          stage: 'A08_PO_CREATED',
          status: 'PO_ISSUED',
        },
      });
      await this.logActivity(tx, id, 'A08', employee.id, undefined, { ...dto });
      return tx.steelSourcingOrder.findUnique({
        where: { id: updated.id },
        include: orderInclude,
      });
    });
  }

  // ── P02-A09 — Confirm delivery schedule with supplier ──
  async confirmDeliverySchedule(
    id: string,
    dto: ConfirmSteelDeliveryScheduleDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const order = await this.findOrderOrThrow(id, organizationId);
    this.assertStage(order.stage, 'A09_DELIVERY_CONFIRMED');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelSourcingOrder.update({
        where: { id },
        data: {
          confirmedDispatchDate: dto.confirmedDispatchDate
            ? new Date(dto.confirmedDispatchDate)
            : null,
          confirmedArrivalDate: dto.confirmedArrivalDate
            ? new Date(dto.confirmedArrivalDate)
            : null,
          vehicleContainerInfo: dto.vehicleContainerInfo,
          stage: 'A09_DELIVERY_CONFIRMED',
        },
      });
      await this.logActivity(tx, id, 'A09', employee.id, undefined, { ...dto });
      return tx.steelSourcingOrder.findUnique({
        where: { id: updated.id },
        include: orderInclude,
      });
    });
  }

  // ── P02-A10 — Prepare import/local logistics if applicable ──
  // Skippable: only the Imported Billet Route requires this activity, so a plan on
  // any other route may pass straight through with an explanatory note.
  async prepareLogistics(
    id: string,
    dto: PrepareSteelImportLogisticsDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const order = await this.findOrderOrThrow(id, organizationId);
    this.assertStage(order.stage, 'A10_LOGISTICS_PREPARED');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelSourcingOrder.update({
        where: { id },
        data: {
          billOfLading: dto.billOfLading,
          countryOfOrigin: dto.countryOfOrigin,
          portClearanceStatus: dto.portClearanceStatus,
          importLogisticsNotes: dto.importLogisticsNotes,
          stage: 'A10_LOGISTICS_PREPARED',
        },
      });
      await this.logActivity(
        tx,
        id,
        'A10',
        employee.id,
        dto.importLogisticsNotes,
        { ...dto },
      );
      return tx.steelSourcingOrder.findUnique({
        where: { id: updated.id },
        include: orderInclude,
      });
    });
  }

  // ── P02-A11 — Inform raw material intake team ──
  async informIntakeTeam(
    id: string,
    dto: InformSteelIntakeTeamDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const order = await this.findOrderOrThrow(id, organizationId);
    this.assertStage(order.stage, 'A11_INTAKE_INFORMED');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelSourcingOrder.update({
        where: { id },
        data: {
          intakeInformedAt: new Date(),
          intakeNotifyNotes: dto.intakeNotifyNotes,
          stage: 'A11_INTAKE_INFORMED',
        },
      });
      await this.logActivity(tx, id, 'A11', employee.id, dto.intakeNotifyNotes);
      return tx.steelSourcingOrder.findUnique({
        where: { id: updated.id },
        include: orderInclude,
      });
    });
  }

  // ── P02-A12 — Close sourcing handover to intake ──
  async closeHandover(
    id: string,
    dto: CloseSteelSourcingHandoverDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const order = await this.findOrderOrThrow(id, organizationId);
    this.assertStage(order.stage, 'A12_HANDOVER_CLOSED');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelSourcingOrder.update({
        where: { id },
        data: {
          handoverClosedAt: new Date(),
          handoverNotes: dto.handoverNotes,
          stage: 'A12_HANDOVER_CLOSED',
          status: 'CLOSED',
        },
      });
      await this.logActivity(tx, id, 'A12', employee.id, dto.handoverNotes);
      return tx.steelSourcingOrder.findUnique({
        where: { id: updated.id },
        include: orderInclude,
      });
    });
  }

  // Administrative override for exceptional cases (e.g. putting an order
  // ON_HOLD or CANCELLED outside the normal A01-A12 flow). Restricted to
  // PO_ROLES at the controller. Deliberately does not re-validate
  // stage/status transitions the way the staged A01-A12 actions do — that's
  // the point of an override — but it is transactional and logged like
  // every other write, so the change is auditable.
  async updateStatus(
    id: string,
    dto: UpdateSteelSourcingStatusDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const order = await this.findOrderOrThrow(id, organizationId);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelSourcingOrder.update({
        where: { id },
        data: { status: dto.status },
        include: orderInclude,
      });
      await this.logActivity(
        tx,
        id,
        'STATUS_OVERRIDE',
        employee.id,
        dto.notes,
        { previousStatus: order.status, newStatus: dto.status },
      );
      return updated;
    });
  }

  // ── Reads ──

  async getById(id: string, organizationId: string) {
    return this.findOrderOrThrow(id, organizationId);
  }

  async getAll(organizationId: string, query: QuerySteelSourcingOrdersDto) {
    const { planId, stage, status, materialType, search, page, limit } = query;

    const where: Prisma.SteelSourcingOrderWhereInput = {
      organizationId,
      ...(planId && { planId }),
      ...(stage && { stage }),
      ...(status && { status }),
      ...(materialType && { materialType }),
      ...(search && {
        OR: [
          { sourcingNumber: { contains: search, mode: 'insensitive' } },
          { poNumber: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.steelSourcingOrder.findMany({
        where,
        include: {
          createdBy: { select: { id: true, firstName: true, lastName: true } },
          supplier: { select: { id: true, name: true } },
          plan: { select: { id: true, planNumber: true } },
          _count: { select: { quotations: true, activityLogs: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.steelSourcingOrder.count({ where }),
    ]);

    return {
      data,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async getSummary(organizationId: string) {
    const [byStage, byStatus, total] = await this.prisma.$transaction([
      this.prisma.steelSourcingOrder.groupBy({
        by: ['stage'],
        where: { organizationId },
        orderBy: { stage: 'asc' },
        _count: true,
      }),
      this.prisma.steelSourcingOrder.groupBy({
        by: ['status'],
        where: { organizationId },
        orderBy: { status: 'asc' },
        _count: true,
      }),
      this.prisma.steelSourcingOrder.count({ where: { organizationId } }),
    ]);

    return {
      total,
      byStage: Object.fromEntries(byStage.map((r) => [r.stage, r._count])),
      byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count])),
    };
  }

  // ── Supplier master (backs P02-A03) ──

  async createSupplier(dto: CreateSupplierDto, organizationId: string) {
    return this.prisma.supplier.create({
      data: {
        organizationId,
        name: dto.name,
        code: dto.code,
        materialTypes: dto.materialTypes ?? [],
        approvalStatus: dto.approvalStatus ?? 'PENDING',
        qualityScore: dto.qualityScore,
        deliveryScore: dto.deliveryScore,
        contactPerson: dto.contactPerson,
        phone: dto.phone,
        email: dto.email,
        country: dto.country,
        isImportSource: dto.isImportSource ?? false,
        notes: dto.notes,
      },
    });
  }

  async getSuppliers(organizationId: string, query: QuerySuppliersDto) {
    const { materialType, approvalStatus, search } = query;
    return this.prisma.supplier.findMany({
      where: {
        organizationId,
        ...(materialType && { materialTypes: { has: materialType } }),
        ...(approvalStatus && { approvalStatus }),
        ...(search && { name: { contains: search, mode: 'insensitive' } }),
      },
      orderBy: { name: 'asc' },
    });
  }
}
