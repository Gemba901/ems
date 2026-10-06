import { Controller, Get, Header, Param, Query, UseGuards, UsePipes } from '@nestjs/common';
import { ModuleType } from 'db';
import type { AccessTokenPayload } from 'src/auth/access-token-payload';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { RequiresModule } from 'src/auth/decorators/module.decorator';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { ModuleGuard } from 'src/auth/guards/module.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { TenantGuard } from 'src/tenancy/tenant.guard';
import { TenantRequired } from 'src/tenancy/tenant-route.decorator';
import { TrustedTenantContextGuard } from 'src/tenancy/trusted-tenant-context.guard';
import { AnalyticsService } from '../analytics/analytics.service';
import { AnalyticsQueryDto } from '../dto/analytics.dto';
import { workValidationPipe } from '../dto/common.dto';
import { TeamService } from './team.service';

// Open to every employee: /team lists only the caller's direct reports, and analytics
// checks each scope in the service.
@TenantRequired()
@Controller('work')
@UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, RolesGuard, ModuleGuard)
@RequiresModule(ModuleType.WORK)
@UsePipes(workValidationPipe)
export class TeamController {
  constructor(private team: TeamService, private analytics: AnalyticsService) {}

  @Get('me')
  context(@CurrentUser() user: AccessTokenPayload) {
    return this.team.context(user);
  }

  @Get('team')
  @Header('Cache-Control', 'no-store')
  list(@CurrentUser() user: AccessTokenPayload) {
    return this.team.list(user);
  }

  @Get('team/:employeeId')
  @Header('Cache-Control', 'no-store')
  get(@CurrentUser() user: AccessTokenPayload, @Param('employeeId') employeeId: string) {
    return this.team.get(user, employeeId);
  }

  @Get('analytics')
  @Header('Cache-Control', 'no-store')
  getAnalytics(@CurrentUser() user: AccessTokenPayload, @Query() query: AnalyticsQueryDto) {
    return this.analytics.get(user, query);
  }
}
