import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  SteelPlanStage,
  SteelPlanActivity,
  SteelDepartment,
  DemandSource,
  OrderPriority,
  Prisma,
} from 'db';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  CreateSteelDemandDto,
  ConfirmSteelPriorityDto,
  ConfirmSteelProductDto,
  ConfirmSteelSpecificationDto,
  SteelStockCheckDto,
  SteelStockDecisionDto,
  SelectSteelRouteDto,
  SteelMaterialCheckDto,
  SteelCapacityCheckDto,
  PrepareSteelProductionPlanDto,
  CommunicateSteelPlanDto,
  AckSteelPlanDepartmentDto,
  ReleaseSteelPlanDto,
  UpdateSteelPlanStatusDto,
  QuerySteelPlansDto,
} from './dto/steel.dto';

// The order the 12 planning activities must occur in. Used to prevent
// an activity being recorded before its prerequisite has been completed.
const STAGE_ORDER: SteelPlanStage[] = [
  'A01_DEMAND_CAPTURED',
  'A02_PRIORITY_CONFIRMED',
  'A03_PRODUCT_CONFIRMED',
  'A04_SPEC_CONFIRMED',
  'A05_STOCK_CHECKED',
  'A06_STOCK_DECISION_MADE',
  'A07_ROUTE_SELECTED',
  'A08_MATERIAL_CHECKED',
  'A09_CAPACITY_CHECKED',
  'A10_PLAN_DRAFTED',
  'A11_PLAN_COMMUNICATED',
  'A12_PLAN_RELEASED',
] as SteelPlanStage[];

const planInclude = {
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  approvedBy: { select: { id: true, firstName: true, lastName: true } },
  departmentAcks: {
    orderBy: { department: 'asc' as const },
    include: {
      acknowledgedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  },
  activityLogs: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      performedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  },
};

@Injectable()
export class SteelService {
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

  private async findPlanOrThrow(id: string, organizationId: string) {
    const plan = await this.prisma.steelProductionPlan.findFirst({
      where: { id, organizationId },
      include: planInclude,
    });
    if (!plan) throw new NotFoundException('Production plan not found');
    return plan;
  }

