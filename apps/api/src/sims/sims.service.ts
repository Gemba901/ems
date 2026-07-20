import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SuggestionStatus, ImplementationStatus, DecisionType } from 'db';
import { PrismaService } from 'src/prisma/prisma.service';
import { Role } from 'src/common/enum/role.enum';
import {
  CreateSuggestionDto,
  QuerySuggestionsDto,
  ReviewSuggestionDto,
  UpdateImplementationDto,
} from './dto/sims.dto';
import { NotificationsService } from 'src/notifications/notifications.service';

// Suggestions begin life at WAITING_FOR_REVIEW
const ALLOWED_TRANSITIONS: Record<SuggestionStatus, SuggestionStatus[]> = {
  WAITING_FOR_REVIEW:         ['UNDER_REVIEW'],
  UNDER_REVIEW:               ['ON_HOLD', 'SELECTED_FOR_SGA', 'APPROVED_FOR_IMPLEMENTATION', 'REJECTED'],
  ON_HOLD:                    ['UNDER_REVIEW', 'SELECTED_FOR_SGA', 'APPROVED_FOR_IMPLEMENTATION', 'REJECTED'],
  SELECTED_FOR_SGA:           ['IMPLEMENTED', 'REJECTED'],
  APPROVED_FOR_IMPLEMENTATION: ['IMPLEMENTED', 'REJECTED'],
  IMPLEMENTED:                [],
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

  async submitSuggestion(dto: CreateSuggestionDto, userId: string, organizationId: string, role: string) {
    const employee = await this.resolveEmployee(userId, organizationId);

    const isPrivileged = [Role.HOD, Role.MANAGEMENT, Role.ADMIN, Role.SUPER_ADMIN].includes(role as Role);

    let targetDepartmentId: string | null;

    if (isPrivileged && dto.departmentId) {
      // Privileged roles may direct their suggestion to any department in the org
      const dept = await this.prisma.department.findFirst({
        where: { id: dto.departmentId, organizationId },
        select: { id: true },
      });
      if (!dept) throw new BadRequestException('Selected department not found in this organization');
      targetDepartmentId = dto.departmentId;
    } else {
      // Employees are tied to their own department
      if (!employee.departmentId) {
        throw new BadRequestException('You must be assigned to a department to submit a suggestion');
      }
      targetDepartmentId = employee.departmentId;
    }

    const hodIds = await this.findDepartmentHODs(targetDepartmentId, organizationId);

    const suggestion = await this.prisma.suggestion.create({
      data: {
        title: dto.title,
        description: dto.description,
        categories: dto.categories,
        isAnonymous: dto.isAnonymous ?? false,
        imageUrl: dto.imageUrl ?? null,
        status: 'WAITING_FOR_REVIEW',
        employeeId: employee.id,
        organizationId,
        departmentId: targetDepartmentId,
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
      departmentId: employee.departmentId,
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
      ...(departmentId && { departmentId }),
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
      departmentId: employee.departmentId,
      employeeId: { not: employee.id }, // HODs don't review their own suggestions
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
      if (suggestion.departmentId !== employee.departmentId) {
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
          where: { organizationId, departmentId: employee.departmentId },
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

  // Points: 1 point once a suggestion is approved for implementation, plus
  // 1 more point once it is successfully implemented (2 points max per suggestion).
  async getLeaderboard(organizationId: string) {
    const suggestions = await this.prisma.suggestion.findMany({
      where: { organizationId, isAnonymous: false },
      select: {
        status: true,
        employee: {
          select: {
            id: true,
            userId: true,
            firstName: true,
            lastName: true,
            department: { select: { name: true } },
          },
        },
      },
    });

    const map = new Map<string, { id: string; userId: string | null; name: string; dept: string; points: number; count: number; implemented: number }>();

    for (const s of suggestions) {
      if (!s.employee) continue;
      const isImplemented = s.status === 'IMPLEMENTED';
      const isApproved = s.status === 'APPROVED_FOR_IMPLEMENTATION' || isImplemented;
      let pts = 0;
      if (isApproved) pts += 1;
      if (isImplemented) pts += 1;

      const prev = map.get(s.employee.id);
      if (prev) {
        prev.points += pts;
        prev.count += 1;
        if (isImplemented) prev.implemented += 1;
      } else {
        map.set(s.employee.id, {
          id: s.employee.id,
          userId: s.employee.userId,
          name: `${s.employee.firstName} ${s.employee.lastName}`,
          dept: s.employee.department?.name ?? '—',
          points: pts,
          count: 1,
          implemented: isImplemented ? 1 : 0,
        });
      }
    }

    return [...map.values()].sort((a, b) => b.points - a.points);
  }

  // Department marks: 1 mark per implemented suggestion originating from that department.
  // NOTE: the "sustained/maintained" gate is not yet applied here — pending further
  // clarification on what confirms sustainment. Once defined, marks should only be
  // awarded once a suggestion's sustainment is confirmed, not merely on IMPLEMENTED.
  async getDepartmentLeaderboard(organizationId: string) {
    const suggestions = await this.prisma.suggestion.findMany({
      where: { organizationId, departmentId: { not: null } },
      select: {
        status: true,
        department: { select: { id: true, name: true } },
      },
    });

    const map = new Map<string, { id: string; name: string; marks: number; total: number }>();

    for (const s of suggestions) {
      if (!s.department) continue;
      const isImplemented = s.status === 'IMPLEMENTED';
      const prev = map.get(s.department.id);
      if (prev) {
        prev.total += 1;
        if (isImplemented) prev.marks += 1;
      } else {
        map.set(s.department.id, {
          id: s.department.id,
          name: s.department.name,
          marks: isImplemented ? 1 : 0,
          total: 1,
        });
      }
    }

    return [...map.values()].sort((a, b) => b.marks - a.marks);
  }

  // Rejects the review when the decision branch's required structured fields are missing.
  // See docs/sims-review-pipeline-timeline.md for the four decisionDetails shapes.
  private validateDecisionPayload(
    statusChanged: SuggestionStatus,
    decisionType?: DecisionType,
    decisionDetails?: Record<string, any>,
    note?: string,
  ) {
    const details = decisionDetails ?? {};
    switch (statusChanged) {
      case 'APPROVED_FOR_IMPLEMENTATION': {
        if (!decisionType) {
          throw new BadRequestException('decisionType is required when approving for implementation');
        }
        if (decisionType === 'WORKPLACE_CORRECTION') {
          if (!details.action || !details.responsible || !details.targetDate) {
            throw new BadRequestException('Workplace correction requires action, responsible and targetDate');
          }
        } else if (decisionType === 'DAILY_KAIZEN') {
          if (!details.owner || !details.targetDate || !details.expectedResult) {
            throw new BadRequestException('Daily kaizen requires owner, targetDate and expectedResult');
          }
        }
        break;
      }
      case 'SELECTED_FOR_SGA': {
        if (!details.problemStatement || !details.teamLeader || !details.target || !details.timeline) {
          throw new BadRequestException('SGA selection requires problemStatement, teamLeader, target and timeline');
        }
        break;
      }
      case 'ON_HOLD': {
        if (!details.reason || !details.reviewDate) {
          throw new BadRequestException('Putting a suggestion on hold requires a reason and reviewDate');
        }
        break;
      }
      case 'REJECTED': {
        if (!note) {
          throw new BadRequestException('A note is required when rejecting a suggestion');
        }
        break;
      }
      default:
        break;
    }
  }

  // Review (HODs, Admins, and — once forwarded — the designated committee's members)

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

    // Check authorization: Must be an HOD in the same department (or Super Admin/Admin/Management,
    // or a member of the committee this suggestion has been forwarded to)
    const userOrgs = await this.prisma.userOrganization.findMany({
        where: { userId, organizationId },
        include: { role: true }
    });
    const roles = userOrgs.map(uo => uo.role.name);

    const isDepartmentHOD = roles.includes(Role.HOD) && reviewer.departmentId === suggestion.departmentId;
    const isSuperAdmin = roles.includes(Role.SUPER_ADMIN);
    const isAdminOrMgmt = roles.some(r => [Role.ADMIN, Role.MANAGEMENT].includes(r as Role));

    let isCommitteeMember = false;
    if (suggestion.committeeId) {
      const membership = await this.prisma.steeringCommitteeMember.findUnique({
        where: { committeeId_employeeId: { committeeId: suggestion.committeeId, employeeId: reviewer.id } },
      });
      isCommitteeMember = !!membership;
    }

    if (!isDepartmentHOD && !isSuperAdmin && !isAdminOrMgmt && !isCommitteeMember) {
        throw new ForbiddenException('Only a department HOD, admin, or the assigned committee can review this suggestion');
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

    this.validateDecisionPayload(dto.statusChanged, dto.decisionType, dto.decisionDetails, dto.note);

    // Forward to the org's designated committee the moment a suggestion is selected for SGA
    let forwardCommitteeId: string | null = null;
    if (dto.statusChanged === 'SELECTED_FOR_SGA') {
      const organization = await this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { sgaCommitteeId: true },
      });
      forwardCommitteeId = organization?.sgaCommitteeId ?? null;
    }

    const review = await this.prisma.$transaction(async (tx) => {
      await tx.suggestion.update({
        where: { id },
        data: {
          status: dto.statusChanged,
          ...(dto.implementationStatus && { implementationStatus: dto.implementationStatus }),
          ...(dto.implementationNote && { implementationNote: dto.implementationNote }),
          ...(dto.decisionType && { decisionType: dto.decisionType }),
          ...(dto.decisionDetails && { decisionDetails: dto.decisionDetails }),
          ...(forwardCommitteeId && { committeeId: forwardCommitteeId, forwardedToCommitteeAt: new Date() }),
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

    // notify the committee's members when a suggestion is freshly forwarded to them
    if (forwardCommitteeId) {
      const members = await this.prisma.steeringCommitteeMember.findMany({
        where: { committeeId: forwardCommitteeId },
        select: { employeeId: true },
      });
      await this.notifications.createMany(
        members.map((m) => ({
          employeeId: m.employeeId,
          type: 'ACTION_REQUIRED' as const,
          module: 'SIMS',
          title: 'Suggestion forwarded to your committee',
          message: `Suggestion "${suggestion.title}" has been selected for SGA and forwarded to your committee.`,
          actionUrl: `/sims/${id}`,
          metadata: { suggestionId: id },
        }))
      );
    }

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

    if (suggestion.status === 'IMPLEMENTED') {
      throw new BadRequestException('This suggestion is already implemented; implementation status can no longer be edited');
    }

    const updater = await this.resolveEmployee(userId, organizationId);

    // Check authorization: Must be an HOD in the same department (or Super Admin/Admin/Management)
    const userOrgs = await this.prisma.userOrganization.findMany({
      where: { userId, organizationId },
      include: { role: true }
    });
    const roles = userOrgs.map(uo => uo.role.name);

    const isDepartmentHOD = roles.includes(Role.HOD) && updater.departmentId === suggestion.employee?.departmentId;
    const isSuperAdmin = roles.includes(Role.SUPER_ADMIN);
    const isAdminOrMgmt = roles.some(r => [Role.ADMIN, Role.MANAGEMENT].includes(r as Role));

    if (!isDepartmentHOD && !isSuperAdmin && !isAdminOrMgmt) {
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

  // Suggestions forwarded to a steering committee. Committee members see only
  // suggestions forwarded to a committee they belong to; Admin/Management/SuperAdmin see all.
  async getCommitteeReport(userId: string, organizationId: string, query: QuerySuggestionsDto) {
    const reviewer = await this.resolveEmployee(userId, organizationId);

    const userOrgs = await this.prisma.userOrganization.findMany({
      where: { userId, organizationId },
      include: { role: true },
    });
    const roles = userOrgs.map((uo) => uo.role.name);
    const isPrivileged = roles.some((r) => [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT].includes(r as Role));

    const myCommittees = await this.prisma.steeringCommitteeMember.findMany({
      where: { employeeId: reviewer.id },
      select: { committeeId: true },
    });
    const myCommitteeIds = myCommittees.map((m) => m.committeeId);

    const { status, category, page, limit } = query;

    if (!isPrivileged && myCommitteeIds.length === 0) {
      return { data: [], pagination: { page, limit, total: 0, pages: 0 } };
    }

    const skip = (page - 1) * limit;

    const where: any = {
      organizationId,
      committeeId: { not: null },
      ...(status && { status }),
      ...(category && { categories: { has: category } }),
      ...(!isPrivileged && { committeeId: { in: myCommitteeIds } }),
    };

    const [data, total] = await Promise.all([
      this.prisma.suggestion.findMany({
        where,
        skip,
        take: limit,
        orderBy: { forwardedToCommitteeAt: 'desc' },
        include: suggestionInclude,
      }),
      this.prisma.suggestion.count({ where }),
    ]);

    return {
      data: data.map(this.maskAnonymous),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

}
