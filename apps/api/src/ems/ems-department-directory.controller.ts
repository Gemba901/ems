import type { DepartmentPeopleQuery } from './ems-department-directory';
import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards, UnauthorizedException } from '@nestjs/common';
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
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { departmentDirectory, departmentPeople } from './ems-department-directory';
import { departmentHodChoices, saveDepartmentBranchHod, type DepartmentHodQuery } from './ems-department-hod';
import { UpdateDepartmentBranchHodDto } from './dto/department-hod.dto';

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
  /** Choose HOD, for one department at one branch (?branch=<directory key>). */
  @Get(':id/hod')
  hod(@Param('id') id: string, @Query() query: DepartmentHodQuery, @Req() request: TenantRequest) {
    return departmentHodChoices(this.db, this.company(request), id, query);
  }
  @Patch(':id/hod')
  saveHod(@Param('id') id: string, @Body() dto: UpdateDepartmentBranchHodDto, @Req() request: TenantRequest,
    @CurrentUser() user: { userId: string }) {
    return saveDepartmentBranchHod(this.db, this.company(request), id, dto, user?.userId);
  }
}