  // Ensures activities are recorded in order, and prevents re-running a step
  // that a later step already depends on (the plan has moved past it).
  private assertStage(
    currentStage: SteelPlanStage,
    requiredStage: SteelPlanStage,
  ) {
    const currentIdx = STAGE_ORDER.indexOf(currentStage);
    const requiredIdx = STAGE_ORDER.indexOf(requiredStage);
    if (currentIdx < requiredIdx - 1) {
      throw new BadRequestException(
        `This activity cannot be recorded yet — the previous planning step has not been completed.`,
      );
    }
    if (currentIdx > requiredIdx - 1) {
      throw new BadRequestException(
        `This planning step has already been completed and the plan has moved on.`,
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

  private async generatePlanNumber(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ) {
    const year = new Date().getFullYear();
    const count = await tx.steelProductionPlan.count({
      where: {
        organizationId,
        createdAt: {
          gte: new Date(`${year}-01-01T00:00:00.000Z`),
          lt: new Date(`${year + 1}-01-01T00:00:00.000Z`),
        },
      },
    });
    const sequence = String(count + 1).padStart(5, '0');
    return `PP-${year}-${sequence}`;
  }

  private async logActivity(
    tx: Prisma.TransactionClient,
    planId: string,
    activity: SteelPlanActivity,
    performedById: string,
    notes?: string,
    data?: Record<string, unknown>,
  ) {
    await tx.steelPlanActivityLog.create({
      data: {
        planId,
        activity,
        performedById,
        notes,
        data: data ? (data as Prisma.InputJsonValue) : undefined,
      },
    });
  }

  // Required corroborating reference per demand source — if the system can't
  // look this up itself, the planner must supply it up front rather than
  // leaving A01 half-filled.
  private assertDemandSourceReference(dto: CreateSteelDemandDto) {
    const requireOneOf = (
      fields: (keyof CreateSteelDemandDto)[],
      label: string,
    ) => {
      if (!fields.some((f) => dto[f])) {
        throw new BadRequestException(
          `${label} is required for this demand source`,
        );
      }
    };
    switch (dto.demandSource) {
      case 'CUSTOMER_ORDER':
        requireOneOf(['customerId', 'customerName'], 'Customer');
        break;
      case 'DEALER_REQUIREMENT':
        requireOneOf(['customerId', 'dealerName'], 'Dealer');
        break;
      case 'PROJECT_REQUIREMENT':
        requireOneOf(['projectReference'], 'Project reference');
        break;
      case 'FORECAST':
        requireOneOf(['forecastReference'], 'Forecast reference');
        break;
      case 'INTERNAL_STOCK_PLAN':
        requireOneOf(
          ['stockRequirementReference'],
          'Stock requirement reference',
        );
        break;
    }
  }

  private async resolveCustomer(customerId: string, organizationId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, organizationId },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  private async resolveProduct(productId: string, organizationId: string) {
    const product = await this.prisma.steelProduct.findFirst({
      where: { id: productId, organizationId },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  private async resolveProductSpecification(
    productSpecificationId: string,
    organizationId: string,
  ) {
    const spec = await this.prisma.steelProductSpecification.findFirst({
      where: { id: productSpecificationId, organizationId },
    });
    if (!spec) throw new NotFoundException('Product specification not found');
    return spec;
  }

  private async resolveRoute(
    productionRouteId: string,
    organizationId: string,
  ) {
    const route = await this.prisma.steelProductionRoute.findFirst({
      where: { id: productionRouteId, organizationId },
    });
    if (!route) throw new NotFoundException('Production route not found');
    return route;
  }

  // Default order priority from demand source — if the system knows it,
  // it shouldn't ask. Planners may still override, but must say why.
  private static readonly DEFAULT_PRIORITY: Record<
    DemandSource,
    OrderPriority
  > = {
    CUSTOMER_ORDER: 'NORMAL',
    DEALER_REQUIREMENT: 'NORMAL',
    PROJECT_REQUIREMENT: 'PROJECT',
    FORECAST: 'NORMAL',
    INTERNAL_STOCK_PLAN: 'STOCK_REPLENISHMENT',
  };

  // ── P01-A01 — Capture customer enquiry, sales order, forecast, or stock requirement ──
  async createDemand(
    dto: CreateSteelDemandDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    this.assertDemandSourceReference(dto);

    const customer = dto.customerId
      ? await this.resolveCustomer(dto.customerId, organizationId)
      : null;

    return this.withUniqueRetry('planNumber', () =>
      this.prisma.$transaction(async (tx) => {
        const planNumber = await this.generatePlanNumber(tx, organizationId);

        const plan = await tx.steelProductionPlan.create({
          data: {
            planNumber,
            organizationId,
            createdById: employee.id,
            stage: 'A01_DEMAND_CAPTURED',
            status: 'IN_PROGRESS',
            demandSource: dto.demandSource,
            customerId: dto.customerId,
            customerName: customer?.name ?? dto.customerName,
            dealerName: customer?.dealerName ?? dto.dealerName,
            projectReference: dto.projectReference,
            salesOrderNumber: dto.salesOrderNumber,
            forecastReference: dto.forecastReference,
            stockRequirementReference: dto.stockRequirementReference,
            expectedDeliveryDate: dto.expectedDeliveryDate
              ? new Date(dto.expectedDeliveryDate)
              : null,
            requestedQuantityTonnes: dto.requestedQuantityTonnes,
            demandNotes: dto.demandNotes,
          },
        });

        await this.logActivity(
          tx,
          plan.id,
          'A01',
          employee.id,
          dto.demandNotes,
          {
            ...dto,
          },
        );

        return tx.steelProductionPlan.findUnique({
          where: { id: plan.id },
          include: planInclude,
        });
      }),
    );
  }

  // ── P01-A02 — Confirm customer and order priority ──
  async confirmPriority(
    id: string,
    dto: ConfirmSteelPriorityDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const plan = await this.findPlanOrThrow(id, organizationId);
    this.assertStage(plan.stage, 'A02_PRIORITY_CONFIRMED');

    const defaultPriority = SteelService.DEFAULT_PRIORITY[plan.demandSource];
    const priority = dto.priority ?? defaultPriority;
    if (dto.priority && dto.priority !== defaultPriority && !dto.notes) {
      throw new BadRequestException(
        `Overriding the default priority (${defaultPriority}) requires a note explaining why`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelProductionPlan.update({
        where: { id },
        data: {
          priority,
          deliveryPromiseDate: dto.deliveryPromiseDate
            ? new Date(dto.deliveryPromiseDate)
            : null,
          creditStatus: dto.creditStatus,
          stage: 'A02_PRIORITY_CONFIRMED',
        },
      });
      await this.logActivity(tx, id, 'A02', employee.id, dto.notes, {
        ...dto,
        priority,
      });
      return tx.steelProductionPlan.findUnique({
        where: { id: updated.id },
        include: planInclude,
      });
    });
  }

  // ── P01-A03 — Confirm product type and standard required ──
  async confirmProduct(
    id: string,
    dto: ConfirmSteelProductDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const plan = await this.findPlanOrThrow(id, organizationId);
    this.assertStage(plan.stage, 'A03_PRODUCT_CONFIRMED');

    const product = dto.productId
      ? await this.resolveProduct(dto.productId, organizationId)
      : null;
    const productType = product?.productType ?? dto.productType;
    if (!productType) {
      throw new BadRequestException('productId or productType is required');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelProductionPlan.update({
        where: { id },
        data: {
          productId: dto.productId,
          productType,
          productStandard: dto.productStandard,
          customerSpecification: dto.customerSpecification,
          stage: 'A03_PRODUCT_CONFIRMED',
        },
      });
      await this.logActivity(tx, id, 'A03', employee.id, dto.notes, { ...dto });
      return tx.steelProductionPlan.findUnique({
        where: { id: updated.id },
        include: planInclude,
      });
    });
  }

  // ── P01-A04 — Confirm grade, size, length, bundle, and quantity ──
  async confirmSpecification(
    id: string,
    dto: ConfirmSteelSpecificationDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const plan = await this.findPlanOrThrow(id, organizationId);
    this.assertStage(plan.stage, 'A04_SPEC_CONFIRMED');

    const spec = dto.productSpecificationId
      ? await this.resolveProductSpecification(
          dto.productSpecificationId,
          organizationId,
        )
      : null;
    const grade = spec?.grade ?? dto.grade;
    const size = spec?.size ?? dto.size;
    if (!grade || !size) {
      throw new BadRequestException(
        'productSpecificationId, or grade and size, is required',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelProductionPlan.update({
        where: { id },
        data: {
          productSpecificationId: dto.productSpecificationId,
          grade,
          size,
          length: spec?.length ?? dto.length,
          bundleType: dto.bundleType,
          totalQuantity: dto.totalQuantity,
          toleranceNotes: spec?.toleranceNotes ?? dto.toleranceNotes,
          stage: 'A04_SPEC_CONFIRMED',
        },
      });
      await this.logActivity(tx, id, 'A04', employee.id, dto.toleranceNotes, {
        ...dto,
      });
      return tx.steelProductionPlan.findUnique({
        where: { id: updated.id },
        include: planInclude,
      });
    });
  }

  // ── P01-A05 — Check certified finished goods stock ──
  async checkStock(
    id: string,
    dto: SteelStockCheckDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const plan = await this.findPlanOrThrow(id, organizationId);
    this.assertStage(plan.stage, 'A05_STOCK_CHECKED');

    // Auto-fill from the certified finished-goods stock catalog against the
    // plan's spec when the caller doesn't explicitly override it.
    let certifiedStockAvailableQty = dto.certifiedStockAvailableQty;
    let stockBundleIds = dto.stockBundleIds;
    let stockHeatNumbers = dto.stockHeatNumbers;
    let stockCertificateRefs = dto.stockCertificateRefs;
    if (
      certifiedStockAvailableQty === undefined &&
      plan.productSpecificationId
    ) {
      const rows = await this.prisma.steelFinishedGoodsStock.findMany({
        where: {
          organizationId,
          productSpecificationId: plan.productSpecificationId,
        },
      });
      certifiedStockAvailableQty = rows.reduce(
        (sum, r) => sum + r.certifiedQtyTonnes,
        0,
      );
      stockBundleIds = rows.flatMap((r) => r.bundleIds);
      stockHeatNumbers = rows.flatMap((r) => r.heatNumbers);
      stockCertificateRefs = rows.flatMap((r) => r.certificateRefs);
    }
    if (certifiedStockAvailableQty === undefined) {
      throw new BadRequestException(
        'certifiedStockAvailableQty is required when no product specification is set',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelProductionPlan.update({
        where: { id },
        data: {
          certifiedStockAvailableQty,
          stockBundleIds: stockBundleIds ?? [],
          stockHeatNumbers: stockHeatNumbers ?? [],
          stockCertificateRefs: stockCertificateRefs ?? [],
          stage: 'A05_STOCK_CHECKED',
        },
      });
      await this.logActivity(tx, id, 'A05', employee.id, undefined, {
        ...dto,
        certifiedStockAvailableQty,
      });
      return tx.steelProductionPlan.findUnique({
        where: { id: updated.id },
        include: planInclude,
      });
    });
  }

  // ── P01-A06 — Decide dispatch from stock or production required ──
  async decideStockOrProduction(
    id: string,
    dto: SteelStockDecisionDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const plan = await this.findPlanOrThrow(id, organizationId);
    this.assertStage(plan.stage, 'A06_STOCK_DECISION_MADE');

    // Suggest a decision from the stock shortfall so the planner is
    // confirming/overriding, not deciding from scratch.
    const shortfall =
      plan.requestedQuantityTonnes - (plan.certifiedStockAvailableQty ?? 0);
    const suggestedDecision: 'DISPATCH_FROM_STOCK' | 'PRODUCTION_REQUIRED' =
      shortfall <= 0 ? 'DISPATCH_FROM_STOCK' : 'PRODUCTION_REQUIRED';
    const stockDecision = dto.stockDecision ?? suggestedDecision;
    if (
      dto.stockDecision &&
      dto.stockDecision !== suggestedDecision &&
      !dto.stockDecisionNotes
    ) {
      throw new BadRequestException(
        `Overriding the system-suggested decision (${suggestedDecision}) requires stockDecisionNotes explaining why`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelProductionPlan.update({
        where: { id },
        data: {
          stockDecision,
          stockDecisionNotes: dto.stockDecisionNotes,
          stage: 'A06_STOCK_DECISION_MADE',
        },
      });
      await this.logActivity(
        tx,
        id,
        'A06',
        employee.id,
        dto.stockDecisionNotes,
        { ...dto, stockDecision, suggestedDecision },
      );
      return tx.steelProductionPlan.findUnique({
        where: { id: updated.id },
        include: planInclude,
      });
    });
  }

  // ── P01-A07 — Select applicable plant route ──
  async selectRoute(
    id: string,
    dto: SelectSteelRouteDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const plan = await this.findPlanOrThrow(id, organizationId);
    this.assertStage(plan.stage, 'A07_ROUTE_SELECTED');

    const route = dto.productionRouteId
      ? await this.resolveRoute(dto.productionRouteId, organizationId)
      : null;
    const plantRoute = route?.plantRoute ?? dto.plantRoute;
    if (!plantRoute) {
      throw new BadRequestException(
        'productionRouteId or plantRoute is required',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelProductionPlan.update({
        where: { id },
        data: {
          productionRouteId: dto.productionRouteId,
          plantRoute,
          routeNotes: dto.routeNotes,
          stage: 'A07_ROUTE_SELECTED',
        },
      });
      await this.logActivity(tx, id, 'A07', employee.id, dto.routeNotes, {
        ...dto,
      });
      return tx.steelProductionPlan.findUnique({
        where: { id: updated.id },
        include: planInclude,
      });
    });
  }

  // ── P01-A08 — Check raw material or billet availability ──
  async checkMaterial(
    id: string,
    dto: SteelMaterialCheckDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const plan = await this.findPlanOrThrow(id, organizationId);
    this.assertStage(plan.stage, 'A08_MATERIAL_CHECKED');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelProductionPlan.update({
        where: { id },
        data: {
          materialAvailability: dto.materialAvailability,
          materialShortageNotes: dto.materialShortageNotes,
          purchaseRequirementNotes: dto.purchaseRequirementNotes,
          stage: 'A08_MATERIAL_CHECKED',
        },
      });
      await this.logActivity(
        tx,
        id,
        'A08',
        employee.id,
        dto.materialShortageNotes,
        { ...dto },
      );
      return tx.steelProductionPlan.findUnique({
        where: { id: updated.id },
        include: planInclude,
      });
    });
  }

  // ── P01-A09 — Check equipment, maintenance, and manpower availability ──
  async checkCapacity(
    id: string,
    dto: SteelCapacityCheckDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const plan = await this.findPlanOrThrow(id, organizationId);
    this.assertStage(plan.stage, 'A09_CAPACITY_CHECKED');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelProductionPlan.update({
        where: { id },
        data: {
          equipmentAvailability: dto.equipmentAvailability,
          manpowerAvailability: dto.manpowerAvailability,
          maintenanceShutdownNotes: dto.maintenanceShutdownNotes,
          shiftPlanNotes: dto.shiftPlanNotes,
          stage: 'A09_CAPACITY_CHECKED',
        },
      });
      await this.logActivity(tx, id, 'A09', employee.id, dto.shiftPlanNotes, {
        ...dto,
      });
      return tx.steelProductionPlan.findUnique({
        where: { id: updated.id },
        include: planInclude,
      });
    });
  }

  // ── P01-A10 — Prepare production plan and sequence ──
  async prepareProductionPlan(
    id: string,
    dto: PrepareSteelProductionPlanDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const plan = await this.findPlanOrThrow(id, organizationId);
    this.assertStage(plan.stage, 'A10_PLAN_DRAFTED');

    if (dto.plannedStartDate && dto.plannedEndDate) {
      if (new Date(dto.plannedEndDate) < new Date(dto.plannedStartDate)) {
        throw new BadRequestException(
          'Planned end date cannot be before the planned start date',
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelProductionPlan.update({
        where: { id },
        data: {
          productionSequence:
            dto.productionSequence as unknown as Prisma.InputJsonValue,
          plannedStartDate: dto.plannedStartDate
            ? new Date(dto.plannedStartDate)
            : null,
          plannedEndDate: dto.plannedEndDate
            ? new Date(dto.plannedEndDate)
            : null,
          planNotes: dto.planNotes,
          stage: 'A10_PLAN_DRAFTED',
        },
      });
      await this.logActivity(tx, id, 'A10', employee.id, dto.planNotes, {
        ...dto,
      });
      return tx.steelProductionPlan.findUnique({
        where: { id: updated.id },
        include: planInclude,
      });
    });
  }

  // ── P01-A11 — Communicate plan to all concerned departments ──
  async communicatePlan(
    id: string,
    dto: CommunicateSteelPlanDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const plan = await this.findPlanOrThrow(id, organizationId);
    this.assertStage(plan.stage, 'A11_PLAN_COMMUNICATED');

    // Derive the department list from the selected route's steps when not
    // explicitly given — if the system knows which departments the route
    // touches, the planner shouldn't have to re-pick them.
    let departments = dto.departments;
    if (!departments) {
      if (!plan.productionRouteId) {
        throw new BadRequestException(
          'departments must be provided when no production route is selected',
        );
      }
      const steps = await this.prisma.steelProductionRouteStep.findMany({
        where: { routeId: plan.productionRouteId },
      });
      departments = [...new Set(steps.map((s) => s.department))];
    }
    if (departments.length === 0) {
      throw new BadRequestException('At least one department must be notified');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.steelPlanDepartmentAck.createMany({
        data: departments.map((department) => ({ planId: id, department })),
        skipDuplicates: true,
      });

      const updated = await tx.steelProductionPlan.update({
        where: { id },
        data: {
          planCommunicatedAt: new Date(),
          stage: 'A11_PLAN_COMMUNICATED',
        },
      });

      await this.logActivity(tx, id, 'A11', employee.id, dto.notes, {
        departments,
      });
      return tx.steelProductionPlan.findUnique({
        where: { id: updated.id },
        include: planInclude,
      });
    });
  }

  // Support action for P01-A11 — an individual department acknowledges the plan
  async acknowledgeDepartment(
    id: string,
    department: SteelDepartment,
    dto: AckSteelPlanDepartmentDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const plan = await this.findPlanOrThrow(id, organizationId);

    if (!plan.planCommunicatedAt) {
      throw new BadRequestException(
        'The plan has not been communicated to departments yet',
      );
    }

    const ack = await this.prisma.steelPlanDepartmentAck.findUnique({
      where: { planId_department: { planId: id, department } },
    });
    if (!ack) {
      throw new NotFoundException(
        'This department was not included in the communication',
      );
    }

    return this.prisma.steelPlanDepartmentAck.update({
      where: { id: ack.id },
      data: {
        acknowledged: dto.acknowledged ?? true,
        acknowledgedById: employee.id,
        acknowledgedAt: new Date(),
        notes: dto.notes,
      },
      include: {
        acknowledgedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });
  }

  // ── P01-A12 — Release approved production plan ──
  async releasePlan(
    id: string,
    dto: ReleaseSteelPlanDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const plan = await this.findPlanOrThrow(id, organizationId);
    this.assertStage(plan.stage, 'A12_PLAN_RELEASED');

    // Department acknowledgement is informational only for P01 release —
    // departments are derived planning information (from the selected
    // Production Route), not an approval gate. acknowledgeDepartment() and
    // SteelPlanDepartmentAck remain available for any downstream process
    // that still consults them; only this release-blocking check is removed.

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelProductionPlan.update({
        where: { id },
        data: {
          approvedById: employee.id,
          approvedAt: new Date(),
          releaseNotes: dto.releaseNotes,
          stage: 'A12_PLAN_RELEASED',
          status: 'RELEASED',
        },
      });
      await this.logActivity(tx, id, 'A12', employee.id, dto.releaseNotes);
      return tx.steelProductionPlan.findUnique({
        where: { id: updated.id },
        include: planInclude,
      });
    });
  }

