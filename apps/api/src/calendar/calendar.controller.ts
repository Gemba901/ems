import {
  Controller, Get, Post, Patch, Put, Delete, Body, Param, Query,
  UseGuards, Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CalendarService } from './calendar.service';
import {
  CreateVisitDto, UpdateVisitDto, CreateVisitRequestDto, RespondToRequestDto,
  CreateCalendarBlockDto, AddVisitAttendeeDto,
  UpcomingVisitsQueryDto, AnalyticsQueryDto, IcalQueryDto,
  CreateCalendarEventDto, UpdateCalendarEventDto, RespondToInvitationDto,
  GetEventsQueryDto, CheckAvailabilityQueryDto, DeleteEventQueryDto, InvitationLogQueryDto,
  UpsertVisitMonthPlanDto, UpdateVisitPlanSlotDto, VisitMonthPlanQueryDto,
} from './dto/calendar.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { ModuleGuard } from 'src/auth/guards/module.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { RequiresModule } from 'src/auth/decorators/module.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { Role } from 'src/common/enum/role.enum';
import { ModuleType } from 'db';

@Controller('calendar')
@UseGuards(JwtAuthGuard, RolesGuard, ModuleGuard)
@RequiresModule(ModuleType.CALENDAR)
export class CalendarController {
  constructor(private calendar: CalendarService) {}

  // ── Month visits ─────────────────────────────────────────────────────────

  @Get('visits')
  async getMonthVisits(
    @Query('year') year: string,
    @Query('month') month: string,
    @Query('clientOrgId') clientOrgId: string | undefined,
    @CurrentUser() user: { organizationId: string; roleLevel: string },
  ) {
    const y = year  ? parseInt(year,  10) : new Date().getFullYear();
    const m = month ? parseInt(month, 10) : new Date().getMonth() + 1;
    return this.calendar.getMonthVisits(y, m, user.organizationId, user.roleLevel, clientOrgId);
  }

  // ── CRUD visits ──────────────────────────────────────────────────────────

  @Post('visits')
  @Roles(Role.SUPER_ADMIN)
  async createVisit(
    @Body() dto: CreateVisitDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.calendar.createVisit(dto, user.userId);
  }

  @Patch('visits/:id')
  @Roles(Role.SUPER_ADMIN)
  async updateVisit(@Param('id') id: string, @Body() dto: UpdateVisitDto) {
    return this.calendar.updateVisit(id, dto);
  }

  @Delete('visits/:id')
  @Roles(Role.SUPER_ADMIN)
  async deleteVisit(@Param('id') id: string) {
    return this.calendar.deleteVisit(id);
  }

  // ── Attendees ────────────────────────────────────────────────────────────

  @Post('visits/:id/attendees')
  @Roles(Role.SUPER_ADMIN)
  async addAttendee(
    @Param('id') visitId: string,
    @Body() dto: AddVisitAttendeeDto,
  ) {
    return this.calendar.addAttendee(visitId, dto);
  }

  @Delete('visits/:id/attendees/:employeeId')
  @Roles(Role.SUPER_ADMIN)
  async removeAttendee(
    @Param('id') visitId: string,
    @Param('employeeId') employeeId: string,
  ) {
    return this.calendar.removeAttendee(visitId, employeeId);
  }

  // ── Visit requests ───────────────────────────────────────────────────────

  @Get('requests')
  async getRequests(
    @CurrentUser() user: { organizationId: string; roleLevel: string },
  ) {
    return this.calendar.getRequests(user.organizationId, user.roleLevel);
  }

  @Post('requests')
  async createRequest(
    @Body() dto: CreateVisitRequestDto,
    @CurrentUser() user: { organizationId: string; userId: string },
  ) {
    return this.calendar.createRequest(dto, user.organizationId, user.userId);
  }

  @Patch('requests/:id/respond')
  @Roles(Role.SUPER_ADMIN)
  async respondToRequest(
    @Param('id') id: string,
    @Body() dto: RespondToRequestDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.calendar.respondToRequest(id, dto, user.userId);
  }

  // ── Upcoming visits widget ───────────────────────────────────────────────

  @Get('upcoming')
  async getUpcoming(
    @Query() query: UpcomingVisitsQueryDto,
    @CurrentUser() user: { organizationId: string; roleLevel: string },
  ) {
    return this.calendar.getUpcomingVisits(user.organizationId, user.roleLevel, query.limit ?? 5);
  }

  // ── iCal export ──────────────────────────────────────────────────────────

  @Get('export/ical')
  async exportIcal(
    @Query() query: IcalQueryDto,
    @CurrentUser() user: { organizationId: string; roleLevel: string },
    @Res() res: Response,
  ) {
    const year  = query.year  ?? new Date().getFullYear();
    const month = query.month;
    const ical  = await this.calendar.getIcalExport(year, month, user.organizationId, user.roleLevel);
    const filename = month
      ? `visits-${year}-${String(month).padStart(2, '0')}.ics`
      : `visits-${year}.ics`;
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(ical);
  }

  // ── Analytics ────────────────────────────────────────────────────────────

  @Get('analytics')
  async getAnalytics(
    @Query() query: AnalyticsQueryDto,
    @CurrentUser() user: { organizationId: string; roleLevel: string },
  ) {
    const year = query.year ?? new Date().getFullYear();
    return this.calendar.getAnalytics(year, user.organizationId, user.roleLevel);
  }

  // ── Orgs / employees ─────────────────────────────────────────────────────

