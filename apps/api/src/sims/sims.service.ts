import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SuggestionStatus, ImplementationStatus, DecisionType, KaizenTrigger } from 'db';
import { PrismaService } from 'src/prisma/prisma.service';
import { Role } from 'src/common/enum/role.enum';
import {
  CreateSuggestionDto,
  QuerySuggestionsDto,
  ReviewSuggestionDto,
  UpdateImplementationDto,
} from './dto/sims.dto';
import { NotificationsService } from 'src/notifications/notifications.service';
import { KaizenService } from 'src/kaizen/kaizen.service';

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
    private kaizenService: KaizenService,
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

  // Shared by reviewSuggestion and the department-colleagues picker: only a department HOD (of
  // the suggestion's own department), or a member of the committee this suggestion has been
  // forwarded to, may review — not top management, other HODs, or admins.
  private async assertCanReview(
    suggestion: { departmentId: string | null; committeeId: string | null },
    userId: string,
    organizationId: string,
  ) {
    const reviewer = await this.resolveEmployee(userId, organizationId);

    const userOrgs = await this.prisma.userOrganization.findMany({
      where: { userId, organizationId },
      include: { role: true },
    });
    const roles = userOrgs.map((uo) => uo.role.name);

    const isDepartmentHOD = roles.includes(Role.HOD) && reviewer.departmentId === suggestion.departmentId;

    let isCommitteeMember = false;
    if (suggestion.committeeId) {
      const membership = await this.prisma.steeringCommitteeMember.findUnique({
        where: { committeeId_employeeId: { committeeId: suggestion.committeeId, employeeId: reviewer.id } },
      });
      isCommitteeMember = !!membership;
    }

    if (!isDepartmentHOD && !isCommitteeMember) {
      throw new ForbiddenException("Only the department's HOD or the assigned committee can review this suggestion");
    }

    return { reviewer };
  }

  // Candidates for the responsible-person / kaizen-owner pickers on the review form — always
  // scoped to the suggestion's OWN department, not the reviewer's, since a cross-department
  // admin or committee member's own colleagues would be the wrong department entirely.
  async getReviewCandidates(id: string, userId: string, organizationId: string) {
    const suggestion = await this.prisma.suggestion.findUnique({
      where: { id },
      select: { departmentId: true, committeeId: true, organizationId: true },
    });
    if (!suggestion || suggestion.organizationId !== organizationId) throw new NotFoundException('Suggestion not found');

    await this.assertCanReview(suggestion, userId, organizationId);
    if (!suggestion.departmentId) return [];

    return this.prisma.employee.findMany({
      where: { departmentId: suggestion.departmentId, organizationId },
      select: { id: true, firstName: true, lastName: true, jobTitle: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
  }

  // Submit new suggestion

  async submitSuggestion(dto: CreateSuggestionDto, userId: string, organizationId: string, role: string) {
    const employee = await this.resolveEmployee(userId, organizationId);

    const isPrivileged = [Role.HOD, Role.MANAGEMENT, Role.ADMIN, Role.SUPER_ADMIN].includes(role as Role);

    let targetDepartmentId: string | null;
    let targetHodIds: string[];

    if (isPrivileged && dto.hodId) {
      // Privileged roles may target a specific HOD directly — department names aren't
      // plant-scoped, so this disambiguates which HOD (of possibly several sharing a
      // department name) the suggestion should go to.
      const hod = await this.prisma.employee.findFirst({
        where: {
          id: dto.hodId,
          organizationId,
          departmentId: { not: null },
          user: { organizations: { some: { organizationId, role: { name: Role.HOD } } } },
        },
        select: { id: true, departmentId: true },
      });
      if (!hod || !hod.departmentId) throw new BadRequestException('Selected HOD not found in this organization');
      targetDepartmentId = hod.departmentId;
      targetHodIds = [hod.id];
    } else if (isPrivileged && dto.departmentId) {
      // Privileged roles may direct their suggestion to any department in the org
      const dept = await this.prisma.department.findFirst({
        where: { id: dto.departmentId, organizationId },
        select: { id: true },
      });
      if (!dept) throw new BadRequestException('Selected department not found in this organization');
      targetDepartmentId = dto.departmentId;
      targetHodIds = await this.findDepartmentHODs(targetDepartmentId, organizationId);
    } else {
      // Employees are tied to their own department
      if (!employee.departmentId) {
        throw new BadRequestException('You must be assigned to a department to submit a suggestion');
      }
      targetDepartmentId = employee.departmentId;
      targetHodIds = await this.findDepartmentHODs(targetDepartmentId, organizationId);
    }

    // Privileged roles may also route straight to a steering committee — same effect as an
    // HOD marking the suggestion SELECTED_FOR_SGA, just applied immediately at submission.
    let targetCommitteeId: string | null = null;
    if (isPrivileged && dto.committeeId) {
      const committee = await this.prisma.steeringCommittee.findFirst({
        where: { id: dto.committeeId, organizationId },
        select: { id: true },
      });
      if (!committee) throw new BadRequestException('Selected committee not found in this organization');
      targetCommitteeId = committee.id;
    }

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
        hodId: targetHodIds[0] || null,
        ...(targetCommitteeId && { committeeId: targetCommitteeId, forwardedToCommitteeAt: new Date() }),
      }
    });

    // notify HODs about new suggestion
    for (const hodId of targetHodIds) {
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

    // notify the committee's members when routed straight to a committee at submission
    if (targetCommitteeId) {
      const members = await this.prisma.steeringCommitteeMember.findMany({
        where: { committeeId: targetCommitteeId },
        select: { employeeId: true },
      });
      await this.notifications.createMany(
        members
          .filter((m) => m.employeeId !== employee.id)
          .map((m) => ({
            employeeId: m.employeeId,
            type: 'ACTION_REQUIRED' as const,
            module: 'SIMS',
            title: 'New suggestion for your committee',
            message: `A new suggestion "${suggestion.title}" has been routed directly to your committee.`,
            actionUrl: `/sims/${suggestion.id}`,
            metadata: { suggestionId: suggestion.id },
          }))
      );
    }

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

  async getAllSuggestions(userId: string, organizationId: string, query: QuerySuggestionsDto) {
    const userOrgs = await this.prisma.userOrganization.findMany({
      where: { userId, organizationId },
      include: { role: true },
    });
    const roles = userOrgs.map((uo) => uo.role.name);
    const isPrivileged = roles.some((r) =>
      [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT, Role.HR, Role.HOD].includes(r as Role),
    );

    if (!isPrivileged) {
      const employee = await this.resolveEmployee(userId, organizationId);
      const membership = await this.prisma.steeringCommitteeMember.findFirst({
        where: { employeeId: employee.id },
      });
      if (!membership) {
        throw new ForbiddenException('You do not have access to organization-wide suggestions');
      }
    }

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
      const isResponsibleParty =
        (suggestion.decisionDetails as Record<string, any> | null)?.responsibleEmployeeId === employee.id;
      if (suggestion.employeeId !== employee.id && !isResponsibleParty) {
        throw new ForbiddenException('You can only view your own suggestions');
      }
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

    const [deptSuggestions, orgSuggestions, deptEmployeeCount, orgEmployeeCount] = await Promise.all([
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
      employee.departmentId
        ? this.prisma.employee.count({ where: { organizationId, departmentId: employee.departmentId } })
        : Promise.resolve(0),
      // Org-level target excludes the GembaPMS platform-team department — Rodgers/Surya
      // aren't production staff earning an implementation quota.
      this.prisma.employee.count({
        where: { organizationId, department: { isPlatformTeam: false } },
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
      department: { ...summarise(deptSuggestions), employeeCount: deptEmployeeCount },
      organization: { ...summarise(orgSuggestions), employeeCount: orgEmployeeCount },
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
          if (!details.action || !details.responsibleEmployeeId || !details.targetDate) {
            throw new BadRequestException('Workplace correction requires action, responsibleEmployeeId and targetDate');
          }
        }
        // DAILY_KAIZEN's requirements (a real Kaizen record) are validated separately in
        // reviewSuggestion, since it needs suggestion.employeeId/imageUrl to fall back on.
        break;
      }
      case 'SELECTED_FOR_SGA': {
        if (!details.responsibleEmployeeId) {
          throw new BadRequestException('SGA selection requires a responsible person');
        }
        break;
      }
      case 'ON_HOLD': {
        if (!details.reason || !details.responsibleEmployeeId) {
          throw new BadRequestException('Putting a suggestion on hold requires a reason and a responsible person');
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

  // Review (the department's HOD, and — once forwarded — the designated committee's members)

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

    const { reviewer } = await this.assertCanReview(suggestion, userId, organizationId);

    // Prevent HOD from reviewing their own suggestion
    if (suggestion.employeeId === reviewer.id) {
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

    // Resolve & verify the responsible person chosen for an on-hold, SGA-selected, or
    // workplace-correction suggestion — they're alerted and granted view access below
    // (see decisionDetails.responsibleEmployeeId).
    let responsiblePartyId: string | null = null;
    if (
      dto.statusChanged === 'ON_HOLD' ||
      dto.statusChanged === 'SELECTED_FOR_SGA' ||
      (dto.statusChanged === 'APPROVED_FOR_IMPLEMENTATION' && dto.decisionType === 'WORKPLACE_CORRECTION')
    ) {
      const responsible = await this.prisma.employee.findFirst({
        where: {
          id: dto.decisionDetails?.responsibleEmployeeId,
          organizationId,
          departmentId: suggestion.departmentId,
        },
        select: { id: true },
      });
      if (!responsible) {
        throw new BadRequestException("Responsible person must be an employee in this suggestion's department");
      }
      responsiblePartyId = responsible.id;
    }

    // Forward to the org's designated committee the moment a suggestion is selected for SGA
    let forwardCommitteeId: string | null = null;
    if (dto.statusChanged === 'SELECTED_FOR_SGA') {
      const organization = await this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { sgaCommitteeId: true },
      });
      forwardCommitteeId = organization?.sgaCommitteeId ?? null;
    }

    // Raise a lightweight draft Kaizen the moment a suggestion is approved for implementation
    // as a Daily Gemba Kaizen (once per suggestion). The reviewer only picks a kaizen owner —
    // the reason (1.1), reference (1.2) and condition/evidence (1.3) auto-fill from the
    // suggestion, and the owner completes the rest of the wizard themselves from 1.4 onward,
    // same as any other draft they'd started from scratch.
    let createdKaizenId: string | null = null;
    if (
      dto.statusChanged === 'APPROVED_FOR_IMPLEMENTATION' &&
      dto.decisionType === 'DAILY_KAIZEN' &&
      !suggestion.linkedKaizenId
    ) {
      if (!dto.kaizenDetails?.kaizenOwnerId) {
        throw new BadRequestException('A kaizen owner is required to raise a Daily Gemba Kaizen');
      }
      const kaizenOwner = await this.prisma.employee.findFirst({
        where: {
          id: dto.kaizenDetails.kaizenOwnerId,
          organizationId,
          departmentId: suggestion.departmentId,
        },
        select: { id: true },
      });
      if (!kaizenOwner) {
        throw new BadRequestException("Kaizen owner must be an employee in this suggestion's department");
      }

      const conditionDescription = dto.kaizenDetails.conditionDescription?.trim() || suggestion.title;
      const beforePhotoUrl = dto.kaizenDetails.beforePhotoUrl || suggestion.imageUrl;

      // The picked owner becomes the kaizen's raiser (employeeId), so they get the same
      // edit rights over the draft as if they'd started the wizard themselves — no changes
      // needed to the Kaizen module's own edit-authorization logic.
      const createdKaizen = await this.kaizenService.createKaizenForEmployee(
        kaizenOwner.id,
        {
          trigger: KaizenTrigger.EMPLOYEE_SUGGESTION_OR_IDEA,
          referenceValue: `SIMS Suggestion: "${suggestion.title}"`,
          referenceApplicability: 'APPLICABLE',
          conditionDescription,
          conditionEvidenceUrls: beforePhotoUrl ? [beforePhotoUrl] : undefined,
        },
        organizationId,
      );
      createdKaizenId = createdKaizen.id;
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
          ...(createdKaizenId && { linkedKaizenId: createdKaizenId }),
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

    // alert the responsible person and grant them access to this suggestion
    if (responsiblePartyId) {
      const title =
        dto.statusChanged === 'ON_HOLD' ? 'Suggestion put on hold — action needed' :
        dto.statusChanged === 'SELECTED_FOR_SGA' ? 'Suggestion selected for SGA — action needed' :
        'Workplace correction assigned to you — action needed';
      const message =
        dto.statusChanged === 'ON_HOLD' ? `Suggestion "${suggestion.title}" has been put on hold and you've been assigned as the responsible person.` :
        dto.statusChanged === 'SELECTED_FOR_SGA' ? `Suggestion "${suggestion.title}" has been selected for SGA and you've been assigned as the responsible person.` :
        `Suggestion "${suggestion.title}" requires a workplace correction and you've been assigned as the responsible person.`;
      await this.notifications.create({
        employeeId: responsiblePartyId,
        type: 'ALERT',
        module: 'SIMS',
        title,
        message,
        actionUrl: `/sims/${id}`,
        metadata: { suggestionId: id },
      });
    }

    // notify the suggester that their suggestion became a real Kaizen — link back to the
    // suggestion, not the kaizen itself, since the picked owner (not necessarily the
    // suggester) is the one with edit/view access to it.
    if (createdKaizenId) {
      await this.notifications.create({
        employeeId: suggestion.employeeId,
        type: 'INFO',
        module: 'SIMS',
        title: 'Your suggestion was raised as a Daily Gemba Kaizen',
        message: `Suggestion "${suggestion.title}" has been raised as a Daily Gemba Kaizen.`,
        actionUrl: `/sims/${id}`,
        metadata: { suggestionId: id, kaizenId: createdKaizenId },
      });

      // alert the picked kaizen owner — they now need to complete the rest of the wizard
      await this.notifications.create({
        employeeId: dto.kaizenDetails!.kaizenOwnerId!,
        type: 'ALERT',
        module: 'KAIZEN',
        title: 'You were assigned a Daily Gemba Kaizen — action needed',
        message: `A Daily Gemba Kaizen was drafted from suggestion "${suggestion.title}" and you've been assigned as the owner. Please complete the remaining details.`,
        actionUrl: `/kaizen/${createdKaizenId}`,
        metadata: { suggestionId: id, kaizenId: createdKaizenId },
      });
    }

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
    const suggestion = await this.prisma.suggestion.findUnique({ where: { id } });

    if (!suggestion || suggestion.organizationId !== organizationId) throw new NotFoundException('Suggestion not found');

    if (suggestion.status === 'REJECTED' && dto.implementationStatus === 'IMPLEMENTED') {
      throw new BadRequestException('A rejected suggestion cannot be marked as implemented');
    }

    if (suggestion.status === 'IMPLEMENTED') {
      throw new BadRequestException('This suggestion is already implemented; implementation status can no longer be edited');
    }

    const updater = await this.resolveEmployee(userId, organizationId);

    // Check authorization: must be the HOD of this suggestion's own department
    const userOrgs = await this.prisma.userOrganization.findMany({
      where: { userId, organizationId },
      include: { role: true }
    });
    const roles = userOrgs.map(uo => uo.role.name);

    const isDepartmentHOD = roles.includes(Role.HOD) && updater.departmentId === suggestion.departmentId;

    if (!isDepartmentHOD) {
        throw new ForbiddenException("Only the department's HOD can update implementation status");
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
