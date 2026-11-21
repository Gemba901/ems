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
import { OverviewService } from './overview.service';

// Module overview: latest submitted level per area, targets, actions, red tags and audit due dates.
@TenantRequired()
@Controller('five-s/overview')
@UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, RolesGuard, ModuleGuard)
@RequiresModule(ModuleType.FIVE_S)
@UsePipes(workValidationPipe)
export class OverviewController {
    constructor(private service: OverviewService) {}

    @Get()
    overview(@CurrentUser() user: AccessTokenPayload, @Query() query: OverviewQueryDto) {
        return this.service.overview(user, query);
    }
}
