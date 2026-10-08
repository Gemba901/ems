import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
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
import { PageQueryDto, workValidationPipe } from '../dto/common.dto';
import { CreateCommentDto, CreateTaskDto, MyTasksQueryDto, ProjectTaskQueryDto, UpdateTaskDto } from '../dto/task.dto';
import { TasksService } from './tasks.service';

// Access is per project membership, checked in the service on every call.
@TenantRequired()
@Controller('work')
@UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, RolesGuard, ModuleGuard)
@RequiresModule(ModuleType.WORK)
@UsePipes(workValidationPipe)
export class TasksController {
  constructor(private tasks: TasksService) {}

  @Get('my-tasks')
  myTasks(@CurrentUser() user: AccessTokenPayload, @Query() query: MyTasksQueryDto) {
    return this.tasks.myTasks(user, query);
  }

  @Get('projects/:projectId/tasks')
  listForProject(
    @CurrentUser() user: AccessTokenPayload,
    @Param('projectId') projectId: string,
    @Query() query: ProjectTaskQueryDto,
  ) {
    return this.tasks.listForProject(user, projectId, query);
  }

  @Post('projects/:projectId/tasks')
  create(@CurrentUser() user: AccessTokenPayload, @Param('projectId') projectId: string, @Body() dto: CreateTaskDto) {
    return this.tasks.create(user, projectId, dto);
  }

  @Get('tasks/:taskId')
  get(@CurrentUser() user: AccessTokenPayload, @Param('taskId') taskId: string) {
    return this.tasks.get(user, taskId);
  }

  @Patch('tasks/:taskId')
  update(@CurrentUser() user: AccessTokenPayload, @Param('taskId') taskId: string, @Body() dto: UpdateTaskDto) {
    return this.tasks.update(user, taskId, dto);
  }

  @Get('tasks/:taskId/comments')
  listComments(@CurrentUser() user: AccessTokenPayload, @Param('taskId') taskId: string, @Query() query: PageQueryDto) {
    return this.tasks.listComments(user, taskId, query);
  }

  @Post('tasks/:taskId/comments')
  addComment(@CurrentUser() user: AccessTokenPayload, @Param('taskId') taskId: string, @Body() dto: CreateCommentDto) {
    return this.tasks.addComment(user, taskId, dto);
  }
}
