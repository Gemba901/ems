import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from './config.service';
import {
  CreateCustomerDto,
  CreateDealerDto,
  CreateLookupDto,
  CreateMaterialDto,
  CreateProductDto,
  CreateProductSpecificationDto,
  CreateProductionRouteDto,
  CreateQcdCriteriaDto,
  CreateRouteStepDto,
  CreateSupplierMaterialDto,
  ImportEntityType,
  ReorderRouteStepsDto,
  UpdateCustomerDto,
  UpdateDealerDto,
  UpdateLookupDto,
  UpdateMaterialDto,
  UpdateProductDto,
  UpdateProductSpecificationDto,
  UpdateProductionRouteDto,
  UpdateQcdCriteriaDto,
  UpdateRouteStepDto,
  UpdateSupplierMaterialDto,
} from './dto/config.dto';
import { SteelLookupType } from 'db';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { ModuleGuard } from 'src/auth/guards/module.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { RequiresModule } from 'src/auth/decorators/module.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { Role } from 'src/common/enum/role.enum';
import { ModuleType } from 'db';

type AuthUser = { userId: string; organizationId: string; roleLevel: string };

// Configuration is entirely admin-owned: unlike P01 lookups, there is no
// read tier for regular planners here — they read via MasterDataModule.
const CONFIG_ADMIN_ROLES = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT];
const IMPORT_ENTITIES: ImportEntityType[] = [
  'products',
  'product-specifications',
  'customers',
  'dealers',
  'materials',
  'production-routes',
];

@Controller('steel/config')
@UseGuards(JwtAuthGuard, RolesGuard, ModuleGuard)
@RequiresModule(ModuleType.STEEL)
@Roles(...CONFIG_ADMIN_ROLES)
export class ConfigController {
  constructor(private configService: ConfigService) {}

  // ── Products ──
  @Get('products')
  listProducts(
    @Query('q') q: string,
    @Query('includeInactive') includeInactive: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.configService.listProducts(
      user.organizationId,
      q,
      includeInactive,
    );
  }

  @Post('products')
  createProduct(@Body() dto: CreateProductDto, @CurrentUser() user: AuthUser) {
    return this.configService.createProduct(user.organizationId, dto);
  }

  @Patch('products/:id')
  updateProduct(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.configService.updateProduct(id, user.organizationId, dto);
  }

  // ── Product Specifications ──
  @Get('product-specifications')
  listSpecs(
    @Query('q') q: string,
    @Query('productId') productId: string,
    @Query('includeInactive') includeInactive: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.configService.listProductSpecifications(
      user.organizationId,
      q,
      productId,
      includeInactive,
    );
  }

  @Post('product-specifications')
  createSpec(
    @Body() dto: CreateProductSpecificationDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.configService.createProductSpecification(
      user.organizationId,
      dto,
    );
  }

  @Patch('product-specifications/:id')
  updateSpec(
    @Param('id') id: string,
    @Body() dto: UpdateProductSpecificationDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.configService.updateProductSpecification(
      id,
      user.organizationId,
      dto,
    );
  }

  // ── Production Routes ──
  @Get('routes')
  listRoutes(
    @Query('q') q: string,
    @Query('includeInactive') includeInactive: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.configService.listRoutes(
      user.organizationId,
      q,
      includeInactive,
    );
  }

  @Post('routes')
  createRoute(
    @Body() dto: CreateProductionRouteDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.configService.createRoute(user.organizationId, dto);
  }

  @Patch('routes/:id')
  updateRoute(
    @Param('id') id: string,
    @Body() dto: UpdateProductionRouteDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.configService.updateRoute(id, user.organizationId, dto);
  }

  @Post('routes/:id/steps')
  addRouteStep(
    @Param('id') id: string,
    @Body() dto: CreateRouteStepDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.configService.addRouteStep(id, user.organizationId, dto);
  }

  @Patch('routes/steps/:stepId')
  updateRouteStep(
    @Param('stepId') stepId: string,
    @Body() dto: UpdateRouteStepDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.configService.updateRouteStep(stepId, user.organizationId, dto);
  }

  @Delete('routes/steps/:stepId')
  deleteRouteStep(
    @Param('stepId') stepId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.configService.deleteRouteStep(stepId, user.organizationId);
  }

  @Patch('routes/:id/steps/reorder')
  reorderRouteSteps(
    @Param('id') id: string,
    @Body() dto: ReorderRouteStepsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.configService.reorderRouteSteps(id, user.organizationId, dto);
  }

  // ── Customers ──
  @Get('customers')
  listCustomers(
    @Query('q') q: string,
    @Query('includeInactive') includeInactive: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.configService.listCustomers(
      user.organizationId,
      q,
      includeInactive,
    );
  }

  @Post('customers')
  createCustomer(
    @Body() dto: CreateCustomerDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.configService.createCustomer(user.organizationId, dto);
  }

  @Patch('customers/:id')
  updateCustomer(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.configService.updateCustomer(id, user.organizationId, dto);
  }

