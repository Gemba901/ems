import { NotFoundException } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { TaskStatus, ViewLevel, type Prisma } from 'db';
import {
  addUtcDays,
  endOfDayInTimeZone,
  getOrganizationDateRange,
  getUtcDateInTimeZone,
  startOfDayInTimeZone,
  toIsoDate,
} from '../utils/taskSchedule';
import { getKenyaPublicHolidays } from '../../calendar/kenya-holidays';
import { calculateDoneTaskMetrics } from '../utils/taskMetrics';
import {
  completedStatuses,
  nonOverdueStatusValues,
  UserPayload,
} from './base.service';
import { DwmsAlertsService } from './alerts.service';
import {
  DWMS_TASK_CATEGORIES,
  type DwmsTaskCategory,
  resolveTaskCategory,
} from './task.service';

const TASK_BREAKDOWN_STATUS = {
  NOT_ACKNOWLEDGED: 'NOT_ACKNOWLEDGED',
  PENDING: 'PENDING',
  APPROVAL_PENDING: 'APPROVAL_PENDING',
  OVERDUE: 'OVERDUE',
  OVERDUE_COMPLETED: 'OVERDUE_COMPLETED',
  COMPLETED: 'COMPLETED',
} as const;

type TaskBreakdownStatus =
  (typeof TASK_BREAKDOWN_STATUS)[keyof typeof TASK_BREAKDOWN_STATUS];

const TASK_BREAKDOWN_LABELS: Record<TaskBreakdownStatus, string> = {
  NOT_ACKNOWLEDGED: 'Not Acknowledged',
  PENDING: 'Pending / In Progress',
  APPROVAL_PENDING: 'Awaiting Approval',
  OVERDUE: 'Overdue',
  OVERDUE_COMPLETED: 'Overdue & Completed',
  COMPLETED: 'Completed On Time',
};

