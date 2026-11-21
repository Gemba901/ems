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
import { CreateRoutineDto, RecordRoutineCompletionDto, RoutineListQueryDto, RoutineScheduleQueryDto, UpdateRoutineDto } from '../dto/five-s.dto';
import { RoutinesService } from './routines.service';

// Sustaining routines and their completion history.
@TenantRequired()
@Controller('five-s/routines')
@UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, RolesGuard, ModuleGuard)
@RequiresModule(ModuleType.FIVE_S)
@UsePipes(workValidationPipe)
export class RoutinesController {
    constructor(private service: RoutinesService) {}

    @Get()
    list(@CurrentUser() user: AccessTokenPayload, @Query() query: RoutineListQueryDto) {
        return this.service.list(user, query);
    }

    @Get(':id')
    get(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string) {
        return this.service.get(user, id);
    }

    @Get(':id/schedule')
    schedule(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string, @Query() query: RoutineScheduleQueryDto) {
        return this.service.schedule(user, id, query);
    }

    @Post()
    create(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreateRoutineDto) {
        return this.service.create(user, dto);
    }

    @Patch(':id')
    update(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRoutineDto) {
        return this.service.update(user, id, dto);
    }

    @Post(':id/completions')
    recordCompletion(@CurrentUser() user: AccessTokenPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RecordRoutineCompletionDto) {
        return this.service.recordCompletion(user, id, dto);
    }
}
