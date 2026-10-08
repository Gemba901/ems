import { Body, Controller, Delete, Get, Header, HttpCode, Param, Patch, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
import { ModuleType } from 'db';
import type { AccessTokenPayload } from 'src/auth/access-token-payload';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { RequiresModule } from 'src/auth/decorators/module.decorator';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { ModuleGuard } from 'src/auth/guards/module.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { TenantGuard } from 'src/tenancy/tenant.guard';
import { TenantRequired } from 'src/tenancy/tenant-route.decorator';
import { TrustedTenantContextGuard } from 'src/tenancy/trusted-tenant-context.guard';
import { workValidationPipe } from '../dto/common.dto';
import {
  ArrangementQueryDto,
  CreateSiteDto,
  HomeLocationRequestDto,
  HomeRequestQueryDto,
  ReviewHomeRequestDto,
  UpdateArrangementDto,
  UpdateLocationSettingsDto,
  UpdateSiteDto,
} from '../dto/locations.dto';
import { WORK_SETTINGS_ROLES } from '../work-access.policy';
import { LocationsService } from './locations.service';

// Company sites, work arrangements and home locations. Homes are personal data: none of
// these responses may be cached.
@TenantRequired()
@Controller('work/locations')
@UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, RolesGuard, ModuleGuard)
@RequiresModule(ModuleType.WORK)
@UsePipes(workValidationPipe)
export class LocationsController {
  constructor(private locations: LocationsService) {}

  @Get()
  settings(@CurrentUser() user: AccessTokenPayload) {
    return this.locations.settings(user);
  }

  @Patch()
  @Roles(...WORK_SETTINGS_ROLES)
  updateSettings(@CurrentUser() user: AccessTokenPayload, @Body() dto: UpdateLocationSettingsDto) {
    return this.locations.updateSettings(user, dto);
  }

  @Post('sites')
  @Roles(...WORK_SETTINGS_ROLES)
  createSite(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreateSiteDto) {
    return this.locations.createSite(user, dto);
  }

  @Patch('sites/:siteId')
  @Roles(...WORK_SETTINGS_ROLES)
  updateSite(@CurrentUser() user: AccessTokenPayload, @Param('siteId') siteId: string, @Body() dto: UpdateSiteDto) {
    return this.locations.updateSite(user, siteId, dto);
  }

  @Delete('sites/:siteId')
  @Roles(...WORK_SETTINGS_ROLES)
  deleteSite(@CurrentUser() user: AccessTokenPayload, @Param('siteId') siteId: string) {
    return this.locations.deleteSite(user, siteId);
  }

  @Get('arrangements')
  @Roles(...WORK_SETTINGS_ROLES)
  @Header('Cache-Control', 'no-store')
  listArrangements(@CurrentUser() user: AccessTokenPayload, @Query() query: ArrangementQueryDto) {
    return this.locations.listArrangements(user, query);
  }

  @Patch('arrangements/:employeeId')
  @Roles(...WORK_SETTINGS_ROLES)
  setArrangement(@CurrentUser() user: AccessTokenPayload, @Param('employeeId') employeeId: string, @Body() dto: UpdateArrangementDto) {
    return this.locations.setArrangement(user, employeeId, dto);
  }

  @Get('me')
  @Header('Cache-Control', 'no-store')
  mine(@CurrentUser() user: AccessTokenPayload) {
    return this.locations.mine(user);
  }

  @Post('me/home-request')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  requestHome(@CurrentUser() user: AccessTokenPayload, @Body() dto: HomeLocationRequestDto) {
    return this.locations.requestHome(user, dto);
  }

  @Delete('me/home-request')
  @Header('Cache-Control', 'no-store')
  cancelMine(@CurrentUser() user: AccessTokenPayload) {
    return this.locations.cancelMine(user);
  }

  // Settings roles, or anyone with direct reports; checked in the service.
  @Get('home-requests')
  @Header('Cache-Control', 'no-store')
  listRequests(@CurrentUser() user: AccessTokenPayload, @Query() query: HomeRequestQueryDto) {
    return this.locations.listRequests(user, query);
  }

  @Post('home-requests/:requestId/review')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  review(@CurrentUser() user: AccessTokenPayload, @Param('requestId') requestId: string, @Body() dto: ReviewHomeRequestDto) {
    return this.locations.review(user, requestId, dto);
  }
}