export abstract class DwmsDashboardService extends DwmsAlertsService {
  private async resolveDashboardDays(
    organizationId: string,
    timeZone: string,
    rawDays?: string,
  ) {
    if (rawDays?.trim().toLowerCase() !== 'all') {
      return this.normalizeDashboardDays(rawDays);
    }

    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { createdAt: true },
    });
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    const firstDay = getUtcDateInTimeZone(organization.createdAt, timeZone);
    const today = getUtcDateInTimeZone(new Date(), timeZone);
    return (
      Math.max(
        0,
        Math.round(
          (today.getTime() - firstDay.getTime()) / (24 * 60 * 60 * 1000),
        ),
      ) + 1
    );
  }

  // Dashboard calculations
  async getOverviewStats(user: UserPayload, rawDays?: string) {
    await this.getEmployee(user.userId, user.organizationId);
    const access = await this.getDwmsAccessCapabilities(user);
    if (access.analyticsViewLevel !== ViewLevel.ORGANIZATION) {
      throw new ForbiddenException('Organization analytics access is required');
    }
    const timeZone = await this.getOrganizationTimeZone(user.organizationId);
    const days = await this.resolveDashboardDays(
      user.organizationId,
      timeZone,
      rawDays,
    );

    const members = await this.prisma.employee.findMany({
      where: { organizationId: user.organizationId },
      include: { department: true },
    });
    const userIds = members.map((m) => m.id);

    const summary = await this.getPerformanceMetrics(
      userIds,
      user.organizationId,
      timeZone,
      undefined,
      days,
      true,
    );
    const taskCategoryBreakdown = await this.getTaskCategoryStatusBreakdown(
      userIds,
      timeZone,
      days,
    );
    const trends = await this.getTrendsForEntity(
      'overview',
      null,
      user.organizationId,
      timeZone,
      days,
    );

    const departments = await this.prisma.department.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: 'asc' },
    });

    const departmentCompliance = await Promise.all(
      departments.map(async (department) => {
        const departmentMembers = members.filter(
          (member) => member.departmentId === department.id,
        );
        const metrics = await this.getPerformanceMetrics(
          departmentMembers.map((member) => member.id),
          user.organizationId,
          timeZone,
          department.id,
          days,
        );

        return {
          id: department.id,
          name: department.name,
          ...metrics,
        };
      }),
    );

    const employeeScoreboard = await Promise.all(
      members.map(async (member) => {
        const metrics = await this.getPerformanceMetrics(
          [member.id],
          user.organizationId,
          timeZone,
          undefined,
          days,
        );

        return {
          id: member.id,
          name: `${member.firstName} ${member.lastName}`.trim(),
          email: member.email,
          department: member.department?.name ?? 'Unassigned',
          role: member.jobTitle ?? 'Employee',
          ...metrics,
        };
      }),
    );

    return {
      summary: { ...summary, taskCategoryBreakdown },
      trends,
      departmentCompliance,
      employeeScoreboard: employeeScoreboard.sort(
        (a, b) => b.tasksPerformedTodayPercent - a.tasksPerformedTodayPercent,
      ),
    };
  }

  async getDepartmentStats(
    user: UserPayload,
    deptId: string,
    rawDays?: string,
  ) {
    const currentEmployee = await this.getEmployee(
      user.userId,
      user.organizationId,
    );
    const access = await this.getDwmsAccessCapabilities(user);
    if (
      !this.viewLevelAtLeast(access.analyticsViewLevel, ViewLevel.DEPARTMENT)
    ) {
      throw new ForbiddenException('Department analytics access is required');
    }
    if (
      access.analyticsViewLevel === ViewLevel.DEPARTMENT &&
      currentEmployee.departmentId !== deptId
    ) {
      throw new ForbiddenException(
        'You can only view analytics for your department',
      );
    }
    const timeZone = await this.getOrganizationTimeZone(user.organizationId);
    const days = await this.resolveDashboardDays(
      user.organizationId,
      timeZone,
      rawDays,
    );

    const members = await this.prisma.employee.findMany({
      where: { departmentId: deptId, organizationId: user.organizationId },
      select: { id: true },
    });
    const userIds = members.map((m) => m.id);

    const summary = await this.getPerformanceMetrics(
      userIds,
      user.organizationId,
      timeZone,
      deptId,
      days,
    );
    const taskCategoryBreakdown = await this.getTaskCategoryStatusBreakdown(
      userIds,
      timeZone,
      days,
    );
    const trends = await this.getTrendsForEntity(
      'department',
      deptId,
      user.organizationId,
      timeZone,
      days,
    );
    const department = await this.prisma.department.findFirst({
      where: { id: deptId, organizationId: user.organizationId },
      select: { name: true },
    });
    const employeeScoreboard = await this.getEmployeeScoreboard(
      userIds,
      user.organizationId,
      timeZone,
      days,
    );

    return {
      summary: { ...summary, taskCategoryBreakdown },
      trends,
      departmentName: department?.name ?? 'Department',
      employeeScoreboard,
    };
  }

  async getEmployeeStats(
    user: UserPayload,
    employeeId: string,
    rawDays?: string,
  ) {
    const currentEmployee = await this.getEmployee(
      user.userId,
      user.organizationId,
    );
    const timeZone = await this.getOrganizationTimeZone(user.organizationId);
    const days = await this.resolveDashboardDays(
      user.organizationId,
      timeZone,
      rawDays,
    );

    const employee = await this.prisma.employee.findFirst({
      where: {
        organizationId: user.organizationId,
        OR: [{ id: employeeId }, { userId: employeeId }],
      },
      include: { department: true },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    if (employee.id !== currentEmployee.id) {
      const hasEmployeePerformanceRole =
        this.getDwmsRole(user.roleLevel) === 'MANAGEMENT';
      if (!hasEmployeePerformanceRole) {
        throw new ForbiddenException(
          'Employee performance requires management, admin, super admin, or HR access',
        );
      }
    }

    const resolvedEmployeeId = employee.id;
    const summary = await this.getPerformanceMetrics(
      [resolvedEmployeeId],
      user.organizationId,
      timeZone,
      undefined,
      days,
    );
    const taskCategoryBreakdown = await this.getTaskCategoryStatusBreakdown(
      [resolvedEmployeeId],
      timeZone,
      days,
    );
    const trends = await this.getTrendsForEntity(
      'employee',
      resolvedEmployeeId,
      user.organizationId,
      timeZone,
      days,
    );
    const reportees = await this.listReporteesRecursive(resolvedEmployeeId);
    const reporteeIds = reportees
      .filter((reportee) => reportee.organizationId === user.organizationId)
      .map((reportee) => reportee.id);
    const reporteesPerformance = await this.getEmployeeScoreboard(
      reporteeIds,
      user.organizationId,
      timeZone,
      days,
    );

    return {
      summary: { ...summary, taskCategoryBreakdown },
      trends,
      employee: {
        id: employee.id,
        name: `${employee.firstName} ${employee.lastName}`.trim(),
        email: employee.email,
        role: employee.jobTitle ?? 'Employee',
        departmentName: employee.department?.name ?? 'Unassigned',
      },
      reporteesPerformance,
    };
  }

  private async getEmployeeScoreboard(
    userIds: string[],
    orgId: string,
    timeZone: string,
    days = 7,
  ) {
    const employees = await this.prisma.employee.findMany({
      where: { id: { in: userIds }, organizationId: orgId },
      include: { department: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });

    const rows = await Promise.all(
      employees.map(async (employee) => {
        const metrics = await this.getPerformanceMetrics(
          [employee.id],
          orgId,
          timeZone,
          undefined,
          days,
        );

        return {
          id: employee.id,
          name: `${employee.firstName} ${employee.lastName}`.trim(),
          email: employee.email,
          role: employee.jobTitle ?? 'Employee',
          departmentName: employee.department?.name ?? 'Unassigned',
          department: employee.department?.name ?? 'Unassigned',
          ...metrics,
        };
      }),
    );

    return rows.sort(
      (a, b) => b.tasksPerformedTodayPercent - a.tasksPerformedTodayPercent,
    );
  }

  private async getTaskCategoryStatusBreakdown(
    userIds: string[],
    timeZone: string,
    days: number,
  ) {
    const now = new Date();
    const { scheduleStart, scheduleEnd } = getOrganizationDateRange(
      now,
      timeZone,
      days,
    );
    const instances = await this.prisma.taskInstance.findMany({
      where: {
        ownerId: { in: userIds },
        scheduledFor: { gte: scheduleStart, lte: scheduleEnd },
        status: { not: TaskStatus.NOT_APPLICABLE },
      },
      select: {
        status: true,
        dueAt: true,
        completedAt: true,
        task: {
          select: {
            assignedById: true,
            acknowledgedAt: true,
            activity: { select: { scope: true } },
          },
        },
      },
    });
    const categoryKeys = Object.values(
      DWMS_TASK_CATEGORIES,
    ) as DwmsTaskCategory[];
    const counts = Object.fromEntries(
      categoryKeys.map((category) => [
        category,
        Object.fromEntries(
          Object.values(TASK_BREAKDOWN_STATUS).map((status) => [status, 0]),
        ) as Record<TaskBreakdownStatus, number>,
      ]),
    ) as Record<DwmsTaskCategory, Record<TaskBreakdownStatus, number>>;

    instances.forEach((instance) => {
      const category = resolveTaskCategory(instance.task);
      let status: TaskBreakdownStatus;

      if (instance.status === TaskStatus.DONE) {
        status =
          instance.completedAt && instance.completedAt > instance.dueAt
            ? TASK_BREAKDOWN_STATUS.OVERDUE_COMPLETED
            : TASK_BREAKDOWN_STATUS.COMPLETED;
      } else if (
        instance.status === TaskStatus.OVERDUE ||
        instance.dueAt < now
      ) {
        status = TASK_BREAKDOWN_STATUS.OVERDUE;
      } else if (instance.status === TaskStatus.APPROVAL_PENDING) {
        status = TASK_BREAKDOWN_STATUS.APPROVAL_PENDING;
      } else if (!instance.task.acknowledgedAt) {
        status = TASK_BREAKDOWN_STATUS.NOT_ACKNOWLEDGED;
      } else {
        status = TASK_BREAKDOWN_STATUS.PENDING;
      }

      counts[category][status] += 1;
    });

    return Object.fromEntries(
      categoryKeys.map((category) => {
        const total = Object.values(counts[category]).reduce(
          (sum, count) => sum + count,
          0,
        );
        return [
          category,
          {
            total,
            statuses: Object.values(TASK_BREAKDOWN_STATUS).map((status) => ({
              key: status,
              label: TASK_BREAKDOWN_LABELS[status],
              count: counts[category][status],
              percentage:
                total === 0
                  ? 0
                  : Number(
                      ((counts[category][status] / total) * 100).toFixed(1),
                    ),
            })),
          },
        ];
      }),
    );
  }

  private getAlertPerformanceScope(
    orgId: string,
    userIds: string[],
    departmentId?: string,
    organizationWide = false,
  ): Prisma.AlertWhereInput {
    if (organizationWide) {
      // Organization performance includes employee-, task-, department-, and
      // organization-targeted alerts raised anywhere in the organization.
      return { organizationId: orgId };
    }

    if (departmentId) {
      // Department performance includes alerts against department employees
      // (including task alerts) and alerts raised directly to the department.
      return {
        organizationId: orgId,
        OR: [{ againstUser: { departmentId } }, { departmentId }],
      };
    }

    return { organizationId: orgId, againstUserId: { in: userIds } };
  }

  private countDirectAlertTargets(
    occurrences: Array<{
      alert: {
        departmentId: string | null;
        againstUserId: string | null;
        taskInstanceId: string | null;
      };
    }>,
  ) {
    return {
      departmentAlertsCount: occurrences.filter(
        ({ alert }) =>
          alert.departmentId !== null &&
          alert.againstUserId === null &&
          alert.taskInstanceId === null,
      ).length,
      organizationAlertsCount: occurrences.filter(
        ({ alert }) =>
          alert.departmentId === null &&
          alert.againstUserId === null &&
          alert.taskInstanceId === null,
      ).length,
    };
  }

  private employeeTargetOccurrences<
    T extends { alert: { againstUserId: string | null } },
  >(occurrences: T[]) {
    return occurrences.filter(
      (occurrence) => occurrence.alert.againstUserId !== null,
    );
  }

  private splitAlertOccurrencesBySequence<
    T extends { id: string; alertId: string; raisedAt: Date },
  >(occurrences: T[]) {
    const occurrencesByAlert = new Map<string, T[]>();

    occurrences.forEach((occurrence) => {
      const existing = occurrencesByAlert.get(occurrence.alertId) ?? [];
      existing.push(occurrence);
      occurrencesByAlert.set(occurrence.alertId, existing);
    });

    const alerts: T[] = [];
    const abnormalities: T[] = [];

    occurrencesByAlert.forEach((alertOccurrences) => {
      alertOccurrences
        .sort(
          (a, b) =>
            a.raisedAt.getTime() - b.raisedAt.getTime() ||
            a.id.localeCompare(b.id),
        )
        .forEach((occurrence, index) => {
          if (index < 2) alerts.push(occurrence);
          else abnormalities.push(occurrence);
        });
    });

    return { alerts, abnormalities };
  }

  private async getPerformanceMetrics(
    userIds: string[],
    orgId: string,
    timeZone: string,
    departmentId?: string,
    days = 7,
    organizationWide = false,
  ) {
    const now = new Date();
    const { scheduleStart, scheduleEnd, instantStart, instantEnd } =
      getOrganizationDateRange(now, timeZone, days);

    const rangeInstances = await this.prisma.taskInstance.findMany({
      where: {
        ownerId: { in: userIds },
        scheduledFor: { gte: scheduleStart, lte: scheduleEnd },
      },
      include: {
        task: {
          select: {
            assignedById: true,
            acknowledgedAt: true,
            activity: { select: { scope: true } },
          },
        },
      },
    });

    const rangeTasks = await this.prisma.task.findMany({
      where: {
        ownerId: { in: userIds },
        OR: [
          { dueDate: { gte: scheduleStart, lte: scheduleEnd } },
          { dueDate: null, createdAt: { gte: instantStart, lte: instantEnd } },
          {
            dueDate: { lt: scheduleStart },
            status: { notIn: nonOverdueStatusValues },
          },
        ],
      },
      select: {
        id: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        dueDate: true,
        assignedById: true,
        acknowledgedAt: true,
      },
    });

    const instanceTaskIds = new Set(rangeInstances.map((inst) => inst.taskId));
    const taskOnlyRows = rangeTasks.filter(
      (task) => !instanceTaskIds.has(task.id),
    );
    const completionMetrics = calculateDoneTaskMetrics(rangeInstances);
    const totalTasksCount = completionMetrics.total;
    const completedInstancesCount = completionMetrics.completed;
    const tasksPerformedTodayPercent = completionMetrics.percentage;
    const completionRateByCategory = Object.fromEntries(
      (Object.values(DWMS_TASK_CATEGORIES) as DwmsTaskCategory[]).map(
        (category) => {
          const categoryMetrics = calculateDoneTaskMetrics(
            rangeInstances.filter(
              (instance) => resolveTaskCategory(instance.task) === category,
            ),
          );
          return [category, categoryMetrics.percentage];
        },
      ),
    ) as Record<DwmsTaskCategory, number>;
    const taskCategoryMetrics = Object.fromEntries(
      (Object.values(DWMS_TASK_CATEGORIES) as DwmsTaskCategory[]).map(
        (category) => {
          const categoryInstances = rangeInstances.filter(
            (instance) =>
              instance.status !== TaskStatus.NOT_APPLICABLE &&
              resolveTaskCategory(instance.task) === category,
          );
          const completed = categoryInstances.filter(
            (instance) => instance.status === TaskStatus.DONE,
          ).length;
          const overdue = categoryInstances.filter(
            (instance) =>
              instance.status !== TaskStatus.DONE &&
              (instance.status === TaskStatus.OVERDUE || instance.dueAt < now),
          ).length;
          const notAcknowledged = categoryInstances.filter(
            (instance) =>
              instance.status !== TaskStatus.DONE &&
              instance.status !== TaskStatus.OVERDUE &&
              instance.dueAt >= now &&
              !instance.task.acknowledgedAt,
          ).length;
          const pending = Math.max(
            0,
            categoryInstances.length - completed - overdue - notAcknowledged,
          );

          return [
            category,
            {
              pending,
              completed,
              overdue,
              notAcknowledged,
              completionRate: completionRateByCategory[category],
            },
          ];
        },
      ),
    ) as Record<
      DwmsTaskCategory,
      {
        pending: number;
        completed: number;
        overdue: number;
        notAcknowledged: number;
        completionRate: number;
      }
    >;
    const overdueInstances = rangeInstances.filter(
      (inst) => !completedStatuses.has(inst.status) && inst.dueAt < now,
    ).length;
    const overdueTaskOnly = taskOnlyRows.filter(
      (task) =>
        !completedStatuses.has(task.status) &&
        task.dueDate !== null &&
        task.dueDate < now,
    ).length;
    const overdueTasks = overdueInstances + overdueTaskOnly;

    const completedAssignedInstances = await this.prisma.taskInstance.findMany({
      where: {
        ownerId: { in: userIds },
        scheduledFor: { gte: scheduleStart, lte: scheduleEnd },
        status: TaskStatus.DONE,
        completedAt: { not: null },
      },
      select: { completedAt: true, dueAt: true },
    });
    const completedOnTimeRate =
      completedAssignedInstances.length === 0
        ? null
        : Math.round(
            (completedAssignedInstances.filter(
              (task) => task.completedAt! <= task.dueAt,
            ).length /
              completedAssignedInstances.length) *
              100,
          );

    // Alert occurrences for this scope. Every raise is counted, even after acknowledgment.
    const alertScopeWhere = this.getAlertPerformanceScope(
      orgId,
      userIds,
      departmentId,
      organizationWide,
    );
    const alertOccurrences = await this.prisma.alertOccurrence.findMany({
      where: {
        raisedAt: { lte: instantEnd },
        alert: alertScopeWhere,
      },
      select: {
        id: true,
        alertId: true,
        raisedAt: true,
        acknowledgedAt: true,
        alert: {
          select: {
            departmentId: true,
            againstUserId: true,
            taskInstanceId: true,
          },
        },
      },
    });
    // Existing alert KPIs remain person/task based. Direct department and
    // organization targets are reported separately below.
    const employeeTargetOccurrences =
      this.employeeTargetOccurrences(alertOccurrences);
    const classifiedEmployeeOccurrences = this.splitAlertOccurrencesBySequence(
      employeeTargetOccurrences,
    );
    const isInReportRange = (occurrence: { raisedAt: Date }) =>
      occurrence.raisedAt >= instantStart && occurrence.raisedAt <= instantEnd;
    const alertRows =
      classifiedEmployeeOccurrences.alerts.filter(isInReportRange);
    const abnormalityRows =
      classifiedEmployeeOccurrences.abnormalities.filter(isInReportRange);
    const alertsCount = alertRows.length;
    const acknowledgedAlertsCount = alertRows.filter(
      (occurrence) => occurrence.acknowledgedAt !== null,
    ).length;
    const abnormalitiesCount = abnormalityRows.length;
    const { departmentAlertsCount, organizationAlertsCount } =
      this.countDirectAlertTargets(alertRows);
    const averageOccurrenceAcknowledgement = (
      occurrences: typeof alertOccurrences,
    ) => {
      const durations = occurrences.flatMap((occurrence) =>
        occurrence.acknowledgedAt
          ? [
              Math.max(
                0,
                occurrence.acknowledgedAt.getTime() -
                  occurrence.raisedAt.getTime(),
              ),
            ]
          : [],
      );
      return durations.length === 0
        ? null
        : Number(
            (
              durations.reduce((sum, duration) => sum + duration, 0) /
              durations.length /
              (1000 * 60)
            ).toFixed(1),
          );
    };
    const alertAcknowledgementTimeMin =
      averageOccurrenceAcknowledgement(alertRows);
    const abnormalityAcknowledgementTimeMin =
      averageOccurrenceAcknowledgement(abnormalityRows);

    // Avg Acknowledge Time
    const acknowledgedTasks = await this.prisma.task.findMany({
      where: {
        ownerId: { in: userIds },
        assignedById: { not: null },
        acknowledgedAt: { not: null },
        createdAt: { gte: instantStart, lte: instantEnd },
      },
      select: {
        createdAt: true,
        acknowledgedAt: true,
      },
    });

    let avgAcknowledgeTimeMin = 0;
    if (acknowledgedTasks.length > 0) {
      const totalAckDuration = acknowledgedTasks.reduce((acc, curr) => {
        const duration = Math.max(
          0,
          curr.acknowledgedAt!.getTime() - curr.createdAt.getTime(),
        );
        return acc + duration;
      }, 0);
      avgAcknowledgeTimeMin = Number(
        (totalAckDuration / acknowledgedTasks.length / (1000 * 60)).toFixed(1),
      );
    }

    // Avg Close Time
    const completedInstances = await this.prisma.taskInstance.findMany({
      where: {
        ownerId: { in: userIds },
        task: { assignedById: { not: null } },
        status: { in: [TaskStatus.DONE, TaskStatus.NOT_APPLICABLE] },
        completedAt: { not: null, gte: instantStart, lte: instantEnd },
      },
      include: {
        task: { select: { acknowledgedAt: true } },
      },
    });

    const completedTaskOnlyRows = taskOnlyRows.filter(
      (task) =>
        completedStatuses.has(task.status) && task.assignedById !== null,
    );
    let avgCloseTimeMin = 0;
    const closeDurations = [
      ...completedInstances.map((curr) => {
        const startTime = curr.task.acknowledgedAt ?? curr.createdAt;
        return Math.max(0, curr.completedAt!.getTime() - startTime.getTime());
      }),
      ...completedTaskOnlyRows.map((task) => {
        const startTime = task.acknowledgedAt ?? task.createdAt;
        return Math.max(0, task.updatedAt.getTime() - startTime.getTime());
      }),
    ];

    if (closeDurations.length > 0) {
      const totalCloseDuration = closeDurations.reduce(
        (acc, duration) => acc + duration,
        0,
      );
      avgCloseTimeMin = Number(
        (totalCloseDuration / closeDurations.length / (1000 * 60)).toFixed(1),
      );
    }

    return {
      completionRate: tasksPerformedTodayPercent,
      totalTasks: totalTasksCount,
      completedTasks: completedInstancesCount,
      overdueTasks,
      overdueCount: overdueTasks,
      completedCount: completedInstancesCount,
      tasksPerformedTodayPercent,
      alertsCount,
      departmentAlertsCount,
      organizationAlertsCount,
      acknowledgedAlertsCount,
      abnormalitiesCount,
      alertAcknowledgementTimeMin,
      abnormalityAcknowledgementTimeMin,
      completedOnTimeRate,
      avgAcknowledgeTimeMin,
      avgAssignedTaskAcknowledgeTimeMin: avgAcknowledgeTimeMin,
      avgCloseTimeMin,
      completionRateByCategory,
      taskCategoryMetrics,
    };
  }

  private async getTrendsForEntity(
    entityType: 'employee' | 'department' | 'overview',
    entityId: string | null,
    orgId: string,
    timeZone: string,
    daysCount: number,
  ) {
    const now = new Date();
    const dateRange = getOrganizationDateRange(now, timeZone, daysCount);
    const { scheduleStart, scheduleEnd, instantStart, instantEnd } = dateRange;
    const trendDaysCount =
      Math.round(
        (scheduleEnd.getTime() - scheduleStart.getTime()) /
          (24 * 60 * 60 * 1000),
      ) + 1;
    const leaveSettingsDelegate = this.prisma.leaveSettings as unknown as {
      findUnique(args: {
        where: { organizationId: string };
        select: { workingDays: true };
      }): Promise<{ workingDays: number[] } | null>;
    };
    const leaveSettings = await leaveSettingsDelegate.findUnique({
      where: { organizationId: orgId },
      select: { workingDays: true },
    });
    const configuredWorkingDays = leaveSettings?.workingDays ?? [];
    const workingDays = new Set(
      configuredWorkingDays.length > 0
        ? configuredWorkingDays
        : [1, 2, 3, 4, 5],
    );
    const holidayDates = new Set<string>();
    for (
      let year = scheduleStart.getUTCFullYear();
      year <= scheduleEnd.getUTCFullYear();
      year += 1
    ) {
      for (const holiday of getKenyaPublicHolidays(year)) {
        holidayDates.add(holiday.date);
      }
    }

    let userIds: string[] = [];
    if (entityType === 'employee') {
      userIds = [entityId!];
    } else if (entityType === 'department') {
      const members = await this.prisma.employee.findMany({
        where: { departmentId: entityId! },
        select: { id: true },
      });
      userIds = members.map((m) => m.id);
    } else {
      const members = await this.prisma.employee.findMany({
        where: { organizationId: orgId },
        select: { id: true },
      });
      userIds = members.map((m) => m.id);
    }

    const allInstances = await this.prisma.taskInstance.findMany({
      where: {
        ownerId: { in: userIds },
        scheduledFor: { gte: scheduleStart, lte: scheduleEnd },
      },
      include: {
        task: {
          select: {
            acknowledgedAt: true,
            assignedById: true,
            activity: { select: { scope: true } },
          },
        },
      },
    });

    const alertWhere = this.getAlertPerformanceScope(
      orgId,
      entityType === 'employee' ? [entityId!] : userIds,
      entityType === 'department' ? entityId! : undefined,
      entityType === 'overview',
    );
    const alertsWhere: Prisma.AlertOccurrenceWhereInput = {
      alert: alertWhere,
      raisedAt: { lte: instantEnd },
    };

    const allAlerts = await this.prisma.alertOccurrence.findMany({
      where: alertsWhere,
      select: {
        id: true,
        alertId: true,
        raisedAt: true,
        acknowledgedAt: true,
        alert: {
          select: {
            againstUserId: true,
          },
        },
      },
    });
    const employeeTargetAlerts = this.employeeTargetOccurrences(allAlerts);
    const classifiedEmployeeAlerts =
      this.splitAlertOccurrencesBySequence(employeeTargetAlerts);

    const allTasks = await this.prisma.task.findMany({
      where: {
        ownerId: { in: userIds },
        OR: [
          { createdAt: { gte: instantStart, lte: instantEnd } },
          { dueDate: { gte: scheduleStart, lte: scheduleEnd } },
          {
            dueDate: { lt: scheduleStart },
            status: { notIn: nonOverdueStatusValues },
          },
        ],
      },
      select: {
        id: true,
        status: true,
        dueDate: true,
        updatedAt: true,
        createdAt: true,
        assignedById: true,
        acknowledgedAt: true,
      },
    });

    const tasksPerformedToday: Array<{
      date: string;
      label: string;
      value: number | null;
      completionRate: number | null;
      completed: number;
      total: number;
      allTasks: number;
      completedTasks: number;
      notCompletedTasks: number;
      overdueTasks: number;
      alertsCount: number;
      completedOnTimeRate: number;
      avgAcknowledgeTimeMin: number;
      goodPracticeCompletionRate: number | null;
      jobResponsibilityCompletionRate: number | null;
      assignedTaskCompletionRate: number | null;
      abnormalitiesCount: number;
    }> = [];
    const pendingAlertAcknowledgments: Array<{
      date: string;
      label: string;
      value: number;
    }> = [];
    const timeToAcknowledge: Array<{
      date: string;
      label: string;
      value: number;
      avgAcknowledgeTimeMin: number;
    }> = [];
    const timeToClose: Array<{
      date: string;
      label: string;
      value: number;
      avgCloseTimeMin: number;
    }> = [];

    for (let i = trendDaysCount - 1; i >= 0; i--) {
      const scheduleDay = addUtcDays(scheduleEnd, -i);
      const dayStart = startOfDayInTimeZone(scheduleDay, timeZone);
      const dayEnd = endOfDayInTimeZone(scheduleDay, timeZone);
      const label = scheduleDay.toLocaleString('en-US', {
        timeZone: 'UTC',
        month: 'short',
        day: 'numeric',
      });
      const date = toIsoDate(scheduleDay);

      if (!workingDays.has(scheduleDay.getUTCDay()) || holidayDates.has(date)) {
        continue;
      }

      const dayInsts = allInstances.filter(
        (inst) => inst.scheduledFor.getTime() === scheduleDay.getTime(),
      );
      const completionMetrics = calculateDoneTaskMetrics(dayInsts);
      const totalInsts = completionMetrics.total;
      const completedInsts = completionMetrics.completed;
      const tasksVal =
        completionMetrics.total > 0 ? completionMetrics.percentage : null;
      const categoryCompletionRates = Object.fromEntries(
        (Object.values(DWMS_TASK_CATEGORIES) as DwmsTaskCategory[]).map(
          (category) => {
            const metrics = calculateDoneTaskMetrics(
              dayInsts.filter(
                (instance) => resolveTaskCategory(instance.task) === category,
              ),
            );
            return [category, metrics.total > 0 ? metrics.percentage : null];
          },
        ),
      ) as Record<DwmsTaskCategory, number | null>;
      const overdueDayTasks = dayInsts.filter(
        (task) => !completedStatuses.has(task.status) && task.dueAt < now,
      ).length;
      const completedOnTime = dayInsts.filter(
        (task) =>
          task.status === TaskStatus.DONE &&
          task.completedAt &&
          task.completedAt <= task.dueAt,
      );
      const completedOnTimeRate =
        completedInsts === 0
          ? 0
          : Math.round((completedOnTime.length / completedInsts) * 100);
      const dayAlertsCount = classifiedEmployeeAlerts.alerts.filter(
        (alert) => alert.raisedAt >= dayStart && alert.raisedAt <= dayEnd,
      ).length;
      const dayAbnormalitiesCount =
        classifiedEmployeeAlerts.abnormalities.filter(
          (alert) => alert.raisedAt >= dayStart && alert.raisedAt <= dayEnd,
        ).length;
      tasksPerformedToday.push({
        date,
        label,
        value: tasksVal,
        completionRate: tasksVal,
        completed: completedInsts,
        total: totalInsts,
        allTasks: totalInsts,
        completedTasks: completedInsts,
        notCompletedTasks: totalInsts - completedInsts,
        overdueTasks: overdueDayTasks,
        alertsCount: dayAlertsCount,
        completedOnTimeRate,
        avgAcknowledgeTimeMin: 0,
        goodPracticeCompletionRate: categoryCompletionRates.GOOD_PRACTICE,
        jobResponsibilityCompletionRate:
          categoryCompletionRates.JOB_RESPONSIBILITY,
        assignedTaskCompletionRate: categoryCompletionRates.ASSIGNED_TASK,
        abnormalitiesCount: dayAbnormalitiesCount,
      });

      const activeAlerts = employeeTargetAlerts.filter(
        (a) =>
          a.raisedAt <= dayEnd &&
          (a.acknowledgedAt === null || a.acknowledgedAt >= dayStart),
      );
      pendingAlertAcknowledgments.push({
        date,
        label,
        value: activeAlerts.length,
      });

      const monthTasks = allTasks.filter(
        (t) =>
          t.createdAt >= dayStart &&
          t.createdAt <= dayEnd &&
          t.assignedById !== null &&
          t.acknowledgedAt !== null,
      );
      let ackVal = 0;
      if (monthTasks.length > 0) {
        const sum = monthTasks.reduce(
          (acc, curr) =>
            acc +
            Math.max(
              0,
              curr.acknowledgedAt!.getTime() - curr.createdAt.getTime(),
            ),
          0,
        );
        ackVal = Number((sum / monthTasks.length / (1000 * 60)).toFixed(1));
      }
      timeToAcknowledge.push({
        date,
        label,
        value: ackVal,
        avgAcknowledgeTimeMin: ackVal,
      });
      tasksPerformedToday[
        tasksPerformedToday.length - 1
      ].avgAcknowledgeTimeMin = ackVal;

      const monthCompletedInsts = allInstances.filter(
        (inst) =>
          inst.completedAt !== null &&
          inst.completedAt >= dayStart &&
          inst.completedAt <= dayEnd,
      );
      const monthCompletedTasks = allTasks.filter(
        (task) =>
          completedStatuses.has(task.status) &&
          task.updatedAt >= dayStart &&
          task.updatedAt <= dayEnd,
      );
      const closeDurations = [
        ...monthCompletedInsts.map((curr) => {
          const instStart = curr.task?.acknowledgedAt ?? curr.createdAt;
          return Math.max(0, curr.completedAt!.getTime() - instStart.getTime());
        }),
        ...monthCompletedTasks.map((task) => {
          const taskStart = task.acknowledgedAt ?? task.createdAt;
          return Math.max(0, task.updatedAt.getTime() - taskStart.getTime());
        }),
      ];
      let closeVal = 0;
      if (closeDurations.length > 0) {
        const sum = closeDurations.reduce((acc, duration) => acc + duration, 0);
        closeVal = Number(
          (sum / closeDurations.length / (1000 * 60)).toFixed(1),
        );
      }
      timeToClose.push({
        date,
        label,
        value: closeVal,
        avgCloseTimeMin: closeVal,
      });
    }

    return {
      tasksPerformedToday,
      pendingAlertAcknowledgments,
      timeToAcknowledge,
      timeToClose,
    };
  }
}
