import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
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
import { workValidationPipe } from '../dto/common.dto';
import { CreateSprintDto, SprintQueryDto, UpdateSprintDto } from '../dto/sprint.dto';
import { SprintsService } from './sprints.service';

// Members can read sprints; changes need a project manager, checked in the service.
@TenantRequired()
@Controller('work')
@UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, RolesGuard, ModuleGuard)
@RequiresModule(ModuleType.WORK)
@UsePipes(workValidationPipe)
export class SprintsController {
  constructor(private sprints: SprintsService) {}

  @Get('projects/:projectId/sprints')
  list(@CurrentUser() user: AccessTokenPayload, @Param('projectId') projectId: string, @Query() query: SprintQueryDto) {
    return this.sprints.list(user, projectId, query);
  }

  @Post('projects/:projectId/sprints')
  create(@CurrentUser() user: AccessTokenPayload, @Param('projectId') projectId: string, @Body() dto: CreateSprintDto) {
    return this.sprints.create(user, projectId, dto);
  }

  @Get('sprints/:sprintId')
  get(@CurrentUser() user: AccessTokenPayload, @Param('sprintId') sprintId: string) {
    return this.sprints.get(user, sprintId);
  }

  @Patch('sprints/:sprintId')
  update(@CurrentUser() user: AccessTokenPayload, @Param('sprintId') sprintId: string, @Body() dto: UpdateSprintDto) {
    return this.sprints.update(user, sprintId, dto);
  }

  @Post('sprints/:sprintId/start')
  @HttpCode(200)
  start(@CurrentUser() user: AccessTokenPayload, @Param('sprintId') sprintId: string) {
    return this.sprints.start(user, sprintId);
  }

  @Post('sprints/:sprintId/complete')
  @HttpCode(200)
  complete(@CurrentUser() user: AccessTokenPayload, @Param('sprintId') sprintId: string) {
    return this.sprints.complete(user, sprintId);
  }
}
