import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { MasterDataService } from './master-data.service';
import {
  QueryFinishedGoodsStockDto,
  QueryMaterialAvailabilityDto,
  QueryProductSpecificationsDto,
  QueryProductsDto,
  SearchQueryDto,
} from './dto/master-data.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { ModuleGuard } from 'src/auth/guards/module.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { RequiresModule } from 'src/auth/decorators/module.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { Role } from 'src/common/enum/role.enum';
import { ModuleType } from 'db';

type AuthUser = { userId: string; organizationId: string; roleLevel: string };

const PLANNING_ROLES = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.MANAGEMENT,
  Role.HOD,
];

/** Read-only master-data lookups backing the P01 selection screens. */
@Controller('steel/master-data')
@UseGuards(JwtAuthGuard, RolesGuard, ModuleGuard)
@RequiresModule(ModuleType.STEEL)
@Roles(...PLANNING_ROLES)
export class MasterDataController {
  constructor(private masterDataService: MasterDataService) {}

  @Get('customers')
  getCustomers(@Query() query: SearchQueryDto, @CurrentUser() user: AuthUser) {
    return this.masterDataService.getCustomers(user.organizationId, query);
  }

  @Get('dealers')
  getDealers(@Query() query: SearchQueryDto, @CurrentUser() user: AuthUser) {
    return this.masterDataService.getDealers(user.organizationId, query);
  }

  @Get('products')
  getProducts(@Query() query: QueryProductsDto, @CurrentUser() user: AuthUser) {
    return this.masterDataService.getProducts(user.organizationId, query);
  }

  @Get('product-specifications')
  getProductSpecifications(
    @Query() query: QueryProductSpecificationsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.masterDataService.getProductSpecifications(
      user.organizationId,
      query,
    );
  }

  @Get('routes')
  getRoutes(@Query() query: SearchQueryDto, @CurrentUser() user: AuthUser) {
    return this.masterDataService.getRoutes(user.organizationId, query);
  }

  @Get('routes/:id/steps')
  getRouteSteps(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.masterDataService.getRouteSteps(id, user.organizationId);
  }

  @Get('materials')
  getMaterials(@Query() query: SearchQueryDto, @CurrentUser() user: AuthUser) {
    return this.masterDataService.getMaterials(user.organizationId, query);
  }

  @Get('furnaces')
  getFurnaces(@Query() query: SearchQueryDto, @CurrentUser() user: AuthUser) {
    return this.masterDataService.getFurnaces(user.organizationId, query);
  }

  @Get('finished-goods-stock')
  getFinishedGoodsStock(
    @Query() query: QueryFinishedGoodsStockDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.masterDataService.getFinishedGoodsStock(
      user.organizationId,
      query,
    );
  }

  @Get('material-availability')
  getMaterialAvailability(
    @Query() query: QueryMaterialAvailabilityDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.masterDataService.getMaterialAvailability(
      user.organizationId,
      query,
    );
  }
}
