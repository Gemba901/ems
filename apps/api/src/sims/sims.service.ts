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

// Defines which statuses a reviewer is allowed to move a suggestion to
const ALLOWED_TRANSITIONS: Record<SuggestionStatus, SuggestionStatus[]> = {
  SUBMITTED: ['UNDER_REVIEW', 'ARCHIVED'],
  UNDER_REVIEW: ['NEEDS_CLARIFICATION', 'APPROVED', 'REJECTED', 'ARCHIVED'],
  NEEDS_CLARIFICATION: ['UNDER_REVIEW', 'ARCHIVED'],
  APPROVED: ['IMPLEMENTED', 'ARCHIVED'],
  REJECTED: ['ARCHIVED'],
  IMPLEMENTED: ['ARCHIVED'],
  ARCHIVED: [],
};

const reviewInclude = {
  reviews: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true,
      statusChanged: true,
      note: true,
      createdAt: true,
      reviewer: {
        select: { id: true, firstName: true, lastName: true },
      },
    },
  },
};

@Injectable()
export class SimsService {
  constructor(private prisma: PrismaService) {}

  // Resolves the employee record for the currently authenticated user
  private async resolveEmployee(userId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { userId },
      select: { id: true, departmentId: true },
    });
    if (!employee) throw new ForbiddenException('No employee profile linked to your account');
    return employee;
  }

  // Strips submitter identity from a suggestion when isAnonymous is true
  private maskAnonymous(suggestion: any) {
    if (!suggestion.isAnonymous) return suggestion;
    return { ...suggestion, employee: null };
  }

  async submitSuggestion(
    dto: CreateSuggestionDto,
    userId: string,
    organizationId: string,
  ) {
    const employee = await this.resolveEmployee(userId);

    return this.prisma.suggestion.create({
      data: {
        title: dto.title,
        description: dto.description,
        category: dto.category,
        priority: dto.priority ?? 'MEDIUM',
        isAnonymous: dto.isAnonymous ?? false,
        employeeId: employee.id,
        organizationId,
      },
    });
  }

  // Employee: fetch only their own submissions with full review history
  async getMySuggestions(userId: string) {
    const employee = await this.resolveEmployee(userId);

    return this.prisma.suggestion.findMany({
      where: { employeeId: employee.id },
      orderBy: { createdAt: 'desc' },
      include: reviewInclude,
    });
  }

  // HOD: fetch all suggestions from their department
  async getDepartmentSuggestions(userId: string, query: QuerySuggestionsDto) {
    const employee = await this.resolveEmployee(userId);

    if (!employee.departmentId) {
      throw new ForbiddenException('Your account is not assigned to a department');
    }

    const { status, category, priority, page, limit } = query;
    const skip = (page - 1) * limit;

    const where: any = {
      organizationId: (await this.prisma.employee.findUnique({
        where: { id: employee.id },
        select: { organizationId: true },
      }))!.organizationId,
      employee: { departmentId: employee.departmentId },
      ...(status && { status }),
      ...(category && { category }),
      ...(priority && { priority }),
    };

    const [data, total] = await Promise.all([
      this.prisma.suggestion.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          employee: {
            select: { id: true, firstName: true, lastName: true, department: { select: { id: true, name: true } } },
          },
          ...reviewInclude,
        },
      }),
      this.prisma.suggestion.count({ where }),
    ]);

    return {
      data: data.map(this.maskAnonymous),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  // Admin/Management: fetch all suggestions org-wide with optional filters
  async getAllSuggestions(organizationId: string, query: QuerySuggestionsDto) {
    const { status, category, priority, departmentId, page, limit } = query;
    const skip = (page - 1) * limit;

    const where: any = {
      organizationId,
      ...(status && { status }),
      ...(category && { category }),
      ...(priority && { priority }),
      ...(departmentId && { employee: { departmentId } }),
    };

    const [data, total] = await Promise.all([
      this.prisma.suggestion.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              department: { select: { id: true, name: true } },
            },
          },
          ...reviewInclude,
        },
      }),
      this.prisma.suggestion.count({ where }),
    ]);

    return {
      data: data.map(this.maskAnonymous),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  // Single suggestion — access rules enforced here
  async getSuggestionById(
    id: string,
    userId: string,
    roleLevel: string,
    organizationId: string,
  ) {
    const suggestion = await this.prisma.suggestion.findUnique({
      where: { id },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            userId: true,
            departmentId: true,
            department: { select: { id: true, name: true } },
          },
        },
        ...reviewInclude,
      },
    });

    if (!suggestion || suggestion.organizationId !== organizationId) {
      throw new NotFoundException('Suggestion not found');
    }

    if (roleLevel === Role.EMPLOYEE) {
      // Employees may only view their own suggestions
      const employee = await this.resolveEmployee(userId);
      if (suggestion.employeeId !== employee.id) {
        throw new ForbiddenException('You can only view your own suggestions');
      }
      return suggestion;
    }

    if (roleLevel === Role.HOD) {
      // HOD may only view suggestions from their department
      const employee = await this.resolveEmployee(userId);
      if (suggestion.employee.departmentId !== employee.departmentId) {
        throw new ForbiddenException('You can only view suggestions from your department');
      }
    }

    return this.maskAnonymous(suggestion);
  }

  async reviewSuggestion(
    id: string,
    dto: ReviewSuggestionDto,
    userId: string,
    roleLevel: string,
    organizationId: string,
  ) {
    const suggestion = await this.prisma.suggestion.findUnique({
      where: { id },
      include: { employee: { select: { departmentId: true } } },
    });

    if (!suggestion || suggestion.organizationId !== organizationId) {
      throw new NotFoundException('Suggestion not found');
    }

    // HOD can only review suggestions from their department
    if (roleLevel === Role.HOD) {
      const reviewer = await this.resolveEmployee(userId);
      if (suggestion.employee.departmentId !== reviewer.departmentId) {
        throw new ForbiddenException('You can only review suggestions from your department');
      }
    }

    const allowed = ALLOWED_TRANSITIONS[suggestion.status];
    if (!allowed.includes(dto.statusChanged)) {
      throw new BadRequestException(
        `Cannot move suggestion from ${suggestion.status} to ${dto.statusChanged}`,
      );
    }

    const reviewer = await this.resolveEmployee(userId);

    return this.prisma.$transaction(async (tx) => {
      await tx.suggestion.update({
        where: { id },
        data: { status: dto.statusChanged },
      });

      return tx.suggestionReview.create({
        data: {
          suggestionId: id,
          reviewerId: reviewer.id,
          statusChanged: dto.statusChanged,
          note: dto.note,
        },
        include: {
          reviewer: { select: { id: true, firstName: true, lastName: true } },
        },
      });
    });
  }
}
