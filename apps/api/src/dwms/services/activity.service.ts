import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  ActivityStatus,
  EmployeeActivityStatus,
  Priority,
  RoleName,
  TaskFrequency,
} from 'db';
import {
  ActivityIngestionAssignmentMode,
  CreateActivityDto,
  CreateTaskFromActivityDto,
  IngestActivitiesDto,
  UpdateActivityDto,
  UpdateEmployeeActivityAssignmentDto,
} from '../dto/dwms.dto';
import { UserPayload } from './base.service';
import { DwmsTaskService } from './task.service';
import {
  getUtcDateInTimeZone,
  parseDateOnly,
} from '../utils/taskSchedule';

function assertSupportedActivityFrequency(
  frequency: TaskFrequency | null | undefined,
) {
  if (String(frequency) === 'EVERY_5_MINUTES') {
    throw new BadRequestException(
      'Every 5 minutes task frequency is no longer supported',
    );
  }
}

const ACTIVITY_INCLUDE = {
  mainDepartment: { select: { id: true, name: true } },
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
    return {
      ...activity,
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

  private parseActivityDate(value: string | null | undefined, timeZone: string) {
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
    dto: CreateActivityDto | UpdateActivityDto,
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

  private async resolveEmployeeByCodeOrId(
    organizationId: string,
    employeeCode: string,
  ) {
    const code = employeeCode.trim();
    if (!code) {
      throw new BadRequestException('Responsible Emp ID is required');
    }

    const exactMatches = await this.prisma.employee.findMany({
      where: {
        organizationId,
        OR: [{ id: code }, { employeeCode: code }],
      },
      select: { id: true, employeeCode: true },
    });
    if (exactMatches.length === 1) return exactMatches[0];
    if (exactMatches.length > 1) {
      throw new BadRequestException(
        `Responsible Emp ID "${code}" matches multiple employees`,
      );
    }

    const candidates = await this.prisma.employee.findMany({
      where: { organizationId, employeeCode: { not: null } },
      select: { id: true, employeeCode: true },
    });
    const normalizedMatches = candidates.filter(
      (employee) => employee.employeeCode?.toLowerCase() === code.toLowerCase(),
    );
    if (normalizedMatches.length === 1) return normalizedMatches[0];
    if (normalizedMatches.length > 1) {
      throw new BadRequestException(
        `Responsible Emp ID "${code}" matches multiple employees`,
      );
    }

    throw new BadRequestException(
      `Responsible Emp ID "${code}" was not found in this organization`,
    );
  }

  private async resolveActivityIngestionRecipients(
    organizationId: string,
    assignmentMode: ActivityIngestionAssignmentMode,
    responsibleEmployeeCode?: string | null,
  ) {
    if (assignmentMode === ActivityIngestionAssignmentMode.INDIVIDUAL) {
      return [
        await this.resolveEmployeeByCodeOrId(
          organizationId,
          responsibleEmployeeCode ?? '',
        ),
      ];
    }

    const roleName =
      assignmentMode === ActivityIngestionAssignmentMode.ALL_HOD
        ? RoleName.HOD
        : assignmentMode === ActivityIngestionAssignmentMode.ALL_MANAGEMENT
          ? RoleName.MANAGEMENT
          : null;

    const recipients = await this.prisma.employee.findMany({
      where: {
        organizationId,
        ...(roleName
          ? {
              user: {
                organizations: {
                  some: { organizationId, role: { name: roleName } },
                },
              },
            }
          : {}),
      },
      select: { id: true, employeeCode: true },
      orderBy: { createdAt: 'asc' },
    });

    if (recipients.length === 0) {
      throw new BadRequestException(
        `No employees found for assignment mode "${assignmentMode}"`,
      );
    }

    return recipients;
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

  async createActivity(user: UserPayload, dto: CreateActivityDto) {
    await this.getEmployee(user.userId, user.organizationId);
    if (!this.canManageActivities(user.roleLevel)) {
      throw new ForbiddenException(
        'Only management, admin, HR, HOD, and super admin users can create activities',
      );
    }
    await this.validateActivityReferences(user.organizationId, dto);
    assertSupportedActivityFrequency(dto.frequency);
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
      const activity = await this.prisma.activity.create({
        data: {
          organizationId: user.organizationId,
          companyUnitName: organization?.name ?? null,
          mainDepartmentId: dto.mainDepartmentId ?? null,
          subDepartment: dto.subDepartment ?? null,
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
          effectiveFrom: this.parseActivityDate(dto.effectiveFrom, timeZone),
          status: this.normalizeActivityStatus(dto.status),
        },
        include: ACTIVITY_INCLUDE,
      });

      await this.replaceParentActivities(
        user.organizationId,
        activity.id,
        parentActivityIds,
      );
      await this.linkActivityToJobTitle(
        user.organizationId,
        activity.id,
        dto.primaryResponsibleDesignation,
      );
      const createdActivity = await this.prisma.activity.findUnique({
        where: { id: activity.id },
        include: ACTIVITY_INCLUDE,
      });

      return {
        message: 'Activity created',
        activity: this.serializeActivity(createdActivity),
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
      status: row.status,
      activityName: row.activityName,
      activityCode: row.activityCode,
      responsibleEmployeeCode: row.responsibleEmployeeCode,
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
        rows: { orderBy: { rowNumber: 'asc' } },
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

    const ingestion = await this.prisma.activityIngestion.create({
      data: {
        organizationId: user.organizationId,
        uploadedById: employee.id,
        fileName: dto.fileName?.trim() || 'Activity Sheet',
        status: 'PROCESSING',
        totalRows: rows.length,
        successfulRows: 0,
        failedRows: 0,
      },
    });

    const results: Array<{
      rowNumber: number;
      success: boolean;
      activityId?: string;
      taskId?: string;
      responsibleEmployeeId?: string;
      assignedCount?: number;
      message: string;
    }> = [];
    const rowRecords: Array<{
      organizationId: string;
      ingestionId: string;
      rowNumber: number;
      status: string;
      activityName?: string | null;
      activityCode?: string | null;
      responsibleEmployeeCode?: string | null;
      message?: string | null;
      activityId?: string | null;
      taskId?: string | null;
    }> = [];
    const successfulImports: Array<{
      rowNumber: number;
      resultIndex: number;
      rowRecordIndex: number;
      activityId: string;
      activityCode: string | null;
      activityName: string | null;
      frequency: TaskFrequency;
      parentActivityCode: string | null;
      assignedCount: number;
    }> = [];

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const rowNumber = row.rowNumber ?? index + 2;
      const activityName = row.activity?.name ?? null;
      const activityCode = row.activity?.code ?? null;
      const assignmentMode =
        row.assignmentMode ?? ActivityIngestionAssignmentMode.INDIVIDUAL;
      const responsibleEmployeeCode =
        assignmentMode === ActivityIngestionAssignmentMode.INDIVIDUAL
          ? (row.responsibleEmployeeCode ?? null)
          : null;
      const parentActivityCode = row.parentActivityCode?.trim() || null;
      try {
        if (
          !Object.values(ActivityIngestionAssignmentMode).includes(
            assignmentMode,
          )
        ) {
          throw new BadRequestException(
            `Assignment Mode must be one of: ${Object.values(ActivityIngestionAssignmentMode).join(', ')}`,
          );
        }
        const activityPayload = this.stripActivityPersonReferences(
          row.activity,
        );
        activityPayload.parentActivityIds = undefined;
        if (
          !activityPayload?.name?.trim() ||
          !activityPayload?.workMethod?.trim()
        ) {
          throw new BadRequestException(
            'Process Name and Description / SOP are required',
          );
        }
        if (!activityPayload.frequency) {
          throw new BadRequestException('Frequency is required');
        }
        if (activityPayload.frequency === TaskFrequency.PLANNED) {
          throw new BadRequestException(
            'Activity ingestion does not support planned one-time rows. Use a recurring frequency: Daily, Weekly, Monthly, Quarterly, or Yearly.',
          );
        }

        const recipients = await this.resolveActivityIngestionRecipients(
          user.organizationId,
          assignmentMode,
          row.responsibleEmployeeCode,
        );

        const created = await this.createActivity(user, activityPayload);
        const activityId = created.activity?.id;
        if (!activityId) {
          throw new BadRequestException('Activity could not be created');
        }

        try {
          const taskIds: string[] = [];
          for (const recipient of recipients) {
            const taskResult = (await this.createTaskFromActivity(
              user,
              activityId,
              {
                assignedToId: recipient.id,
                frequency: activityPayload.frequency,
                priority: Priority.MEDIUM,
                isAdhoc: false,
                acknowledgeOnCreate: true,
              },
              { notifyAssignee: false, systemGenerated: true },
            )) as { task?: { id?: string } };
            if (taskResult.task?.id) taskIds.push(taskResult.task.id);
          }
          const taskId = taskIds[0];
          const assignedCount = recipients.length;
          const assignmentMessage = `Activity assigned to ${assignedCount} ${assignedCount === 1 ? 'user' : 'users'}`;
          const resultIndex = results.length;
          results.push({
            rowNumber,
            success: true,
            activityId,
            taskId,
            responsibleEmployeeId:
              assignedCount === 1 ? recipients[0]?.id : undefined,
            assignedCount,
            message: parentActivityCode
              ? `${assignmentMessage}; parent activity pending link`
              : assignmentMessage,
          });
          const rowRecordIndex = rowRecords.length;
          rowRecords.push({
            organizationId: user.organizationId,
            ingestionId: ingestion.id,
            rowNumber,
            status: 'CREATED',
            activityName,
            activityCode: created.activity?.code ?? activityCode,
            responsibleEmployeeCode,
            message: parentActivityCode
              ? `${assignmentMessage}; parent activity pending link`
              : assignmentMessage,
            activityId,
            taskId,
          });
          successfulImports.push({
            rowNumber,
            resultIndex,
            rowRecordIndex,
            activityId,
            activityCode: created.activity?.code ?? activityCode,
            activityName,
            frequency: activityPayload.frequency,
            parentActivityCode,
            assignedCount,
          });
        } catch (taskError) {
          await this.prisma.task
            .deleteMany({ where: { activityId } })
            .catch(() => undefined);
          await this.prisma.activity
            .delete({ where: { id: activityId } })
            .catch(() => undefined);
          throw taskError;
        }
      } catch (error: any) {
        const message = this.cleanActivityIngestionError(error);
        results.push({ rowNumber, success: false, message });
        rowRecords.push({
          organizationId: user.organizationId,
          ingestionId: ingestion.id,
          rowNumber,
          status: 'FAILED',
          activityName,
          activityCode,
          responsibleEmployeeCode,
          message,
        });
      }
    }

    const createdActivityByCode = new Map<
      string,
      { id: string; name: string | null; frequency: TaskFrequency }
    >();
    for (const item of successfulImports) {
      const code = item.activityCode?.trim().toLowerCase();
      if (!code) continue;
      createdActivityByCode.set(code, {
        id: item.activityId,
        name: item.activityName,
        frequency: item.frequency,
      });
    }

    const parentCodes = Array.from(
      new Set(
        successfulImports
          .map((item) => item.parentActivityCode?.trim())
          .filter((code): code is string => !!code),
      ),
    );
    const externalParentCodes = parentCodes.filter(
      (code) => !createdActivityByCode.has(code.toLowerCase()),
    );
    const existingParents = externalParentCodes.length
      ? await this.prisma.activity.findMany({
          where: {
            organizationId: user.organizationId,
            code: { in: externalParentCodes },
          },
          select: { id: true, name: true, code: true, frequency: true },
        })
      : [];
    const existingParentByCode = new Map(
      existingParents.map((activity) => [
        activity.code.toLowerCase(),
        activity,
      ]),
    );

    for (const item of successfulImports) {
      const parentCode = item.parentActivityCode?.trim();
      if (!parentCode) continue;

      try {
        const parent =
          createdActivityByCode.get(parentCode.toLowerCase()) ??
          existingParentByCode.get(parentCode.toLowerCase());
        if (!parent) {
          throw new BadRequestException(
            `Parent Activity Code "${parentCode}" was not found`,
          );
        }

        const parentActivityIds = await this.validateParentActivities(
          user.organizationId,
          item.frequency,
          [parent.id],
          item.activityId,
        );
        await this.replaceParentActivities(
          user.organizationId,
          item.activityId,
          parentActivityIds,
        );

        const message = `Activity assigned to ${item.assignedCount} ${item.assignedCount === 1 ? 'user' : 'users'} and parent activity linked`;
        results[item.resultIndex].message = message;
        rowRecords[item.rowRecordIndex].message = message;
      } catch (error: any) {
        await this.prisma.task
          .deleteMany({ where: { activityId: item.activityId } })
          .catch(() => undefined);
        await this.prisma.activity
          .delete({ where: { id: item.activityId } })
          .catch(() => undefined);
        const message = this.cleanActivityIngestionError(error);
        results[item.resultIndex].success = false;
        results[item.resultIndex].message = message;
        results[item.resultIndex].activityId = undefined;
        results[item.resultIndex].taskId = undefined;
        rowRecords[item.rowRecordIndex].status = 'FAILED';
        rowRecords[item.rowRecordIndex].message = message;
        rowRecords[item.rowRecordIndex].activityId = null;
        rowRecords[item.rowRecordIndex].taskId = null;
      }
    }

    if (rowRecords.length > 0) {
      await this.prisma.activityIngestionRow.createMany({ data: rowRecords });
    }

    const created = results.filter((result) => result.success).length;
    const updatedIngestion = await this.prisma.activityIngestion.update({
      where: { id: ingestion.id },
      data: {
        status: 'COMPLETED',
        successfulRows: created,
        failedRows: results.length - created,
        completedAt: new Date(),
      },
      include: {
        uploadedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    return {
      message: `Imported ${created} of ${results.length} activity rows`,
      ingestion: this.serializeActivityIngestion(updatedIngestion),
      count: results.length,
      created,
      failed: results.length - created,
      results,
    };
  }

  async listEmployeeRoleActivities(user: UserPayload, employeeId: string) {
    await this.getEmployee(user.userId, user.organizationId);
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, organizationId: user.organizationId },
      select: { id: true, jobTitle: true },
    });
    if (!employee) throw new NotFoundException('Employee not found');

    const jobTitle = this.normalizeJobTitle(employee.jobTitle);
    if (!jobTitle) {
      return { jobTitle: null, count: 0, activities: [] };
    }

    const [roleActivities, assignments] = await Promise.all([
      this.prisma.jobTitleActivity.findMany({
        where: { organizationId: user.organizationId, jobTitle },
        include: { activity: { include: ACTIVITY_INCLUDE } },
        orderBy: [{ activity: { name: 'asc' } }, { activity: { code: 'asc' } }],
      }),
      this.prisma.employeeActivityAssignment.findMany({
        where: { organizationId: user.organizationId, employeeId },
      }),
    ]);

    const assignmentByActivityId = new Map(
      assignments.map((assignment) => [assignment.activityId, assignment]),
    );
    const activities = roleActivities.map((item) =>
      this.serializeEmployeeRoleActivity(item, assignmentByActivityId),
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
        select: { id: true, jobTitle: true },
      }),
      this.prisma.activity.findFirst({
        where: { id: activityId, organizationId: user.organizationId },
        include: ACTIVITY_INCLUDE,
      }),
    ]);
    if (!employee) throw new NotFoundException('Employee not found');
    if (!activity) throw new NotFoundException('Activity not found');

    const jobTitle = this.normalizeJobTitle(employee.jobTitle);
    if (!jobTitle) {
      throw new BadRequestException('Employee does not have a job title');
    }

    const roleActivity = await this.prisma.jobTitleActivity.findFirst({
      where: { organizationId: user.organizationId, jobTitle, activityId },
      select: { id: true },
    });
    if (!roleActivity) {
      throw new BadRequestException(
        'Activity is not linked to this employee job title',
      );
    }

    const now = new Date();
    const assignment = await this.prisma.employeeActivityAssignment.upsert({
      where: { employeeId_activityId: { employeeId, activityId } },
      update: {
        status: dto.status,
        activatedAt:
          dto.status === EmployeeActivityStatus.ACTIVE ? now : undefined,
        deactivatedAt:
          dto.status === EmployeeActivityStatus.INACTIVE ? now : null,
      },
      create: {
        organizationId: user.organizationId,
        employeeId,
        activityId,
        status: dto.status,
        activatedAt: dto.status === EmployeeActivityStatus.ACTIVE ? now : null,
        deactivatedAt:
          dto.status === EmployeeActivityStatus.INACTIVE ? now : null,
      },
    });

    if (dto.status === EmployeeActivityStatus.ACTIVE) {
      const existingTask = await this.prisma.task.findFirst({
        where: {
          ownerId: employeeId,
          activityId,
          frequency: activity.frequency,
          isAdhoc: false,
        },
        select: { id: true },
      });

      if (!existingTask) {
        await this.createTaskFromActivity(
          user,
          activityId,
          {
            assignedToId: employeeId,
            frequency: activity.frequency,
            priority: Priority.MEDIUM,
            isAdhoc: false,
            acknowledgeOnCreate: true,
          },
          { systemGenerated: true },
        );
      }
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
    };
  }
  async updateActivity(
    user: UserPayload,
    activityId: string,
    dto: UpdateActivityDto,
  ) {
    await this.getEmployee(user.userId, user.organizationId);
    if (!this.canManageActivities(user.roleLevel)) {
      throw new ForbiddenException(
        'Only management, admin, HR, HOD, and super admin users can update activities',
      );
    }
    await this.validateActivityReferences(user.organizationId, dto);
    assertSupportedActivityFrequency(dto.frequency);

    const existing = await this.prisma.activity.findFirst({
      where: { id: activityId, organizationId: user.organizationId },
      select: { id: true, frequency: true },
    });
    if (!existing) throw new NotFoundException('Activity not found');

    const parentActivityIds = await this.validateParentActivities(
      user.organizationId,
      dto.frequency ?? existing.frequency,
      dto.parentActivityId ? [dto.parentActivityId] : dto.parentActivityIds,
      activityId,
    );

    const data: any = {};
    if (dto.mainDepartmentId !== undefined)
      data.mainDepartmentId = dto.mainDepartmentId || null;
    if (dto.subDepartment !== undefined)
      data.subDepartment = dto.subDepartment || null;
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.workMethod !== undefined) data.workMethod = dto.workMethod;
    if (dto.code !== undefined) data.code = dto.code.trim();
    if (dto.completionDeadline !== undefined)
      data.completionDeadline = String(dto.completionDeadline);
    if (dto.purpose !== undefined) data.purpose = dto.purpose || null;
    if (dto.frequency !== undefined) {
      assertSupportedActivityFrequency(dto.frequency);
      data.frequency = dto.frequency;
    }
    if (dto.completionOutput !== undefined)
      data.completionOutput = dto.completionOutput || null;
    if (dto.primaryResponsibleDesignation !== undefined)
      data.primaryResponsibleDesignation =
        dto.primaryResponsibleDesignation || null;
    if (dto.evidenceRequired !== undefined)
      data.evidenceRequired = dto.evidenceRequired || null;
    if (dto.status !== undefined)
      data.status = this.normalizeActivityStatus(dto.status);
    if (dto.effectiveFrom !== undefined) {
      data.effectiveFrom = this.parseActivityDate(
        dto.effectiveFrom,
        await this.getOrganizationTimeZone(user.organizationId),
      );
    }

    try {
      await this.prisma.activity.update({
        where: { id: activityId },
        data,
      });
      await this.replaceParentActivities(
        user.organizationId,
        activityId,
        parentActivityIds,
      );
      if (dto.primaryResponsibleDesignation !== undefined) {
        await this.linkActivityToJobTitle(
          user.organizationId,
          activityId,
          dto.primaryResponsibleDesignation,
        );
      }
      const activity = await this.prisma.activity.findUnique({
        where: { id: activityId },
        include: ACTIVITY_INCLUDE,
      });

      return {
        message: 'Activity updated',
        activity: this.serializeActivity(activity),
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
        description: activity.workMethod ?? activity.purpose ?? undefined,
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
