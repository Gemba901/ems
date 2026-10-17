import { Controller, Get, Query, UseGuards, UsePipes } from '@nestjs/common';
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
import { workValidationPipe } from 'src/work/dto/common.dto';
import { OverviewQueryDto } from '../dto/five-s.dto';
import { AnalyticsService } from './analytics.service';

// 5S analytics: S-by-S profiles, department comparison, trends, checkpoint hotspots and red tags.
@TenantRequired()
@Controller('five-s/analytics')
@UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, RolesGuard, ModuleGuard)
@RequiresModule(ModuleType.FIVE_S)
@UsePipes(workValidationPipe)
export class AnalyticsController {
    constructor(private service: AnalyticsService) {}

    @Get()
    analytics(@CurrentUser() user: AccessTokenPayload, @Query() query: OverviewQueryDto) {
        return this.service.analytics(user, query);
    }
}
