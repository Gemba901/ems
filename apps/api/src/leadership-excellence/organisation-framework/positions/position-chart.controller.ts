import { Controller, Get, Param, ParseUUIDPipe, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ModuleType } from 'db';
import { TenantRequired } from 'src/tenancy/tenant-route.decorator';
import { TrustedTenantContextGuard } from 'src/tenancy/trusted-tenant-context.guard';
import { TenantGuard } from 'src/tenancy/tenant.guard';
import type { TenantRequest } from 'src/tenancy/tenant-context';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { ModuleGuard } from 'src/auth/guards/module.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { RequiresModule } from 'src/auth/decorators/module.decorator';
import { LEX_ALL } from '../../common/lex-roles';
import { PositionChartService } from './position-chart.service';

/**
 * GET …/positions: positions and reporting (read-only, everyone in LEX).
 * GET …/positions/people/:employeeId: one person's details, limited to the viewer's tier.
 */
@TenantRequired()
@Controller('leadership-excellence/organisation-framework/positions')
@UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, RolesGuard, ModuleGuard)
@RequiresModule(ModuleType.LEADERSHIP_EXCELLENCE)
@Roles(...LEX_ALL)
export class PositionChartController {
  constructor(private readonly positions: PositionChartService) {}

  @Get()
  chart(@Req() request: TenantRequest) {
    const organizationId = request.tenant?.organizationId;
    if (!organizationId) throw new UnauthorizedException('Company context is required');
    return this.positions.getPositions(organizationId);
  }

  @Get('people/:employeeId')
  person(@Req() request: TenantRequest, @Param('employeeId', new ParseUUIDPipe()) employeeId: string) {
    const organizationId = request.tenant?.organizationId, userId = request.user?.userId;
    if (!organizationId || !userId) throw new UnauthorizedException('Company context is required');
    return this.positions.getPerson(organizationId, userId, employeeId);
  }
}
