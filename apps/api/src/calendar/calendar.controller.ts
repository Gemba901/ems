import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  UseGuards, Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CalendarService } from './calendar.service';
import {
  CreateVisitDto, UpdateVisitDto, CreateVisitRequestDto, RespondToRequestDto,
  CreateCalendarBlockDto, AddVisitAttendeeDto,
  UpcomingVisitsQueryDto, AnalyticsQueryDto, IcalQueryDto,
} from './dto/calendar.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { Role } from 'src/common/enum/role.enum';

@Controller('calendar')
@UseGuards(JwtAuthGuard, RolesGuard)
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
  ) {
    return this.calendar.respondToRequest(id, dto);
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
}