  @Get('organizations')
  @Roles(Role.SUPER_ADMIN)
  async getOrganizations() {
    return this.calendar.getClientOrganizations();
  }

  @Get('organizations/:orgId/employees')
  @Roles(Role.SUPER_ADMIN)
  async getOrgEmployees(@Param('orgId') orgId: string) {
    return this.calendar.getOrgEmployees(orgId);
  }

  @Get('admin-org')
  async getAdminOrg() {
    return this.calendar.getAdminOrg();
  }

  // ── Calendar blocks ──────────────────────────────────────────────────────

  @Post('blocks')
  @Roles(Role.SUPER_ADMIN)
  async createBlock(
    @Body() dto: CreateCalendarBlockDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.calendar.createBlock(dto, user.userId);
  }

  @Delete('blocks/:id')
  @Roles(Role.SUPER_ADMIN)
  async deleteBlock(@Param('id') id: string) {
    return this.calendar.deleteBlock(id);
  }

  // ── Unified agenda (events + visits + requests + blocks, one grid) ─────────

  @Get('agenda')
  async getAgenda(
    @Query() query: GetEventsQueryDto,
    @CurrentUser() user: { userId: string; organizationId: string; roleLevel: string },
  ) {
    return this.calendar.getAgenda(query.year, query.month, user.userId, user.organizationId, user.roleLevel);
  }

  // ── Holistic Calendar ──────────────────────────────────────────────────────

  @Get('events')
  async getEvents(
    @Query() query: GetEventsQueryDto,
    @CurrentUser() user: { userId: string; organizationId: string },
  ) {
    return this.calendar.getEvents(query.year, query.month, user.userId, user.organizationId);
  }

  @Post('events')
  async createEvent(
    @Body() dto: CreateCalendarEventDto,
    @CurrentUser() user: { userId: string; organizationId: string; roleLevel: string },
  ) {
    return this.calendar.createEvent(dto, user.userId, user.organizationId, user.roleLevel);
  }

  @Patch('events/:id')
  async updateEvent(
    @Param('id') id: string,
    @Body() dto: UpdateCalendarEventDto,
    @CurrentUser() user: { userId: string; organizationId: string; roleLevel: string },
  ) {
    return this.calendar.updateEvent(id, dto, user.userId, user.organizationId, user.roleLevel);
  }

  @Delete('events/:id')
  async deleteEvent(
    @Param('id') id: string,
    @Query() query: DeleteEventQueryDto,
    @CurrentUser() user: { userId: string; organizationId: string },
  ) {
    return this.calendar.deleteEvent(id, query.deleteMode, user.userId, user.organizationId);
  }

  @Get('events/invitations')
  async getMyInvitations(
    @CurrentUser() user: { userId: string; organizationId: string },
  ) {
    return this.calendar.getMyInvitations(user.userId, user.organizationId);
  }

  @Post('events/:id/respond')
  async respondToInvitation(
    @Param('id') eventId: string,
    @Body() dto: RespondToInvitationDto,
    @CurrentUser() user: { userId: string; organizationId: string },
  ) {
    return this.calendar.respondToInvitation(eventId, dto.status, user.userId, user.organizationId);
  }

  @Get('availability')
  async checkAvailability(@Query() query: CheckAvailabilityQueryDto) {
    return this.calendar.checkAvailability(query.employeeId, query.startAt, query.endAt);
  }

  @Get('org-employees')
  async getOrgEmployeesForInvite(
    @CurrentUser() user: { organizationId: string },
  ) {
    return this.calendar.getOrgEmployeesForInvite(user.organizationId);
  }

  @Get('employees/:id/stats')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HR)
  async getEmployeeEventStats(@Param('id') employeeId: string) {
    return this.calendar.getEmployeeEventStats(employeeId);
  }

  @Get('employees/:id/invitation-log')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HR)
  async getEmployeeInvitationLog(
    @Param('id') employeeId: string,
    @Query() query: InvitationLogQueryDto,
  ) {
    return this.calendar.getEmployeeInvitationLog(employeeId, query.page ?? 1, query.limit ?? 20);
  }

  // ── Visit Month Plans ─────────────────────────────────────────────────────

  @Get('visit-plans')
  @Roles(Role.SUPER_ADMIN)
  async getVisitMonthPlan(@Query() query: VisitMonthPlanQueryDto) {
    return this.calendar.getVisitMonthPlan(query.clientOrgId, query.year, query.month);
  }

  @Get('visit-plans/all')
  @Roles(Role.SUPER_ADMIN)
  async getAllVisitMonthPlans(
    @Query('year') year: string,
    @Query('month') month: string,
  ) {
    const y = year  ? parseInt(year,  10) : new Date().getFullYear();
    const m = month ? parseInt(month, 10) : new Date().getMonth() + 1;
    return this.calendar.getAllVisitMonthPlans(y, m);
  }

  @Put('visit-plans')
  @Roles(Role.SUPER_ADMIN)
  async upsertVisitMonthPlan(
    @Body() dto: UpsertVisitMonthPlanDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.calendar.upsertVisitMonthPlan(dto.clientOrgId, dto.year, dto.month, dto.plannedDays, user.userId);
  }

  @Patch('visit-plans/:planId/slots/:slotIndex')
  @Roles(Role.SUPER_ADMIN)
  async updateVisitPlanSlot(
    @Param('planId') planId: string,
    @Param('slotIndex') slotIndex: string,
    @Body() dto: UpdateVisitPlanSlotDto,
  ) {
    return this.calendar.updateVisitPlanSlot(planId, parseInt(slotIndex, 10), dto);
  }
}
