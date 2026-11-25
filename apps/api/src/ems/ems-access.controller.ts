import { Body, Controller, Get, Param, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { TrustedTenantContextGuard } from 'src/tenancy/trusted-tenant-context.guard';
import { TenantGuard } from 'src/tenancy/tenant.guard';
import { TenantRequired } from 'src/tenancy/tenant-route.decorator';
import type { TenantRequest } from 'src/tenancy/tenant-context';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { ModuleGuard } from 'src/auth/guards/module.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { RequiresModule } from 'src/auth/decorators/module.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { Role } from 'src/common/enum/role.enum';
import { ModuleType } from 'db';
import { accessSuggestions, changeAccess, decideAccessSuggestions, employeeAccess, suggestAccess } from './ems-access';
import { AccessSuggestionsQueryDto, ChangeAccessDto, DecideAccessSuggestionsDto } from './dto/access.dto';

type Viewer = { userId: string; roleLevel: Role };

/** Company access in EMS: HR and Admins can see it; only Admins change it. */
@Controller('ems/access')
@TenantRequired()
@UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, RolesGuard, ModuleGuard)
@Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
@RequiresModule(ModuleType.EMS)
export class EmsAccessController {
  constructor(private readonly db: PrismaService) {}
  private company(request: TenantRequest) {
    if (!request.tenant?.organizationId) throw new UnauthorizedException('Company context is required');
    return request.tenant.organizationId;
  }

  /** GET /ems/access/employees/:id — role, the import's suggestion and the access history. */
  @Get('employees/:id')
  employee(@Param('id') id: string, @Req() request: TenantRequest, @CurrentUser() user: Viewer) {
    return employeeAccess(this.db, this.company(request), id, user?.roleLevel);
  }

  /** GET /ems/access/suggestions?batchId= — people suggested for access above Employee, waiting for an Admin. */
  @Get('suggestions')
  suggestions(@Query() query: AccessSuggestionsQueryDto, @Req() request: TenantRequest, @CurrentUser() user: Viewer) {
    return accessSuggestions(this.db, this.company(request), query, user?.roleLevel);
  }

  /** POST /ems/access/change — Change access for one or more people, with a reason. */
  @Post('change')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  change(@Body() dto: ChangeAccessDto, @Req() request: TenantRequest, @CurrentUser() user: Viewer) {
    return changeAccess(this.db, this.company(request), { userId: user?.userId, role: user?.roleLevel }, dto);
  }

  /** POST /ems/access/suggest — HR suggests a change; it waits for an Admin like an import's suggestion. */
  @Post('suggest')
  suggest(@Body() dto: ChangeAccessDto, @Req() request: TenantRequest, @CurrentUser() user: Viewer) {
    return suggestAccess(this.db, this.company(request), { userId: user?.userId, role: user?.roleLevel }, dto);
  }

  /** POST /ems/access/suggestions/decide — approve or decline suggested access. */
  @Post('suggestions/decide')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  decide(@Body() dto: DecideAccessSuggestionsDto, @Req() request: TenantRequest, @CurrentUser() user: Viewer) {
    return decideAccessSuggestions(this.db, this.company(request), { userId: user?.userId, role: user?.roleLevel }, dto);
  }
}
