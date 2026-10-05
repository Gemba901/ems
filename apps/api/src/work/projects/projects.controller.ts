import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
import { ModuleType } from 'db';
import type { AccessTokenPayload } from 'src/auth/access-token-payload';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { RequiresModule } from 'src/auth/decorators/module.decorator';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { ModuleGuard } from 'src/auth/guards/module.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { TenantGuard } from 'src/tenancy/tenant.guard';
import { TenantRequired } from 'src/tenancy/tenant-route.decorator';
import { TrustedTenantContextGuard } from 'src/tenancy/trusted-tenant-context.guard';
import { PageQueryDto, workValidationPipe } from '../dto/common.dto';
import { CreateProjectDto, UpdateProjectDto } from '../dto/project.dto';
import { PROJECT_CREATOR_ROLES } from '../work-access.policy';
import { ProjectsService } from './projects.service';

@TenantRequired()
@Controller('work/projects')
@UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, RolesGuard, ModuleGuard)
@RequiresModule(ModuleType.WORK)
@UsePipes(workValidationPipe)
export class ProjectsController {
  constructor(private projects: ProjectsService) {}

  @Get()
  list(@CurrentUser() user: AccessTokenPayload, @Query() query: PageQueryDto) {
    return this.projects.list(user, query);
  }

  @Post()
  @Roles(...PROJECT_CREATOR_ROLES)
  create(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreateProjectDto) {
    return this.projects.create(user, dto);
  }

  @Get(':projectId')
  get(@CurrentUser() user: AccessTokenPayload, @Param('projectId') projectId: string) {
    return this.projects.get(user, projectId);
  }

  // Project managers are per-project, so the service checks canManage.
  @Patch(':projectId')
  update(@CurrentUser() user: AccessTokenPayload, @Param('projectId') projectId: string, @Body() dto: UpdateProjectDto) {
    return this.projects.update(user, projectId, dto);
  }
}
