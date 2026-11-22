import { Controller, UseGuards } from '@nestjs/common';
import { ModuleType } from 'db';
import { TenantRequired } from 'src/tenancy/tenant-route.decorator';
import { TrustedTenantContextGuard } from 'src/tenancy/trusted-tenant-context.guard';
import { TenantGuard } from 'src/tenancy/tenant.guard';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { ModuleGuard } from 'src/auth/guards/module.guard';
import { RequiresModule } from 'src/auth/decorators/module.decorator';
import { OrganisationFrameworkService } from './organisation-framework.service';

@TenantRequired()
@Controller('leadership-excellence/organisation-framework')
@UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, RolesGuard, ModuleGuard)
@RequiresModule(ModuleType.LEADERSHIP_EXCELLENCE)
export class OrganisationFrameworkController {
  constructor(private readonly service: OrganisationFrameworkService) {}
}
