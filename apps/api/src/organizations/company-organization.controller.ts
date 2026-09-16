import { Body, Controller, ForbiddenException, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { UpdateOrganizationDto } from './dto/organizations.dto';
import { TenantRequired } from '../tenancy/tenant-route.decorator';
import { TrustedTenantContextGuard } from '../tenancy/trusted-tenant-context.guard';
import { TenantGuard } from '../tenancy/tenant.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../common/enum/role.enum';
import type { TenantRequest } from '../tenancy/tenant-context';

@Controller('company/organization')
@TenantRequired()
@UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
export class CompanyOrganizationController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get()
  get(@Req() req: TenantRequest) {
    return this.organizations.getById(req.tenant!.organizationId);
  }

  @Patch()
  update(@Body() dto: UpdateOrganizationDto, @Req() req: TenantRequest) {
    if (dto.modules !== undefined) throw new ForbiddenException('Module access is managed by the platform');
    return this.organizations.update(req.tenant!.organizationId, dto);
  }
}
