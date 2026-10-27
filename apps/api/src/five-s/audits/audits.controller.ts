import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards, UsePipes } from '@nestjs/common';
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
import { AuditListQueryDto, CreateAuditDto, SaveAuditResponsesDto, UpdateAuditDto } from '../dto/five-s.dto';
import { AuditsService } from './audits.service';

// 5S audits. Drafts can be saved and resumed; submission scores the audit once and locks it.
@TenantRequired()
@Controller('five-s/audits')
@UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, RolesGuard, ModuleGuard)
@RequiresModule(ModuleType.FIVE_S)
@UsePipes(workValidationPipe)
export class AuditsController {
    constructor(private audits: AuditsService) {}

    @Get()
    list(@CurrentUser() user: AccessTokenPayload, @Query() query: AuditListQueryDto) {
        return this.audits.list(user, query);
    }

    @Get(':id')
    get(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
        return this.audits.get(user, id);
    }

    @Post()
    create(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreateAuditDto) {
        return this.audits.create(user, dto);
    }

    @Patch(':id')
    update(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAuditDto) {
        return this.audits.update(user, id, dto);
    }

    @Put(':id/responses')
    saveResponses(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveAuditResponsesDto) {
        return this.audits.saveResponses(user, id, dto);
    }

    @Post(':id/submit')
    submit(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
        return this.audits.submit(user, id);
    }

    @Delete(':id')
    remove(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
        return this.audits.remove(user, id);
    }
}
