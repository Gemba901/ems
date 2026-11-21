import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
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
import { AssignResponsibilityDto, ChangeLogQueryDto, DirectoryQueryDto } from '../dto/five-s.dto';
import { FiveSSettingsService } from './settings.service';

// Capabilities, people directory, responsibilities, change log and sample data.
@TenantRequired()
@Controller('five-s')
@UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, RolesGuard, ModuleGuard)
@RequiresModule(ModuleType.FIVE_S)
@UsePipes(workValidationPipe)
export class FiveSSettingsController {
    constructor(private service: FiveSSettingsService) {}

    @Get('me/capabilities')
    capabilities(@CurrentUser() user: AccessTokenPayload) {
        return this.service.capabilities(user);
    }

    @Get('directory')
    directory(@CurrentUser() user: AccessTokenPayload, @Query() query: DirectoryQueryDto) {
        return this.service.directory(user, query);
    }

    @Get('settings/responsibilities')
    responsibilities(@CurrentUser() user: AccessTokenPayload) {
        return this.service.responsibilities(user);
    }

    @Post('settings/responsibilities')
    assign(@CurrentUser() user: AccessTokenPayload, @Body() dto: AssignResponsibilityDto) {
        return this.service.assign(user, dto);
    }

    @Delete('settings/responsibilities/:id')
    unassign(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
        return this.service.unassign(user, id);
    }

    @Get('settings/change-log')
    changeLog(@CurrentUser() user: AccessTokenPayload, @Query() query: ChangeLogQueryDto) {
        return this.service.changeLog(user, query);
    }

    @Get('settings/sample-data')
    sampleStatus(@CurrentUser() user: AccessTokenPayload) {
        return this.service.sampleStatus(user);
    }

    @Post('settings/sample-data')
    addSampleData(@CurrentUser() user: AccessTokenPayload) {
        return this.service.addSampleData(user);
    }

    @Delete('settings/sample-data')
    removeSampleData(@CurrentUser() user: AccessTokenPayload) {
        return this.service.removeSampleData(user);
    }
}
