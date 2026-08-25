import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SteelSourcingService } from './steel-sourcing.service';
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
  UpdateSupplierDto,
  CreateSteelSourcingAttachmentDto,
} from './dto/steel-sourcing.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { ModuleGuard } from 'src/auth/guards/module.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { RequiresModule } from 'src/auth/decorators/module.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { Role } from 'src/common/enum/role.enum';
import { ModuleType } from 'db';

type AuthUser = { userId: string; organizationId: string; roleLevel: string };

// Same role scope as the planning module — no dedicated PROCUREMENT role exists yet.
const SOURCING_ROLES = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.MANAGEMENT,
  Role.HOD,
];
const PO_ROLES = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT];

@Controller('steel/sourcing')
@UseGuards(JwtAuthGuard, RolesGuard, ModuleGuard)
@RequiresModule(ModuleType.STEEL)
@Roles(...SOURCING_ROLES)
export class SteelSourcingController {
  constructor(private steelSourcingService: SteelSourcingService) {}

  /**
   * POST /steel/sourcing
   * P02-A01 — Review material requirement from production plan.
   * Requires the referenced plan to already be at P01-A12 (released).
   */
  @Post()
  async create(
    @Body() dto: CreateSteelSourcingOrderDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.steelSourcingService.createOrder(
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /** GET /steel/sourcing — list sourcing orders for the organization. */
  @Get()
  async getAll(
    @Query() query: QuerySteelSourcingOrdersDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.steelSourcingService.getAll(user.organizationId, query);
  }

  /** GET /steel/sourcing/summary — aggregated counts for dashboard widgets. */
  @Get('summary')
  async getSummary(@CurrentUser() user: AuthUser) {
    return this.steelSourcingService.getSummary(user.organizationId);
  }

  /** GET /steel/sourcing/suppliers — approved supplier list, for P02-A03 selection. */
  @Get('suppliers')
  async getSuppliers(
    @Query() query: QuerySuppliersDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.steelSourcingService.getSuppliers(user.organizationId, query);
  }

  /** POST /steel/sourcing/suppliers — add a supplier to the master list. */
  @Post('suppliers')
  async createSupplier(
    @Body() dto: CreateSupplierDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.steelSourcingService.createSupplier(
      dto,
      user.organizationId,
      user.userId,
    );
  }

  /** PATCH /steel/sourcing/suppliers/:id — update a supplier master record. */
  @Patch('suppliers/:id')
  async updateSupplier(
    @Param('id') id: string,
    @Body() dto: UpdateSupplierDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.steelSourcingService.updateSupplier(
      id,
      user.organizationId,
      dto,
      user.userId,
    );
  }

  /**
   * GET /steel/sourcing/suppliers/:id/eligible-materials
   * Materials this supplier is admin-approved to supply (Steel Configuration).
   */
  @Get('suppliers/:id/eligible-materials')
  async getSupplierEligibleMaterials(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.steelSourcingService.getSupplierEligibleMaterials(
      id,
      user.organizationId,
    );
  }

  /** GET /steel/sourcing/:id — full detail for one sourcing order. */
  @Get(':id')
  async getOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.steelSourcingService.getById(id, user.organizationId);
  }

  /**
   * POST /steel/sourcing/:id/attachments
   * Record a document already uploaded to S3 via the generic presigned-url
   * flow against this sourcing order and stage (e.g. supplier certificates,
   * quotations, PO/technical docs, delivery/shipping docs).
   */
  @Post(':id/attachments')
  async addAttachment(
    @Param('id') id: string,
    @Body() dto: CreateSteelSourcingAttachmentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.steelSourcingService.addAttachment(
      id,
      user.organizationId,
      dto,
      user.userId,
    );
  }

  /** GET /steel/sourcing/:id/attachments — list attachments for a sourcing order. */
  @Get(':id/attachments')
  async getAttachments(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.steelSourcingService.getAttachments(id, user.organizationId);
  }

  /** DELETE /steel/sourcing/attachments/:attachmentId */
  @Delete('attachments/:attachmentId')
  async deleteAttachment(
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.steelSourcingService.deleteAttachment(
      attachmentId,
      user.organizationId,
    );
  }

  /**
   * PATCH /steel/sourcing/:id/material-type
   * P02-A02 — Identify material type needed.
   */
  @Patch(':id/material-type')
  async identifyMaterialType(
    @Param('id') id: string,
    @Body() dto: IdentifySteelMaterialTypeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.steelSourcingService.identifyMaterialType(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /**
   * PATCH /steel/sourcing/:id/material-source
   * P02-A03 — Select material source (existing stock or external supplier).
   */
  @Patch(':id/material-source')
  async selectMaterialSource(
    @Param('id') id: string,
    @Body() dto: SelectMaterialSourceDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.steelSourcingService.selectMaterialSource(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /**
   * PATCH /steel/sourcing/:id/supplier-risk
   * P02-A04 — Check supplier quality and rejection history.
   */
  @Patch(':id/supplier-risk')
  async reviewSupplierRisk(
    @Param('id') id: string,
    @Body() dto: ReviewSteelSupplierRiskDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.steelSourcingService.reviewSupplierRisk(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /**
   * PATCH /steel/sourcing/:id/quotations
   * P02-A05 — Collect price and availability confirmation.
   */
  @Patch(':id/quotations')
  async collectQuotations(
    @Param('id') id: string,
    @Body() dto: CollectSteelQuotationsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.steelSourcingService.collectQuotations(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /**
   * PATCH /steel/sourcing/:id/select-supplier
   * P02-A06 — Compare supplier options using QCD logic.
   */
  @Patch(':id/select-supplier')
  async selectSupplier(
    @Param('id') id: string,
    @Body() dto: SelectSteelSupplierDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.steelSourcingService.selectSupplier(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /**
   * PATCH /steel/sourcing/:id/specification
   * P02-A07 — Confirm technical specification and documents required.
   */
  @Patch(':id/specification')
  async confirmSpecification(
    @Param('id') id: string,
    @Body() dto: ConfirmSteelSourcingSpecDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.steelSourcingService.confirmSpecification(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /**
   * PATCH /steel/sourcing/:id/purchase-order
   * P02-A08 — Create purchase order. Restricted to authorized approvers.
   */
  @Patch(':id/purchase-order')
  @Roles(...PO_ROLES)
  async createPurchaseOrder(
    @Param('id') id: string,
    @Body() dto: CreateSteelPurchaseOrderDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.steelSourcingService.createPurchaseOrder(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /**
   * PATCH /steel/sourcing/:id/delivery-schedule
   * P02-A09 — Confirm delivery schedule with supplier.
   */
  @Patch(':id/delivery-schedule')
  async confirmDeliverySchedule(
    @Param('id') id: string,
    @Body() dto: ConfirmSteelDeliveryScheduleDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.steelSourcingService.confirmDeliverySchedule(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /**
   * PATCH /steel/sourcing/:id/logistics
   * P02-A10 — Prepare import/local logistics if applicable (Imported Billet Route).
   */
  @Patch(':id/logistics')
  async prepareLogistics(
    @Param('id') id: string,
    @Body() dto: PrepareSteelImportLogisticsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.steelSourcingService.prepareLogistics(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /**
   * PATCH /steel/sourcing/:id/inform-intake
   * P02-A11 — Inform raw material intake team.
   */
  @Patch(':id/inform-intake')
  async informIntakeTeam(
    @Param('id') id: string,
    @Body() dto: InformSteelIntakeTeamDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.steelSourcingService.informIntakeTeam(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /**
   * PATCH /steel/sourcing/:id/close-handover
   * P02-A12 — Close sourcing handover to intake. Restricted to authorized approvers.
   */
  @Patch(':id/close-handover')
  @Roles(...PO_ROLES)
  async closeHandover(
    @Param('id') id: string,
    @Body() dto: CloseSteelSourcingHandoverDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.steelSourcingService.closeHandover(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }

  /**
   * PATCH /steel/sourcing/:id/status
   * Manual override, e.g. putting an order ON_HOLD or CANCELLED.
   */
  @Patch(':id/status')
  @Roles(...PO_ROLES)
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateSteelSourcingStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.steelSourcingService.updateStatus(
      id,
      dto,
      user.userId,
      user.organizationId,
    );
  }
}
