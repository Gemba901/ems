import { Body, Controller, Get, Header, HttpCode, Param, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
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
import {
  AttendanceRangeQueryDto,
  ClockInDto,
  ClockOutDto,
  CorrectAttendanceDto,
  TeamAttendanceQueryDto,
} from '../dto/attendance.dto';
import { workValidationPipe } from '../dto/common.dto';
import { ATTENDANCE_MANAGER_ROLES } from '../work-access.policy';
import { AttendanceService } from './attendance.service';

// Attendance responses are personal data, so none of them may be cached.
@TenantRequired()
@Controller('work/attendance')
@UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, RolesGuard, ModuleGuard)
@RequiresModule(ModuleType.WORK)
@UsePipes(workValidationPipe)
export class AttendanceController {
  constructor(private attendance: AttendanceService) {}

  @Get('me/status')
  @Header('Cache-Control', 'no-store')
  status(@CurrentUser() user: AccessTokenPayload) {
    return this.attendance.status(user);
  }

  @Get('me')
  @Header('Cache-Control', 'no-store')
  listMine(@CurrentUser() user: AccessTokenPayload, @Query() query: AttendanceRangeQueryDto) {
    return this.attendance.listMine(user, query);
  }

  @Post('clock-in')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  clockIn(@CurrentUser() user: AccessTokenPayload, @Body() dto: ClockInDto) {
    return this.attendance.clockIn(user, dto);
  }

  @Post(':recordId/clock-out')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  clockOut(@CurrentUser() user: AccessTokenPayload, @Param('recordId') recordId: string, @Body() dto: ClockOutDto) {
    return this.attendance.clockOut(user, recordId, dto);
  }

  // Attendance managers, or anyone with direct reports; checked in the service.
  @Get('team')
  @Header('Cache-Control', 'no-store')
  listTeam(@CurrentUser() user: AccessTokenPayload, @Query() query: TeamAttendanceQueryDto) {
    return this.attendance.listTeam(user, query);
  }

  @Get(':recordId/location')
  @Header('Cache-Control', 'no-store')
  location(@CurrentUser() user: AccessTokenPayload, @Param('recordId') recordId: string) {
    return this.attendance.location(user, recordId);
  }

  @Get(':recordId/corrections')
  @Header('Cache-Control', 'no-store')
  listCorrections(@CurrentUser() user: AccessTokenPayload, @Param('recordId') recordId: string) {
    return this.attendance.listCorrections(user, recordId);
  }

  @Post(':recordId/corrections')
  @Roles(...ATTENDANCE_MANAGER_ROLES)
  @Header('Cache-Control', 'no-store')
  correct(@CurrentUser() user: AccessTokenPayload, @Param('recordId') recordId: string, @Body() dto: CorrectAttendanceDto) {
    return this.attendance.correct(user, recordId, dto);
  }
}
