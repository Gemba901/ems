import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  ActivityScope,
  ActivityStatus,
  EmployeeActivityStatus,
  EmploymentStatus,
  NotificationType,
  Priority,
  TaskFrequency,
  TaskStatus,
} from 'db';
import {
  CreateActivityDto,
  CreateTaskFromActivityDto,
  IngestActivitiesDto,
  SearchDwmsEmployeesDto,
  UpdateActivityDto,
  UpdateEmployeeActivityAssignmentDto,
} from '../dto/dwms.dto';
import { UserPayload } from './base.service';
import { DwmsTaskService } from './task.service';
import {
  addUtcDays,
  getUtcDateInTimeZone,
  parseDateOnly,
} from '../utils/taskSchedule';
import { randomUUID } from 'node:crypto';

function assertSupportedActivityFrequency(
  frequency: TaskFrequency | null | undefined,
) {
  if (String(frequency) === 'EVERY_5_MINUTES') {
    throw new BadRequestException(
      'Every 5 minutes task frequency is no longer supported',
    );
  }
  if (frequency === TaskFrequency.PLANNED) {
    throw new BadRequestException(
      'Scoped activities support Daily, Weekly, Monthly, Quarterly, or Yearly frequency only',
    );
  }
}

const ACTIVITY_INCLUDE = {
  mainDepartment: { select: { id: true, name: true } },
  scopeDepartment: { select: { id: true, name: true } },
  scopeEmployee: {
    select: { id: true, employeeCode: true, firstName: true, lastName: true },
  },
  primaryResponsibleEmployee: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      jobTitle: true,
    },
  },

  parentActivity: {
    select: {
      id: true,
      name: true,
      code: true,
      frequency: true,
      status: true,
    },
  },
};
const ACTIVE_ACTIVITY_STATUS = ActivityStatus.ACTIVE;
const ARCHIVED_ACTIVITY_STATUS = ActivityStatus.ARCHIVED;
const MONTH_INDEX: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

export abstract class DwmsActivityService extends DwmsTaskService {
  private employeeRef(employee?: any | null) {
    if (!employee) return null;
    return {
      id: employee.id,
      name: `${employee.firstName} ${employee.lastName}`.trim(),
      email: employee.email,
      designation: employee.jobTitle ?? 'Employee',
    };
  }

  private serializeActivity(activity: any) {
    const scopeTarget =
      activity.scope === ActivityScope.DEPARTMENT
        ? (activity.scopeDepartment?.name ?? null)
        : activity.scope === ActivityScope.JOB_TITLE
          ? (activity.scopeJobTitleLabel ?? activity.scopeJobTitle ?? null)
          : activity.scope === ActivityScope.EMPLOYEE
            ? (activity.scopeEmployee?.employeeCode ?? null)
            : null;
    return {
      ...activity,
      scopeTarget,
      status:
        activity.status === ARCHIVED_ACTIVITY_STATUS
          ? ARCHIVED_ACTIVITY_STATUS
          : ACTIVE_ACTIVITY_STATUS,
      primaryResponsibleEmployee: this.employeeRef(
        activity.primaryResponsibleEmployee,
      ),

      parentActivities: activity.parentActivity
        ? [
            {
              ...activity.parentActivity,
              status:
                activity.parentActivity.status === ARCHIVED_ACTIVITY_STATUS
                  ? ARCHIVED_ACTIVITY_STATUS
                  : ACTIVE_ACTIVITY_STATUS,
            },
          ]
        : [],
      parentActivityIds: activity.parentActivityId
        ? [activity.parentActivityId]
        : [],
    };
  }

  private canManageActivities(roleLevel: string) {
    const role = String(roleLevel).toUpperCase().trim();
    return (
      role === 'SUPER_ADMIN' ||
      role === 'ADMIN' ||
      role === 'MANAGEMENT' ||
      role === 'HR' ||
      role === 'HOD'
    );
  }

  private canEditActivityContent(roleLevel: string) {
    const role = String(roleLevel).toUpperCase().trim();
    return (
      role === 'SUPER_ADMIN' ||
      role === 'ADMIN' ||
      role === 'MANAGEMENT' ||
      role === 'HR'
    );
  }

  private formatActivityTaskDescription(activity: {
    workMethod?: string | null;
    purpose?: string | null;
    startTrigger?: string | null;
    completionOutput?: string | null;
    remarks?: string | null;
  }) {
    return [
      ['Description / SOP', activity.workMethod],
      ['Purpose', activity.purpose],
      ['Start trigger', activity.startTrigger],
      ['Expected output', activity.completionOutput],
      ['Remarks', activity.remarks],
    ]
      .filter((section): section is [string, string] =>
        Boolean(section[1]?.trim()),
      )
      .map(([label, value]) => `${label}:\n${value.trim()}`)
      .join('\n\n');
  }

  private normalizeActivityStatus(status?: string | null) {
    const normalized = String(status ?? ACTIVE_ACTIVITY_STATUS)
      .trim()
      .toUpperCase()
      .replace(/[\s-]+/g, '_');
    if (
      normalized === ARCHIVED_ACTIVITY_STATUS ||
      normalized === 'INACTIVE' ||
      normalized === 'NOT_APPLICABLE'
    ) {
      return ARCHIVED_ACTIVITY_STATUS;
    }
    return ACTIVE_ACTIVITY_STATUS;
  }

  private normalizeJobTitle(jobTitle?: string | null) {
    const normalized = jobTitle?.trim().replace(/\s+/g, ' ').toLowerCase();
    return normalized || null;
  }

  private async linkActivityToJobTitle(
    organizationId: string,
    activityId: string,
    jobTitle?: string | null,
  ) {
    const normalizedJobTitle = this.normalizeJobTitle(jobTitle);
    if (!normalizedJobTitle) return;

    await this.prisma.jobTitleActivity.upsert({
      where: {
        organizationId_jobTitle_activityId: {
          organizationId,
          jobTitle: normalizedJobTitle,
          activityId,
        },
      },
      update: {},
      create: {
        organizationId,
        jobTitle: normalizedJobTitle,
        activityId,
      },
    });
  }