  // Manual override for exceptional cases (e.g. putting a plan ON_HOLD or CANCELLED)
  // Administrative override for exceptional cases (e.g. putting a plan
  // ON_HOLD or CANCELLED outside the normal A01-A12 flow). Restricted to
  // RELEASE_ROLES at the controller. Deliberately does not re-validate
  // stage/status transitions the way the staged A01-A12 actions do — that's
  // the point of an override — but it is transactional and logged like
  // every other write, so the change is auditable.
  async updateStatus(
    id: string,
    dto: UpdateSteelPlanStatusDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const plan = await this.findPlanOrThrow(id, organizationId);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelProductionPlan.update({
        where: { id },
        data: { status: dto.status },
        include: planInclude,
      });
      await this.logActivity(
        tx,
        id,
        'STATUS_OVERRIDE',
        employee.id,
        dto.notes,
        {
          previousStatus: plan.status,
          newStatus: dto.status,
        },
      );
      return updated;
    });
  }

  // ── Reads ──

  async getById(id: string, organizationId: string) {
    return this.findPlanOrThrow(id, organizationId);
  }

  async getAll(organizationId: string, query: QuerySteelPlansDto) {
    const {
      stage,
      status,
      priority,
      search,
      scheduledOnly,
      fromDate,
      toDate,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      page,
      limit,
    } = query;

    if (fromDate && toDate && new Date(fromDate) > new Date(toDate)) {
      throw new BadRequestException('fromDate must not be after toDate');
    }

    // fromDate/toDate filter the same canonical scheduling field as
    // scheduledOnly (plannedStartDate) — merged into one clause so passing
    // both doesn't produce two conflicting `plannedStartDate` keys.
    const plannedStartDateFilter: Prisma.DateTimeNullableFilter = {};
    if (scheduledOnly) plannedStartDateFilter.not = null;
    if (fromDate) plannedStartDateFilter.gte = new Date(fromDate);
    if (toDate) {
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);
      plannedStartDateFilter.lte = end;
    }
    const hasPlannedStartDateFilter =
      Object.keys(plannedStartDateFilter).length > 0;

    const where: Prisma.SteelProductionPlanWhereInput = {
      organizationId,
      ...(stage && { stage }),
      ...(status && { status }),
      ...(priority && { priority }),
      ...(hasPlannedStartDateFilter && {
        plannedStartDate: plannedStartDateFilter,
      }),
      ...(search && {
        OR: [
          { planNumber: { contains: search, mode: 'insensitive' } },
          { customerName: { contains: search, mode: 'insensitive' } },
          { salesOrderNumber: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.steelProductionPlan.findMany({
        where,
        include: {
          createdBy: { select: { id: true, firstName: true, lastName: true } },
          approvedBy: { select: { id: true, firstName: true, lastName: true } },
          _count: { select: { departmentAcks: true, activityLogs: true } },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.steelProductionPlan.count({ where }),
    ]);

    return {
      data,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async getSummary(organizationId: string) {
    const [byStage, byStatus, byStageStatus, total] =
      await this.prisma.$transaction([
        this.prisma.steelProductionPlan.groupBy({
          by: ['stage'],
          where: {
            organizationId,
          },
          orderBy: {
            stage: 'asc',
          },
          _count: true,
        }),

        this.prisma.steelProductionPlan.groupBy({
          by: ['status'],
          where: {
            organizationId,
          },
          orderBy: {
            status: 'asc',
          },
          _count: true,
        }),

        // Cross-tab of (stage, status) — read-only, additive. Needed because
        // byStage and byStatus above are independent single-axis groupings and
        // cannot be combined client-side to build a mutually-exclusive
        // workflow-category breakdown (e.g. distinguishing an ON_HOLD plan
        // from an IN_PROGRESS one at the same stage) without this.
        this.prisma.steelProductionPlan.groupBy({
          by: ['stage', 'status'],
          where: {
            organizationId,
          },
          orderBy: {
            stage: 'asc',
          },
          _count: true,
        }),

        this.prisma.steelProductionPlan.count({
          where: {
            organizationId,
          },
        }),
      ]);

    return {
      total,
      byStage: Object.fromEntries(byStage.map((r) => [r.stage, r._count])),
      byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count])),
      byStageStatus: byStageStatus.map((r) => ({
        stage: r.stage,
        status: r.status,
        count: r._count,
      })),
    };
  }
}
