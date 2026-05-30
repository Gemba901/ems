import {
  Injectable, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationsService } from 'src/notifications/notifications.service';
import { Role } from 'src/common/enum/role.enum';
import {
  CreateVisitDto, UpdateVisitDto, CreateVisitRequestDto, RespondToRequestDto,
  CreateCalendarBlockDto, AddVisitAttendeeDto,
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
}
