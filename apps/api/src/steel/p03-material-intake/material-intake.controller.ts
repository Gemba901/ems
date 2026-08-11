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
import { MaterialIntakeService } from './material-intake.service';
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
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { ModuleGuard } from 'src/auth/guards/module.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { RequiresModule } from 'src/auth/decorators/module.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { Role } from 'src/common/enum/role.enum';
import { ModuleType } from 'db';

type AuthUser = { userId: string; organizationId: string; roleLevel: string };

// Same role scope as P01/P02 day-to-day activities — no dedicated
// GATE/STORES role exists in the system yet.
const INTAKE_ROLES = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HOD];
// Acceptance decision and stock release are restricted, mirroring P02's
// PO_ROLES gating on PO-creation/handover-close.
const RELEASE_ROLES = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT];

/**
 * P03 — Material Intake & Receiving, grouped into actor-centric screens:
 * S9 Gate Arrival & Document Verification (A01-A04), S10 Inspection &
 * Acceptance (A05-A10), S11 Unloading & Weighing (A11-A12), S12 Yard
 * Storage & Stock Release (A13-A14).
 */
@Controller('steel/material-intake')
@UseGuards(JwtAuthGuard, RolesGuard, ModuleGuard)
@RequiresModule(ModuleType.STEEL)
@Roles(...INTAKE_ROLES)
export class MaterialIntakeController {
  constructor(private materialIntakeService: MaterialIntakeService) {}

  /**
   * POST /steel/material-intake
   * P03-A01 — Record truck/container arrival at gate.
   */
  @Post()
  createIntake(
    @Body() dto: CreateMaterialIntakeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.materialIntakeService.createIntake(
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /** GET /steel/material-intake — list intakes for the organization. */
  @Get()
  getAll(
    @Query() query: QueryMaterialIntakesDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.materialIntakeService.getAll(user.organizationId, query);
  }

  /** GET /steel/material-intake/:id — full detail, including allowedActions. */
  @Get(':id')
  getOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.materialIntakeService.getById(id, user.organizationId);
  }

  /**
   * PATCH /steel/material-intake/:id/documents
   * P03-A02 — Verify purchase order and delivery documents.
   */
  @Patch(':id/documents')
  verifyDocuments(
    @Param('id') id: string,
    @Body() dto: VerifyMaterialIntakeDocumentsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.materialIntakeService.verifyDocuments(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /**
   * PATCH /steel/material-intake/:id/weighing
   * P03-A03 — Send vehicle to weighbridge for gross weight.
   */
  @Patch(':id/weighing')
  recordGrossWeight(
    @Param('id') id: string,
    @Body() dto: RecordGrossWeightDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.materialIntakeService.recordGrossWeight(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /**
   * PATCH /steel/material-intake/:id/safety
   * P03-A04 — Perform basic safety and access check.
   */
  @Patch(':id/safety')
  recordSafetyCheck(
    @Param('id') id: string,
    @Body() dto: RecordSafetyCheckDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.materialIntakeService.recordSafetyCheck(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /**
   * PATCH /steel/material-intake/:id/area
   * P03-A05 — Assign unloading or inspection area.
   */
  @Patch(':id/area')
  assignUnloadingArea(
    @Param('id') id: string,
    @Body() dto: AssignUnloadingAreaDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.materialIntakeService.assignUnloadingArea(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /**
   * PATCH /steel/material-intake/:id/inspection
   * P03-A06–A09 — Visual inspection, hazard/contamination, radiation, certificate/heat/grade.
   */
  @Patch(':id/inspection')
  recordInspection(
    @Param('id') id: string,
    @Body() dto: RecordInspectionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.materialIntakeService.recordInspection(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /**
   * PATCH /steel/material-intake/:id/decision
   * P03-A10 — Decide accept, hold, or reject material. Restricted to authorized approvers.
   */
  @Patch(':id/decision')
  @Roles(...RELEASE_ROLES)
  recordAcceptanceDecision(
    @Param('id') id: string,
    @Body() dto: RecordAcceptanceDecisionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.materialIntakeService.recordAcceptanceDecision(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /**
   * PATCH /steel/material-intake/:id/unloading
   * P03-A11 — Unload approved material safely.
   */
  @Patch(':id/unloading')
  recordUnloading(
    @Param('id') id: string,
    @Body() dto: RecordUnloadingDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.materialIntakeService.recordUnloading(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /**
   * PATCH /steel/material-intake/:id/net-weight
   * P03-A12 — Capture tare weight; net weight is computed server-side.
   */
  @Patch(':id/net-weight')
  recordNetWeight(
    @Param('id') id: string,
    @Body() dto: RecordNetWeightDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.materialIntakeService.recordNetWeight(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /**
   * PATCH /steel/material-intake/:id/yard
   * P03-A13 — Store material in correct yard location.
   */
  @Patch(':id/yard')
  assignYardLocation(
    @Param('id') id: string,
    @Body() dto: AssignYardLocationDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.materialIntakeService.assignYardLocation(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /**
   * PATCH /steel/material-intake/:id/release
   * P03-A14 — Update stock and release for preparation/use. Restricted to authorized approvers.
   */
  @Patch(':id/release')
  @Roles(...RELEASE_ROLES)
  releaseToStock(
    @Param('id') id: string,
    @Body() dto: ReleaseToStockDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.materialIntakeService.releaseToStock(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /**
   * PATCH /steel/material-intake/:id/status
   * Manual override, e.g. putting an intake ON_HOLD or CANCELLED.
   */
  @Patch(':id/status')
  @Roles(...RELEASE_ROLES)
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateMaterialIntakeStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.materialIntakeService.updateStatus(
      id,
      dto,
      user.organizationId,
    );
  }
}
