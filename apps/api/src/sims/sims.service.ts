import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SuggestionStatus, ImplementationStatus } from 'db';
import { PrismaService } from 'src/prisma/prisma.service';
import { Role } from 'src/common/enum/role.enum';
import {
  CreateSuggestionDto,
  QuerySuggestionsDto,
  ReviewSuggestionDto,
  UpdateImplementationDto,
} from './dto/sims.dto';
import { NotificationsService } from 'src/notifications/notifications.service';

// Suggestions begin life at UNDER_REVIEW
const ALLOWED_TRANSITIONS: Record<SuggestionStatus, SuggestionStatus[]> = {
  UNDER_REVIEW:               ['ON_HOLD', 'SELECTED_FOR_SGA', 'APPROVED_FOR_IMPLEMENTATION', 'REJECTED'],
  ON_HOLD:                    ['UNDER_REVIEW', 'SELECTED_FOR_SGA', 'APPROVED_FOR_IMPLEMENTATION', 'REJECTED'],
  SELECTED_FOR_SGA:           ['UNDER_REVIEW', 'ON_HOLD', 'APPROVED_FOR_IMPLEMENTATION', 'REJECTED'],
  APPROVED_FOR_IMPLEMENTATION: ['REJECTED', 'SELECTED_FOR_SGA'],
  REJECTED:                   [],
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
    },
  },
};

