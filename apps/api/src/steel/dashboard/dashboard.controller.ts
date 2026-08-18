import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SteelDashboardService } from './dashboard.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { ModuleGuard } from 'src/auth/guards/module.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { RequiresModule } from 'src/auth/decorators/module.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { Role } from 'src/common/enum/role.enum';
import { ModuleType } from 'db';

type AuthUser = { userId: string; organizationId: string; roleLevel: string };

// Same role scope as P01-P05 day-to-day access — this only surfaces
// activity already visible through those processes' own endpoints.
const DASHBOARD_ROLES = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.MANAGEMENT,
  Role.HOD,
];

/**
 * Steel Operations home — cross-process recent activity feed (P01-P05).
 */
@Controller('steel/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard, ModuleGuard)
@RequiresModule(ModuleType.STEEL)
@Roles(...DASHBOARD_ROLES)
export class SteelDashboardController {
  constructor(private dashboardService: SteelDashboardService) {}

  /** GET /steel/dashboard/recent-activity — last activities across P01-P05, most recent first. */
  @Get('recent-activity')
  getRecentActivity(
    @CurrentUser() user: AuthUser,
    @Query('limit') limit?: string,
  ) {
    const parsed = limit ? parseInt(limit, 10) : undefined;
    return this.dashboardService.getRecentActivity(
      user.organizationId,
      parsed && !Number.isNaN(parsed) ? parsed : undefined,
    );
  }
}
