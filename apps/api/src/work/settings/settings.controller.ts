import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
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
import { CreateHolidayDto, HolidayQueryDto, ImportHolidaysDto, UpdateHolidayDto, UpdateWorkSettingsDto } from '../dto/settings.dto';
import { WORK_SETTINGS_ROLES } from '../work-access.policy';
import { SettingsService } from './settings.service';

// Everyone in the organization can read the schedule and holidays; only settings roles change them.
@TenantRequired()
@Controller('work')
@UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, RolesGuard, ModuleGuard)
@RequiresModule(ModuleType.WORK)
@UsePipes(workValidationPipe)
export class SettingsController {
  constructor(private settings: SettingsService) {}

  @Get('settings')
  get(@CurrentUser() user: AccessTokenPayload) {
    return this.settings.get(user);
  }

  @Patch('settings')
  @Roles(...WORK_SETTINGS_ROLES)
  update(@CurrentUser() user: AccessTokenPayload, @Body() dto: UpdateWorkSettingsDto) {
    return this.settings.update(user, dto);
  }

  @Get('holidays/countries')
  countries() {
    return this.settings.countries();
  }

  @Get('holidays')
  listHolidays(@CurrentUser() user: AccessTokenPayload, @Query() query: HolidayQueryDto) {
    return this.settings.listHolidays(user, query);
  }

  @Post('holidays')
  @Roles(...WORK_SETTINGS_ROLES)
  createHoliday(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreateHolidayDto) {
    return this.settings.createHoliday(user, dto);
  }

  @Post('holidays/import')
  @HttpCode(200)
  @Roles(...WORK_SETTINGS_ROLES)
  importHolidays(@CurrentUser() user: AccessTokenPayload, @Body() dto: ImportHolidaysDto) {
    return this.settings.importHolidays(user, dto.year);
  }

  @Patch('holidays/:holidayId')
  @Roles(...WORK_SETTINGS_ROLES)
  updateHoliday(@CurrentUser() user: AccessTokenPayload, @Param('holidayId') holidayId: string, @Body() dto: UpdateHolidayDto) {
    return this.settings.updateHoliday(user, holidayId, dto);
  }

  @Delete('holidays/:holidayId')
  @Roles(...WORK_SETTINGS_ROLES)
  deleteHoliday(@CurrentUser() user: AccessTokenPayload, @Param('holidayId') holidayId: string) {
    return this.settings.deleteHoliday(user, holidayId);
  }
}
