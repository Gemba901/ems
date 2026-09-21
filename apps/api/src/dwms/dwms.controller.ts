import { TenantRequired } from 'src/tenancy/tenant-route.decorator';
import { TrustedTenantContextGuard } from 'src/tenancy/trusted-tenant-context.guard';
import { TenantGuard } from 'src/tenancy/tenant.guard';
import type { TenantRequest } from 'src/tenancy/tenant-context';
import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ModuleType } from 'db';
import { DwmsService, UserPayload } from './dwms.service';
import { AuthService } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ModuleGuard } from '../auth/guards/module.guard';
import { RequiresModule } from '../auth/decorators/module.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  CreateAssignedTaskDto,
  UpdateProgressDto,
  CompleteAssignedTaskDto,
  CreateTaskInstanceCommentDto,
  TaskApprovalActionDto,
  CreateAlertDto,
  CreateAlertCommentDto,
  AcknowledgeAlertOccurrenceDto,
  CreateActivityDto,
  UpdateActivityDto,
  CreateTaskFromActivityDto,
  IngestActivitiesDto,
  UpdateEmployeeActivityAssignmentDto,
} from './dto/dwms.dto';
import { UpdateDwmsPermissionConfigDto } from './dto/dwmsSettings.dto';

const REFRESH_COOKIE = 'refresh_token';
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  path: '/',
};

@Controller('dwms')
@RequiresModule(ModuleType.DWMS)
export class DwmsController {
  constructor(
    private dwmsService: DwmsService,
    private authService: AuthService,
  ) {}

  @Get('status')
  status() {
    return { message: 'API v1 OK' };
  }

  // --- Auth Proxy Endpoints ---
  @Post('auth/refresh')
  @TenantRequired()
  @UseGuards(TrustedTenantContextGuard)
  async refresh(
    @Req() req: TenantRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawToken = req.cookies?.[REFRESH_COOKIE];
    if (!rawToken) {
      res.clearCookie(REFRESH_COOKIE, { path: '/' });
      throw new UnauthorizedException('No refresh token');
    }

    const result = await this.authService.refreshForTenant(req.tenant!, rawToken);
    res.cookie(REFRESH_COOKIE, result.refreshToken, cookieOptions);
    const { refreshToken: _, ...safeResult } = result;
    return safeResult;
  }

  @Post('auth/logout')
  @TenantRequired()
  @UseGuards(TrustedTenantContextGuard)
  async logout(@Req() req: TenantRequest, @Res({ passthrough: true }) res: Response) {
    const rawToken = req.cookies?.[REFRESH_COOKIE];
    if (rawToken) {
      await this.authService.revokeRefreshTokenForTenant(req.tenant!, rawToken);
    }
    res.clearCookie(REFRESH_COOKIE, { path: '/' });
    return { message: 'Logged out' };
  }

  // --- My DWMS Endpoints ---
  @Get('myDwms/tasks')
  @TenantRequired()
  @UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  getMyDwmsTasks(
    @CurrentUser() user: UserPayload,
    @Query('frequency') frequency?: string,
    @Query('date') date?: string,
    @Query('scope') scope?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('source') source?: string,
  ) {
    return this.dwmsService.getMyDwmsTasks(
      user,
      frequency,
      date,
      scope,
      page,
      limit,
      source,
    );
  }

  @Get('myDwms/tasks/summary')
  @TenantRequired()
  @UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  getMyDwmsTaskSummary(
    @CurrentUser() user: UserPayload,
    @Query('date') date?: string,
    @Query('source') source?: string,
  ) {
    return this.dwmsService.getMyDwmsTaskSummary(user, date, source);
  }

  @Get('myDwms/tasks/:id')
  @TenantRequired()
  @UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  getMyDwmsTaskInstanceDetail(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
  ) {
    return this.dwmsService.getMyDwmsTaskInstanceDetail(user, id);
  }

