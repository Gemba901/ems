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
  CreateAlertDto,
  LogCorrectiveActionDto,
  CloseAlertDto,
  ReassignEscalatedTaskDto,
  ExtendEscalatedTaskDueDateDto,
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
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawToken = req.cookies?.[REFRESH_COOKIE];
    if (!rawToken) {
      res.clearCookie(REFRESH_COOKIE, { path: '/' });
      throw new UnauthorizedException('No refresh token');
    }

    const result = await this.authService.refresh(rawToken);
    res.cookie(REFRESH_COOKIE, result.refreshToken, cookieOptions);
    const { refreshToken: _, ...safeResult } = result;
    return safeResult;
  }

  @Post('auth/logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const rawToken = req.cookies?.[REFRESH_COOKIE];
    if (rawToken) {
      await this.authService.revokeRefreshToken(rawToken);
    }
    res.clearCookie(REFRESH_COOKIE, { path: '/' });
    return { message: 'Logged out' };
  }

  // --- My DWMS Endpoints ---
  @Get('myDwms/tasks')
  @UseGuards(JwtAuthGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  getMyDwmsTasks(
    @CurrentUser() user: UserPayload,
    @Query('frequency') frequency?: string,
    @Query('date') date?: string,
  ) {
    return this.dwmsService.getMyDwmsTasks(user, frequency, date);
  }

  @Get('myDwms/tasks/summary')
  @UseGuards(JwtAuthGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  getMyDwmsTaskSummary(
    @CurrentUser() user: UserPayload,
    @Query('date') date?: string,
  ) {
    return this.dwmsService.getMyDwmsTaskSummary(user, date);
  }

  @Patch('myDwms/tasks/:id/status')
  @UseGuards(JwtAuthGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  updateMyDwmsTaskStatus(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateProgressDto,
  ) {
    return this.dwmsService.updateMyDwmsTaskStatus(user, id, dto);
  }

  @Patch('myDwms/tasks/:id/acknowledgement')
  @UseGuards(JwtAuthGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  acknowledgeMyDwmsTask(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
  ) {
    return this.dwmsService.acknowledgeAssignedTask(user, id);
  }

  // --- Assigned Tasks Endpoints ---
  @Post('assignedTasks')
  @UseGuards(JwtAuthGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  createAssignedTask(
    @CurrentUser() user: UserPayload,
    @Body() dto: CreateAssignedTaskDto,
  ) {
    return this.dwmsService.createAssignedTask(user, dto);
  }

  @Get('assignedTasks/my')
  @UseGuards(JwtAuthGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  getAssignedTasksForMe(@CurrentUser() user: UserPayload) {
    return this.dwmsService.getAssignedTasksForMe(user);
  }

  @Get('assignedTasks/byMe')
  @UseGuards(JwtAuthGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  getAssignedTasksByMe(@CurrentUser() user: UserPayload) {
    return this.dwmsService.getAssignedTasksByMe(user);
  }

  @Get('approvalTasks')
  @UseGuards(JwtAuthGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  getApprovalPendingTasks(
    @CurrentUser() user: UserPayload,
    @Query('status') status?: string,
  ) {
    return this.dwmsService.getApprovalPendingTasks(user, status);
  }

  @Patch('approvalTasks/:id/approve')
  @UseGuards(JwtAuthGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  approveTask(@CurrentUser() user: UserPayload, @Param('id') id: string) {
    return this.dwmsService.approveTask(user, id);
  }

  @Patch('approvalTasks/:id/reject')
  @UseGuards(JwtAuthGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  rejectTask(@CurrentUser() user: UserPayload, @Param('id') id: string) {
    return this.dwmsService.rejectTask(user, id);
  }

  @Patch('assignedTasks/:id/acknowledge')
  @UseGuards(JwtAuthGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  acknowledgeAssignedTask(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
  ) {
    return this.dwmsService.acknowledgeAssignedTask(user, id);
  }

  @Patch('assignedTasks/:id/progress')
  @UseGuards(JwtAuthGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  updateAssignedTaskProgress(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateProgressDto,
  ) {
    return this.dwmsService.updateAssignedTaskProgress(user, id, dto);
  }

  @Patch('assignedTasks/:id/complete')
  @UseGuards(JwtAuthGuard, ModuleGuard)
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
  @UseGuards(JwtAuthGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  createAlert(@CurrentUser() user: UserPayload, @Body() dto: CreateAlertDto) {
    return this.dwmsService.createAlert(user, dto);
  }

  @Get('alerts/targets')
  @UseGuards(JwtAuthGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  getAlertTargets(@CurrentUser() user: UserPayload) {
    return this.dwmsService.getAlertTargets(user);
  }

  @Get('alerts')
  @UseGuards(JwtAuthGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  getAlerts(@CurrentUser() user: UserPayload) {
    return this.dwmsService.getAlerts(user);
  }

  @Get('alerts/myResponsibleCount')
  @UseGuards(JwtAuthGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  getMyResponsibleAlertCount(@CurrentUser() user: UserPayload) {
    return this.dwmsService.getMyResponsibleAlertCount(user);
  }

  @Patch('alerts/:id/response')
  @UseGuards(JwtAuthGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  logCorrectiveAction(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Body() dto: LogCorrectiveActionDto,
  ) {
    return this.dwmsService.logCorrectiveAction(user, id, dto.correctiveAction);
  }

  @Patch('alerts/:id/close')
  @UseGuards(JwtAuthGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  closeAlert(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Body() dto: CloseAlertDto,
  ) {
    return this.dwmsService.closeAlert(user, id, dto.closureNote);
  }

  @Post('alerts/:id/remind')
  @UseGuards(JwtAuthGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  remindAlertOwner(@CurrentUser() user: UserPayload, @Param('id') id: string) {
    return this.dwmsService.remindAlertOwner(user, id);
  }

  @Post('alerts/:id/reassign')
  @UseGuards(JwtAuthGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  reassignEscalatedTask(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Body() dto: ReassignEscalatedTaskDto,
  ) {
    return this.dwmsService.reassignEscalatedTask(user, id, dto.newOwnerId);
  }

  @Post('alerts/:id/extend-due-date')
  @UseGuards(JwtAuthGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  extendEscalatedTaskDueDate(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
    @Body() dto: ExtendEscalatedTaskDueDateDto,
  ) {
    return this.dwmsService.extendEscalatedTaskDueDate(
      user,
      id,
      dto.newDueDate,
    );
  }

  @Post('alerts/:id/escalate')
  @UseGuards(JwtAuthGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  escalateAlertFurther(
    @CurrentUser() user: UserPayload,
    @Param('id') id: string,
  ) {
    return this.dwmsService.escalateAlertFurther(user, id);
  }

  // --- Users Endpoints ---
  @Get('users')
  @UseGuards(JwtAuthGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  listUsers(@CurrentUser() user: UserPayload) {
    return this.dwmsService.listUsers(user);
  }

  @Get('users/reportees')
  @UseGuards(JwtAuthGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  listReportees(@CurrentUser() user: UserPayload) {
    return this.dwmsService.listReportees(user);
  }

  @Get('users/approvers')
  @UseGuards(JwtAuthGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  listApprovers(
    @CurrentUser() user: UserPayload,
    @Query('assignedToId') assignedToId: string,
  ) {
    return this.dwmsService.listApproverCandidates(user, assignedToId);
  }

  @Get('users/overdueAlertRecipients')
  @UseGuards(JwtAuthGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  listOverdueAlertRecipients(
    @CurrentUser() user: UserPayload,
    @Query('assignedToId') assignedToId: string,
  ) {
    return this.dwmsService.listOverdueAlertCandidates(user, assignedToId);
  }

  // --- Dashboard Endpoints ---
  @Get('dashboard/overview')
  @UseGuards(JwtAuthGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  getOverviewStats(
    @CurrentUser() user: UserPayload,
    @Query('days') days?: string,
  ) {
    return this.dwmsService.getOverviewStats(user, days);
  }

  @Get('dashboard/department/:deptId')
  @UseGuards(JwtAuthGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  getDepartmentStats(
    @CurrentUser() user: UserPayload,
    @Param('deptId') deptId: string,
    @Query('days') days?: string,
  ) {
    return this.dwmsService.getDepartmentStats(user, deptId, days);
  }

  @Get('dashboard/employee/:employeeId')
  @UseGuards(JwtAuthGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  getEmployeeStats(
    @CurrentUser() user: UserPayload,
    @Param('employeeId') employeeId: string,
    @Query('days') days?: string,
  ) {
    return this.dwmsService.getEmployeeStats(user, employeeId, days);
  }

  // --- DWMS Settings Endpoints ---
  @Get('settings')
  @UseGuards(JwtAuthGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  getDwmsSettings(@CurrentUser() user: UserPayload) {
    return this.dwmsService.getDwmsPermissionConfig(user);
  }

  @Patch('settings')
  @UseGuards(JwtAuthGuard, ModuleGuard)
  @RequiresModule(ModuleType.DWMS)
  updateDwmsSettings(
    @CurrentUser() user: UserPayload,
    @Body() dto: UpdateDwmsPermissionConfigDto,
  ) {
    return this.dwmsService.updateDwmsPermissionConfig(user, dto);
  }
}
