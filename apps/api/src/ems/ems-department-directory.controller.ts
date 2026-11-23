import type { DepartmentPeopleQuery } from './ems-department-directory';
import { Controller, Get, Param, Query, Req, UseGuards, UnauthorizedException } from '@nestjs/common';
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
import { Role } from 'src/common/enum/role.enum';
import { ModuleType } from 'db';
import { departmentDirectory, departmentPeople } from './ems-department-directory';

@Controller('ems/organisation/departments')
@TenantRequired()
@UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, RolesGuard, ModuleGuard)
@Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.HR)
@RequiresModule(ModuleType.EMS)
export class EmsDepartmentDirectoryController {
  constructor(private readonly db: PrismaService) {}
  private company(request: TenantRequest) {
    if (!request.tenant?.organizationId) throw new UnauthorizedException('Company context is required');
    return request.tenant.organizationId;
  }
  @Get()
  list(@Req() request: TenantRequest) { return departmentDirectory(this.db, this.company(request)); }
  @Get(':id/people')
  people(@Param('id') id: string, @Query() query: DepartmentPeopleQuery, @Req() request: TenantRequest) {
    return departmentPeople(this.db, this.company(request), id, query);
  }
}
