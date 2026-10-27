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
import { CreateRedTagDto, RedTagDecisionDto, RedTagListQueryDto, ResolveRedTagDto, UpdateRedTagDto } from '../dto/five-s.dto';
import { RedTagsService } from './red-tags.service';

// Red-tag register. Never deletes asset or inventory records.
@TenantRequired()
@Controller('five-s/red-tags')
@UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, RolesGuard, ModuleGuard)
@RequiresModule(ModuleType.FIVE_S)
@UsePipes(workValidationPipe)
export class RedTagsController {
    constructor(private service: RedTagsService) {}

    @Get()
    list(@CurrentUser() user: AccessTokenPayload, @Query() query: RedTagListQueryDto) {
        return this.service.list(user, query);
    }

    @Get(':id')
    get(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
        return this.service.get(user, id);
    }

    @Post()
    create(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreateRedTagDto) {
        return this.service.create(user, dto);
    }

    @Patch(':id')
    update(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRedTagDto) {
        return this.service.update(user, id, dto);
    }

    @Post(':id/decision')
    decide(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RedTagDecisionDto) {
        return this.service.decide(user, id, dto);
    }

    @Post(':id/resolve')
    resolve(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ResolveRedTagDto) {
        return this.service.resolve(user, id, dto);
    }
}
