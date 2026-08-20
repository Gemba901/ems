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
import { MeltingService } from './melting.service';
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
import { GetMeltingDashboardDto } from './dto/dashboard.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { ModuleGuard } from 'src/auth/guards/module.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { RequiresModule } from 'src/auth/decorators/module.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { Role } from 'src/common/enum/role.enum';
import { ModuleType } from 'db';

type AuthUser = { userId: string; organizationId: string; roleLevel: string };

// Same role scope as P01-P04 day-to-day activities.
const MELTING_ROLES = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD];
// Refining handover and manual status override are restricted, mirroring
// P04's RELEASE_ROLES gating.
const RELEASE_ROLES = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT];

/**
 * P05 — Melting, grouped into actor-centric screens: S1 Furnace Readiness &
 * Charge Verification (A01-A05), S2 Charging & Melting Operation (A06-A09),
 * S3 Melt Completion & Handover (A10-A14).
 */
@Controller('steel/melting')
@UseGuards(JwtAuthGuard, RolesGuard, ModuleGuard)
@RequiresModule(ModuleType.STEEL)
@Roles(...MELTING_ROLES)
export class MeltingController {
  constructor(private meltingService: MeltingService) {}

  /**
   * POST /steel/melting
   * P05-A01 — Confirm furnace availability.
   */
  @Post()
  createMelting(
    @Body() dto: ConfirmFurnaceAvailabilityDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.meltingService.createMelting(
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /** GET /steel/melting — list melting records for the organization. */
  @Get()
  getAll(@Query() query: QueryMeltingsDto, @CurrentUser() user: AuthUser) {
    return this.meltingService.getAll(user.organizationId, query);
  }

  /** GET /steel/melting/summary — aggregated counts for dashboard widgets. */
  @Get('summary')
  async getSummary(@CurrentUser() user: AuthUser) {
    return this.meltingService.getSummary(user.organizationId);
  }

  /**
   * GET /steel/melting/dashboard
   * P05 management dashboard — KPIs, active heats, furnace/lining status,
   * furnace comparison, recent heat history, and recent events, all
   * aggregated server-side for the given range/furnace filter.
   */
  @Get('dashboard')
  getDashboard(
    @Query() query: GetMeltingDashboardDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.meltingService.getDashboard(user.organizationId, query);
  }

  /** GET /steel/melting/:id — full detail, including allowedActions. */
  @Get(':id')
  getOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.meltingService.getById(id, user.organizationId);
  }

  /**
   * PATCH /steel/melting/:id/furnace-lining-check
   * P05-A02 — Furnace lining check.
   */
  @Patch(':id/furnace-lining-check')
  furnaceLiningCheck(
    @Param('id') id: string,
    @Body() dto: FurnaceLiningCheckDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.meltingService.furnaceLiningCheck(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /**
   * PATCH /steel/melting/:id/furnace-systems-check
   * P05-A03 — Furnace systems check.
   */
  @Patch(':id/furnace-systems-check')
  furnaceSystemsCheck(
    @Param('id') id: string,
    @Body() dto: FurnaceSystemsCheckDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.meltingService.furnaceSystemsCheck(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /**
   * PATCH /steel/melting/:id/previous-heat-readiness
   * P05-A04 — Previous heat readiness.
   */
  @Patch(':id/previous-heat-readiness')
  previousHeatReadiness(
    @Param('id') id: string,
    @Body() dto: PreviousHeatReadinessDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.meltingService.previousHeatReadiness(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /**
   * PATCH /steel/melting/:id/verify-charge-recipe
   * P05-A05 — Verify charge recipe.
   */
  @Patch(':id/verify-charge-recipe')
  verifyChargeRecipe(
    @Param('id') id: string,
    @Body() dto: VerifyChargeRecipeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.meltingService.verifyChargeRecipe(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /**
   * PATCH /steel/melting/:id/load-charge
   * P05-A06 — Load charge.
   */
  @Patch(':id/load-charge')
  loadCharge(
    @Param('id') id: string,
    @Body() dto: LoadChargeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.meltingService.loadCharge(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /**
   * PATCH /steel/melting/:id/start-melting
   * P05-A07 — Start melting.
   */
  @Patch(':id/start-melting')
  startMelting(
    @Param('id') id: string,
    @Body() dto: StartMeltingDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.meltingService.startMelting(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /**
   * PATCH /steel/melting/:id/monitor-power
   * P05-A08 — Monitor power.
   */
  @Patch(':id/monitor-power')
  monitorPower(
    @Param('id') id: string,
    @Body() dto: MonitorPowerDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.meltingService.monitorPower(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /**
   * PATCH /steel/melting/:id/monitor-temperature
   * P05-A09 — Monitor temperature.
   */
  @Patch(':id/monitor-temperature')
  monitorTemperature(
    @Param('id') id: string,
    @Body() dto: MonitorTemperatureDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.meltingService.monitorTemperature(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /**
   * PATCH /steel/melting/:id/record-additions
   * P05-A10 — Record additions (optional/conditional).
   */
  @Patch(':id/record-additions')
  recordAdditions(
    @Param('id') id: string,
    @Body() dto: RecordAdditionsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.meltingService.recordAdditions(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /**
   * PATCH /steel/melting/:id/remove-slag
   * P05-A11 — Remove slag (optional/conditional).
   */
  @Patch(':id/remove-slag')
  removeSlag(
    @Param('id') id: string,
    @Body() dto: RemoveSlagDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.meltingService.removeSlag(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /**
   * PATCH /steel/melting/:id/record-melt-output
   * P05-A12 — Record melt output.
   */
  @Patch(':id/record-melt-output')
  recordMeltOutput(
    @Param('id') id: string,
    @Body() dto: RecordMeltOutputDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.meltingService.recordMeltOutput(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /**
   * PATCH /steel/melting/:id/confirm-liquid-ready
   * P05-A13 — Confirm liquid ready.
   */
  @Patch(':id/confirm-liquid-ready')
  confirmLiquidReady(
    @Param('id') id: string,
    @Body() dto: ConfirmLiquidReadyDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.meltingService.confirmLiquidReady(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /**
   * PATCH /steel/melting/:id/refining-handover
   * P05-A14 — Refining handover. Irreversible; restricted to authorized approvers.
   */
  @Patch(':id/refining-handover')
  @Roles(...RELEASE_ROLES)
  refiningHandover(
    @Param('id') id: string,
    @Body() dto: RefiningHandoverDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.meltingService.refiningHandover(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /**
   * POST /steel/melting/:id/material-charges
   * Record one material charge row (P05-A06 Load Charge / P05-A10
   * Additions). Multiple rows are expected per heat.
   */
  @Post(':id/material-charges')
  addMaterialCharge(
    @Param('id') id: string,
    @Body() dto: AddHeatMaterialChargeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.meltingService.addMaterialCharge(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /** GET /steel/melting/:id/material-charges */
  @Get(':id/material-charges')
  getMaterialCharges(
    @Param('id') id: string,
    @Query() query: QueryHeatMaterialChargesDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.meltingService.getMaterialCharges(
      id,
      user.organizationId,
      query,
    );
  }

  /**
   * POST /steel/melting/:id/events
   * Record a heat-cycle event (temperature reading, alarm, delay,
   * intervention, etc).
   */
  @Post(':id/events')
  recordCycleEvent(
    @Param('id') id: string,
    @Body() dto: RecordHeatCycleEventDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.meltingService.recordCycleEvent(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /** GET /steel/melting/:id/events */
  @Get(':id/events')
  getCycleEvents(
    @Param('id') id: string,
    @Query() query: QueryHeatCycleEventsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.meltingService.getCycleEvents(id, user.organizationId, query);
  }

  /**
   * GET /steel/melting/:id/summary
   * Heat efficiency review — stored measurements plus server-computed
   * material input/yield %. See MeltingService.getHeatSummary for exactly
   * which derived metrics are implemented vs not yet defined.
   */
  @Get(':id/summary')
  getHeatSummary(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.meltingService.getHeatSummary(id, user.organizationId);
  }

  /**
   * PATCH /steel/melting/:id/status
   * Manual override, e.g. putting a melting record ON_HOLD or CANCELLED.
   */
  @Patch(':id/status')
  @Roles(...RELEASE_ROLES)
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateMeltingStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.meltingService.updateStatus(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }
}
