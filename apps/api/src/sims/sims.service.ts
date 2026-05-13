import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SuggestionStatus } from 'db';
import { PrismaService } from 'src/prisma/prisma.service';
import { Role } from 'src/common/enum/role.enum';
import {
  CreateSuggestionDto,
  QuerySuggestionsDto,
  ReviewSuggestionDto,
  AssignCommitteeDto,
  ClarifyDto,
} from './dto/sims.dto';
import { NotificationsService } from 'src/notifications/notifications.service';

// SUBMITTED removed — suggestions begin life at UNDER_REVIEW
const ALLOWED_TRANSITIONS: Record<SuggestionStatus, SuggestionStatus[]> = {
  UNDER_REVIEW:               ['ON_HOLD', 'SELECTED_FOR_SGA', 'APPROVED_FOR_IMPLEMENTATION', 'REJECTED'],
  ON_HOLD:                    ['UNDER_REVIEW', 'SELECTED_FOR_SGA', 'APPROVED_FOR_IMPLEMENTATION', 'REJECTED'],
  SELECTED_FOR_SGA:           ['UNDER_REVIEW', 'ON_HOLD', 'APPROVED_FOR_IMPLEMENTATION', 'REJECTED'],
  APPROVED_FOR_IMPLEMENTATION: [],
  REJECTED:                   [],
};

const employeeSelect = {
  id: true,
  firstName: true,
  lastName: true,
  department: { select: { id: true, name: true } },
};

const committeeSelect = { id: true, name: true, type: true };

const reviewInclude = {
  reviews: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true,
      statusChanged: true,
      note: true,
      createdAt: true,
      reviewer: { select: { id: true, firstName: true, lastName: true } },
      reviewerCommittee: { select: committeeSelect },
    },
  },
};

const suggestionInclude = {
  employee: { select: employeeSelect },
  committee: { select: committeeSelect },
  ...reviewInclude,
};

