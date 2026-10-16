import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
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
import { CreateStandardDto, StandardListQueryDto, UpdateStandardDto } from '../dto/five-s.dto';
import { StandardsService } from './standards.service';

// Area standards with revisions and approval.
@TenantRequired()
@Controller('five-s/standards')
@UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, RolesGuard, ModuleGuard)
@RequiresModule(ModuleType.FIVE_S)
@UsePipes(workValidationPipe)
export class StandardsController {
    constructor(private service: StandardsService) {}

    @Get()
    list(@CurrentUser() user: AccessTokenPayload, @Query() query: StandardListQueryDto) {
        return this.service.list(user, query);
    }

    @Get(':id')
    get(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
        return this.service.get(user, id);
    }

    @Post()
    create(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreateStandardDto) {
        return this.service.create(user, dto);
    }

    @Patch(':id')
    update(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStandardDto) {
        return this.service.update(user, id, dto);
    }

    @Post(':id/approve')
    approve(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
        return this.service.approve(user, id);
    }

    @Post(':id/revise')
    revise(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
        return this.service.revise(user, id);
    }

    @Delete(':id')
    remove(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
        return this.service.removeDraft(user, id);
    }
}
