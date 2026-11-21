import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ModuleType } from 'db';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { RequiresModule } from 'src/auth/decorators/module.decorator';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { ModuleGuard } from 'src/auth/guards/module.guard';
import type { UserPayload } from 'src/dwms/dwms.service';
import { TenantRequired } from 'src/tenancy/tenant-route.decorator';
import { TenantGuard } from 'src/tenancy/tenant.guard';
import { TrustedTenantContextGuard } from 'src/tenancy/trusted-tenant-context.guard';
import { AlertImprovementsService } from './alert-improvements.service';
import { RaiseFromAlertDto } from './dto/kaizen.dto';

// Join 10: "Raise Kaizen" / "Raise SGA" on a DWMS alert. Lives with Kaizen because DWMS cannot
// import Kaizen or SGA (they import DWMS for the task bridge).
@TenantRequired()
@Controller('dwms/alerts')
@UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, ModuleGuard)
export class AlertImprovementsController {
    constructor(private service: AlertImprovementsService) {}

    @Post(':id/kaizen')
    @RequiresModule(ModuleType.KAIZEN)
    raiseKaizen(@CurrentUser() user: UserPayload, @Param('id') id: string, @Body() dto: RaiseFromAlertDto) {
        return this.service.raiseKaizen(user, id, dto);
    }

    @Post(':id/sga')
    @RequiresModule(ModuleType.SGA)
    raiseSga(@CurrentUser() user: UserPayload, @Param('id') id: string, @Body() dto: RaiseFromAlertDto) {
        return this.service.raiseSga(user, id, dto);
    }
}
