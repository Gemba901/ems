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
  InvitationStatusDto, DeleteModeDto, CreateCalendarFilterDto,
} from './dto/calendar.dto';
import { randomUUID } from 'crypto';

const ORG_SELECT = { id: true, name: true, logoUrl: true, shortName: true, primaryColor: true };

const displayOrgName = (org: { name: string; shortName?: string | null }) => org.shortName || org.name;

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
    // Only org-wide HOLIDAY blocks stop visit/request scheduling — BUSY_DAY is
    // now a personal "Out of Office" block scoped to one employee and has no
    // bearing on scheduling visits with a different organization.
    const date = new Date(dateStr);
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dayEnd   = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);
    const block = await (this.prisma as any).calendarBlock.findFirst({
      where: { date: { gte: dayStart, lte: dayEnd }, type: 'HOLIDAY' },
    });
    if (block) {
      throw new BadRequestException(`Cannot schedule on a public holiday${block.label ? ` (${block.label})` : ''}`);
    }
  }

  // ── Out of Office guard ───────────────────────────────────────────────────

  private async assertInviteesNotOOO(inviteeIds: string[], startAt: Date, endAt: Date) {
    if (!inviteeIds.length) return;
    const dayStart = new Date(startAt.getFullYear(), startAt.getMonth(), startAt.getDate());
    const dayEnd   = new Date(endAt.getFullYear(), endAt.getMonth(), endAt.getDate(), 23, 59, 59);
    const blocks = await (this.prisma as any).calendarBlock.findMany({
      where: { type: 'BUSY_DAY', employeeId: { in: inviteeIds }, date: { gte: dayStart, lte: dayEnd } },
      select: { employeeId: true },
    });
    if (!blocks.length) return;
    const blockedIds: string[] = Array.from(new Set(blocks.map((b: any) => b.employeeId as string)));
    const blockedEmployees = await this.prisma.employee.findMany({
      where: { id: { in: blockedIds } },
      select: { firstName: true, lastName: true },
    });
    const names = blockedEmployees.map((e) => `${e.firstName} ${e.lastName}`).join(', ');
    throw new BadRequestException(`Cannot schedule with ${names} — marked Out of Office on the selected date(s)`);
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
      select: {
        id: true, date: true, type: true, label: true, employeeId: true,
        employee: { select: { firstName: true, lastName: true } },
      },
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
        visitId: true,
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
      clientOrgId: v.clientOrgId, clientOrgName: displayOrgName(v.clientOrg),
      clientOrgColor: v.clientOrg?.primaryColor ?? null,
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
      organizationName: isAdmin ? displayOrgName(r.organization) : undefined,
      message: r.message,
      responseNote: r.responseNote,
      isOwn: r.organizationId === organizationId,
      visitId: r.visitId,
    }));

    const mappedBlocks = blocks.map((b: any) => ({
      id: b.id,
      date: b.date.toISOString().split('T')[0],
      type: b.type,
      label: b.label,
      employeeId: b.employeeId ?? null,
      employeeName: b.employee ? `${b.employee.firstName} ${b.employee.lastName}` : null,
    }));

    // For client org users: return dates that are occupied by OTHER companies' visits.
    // We return only dates (no titles, no client names) so their data stays private.
    let busyDates: string[] = [];
    if (!isAdmin) {
      const otherVisits = await (this.prisma as any).consultancyVisit.findMany({
        where: {
          AND: [
            { date: { lte: end } },
            { OR: [{ endDate: { gte: start } }, { endDate: null, date: { gte: start } }] },
            { clientOrgId: { not: organizationId } },
          ],
        },
        select: { date: true },
      });
      busyDates = [...new Set<string>(
        otherVisits.map((v: any) => v.date.toISOString().split('T')[0]),
      )];
    }

    return { visits: mappedVisits, requests: mappedRequests, blocks: mappedBlocks, busyDates };
  }

  // ── Create visit ──────────────────────────────────────────────────────────

  async createVisit(dto: CreateVisitDto, userId: string) {
    await this.assertDateNotBlocked(dto.date);
    await this.assertNoSameDayConflict(dto.clientOrgId, dto.date);

    const org = await this.prisma.organization.findUnique({ where: { id: dto.clientOrgId }, select: { id: true } });
    if (!org) throw new NotFoundException('Partner organization not found');

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
      select: { id: true, clientOrgId: true, date: true },
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

    // Increment reschedule counter when the date is explicitly changed
    if (dto.date !== undefined) {
      const currentDate = visit.date.toISOString().split('T')[0];
      if (dto.date !== currentDate) data.rescheduleCount = { increment: 1 };
    }

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

  async respondToRequest(id: string, dto: RespondToRequestDto, userId: string) {
    const req = await this.prisma.visitRequest.findUnique({
      where: { id },
      select: {
        id: true, organizationId: true, requestedDate: true,
        preferredTime: true, message: true, visitId: true,
        organization: { select: ORG_SELECT },
      },
    });
    if (!req) throw new NotFoundException('Request not found');

    // Approving a request converts it into a real, editable visit (agenda,
    // status, attendees) — the same object an admin gets when scheduling a
    // visit directly. Skip if it's already been converted (idempotent).
    let visitId = req.visitId;
    if (dto.status === 'APPROVED' && !visitId) {
      const visit = await (this.prisma as any).consultancyVisit.create({
        data: {
          title: `${displayOrgName(req.organization)} — Requested Visit`,
          clientOrgId: req.organizationId,
          date: req.requestedDate,
          startTime: req.preferredTime || undefined,
          status: 'CONFIRMED',
          notes: req.message || undefined,
          createdById: userId,
        },
        select: { id: true },
      });
      visitId = visit.id;
    }

    const updated = await this.prisma.visitRequest.update({
      where: { id },
      data: { status: dto.status, responseNote: dto.responseNote, ...(visitId ? { visitId } : {}) },
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

    const [visits, requests, completedVisits, rescheduleAgg] = await Promise.all([
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
      (this.prisma as any).consultancyVisit.aggregate({
        where: { date: { gte: new Date(year, 0, 1), lte: new Date(year, 11, 31, 23, 59, 59) }, ...orgFilter },
        _sum: { rescheduleCount: true },
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
      totalReschedules: rescheduleAgg._sum.rescheduleCount ?? 0,
      byMonth,
      byOrg,
    };
  }

  // ── Calendar Blocks ───────────────────────────────────────────────────────

  async createBlock(dto: CreateCalendarBlockDto, userId: string) {
    if (dto.type === 'BUSY_DAY' && !dto.employeeId) {
      throw new BadRequestException('employeeId is required for a personal Out of Office block');
    }

    const date = new Date(dto.date);
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dayEnd   = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);

    // HOLIDAY stays org-wide (one per day, for anyone); BUSY_DAY (Out of Office)
    // is scoped per employee, so different employees may each take OOO the same day.
    const conflictWhere = dto.type === 'BUSY_DAY'
      ? { date: { gte: dayStart, lte: dayEnd }, type: 'BUSY_DAY', employeeId: dto.employeeId }
      : { date: { gte: dayStart, lte: dayEnd }, type: 'HOLIDAY' };
    const existing = await (this.prisma as any).calendarBlock.findFirst({ where: conflictWhere });
    if (existing) throw new BadRequestException('This day is already blocked');

    return (this.prisma as any).calendarBlock.create({
      data: { date: dayStart, type: dto.type, label: dto.label, employeeId: dto.employeeId, createdById: userId },
      select: { id: true, date: true, type: true, label: true, employeeId: true },
    });
  }

  async deleteBlock(id: string) {
    const block = await (this.prisma as any).calendarBlock.findUnique({ where: { id }, select: { id: true } });
    if (!block) throw new NotFoundException('Block not found');
    await (this.prisma as any).calendarBlock.delete({ where: { id } });
    return { message: 'Block removed' };
  }

  // ── Org helpers ───────────────────────────────────────────────────────────

  async getPartnerOrganizations() {
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

  private nextEventDate(current: Date, pattern: string, interval = 1): Date {
    const d = new Date(current);
    if (pattern === 'DAILY')   d.setDate(d.getDate() + interval);
    if (pattern === 'WEEKLY')  d.setDate(d.getDate() + 7 * interval);
    if (pattern === 'MONTHLY') d.setMonth(d.getMonth() + interval);
    return d;
  }

  private mapCalendarEvent(e: any, currentEmployeeId: string) {
    const myInvitation = (e.invitations ?? []).find((i: any) => i.inviteeId === currentEmployeeId);
    return {
      id: e.id,
      title: e.title,
      description: e.description ?? null,
      label: e.label ?? null,
      color: e.color,
      visibility: e.visibility,
      startAt: e.startAt instanceof Date ? e.startAt.toISOString() : e.startAt,
      endAt: e.endAt instanceof Date ? e.endAt.toISOString() : e.endAt,
      allDay: e.allDay,
      isRecurring: e.isRecurring,
      recurrencePattern: e.recurrencePattern ?? null,
      recurrenceInterval: e.recurrenceInterval ?? 1,
      recurrenceEndAt: e.recurrenceEndAt ? (e.recurrenceEndAt instanceof Date ? e.recurrenceEndAt.toISOString() : e.recurrenceEndAt) : null,
      parentEventId: e.parentEventId ?? null,
      prospectOrgName: e.prospectOrgName ?? null,
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

    const [events, pendingCount] = await Promise.all([
      this.prisma.calendarEvent.findMany({
        where: {
          organizationId,
          ...dateOverlap,
          OR: [
            // Org-wide events — visible to everyone in the org
            { visibility: 'ORG_WIDE' as any },
            // Events I created
            { createdById: employee.id },
            // Events I was directly invited to
            { invitations: { some: { inviteeId: employee.id } } },
            // Recurring children whose parent event I was invited to
            { parentEvent: { invitations: { some: { inviteeId: employee.id } } } },
          ],
        },
        include: eventInclude,
        orderBy: { startAt: 'asc' },
      }),

      this.prisma.eventInvitation.count({ where: { inviteeId: employee.id, status: 'PENDING' } }),
    ]);

    return {
      employeeId: employee.id,
      pendingInvitationsCount: pendingCount,
      events: events.map((e) => this.mapCalendarEvent(e, employee.id)),
    };
  }

  // ── Unified agenda (CalendarEvent + ConsultancyVisit + VisitRequest + CalendarBlock) ──

  private static readonly VISIT_STATUS_COLOR: Record<string, string> = {
    TENTATIVE: 'BANANA', CONFIRMED: 'SAGE', COMPLETED: 'PEACOCK', CANCELLED: 'GRAPHITE',
  };

  /** Synthetic (non-persisted) birthday items sourced from Employee.dateOfBirth. */
  private async getBirthdays(year: number, month: number, organizationId: string) {
    const employees = await this.prisma.employee.findMany({
      where: { organizationId, dateOfBirth: { not: null } },
      select: { id: true, firstName: true, lastName: true, avatarUrl: true, dateOfBirth: true },
    });

    const items: any[] = [];
    for (const emp of employees) {
      const dob = emp.dateOfBirth!;
      const dobMonth = dob.getMonth() + 1;
      if (dobMonth !== month) continue;

      let day = dob.getDate();
      // Clamp Feb 29 to Feb 28 in non-leap years
      if (dobMonth === 2 && day === 29) {
        const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
        if (!isLeap) day = 28;
      }

      const date = new Date(year, month - 1, day);
      items.push({
        id: `birthday-${emp.id}-${year}`,
        kind: 'BIRTHDAY',
        title: `${emp.firstName} ${emp.lastName}'s Birthday`,
        startAt: new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0).toISOString(),
        endAt: new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59).toISOString(),
        allDay: true,
        color: 'FLAMINGO',
        detail: { employeeId: emp.id, name: `${emp.firstName} ${emp.lastName}`, avatarUrl: emp.avatarUrl ?? null },
      });
    }
    return items;
  }

  async getAgenda(year: number, month: number, userId: string, organizationId: string, roleLevel: string) {
    const [eventsResult, visitsResult, birthdays] = await Promise.all([
      this.getEvents(year, month, userId, organizationId),
      this.getMonthVisits(year, month, organizationId, roleLevel),
      this.getBirthdays(year, month, organizationId),
    ]);

    const items: any[] = [...birthdays];

    for (const e of eventsResult.events) {
      items.push({
        id: e.id, kind: e.prospectOrgName ? 'CLIENT_VISIT' : 'EVENT', title: e.title,
        startAt: e.startAt, endAt: e.endAt, allDay: e.allDay,
        color: e.color, detail: e,
      });
    }

    for (const v of visitsResult.visits) {
      const endDateStr = v.endDate ?? v.date;
      items.push({
        id: v.id, kind: 'VISIT',
        title: `${v.title}${v.clientOrgName ? ' — ' + v.clientOrgName : ''}`,
        startAt: new Date(`${v.date}T${v.startTime || '00:00'}:00`).toISOString(),
        endAt: new Date(`${endDateStr}T${v.endTime || '23:59'}:00`).toISOString(),
        allDay: !v.startTime,
        color: CalendarService.VISIT_STATUS_COLOR[v.status] ?? 'PEACOCK',
        orgColor: v.clientOrgColor ?? null,
        detail: v,
      });
    }

    for (const r of visitsResult.requests) {
      // An approved request that's been converted into a visit is represented
      // by its VISIT item above — don't show it twice.
      if (r.status === 'APPROVED' && r.visitId) continue;
      items.push({
        id: r.id, kind: 'REQUEST',
        title: `Visit request${r.organizationName ? ' — ' + r.organizationName : ''}`,
        startAt: new Date(`${r.date}T00:00:00`).toISOString(),
        endAt: new Date(`${r.date}T23:59:59`).toISOString(),
        allDay: true, color: 'GRAPE', detail: r,
      });
    }

    for (const b of visitsResult.blocks) {
      const defaultTitle = b.type === 'HOLIDAY'
        ? 'Holiday'
        : (b.employeeName ? `${b.employeeName} — Out of Office` : 'Out of Office');
      items.push({
        id: b.id, kind: 'BLOCK',
        title: b.label || defaultTitle,
        startAt: new Date(`${b.date}T00:00:00`).toISOString(),
        endAt: new Date(`${b.date}T23:59:59`).toISOString(),
        allDay: true, color: 'TOMATO', detail: b,
      });
    }

    items.sort((a, b) => a.startAt.localeCompare(b.startAt));

    return {
      employeeId: eventsResult.employeeId,
      pendingInvitationsCount: eventsResult.pendingInvitationsCount,
      busyDates: visitsResult.busyDates,
      items,
    };
  }

  async createEvent(dto: CreateCalendarEventDto, userId: string, organizationId: string, roleLevel: string) {
    const employee = await this.resolveEmployee(userId, organizationId);

    const orgManagerRoles = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HR] as string[];
    if (dto.visibility === 'ORG_WIDE' && !orgManagerRoles.includes(roleLevel)) {
      throw new ForbiddenException('Only Management, Admin, or HR can create organization-wide events');
    }

    const startAt = new Date(dto.startAt);
    const endAt   = new Date(dto.endAt);

    if (dto.inviteeIds?.length) {
      await this.assertInviteesNotOOO(dto.inviteeIds, startAt, endAt);
    }

    // Check each invitee for approved leave overlap
    const onLeaveWarnings: { employeeId: string; name: string }[] = [];
    if (dto.inviteeIds?.length) {
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

    const interval = dto.recurrenceInterval ?? 1;

    const event = await (this.prisma.calendarEvent as any).create({
      data: {
        title: dto.title,
        description: dto.description,
        label: dto.label,
        color: dto.color ?? 'PEACOCK',
        visibility: dto.visibility ?? 'PRIVATE',
        startAt,
        endAt,
        allDay: dto.allDay ?? false,
        organizationId,
        createdById: employee.id,
        isRecurring: dto.isRecurring ?? false,
        recurrencePattern: dto.recurrencePattern ?? null,
        recurrenceInterval: interval,
        recurrenceEndAt: dto.recurrenceEndAt ? new Date(dto.recurrenceEndAt) : null,
        prospectOrgName: dto.prospectOrgName ?? null,
      },
    });

    // Recurrence children
    if (dto.isRecurring && dto.recurrencePattern && dto.recurrenceEndAt) {
      const recEnd   = new Date(dto.recurrenceEndAt);
      const duration = endAt.getTime() - startAt.getTime();
      let current    = new Date(startAt);
      const children: any[] = [];

      while (children.length < 365) {
        current = this.nextEventDate(current, dto.recurrencePattern, interval);
        if (current > recEnd) break;
        children.push({
          title: dto.title, description: dto.description,
          label: dto.label, color: dto.color ?? 'PEACOCK', visibility: dto.visibility ?? 'PRIVATE',
          organizationId, createdById: employee.id,
          startAt: new Date(current), endAt: new Date(current.getTime() + duration),
          allDay: dto.allDay ?? false,
          isRecurring: true, recurrencePattern: dto.recurrencePattern,
          recurrenceInterval: interval,
          recurrenceEndAt: new Date(dto.recurrenceEndAt),
          parentEventId: event.id,
        });
      }
      if (children.length) await this.prisma.calendarEvent.createMany({ data: children });
    }

    // Guests — any event can invite anyone, everyone can accept/decline
    if (dto.inviteeIds?.length) {
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
            title: 'Event invitation',
            message: `${employee.firstName} ${employee.lastName} invited you to "${dto.title}" on ${startAt.toDateString()}`,
            actionUrl: '/calendar',
            metadata: { eventId: event.id },
          })),
        );
      }
    }

    return { event, onLeaveWarnings };
  }

  async updateEvent(id: string, dto: UpdateCalendarEventDto, userId: string, organizationId: string, roleLevel?: string) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const event = await this.prisma.calendarEvent.findUnique({
      where: { id },
      select: { id: true, createdById: true, parentEventId: true, startAt: true, endAt: true },
    });
    if (!event) throw new NotFoundException('Event not found');
    if (event.createdById !== employee.id) throw new ForbiddenException('Only the event creator can update this event');

    const orgManagerRoles = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HR] as string[];
    if (dto.visibility === 'ORG_WIDE' && roleLevel && !orgManagerRoles.includes(roleLevel)) {
      throw new ForbiddenException('Only Management, Admin, or HR can make an event organization-wide');
    }

    const data: any = {};
    if (dto.title       !== undefined) data.title       = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.label       !== undefined) data.label       = dto.label;
    if (dto.color       !== undefined) data.color       = dto.color;
    if (dto.visibility  !== undefined) data.visibility  = dto.visibility;
    if (dto.startAt     !== undefined) data.startAt     = new Date(dto.startAt);
    if (dto.endAt       !== undefined) data.endAt       = new Date(dto.endAt);
    if (dto.allDay      !== undefined) data.allDay      = dto.allDay;
    if (dto.prospectOrgName !== undefined) data.prospectOrgName = dto.prospectOrgName;

    if (dto.addInviteeIds?.length) {
      const effectiveStart = dto.startAt ? new Date(dto.startAt) : event.startAt;
      const effectiveEnd   = dto.endAt   ? new Date(dto.endAt)   : event.endAt;
      await this.assertInviteesNotOOO(dto.addInviteeIds, effectiveStart, effectiveEnd);

      const targets = dto.addInviteeIds.filter((inviteeId) => inviteeId !== employee.id);
      if (targets.length) {
        await this.prisma.eventInvitation.createMany({
          data: targets.map((inviteeId) => ({ eventId: id, inviteeId })),
          skipDuplicates: true,
        });
        await this.notifications.createMany(
          targets.map((inviteeId) => ({
            employeeId: inviteeId,
            type: 'ACTION_REQUIRED' as any,
            module: 'CALENDAR',
            title: 'Event invitation',
            message: `${employee.firstName} ${employee.lastName} invited you to "${dto.title ?? 'an event'}"`,
            actionUrl: '/calendar',
            metadata: { eventId: id },
          })),
        );
      }
    }
    if (dto.removeInviteeIds?.length) {
      await this.prisma.eventInvitation.deleteMany({
        where: { eventId: id, inviteeId: { in: dto.removeInviteeIds } },
      });
    }

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
            id: true, title: true, description: true, label: true, color: true, visibility: true,
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
              id: true, title: true, label: true, color: true, startAt: true, endAt: true,
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

  // ── Visit Month Plans ──────────────────────────────────────────────────────

  async getVisitMonthPlan(clientOrgId: string, year: number, month: number) {
    return this.prisma.visitMonthPlan.findUnique({
      where: { clientOrgId_year_month: { clientOrgId, year, month } },
      include: { slots: { orderBy: { slotIndex: 'asc' } } },
    });
  }

  async getAllVisitMonthPlans(year: number, month: number) {
    return this.prisma.visitMonthPlan.findMany({
      where: { year, month },
      include: {
        slots: { orderBy: { slotIndex: 'asc' } },
        clientOrg: { select: { id: true, name: true, logoUrl: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async upsertVisitMonthPlan(
    clientOrgId: string,
    year: number,
    month: number,
    plannedDays: number,
    userId: string,
  ) {
    const existing = await this.prisma.visitMonthPlan.findUnique({
      where: { clientOrgId_year_month: { clientOrgId, year, month } },
      include: { slots: { orderBy: { slotIndex: 'asc' } } },
    });

    if (existing) {
      const currentCount = existing.slots.length;
      await this.prisma.visitMonthPlan.update({
        where: { id: existing.id },
        data: { plannedDays },
      });

      if (plannedDays > currentCount) {
        await this.prisma.visitPlanSlot.createMany({
          data: Array.from({ length: plannedDays - currentCount }, (_, i) => ({
            planId: existing.id,
            slotIndex: currentCount + i,
            updatedAt: new Date(),
          })),
        });
      } else if (plannedDays < currentCount) {
        await this.prisma.visitPlanSlot.deleteMany({
          where: { planId: existing.id, slotIndex: { gte: plannedDays } },
        });
      }

      return this.prisma.visitMonthPlan.findUnique({
        where: { id: existing.id },
        include: { slots: { orderBy: { slotIndex: 'asc' } } },
      });
    }

    return this.prisma.visitMonthPlan.create({
      data: {
        clientOrgId,
        year,
        month,
        plannedDays,
        createdById: userId,
        slots: {
          create: Array.from({ length: plannedDays }, (_, i) => ({
            slotIndex: i,
            updatedAt: new Date(),
          })),
        },
      },
      include: { slots: { orderBy: { slotIndex: 'asc' } } },
    });
  }

  async updateVisitPlanSlot(
    planId: string,
    slotIndex: number,
    data: { date?: string; agenda?: string },
  ) {
    const updateData: Record<string, unknown> = {};
    if (data.date !== undefined) updateData.date = data.date ? new Date(data.date) : null;
    if (data.agenda !== undefined) updateData.agenda = data.agenda || null;
    return this.prisma.visitPlanSlot.update({
      where: { planId_slotIndex: { planId, slotIndex } },
      data: updateData,
    });
  }

  // ── Custom user filters (Google Calendar-style) ──────────────────────────

  async getFilters(userId: string, organizationId: string) {
    const employee = await this.resolveEmployee(userId, organizationId);
    return (this.prisma as any).calendarFilter.findMany({
      where: { employeeId: employee.id },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createFilter(dto: CreateCalendarFilterDto, userId: string, organizationId: string) {
    const employee = await this.resolveEmployee(userId, organizationId);
    return (this.prisma as any).calendarFilter.create({
      data: {
        employeeId: employee.id,
        name: dto.name,
        kinds: dto.kinds ?? [],
        orgIds: dto.orgIds ?? [],
        colors: dto.colors ?? [],
      },
    });
  }

  async deleteFilter(id: string, userId: string, organizationId: string) {
    const employee = await this.resolveEmployee(userId, organizationId);
    const filter = await (this.prisma as any).calendarFilter.findUnique({ where: { id }, select: { id: true, employeeId: true } });
    if (!filter || filter.employeeId !== employee.id) throw new NotFoundException('Filter not found');
    await (this.prisma as any).calendarFilter.delete({ where: { id } });
    return { message: 'Filter removed' };
  }
}
