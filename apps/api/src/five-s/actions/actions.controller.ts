import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
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
import { ActionListQueryDto, CreateActionDto, SubmitActionDto, UpdateActionDto, VerifyActionDto } from '../dto/five-s.dto';
import { ActionsService } from './actions.service';

// Improvement actions: Open -> Awaiting Verification -> Verified. Rework returns an action to Open.
@TenantRequired()
@Controller('five-s/actions')
@UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, RolesGuard, ModuleGuard)
@RequiresModule(ModuleType.FIVE_S)
@UsePipes(workValidationPipe)
export class ActionsController {
    constructor(private service: ActionsService) {}

    @Get()
    list(@CurrentUser() user: AccessTokenPayload, @Query() query: ActionListQueryDto) {
        return this.service.list(user, query);
    }

    @Get(':id')
    get(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
        return this.service.get(user, id);
    }

    @Post()
    create(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreateActionDto) {
        return this.service.create(user, dto);
    }

    @Patch(':id')
    update(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateActionDto) {
        return this.service.update(user, id, dto);
    }

    @Post(':id/submit')
    submit(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SubmitActionDto) {
        return this.service.submit(user, id, dto);
    }

    @Post(':id/verify')
    verify(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VerifyActionDto) {
        return this.service.verify(user, id, dto);
    }
}
