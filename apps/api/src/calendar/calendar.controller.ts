import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { CalendarService } from './calendar.service';
import {
  CreateVisitDto, UpdateVisitDto, CreateVisitRequestDto, RespondToRequestDto,
  CreateCalendarBlockDto,
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

  /** GET /calendar/visits?year=2026&month=5 — privacy-aware month view */
  @Get('visits')
  async getMonthVisits(
    @Query('year') year: string,
    @Query('month') month: string,
    @CurrentUser() user: { organizationId: string; roleLevel: string },
  ) {
    const y = year  ? parseInt(year,  10) : new Date().getFullYear();
    const m = month ? parseInt(month, 10) : new Date().getMonth() + 1;
    return this.calendar.getMonthVisits(y, m, user.organizationId, user.roleLevel);
  }

  /** POST /calendar/visits — SUPER_ADMIN creates a visit */
  @Post('visits')
  @Roles(Role.SUPER_ADMIN)
  async createVisit(
    @Body() dto: CreateVisitDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.calendar.createVisit(dto, user.userId);
  }

  /** PATCH /calendar/visits/:id — SUPER_ADMIN updates */
  @Patch('visits/:id')
  @Roles(Role.SUPER_ADMIN)
  async updateVisit(@Param('id') id: string, @Body() dto: UpdateVisitDto) {
    return this.calendar.updateVisit(id, dto);
  }

  /** DELETE /calendar/visits/:id — SUPER_ADMIN deletes */
  @Delete('visits/:id')
  @Roles(Role.SUPER_ADMIN)
  async deleteVisit(@Param('id') id: string) {
    return this.calendar.deleteVisit(id);
  }

  /** GET /calendar/requests — all (admin) or own org (client) */
  @Get('requests')
  async getRequests(
    @CurrentUser() user: { organizationId: string; roleLevel: string },
  ) {
    return this.calendar.getRequests(user.organizationId, user.roleLevel);
  }

  /** POST /calendar/requests — any user submits a visit request */
  @Post('requests')
  async createRequest(
    @Body() dto: CreateVisitRequestDto,
    @CurrentUser() user: { organizationId: string; userId: string },
  ) {
    return this.calendar.createRequest(dto, user.organizationId, user.userId);
  }

  /** PATCH /calendar/requests/:id/respond — SUPER_ADMIN approves/rejects */
  @Patch('requests/:id/respond')
  @Roles(Role.SUPER_ADMIN)
  async respondToRequest(
    @Param('id') id: string,
    @Body() dto: RespondToRequestDto,
  ) {
    return this.calendar.respondToRequest(id, dto);
  }

  /** GET /calendar/organizations — SUPER_ADMIN: list client orgs for the create form */
  @Get('organizations')
  @Roles(Role.SUPER_ADMIN)
  async getOrganizations() {
    return this.calendar.getClientOrganizations();
  }

  /** GET /calendar/admin-org — all authenticated users: returns the platform company or null */
  @Get('admin-org')
  async getAdminOrg() {
    return this.calendar.getAdminOrg();
  }

  /** POST /calendar/blocks — SUPER_ADMIN marks a day as holiday or busy */
  @Post('blocks')
  @Roles(Role.SUPER_ADMIN)
  async createBlock(
    @Body() dto: CreateCalendarBlockDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.calendar.createBlock(dto, user.userId);
  }

  /** DELETE /calendar/blocks/:id — SUPER_ADMIN removes a block */
  @Delete('blocks/:id')
  @Roles(Role.SUPER_ADMIN)
  async deleteBlock(@Param('id') id: string) {
    return this.calendar.deleteBlock(id);
  }
}
