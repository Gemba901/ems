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
import { HeatApprovalService } from './heat-approval.service';
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
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { ModuleGuard } from 'src/auth/guards/module.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { RequiresModule } from 'src/auth/decorators/module.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { Role } from 'src/common/enum/role.enum';
import { ModuleType } from 'db';

type AuthUser = { userId: string; organizationId: string; roleLevel: string };

// Same role scope as P01-P05 day-to-day activities.
const HEAT_APPROVAL_ROLES = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.MANAGEMENT,
  Role.HOD,
];
// Chemistry/temperature approval, tapping approval, and release to casting
// are restricted, mirroring P04/P05's RELEASE_ROLES gating.
const RELEASE_ROLES = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT];

/**
 * P06 — Heat Approval, grouped into actor-centric screens: S1 Chemistry
 * Sampling & Correction (A01-A06), S2 Temperature & Ladle Readiness
 * (A07-A08), S3 Approval, Tapping & Release (A09-A13).
 */
@Controller('steel/heat-approval')
@UseGuards(JwtAuthGuard, RolesGuard, ModuleGuard)
@RequiresModule(ModuleType.STEEL)
@Roles(...HEAT_APPROVAL_ROLES)
export class HeatApprovalController {
  constructor(private heatApprovalService: HeatApprovalService) {}

  /**
   * POST /steel/heat-approval
   * P06-A01 — Take liquid steel sample.
   */
  @Post()
  createHeatApproval(
    @Body() dto: TakeSampleDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.heatApprovalService.createHeatApproval(
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /** GET /steel/heat-approval — list heat approval records for the organization. */
  @Get()
  getAll(@Query() query: QueryHeatApprovalsDto, @CurrentUser() user: AuthUser) {
    return this.heatApprovalService.getAll(user.organizationId, query);
  }

  /** GET /steel/heat-approval/summary — aggregated counts for dashboard widgets. */
  @Get('summary')
  async getSummary(@CurrentUser() user: AuthUser) {
    return this.heatApprovalService.getSummary(user.organizationId);
  }

  /** GET /steel/heat-approval/:id — full detail, including allowedActions. */
  @Get(':id')
  getOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.heatApprovalService.getById(id, user.organizationId);
  }

  /**
   * PATCH /steel/heat-approval/:id/analyze-sample
   * P06-A02 — Analyze sample in spectrometer/lab.
   */
  @Patch(':id/analyze-sample')
  analyzeSample(
    @Param('id') id: string,
    @Body() dto: AnalyzeSampleDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.heatApprovalService.analyzeSample(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /**
   * PATCH /steel/heat-approval/:id/compare-chemistry
   * P06-A03 — Compare chemistry with required grade.
   */
  @Patch(':id/compare-chemistry')
  compareChemistry(
    @Param('id') id: string,
    @Body() dto: CompareChemistryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.heatApprovalService.compareChemistry(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /**
   * PATCH /steel/heat-approval/:id/decide-correction
   * P06-A04 — Decide correction requirement.
   */
  @Patch(':id/decide-correction')
  decideCorrection(
    @Param('id') id: string,
    @Body() dto: DecideCorrectionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.heatApprovalService.decideCorrection(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /**
   * PATCH /steel/heat-approval/:id/add-correction-material
   * P06-A05 — Add alloy, carbon raiser, lime, or correction material (conditional).
   */
  @Patch(':id/add-correction-material')
  addCorrectionMaterial(
    @Param('id') id: string,
    @Body() dto: AddCorrectionMaterialDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.heatApprovalService.addCorrectionMaterial(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /**
   * PATCH /steel/heat-approval/:id/retest-chemistry
   * P06-A06 — Re-test chemistry if required (conditional).
   */
  @Patch(':id/retest-chemistry')
  retestChemistry(
    @Param('id') id: string,
    @Body() dto: RetestChemistryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.heatApprovalService.retestChemistry(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /**
   * PATCH /steel/heat-approval/:id/check-temperature
   * P06-A07 — Check liquid steel temperature.
   */
  @Patch(':id/check-temperature')
  checkTemperature(
    @Param('id') id: string,
    @Body() dto: CheckTemperatureDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.heatApprovalService.checkTemperature(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /**
   * PATCH /steel/heat-approval/:id/check-ladle-readiness
   * P06-A08 — Check ladle readiness and lining condition.
   */
  @Patch(':id/check-ladle-readiness')
  checkLadleReadiness(
    @Param('id') id: string,
    @Body() dto: CheckLadleReadinessDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.heatApprovalService.checkLadleReadiness(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /**
   * PATCH /steel/heat-approval/:id/approve-chemistry-temperature
   * P06-A09 — Approve chemistry and temperature.
   */
  @Patch(':id/approve-chemistry-temperature')
  @Roles(...RELEASE_ROLES)
  approveChemistryTemperature(
    @Param('id') id: string,
    @Body() dto: ApproveChemistryTemperatureDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.heatApprovalService.approveChemistryTemperature(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /**
   * PATCH /steel/heat-approval/:id/confirm-heat-number
   * P06-A10 — Create or confirm heat number.
   */
  @Patch(':id/confirm-heat-number')
  confirmHeatNumber(
    @Param('id') id: string,
    @Body() dto: ConfirmHeatNumberDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.heatApprovalService.confirmHeatNumber(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /**
   * PATCH /steel/heat-approval/:id/tapping-approval
   * P06-A11 — Give tapping approval.
   */
  @Patch(':id/tapping-approval')
  @Roles(...RELEASE_ROLES)
  tappingApproval(
    @Param('id') id: string,
    @Body() dto: TappingApprovalDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.heatApprovalService.tappingApproval(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /**
   * PATCH /steel/heat-approval/:id/tap-to-ladle
   * P06-A12 — Tap liquid steel into ladle.
   */
  @Patch(':id/tap-to-ladle')
  tapToLadle(
    @Param('id') id: string,
    @Body() dto: TapToLadleDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.heatApprovalService.tapToLadle(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /**
   * PATCH /steel/heat-approval/:id/release-to-casting
   * P06-A13 — Release approved heat to casting. Irreversible; restricted to
   * authorized approvers.
   */
  @Patch(':id/release-to-casting')
  @Roles(...RELEASE_ROLES)
  releaseToCasting(
    @Param('id') id: string,
    @Body() dto: ReleaseToCastingDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.heatApprovalService.releaseToCasting(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /**
   * PATCH /steel/heat-approval/:id/status
   * Manual override, e.g. putting a heat approval record ON_HOLD or CANCELLED.
   */
  @Patch(':id/status')
  @Roles(...RELEASE_ROLES)
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateHeatApprovalStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.heatApprovalService.updateStatus(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }
}
