import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SteelPlanStage, SteelPlanActivity, SteelDepartment, Prisma } from 'db';
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

  // ── P01-A01 — Capture customer enquiry, sales order, forecast, or stock requirement ──
  async createDemand(
    dto: CreateSteelDemandDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId, organizationId);

    return this.prisma.$transaction(async (tx) => {
      const planNumber = await this.generatePlanNumber(tx, organizationId);

      const plan = await tx.steelProductionPlan.create({
        data: {
          planNumber,
          organizationId,
          createdById: employee.id,
          stage: 'A01_DEMAND_CAPTURED',
          status: 'IN_PROGRESS',
          demandSource: dto.demandSource,
          customerName: dto.customerName,
          dealerName: dto.dealerName,
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

      await this.logActivity(tx, plan.id, 'A01', employee.id, dto.demandNotes, {
        ...dto,
      });

      return tx.steelProductionPlan.findUnique({
        where: { id: plan.id },
        include: planInclude,
      });
    });
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

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelProductionPlan.update({
        where: { id },
        data: {
          priority: dto.priority,
          deliveryPromiseDate: dto.deliveryPromiseDate
            ? new Date(dto.deliveryPromiseDate)
            : null,
          creditStatus: dto.creditStatus,
          stage: 'A02_PRIORITY_CONFIRMED',
        },
      });
      await this.logActivity(tx, id, 'A02', employee.id, dto.notes, { ...dto });
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

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelProductionPlan.update({
        where: { id },
        data: {
          productType: dto.productType,
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

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelProductionPlan.update({
        where: { id },
        data: {
          grade: dto.grade,
          size: dto.size,
          length: dto.length,
          bundleType: dto.bundleType,
          totalQuantity: dto.totalQuantity,
          toleranceNotes: dto.toleranceNotes,
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

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelProductionPlan.update({
        where: { id },
        data: {
          certifiedStockAvailableQty: dto.certifiedStockAvailableQty,
          stockBundleIds: dto.stockBundleIds ?? [],
          stockHeatNumbers: dto.stockHeatNumbers ?? [],
          stockCertificateRefs: dto.stockCertificateRefs ?? [],
          stage: 'A05_STOCK_CHECKED',
        },
      });
      await this.logActivity(tx, id, 'A05', employee.id, undefined, { ...dto });
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

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelProductionPlan.update({
        where: { id },
        data: {
          stockDecision: dto.stockDecision,
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
        { ...dto },
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

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.steelProductionPlan.update({
        where: { id },
        data: {
          plantRoute: dto.plantRoute,
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

    if (dto.departments.length === 0) {
      throw new BadRequestException('At least one department must be notified');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.steelPlanDepartmentAck.createMany({
        data: dto.departments.map((department) => ({ planId: id, department })),
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
        departments: dto.departments,
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

    const outstanding = plan.departmentAcks.filter((a) => !a.acknowledged);
    if (outstanding.length > 0) {
      throw new BadRequestException(
        `Cannot release: ${outstanding.length} department(s) have not yet acknowledged the plan`,
      );
    }

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
  async updateStatus(
    id: string,
    dto: UpdateSteelPlanStatusDto,
    organizationId: string,
  ) {
    await this.findPlanOrThrow(id, organizationId);
    return this.prisma.steelProductionPlan.update({
      where: { id },
      data: { status: dto.status },
      include: planInclude,
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
    const hasPlannedStartDateFilter = Object.keys(plannedStartDateFilter).length > 0;

    const where: Prisma.SteelProductionPlanWhereInput = {
      organizationId,
      ...(stage && { stage }),
      ...(status && { status }),
      ...(priority && { priority }),
      ...(hasPlannedStartDateFilter && { plannedStartDate: plannedStartDateFilter }),
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
    const [byStage, byStatus, byStageStatus, total] = await this.prisma.$transaction([
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
