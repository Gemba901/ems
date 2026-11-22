import { Controller, UseGuards } from '@nestjs/common';
import { ModuleType } from 'db';
import { TenantRequired } from 'src/tenancy/tenant-route.decorator';
import { TrustedTenantContextGuard } from 'src/tenancy/trusted-tenant-context.guard';
import { TenantGuard } from 'src/tenancy/tenant.guard';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { ModuleGuard } from 'src/auth/guards/module.guard';
import { RequiresModule } from 'src/auth/decorators/module.decorator';
import { ReviewsDevelopmentService } from './reviews-development.service';

@TenantRequired()
@Controller('leadership-excellence/reviews-development')
@UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, RolesGuard, ModuleGuard)
@RequiresModule(ModuleType.LEADERSHIP_EXCELLENCE)
export class ReviewsDevelopmentController {
  constructor(private readonly service: ReviewsDevelopmentService) {}
}