const suggestionInclude = {
  employee: { select: employeeSelect },
  hod: { select: employeeSelect },
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

  private async findDepartmentHODs(departmentId: string, organizationId: string) {
    const hods = await this.prisma.employee.findMany({
      where: {
        departmentId,
        organizationId,
        user: {
          organizations: {
            some: {
              organizationId,
              role: { name: Role.HOD },
            },
          },
        },
      },
      select: { id: true },
    });
    return hods.map((h) => h.id);
  }

  private maskAnonymous(suggestion: any) {
    if (!suggestion.isAnonymous) return suggestion;
    return { ...suggestion, employee: null };
  }

  // Submit new suggestion 

  async submitSuggestion(dto: CreateSuggestionDto, userId: string, organizationId: string) {
    const employee = await this.resolveEmployee(userId, organizationId);

    if (!employee.departmentId) {
        throw new BadRequestException('You must be assigned to a department to submit a suggestion');
    }

    const hodIds = await this.findDepartmentHODs(employee.departmentId, organizationId);
    
    const suggestion = await this.prisma.suggestion.create({
      data: {
        title: dto.title,
        description: dto.description,
        categories: dto.categories,
        isAnonymous: dto.isAnonymous ?? false,
        imageUrl: dto.imageUrl ?? null,
        status: 'UNDER_REVIEW',
        employeeId: employee.id,
        organizationId,
        hodId: hodIds[0] || null,
      }
    });

    // notify HODs about new suggestion
    for (const hodId of hodIds) {
        // Don't notify yourself if you are an HOD submitting a suggestion
        if (hodId === employee.id) continue;

        await this.notifications.create({
            employeeId: hodId,
            type: 'ACTION_REQUIRED',
            module: 'SIMS',
            title: 'New suggestion for review',
            message: `A new suggestion "${suggestion.title}" has been submitted in your department.`,
            actionUrl: `/sims/${suggestion.id}`,
            metadata: { suggestionId: suggestion.id },
        });
    }

    // notify admins/management
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
        message: `A new suggestion "${suggestion.title}" has been submitted.`,
        actionUrl: `/sims/${suggestion.id}`,
        metadata: { suggestionId: suggestion.id },
      }))
    )

    return suggestion;
  }

  // Query
  async getMySuggestions(userId: string) {
    const employee = await this.resolveEmployee(userId);
    return this.prisma.suggestion.findMany({
      where: { employeeId: employee.id },
      orderBy: { createdAt: 'desc' },
      include: { hod: { select: employeeSelect }, ...reviewInclude },
    });
  }

  async getDepartmentSuggestions(userId: string, query: QuerySuggestionsDto) {
    const employee = await this.resolveEmployee(userId);
    if (!employee.departmentId) throw new ForbiddenException('Your account is not assigned to a department');

    const { status, category, page, limit } = query;
    const skip = (page - 1) * limit;

    const where: any = {
      organizationId: employee.organizationId,
      employee: { departmentId: employee.departmentId },
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
      this.prisma.suggestion.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' }, include: suggestionInclude }),
      this.prisma.suggestion.count({ where }),
    ]);

    return {
      data: data.map(this.maskAnonymous),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  // Returns suggestions for the caller's department (as HOD)
  async getHODQueue(userId: string, organizationId: string, query: QuerySuggestionsDto) {
    const employee = await this.resolveEmployee(userId, organizationId);

    const { status, category, page, limit } = query;
    const skip = (page - 1) * limit;

    const where: any = {
      organizationId,
      employee: { 
        departmentId: employee.departmentId,
        id: { not: employee.id }, // HODs don't review their own suggestions
      },
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
        hod: { select: employeeSelect },
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

  // Review (HODs and Admins)

  async reviewSuggestion(
    id: string,
    dto: ReviewSuggestionDto,
    userId: string,
    organizationId: string,
  ) {
    const suggestion = await this.prisma.suggestion.findUnique({
      where: { id },
      include: { employee: { select: { id: true, departmentId: true } } }
    });

    if (!suggestion || suggestion.organizationId !== organizationId) throw new NotFoundException('Suggestion not found');

    const reviewer = await this.resolveEmployee(userId, organizationId);

    // Check authorization: Must be an HOD in the same department (or Super Admin)
    const userOrgs = await this.prisma.userOrganization.findMany({
        where: { userId, organizationId },
        include: { role: true }
    });
    const roles = userOrgs.map(uo => uo.role.name);
  
    const isDepartmentHOD = roles.includes(Role.HOD) && reviewer.departmentId === suggestion.employee?.departmentId;
    const isSuperAdmin = roles.includes(Role.SUPER_ADMIN);

    if (!isDepartmentHOD && !isSuperAdmin) {
        throw new ForbiddenException('Only a department HOD or admin can review this suggestion');
    }

    // Prevent HOD from reviewing their own suggestion
    if (suggestion.employeeId === reviewer.id && !isSuperAdmin) {
        throw new ForbiddenException('You cannot review your own suggestion');
    }

    const allowed = ALLOWED_TRANSITIONS[suggestion.status];
    if (!allowed.includes(dto.statusChanged)) {
      throw new BadRequestException(`Cannot move suggestion from ${suggestion.status} to ${dto.statusChanged}`);
    }

    // Logic: once rejected, cannot be marked as implemented
    if (dto.statusChanged === 'REJECTED' && dto.implementationStatus === 'IMPLEMENTED') {
      throw new BadRequestException('A rejected suggestion cannot be marked as implemented');
    }

    const review = await this.prisma.$transaction(async (tx) => {
      await tx.suggestion.update({
        where: { id },
        data: {
          status: dto.statusChanged,
          ...(dto.implementationStatus && { implementationStatus: dto.implementationStatus }),
          ...(dto.implementationNote && { implementationNote: dto.implementationNote }),
          // Optionally update the assigned hodId to the person who actually reviewed it
          hodId: reviewer.id,
        }
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

  async updateImplementationStatus(
    id: string,
    dto: UpdateImplementationDto,
    userId: string,
    organizationId: string,
  ) {
    const suggestion = await this.prisma.suggestion.findUnique({
      where: { id },
      include: { employee: { select: { departmentId: true } } }
    });

    if (!suggestion || suggestion.organizationId !== organizationId) throw new NotFoundException('Suggestion not found');

    if (suggestion.status === 'REJECTED' && dto.implementationStatus === 'IMPLEMENTED') {
      throw new BadRequestException('A rejected suggestion cannot be marked as implemented');
    }

    const updater = await this.resolveEmployee(userId, organizationId);

    // Check authorization: Must be an HOD in the same department (or Super Admin)
    const userOrgs = await this.prisma.userOrganization.findMany({
      where: { userId, organizationId },
      include: { role: true }
    });
    const roles = userOrgs.map(uo => uo.role.name);

    const isDepartmentHOD = roles.includes(Role.HOD) && updater.departmentId === suggestion.employee?.departmentId;
    const isSuperAdmin = roles.includes(Role.SUPER_ADMIN);

    if (!isDepartmentHOD && !isSuperAdmin) {
        throw new ForbiddenException('Only a department HOD or admin can update implementation status');
    }

    const updated = await this.prisma.suggestion.update({
      where: { id },
      data: {
        implementationStatus: dto.implementationStatus,
        ...(dto.implementationNote && { implementationNote: dto.implementationNote }),
      },
      include: suggestionInclude,
    });

    // notify employee
    await this.notifications.create({
      employeeId: suggestion.employeeId,
      type: 'INFO',
      module: 'SIMS',
      title: 'Implementation progress updated',
      message: `The implementation status of your suggestion "${suggestion.title}" is now "${dto.implementationStatus.toLowerCase().replace(/_/g, ' ')}".`,
      actionUrl: `/sims/${id}`,
      metadata: { suggestionId: id, implementationStatus: dto.implementationStatus },
    });

    return updated;
  }

}