  @Patch('myDwms/tasks/:id/status')
  @TenantRequired()
  @UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  updateMyDwmsTaskStatus(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateProgressDto,
  ) {
    return this.dwmsService.updateMyDwmsTaskStatus(user, id, dto);
  }

  @Post('myDwms/tasks/:id/comments')
  @TenantRequired()
  @UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  addMyDwmsTaskComment(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Body() dto: CreateTaskInstanceCommentDto,
  ) {
    return this.dwmsService.addMyDwmsTaskComment(user, id, dto);
  }

  @Patch('myDwms/tasks/:id/acknowledgement')
  @TenantRequired()
  @UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  acknowledgeMyDwmsTask(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
  ) {
    return this.dwmsService.acknowledgeAssignedTask(user, id);
  }

  // --- Activities Endpoints ---
  @Get('activities')
  @TenantRequired()
  @UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, ModuleGuard)
  listActivities(
    @CurrentUser() user: UserPayload,
    @Query('status') status?: string,
  ) {
    return this.dwmsService.listActivities(user, status);
  }

  @Get('activities/ingestions')
  @TenantRequired()
  @UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, ModuleGuard)
  listActivityIngestions(@CurrentUser() user: UserPayload) {
    return this.dwmsService.listActivityIngestions(user);
  }

  @Get('activities/ingestions/:id')
  @TenantRequired()
  @UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, ModuleGuard)
  getActivityIngestion(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
  ) {
    return this.dwmsService.getActivityIngestion(user, id);
  }

  @Get('activities/:id')
  @TenantRequired()
  @UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, ModuleGuard)
  getActivity(@CurrentUser() user: UserPayload, @Param('id') id: string) {
    return this.dwmsService.getActivity(user, id);
  }

  @Post('activities')
  @TenantRequired()
  @UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, ModuleGuard)
  createActivity(
    @CurrentUser() user: UserPayload,
    @Body() dto: CreateActivityDto,
  ) {
    return this.dwmsService.createActivity(user, dto);
  }

  @Post('activities/ingest')
  @TenantRequired()
  @UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, ModuleGuard)
  ingestActivities(
    @CurrentUser() user: UserPayload,
    @Body() dto: IngestActivitiesDto,
  ) {
    return this.dwmsService.ingestActivities(user, dto);
  }

  @Patch('activities/:id')
  @TenantRequired()
  @UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, ModuleGuard)
  updateActivity(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateActivityDto,
  ) {
    return this.dwmsService.updateActivity(user, id, dto);
  }

  @Patch('activities/:id/archive')
  @TenantRequired()
  @UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, ModuleGuard)
  archiveActivity(@CurrentUser() user: UserPayload, @Param('id') id: string) {
    return this.dwmsService.archiveActivity(user, id);
  }

  @Post('activities/:id/tasks')
  @TenantRequired()
  @UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, ModuleGuard)
  createTaskFromActivity(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Body() dto: CreateTaskFromActivityDto,
  ) {
    return this.dwmsService.createTaskFromActivity(user, id, dto);
  }

  @Get('employees/:employeeId/profile')
  @TenantRequired()
  @UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  getEmployeeDwmsProfile(
    @CurrentUser() user: UserPayload,
    @Param('employeeId') employeeId: string,
    @Query('routinePage') routinePage?: string,
    @Query('assignedPage') assignedPage?: string,
    @Query('currentAlertPage') currentAlertPage?: string,
    @Query('abnormalityPage') abnormalityPage?: string,
  ) {
    return this.dwmsService.getEmployeeDwmsProfile(user, employeeId, {
      routinePage: Number(routinePage) || 1,
      assignedPage: Number(assignedPage) || 1,
      currentAlertPage: Number(currentAlertPage) || 1,
      abnormalityPage: Number(abnormalityPage) || 1,
    });
  }
  @Get('employees/:employeeId/activities')
  @TenantRequired()
  @UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  listEmployeeRoleActivities(
    @CurrentUser() user: UserPayload,
    @Param('employeeId') employeeId: string,
  ) {
    return this.dwmsService.listEmployeeRoleActivities(user, employeeId);
  }

  @Patch('employees/:employeeId/activities/:activityId')
  @TenantRequired()
  @UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  updateEmployeeActivityAssignment(
    @CurrentUser() user: UserPayload,
    @Param('employeeId') employeeId: string,
    @Param('activityId') activityId: string,
    @Body() dto: UpdateEmployeeActivityAssignmentDto,
  ) {
    return this.dwmsService.updateEmployeeActivityAssignment(
      user,
      employeeId,
      activityId,
      dto,
    );
  }
  // --- Assigned Tasks Endpoints ---
  @Post('assignedTasks')
  @TenantRequired()
  @UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  createAssignedTask(
    @CurrentUser() user: UserPayload,
    @Body() dto: CreateAssignedTaskDto,
  ) {
    return this.dwmsService.createAssignedTask(user, dto);
  }

  @Get('assignedTasks/my')
  @TenantRequired()
  @UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  getAssignedTasksForMe(@CurrentUser() user: UserPayload) {
    return this.dwmsService.getAssignedTasksForMe(user);
  }

  @Get('assignedTasks/byMe')
  @TenantRequired()
  @UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  getAssignedTasksByMe(@CurrentUser() user: UserPayload) {
    return this.dwmsService.getAssignedTasksByMe(user);
  }

  @Get('approvalTasks')
  @TenantRequired()
  @UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  getApprovalPendingTasks(
    @CurrentUser() user: UserPayload,
    @Query('status') status?: string,
  ) {
    return this.dwmsService.getApprovalPendingTasks(user, status);
  }

  @Patch('approvalTasks/:id/approve')
  @TenantRequired()
  @UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  approveTask(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Body() dto: TaskApprovalActionDto = {},
  ) {
    return this.dwmsService.approveTask(user, id, dto);
  }

  @Patch('approvalTasks/:id/reject')
  @TenantRequired()
  @UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  rejectTask(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Body() dto: TaskApprovalActionDto = {},
  ) {
    return this.dwmsService.rejectTask(user, id, dto);
  }

  @Patch('assignedTasks/:id/acknowledge')
  @TenantRequired()
  @UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  acknowledgeAssignedTask(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
  ) {
    return this.dwmsService.acknowledgeAssignedTask(user, id);
  }

  @Patch('assignedTasks/:id/progress')
  @TenantRequired()
  @UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  updateAssignedTaskProgress(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateProgressDto,
  ) {
    return this.dwmsService.updateAssignedTaskProgress(user, id, dto);
  }

  @Patch('assignedTasks/:id/complete')
  @TenantRequired()
  @UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  completeAssignedTask(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Body() dto: CompleteAssignedTaskDto,
  ) {
    return this.dwmsService.completeAssignedTask(user, id, dto);
  }

  // --- Alerts Endpoints ---
  @Post('alerts')
  @TenantRequired()
  @UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  createAlert(@CurrentUser() user: UserPayload, @Body() dto: CreateAlertDto) {
    return this.dwmsService.createAlert(user, dto);
  }

  @Get('alerts/targets')
  @TenantRequired()
  @UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  getAlertTargets(@CurrentUser() user: UserPayload) {
    return this.dwmsService.getAlertTargets(user);
  }

  @Get('alerts')
  @TenantRequired()
  @UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  getAlerts(
    @CurrentUser() user: UserPayload,
    @Query('tab') tab?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('severity') severity?: string,
    @Query('search') search?: string,
  ) {
    return this.dwmsService.getAlerts(
      user,
      tab,
      page,
      limit,
      status,
      severity,
      search,
    );
  }

  @Get('alerts/myCount')
  @TenantRequired()
  @UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  getMyAlertCount(@CurrentUser() user: UserPayload) {
    return this.dwmsService.getMyAlertCount(user);
  }

  @Get('alerts/:id')
  @TenantRequired()
  @UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  getAlertDetail(@CurrentUser() user: UserPayload, @Param('id') id: string) {
    return this.dwmsService.getAlertDetail(user, id);
  }

  @Post('alerts/:id/comments')
  @TenantRequired()
  @UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  addAlertComment(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Body() dto: CreateAlertCommentDto,
  ) {
    return this.dwmsService.addAlertComment(user, id, dto);
  }
  @Get('alerts/history/:targetId')
  @TenantRequired()
  @UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  getAlertHistories(
    @CurrentUser() user: UserPayload,
    @Param('targetId') targetId: string,
    @Query('targetType') targetType: string,
  ) {
    return this.dwmsService.getAlertHistories(user, targetType, targetId);
  }

  @Post('alerts/:id/raise-again')
  @TenantRequired()
  @UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  raiseAlertAgain(@CurrentUser() user: UserPayload, @Param('id') id: string) {
    return this.dwmsService.raiseAlertAgain(user, id);
  }

  @Post('alerts/:id/occurrences/:occurrenceId/acknowledge')
  @TenantRequired()
  @UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  acknowledgeAlertOccurrence(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Param('occurrenceId') occurrenceId: string,
    @Body() dto: AcknowledgeAlertOccurrenceDto,
  ) {
    return this.dwmsService.acknowledgeAlertOccurrence(user, id, occurrenceId, dto);
  }

  // --- Users Endpoints ---
  @Get('users')
  @TenantRequired()
  @UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  listUsers(@CurrentUser() user: UserPayload) {
    return this.dwmsService.listUsers(user);
  }

  @Get('users/reportees')
  @TenantRequired()
  @UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  listReportees(@CurrentUser() user: UserPayload) {
    return this.dwmsService.listReportees(user);
  }

  @Get('users/approvers')
  @TenantRequired()
  @UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  listApprovers(
    @CurrentUser() user: UserPayload,
    @Query('assignedToId') assignedToId: string,
  ) {
    return this.dwmsService.listApproverCandidates(user, assignedToId);
  }


  // --- Dashboard Endpoints ---
  @Get('dashboard/overview')
  @TenantRequired()
  @UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  getOverviewStats(
    @CurrentUser() user: UserPayload,
    @Query('days') days?: string,
  ) {
    return this.dwmsService.getOverviewStats(user, days);
  }

  @Get('dashboard/department/:deptId')
  @TenantRequired()
  @UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  getDepartmentStats(
    @CurrentUser() user: UserPayload,
    @Param('deptId') deptId: string,
    @Query('days') days?: string,
  ) {
    return this.dwmsService.getDepartmentStats(user, deptId, days);
  }

  @Get('dashboard/employee/:employeeId')
  @TenantRequired()
  @UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  getEmployeeStats(
    @CurrentUser() user: UserPayload,
    @Param('employeeId') employeeId: string,
    @Query('days') days?: string,
  ) {
    return this.dwmsService.getEmployeeStats(user, employeeId, days);
  }

  // --- DWMS Settings Endpoints ---
  @Get('access')
  @TenantRequired()
  @UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  getDwmsAccess(@CurrentUser() user: UserPayload) {
    return this.dwmsService.getDwmsAccessCapabilities(user);
  }

  @Get('settings')
  @TenantRequired()
  @UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  getDwmsSettings(@CurrentUser() user: UserPayload) {
    return this.dwmsService.getDwmsPermissionConfig(user);
  }

  @Patch('settings')
  @TenantRequired()
  @UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  updateDwmsSettings(
    @CurrentUser() user: UserPayload,
    @Body() dto: UpdateDwmsPermissionConfigDto,
  ) {
    return this.dwmsService.updateDwmsPermissionConfig(user, dto);
  }
}
