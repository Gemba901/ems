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
import { ChargePreparationService } from './charge-preparation.service';
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
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { ModuleGuard } from 'src/auth/guards/module.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { RequiresModule } from 'src/auth/decorators/module.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { Role } from 'src/common/enum/role.enum';
import { ModuleType } from 'db';

type AuthUser = { userId: string; organizationId: string; roleLevel: string };

// Same role scope as P01/P02/P03 day-to-day activities.
const CHARGE_ROLES = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD];
// Charge ID release and furnace handover are restricted, mirroring P02's
// PO_ROLES / P03's RELEASE_ROLES gating.
const RELEASE_ROLES = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT];

/**
 * P04 — Raw Material Preparation, Sorting, Cutting and Charge Planning,
 * grouped into actor-centric screens: S13 Material Requirement & Lot
 * Selection (A01-A02), S14 Scrap Sorting & Preparation (A03-A07), S15 Charge
 * Recipe & Verification (A08-A10), S16 Charge Release & Furnace Handover
 * (A11-A12).
 */
@Controller('steel/charge-preparation')
@UseGuards(JwtAuthGuard, RolesGuard, ModuleGuard)
@RequiresModule(ModuleType.STEEL)
@Roles(...CHARGE_ROLES)
export class ChargePreparationController {
  constructor(private chargePreparationService: ChargePreparationService) {}

  /**
   * POST /steel/charge-preparation
   * P04-A01 — Review production plan and material requirement.
   */
  @Post()
  createChargePreparation(
    @Body() dto: CreateChargePreparationDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.chargePreparationService.createChargePreparation(
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /** GET /steel/charge-preparation — list charge preparations for the organization. */
  @Get()
  getAll(
    @Query() query: QueryChargePreparationsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.chargePreparationService.getAll(user.organizationId, query);
  }

  /** GET /steel/charge-preparation/summary — aggregated counts for dashboard widgets. */
  @Get('summary')
  async getSummary(@CurrentUser() user: AuthUser) {
    return this.chargePreparationService.getSummary(user.organizationId);
  }

  /** GET /steel/charge-preparation/:id — full detail, including allowedActions. */
  @Get(':id')
  getOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.chargePreparationService.getById(id, user.organizationId);
  }

  /**
   * PATCH /steel/charge-preparation/:id/lot-selection
   * P04-A02 — Select raw material lots for preparation.
   */
  @Patch(':id/lot-selection')
  selectMaterialLots(
    @Param('id') id: string,
    @Body() dto: SelectMaterialLotsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.chargePreparationService.selectMaterialLots(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /**
   * PATCH /steel/charge-preparation/:id/scrap-sorting
   * P04-A03 — Sort scrap by grade and usability.
   */
  @Patch(':id/scrap-sorting')
  recordScrapSorting(
    @Param('id') id: string,
    @Body() dto: RecordScrapSortingDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.chargePreparationService.recordScrapSorting(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /**
   * PATCH /steel/charge-preparation/:id/scrap-cutting
   * P04-A04 — Cut oversized scrap if needed.
   */
  @Patch(':id/scrap-cutting')
  recordScrapCutting(
    @Param('id') id: string,
    @Body() dto: RecordScrapCuttingDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.chargePreparationService.recordScrapCutting(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /**
   * PATCH /steel/charge-preparation/:id/contaminant-removal
   * P04-A05 — Remove contaminants and unsafe items.
   */
  @Patch(':id/contaminant-removal')
  recordContaminantRemoval(
    @Param('id') id: string,
    @Body() dto: RecordContaminantRemovalDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.chargePreparationService.recordContaminantRemoval(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /**
   * PATCH /steel/charge-preparation/:id/additives
   * P04-A06 — Prepare additives and alloys.
   */
  @Patch(':id/additives')
  prepareAdditives(
    @Param('id') id: string,
    @Body() dto: PrepareAdditivesDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.chargePreparationService.prepareAdditives(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /**
   * PATCH /steel/charge-preparation/:id/return-scrap
   * P04-A07 — Check internal return scrap availability.
   */
  @Patch(':id/return-scrap')
  recordReturnScrapCheck(
    @Param('id') id: string,
    @Body() dto: RecordReturnScrapCheckDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.chargePreparationService.recordReturnScrapCheck(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /**
   * PATCH /steel/charge-preparation/:id/charge-recipe
   * P04-A08 — Prepare furnace charge recipe.
   */
  @Patch(':id/charge-recipe')
  prepareChargeRecipe(
    @Param('id') id: string,
    @Body() dto: PrepareChargeRecipeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.chargePreparationService.prepareChargeRecipe(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /**
   * PATCH /steel/charge-preparation/:id/staging
   * P04-A09 — Stage material near furnace charging area.
   */
  @Patch(':id/staging')
  stageChargeMaterial(
    @Param('id') id: string,
    @Body() dto: StageChargeMaterialDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.chargePreparationService.stageChargeMaterial(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /**
   * PATCH /steel/charge-preparation/:id/verification
   * P04-A10 — Verify actual material against charge recipe.
   */
  @Patch(':id/verification')
  verifyChargeMaterial(
    @Param('id') id: string,
    @Body() dto: VerifyChargeMaterialDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.chargePreparationService.verifyChargeMaterial(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /**
   * PATCH /steel/charge-preparation/:id/release-charge
   * P04-A11 — Create and release Charge ID. Restricted to authorized approvers.
   */
  @Patch(':id/release-charge')
  @Roles(...RELEASE_ROLES)
  releaseCharge(
    @Param('id') id: string,
    @Body() dto: ReleaseChargeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.chargePreparationService.releaseCharge(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /**
   * PATCH /steel/charge-preparation/:id/furnace-handover
   * P04-A12 — Close preparation handover to furnace. Restricted to authorized approvers.
   */
  @Patch(':id/furnace-handover')
  @Roles(...RELEASE_ROLES)
  closeFurnaceHandover(
    @Param('id') id: string,
    @Body() dto: CloseFurnaceHandoverDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.chargePreparationService.closeFurnaceHandover(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /**
   * PATCH /steel/charge-preparation/:id/status
   * Manual override, e.g. putting a charge preparation ON_HOLD or CANCELLED.
   */
  @Patch(':id/status')
  @Roles(...RELEASE_ROLES)
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateChargePreparationStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.chargePreparationService.updateStatus(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }
}
