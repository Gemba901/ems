import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SuggestionStatus } from 'db';
import { PrismaService } from 'src/prisma/prisma.service';
import { Role } from 'src/common/enum/role.enum';
import { CreateSuggestionDto, QuerySuggestionsDto, ReviewSuggestionDto } from './dto/sims.dto';

const ALLOWED_TRANSITIONS: Record<SuggestionStatus, SuggestionStatus[]> = {
  SUBMITTED: ['UNDER_REVIEW', 'ARCHIVED'],
  UNDER_REVIEW: ['NEEDS_CLARIFICATION', 'APPROVED', 'REJECTED', 'ARCHIVED'],
  NEEDS_CLARIFICATION: ['UNDER_REVIEW', 'ARCHIVED'],
  APPROVED: ['IMPLEMENTED', 'ARCHIVED'],
  REJECTED: ['ARCHIVED'],
  IMPLEMENTED: ['ARCHIVED'],
  ARCHIVED: [],
};

const employeeSelect = {
  id: true,
  firstName: true,
  lastName: true,
  department: { select: { id: true, name: true } },
};

const reviewInclude = {
  reviews: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true,
      statusChanged: true,
      note: true,
      createdAt: true,
      reviewer: { select: { id: true, firstName: true, lastName: true } },
      reviewerCommittee: { select: { id: true, name: true, type: true } },
    },
  },
};

@Injectable()
export class SimsService {
  constructor(private prisma: PrismaService) {}

  private async resolveEmployee(userId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { userId },
      select: { id: true, departmentId: true, organizationId: true },
    });
    if (!employee) throw new ForbiddenException('No employee profile linked to your account');
    return employee;
  }

  private maskAnonymous(suggestion: any) {
    if (!suggestion.isAnonymous) return suggestion;
    return { ...suggestion, employee: null };
  }

  async submitSuggestion(dto: CreateSuggestionDto, userId: string, organizationId: string) {
    const employee = await this.resolveEmployee(userId);

    return this.prisma.suggestion.create({
      data: {
        title: dto.title,
        description: dto.description,
        categories: dto.categories,
        isAnonymous: dto.isAnonymous ?? false,
        employeeId: employee.id,
        organizationId,
      },
    });
  }

  async getMySuggestions(userId: string) {
    const employee = await this.resolveEmployee(userId);
    return this.prisma.suggestion.findMany({
      where: { employeeId: employee.id },
      orderBy: { createdAt: 'desc' },
      include: reviewInclude,
    });
  }

  async getDepartmentSuggestions(userId: string, query: QuerySuggestionsDto) {
    const employee = await this.resolveEmployee(userId);
    if (!employee.departmentId) {
      throw new ForbiddenException('Your account is not assigned to a department');
    }

    const { status, category, page, limit } = query;
    const skip = (page - 1) * limit;

    const where: any = {
      organizationId: employee.organizationId,
      employee: { departmentId: employee.departmentId },
      ...(status && { status }),
      ...(category && { categories: { has: category } }),
    };

    const [data, total] = await Promise.all([
      this.prisma.suggestion.findMany({
        where, skip, take: limit,
        orderBy: { createdAt: 'desc' },
        include: { employee: { select: employeeSelect }, ...reviewInclude },
      }),
      this.prisma.suggestion.count({ where }),
    ]);

    return {
      data: data.map(this.maskAnonymous),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async getAllSuggestions(organizationId: string, query: QuerySuggestionsDto) {
    const { status, category, departmentId, page, limit } = query;
    const skip = (page - 1) * limit;

    const where: any = {
      organizationId,
      ...(status && { status }),
      ...(category && { categories: { has: category } }),
      ...(departmentId && { employee: { departmentId } }),
    };

    const [data, total] = await Promise.all([
      this.prisma.suggestion.findMany({
        where, skip, take: limit,
        orderBy: { createdAt: 'desc' },
        include: { employee: { select: employeeSelect }, ...reviewInclude },
      }),
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
          select: { id: true, firstName: true, lastName: true, userId: true, departmentId: true, department: { select: { id: true, name: true } } },
        },
        ...reviewInclude,
      },
    });

    if (!suggestion || suggestion.organizationId !== organizationId) {
      throw new NotFoundException('Suggestion not found');
    }

    if (roleLevel === Role.EMPLOYEE) {
      const employee = await this.resolveEmployee(userId);
      if (suggestion.employeeId !== employee.id) {
        throw new ForbiddenException('You can only view your own suggestions');
      }
      return suggestion;
    }

    if (roleLevel === Role.HOD) {
      const employee = await this.resolveEmployee(userId);
      if (suggestion.employee.departmentId !== employee.departmentId) {
        throw new ForbiddenException('You can only view suggestions from your department');
      }
    }

    return this.maskAnonymous(suggestion);
  }

  // Aggregated, anonymised summary available to all roles
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
        for (const c of s.categories) {
          byCategory[c] = (byCategory[c] ?? 0) + 1;
        }
      }
      return { total: list.length, byStatus, byCategory };
    };

    return {
      department: summarise(deptSuggestions),
      organization: summarise(orgSuggestions),
    };
  }

  async reviewSuggestion(id: string, dto: ReviewSuggestionDto, userId: string, roleLevel: string, organizationId: string) {
    const suggestion = await this.prisma.suggestion.findUnique({
      where: { id },
      include: { employee: { select: { departmentId: true } } },
    });

    if (!suggestion || suggestion.organizationId !== organizationId) {
      throw new NotFoundException('Suggestion not found');
    }

    const reviewer = await this.resolveEmployee(userId);

    if (roleLevel === Role.HOD) {
      if (suggestion.employee.departmentId !== reviewer.departmentId) {
        throw new ForbiddenException('You can only review suggestions from your department');
      }
    }

    let reviewerCommitteeId: string | null = null;
    if (roleLevel !== Role.SUPER_ADMIN) {
      const membership = await this.prisma.steeringCommitteeMember.findFirst({
        where: { employeeId: reviewer.id, committee: { organizationId } },
        select: { committeeId: true },
      });
      if (!membership) {
        throw new ForbiddenException('Only steering committee members can review suggestions');
      }
      reviewerCommitteeId = membership.committeeId;
    }

    const allowed = ALLOWED_TRANSITIONS[suggestion.status];
    if (!allowed.includes(dto.statusChanged)) {
      throw new BadRequestException(
        `Cannot move suggestion from ${suggestion.status} to ${dto.statusChanged}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.suggestion.update({ where: { id }, data: { status: dto.statusChanged } });
      return tx.suggestionReview.create({
        data: {
          suggestionId: id,
          reviewerId: reviewer.id,
          reviewerCommitteeId,
          statusChanged: dto.statusChanged,
          note: dto.note,
        },
        include: {
          reviewer: { select: { id: true, firstName: true, lastName: true } },
          reviewerCommittee: { select: { id: true, name: true, type: true } },
        },
      });
    });
  }
}
