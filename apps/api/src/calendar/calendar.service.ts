import {
  Injectable, NotFoundException, ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Role } from 'src/common/enum/role.enum';
import {
  CreateVisitDto, UpdateVisitDto, CreateVisitRequestDto, RespondToRequestDto,
} from './dto/calendar.dto';

const ORG_SELECT = { id: true, name: true, logoUrl: true };

@Injectable()
export class CalendarService {
  constructor(private prisma: PrismaService) {}

  private isGemba(roleLevel: string) {
    return roleLevel === Role.SUPER_ADMIN;
  }

  // ── Visits ────────────────────────────────────────────────────────────────

  /** Returns all visits for a month. Privacy-aware. */
  async getMonthVisits(
    year: number,
    month: number,
    organizationId: string,
    roleLevel: string,
  ) {
    const start = new Date(year, month - 1, 1);
    const end   = new Date(year, month, 0, 23, 59, 59);

    const visits = await this.prisma.consultancyVisit.findMany({
      where: {
        date: { gte: start, lte: end },
        // CANCELLED visits are still shown so clients know the slot freed up
      },
      select: {
        id: true,
        title: true,
        clientOrgId: true,
        clientOrg: { select: ORG_SELECT },
        date: true,
        startTime: true,
        endTime: true,
        status: true,
        notes: true,
        internalNotes: true,
      },
      orderBy: { date: 'asc' },
    });

    // Also fetch pending requests for this org (so client can see their own)
    const requests = await this.prisma.visitRequest.findMany({
      where: {
        organizationId: this.isGemba(roleLevel) ? undefined : organizationId,
        requestedDate: { gte: start, lte: end },
      },
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

    const isAdmin = this.isGemba(roleLevel);

    const mappedVisits = visits.map((v) => {
      const isOwn = v.clientOrgId === organizationId;

      if (isAdmin) {
        return {
          id: v.id, type: 'VISIT' as const,
          date: v.date.toISOString().split('T')[0],
          startTime: v.startTime, endTime: v.endTime,
          status: v.status, isOwn: true,
          title: v.title,
          clientOrgId: v.clientOrgId, clientOrgName: v.clientOrg.name,
          notes: v.notes, internalNotes: v.internalNotes,
        };
      }

      if (isOwn) {
        return {
          id: v.id, type: 'VISIT' as const,
          date: v.date.toISOString().split('T')[0],
          startTime: v.startTime, endTime: v.endTime,
          status: v.status, isOwn: true,
          title: v.title,
          clientOrgId: v.clientOrgId, clientOrgName: v.clientOrg.name,
          notes: v.notes,
          internalNotes: undefined,
        };
      }

      // Another org's visit — show only as occupied (no details)
      return {
        id: v.id, type: 'VISIT' as const,
        date: v.date.toISOString().split('T')[0],
        startTime: v.startTime, endTime: v.endTime,
        status: v.status, isOwn: false,
        // No title, no org info, no notes
      };
    });

    const mappedRequests = requests.map((r) => ({
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

    return { visits: mappedVisits, requests: mappedRequests };
  }

  /** SUPER_ADMIN: create a visit */
  async createVisit(dto: CreateVisitDto, userId: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: dto.clientOrgId }, select: { id: true } });
    if (!org) throw new NotFoundException('Client organization not found');

    return this.prisma.consultancyVisit.create({
      data: {
        title: dto.title,
        clientOrgId: dto.clientOrgId,
        date: new Date(dto.date),
        startTime: dto.startTime,
        endTime: dto.endTime,
        status: dto.status ?? 'TENTATIVE',
        notes: dto.notes,
        internalNotes: dto.internalNotes,
        createdById: userId,
      },
      select: {
        id: true, title: true, date: true, startTime: true, endTime: true,
        status: true, notes: true, internalNotes: true,
        clientOrg: { select: ORG_SELECT },
      },
    });
  }

  /** SUPER_ADMIN: update a visit */
  async updateVisit(id: string, dto: UpdateVisitDto) {
    const visit = await this.prisma.consultancyVisit.findUnique({ where: { id }, select: { id: true } });
    if (!visit) throw new NotFoundException('Visit not found');

    const data: Record<string, unknown> = {};
    if (dto.title         !== undefined) data.title         = dto.title;
    if (dto.clientOrgId   !== undefined) data.clientOrgId   = dto.clientOrgId;
    if (dto.date          !== undefined) data.date          = new Date(dto.date);
    if (dto.startTime     !== undefined) data.startTime     = dto.startTime;
    if (dto.endTime       !== undefined) data.endTime       = dto.endTime;
    if (dto.status        !== undefined) data.status        = dto.status;
    if (dto.notes         !== undefined) data.notes         = dto.notes;
    if (dto.internalNotes !== undefined) data.internalNotes = dto.internalNotes;

    return this.prisma.consultancyVisit.update({
      where: { id },
      data,
      select: {
        id: true, title: true, date: true, startTime: true, endTime: true,
        status: true, notes: true, internalNotes: true,
        clientOrg: { select: ORG_SELECT },
      },
    });
  }

  /** SUPER_ADMIN: delete a visit */
  async deleteVisit(id: string) {
    const visit = await this.prisma.consultancyVisit.findUnique({ where: { id }, select: { id: true } });
    if (!visit) throw new NotFoundException('Visit not found');
    await this.prisma.consultancyVisit.delete({ where: { id } });
    return { message: 'Visit deleted' };
  }

  // ── Visit Requests ────────────────────────────────────────────────────────

  /** Any client: submit a visit request */
  async createRequest(dto: CreateVisitRequestDto, organizationId: string, userId: string) {
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

  /** SUPER_ADMIN: all requests; others: own org only */
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

  /** SUPER_ADMIN: approve or reject a request */
  async respondToRequest(id: string, dto: RespondToRequestDto) {
    const req = await this.prisma.visitRequest.findUnique({ where: { id }, select: { id: true } });
    if (!req) throw new NotFoundException('Request not found');
    return this.prisma.visitRequest.update({
      where: { id },
      data: { status: dto.status, responseNote: dto.responseNote },
      select: { id: true, status: true, responseNote: true, organization: { select: ORG_SELECT } },
    });
  }

  /** SUPER_ADMIN: list client organizations — excludes the admin/platform org */
  async getClientOrganizations() {
    return (this.prisma.organization as any).findMany({
      where:   { isAdminOrg: false },
      select:  ORG_SELECT,
      orderBy: { name: 'asc' },
    });
  }

  /** All roles: return the platform company (admin org), or null if not set */
  async getAdminOrg() {
    return (this.prisma.organization as any).findFirst({
      where:  { isAdminOrg: true },
      select: { ...ORG_SELECT, isAdminOrg: true },
    });
  }
}