  private serializeEmployeeRoleActivity(
    item: any,
    assignmentByActivityId: Map<string, any>,
  ) {
    const activity = item.activity ?? item;
    const assignment = assignmentByActivityId.get(activity.id);
    return {
      activity: this.serializeActivity(activity),
      status: assignment?.status ?? EmployeeActivityStatus.INACTIVE,
      assignmentId: assignment?.id ?? null,
      activatedAt:
        assignment?.activatedAt?.toISOString?.() ??
        assignment?.activatedAt ??
        null,
      deactivatedAt:
        assignment?.deactivatedAt?.toISOString?.() ??
        assignment?.deactivatedAt ??
        null,
    };
  }
  private cleanActivityIngestionError(error: any) {
    const raw =
      typeof error?.message === 'string'
        ? error.message
        : 'Failed to ingest activity row';

    if (
      (raw.includes('TaskStatus') || raw.includes('ActivityStatus')) &&
      raw.includes('ACTIVE')
    ) {
      return 'Activity status was not compatible with the database. Please retry the import after restarting the API server.';
    }
    if (raw.includes('Unique constraint') || raw.includes('P2002')) {
      return 'An activity with the same code already exists.';
    }
    if (raw.includes('Record to connect not found')) {
      return 'One of the selected activity references was not found.';
    }

    const cleaned = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !line.startsWith('Invalid'))
      .filter((line) => !/^[^\w]*\d+\s/.test(line))
      .filter((line) => !line.startsWith('at '))
      .filter((line) => !/^[A-Z]:\\/.test(line))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    return cleaned || 'Failed to ingest activity row';
  }

  private isActivityIngestionRowError(error: unknown) {
    return error instanceof BadRequestException;
  }

  private async generateActivityCode(organizationId: string) {
    const count = await this.prisma.activity.count({
      where: { organizationId },
    });
    return `ACT-${String(count + 1).padStart(4, '0')}`;
  }

  private async resolveActivityCode(organizationId: string, code?: string) {
    const providedCode = code?.trim();
    if (providedCode) return providedCode;

    for (let offset = 0; offset < 20; offset += 1) {
      const candidate = `ACT-${String(
        (await this.prisma.activity.count({ where: { organizationId } })) +
          1 +
          offset,
      ).padStart(4, '0')}`;
      const existing = await this.prisma.activity.findFirst({
        where: { organizationId, code: candidate },
        select: { id: true },
      });
      if (!existing) return candidate;
    }

    return this.generateActivityCode(organizationId);
  }

  private parseActivityDate(
    value: string | null | undefined,
    timeZone: string,
  ) {
    const raw = value?.trim();
    if (!raw) {
      return getUtcDateInTimeZone(new Date(), timeZone);
    }

    const isoDateOnly = parseDateOnly(raw);
    if (isoDateOnly) return isoDateOnly;

    const dateOnlyMatch = raw.match(
      /^(\d{1,2})[-\s]([A-Za-z]{3,9})[-\s](\d{4})$/,
    );
    if (dateOnlyMatch) {
      const [, dayText, monthText, yearText] = dateOnlyMatch;
      const month = MONTH_INDEX[monthText.toLowerCase()];
      if (month !== undefined) {
        const parsed = new Date(
          Date.UTC(Number(yearText), month, Number(dayText)),
        );
        if (!Number.isNaN(parsed.getTime())) return parsed;
      }
    }

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(
        'Effective from date must be a valid date, for example 2026-07-01 or 01-Jul-2026',
      );
    }
    return parsed;
  }

  private async validateActivityReferences(
    organizationId: string,
    dto: CreateActivityDto,
  ) {
    if (dto.mainDepartmentId) {
      const department = await this.prisma.department.findFirst({
        where: { id: dto.mainDepartmentId, organizationId },
        select: { id: true },
      });
      if (!department) {
        throw new BadRequestException(
          'Main department must belong to the current organization',
        );
      }
    }

    const employeeFields = [
      ['primaryResponsibleEmployeeId', 'Primary responsible person'],
    ] as const;

    for (const [field, label] of employeeFields) {
      const employeeId = dto[field];
      if (!employeeId) continue;
      await this.validateDwmsEmployee(
        employeeId,
        organizationId,
        `${label} must belong to the current organization`,
      );
    }
  }

  private normalizeParentActivityIds(ids?: string[] | null) {
    return Array.from(
      new Set((ids ?? []).map((id) => id.trim()).filter(Boolean)),
    );
  }

  private async activityAncestorIds(activityId: string) {
    const visited = new Set<string>();
    let currentActivityId: string | null = activityId;

    while (currentActivityId) {
      const activity = await this.prisma.activity.findUnique({
        where: { id: currentActivityId },
        select: { parentActivityId: true },
      });
      const parentActivityId = activity?.parentActivityId ?? null;
      if (!parentActivityId || visited.has(parentActivityId)) break;
      visited.add(parentActivityId);
      currentActivityId = parentActivityId;
    }

    return visited;
  }

  private async validateParentActivities(
    organizationId: string,
    targetFrequency: TaskFrequency,
    parentActivityIds?: string[] | null,
    activityId?: string,
  ) {
    if (parentActivityIds === undefined) return undefined;
    const normalizedIds = this.normalizeParentActivityIds(parentActivityIds);
    if (normalizedIds.length === 0) return [];
    if (normalizedIds.length > 1) {
      throw new BadRequestException('Only one parent activity can be selected');
    }

    const activities = await this.prisma.activity.findMany({
      where: { id: { in: normalizedIds }, organizationId },
      select: { id: true, name: true, frequency: true },
    });
    const activityById = new Map<string, (typeof activities)[number]>(
      activities.map((activity) => [activity.id, activity]),
    );
    const missingIds = normalizedIds.filter((id) => !activityById.has(id));
    if (missingIds.length > 0) {
      throw new BadRequestException(
        'Parent activity must belong to the current organization',
      );
    }

    const frequencyMismatches = activities.filter(
      (activity) => activity.frequency !== targetFrequency,
    );
    if (frequencyMismatches.length > 0) {
      throw new BadRequestException(
        `Parent activity must have the same frequency as this activity: ${frequencyMismatches.map((activity) => activity.name).join(', ')}`,
      );
    }

    if (!activityId) return normalizedIds;

    const invalidParents: string[] = [];
    for (const parentActivityId of normalizedIds) {
      if (parentActivityId === activityId) {
        invalidParents.push(
          activityById.get(parentActivityId)?.name ?? parentActivityId,
        );
        continue;
      }

      const parentAncestors = await this.activityAncestorIds(parentActivityId);
      if (parentAncestors.has(activityId)) {
        invalidParents.push(
          activityById.get(parentActivityId)?.name ?? parentActivityId,
        );
      }
    }

    if (invalidParents.length > 0) {
      throw new BadRequestException(
        `The following activity can not be made parent activity: ${invalidParents.join(', ')}`,
      );
    }

    return normalizedIds;
  }

  private async replaceParentActivities(
    organizationId: string,
    activityId: string,
    parentActivityIds?: string[] | null,
  ) {
    if (parentActivityIds === undefined) return;

    const normalizedIds = this.normalizeParentActivityIds(parentActivityIds);
    await this.prisma.activity.update({
      where: { id: activityId, organizationId },
      data: { parentActivityId: normalizedIds[0] ?? null },
    });
  }

  private stripActivityPersonReferences(dto: CreateActivityDto) {
    const {
      primaryResponsibleEmployeeId: _primaryResponsibleEmployeeId,

      ...activity
    } = dto;
    return activity as CreateActivityDto;
  }

  private isBlankImportValue(value?: string | null) {
    const normalized = String(value ?? '')
      .trim()
      .toLowerCase();
    return !normalized || normalized === 'na' || normalized === 'n/a';
  }

  private assertScopedActivityPayload(dto: CreateActivityDto) {
    if (!dto.code?.trim())
      throw new BadRequestException('Activity Code is required');
    if (!dto.name?.trim())
      throw new BadRequestException('Process Name is required');
    if (!dto.workMethod?.trim()) {
      throw new BadRequestException('Description / SOP is required');
    }
    if (
      dto.completionDeadline === undefined ||
      dto.completionDeadline === null
    ) {
      throw new BadRequestException('Estimated Time (Hours) is required');
    }
    if (
      !Number.isFinite(Number(dto.completionDeadline)) ||
      Number(dto.completionDeadline) < 0
    ) {
      throw new BadRequestException(
        'Estimated Time (Hours) must be a non-negative number',
      );
    }
    if (!dto.completionOutput?.trim()) {
      throw new BadRequestException('Expected Output is required');
    }
    if (!dto.remarks?.trim())
      throw new BadRequestException('Remarks are required');
    if (!dto.scope || !Object.values(ActivityScope).includes(dto.scope)) {
      throw new BadRequestException(
        'Scope of Activity must be Organisation, Department, Job Title, or Employee',
      );
    }
    const supportedFrequencies: readonly TaskFrequency[] = [
      TaskFrequency.DAILY,
      TaskFrequency.WEEKLY,
      TaskFrequency.MONTHLY,
      TaskFrequency.QUARTERLY,
      TaskFrequency.YEARLY,
    ];
    if (!supportedFrequencies.includes(dto.frequency)) {
      throw new BadRequestException(
        'Frequency must be Daily, Weekly, Monthly, Quarterly, or Yearly',
      );
    }
  }

  private async resolveEmployeeByCode(
    organizationId: string,
    employeeCode: string,
    activeOnly = true,
  ) {
    const code = employeeCode.trim();
    if (!code) {
      throw new BadRequestException('Target Emp ID is required');
    }

    const candidates = await this.prisma.employee.findMany({
      where: {
        organizationId,
        employeeCode: { not: null },
        ...(activeOnly ? { employmentStatus: EmploymentStatus.ACTIVE } : {}),
      },
      select: { id: true, employeeCode: true, employmentStatus: true },
    });
    const normalizedMatches = candidates.filter(
      (employee) => employee.employeeCode?.toLowerCase() === code.toLowerCase(),
    );
    if (normalizedMatches.length === 1) return normalizedMatches[0];
    if (normalizedMatches.length > 1) {
      throw new BadRequestException(
        `Target Emp ID "${code}" matches multiple employees`,
      );
    }

    throw new BadRequestException(
      `Target Emp ID "${code}" was not found among active employees in this organization`,
    );
  }

  private async resolveActivityScope(
    organizationId: string,
    scope: ActivityScope,
    rawTarget?: string | null,
  ) {
    const target = this.isBlankImportValue(rawTarget) ? '' : rawTarget!.trim();
    if (scope === ActivityScope.ORGANISATION) {
      if (target) {
        throw new BadRequestException(
          'Target must be blank or NA for Organisation scope',
        );
      }
      const recipients = await this.prisma.employee.findMany({
        where: { organizationId, employmentStatus: EmploymentStatus.ACTIVE },
        select: { id: true, employeeCode: true },
        orderBy: { createdAt: 'asc' },
      });
      return { recipients, scopeData: {}, targetLabel: null };
    }

    if (!target)
      throw new BadRequestException(
        'Target is required for this activity scope',
      );

    if (scope === ActivityScope.DEPARTMENT) {
      const departments = await this.prisma.department.findMany({
        where: { organizationId },
        select: { id: true, name: true },
      });
      const matches = departments.filter(
        (department) =>
          department.name.trim().toLowerCase() === target.toLowerCase(),
      );
      if (matches.length !== 1) {
        throw new BadRequestException(
          matches.length
            ? `Department "${target}" is ambiguous`
            : `Department "${target}" was not found`,
        );
      }
      const department = matches[0];
      const recipients = await this.prisma.employee.findMany({
        where: {
          organizationId,
          departmentId: department.id,
          employmentStatus: EmploymentStatus.ACTIVE,
        },
        select: { id: true, employeeCode: true },
        orderBy: { createdAt: 'asc' },
      });
      return {
        recipients,
        scopeData: { scopeDepartmentId: department.id },
        targetLabel: department.name,
      };
    }

    if (scope === ActivityScope.JOB_TITLE) {
      const normalizedTitle = this.normalizeJobTitle(target)!;
      const employees = await this.prisma.employee.findMany({
        where: {
          organizationId,
          employmentStatus: EmploymentStatus.ACTIVE,
          jobTitle: { not: null },
        },
        select: { id: true, employeeCode: true, jobTitle: true },
        orderBy: { createdAt: 'asc' },
      });
      return {
        recipients: employees.filter(
          (employee) =>
            this.normalizeJobTitle(employee.jobTitle) === normalizedTitle,
        ),
        scopeData: {
          scopeJobTitle: normalizedTitle,
          scopeJobTitleLabel: target.replace(/\s+/g, ' '),
        },
        targetLabel: target.replace(/\s+/g, ' '),
      };
    }

    const employee = await this.resolveEmployeeByCode(organizationId, target);
    return {
      recipients: [employee],
      scopeData: { scopeEmployeeId: employee.id },
      targetLabel: employee.employeeCode,
    };
  }

  private async activateActivityForEmployee(
    user: UserPayload,
    activity: any,
    employeeId: string,
  ) {
    const now = new Date();
    const assignment = await this.prisma.employeeActivityAssignment.upsert({
      where: { employeeId_activityId: { employeeId, activityId: activity.id } },
      update: {
        status: EmployeeActivityStatus.ACTIVE,
        activatedAt: now,
        deactivatedAt: null,
      },
      create: {
        organizationId: user.organizationId,
        employeeId,
        activityId: activity.id,
        status: EmployeeActivityStatus.ACTIVE,
        activatedAt: now,
      },
    });
    const existingTask = await this.prisma.task.findFirst({
      where: { ownerId: employeeId, activityId: activity.id, isAdhoc: false },
      select: { id: true },
    });
    if (existingTask) {
      await this.prisma.task.update({
        where: { id: existingTask.id },
        data: { isActive: true },
      });
      await this.generateUpcomingInstancesForTaskId(
        existingTask.id,
        user.organizationId,
      );
      return { assignment, taskId: existingTask.id };
    }

    const taskResult = (await this.createTaskFromActivity(
      user,
      activity.id,
      {
        assignedToId: employeeId,
        frequency: activity.frequency,
        priority: Priority.MEDIUM,
        isAdhoc: false,
        acknowledgeOnCreate: true,
      },
      { notifyAssignee: false, systemGenerated: true },
    )) as { task?: { id?: string } };
    return { assignment, taskId: taskResult.task?.id };
  }

  private async deactivateActivityForEmployee(
    organizationId: string,
    employeeId: string,
    activityId: string,
  ) {
    const now = new Date();
    const timeZone = await this.getOrganizationTimeZone(organizationId);
    const today = getUtcDateInTimeZone(new Date(), timeZone);
    const tomorrow = addUtcDays(today, 1);

    return this.prisma.$transaction(async (tx) => {
      await tx.employeeActivityAssignment.updateMany({
        where: { organizationId, employeeId, activityId },
        data: {
          status: EmployeeActivityStatus.INACTIVE,
          deactivatedAt: now,
        },
      });
      const tasks = await tx.task.findMany({
        where: { ownerId: employeeId, activityId, isAdhoc: false },
        select: { id: true },
      });
      if (!tasks.length) return { removedFutureInstances: 0 };

      const taskIds = tasks.map((task) => task.id);
      await tx.task.updateMany({
        where: { id: { in: taskIds } },
        data: { isActive: false },
      });
      const deletion = await tx.taskInstance.deleteMany({
        where: {
          taskId: { in: taskIds },
          scheduledFor: { gte: tomorrow },
          status: TaskStatus.PENDING,
          completionPercent: 0,
        },
      });
      return { removedFutureInstances: deletion.count };
    });
  }

  async searchActivityEmployees(
    user: UserPayload,
    query: SearchDwmsEmployeesDto,
  ) {
    await this.getEmployee(user.userId, user.organizationId);
    if (!this.canManageActivities(user.roleLevel)) {
      throw new ForbiddenException(
        'Only management, admin, HR, HOD, and super admin users can manage employee activities',
      );
    }

    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100);
    const tokens = String(query.search ?? '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    const where: any = {
      organizationId: user.organizationId,
      employmentStatus: EmploymentStatus.ACTIVE,
      ...(tokens.length
        ? {
            AND: tokens.map((token) => ({
              OR: [
                { firstName: { contains: token, mode: 'insensitive' } },
                { lastName: { contains: token, mode: 'insensitive' } },
                { jobTitle: { contains: token, mode: 'insensitive' } },
              ],
            })),
          }
        : {}),
    };

    const [employees, total] = await Promise.all([
      this.prisma.employee.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeCode: true,
          jobTitle: true,
          department: { select: { id: true, name: true } },
        },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.employee.count({ where }),
    ]);

    return {
      data: employees.map((employee) => ({
        ...employee,
        name: `${employee.firstName} ${employee.lastName}`.trim(),
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async listActivities(user: UserPayload, status?: string) {
    await this.getEmployee(user.userId, user.organizationId);
    const activityStatus =
      status && status.toUpperCase() !== 'ALL'
        ? this.normalizeActivityStatus(status)
        : undefined;

    const activities = await this.prisma.activity.findMany({
      where: {
        organizationId: user.organizationId,
        ...(activityStatus ? { status: activityStatus } : {}),
      },
      include: ACTIVITY_INCLUDE,
      orderBy: [{ name: 'asc' }, { code: 'asc' }],
    });

    return {
      count: activities.length,
      activities: activities.map((activity) =>
        this.serializeActivity(activity),
      ),
    };
  }

  async getActivity(user: UserPayload, activityId: string) {
    await this.getEmployee(user.userId, user.organizationId);
    const activity = await this.prisma.activity.findFirst({
      where: { id: activityId, organizationId: user.organizationId },
      include: ACTIVITY_INCLUDE,
    });
    if (!activity) throw new NotFoundException('Activity not found');
    return this.serializeActivity(activity);
  }

  async createActivity(
    user: UserPayload,
    dto: CreateActivityDto,
    options: {
      assignScope?: boolean;
      notifyAssignees?: boolean;
      activityId?: string;
    } = {
      assignScope: true,
      notifyAssignees: true,
    },
  ) {
    await this.getEmployee(user.userId, user.organizationId);
    if (!this.canManageActivities(user.roleLevel)) {
      throw new ForbiddenException(
        'Only management, admin, HR, HOD, and super admin users can create activities',
      );
    }
    this.assertScopedActivityPayload(dto);
    if (
      dto.scope !== ActivityScope.EMPLOYEE &&
      (dto.parentActivityId || dto.parentActivityIds?.length)
    ) {
      throw new BadRequestException(
        'Parent Activity is supported only for Employee scope',
      );
    }
    await this.validateActivityReferences(user.organizationId, dto);
    const resolvedScope = await this.resolveActivityScope(
      user.organizationId,
      dto.scope,
      dto.scopeTarget,
    );
    const timeZone = await this.getOrganizationTimeZone(user.organizationId);
    const parentActivityIds = await this.validateParentActivities(
      user.organizationId,
      dto.frequency,
      dto.parentActivityId ? [dto.parentActivityId] : dto.parentActivityIds,
    );
    const organization = await this.prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { name: true },
    });

    try {
      const code = await this.resolveActivityCode(
        user.organizationId,
        dto.code,
      );
      const resumedActivity = options.activityId
        ? await this.prisma.activity.findFirst({
            where: {
              id: options.activityId,
              organizationId: user.organizationId,
            },
            include: ACTIVITY_INCLUDE,
          })
        : null;
      const activity =
        resumedActivity ??
        (await this.prisma.activity.create({
          data: {
            ...(options.activityId ? { id: options.activityId } : {}),
            organizationId: user.organizationId,
            companyUnitName: organization?.name ?? null,
            mainDepartmentId: dto.mainDepartmentId ?? null,
            subDepartment: dto.subDepartment ?? null,
            gembaSection: dto.gembaSection ?? null,
            processArea: dto.processArea ?? null,
            name: dto.name,
            workMethod: dto.workMethod,
            code,
            completionDeadline:
              dto.completionDeadline !== undefined
                ? String(dto.completionDeadline)
                : null,
            purpose: dto.purpose ?? null,
            frequency: dto.frequency,
            completionOutput: dto.completionOutput ?? null,
            primaryResponsibleDesignation:
              dto.primaryResponsibleDesignation ?? null,
            evidenceRequired: dto.evidenceRequired ?? null,
            effectiveFrom: this.parseActivityDate(undefined, timeZone),
            status: ACTIVE_ACTIVITY_STATUS,
            remarks: dto.remarks ?? null,
            scope: dto.scope,
            ...resolvedScope.scopeData,
          },
          include: ACTIVITY_INCLUDE,
        }));

      await this.replaceParentActivities(
        user.organizationId,
        activity.id,
        parentActivityIds,
      );
      const createdActivity = await this.prisma.activity.findUnique({
        where: { id: activity.id },
        include: ACTIVITY_INCLUDE,
      });

      const assignedEmployeeIds: string[] = [];
      const taskIds: string[] = [];
      if (options.assignScope !== false && createdActivity) {
        try {
          for (const recipient of resolvedScope.recipients) {
            const activated = await this.activateActivityForEmployee(
              user,
              createdActivity,
              recipient.id,
            );
            assignedEmployeeIds.push(recipient.id);
            if (activated.taskId) taskIds.push(activated.taskId);
          }
        } catch (assignmentError) {
          await this.prisma.task
            .deleteMany({ where: { activityId: activity.id } })
            .catch(() => undefined);
          await this.prisma.activity
            .delete({ where: { id: activity.id } })
            .catch(() => undefined);
          throw assignmentError;
        }
      }
      if (options.notifyAssignees !== false && assignedEmployeeIds.length) {
        await this.notifications.createMany(
          assignedEmployeeIds.map((employeeId) => ({
            employeeId,
            type: NotificationType.INFO,
            module: 'DWMS',
            title: 'DWMS activities updated',
            message: '1 activity has been added to your DWMS profile.',
            actionUrl: '/dwms/tasks',
          })),
        );
      }

      return {
        message: 'Activity created',
        activity: this.serializeActivity(createdActivity),
        assignedCount: assignedEmployeeIds.length,
        assignedEmployeeIds,
        taskIds,
      };
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new BadRequestException(
          'Activity code already exists in this organization',
        );
      }
      throw error;
    }
  }

  private serializeActivityIngestion(ingestion: any) {
    return {
      id: ingestion.id,
      fileName: ingestion.fileName,
      status: ingestion.status,
      totalRows: ingestion.totalRows,
      successfulRows: ingestion.successfulRows,
      failedRows: ingestion.failedRows,
      attempts: ingestion.attempts,
      availableAt:
        ingestion.availableAt?.toISOString?.() ?? ingestion.availableAt ?? null,
      startedAt:
        ingestion.startedAt?.toISOString?.() ?? ingestion.startedAt ?? null,
      failedAt:
        ingestion.failedAt?.toISOString?.() ?? ingestion.failedAt ?? null,
      failureMessage: ingestion.failureMessage
        ? this.cleanActivityIngestionError({
            message: ingestion.failureMessage,
          })
        : null,
      createdAt: ingestion.createdAt?.toISOString?.() ?? ingestion.createdAt,
      completedAt:
        ingestion.completedAt?.toISOString?.() ?? ingestion.completedAt ?? null,
      uploadedBy: ingestion.uploadedBy
        ? {
            id: ingestion.uploadedBy.id,
            name: `${ingestion.uploadedBy.firstName} ${ingestion.uploadedBy.lastName}`.trim(),
            email: ingestion.uploadedBy.email,
          }
        : null,
    };
  }

  private serializeActivityIngestionRow(row: any) {
    return {
      id: row.id,
      rowNumber: row.rowNumber,
      status: row.status === 'AWAITING_PARENT' ? 'PROCESSING' : row.status,
      activityName: row.activityName,
      activityCode: row.activityCode,
      parentActivityCode: row.parentActivityCode,
      sourcePayload: row.status === 'FAILED' ? row.payload : undefined,
      responsibleEmployeeCode: row.responsibleEmployeeCode,
      scope: row.scope,
      scopeTarget: row.scopeTarget,
      assignedCount: row.assignedCount,
      responsibleJobRole: row.activity?.primaryResponsibleDesignation ?? null,
      message: row.message
        ? this.cleanActivityIngestionError({ message: row.message })
        : row.message,
      activityId: row.activityId,
      taskId: row.taskId,
      createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
    };
  }

  async listActivityIngestions(user: UserPayload) {
    await this.getEmployee(user.userId, user.organizationId);
    if (!this.canManageActivities(user.roleLevel)) {
      throw new ForbiddenException(
        'Only management, admin, HR, HOD, and super admin users can view activity ingestion history',
      );
    }

    const ingestions = await this.prisma.activityIngestion.findMany({
      where: { organizationId: user.organizationId },
      include: {
        uploadedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return {
      ingestions: ingestions.map((item) =>
        this.serializeActivityIngestion(item),
      ),
    };
  }

  async getActivityIngestion(user: UserPayload, ingestionId: string) {
    await this.getEmployee(user.userId, user.organizationId);
    if (!this.canManageActivities(user.roleLevel)) {
      throw new ForbiddenException(
        'Only management, admin, HR, HOD, and super admin users can view activity ingestion history',
      );
    }

    const ingestion = await this.prisma.activityIngestion.findFirst({
      where: { id: ingestionId, organizationId: user.organizationId },
      include: {
        uploadedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        rows: {
          include: {
            activity: {
              select: { primaryResponsibleDesignation: true },
            },
          },
          orderBy: { rowNumber: 'asc' },
        },
      },
    });
    if (!ingestion) throw new NotFoundException('Activity ingestion not found');

    return {
      ingestion: this.serializeActivityIngestion(ingestion),
      rows: ingestion.rows.map((row) =>
        this.serializeActivityIngestionRow(row),
      ),
    };
  }

  async previewActivityIngestion(user: UserPayload, dto: IngestActivitiesDto) {
    await this.getEmployee(user.userId, user.organizationId);
    if (!this.canManageActivities(user.roleLevel)) {
      throw new ForbiddenException(
        'Only management, admin, HR, HOD, and super admin users can ingest activities',
      );
    }
    const rows = Array.isArray(dto.rows) ? dto.rows : [];
    if (!rows.length)
      throw new BadRequestException('No activity rows supplied for ingestion');

    const submittedByCode = new Map<
      string,
      IngestActivitiesDto['rows'][number]
    >();
    for (const row of rows) {
      const code = row.activity?.code?.trim().toLowerCase();
      if (code && !submittedByCode.has(code)) submittedByCode.set(code, row);
    }

    const results = [] as Array<{
      rowNumber: number;
      valid: boolean;
      activityCode?: string;
      activityName?: string;
      scope?: ActivityScope;
      scopeTarget?: string;
      matchedEmployees: number;
      message: string;
    }>;
    const seenCodes = new Set<string>();
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const rowNumber = row.rowNumber ?? index + 2;
      const code = row.activity?.code?.trim();
      try {
        this.assertScopedActivityPayload(row.activity);
        const normalizedCode = code!.toLowerCase();
        if (seenCodes.has(normalizedCode)) {
          throw new BadRequestException(
            `Duplicate Activity Code "${code}" in this file`,
          );
        }
        seenCodes.add(normalizedCode);
        const existing = await this.prisma.activity.findFirst({
          where: { organizationId: user.organizationId, code },
          select: { id: true },
        });
        if (existing)
          throw new BadRequestException(
            `Activity Code "${code}" already exists`,
          );

        const resolved = await this.resolveActivityScope(
          user.organizationId,
          row.activity.scope,
          row.activity.scopeTarget,
        );
        const parentCode = row.parentActivityCode?.trim();
        if (parentCode && !this.isBlankImportValue(parentCode)) {
          if (row.activity.scope !== ActivityScope.EMPLOYEE) {
            throw new BadRequestException(
              'Parent Activity Code is supported only for Employee scope',
            );
          }
          const submittedParent = submittedByCode.get(parentCode.toLowerCase());
          const existingParent = submittedParent
            ? null
            : await this.prisma.activity.findFirst({
                where: {
                  organizationId: user.organizationId,
                  code: parentCode,
                },
                select: { frequency: true },
              });
          const parentFrequency =
            submittedParent?.activity.frequency ?? existingParent?.frequency;
          if (!parentFrequency) {
            throw new BadRequestException(
              `Parent Activity Code "${parentCode}" was not found`,
            );
          }
          if (parentFrequency !== row.activity.frequency) {
            throw new BadRequestException(
              'Parent activity must have the same frequency',
            );
          }
        }
        results.push({
          rowNumber,
          valid: true,
          activityCode: code,
          activityName: row.activity.name,
          scope: row.activity.scope,
          scopeTarget: resolved.targetLabel ?? undefined,
          matchedEmployees: resolved.recipients.length,
          message: `Ready for ${resolved.recipients.length} ${resolved.recipients.length === 1 ? 'employee' : 'employees'}`,
        });
      } catch (error) {
        results.push({
          rowNumber,
          valid: false,
          activityCode: code,
          activityName: row.activity?.name,
          scope: row.activity?.scope,
          scopeTarget: row.activity?.scopeTarget,
          matchedEmployees: 0,
          message: this.cleanActivityIngestionError(error),
        });
      }
    }
    const valid = results.filter((row) => row.valid).length;
    return {
      count: results.length,
      valid,
      failed: results.length - valid,
      results,
    };
  }

  async ingestActivities(user: UserPayload, dto: IngestActivitiesDto) {
    const employee = await this.getEmployee(user.userId, user.organizationId);
    if (!this.canManageActivities(user.roleLevel)) {
      throw new ForbiddenException(
        'Only management, admin, HR, HOD, and super admin users can ingest activities',
      );
    }

    const rows = Array.isArray(dto.rows) ? dto.rows : [];
    if (rows.length === 0) {
      throw new BadRequestException('No activity rows supplied for ingestion');
    }
    const rowNumbers = rows.map((row, index) => row.rowNumber ?? index + 2);
    if (new Set(rowNumbers).size !== rowNumbers.length) {
      throw new BadRequestException('Activity row numbers must be unique');
    }

    const ingestion = await this.prisma.$transaction(async (tx) => {
      const queued = await tx.activityIngestion.create({
        data: {
          organizationId: user.organizationId,
          uploadedById: employee.id,
          requestedByUserId: user.userId,
          requestedRoleLevel: user.roleLevel,
          fileName: dto.fileName?.trim() || 'Activity Sheet',
          status: 'QUEUED',
          totalRows: rows.length,
        },
      });
      await tx.activityIngestionRow.createMany({
        data: rows.map((row, index) => {
          const scope = row.activity?.scope ?? null;
          const scopeTarget = row.activity?.scopeTarget?.trim() || null;
          const parentActivityCode = this.isBlankImportValue(
            row.parentActivityCode,
          )
            ? null
            : row.parentActivityCode!.trim();
          return {
            ingestionId: queued.id,
            organizationId: user.organizationId,
            rowNumber: rowNumbers[index],
            status: 'QUEUED',
            payload: row as any,
            targetActivityId: randomUUID(),
            parentActivityCode,
            activityName: row.activity?.name ?? null,
            activityCode: row.activity?.code ?? null,
            responsibleEmployeeCode:
              scope === ActivityScope.EMPLOYEE ? scopeTarget : null,
            scope,
            scopeTarget,
          };
        }),
      });
      return tx.activityIngestion.findUniqueOrThrow({
        where: { id: queued.id },
        include: {
          uploadedBy: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      });
    });

    return {
      message: `Queued ${rows.length} activity rows for import`,
      ingestion: this.serializeActivityIngestion(ingestion),
    };
  }

  private async refreshActivityIngestionProgress(ingestionId: string) {
    const [successfulRows, failedRows] = await Promise.all([
      this.prisma.activityIngestionRow.count({
        where: { ingestionId, status: 'CREATED' },
      }),
      this.prisma.activityIngestionRow.count({
        where: { ingestionId, status: 'FAILED' },
      }),
    ]);
    await this.prisma.activityIngestion.update({
      where: { id: ingestionId },
      data: { successfulRows, failedRows },
    });
    return { successfulRows, failedRows };
  }

  async processQueuedActivityIngestion(ingestionId: string, leaseId: string) {
    const ingestion = await this.prisma.activityIngestion.findFirst({
      where: { id: ingestionId, leaseId, status: 'PROCESSING' },
      include: { rows: { orderBy: { rowNumber: 'asc' } } },
    });
    if (!ingestion) throw new Error('Activity ingestion lease was lost');
    if (!ingestion.requestedByUserId || !ingestion.requestedRoleLevel) {
      throw new Error('Activity ingestion requester context is unavailable');
    }
    const user: UserPayload = {
      userId: ingestion.requestedByUserId,
      organizationId: ingestion.organizationId,
      roleLevel: ingestion.requestedRoleLevel,
    };

    for (const queuedRow of ingestion.rows) {
      if (!['QUEUED', 'PROCESSING'].includes(queuedRow.status)) continue;
      const row = queuedRow.payload as
        | IngestActivitiesDto['rows'][number]
        | null;
      if (!row || !queuedRow.targetActivityId) {
        await this.prisma.activityIngestionRow.update({
          where: { id: queuedRow.id },
          data: {
            status: 'FAILED',
            message: 'The queued row payload is unavailable.',
          },
        });
        continue;
      }
      await this.prisma.activityIngestionRow.update({
        where: { id: queuedRow.id },
        data: { status: 'PROCESSING' },
      });
      try {
        const activityPayload = this.stripActivityPersonReferences(
          row.activity,
        );
        activityPayload.parentActivityIds = undefined;
        this.assertScopedActivityPayload(activityPayload);
        if (
          queuedRow.parentActivityCode &&
          activityPayload.scope !== ActivityScope.EMPLOYEE
        ) {
          throw new BadRequestException(
            'Parent Activity Code is supported only for Employee scope',
          );
        }
        const created = await this.createActivity(user, activityPayload, {
          notifyAssignees: false,
          activityId: queuedRow.targetActivityId,
        });
        if (!created.activity?.id) {
          throw new BadRequestException('Activity could not be created');
        }
        const assignedCount = created.assignedCount ?? 0;
        const scopeTarget =
          created.activity.scopeTarget ?? queuedRow.scopeTarget;
        const assignmentMessage = `Activity scoped to ${String(queuedRow.scope).replaceAll('_', ' ').toLowerCase()}${scopeTarget ? ` "${scopeTarget}"` : ''}; assigned to ${assignedCount} ${assignedCount === 1 ? 'employee' : 'employees'}`;
        await this.prisma.activityIngestionRow.update({
          where: { id: queuedRow.id },
          data: {
            status: 'AWAITING_PARENT',
            activityId: created.activity.id,
            activityCode: created.activity.code ?? queuedRow.activityCode,
            scopeTarget,
            assignedCount,
            taskId: created.taskIds?.[0] ?? null,
            message: queuedRow.parentActivityCode
              ? `${assignmentMessage}; parent activity pending link`
              : assignmentMessage,
          },
        });
      } catch (error) {
        if (!this.isActivityIngestionRowError(error)) throw error;
        await this.prisma.activityIngestionRow.update({
          where: { id: queuedRow.id },
          data: {
            status: 'FAILED',
            assignedCount: 0,
            activityId: null,
            taskId: null,
            message: this.cleanActivityIngestionError(error),
          },
        });
      }
      await this.refreshActivityIngestionProgress(ingestionId);
    }

    const pendingParents = await this.prisma.activityIngestionRow.findMany({
      where: { ingestionId, status: 'AWAITING_PARENT' },
      orderBy: { rowNumber: 'asc' },
    });
    const createdActivityIdByCode = new Map(
      pendingParents
        .filter((row) => row.activityId && row.activityCode)
        .map((row) => [
          row.activityCode!.trim().toLowerCase(),
          row.activityId!,
        ]),
    );
    const parentCodes = Array.from(
      new Set(
        pendingParents
          .map((row) => row.parentActivityCode?.trim())
          .filter((code): code is string => !!code),
      ),
    );
    const externalParentCodes = parentCodes.filter(
      (code) => !createdActivityIdByCode.has(code.toLowerCase()),
    );
    const existingParents = externalParentCodes.length
      ? await this.prisma.activity.findMany({
          where: {
            organizationId: ingestion.organizationId,
            code: { in: externalParentCodes },
          },
          select: { id: true, code: true, frequency: true },
        })
      : [];
    const existingParentByCode = new Map(
      existingParents.map((activity) => [
        activity.code.toLowerCase(),
        activity,
      ]),
    );

    for (const rowRecord of pendingParents) {
      if (!rowRecord.activityId) continue;
      try {
        if (rowRecord.parentActivityCode) {
          const parentActivityId =
            createdActivityIdByCode.get(
              rowRecord.parentActivityCode.toLowerCase(),
            ) ??
            existingParentByCode.get(
              rowRecord.parentActivityCode.toLowerCase(),
            )?.id;
          if (!parentActivityId) {
            throw new BadRequestException(
              `Parent Activity Code "${rowRecord.parentActivityCode}" was not found`,
            );
          }
          const activityPayload = rowRecord.payload as
            | IngestActivitiesDto['rows'][number]
            | null;
          const parentActivityIds = await this.validateParentActivities(
            ingestion.organizationId,
            activityPayload!.activity.frequency,
            [parentActivityId],
            rowRecord.activityId,
          );
          await this.replaceParentActivities(
            ingestion.organizationId,
            rowRecord.activityId,
            parentActivityIds,
          );
        }
        await this.prisma.activityIngestionRow.update({
          where: { id: rowRecord.id },
          data: {
            status: 'CREATED',
            message: rowRecord.parentActivityCode
              ? `${rowRecord.message?.replace('; parent activity pending link', '')} and parent activity linked`
              : rowRecord.message,
          },
        });
      } catch (error) {
        if (!this.isActivityIngestionRowError(error)) throw error;
        await this.prisma.task
          .deleteMany({ where: { activityId: rowRecord.activityId } })
          .catch(() => undefined);
        await this.prisma.activity
          .delete({ where: { id: rowRecord.activityId } })
          .catch(() => undefined);
        await this.prisma.activityIngestionRow.update({
          where: { id: rowRecord.id },
          data: {
            status: 'FAILED',
            activityId: null,
            taskId: null,
            assignedCount: 0,
            message: this.cleanActivityIngestionError(error),
          },
        });
      }
      await this.refreshActivityIngestionProgress(ingestionId);
    }

    const successfulRows = await this.prisma.activityIngestionRow.findMany({
      where: { ingestionId, status: 'CREATED', activityId: { not: null } },
      select: { activityId: true },
    });
    const assignments = successfulRows.length
      ? await this.prisma.employeeActivityAssignment.findMany({
          where: {
            activityId: {
              in: successfulRows.map((row) => row.activityId!),
            },
            status: EmployeeActivityStatus.ACTIVE,
          },
          select: { employeeId: true },
        })
      : [];
    const activityCountByEmployee = new Map<string, number>();
    for (const assignment of assignments) {
      activityCountByEmployee.set(
        assignment.employeeId,
        (activityCountByEmployee.get(assignment.employeeId) ?? 0) + 1,
      );
    }
    const assignmentNotifications = Array.from(
      activityCountByEmployee,
      ([employeeId, count]) => ({
        employeeId,
        type: NotificationType.INFO,
        module: 'DWMS',
        title: 'DWMS activities updated',
        message: `${count} ${count === 1 ? 'activity has' : 'activities have'} been added to your DWMS profile.`,
        actionUrl: '/dwms/tasks',
      }),
    );

    const progress = await this.refreshActivityIngestionProgress(ingestionId);
    const completed = await this.prisma.activityIngestion.updateMany({
      where: { id: ingestionId, leaseId, status: 'PROCESSING' },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        failedAt: null,
        failureMessage: null,
        leaseId: null,
        leaseUntil: null,
      },
    });
    if (completed.count !== 1)
      throw new Error('Activity ingestion lease was lost');
    await this.notifications
      .createMany(assignmentNotifications)
      .catch(() => undefined);
    return progress;
  }

  private activityMatchesEmployee(activity: any, employee: any) {
    if (activity.scope === ActivityScope.ORGANISATION) return true;
    if (activity.scope === ActivityScope.DEPARTMENT) {
      return (
        !!employee.departmentId &&
        activity.scopeDepartmentId === employee.departmentId
      );
    }
    if (activity.scope === ActivityScope.JOB_TITLE) {
      return (
        !!activity.scopeJobTitle &&
        activity.scopeJobTitle === this.normalizeJobTitle(employee.jobTitle)
      );
    }
    if (activity.scope === ActivityScope.EMPLOYEE) {
      return activity.scopeEmployeeId === employee.id;
    }
    return false;
  }

  async listEmployeeRoleActivities(user: UserPayload, employeeId: string) {
    await this.getEmployee(user.userId, user.organizationId);
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, organizationId: user.organizationId },
      select: {
        id: true,
        jobTitle: true,
        departmentId: true,
        employmentStatus: true,
      },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    const jobTitle = this.normalizeJobTitle(employee.jobTitle);
    const scopeFilters: any[] = [{ scope: ActivityScope.ORGANISATION }];
    if (employee.departmentId) {
      scopeFilters.push({
        scope: ActivityScope.DEPARTMENT,
        scopeDepartmentId: employee.departmentId,
      });
    }
    if (jobTitle) {
      scopeFilters.push({
        scope: ActivityScope.JOB_TITLE,
        scopeJobTitle: jobTitle,
      });
    }
    scopeFilters.push({
      scope: ActivityScope.EMPLOYEE,
      scopeEmployeeId: employee.id,
    });

    const [applicableActivities, assignments] = await Promise.all([
      this.prisma.activity.findMany({
        where: {
          organizationId: user.organizationId,
          status: ActivityStatus.ACTIVE,
          OR: scopeFilters,
        },
        include: ACTIVITY_INCLUDE,
      }),
      this.prisma.employeeActivityAssignment.findMany({
        where: { organizationId: user.organizationId, employeeId },
        include: { activity: { include: ACTIVITY_INCLUDE } },
      }),
    ]);

    const assignmentByActivityId = new Map(
      assignments.map((assignment) => [assignment.activityId, assignment]),
    );
    const activityById = new Map<string, any>();
    for (const activity of applicableActivities)
      activityById.set(activity.id, activity);
    for (const assignment of assignments) {
      activityById.set(assignment.activityId, assignment.activity);
    }
    const activities = Array.from(activityById.values())
      .sort(
        (a, b) => a.name.localeCompare(b.name) || a.code.localeCompare(b.code),
      )
      .map((activity) =>
        this.serializeEmployeeRoleActivity(activity, assignmentByActivityId),
      );

    return { jobTitle, count: activities.length, activities };
  }

  async updateEmployeeActivityAssignment(
    user: UserPayload,
    employeeId: string,
    activityId: string,
    dto: UpdateEmployeeActivityAssignmentDto,
  ) {
    await this.getEmployee(user.userId, user.organizationId);
    if (!this.canManageActivities(user.roleLevel)) {
      throw new ForbiddenException(
        'Only management, admin, HR, HOD, and super admin users can update employee activity status',
      );
    }

    const [employee, activity] = await Promise.all([
      this.prisma.employee.findFirst({
        where: { id: employeeId, organizationId: user.organizationId },
        select: {
          id: true,
          jobTitle: true,
          departmentId: true,
          employmentStatus: true,
        },
      }),
      this.prisma.activity.findFirst({
        where: { id: activityId, organizationId: user.organizationId },
        include: ACTIVITY_INCLUDE,
      }),
    ]);
    if (!employee) throw new NotFoundException('Employee not found');
    if (!activity) throw new NotFoundException('Activity not found');

    const existingAssignment =
      await this.prisma.employeeActivityAssignment.findUnique({
        where: { employeeId_activityId: { employeeId, activityId } },
      });
    if (
      dto.status === EmployeeActivityStatus.ACTIVE &&
      (activity.status !== ActivityStatus.ACTIVE ||
        employee.employmentStatus !== EmploymentStatus.ACTIVE ||
        !this.activityMatchesEmployee(activity, employee))
    ) {
      throw new BadRequestException(
        'Activity does not currently apply to this active employee',
      );
    }
    if (dto.status === EmployeeActivityStatus.INACTIVE && !existingAssignment) {
      throw new BadRequestException(
        'Employee activity assignment was not found',
      );
    }

    let assignment;
    let removedFutureInstances = 0;
    if (dto.status === EmployeeActivityStatus.ACTIVE) {
      assignment = (
        await this.activateActivityForEmployee(user, activity, employeeId)
      ).assignment;
    } else {
      const result = await this.deactivateActivityForEmployee(
        user.organizationId,
        employeeId,
        activityId,
      );
      removedFutureInstances = result.removedFutureInstances;
      assignment = await this.prisma.employeeActivityAssignment.findUnique({
        where: { employeeId_activityId: { employeeId, activityId } },
      });
    }

    return {
      message:
        dto.status === EmployeeActivityStatus.ACTIVE
          ? 'Employee activity activated'
          : 'Employee activity deactivated',
      item: this.serializeEmployeeRoleActivity(
        activity,
        new Map([[activityId, assignment]]),
      ),
      removedFutureInstances,
    };
  }

  async synchronizeEmployeeActivities(
    organizationId: string,
    employeeId: string,
    options: {
      isNewEmployee?: boolean;
      previousDepartmentId?: string | null;
      previousJobTitle?: string | null;
      previousEmploymentStatus?: EmploymentStatus | null;
    } = {},
  ) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, organizationId },
      select: {
        id: true,
        departmentId: true,
        jobTitle: true,
        employmentStatus: true,
      },
    });
    if (!employee) return;

    const activities = await this.prisma.activity.findMany({
      where: { organizationId, scope: { not: null } },
      include: ACTIVITY_INCLUDE,
    });
    const assignments = await this.prisma.employeeActivityAssignment.findMany({
      where: { organizationId, employeeId },
    });
    const assignmentByActivityId = new Map(
      assignments.map((assignment) => [assignment.activityId, assignment]),
    );
    const systemUser: UserPayload = {
      userId: '',
      organizationId,
      roleLevel: 'SYSTEM',
    };

    if (employee.employmentStatus !== EmploymentStatus.ACTIVE) {
      for (const assignment of assignments) {
        if (assignment.status === EmployeeActivityStatus.ACTIVE) {
          await this.deactivateActivityForEmployee(
            organizationId,
            employeeId,
            assignment.activityId,
          );
        }
      }
      return;
    }

    if (options.isNewEmployee) {
      for (const activity of activities) {
        if (!this.activityMatchesEmployee(activity, employee)) continue;
        await this.prisma.employeeActivityAssignment.upsert({
          where: {
            employeeId_activityId: { employeeId, activityId: activity.id },
          },
          update: {},
          create: {
            organizationId,
            employeeId,
            activityId: activity.id,
            status: EmployeeActivityStatus.INACTIVE,
            deactivatedAt: new Date(),
          },
        });
      }
      return;
    }

    if (
      options.previousEmploymentStatus &&
      options.previousEmploymentStatus !== EmploymentStatus.ACTIVE
    ) {
      for (const activity of activities) {
        if (activity.status !== ActivityStatus.ACTIVE) continue;
        if (this.activityMatchesEmployee(activity, employee)) {
          await this.activateActivityForEmployee(
            systemUser,
            activity,
            employeeId,
          );
        }
      }
      return;
    }

    const previousEmployee = {
      ...employee,
      departmentId:
        'previousDepartmentId' in options
          ? options.previousDepartmentId
          : employee.departmentId,
      jobTitle:
        'previousJobTitle' in options
          ? options.previousJobTitle
          : employee.jobTitle,
    };
    for (const activity of activities) {
      const matchedBefore = this.activityMatchesEmployee(
        activity,
        previousEmployee,
      );
      const matchesNow =
        activity.status === ActivityStatus.ACTIVE &&
        this.activityMatchesEmployee(activity, employee);
      if (!matchedBefore && matchesNow) {
        await this.activateActivityForEmployee(
          systemUser,
          activity,
          employeeId,
        );
      } else if (
        matchedBefore &&
        !matchesNow &&
        assignmentByActivityId.has(activity.id)
      ) {
        await this.deactivateActivityForEmployee(
          organizationId,
          employeeId,
          activity.id,
        );
      }
    }
  }

  async updateActivity(
    user: UserPayload,
    activityId: string,
    dto: UpdateActivityDto,
  ) {
    await this.getEmployee(user.userId, user.organizationId);
    if (!this.canEditActivityContent(user.roleLevel)) {
      throw new ForbiddenException(
        'Only management, admin, HR, and super admin users can edit activity content',
      );
    }

    const existing = await this.prisma.activity.findFirst({
      where: { id: activityId, organizationId: user.organizationId },
      include: ACTIVITY_INCLUDE,
    });
    if (!existing) throw new NotFoundException('Activity not found');
    if (existing.status === ARCHIVED_ACTIVITY_STATUS) {
      throw new BadRequestException('Archived activities cannot be edited');
    }

    const content = {
      workMethod:
        dto.workMethod !== undefined
          ? dto.workMethod.trim()
          : existing.workMethod,
      purpose:
        dto.purpose !== undefined ? dto.purpose.trim() || null : existing.purpose,
      startTrigger:
        dto.startTrigger !== undefined
          ? dto.startTrigger.trim() || null
          : existing.startTrigger,
      completionOutput:
        dto.completionOutput !== undefined
          ? dto.completionOutput.trim()
          : existing.completionOutput,
      evidenceRequired:
        dto.evidenceRequired !== undefined
          ? dto.evidenceRequired.trim() || null
          : existing.evidenceRequired,
      remarks:
        dto.remarks !== undefined ? dto.remarks.trim() : existing.remarks,
    };

    if (!content.workMethod?.trim()) {
      throw new BadRequestException('Description / SOP is required');
    }
    if (!content.completionOutput?.trim()) {
      throw new BadRequestException('Expected Output is required');
    }
    if (!content.remarks?.trim()) {
      throw new BadRequestException('Remarks are required');
    }

    const description = this.formatActivityTaskDescription(content);
    const requiresCompletionDocument = Boolean(
      content.evidenceRequired?.trim(),
    );
    const timeZone = await this.getOrganizationTimeZone(user.organizationId);
    const tomorrow = addUtcDays(getUtcDateInTimeZone(new Date(), timeZone), 1);

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const activity = await tx.activity.update({
          where: { id: activityId },
          data: content,
          include: ACTIVITY_INCLUDE,
        });
        const tasks = await tx.task.updateMany({
          where: { activityId, isAdhoc: false },
          data: {
            description,
            requiresCompletionDocument,
            completionDocumentName: content.evidenceRequired,
          },
        });
        const futureInstances = await tx.taskInstance.updateMany({
          where: {
            task: { activityId, isAdhoc: false },
            scheduledFor: { gte: tomorrow },
            status: TaskStatus.PENDING,
            completionPercent: 0,
          },
          data: {
            descriptionSnapshot: description,
            requiresDocumentSnapshot: requiresCompletionDocument,
            documentNameSnapshot: content.evidenceRequired,
          },
        });
        return { activity, tasks, futureInstances };
      });

      return {
        message: 'Activity updated',
        activity: this.serializeActivity(result.activity),
        updatedTaskDefinitions: result.tasks.count,
        updatedFutureTasks: result.futureInstances.count,
      };
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new BadRequestException(
          'Activity code already exists in this organization',
        );
      }
      throw error;
    }
  }

  async archiveActivity(user: UserPayload, activityId: string) {
    await this.getEmployee(user.userId, user.organizationId);
    if (!this.canManageActivities(user.roleLevel)) {
      throw new ForbiddenException(
        'Only management, admin, HR, HOD, and super admin users can archive activities',
      );
    }
    const existing = await this.prisma.activity.findFirst({
      where: { id: activityId, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Activity not found');

    const activity = await this.prisma.activity.update({
      where: { id: activityId },
      data: { status: ARCHIVED_ACTIVITY_STATUS },
      include: ACTIVITY_INCLUDE,
    });

    const assignments = await this.prisma.employeeActivityAssignment.findMany({
      where: { organizationId: user.organizationId, activityId },
      select: { employeeId: true },
    });
    for (const assignment of assignments) {
      await this.deactivateActivityForEmployee(
        user.organizationId,
        assignment.employeeId,
        activityId,
      );
    }

    return {
      message: 'Activity archived',
      activity: this.serializeActivity(activity),
    };
  }

  async createTaskFromActivity(
    user: UserPayload,
    activityId: string,
    dto: CreateTaskFromActivityDto,
    options: { notifyAssignee?: boolean; systemGenerated?: boolean } = {},
  ) {
    const activity = await this.prisma.activity.findFirst({
      where: { id: activityId, organizationId: user.organizationId },
    });
    if (!activity) throw new NotFoundException('Activity not found');
    if (activity.status === ARCHIVED_ACTIVITY_STATUS) {
      throw new BadRequestException('Archived activities cannot create tasks');
    }

    const assignedToId =
      dto.assignedToId ?? activity.primaryResponsibleEmployeeId;
    if (!assignedToId) {
      throw new BadRequestException(
        'Select an assignee or configure a primary responsible person on the activity',
      );
    }

    const frequency = dto.frequency ?? activity.frequency;
    assertSupportedActivityFrequency(frequency);

    return this.createAssignedTask(
      user,
      {
        activityId: activity.id,
        title: activity.name,
        description: this.formatActivityTaskDescription(activity),
        assignedToId,
        dueDate: dto.dueDate,
        priority: dto.priority ?? Priority.MEDIUM,
        frequency,
        approvedById: dto.approvedById ?? undefined,
        backupOwnerId: dto.backupOwnerId ?? undefined,
        requiresCompletionDocument: !!activity.evidenceRequired?.trim(),
        completionDocumentName: activity.evidenceRequired?.trim() || undefined,
        isAdhoc: dto.isAdhoc,
        acknowledgeOnCreate: dto.acknowledgeOnCreate,
      },
      options,
    );
  }
}
