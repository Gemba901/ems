import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SteelService } from './steel.service';
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
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { ModuleGuard } from 'src/auth/guards/module.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { RequiresModule } from 'src/auth/decorators/module.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { Role } from 'src/common/enum/role.enum';
import { ModuleType, SteelDepartment } from 'db';

type AuthUser = { userId: string; organizationId: string; roleLevel: string };

// Planning/production staff. There is no dedicated PLANNER role in the system yet,
// so this module is available to the same management-level roles used elsewhere.
const PLANNING_ROLES = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD];
const RELEASE_ROLES = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT];

@Controller('steel/plans')
@UseGuards(JwtAuthGuard, RolesGuard, ModuleGuard)
@RequiresModule(ModuleType.STEEL)
@Roles(...PLANNING_ROLES)
export class SteelController {
  constructor(private steelService: SteelService) {}

  /**
   * POST /steel/plans
   * P01-A01 — Capture customer enquiry, sales order, forecast, or stock requirement.
   */
  @Post()
  async create(@Body() dto: CreateSteelDemandDto, @CurrentUser() user: AuthUser) {
    return this.steelService.createDemand(dto, user.userId, user.organizationId);
  }

  /**
   * GET /steel/plans
   * List production plans for the organization, with filters and pagination.
   */
  @Get()
  async getAll(@Query() query: QuerySteelPlansDto, @CurrentUser() user: AuthUser) {
    return this.steelService.getAll(user.organizationId, query);
  }

  /**
   * GET /steel/plans/summary
   * Aggregated counts by stage and status, for dashboard widgets.
   */
  @Get('summary')
  async getSummary(@CurrentUser() user: AuthUser) {
    return this.steelService.getSummary(user.organizationId);
  }

  /**
   * GET /steel/plans/:id
   * Full detail for one plan, including its audit trail and department acknowledgements.
   */
  @Get(':id')
  async getOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.steelService.getById(id, user.organizationId);
  }

  /**
   * PATCH /steel/plans/:id/priority
   * P01-A02 — Confirm customer and order priority.
   */
  @Patch(':id/priority')
  async confirmPriority(
    @Param('id') id: string,
    @Body() dto: ConfirmSteelPriorityDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.steelService.confirmPriority(id, dto, user.userId, user.organizationId);
  }

  /**
   * PATCH /steel/plans/:id/product
   * P01-A03 — Confirm product type and standard required.
   */
  @Patch(':id/product')
  async confirmProduct(
    @Param('id') id: string,
    @Body() dto: ConfirmSteelProductDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.steelService.confirmProduct(id, dto, user.userId, user.organizationId);
  }

  /**
   * PATCH /steel/plans/:id/specification
   * P01-A04 — Confirm grade, size, length, bundle, and quantity.
   */
  @Patch(':id/specification')
  async confirmSpecification(
    @Param('id') id: string,
    @Body() dto: ConfirmSteelSpecificationDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.steelService.confirmSpecification(id, dto, user.userId, user.organizationId);
  }

  /**
   * PATCH /steel/plans/:id/stock-check
   * P01-A05 — Check certified finished goods stock.
   */
  @Patch(':id/stock-check')
  async checkStock(
    @Param('id') id: string,
    @Body() dto: SteelStockCheckDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.steelService.checkStock(id, dto, user.userId, user.organizationId);
  }

  /**
   * PATCH /steel/plans/:id/stock-decision
   * P01-A06 — Decide dispatch from stock or production required.
   */
  @Patch(':id/stock-decision')
  async decideStockOrProduction(
    @Param('id') id: string,
    @Body() dto: SteelStockDecisionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.steelService.decideStockOrProduction(id, dto, user.userId, user.organizationId);
  }

  /**
   * PATCH /steel/plans/:id/route
   * P01-A07 — Select applicable plant route.
   */
  @Patch(':id/route')
  async selectRoute(
    @Param('id') id: string,
    @Body() dto: SelectSteelRouteDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.steelService.selectRoute(id, dto, user.userId, user.organizationId);
  }

  /**
   * PATCH /steel/plans/:id/material-check
   * P01-A08 — Check raw material or billet availability.
   */
  @Patch(':id/material-check')
  async checkMaterial(
    @Param('id') id: string,
    @Body() dto: SteelMaterialCheckDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.steelService.checkMaterial(id, dto, user.userId, user.organizationId);
  }

  /**
   * PATCH /steel/plans/:id/capacity-check
   * P01-A09 — Check equipment, maintenance, and manpower availability.
   */
  @Patch(':id/capacity-check')
  async checkCapacity(
    @Param('id') id: string,
    @Body() dto: SteelCapacityCheckDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.steelService.checkCapacity(id, dto, user.userId, user.organizationId);
  }

  /**
   * PATCH /steel/plans/:id/production-plan
   * P01-A10 — Prepare production plan and sequence.
   */
  @Patch(':id/production-plan')
  async prepareProductionPlan(
    @Param('id') id: string,
    @Body() dto: PrepareSteelProductionPlanDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.steelService.prepareProductionPlan(id, dto, user.userId, user.organizationId);
  }

  /**
   * POST /steel/plans/:id/communicate
   * P01-A11 — Communicate plan to all concerned departments.
   */
  @Post(':id/communicate')
  async communicatePlan(
    @Param('id') id: string,
    @Body() dto: CommunicateSteelPlanDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.steelService.communicatePlan(id, dto, user.userId, user.organizationId);
  }

  /**
   * PATCH /steel/plans/:id/departments/:department/ack
   * Support action for P01-A11 — a concerned department acknowledges the plan.
   * Open to all planning roles, since acknowledging staff sit across departments.
   */
  @Patch(':id/departments/:department/ack')
  async acknowledgeDepartment(
    @Param('id') id: string,
    @Param('department') department: SteelDepartment,
    @Body() dto: AckSteelPlanDepartmentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.steelService.acknowledgeDepartment(id, department, dto, user.userId, user.organizationId);
  }

  /**
   * PATCH /steel/plans/:id/release
   * P01-A12 — Release approved production plan. Restricted to authorized approvers.
   */
  @Patch(':id/release')
  @Roles(...RELEASE_ROLES)
  async releasePlan(
    @Param('id') id: string,
    @Body() dto: ReleaseSteelPlanDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.steelService.releasePlan(id, dto, user.userId, user.organizationId);
  }

  /**
   * PATCH /steel/plans/:id/status
   * Manual override, e.g. putting a plan ON_HOLD or CANCELLED.
   */
  @Patch(':id/status')
  @Roles(...RELEASE_ROLES)
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateSteelPlanStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.steelService.updateStatus(id, dto, user.organizationId);
  }
}
