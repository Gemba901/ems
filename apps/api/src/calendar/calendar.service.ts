import {
  Injectable, NotFoundException, BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationsService } from 'src/notifications/notifications.service';
import { Role } from 'src/common/enum/role.enum';
import {
  CreateVisitDto, UpdateVisitDto, CreateVisitRequestDto, RespondToRequestDto,
  CreateCalendarBlockDto, AddVisitAttendeeDto,
  CreateCalendarEventDto, UpdateCalendarEventDto,
  InvitationStatusDto, DeleteModeDto,
} from './dto/calendar.dto';
import { randomUUID } from 'crypto';

const ORG_SELECT = { id: true, name: true, logoUrl: true };

const VISIT_SELECT: any = {
  id: true, title: true, date: true, endDate: true,
  startTime: true, endTime: true, status: true,
  notes: true, internalNotes: true, completionNote: true,
  clientOrgId: true, clientOrg: { select: ORG_SELECT },
  recurrencePattern: true, recurrenceGroupId: true,
  attendees: {
    select: {
      id: true, role: true,
      employee: { select: { id: true, firstName: true, lastName: true, jobTitle: true, avatarUrl: true } },
    },
  },
};

@Injectable()
export class CalendarService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  private isGemba(roleLevel: string) {
    return roleLevel === Role.SUPER_ADMIN;
  }

  // ── Blocked-day guard ─────────────────────────────────────────────────────

  private async assertDateNotBlocked(dateStr: string) {
    const date = new Date(dateStr);
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dayEnd   = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);
    const block = await (this.prisma as any).calendarBlock.findFirst({
      where: { date: { gte: dayStart, lte: dayEnd } },
    });
    if (block) {
      const reason = block.type === 'HOLIDAY'
        ? `public holiday${block.label ? ` (${block.label})` : ''}`
        : `busy day${block.label ? ` (${block.label})` : ''}`;
      throw new BadRequestException(`Cannot schedule on a ${reason}`);
    }
  }

  // ── Conflict guard ────────────────────────────────────────────────────────

  private async assertNoSameDayConflict(clientOrgId: string, dateStr: string, excludeId?: string) {
    const date = new Date(dateStr);
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dayEnd   = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);
    const conflict = await (this.prisma as any).consultancyVisit.findFirst({
      where: {
        clientOrgId,
        date: { gte: dayStart, lte: dayEnd },
        status: { in: ['TENTATIVE', 'CONFIRMED'] },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true, title: true },
    });
    if (conflict) {
      throw new BadRequestException(
        `Conflict: a visit already exists for this client on ${dateStr} — "${conflict.title}"`,
      );
    }
  }

  // ── Recurrence helpers ────────────────────────────────────────────────────

  private nextDate(current: Date, pattern: string): Date {
    const d = new Date(current);
    if (pattern === 'WEEKLY')   d.setDate(d.getDate() + 7);
    if (pattern === 'BIWEEKLY') d.setDate(d.getDate() + 14);
    if (pattern === 'MONTHLY')  d.setMonth(d.getMonth() + 1);
    return d;
  }

  // ── Month visits ──────────────────────────────────────────────────────────

  async getMonthVisits(
    year: number,
    month: number,
    organizationId: string,
    roleLevel: string,
    filterOrgId?: string,
  ) {
    const start = new Date(year, month - 1, 1);
    const end   = new Date(year, month, 0, 23, 59, 59);
    const isAdmin = this.isGemba(roleLevel);

    const blocks = await (this.prisma as any).calendarBlock.findMany({
      where: { date: { gte: start, lte: end } },
      select: { id: true, date: true, type: true, label: true },
      orderBy: { date: 'asc' },
    });

    const visitOrgFilter = isAdmin
      ? (filterOrgId ? { clientOrgId: filterOrgId } : {})
      : { clientOrgId: organizationId };

    // Include visits that start in the month OR span into the month (multi-day)
    const visits = await (this.prisma as any).consultancyVisit.findMany({
      where: {
        AND: [
          { date: { lte: end } },
          {
            OR: [
              { endDate: { gte: start } },
              { endDate: null, date: { gte: start } },
            ],
          },
        ],
        ...visitOrgFilter,
      },
      select: {
        ...VISIT_SELECT,
        internalNotes: true,
      },
      orderBy: { date: 'asc' },
    });

    const requestOrgFilter = isAdmin
      ? (filterOrgId ? { organizationId: filterOrgId } : {})
      : { organizationId };

    const requests = await this.prisma.visitRequest.findMany({
      where: { requestedDate: { gte: start, lte: end }, ...requestOrgFilter },
      select: {
        id: true,
        organizationId: true,
        organization: { select: ORG_SELECT },
        requestedDate: true,
        preferredTime: true,
        message: true,
        status: true,
        responseNote: true,
      },
      orderBy: { requestedDate: 'asc' },
    });

    const mappedVisits = visits.map((v: any) => ({
      id: v.id, type: 'VISIT' as const,
      date: v.date.toISOString().split('T')[0],
      endDate: v.endDate ? v.endDate.toISOString().split('T')[0] : null,
      startTime: v.startTime, endTime: v.endTime,
      status: v.status, isOwn: true,
      title: v.title,
      clientOrgId: v.clientOrgId, clientOrgName: v.clientOrg.name,
      notes: v.notes,
      internalNotes: isAdmin ? v.internalNotes : undefined,
      completionNote: v.completionNote,
      recurrencePattern: v.recurrencePattern,
      recurrenceGroupId: v.recurrenceGroupId,
      attendees: v.attendees.map((a: any) => ({
        id: a.id, role: a.role,
        employeeId: a.employee.id,
        name: `${a.employee.firstName} ${a.employee.lastName}`,
        jobTitle: a.employee.jobTitle,
        avatarUrl: a.employee.avatarUrl,
      })),
    }));

    const mappedRequests = requests.map((r: any) => ({
      id: r.id, type: 'REQUEST' as const,
      date: r.requestedDate.toISOString().split('T')[0],
      preferredTime: r.preferredTime,
      status: r.status,
      organizationId: r.organizationId,
      organizationName: isAdmin ? r.organization.name : undefined,
      message: r.message,
      responseNote: r.responseNote,
      isOwn: r.organizationId === organizationId,
    }));

    const mappedBlocks = blocks.map((b: any) => ({
      id: b.id,
      date: b.date.toISOString().split('T')[0],
      type: b.type,
      label: b.label,
    }));

    return { visits: mappedVisits, requests: mappedRequests, blocks: mappedBlocks };
  }

  // ── Create visit ──────────────────────────────────────────────────────────

  async createVisit(dto: CreateVisitDto, userId: string) {
    await this.assertDateNotBlocked(dto.date);
    await this.assertNoSameDayConflict(dto.clientOrgId, dto.date);

    const org = await this.prisma.organization.findUnique({ where: { id: dto.clientOrgId }, select: { id: true } });
    if (!org) throw new NotFoundException('Client organization not found');

    const baseData = {
      title:         dto.title,
      clientOrgId:   dto.clientOrgId,
      date:          new Date(dto.date),
      endDate:       dto.endDate ? new Date(dto.endDate) : null,
      startTime:     dto.startTime,
      endTime:       dto.endTime,
      status:        dto.status ?? 'TENTATIVE',
      notes:         dto.notes,
      internalNotes: dto.internalNotes,
      completionNote: dto.completionNote,
      createdById:   userId,
    };

    const visit = await (this.prisma as any).consultancyVisit.create({
      data: baseData,
      select: VISIT_SELECT,
    });

    // Generate recurrence instances if requested
    if (dto.recurrencePattern && dto.recurrenceEndDate) {
      const groupId = randomUUID();
      const endDate = new Date(dto.recurrenceEndDate);
      let current = new Date(dto.date);
      const instances: any[] = [];

      while (true) {
        current = this.nextDate(current, dto.recurrencePattern);
        if (current > endDate || instances.length >= 52) break;
        instances.push({
          ...baseData,
          date: new Date(current),
          endDate: dto.endDate
            ? new Date(new Date(dto.endDate).getTime() + (current.getTime() - new Date(dto.date).getTime()))
            : null,
          recurrencePattern: dto.recurrencePattern,
          recurrenceEndDate: new Date(dto.recurrenceEndDate),
          recurrenceGroupId: groupId,
        });
      }

      if (instances.length > 0) {
        await (this.prisma as any).consultancyVisit.update({
          where: { id: (visit as any).id },
          data: {
            recurrencePattern: dto.recurrencePattern as any,
            recurrenceEndDate: new Date(dto.recurrenceEndDate),
            recurrenceGroupId: groupId,
          },
        });
        await (this.prisma as any).consultancyVisit.createMany({ data: instances });
      }
    }

    return visit;
  }

  // ── Update visit ──────────────────────────────────────────────────────────

  async updateVisit(id: string, dto: UpdateVisitDto) {
    const visit = await (this.prisma as any).consultancyVisit.findUnique({
      where: { id },
      select: { id: true, clientOrgId: true },
    });
    if (!visit) throw new NotFoundException('Visit not found');

    if (dto.date) {
      await this.assertDateNotBlocked(dto.date);
      await this.assertNoSameDayConflict(dto.clientOrgId ?? visit.clientOrgId, dto.date, id);
    }

    const data: Record<string, unknown> = {};
    if (dto.title         !== undefined) data.title         = dto.title;
    if (dto.clientOrgId   !== undefined) data.clientOrgId   = dto.clientOrgId;
    if (dto.date          !== undefined) data.date          = new Date(dto.date);
    if (dto.endDate       !== undefined) data.endDate       = dto.endDate ? new Date(dto.endDate) : null;
    if (dto.startTime     !== undefined) data.startTime     = dto.startTime;
    if (dto.endTime       !== undefined) data.endTime       = dto.endTime;
    if (dto.status        !== undefined) data.status        = dto.status;
    if (dto.notes         !== undefined) data.notes         = dto.notes;
    if (dto.internalNotes !== undefined) data.internalNotes = dto.internalNotes;
    if (dto.completionNote !== undefined) data.completionNote = dto.completionNote;

    return (this.prisma as any).consultancyVisit.update({
      where: { id },
      data,
      select: VISIT_SELECT,
    });
  }

  // ── Delete visit ──────────────────────────────────────────────────────────

  async deleteVisit(id: string) {
    const visit = await (this.prisma as any).consultancyVisit.findUnique({ where: { id }, select: { id: true } });
    if (!visit) throw new NotFoundException('Visit not found');
    await (this.prisma as any).consultancyVisit.delete({ where: { id } });
    return { message: 'Visit deleted' };
  }

  // ── Attendees ─────────────────────────────────────────────────────────────

  async addAttendee(visitId: string, dto: AddVisitAttendeeDto) {
    const visit = await (this.prisma as any).consultancyVisit.findUnique({
      where: { id: visitId },
      select: { id: true, clientOrgId: true },
    });
    if (!visit) throw new NotFoundException('Visit not found');

    const employee = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId, organizationId: visit.clientOrgId },
      select: { id: true },
    });
    if (!employee) throw new NotFoundException('Employee not found in the client organization');

    const existing = await (this.prisma as any).visitAttendee.findFirst({
      where: { visitId, employeeId: dto.employeeId },
    });
    if (existing) throw new BadRequestException('Employee is already an attendee');

    return (this.prisma as any).visitAttendee.create({
      data: { visitId, employeeId: dto.employeeId, role: dto.role },
      select: {
        id: true, role: true,
        employee: { select: { id: true, firstName: true, lastName: true, jobTitle: true, avatarUrl: true } },
      },
    });
  }

  async removeAttendee(visitId: string, employeeId: string) {
    const attendee = await (this.prisma as any).visitAttendee.findFirst({
      where: { visitId, employeeId },
    });
    if (!attendee) throw new NotFoundException('Attendee not found');
    await (this.prisma as any).visitAttendee.delete({ where: { id: attendee.id } });
    return { message: 'Attendee removed' };
  }

  // ── Visit Requests ────────────────────────────────────────────────────────

  async createRequest(dto: CreateVisitRequestDto, organizationId: string, userId: string) {
    await this.assertDateNotBlocked(dto.requestedDate);
    return this.prisma.visitRequest.create({
      data: {
        organizationId,
        requestedDate: new Date(dto.requestedDate),
        preferredTime: dto.preferredTime,
        message: dto.message,
        createdById: userId,
      },
      select: {
        id: true, requestedDate: true, preferredTime: true, message: true, status: true,
        organization: { select: ORG_SELECT },
      },
    });
  }

  async getRequests(organizationId: string, roleLevel: string) {
    const where = this.isGemba(roleLevel) ? {} : { organizationId };
    return this.prisma.visitRequest.findMany({
      where,
      select: {
        id: true, requestedDate: true, preferredTime: true, message: true,
        status: true, responseNote: true, createdAt: true,
        organization: { select: ORG_SELECT },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { requestedDate: 'asc' },
    });
  }

  async respondToRequest(id: string, dto: RespondToRequestDto) {
    const req = await this.prisma.visitRequest.findUnique({
      where: { id },
      select: { id: true, organizationId: true, requestedDate: true },
    });
    if (!req) throw new NotFoundException('Request not found');

    const updated = await this.prisma.visitRequest.update({
      where: { id },
      data: { status: dto.status, responseNote: dto.responseNote },
      select: { id: true, status: true, responseNote: true, organization: { select: ORG_SELECT } },
    });

    // Notify all employees in the requesting org
    const dateStr = req.requestedDate.toISOString().split('T')[0];
    const isApproved = dto.status === 'APPROVED';
    await this.notifications.broadcast(req.organizationId, {
      type: isApproved ? 'INFO' : 'INFO',
      module: 'CALENDAR',
      title: `Visit request ${isApproved ? 'approved' : 'rejected'}`,
      message: isApproved
        ? `Your visit request for ${dateStr} has been approved.${dto.responseNote ? ' Note: ' + dto.responseNote : ''}`
        : `Your visit request for ${dateStr} has been rejected.${dto.responseNote ? ' Reason: ' + dto.responseNote : ''}`,
      actionUrl: '/calendar',
    });

    return updated;
  }

  // ── Upcoming visits ───────────────────────────────────────────────────────

  async getUpcomingVisits(organizationId: string, roleLevel: string, limit = 5) {
    const isAdmin = this.isGemba(roleLevel);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const visits = await (this.prisma as any).consultancyVisit.findMany({
      where: {
        date: { gte: today },
        status: { in: ['TENTATIVE', 'CONFIRMED'] },
        ...(isAdmin ? {} : { clientOrgId: organizationId }),
      },
      select: {
        id: true, title: true, date: true, endDate: true,
        startTime: true, endTime: true, status: true,
        clientOrg: { select: ORG_SELECT },
      },
      orderBy: { date: 'asc' },
      take: limit,
    });

    return visits.map((v) => ({
      id: v.id,
      title: v.title,
      date: v.date.toISOString().split('T')[0],
      endDate: v.endDate ? v.endDate.toISOString().split('T')[0] : null,
      startTime: v.startTime,
      endTime: v.endTime,
      status: v.status,
      clientOrgName: v.clientOrg.name,
      clientOrgId: v.clientOrg.id,
    }));
  }

  // ── iCal export ───────────────────────────────────────────────────────────

  async getIcalExport(
    year: number,
    month: number | undefined,
    organizationId: string,
    roleLevel: string,
  ) {
    const isAdmin = this.isGemba(roleLevel);
    const orgFilter = isAdmin ? {} : { clientOrgId: organizationId };

    let dateFilter: any;
    if (month) {
      dateFilter = {
        gte: new Date(year, month - 1, 1),
        lte: new Date(year, month, 0, 23, 59, 59),
      };
    } else {
      dateFilter = {
        gte: new Date(year, 0, 1),
        lte: new Date(year, 11, 31, 23, 59, 59),
      };
    }

    const visits = await (this.prisma as any).consultancyVisit.findMany({
      where: { date: dateFilter, ...orgFilter },
      select: {
        id: true, title: true, date: true, endDate: true,
        startTime: true, notes: true,
        clientOrg: { select: ORG_SELECT },
      },
      orderBy: { date: 'asc' },
    });

    const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const lines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Gemba PMS//Calendar//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
    ];

    for (const v of visits) {
      const dtStart = v.date.toISOString().split('T')[0].replace(/-/g, '');
      // DTEND is exclusive in iCal; use next day
      const endDay = v.endDate
        ? new Date(v.endDate.getTime() + 86400000)
        : new Date(v.date.getTime() + 86400000);
      const dtEnd = endDay.toISOString().split('T')[0].replace(/-/g, '');

      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${v.id}@gembapms.com`);
      lines.push(`DTSTAMP:${stamp}`);
      lines.push(`DTSTART;VALUE=DATE:${dtStart}`);
      lines.push(`DTEND;VALUE=DATE:${dtEnd}`);
      lines.push(`SUMMARY:${v.title} — ${v.clientOrg.name}`);
      if (v.notes) lines.push(`DESCRIPTION:${v.notes.replace(/[\r\n]+/g, '\\n')}`);
      lines.push('END:VEVENT');
    }

    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }

  // ── Analytics ─────────────────────────────────────────────────────────────

  async getAnalytics(year: number, organizationId: string, roleLevel: string) {
    const isAdmin = this.isGemba(roleLevel);
    const orgFilter = isAdmin ? {} : { clientOrgId: organizationId };

    const [visits, requests, completedVisits] = await Promise.all([
      (this.prisma as any).consultancyVisit.findMany({
        where: { date: { gte: new Date(year, 0, 1), lte: new Date(year, 11, 31, 23, 59, 59) }, ...orgFilter },
        select: { date: true, status: true, clientOrgId: true, clientOrg: { select: ORG_SELECT } },
      }),
      this.prisma.visitRequest.count({
        where: { status: 'PENDING', ...(isAdmin ? {} : { organizationId }) },
      }),
      (this.prisma as any).consultancyVisit.count({
        where: { status: 'COMPLETED', date: { gte: new Date(year, 0, 1) }, ...orgFilter },
      }),
    ]);

    // By month
    const byMonth = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      total: 0, tentative: 0, confirmed: 0, completed: 0, cancelled: 0,
    }));
    for (const v of visits) {
      const m = v.date.getMonth();
      byMonth[m].total++;
      const key = v.status.toLowerCase() as keyof typeof byMonth[0];
      if (key in byMonth[m]) (byMonth[m] as any)[key]++;
    }

    // By org (admin only)
    let byOrg: { orgId: string; orgName: string; total: number; completed: number }[] | undefined;
    if (isAdmin) {
      const orgMap: Record<string, { orgName: string; total: number; completed: number }> = {};
      for (const v of visits) {
        if (!orgMap[v.clientOrgId]) {
          orgMap[v.clientOrgId] = { orgName: v.clientOrg.name, total: 0, completed: 0 };
        }
        orgMap[v.clientOrgId].total++;
        if (v.status === 'COMPLETED') orgMap[v.clientOrgId].completed++;
      }
      byOrg = Object.entries(orgMap).map(([orgId, data]) => ({ orgId, ...data }))
        .sort((a, b) => b.total - a.total);
    }

    return {
      year,
      totalVisits: visits.length,
      completedVisits,
      pendingRequests: requests,
      byMonth,
      byOrg,
    };
  }

  // ── Calendar Blocks ───────────────────────────────────────────────────────

  async createBlock(dto: CreateCalendarBlockDto, userId: string) {
    const date = new Date(dto.date);
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dayEnd   = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);
    const existing = await (this.prisma as any).calendarBlock.findFirst({
      where: { date: { gte: dayStart, lte: dayEnd } },
    });
    if (existing) throw new BadRequestException('This day is already blocked');

    return (this.prisma as any).calendarBlock.create({
      data: { date: dayStart, type: dto.type, label: dto.label, createdById: userId },
      select: { id: true, date: true, type: true, label: true },
    });
  }

  async deleteBlock(id: string) {
    const block = await (this.prisma as any).calendarBlock.findUnique({ where: { id }, select: { id: true } });
    if (!block) throw new NotFoundException('Block not found');
    await (this.prisma as any).calendarBlock.delete({ where: { id } });
    return { message: 'Block removed' };
  }

  // ── Org helpers ───────────────────────────────────────────────────────────

  async getClientOrganizations() {
    return (this.prisma.organization as any).findMany({
      where:   { isAdminOrg: false },
      select:  ORG_SELECT,
      orderBy: { name: 'asc' },
    });
  }

  async getAdminOrg() {
    return (this.prisma.organization as any).findFirst({
      where:  { isAdminOrg: true },
      select: { ...ORG_SELECT, isAdminOrg: true },
    });
  }

  /** List employees of a client org for the attendees picker */
  async getOrgEmployees(clientOrgId: string) {
    return this.prisma.employee.findMany({
      where: { organizationId: clientOrgId },
      select: { id: true, firstName: true, lastName: true, jobTitle: true, avatarUrl: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
  }

  // ── Holistic Calendar ─────────────────────────────────────────────────────

  private async resolveEmployee(userId: string, organizationId: string) {
    const emp = await this.prisma.employee.findFirst({
      where: { userId, organizationId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!emp) throw new NotFoundException('Employee record not found');
    return emp;
  }

  private nextEventDate(current: Date, pattern: string): Date {
    const d = new Date(current);
    if (pattern === 'DAILY')   d.setDate(d.getDate() + 1);
    if (pattern === 'WEEKLY')  d.setDate(d.getDate() + 7);
    if (pattern === 'MONTHLY') d.setMonth(d.getMonth() + 1);
    return d;
  }

  private mapCalendarEvent(e: any, currentEmployeeId: string) {
    const myInvitation = (e.invitations ?? []).find((i: any) => i.inviteeId === currentEmployeeId);
    return {
      id: e.id,
      title: e.title,
      description: e.description ?? null,
      type: e.type,
      startAt: e.startAt instanceof Date ? e.startAt.toISOString() : e.startAt,
      endAt: e.endAt instanceof Date ? e.endAt.toISOString() : e.endAt,
      allDay: e.allDay,
      isRecurring: e.isRecurring,
      recurrencePattern: e.recurrencePattern ?? null,
      recurrenceEndAt: e.recurrenceEndAt ? (e.recurrenceEndAt instanceof Date ? e.recurrenceEndAt.toISOString() : e.recurrenceEndAt) : null,
      parentEventId: e.parentEventId ?? null,
      isOwner: e.createdById === currentEmployeeId,
      myInvitationStatus: myInvitation?.status ?? null,
      createdBy: e.createdBy ? {
        id: e.createdBy.id,
        name: `${e.createdBy.firstName} ${e.createdBy.lastName}`,
        avatarUrl: e.createdBy.avatarUrl ?? null,
      } : null,
      invitations: (e.invitations ?? []).map((i: any) => ({
        id: i.id,
        status: i.status,
        invitee: {
          id: i.invitee.id,
          name: `${i.invitee.firstName} ${i.invitee.lastName}`,
          avatarUrl: i.invitee.avatarUrl ?? null,
        },
      })),
      participants: (e.participants ?? []).map((p: any) => ({
        id: p.employeeId,
        name: `${p.employee.firstName} ${p.employee.lastName}`,
        avatarUrl: p.employee.avatarUrl ?? null,
      })),
    };
  }

  async getEvents(year: number, month: number, userId: string, organizationId: string) {
    const start = new Date(year, month - 1, 1);
    const end   = new Date(year, month, 0, 23, 59, 59);

    const employee = await this.resolveEmployee(userId, organizationId);

    const eventInclude = {
      createdBy:    { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      invitations:  { select: { id: true, status: true, inviteeId: true, invitee: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } } },
      participants: { select: { employeeId: true, employee: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } } },
    };

    const dateOverlap = { startAt: { lte: end }, endAt: { gte: start } };

    const [personalEvents, companyEvents, trainingEvents, pendingCount] = await Promise.all([
      // Personal: own events + meetings I'm invited to + training I participate in
      this.prisma.calendarEvent.findMany({
        where: {
          organizationId,
          ...dateOverlap,
          type: { in: ['PERSONAL_EVENT', 'PERSONAL_REMINDER', 'PERSONAL_TRAINING', 'MEETING'] as any },
          OR: [
            { createdById: employee.id },
            { invitations: { some: { inviteeId: employee.id } } },
          ],
        },
        include: eventInclude,
        orderBy: { startAt: 'asc' },
      }),

      // Company: company-wide events visible to all in org
      this.prisma.calendarEvent.findMany({
        where: {
          organizationId,
          ...dateOverlap,
          type: { in: ['COMPANY_TRAINING', 'COMPANY_EVENT', 'COMPANY_HOLIDAY', 'AUDIT'] as any },
        },
        include: eventInclude,
        orderBy: { startAt: 'asc' },
      }),

      // Training planner: all training types in org (+ personal training by current user)
      this.prisma.calendarEvent.findMany({
        where: {
          organizationId,
          ...dateOverlap,
          OR: [
            { type: { in: ['COMPANY_TRAINING', 'TRAINING_SESSION'] as any } },
            { type: 'PERSONAL_TRAINING' as any, createdById: employee.id },
          ],
        },
        include: eventInclude,
        orderBy: { startAt: 'asc' },
      }),

      this.prisma.eventInvitation.count({ where: { inviteeId: employee.id, status: 'PENDING' } }),
    ]);

    // Birthday virtual events from colleagues (derived from dateOfBirth, not stored as events)
    const colleagues = await this.prisma.employee.findMany({
      where: { organizationId, dateOfBirth: { not: null } },
      select: { id: true, firstName: true, lastName: true, dateOfBirth: true, avatarUrl: true },
    });

    const birthdays = colleagues
      .map((e) => {
        const dob = e.dateOfBirth!;
        const bday = new Date(year, dob.getMonth(), dob.getDate());
        if (bday < start || bday > end) return null;
        return {
          id: `birthday-${e.id}-${year}`,
          type: 'BIRTHDAY',
          title: `${e.firstName} ${e.lastName}'s Birthday`,
          startAt: bday.toISOString(),
          endAt: bday.toISOString(),
          allDay: true,
          isVirtual: true,
          isOwner: false,
          myInvitationStatus: null,
          employee: { id: e.id, name: `${e.firstName} ${e.lastName}`, avatarUrl: e.avatarUrl ?? null },
        };
      })
      .filter(Boolean);

    return {
      employeeId: employee.id,
      pendingInvitationsCount: pendingCount,
      personal: personalEvents.map((e) => this.mapCalendarEvent(e, employee.id)),
      company: companyEvents.map((e) => this.mapCalendarEvent(e, employee.id)),
      training: trainingEvents.map((e) => this.mapCalendarEvent(e, employee.id)),
      birthdays,
    };
  }

  async createEvent(dto: CreateCalendarEventDto, userId: string, organizationId: string, roleLevel: string) {
    const employee = await this.resolveEmployee(userId, organizationId);

    // Role guard by event type
    const companyOnlyTypes = ['COMPANY_TRAINING', 'COMPANY_EVENT', 'COMPANY_HOLIDAY', 'TRAINING_SESSION'];
    const auditOnlyTypes   = ['AUDIT'];
    const allowedCompany   = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HR] as string[];
    const allowedAudit     = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT] as string[];

    if (companyOnlyTypes.includes(dto.type) && !allowedCompany.includes(roleLevel)) {
      throw new ForbiddenException('Only MANAGEMENT, ADMIN, or HR can create company-wide events');
    }
    if (auditOnlyTypes.includes(dto.type) && !allowedAudit.includes(roleLevel)) {
      throw new ForbiddenException('Only ADMIN or MANAGEMENT can create audit events');
    }

    const startAt = new Date(dto.startAt);
    const endAt   = new Date(dto.endAt);

    // For meetings: check each invitee for approved leave overlap
    const onLeaveWarnings: { employeeId: string; name: string }[] = [];
    if (dto.type === 'MEETING' && dto.inviteeIds?.length) {
      const invitees = await this.prisma.employee.findMany({
        where: { id: { in: dto.inviteeIds }, organizationId },
        select: { id: true, firstName: true, lastName: true },
      });
      await Promise.all(
        invitees.map(async (inv) => {
          const leave = await this.prisma.leaveRequest.findFirst({
            where: { employeeId: inv.id, status: 'APPROVED', startDate: { lte: endAt }, endDate: { gte: startAt } },
            select: { id: true },
          });
          if (leave) onLeaveWarnings.push({ employeeId: inv.id, name: `${inv.firstName} ${inv.lastName}` });
        }),
      );
    }

    const event = await this.prisma.calendarEvent.create({
      data: {
        title: dto.title,
        description: dto.description,
        type: dto.type as any,
        startAt,
        endAt,
        allDay: dto.allDay ?? false,
        organizationId,
        createdById: employee.id,
        isRecurring: dto.isRecurring ?? false,
        recurrencePattern: (dto.recurrencePattern as any) ?? null,
        recurrenceEndAt: dto.recurrenceEndAt ? new Date(dto.recurrenceEndAt) : null,
      },
    });

    // Recurrence children
    if (dto.isRecurring && dto.recurrencePattern && dto.recurrenceEndAt) {
      const recEnd   = new Date(dto.recurrenceEndAt);
      const duration = endAt.getTime() - startAt.getTime();
      let current    = new Date(startAt);
      const children: any[] = [];

      while (children.length < 365) {
        current = this.nextEventDate(current, dto.recurrencePattern);
        if (current > recEnd) break;
        children.push({
          title: dto.title, description: dto.description,
          type: dto.type, organizationId, createdById: employee.id,
          startAt: new Date(current), endAt: new Date(current.getTime() + duration),
          allDay: dto.allDay ?? false,
          isRecurring: true, recurrencePattern: dto.recurrencePattern,
          recurrenceEndAt: new Date(dto.recurrenceEndAt),
          parentEventId: event.id,
        });
      }
      if (children.length) await this.prisma.calendarEvent.createMany({ data: children });
    }

    // Invitations for MEETING
    if (dto.type === 'MEETING' && dto.inviteeIds?.length) {
      const targets = dto.inviteeIds.filter((id) => id !== employee.id);
      if (targets.length) {
        await this.prisma.eventInvitation.createMany({
          data: targets.map((inviteeId) => ({ eventId: event.id, inviteeId })),
          skipDuplicates: true,
        });
        await this.notifications.createMany(
          targets.map((inviteeId) => ({
            employeeId: inviteeId,
            type: 'ACTION_REQUIRED' as any,
            module: 'CALENDAR',
            title: 'Meeting invitation',
            message: `${employee.firstName} ${employee.lastName} invited you to "${dto.title}" on ${startAt.toDateString()}`,
            actionUrl: '/calendar',
            metadata: { eventId: event.id },
          })),
        );
      }
    }

    // Participants for training/audit
    const participantTypes = ['TRAINING_SESSION', 'COMPANY_TRAINING', 'AUDIT'];
    if (participantTypes.includes(dto.type) && dto.participantIds?.length) {
      await this.prisma.eventParticipant.createMany({
        data: dto.participantIds.map((empId) => ({ eventId: event.id, employeeId: empId })),
        skipDuplicates: true,
      });
      await this.notifications.createMany(
        dto.participantIds.map((empId) => ({
          employeeId: empId,
          type: 'INFO' as any,
          module: 'CALENDAR',
          title: `You've been added to "${dto.title}"`,
          message: `${dto.type === 'AUDIT' ? 'Audit' : 'Training'} scheduled for ${startAt.toDateString()}`,
          actionUrl: '/calendar',
          metadata: { eventId: event.id },
        })),
      );
    }

    return { event, onLeaveWarnings };
  }

  async updateEvent(id: string, dto: UpdateCalendarEventDto, userId: string, organizationId: string) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const event = await this.prisma.calendarEvent.findUnique({
      where: { id },
      select: { id: true, createdById: true, parentEventId: true },
    });
    if (!event) throw new NotFoundException('Event not found');
    if (event.createdById !== employee.id) throw new ForbiddenException('Only the event creator can update this event');

    const data: any = {};
    if (dto.title       !== undefined) data.title       = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.startAt     !== undefined) data.startAt     = new Date(dto.startAt);
    if (dto.endAt       !== undefined) data.endAt       = new Date(dto.endAt);
    if (dto.allDay      !== undefined) data.allDay      = dto.allDay;

    if (dto.updateMode === DeleteModeDto.ALL_IN_SERIES) {
      const root = event.parentEventId ?? id;
      await this.prisma.calendarEvent.updateMany({
        where: { OR: [{ id: root }, { parentEventId: root }] },
        data,
      });
      return { updated: 'series' };
    }

    return this.prisma.calendarEvent.update({ where: { id }, data });
  }

  async deleteEvent(id: string, deleteMode: DeleteModeDto | undefined, userId: string, organizationId: string) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const event = await this.prisma.calendarEvent.findUnique({
      where: { id },
      select: { id: true, createdById: true, parentEventId: true },
    });
    if (!event) throw new NotFoundException('Event not found');
    if (event.createdById !== employee.id) throw new ForbiddenException('Only the event creator can delete this event');

    if (deleteMode === DeleteModeDto.ALL_IN_SERIES) {
      const root = event.parentEventId ?? id;
      await this.prisma.calendarEvent.deleteMany({
        where: { OR: [{ id: root }, { parentEventId: root }] },
      });
      return { message: 'Series deleted' };
    }

    await this.prisma.calendarEvent.delete({ where: { id } });
    return { message: 'Event deleted' };
  }

  async respondToInvitation(eventId: string, status: InvitationStatusDto, userId: string, organizationId: string) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const invitation = await this.prisma.eventInvitation.findUnique({
      where: { eventId_inviteeId: { eventId, inviteeId: employee.id } },
      include: {
        event: { select: { title: true, startAt: true, createdById: true } },
      },
    });
    if (!invitation) throw new NotFoundException('Invitation not found');
    if (invitation.status !== 'PENDING') throw new BadRequestException('Invitation already responded to');

    const updated = await this.prisma.eventInvitation.update({
      where: { eventId_inviteeId: { eventId, inviteeId: employee.id } },
      data: { status, respondedAt: new Date() },
    });

    await this.notifications.create({
      employeeId: invitation.event.createdById,
      type: 'INFO' as any,
      module: 'CALENDAR',
      title: `Meeting ${status === 'ACCEPTED' ? 'accepted' : 'declined'}`,
      message: `${employee.firstName} ${employee.lastName} ${status === 'ACCEPTED' ? 'accepted' : 'declined'} your invitation to "${invitation.event.title}"`,
      actionUrl: '/calendar',
      metadata: { eventId },
    });

    return updated;
  }

  async getMyInvitations(userId: string, organizationId: string) {
    const employee = await this.resolveEmployee(userId, organizationId);
    return this.prisma.eventInvitation.findMany({
      where: { inviteeId: employee.id, status: 'PENDING' },
      include: {
        event: {
          select: {
            id: true, title: true, description: true, type: true,
            startAt: true, endAt: true, allDay: true,
            createdBy: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
          },
        },
      },
      orderBy: { event: { startAt: 'asc' } },
    });
  }

  async checkAvailability(employeeId: string, startAt: string, endAt: string) {
    const start = new Date(startAt);
    const end   = new Date(endAt);
    const leave = await this.prisma.leaveRequest.findFirst({
      where: {
        employeeId,
        status: 'APPROVED',
        startDate: { lte: end },
        endDate:   { gte: start },
      },
      select: { id: true, type: true, startDate: true, endDate: true },
    });
    return { available: !leave, leave: leave ?? null };
  }

  async getEmployeeEventStats(employeeId: string) {
    const [accepted, declined, pending, total] = await Promise.all([
      this.prisma.eventInvitation.count({ where: { inviteeId: employeeId, status: 'ACCEPTED' } }),
      this.prisma.eventInvitation.count({ where: { inviteeId: employeeId, status: 'DECLINED' } }),
      this.prisma.eventInvitation.count({ where: { inviteeId: employeeId, status: 'PENDING' } }),
      this.prisma.eventInvitation.count({ where: { inviteeId: employeeId } }),
    ]);
    return { accepted, declined, pending, total };
  }

  async getEmployeeInvitationLog(employeeId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [invitations, total] = await Promise.all([
      this.prisma.eventInvitation.findMany({
        where: { inviteeId: employeeId },
        include: {
          event: {
            select: {
              id: true, title: true, type: true, startAt: true, endAt: true,
              createdBy: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.eventInvitation.count({ where: { inviteeId: employeeId } }),
    ]);
    return { invitations, total, page, limit };
  }

  async getOrgEmployeesForInvite(organizationId: string) {
    return this.prisma.employee.findMany({
      where: { organizationId },
      select: {
        id: true, firstName: true, lastName: true, jobTitle: true, avatarUrl: true,
        department: { select: { name: true } },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
  }
}
