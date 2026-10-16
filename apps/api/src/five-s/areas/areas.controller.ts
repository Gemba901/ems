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
import { AreaListQueryDto, CreateAreaDto, UpdateAreaDto } from '../dto/five-s.dto';
import { AreasService } from './areas.service';

// Workplace areas. Who may see or change an area is decided in FiveSAccessService.
@TenantRequired()
@Controller('five-s/areas')
@UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, RolesGuard, ModuleGuard)
@RequiresModule(ModuleType.FIVE_S)
@UsePipes(workValidationPipe)
export class AreasController {
    constructor(private areas: AreasService) {}

    @Get()
    list(@CurrentUser() user: AccessTokenPayload, @Query() query: AreaListQueryDto) {
        return this.areas.list(user, query);
    }

    @Get(':id')
    get(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
        return this.areas.get(user, id);
    }

    @Post()
    create(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreateAreaDto) {
        return this.areas.create(user, dto);
    }

    @Patch(':id')
    update(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAreaDto) {
        return this.areas.update(user, id, dto);
    }
}