  // ── Dealers ──
  @Get('dealers')
  listDealers(
    @Query('q') q: string,
    @Query('includeInactive') includeInactive: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.configService.listDealers(
      user.organizationId,
      q,
      includeInactive,
    );
  }

  @Post('dealers')
  createDealer(@Body() dto: CreateDealerDto, @CurrentUser() user: AuthUser) {
    return this.configService.createDealer(user.organizationId, dto);
  }

  @Patch('dealers/:id')
  updateDealer(
    @Param('id') id: string,
    @Body() dto: UpdateDealerDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.configService.updateDealer(id, user.organizationId, dto);
  }

  // ── Materials ──
  @Get('materials')
  listMaterials(
    @Query('q') q: string,
    @Query('includeInactive') includeInactive: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.configService.listMaterials(
      user.organizationId,
      q,
      includeInactive,
    );
  }

  @Post('materials')
  createMaterial(
    @Body() dto: CreateMaterialDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.configService.createMaterial(
      user.organizationId,
      dto,
      user.userId,
    );
  }

  @Patch('materials/:id')
  updateMaterial(
    @Param('id') id: string,
    @Body() dto: UpdateMaterialDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.configService.updateMaterial(
      id,
      user.organizationId,
      dto,
      user.userId,
    );
  }

  // ── Supplier ↔ Material eligibility (P02-A03) ──
  @Get('supplier-materials')
  listSupplierMaterials(
    @Query('supplierId') supplierId: string,
    @Query('materialId') materialId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.configService.listSupplierMaterials(
      user.organizationId,
      supplierId,
      materialId,
    );
  }

  @Post('supplier-materials')
  createSupplierMaterial(
    @Body() dto: CreateSupplierMaterialDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.configService.createSupplierMaterial(
      user.organizationId,
      dto,
      user.userId,
    );
  }

  @Patch('supplier-materials/:id')
  updateSupplierMaterial(
    @Param('id') id: string,
    @Body() dto: UpdateSupplierMaterialDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.configService.updateSupplierMaterial(
      id,
      user.organizationId,
      dto,
      user.userId,
    );
  }

  @Delete('supplier-materials/:id')
  deleteSupplierMaterial(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.configService.deleteSupplierMaterial(id, user.organizationId);
  }

  // ── QCD criteria (P02-A06) ──
  @Get('qcd-criteria')
  listQcdCriteria(
    @Query('includeInactive') includeInactive: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.configService.listQcdCriteria(
      user.organizationId,
      includeInactive,
    );
  }

  @Post('qcd-criteria')
  createQcdCriteria(
    @Body() dto: CreateQcdCriteriaDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.configService.createQcdCriteria(
      user.organizationId,
      dto,
      user.userId,
    );
  }

  @Patch('qcd-criteria/:id')
  updateQcdCriteria(
    @Param('id') id: string,
    @Body() dto: UpdateQcdCriteriaDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.configService.updateQcdCriteria(
      id,
      user.organizationId,
      dto,
      user.userId,
    );
  }

  // ── Procurement supporting lookups ──
  @Get('lookups')
  listLookups(
    @Query('type') type: SteelLookupType,
    @Query('includeInactive') includeInactive: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.configService.listLookups(
      user.organizationId,
      type,
      includeInactive,
    );
  }

  @Post('lookups')
  createLookup(@Body() dto: CreateLookupDto, @CurrentUser() user: AuthUser) {
    return this.configService.createLookup(
      user.organizationId,
      dto,
      user.userId,
    );
  }

  @Patch('lookups/:id')
  updateLookup(
    @Param('id') id: string,
    @Body() dto: UpdateLookupDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.configService.updateLookup(
      id,
      user.organizationId,
      dto,
      user.userId,
    );
  }

  // ── Import ──
  @Post('import/:entity/preview')
  @UseInterceptors(FileInterceptor('file'))
  async previewImport(
    @Param('entity') entity: string,
    @UploadedFile() file: { buffer?: Buffer },
    @CurrentUser() user: AuthUser,
  ) {
    this.assertValidEntity(entity);
    if (!file?.buffer)
      throw new BadRequestException('A CSV/Excel file is required.');
    return this.configService.previewImport(
      entity,
      user.organizationId,
      file.buffer,
    );
  }

  @Post('import/:entity/commit')
  @UseInterceptors(FileInterceptor('file'))
  async commitImport(
    @Param('entity') entity: string,
    @UploadedFile() file: { buffer?: Buffer },
    @CurrentUser() user: AuthUser,
  ) {
    this.assertValidEntity(entity);
    if (!file?.buffer)
      throw new BadRequestException('A CSV/Excel file is required.');
    return this.configService.commitImport(
      entity,
      user.organizationId,
      file.buffer,
    );
  }

  private assertValidEntity(
    entity: string,
  ): asserts entity is ImportEntityType {
    if (!IMPORT_ENTITIES.includes(entity as ImportEntityType)) {
      throw new BadRequestException(`Unsupported import entity "${entity}".`);
    }
  }
}