@Injectable()
export class SimsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) { }

  private async resolveEmployee(userId: string, organizationId?: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { userId, ...(organizationId && { organizationId }) },
      select: { id: true, departmentId: true, organizationId: true },
    });
    if (!employee) throw new ForbiddenException('No employee profile linked to your account');
    return employee;
  }

  private maskAnonymous(suggestion: any) {
    if (!suggestion.isAnonymous) return suggestion;
    return { ...suggestion, employee: null };
  }

  // Submit new suggestion 

  async submitSuggestion(dto: CreateSuggestionDto, userId: string, organizationId: string) {
    const employee = await this.resolveEmployee(userId, organizationId);

    const suggestion = await this.prisma.suggestion.create({
      data: {
        title: dto.title,
        description: dto.description,
        categories: dto.categories,
        isAnonymous: dto.isAnonymous ?? false,
        status: 'UNDER_REVIEW',
        employeeId: employee.id,
        organizationId,
      }
    });

    // notify admins/management about new suggestion
    

    const admins = await this.prisma.employee.findMany({
      where: {
        organizationId,
        user: { organizations: { some: { organizationId, role: { name: { in: [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT] } } } } },
      },
      select: { id: true },
    });

    await this.notifications.createMany(
      admins.map((a) => ({
        employeeId: a.id,
        type: 'INFO' as const,
        module: 'SIMS',
        title: 'New suggestion submitted',
        message: `A new suggestion "${suggestion.title}" has been submitted and is awaiting committee assignment.`,
        actionUrl: `/sims/${suggestion.id}`,
        metadata: { suggestionId: suggestion.id },
      }))
    )

    return suggestion;
  }

  // Assign committee (Admin / Management) 

  async assignCommittee(suggestionId: string, dto: AssignCommitteeDto, organizationId: string) {
    const suggestion = await this.prisma.suggestion.findUnique({ where: { id: suggestionId } });
    if (!suggestion || suggestion.organizationId !== organizationId) {
      throw new NotFoundException('Suggestion not found');
    }
    if (ALLOWED_TRANSITIONS[suggestion.status].length === 0) {
      throw new BadRequestException('Cannot assign a committee to a finalised suggestion');
    }

    const committee = await this.prisma.steeringCommittee.findUnique({ where: { id: dto.committeeId } });
    if (!committee || committee.organizationId !== organizationId) {
      throw new NotFoundException('Committee not found');
    }

    const updated = await this.prisma.suggestion.update({
      where: { id: suggestionId },
      data: { committeeId: dto.committeeId },
      include: suggestionInclude,
    });

    // notify committee members about new assignment
    const members = await this.prisma.steeringCommitteeMember.findMany({
      where: { committeeId: dto.committeeId },
      select: { employeeId: true },
    });

    await this.notifications.createMany(
      members.map((m) => ({
        employeeId: m.employeeId,
        type: 'ACTION_REQUIRED' as const,
        module: 'SIMS',
        title: 'New suggestion in your queue',
        message: `"${updated.title}" has been assigned to your committee for review.`,
        actionUrl: `/sims/${suggestionId}`,
        metadata: { suggestionId },
      })),
    );

    return updated;
  }

  // Query
  async getMySuggestions(userId: string) {
    const employee = await this.resolveEmployee(userId);
    return this.prisma.suggestion.findMany({
      where: { employeeId: employee.id },
      orderBy: { createdAt: 'desc' },
      include: { committee: { select: committeeSelect }, ...reviewInclude },
    });
  }

  async getDepartmentSuggestions(userId: string, query: QuerySuggestionsDto) {
    const employee = await this.resolveEmployee(userId);
    if (!employee.departmentId) throw new ForbiddenException('Your account is not assigned to a department');

    const { status, category, committeeId, page, limit } = query;
    const skip = (page - 1) * limit;

    const where: any = {
      organizationId: employee.organizationId,
      employee: { departmentId: employee.departmentId },
      ...(status && { status }),
      ...(category && { categories: { has: category } }),
      ...(committeeId && { committeeId }),
    };

    const [data, total] = await Promise.all([
      this.prisma.suggestion.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' }, include: suggestionInclude }),
      this.prisma.suggestion.count({ where }),
    ]);

    return {
      data: data.map(this.maskAnonymous),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async getAllSuggestions(organizationId: string, query: QuerySuggestionsDto) {
    const { status, category, departmentId, committeeId, page, limit } = query;
    const skip = (page - 1) * limit;

    const where: any = {
      organizationId,
      ...(status && { status }),
      ...(category && { categories: { has: category } }),
      ...(departmentId && { employee: { departmentId } }),
      ...(committeeId && { committeeId }),
    };

    const [data, total] = await Promise.all([
      this.prisma.suggestion.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' }, include: suggestionInclude }),
      this.prisma.suggestion.count({ where }),
    ]);

    return {
      data: data.map(this.maskAnonymous),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  // Returns only suggestions assigned to the caller's committees
  async getCommitteeSuggestions(userId: string, organizationId: string, query: QuerySuggestionsDto) {
    const employee = await this.resolveEmployee(userId, organizationId);

    const memberships = await this.prisma.steeringCommitteeMember.findMany({
      where: { employeeId: employee.id, committee: { organizationId } },
      select: { committeeId: true },
    });
    if (memberships.length === 0) throw new ForbiddenException('You are not a member of any steering committee');

    const committeeIds = memberships.map((m) => m.committeeId);
    const { status, category, page, limit } = query;
    const skip = (page - 1) * limit;

    const where: any = {
      organizationId,
      committeeId: { in: committeeIds },
      ...(status && { status }),
      ...(category && { categories: { has: category } }),
    };

    const [data, total] = await Promise.all([
      this.prisma.suggestion.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' }, include: suggestionInclude }),
      this.prisma.suggestion.count({ where }),
    ]);

    return {
      data: data.map(this.maskAnonymous),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async getSuggestionById(id: string, userId: string, roleLevel: string, organizationId: string) {
    const suggestion = await this.prisma.suggestion.findUnique({
      where: { id },
      include: {
        employee: {
          select: {
            id: true, firstName: true, lastName: true,
            userId: true, departmentId: true,
            department: { select: { id: true, name: true } },
          },
        },
        committee: { select: committeeSelect },
        ...reviewInclude,
      },
    });

    if (!suggestion || suggestion.organizationId !== organizationId) {
      throw new NotFoundException('Suggestion not found');
    }

    if (roleLevel === Role.EMPLOYEE) {
      const employee = await this.resolveEmployee(userId);
      if (suggestion.employeeId !== employee.id) throw new ForbiddenException('You can only view your own suggestions');
      return suggestion;
    }

    if (roleLevel === Role.HOD) {
      const employee = await this.resolveEmployee(userId);
      if (suggestion.employee?.departmentId !== employee.departmentId) {
        throw new ForbiddenException('You can only view suggestions from your department');
      }
    }

    return this.maskAnonymous(suggestion);
  }

  async getSummary(userId: string, organizationId: string) {
    const employee = await this.resolveEmployee(userId);

    const [deptSuggestions, orgSuggestions] = await Promise.all([
      employee.departmentId
        ? this.prisma.suggestion.findMany({
          where: { organizationId, employee: { departmentId: employee.departmentId } },
          select: { status: true, categories: true },
        })
        : Promise.resolve([]),
      this.prisma.suggestion.findMany({
        where: { organizationId },
        select: { status: true, categories: true },
      }),
    ]);

    const summarise = (list: { status: SuggestionStatus; categories: string[] }[]) => {
      const byStatus: Record<string, number> = {};
      const byCategory: Record<string, number> = {};
      for (const s of list) {
        byStatus[s.status] = (byStatus[s.status] ?? 0) + 1;
        for (const c of s.categories) byCategory[c] = (byCategory[c] ?? 0) + 1;
      }
      return { total: list.length, byStatus, byCategory };
    };

    return {
      department: summarise(deptSuggestions),
      organization: summarise(orgSuggestions),
    };
  }

  // Review (committee members only)

  async reviewSuggestion(
    id: string,
    dto: ReviewSuggestionDto,
    userId: string,
    organizationId: string,
  ) {
    const suggestion = await this.prisma.suggestion.findUnique({ where: { id } });

    if (!suggestion || suggestion.organizationId !== organizationId) throw new NotFoundException('Suggestion not found');

    if (!suggestion.committeeId) {
      throw new BadRequestException('This suggestion has not been assigned to a committee yet');
    }

    const reviewer = await this.resolveEmployee(userId, organizationId);

    const membership = await this.prisma.steeringCommitteeMember.findUnique({
      where: { committeeId_employeeId: { committeeId: suggestion.committeeId, employeeId: reviewer.id } },
    });

    if (!membership) {
      throw new ForbiddenException('You are not a member of the committee assigned to this suggestion');
    }

    const allowed = ALLOWED_TRANSITIONS[suggestion.status];
    if (!allowed.includes(dto.statusChanged)) {
      throw new BadRequestException(`Cannot move suggestion from ${suggestion.status} to ${dto.statusChanged}`);
    }

    const review = await this.prisma.$transaction(async (tx) => {
      await tx.suggestion.update({ where: { id }, data: { status: dto.statusChanged } });
      return tx.suggestionReview.create({
        data: {
          suggestionId: id,
          reviewerId: reviewer.id,
          reviewerCommitteeId: suggestion.committeeId,
          statusChanged: dto.statusChanged,
          note: dto.note,
        },
        include: {
          reviewer: { select: { id: true, firstName: true, lastName: true } },
          reviewerCommittee: { select: committeeSelect },
        },
      });
    });

    // notify employee about status change
    await this.notifications.create({
      employeeId: suggestion.employeeId,
      type: dto.statusChanged === 'REJECTED' ? 'ACTION_REQUIRED' : 'INFO',
      module: 'SIMS',
      title: `Your suggestion has been ${dto.statusChanged.toLowerCase().replace(/_/g, ' ')}`,
      message: dto.note
        ? `Reviewer note: ${dto.note}`
        : `Your suggestion "${suggestion.title}" status has been updated.`,
      actionUrl: `/sims/${id}`,
      metadata: { suggestionId: id, newStatus: dto.statusChanged },
    });

    return review;
  }

}
