import { NotFoundException } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
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

type EmployeeDashboardView = 'personal' | 'team' | 'both';

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
    const currentEmployee = await this.getEmployee(
      user.userId,
      user.organizationId,
    );
    const access = await this.getDwmsAccessCapabilities(user, currentEmployee);
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

    const metricRows = await this.loadPerformanceMetricRows(
      userIds,
      user.organizationId,
      timeZone,
      undefined,
      days,
      true,
    );
    const summary = this.calculatePerformanceMetrics(metricRows);
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

    const departmentCompliance = departments.map((department) => {
      const departmentMembers = members.filter(
        (member) => member.departmentId === department.id,
      );
      const metrics = this.calculatePerformanceMetrics(
        this.filterPerformanceMetricRows(
          metricRows,
          departmentMembers.map((member) => member.id),
        ),
      );

      return {
        id: department.id,
        name: department.name,
        ...metrics,
      };
    });

    const employeeScoreboard = await this.getEmployeeScoreboard(
      userIds,
      user.organizationId,
      timeZone,
      days,
      metricRows,
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
    const access = await this.getDwmsAccessCapabilities(user, currentEmployee);
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

    const metricRows = await this.loadPerformanceMetricRows(
      userIds,
      user.organizationId,
      timeZone,
      deptId,
      days,
    );
    const summary = this.calculatePerformanceMetrics(metricRows);
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
      metricRows,
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
    rawView?: string,
  ) {
    const view = this.resolveEmployeeDashboardView(rawView);
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
      const isHodDepartmentMember =
        this.getDwmsRole(user.roleLevel) === 'HOD' &&
        !!currentEmployee.departmentId &&
        employee.departmentId === currentEmployee.departmentId;
      const isInReportingLine =
        hasEmployeePerformanceRole || isHodDepartmentMember
          ? false
          : await this.isSuperior(
              currentEmployee.id,
              employee.id,
              user.organizationId,
            );
      if (
        !hasEmployeePerformanceRole &&
        !isHodDepartmentMember &&
        !isInReportingLine
      ) {
        throw new ForbiddenException(
          'You can only view performance for employees in your reporting line',
        );
      }
    }

    const includePersonal = view === 'personal' || view === 'both';
    const includeTeam = view === 'team' || view === 'both';
    const resolvedEmployeeId = employee.id;
    const personalPromise = includePersonal
      ? Promise.all([
          this.getPerformanceMetrics(
            [resolvedEmployeeId],
            user.organizationId,
            timeZone,
            undefined,
            days,
          ),
          this.getTaskCategoryStatusBreakdown(
            [resolvedEmployeeId],
            timeZone,
            days,
          ),
          this.getTrendsForEntity(
            'employee',
            resolvedEmployeeId,
            user.organizationId,
            timeZone,
            days,
          ),
        ])
      : Promise.resolve(null);
    const teamPromise = includeTeam
      ? this.getEmployeeTeamStats(
          user,
          currentEmployee,
          resolvedEmployeeId,
          timeZone,
          days,
        )
      : Promise.resolve(null);
    const [personal, team] = await Promise.all([personalPromise, teamPromise]);

    return {
      ...(personal
        ? {
            summary: {
              ...personal[0],
              taskCategoryBreakdown: personal[1],
            },
            trends: personal[2],
          }
        : {}),
      ...(team
        ? {
            teamSummary: team.summary,
            teamTrends: team.trends,
            reporteesPerformance: team.reporteesPerformance,
          }
        : {}),
      employee: {
        id: employee.id,
        name: `${employee.firstName} ${employee.lastName}`.trim(),
        email: employee.email,
        role: employee.jobTitle ?? 'Employee',
        departmentName: employee.department?.name ?? 'Unassigned',
      },
    };
  }

  private resolveEmployeeDashboardView(
    rawView?: string,
  ): EmployeeDashboardView {
    const view = rawView?.trim().toLowerCase() || 'both';
    if (view === 'personal' || view === 'team' || view === 'both') return view;
    throw new BadRequestException(
      'Dashboard view must be personal, team, or both',
    );
  }

  private async getEmployeeTeamStats(
    user: UserPayload,
    currentEmployee: { id: string; departmentId?: string | null },
    resolvedEmployeeId: string,
    timeZone: string,
    days: number,
  ) {
    const reporteeIds =
      resolvedEmployeeId === currentEmployee.id
        ? await this.listTeamEmployeeIds(
            currentEmployee,
            user.organizationId,
            user.roleLevel,
          )
        : await this.listReporteeIdsRecursive(
            resolvedEmployeeId,
            user.organizationId,
          );

    if (reporteeIds.length === 0) {
      return {
        summary: null,
        trends: null,
        reporteesPerformance: [],
      };
    }

    const [metricRows, taskCategoryBreakdown, trends] = await Promise.all([
      this.loadPerformanceMetricRows(
        reporteeIds,
        user.organizationId,
        timeZone,
        undefined,
        days,
      ),
      this.getTaskCategoryStatusBreakdown(reporteeIds, timeZone, days),
      this.getTrendsForEntity(
        'team',
        null,
        user.organizationId,
        timeZone,
        days,
        reporteeIds,
      ),
    ]);
    const summary = this.calculatePerformanceMetrics(metricRows);
    const reporteesPerformance = await this.getEmployeeScoreboard(
      reporteeIds,
      user.organizationId,
      timeZone,
      days,
      metricRows,
    );

    return {
      summary: { ...summary, taskCategoryBreakdown },
      trends,
      reporteesPerformance,
    };
  }

  private async getEmployeeScoreboard(
    userIds: string[],
    orgId: string,
    timeZone: string,
    days = 7,
    prefetchedMetricRows?: Awaited<
      ReturnType<DwmsDashboardService['loadPerformanceMetricRows']>
    >,
  ) {
    const [employees, metricRows] = await Promise.all([
      this.prisma.employee.findMany({
        where: { id: { in: userIds }, organizationId: orgId },
        include: { department: true },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      }),
      prefetchedMetricRows
        ? Promise.resolve(prefetchedMetricRows)
        : this.loadPerformanceMetricRows(
            userIds,
            orgId,
            timeZone,
            undefined,
            days,
          ),
    ]);

    const groupByEmployee = <T>(
      values: T[],
      getEmployeeId: (value: T) => string | null,
    ) => {
      const groups = new Map<string, T[]>();
      values.forEach((value) => {
        const employeeId = getEmployeeId(value);
        if (!employeeId) return;
        const group = groups.get(employeeId);
        if (group) group.push(value);
        else groups.set(employeeId, [value]);
      });
      return groups;
    };
    const rangeInstancesByEmployee = groupByEmployee(
      metricRows.rangeInstances,
      (row) => row.ownerId,
    );
    const rangeTasksByEmployee = groupByEmployee(
      metricRows.rangeTasks,
      (row) => row.ownerId,
    );
    const completedAssignedByEmployee = groupByEmployee(
      metricRows.completedAssignedInstances,
      (row) => row.ownerId,
    );
    const alertsByEmployee = groupByEmployee(
      metricRows.alertOccurrences,
      (row) => row.alert.againstUserId,
    );
    const acknowledgedTasksByEmployee = groupByEmployee(
      metricRows.acknowledgedTasks,
      (row) => row.ownerId,
    );
    const completedInstancesByEmployee = groupByEmployee(
      metricRows.completedInstances,
      (row) => row.ownerId,
    );

    const rows = employees.map((employee) => {
      const metrics = this.calculatePerformanceMetrics({
        ...metricRows,
        rangeInstances: rangeInstancesByEmployee.get(employee.id) ?? [],
        rangeTasks: rangeTasksByEmployee.get(employee.id) ?? [],
        completedAssignedInstances:
          completedAssignedByEmployee.get(employee.id) ?? [],
        alertOccurrences: alertsByEmployee.get(employee.id) ?? [],
        acknowledgedTasks: acknowledgedTasksByEmployee.get(employee.id) ?? [],
        completedInstances: completedInstancesByEmployee.get(employee.id) ?? [],
      });

      return {
        id: employee.id,
        name: `${employee.firstName} ${employee.lastName}`.trim(),
        email: employee.email,
        role: employee.jobTitle ?? 'Employee',
        departmentName: employee.department?.name ?? 'Unassigned',
        department: employee.department?.name ?? 'Unassigned',
        ...metrics,
      };
    });

    return rows.sort(
      (a, b) => b.tasksPerformedTodayPercent - a.tasksPerformedTodayPercent,
    );
  }

  private filterPerformanceMetricRows(
    rows: Awaited<
      ReturnType<DwmsDashboardService['loadPerformanceMetricRows']>
    >,
    employeeIds: string[],
  ) {
    const employeeIdSet = new Set(employeeIds);
    return {
      ...rows,
      rangeInstances: rows.rangeInstances.filter((row) =>
        employeeIdSet.has(row.ownerId),
      ),
      rangeTasks: rows.rangeTasks.filter((row) =>
        employeeIdSet.has(row.ownerId),
      ),
      completedAssignedInstances: rows.completedAssignedInstances.filter(
        (row) => employeeIdSet.has(row.ownerId),
      ),
      alertOccurrences: rows.alertOccurrences.filter(
        (row) =>
          row.alert.againstUserId !== null &&
          employeeIdSet.has(row.alert.againstUserId),
      ),
      acknowledgedTasks: rows.acknowledgedTasks.filter((row) =>
        employeeIdSet.has(row.ownerId),
      ),
      completedInstances: rows.completedInstances.filter((row) =>
        employeeIdSet.has(row.ownerId),
      ),
    };
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
  >(occurrences: T[], priorCounts = new Map<string, number>()) {
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
          const sequence = (priorCounts.get(occurrence.alertId) ?? 0) + index;
          if (sequence < 2) alerts.push(occurrence);
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
    const rows = await this.loadPerformanceMetricRows(
      userIds,
      orgId,
      timeZone,
      departmentId,
      days,
      organizationWide,
    );
    return this.calculatePerformanceMetrics(rows);
  }

  private async loadPerformanceMetricRows(
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
    const alertScopeWhere = this.getAlertPerformanceScope(
      orgId,
      userIds,
      departmentId,
      organizationWide,
    );

    const [
      rangeInstances,
      rangeTasks,
      completedAssignedInstances,
      priorAlertOccurrenceCounts,
      alertOccurrences,
      acknowledgedTasks,
      completedInstances,
    ] = await Promise.all([
      this.prisma.taskInstance.findMany({
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
      }),
      this.prisma.task.findMany({
        where: {
          ownerId: { in: userIds },
          OR: [
            { dueDate: { gte: scheduleStart, lte: scheduleEnd } },
            {
              dueDate: null,
              createdAt: { gte: instantStart, lte: instantEnd },
            },
            {
              dueDate: { lt: scheduleStart },
              status: { notIn: nonOverdueStatusValues },
            },
          ],
        },
        select: {
          id: true,
          ownerId: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          dueDate: true,
          assignedById: true,
          acknowledgedAt: true,
        },
      }),
      this.prisma.taskInstance.findMany({
        where: {
          ownerId: { in: userIds },
          scheduledFor: { gte: scheduleStart, lte: scheduleEnd },
          status: TaskStatus.DONE,
          completedAt: { not: null },
        },
        select: { ownerId: true, completedAt: true, dueAt: true },
      }),
      this.prisma.alertOccurrence.groupBy({
        by: ['alertId'],
        where: {
          raisedAt: { lt: instantStart },
          alert: alertScopeWhere,
        },
        _count: { _all: true },
      }),
      this.prisma.alertOccurrence.findMany({
        where: {
          raisedAt: { gte: instantStart, lte: instantEnd },
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
      }),
      this.prisma.task.findMany({
        where: {
          ownerId: { in: userIds },
          assignedById: { not: null },
          acknowledgedAt: { not: null },
          createdAt: { gte: instantStart, lte: instantEnd },
        },
        select: {
          ownerId: true,
          createdAt: true,
          acknowledgedAt: true,
        },
      }),
      this.prisma.taskInstance.findMany({
        where: {
          ownerId: { in: userIds },
          task: { assignedById: { not: null } },
          status: { in: [TaskStatus.DONE, TaskStatus.NOT_APPLICABLE] },
          completedAt: { not: null, gte: instantStart, lte: instantEnd },
        },
        include: {
          task: { select: { acknowledgedAt: true } },
        },
      }),
    ]);

    return {
      now,
      instantStart,
      instantEnd,
      rangeInstances,
      rangeTasks,
      completedAssignedInstances,
      priorAlertOccurrenceCounts: new Map(
        priorAlertOccurrenceCounts.map((row) => [row.alertId, row._count._all]),
      ),
      alertOccurrences,
      acknowledgedTasks,
      completedInstances,
    };
  }

  private calculatePerformanceMetrics(
    rows: Awaited<
      ReturnType<DwmsDashboardService['loadPerformanceMetricRows']>
    >,
  ) {
    const {
      now,
      instantStart,
      instantEnd,
      rangeInstances,
      rangeTasks,
      completedAssignedInstances,
      priorAlertOccurrenceCounts,
      alertOccurrences,
      acknowledgedTasks,
      completedInstances,
    } = rows;

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
    // Existing alert KPIs remain person/task based. Direct department and
    // organization targets are reported separately below.
    const employeeTargetOccurrences =
      this.employeeTargetOccurrences(alertOccurrences);
    const classifiedEmployeeOccurrences = this.splitAlertOccurrencesBySequence(
      employeeTargetOccurrences,
      priorAlertOccurrenceCounts,
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
    entityType: 'employee' | 'department' | 'overview' | 'team',
    entityId: string | null,
    orgId: string,
    timeZone: string,
    daysCount: number,
    scopedUserIds?: string[],
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

    let userIds: string[] = scopedUserIds ?? [];
    if (scopedUserIds) {
      userIds = scopedUserIds;
    } else if (entityType === 'employee') {
      userIds = [entityId!];
    } else if (entityType === 'department') {
      const members = await this.prisma.employee.findMany({
        where: { departmentId: entityId!, organizationId: orgId },
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

    const [priorAlertOccurrenceCounts, allAlerts] = await Promise.all([
      this.prisma.alertOccurrence.groupBy({
        by: ['alertId'],
        where: {
          alert: alertWhere,
          raisedAt: { lt: instantStart },
        },
        _count: { _all: true },
      }),
      this.prisma.alertOccurrence.findMany({
        where: {
          ...alertsWhere,
          OR: [
            { raisedAt: { gte: instantStart } },
            {
              raisedAt: { lt: instantStart },
              OR: [
                { acknowledgedAt: null },
                { acknowledgedAt: { gte: instantStart } },
              ],
            },
          ],
        },
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
      }),
    ]);
    const employeeTargetAlerts = this.employeeTargetOccurrences(allAlerts);
    const rangeEmployeeTargetAlerts = employeeTargetAlerts.filter(
      (alert) => alert.raisedAt >= instantStart,
    );
    const classifiedEmployeeAlerts = this.splitAlertOccurrencesBySequence(
      rangeEmployeeTargetAlerts,
      new Map(
        priorAlertOccurrenceCounts.map((row) => [row.alertId, row._count._all]),
      ),
    );

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

    const appendByKey = <T>(map: Map<string, T[]>, key: string, row: T) => {
      const existing = map.get(key);
      if (existing) existing.push(row);
      else map.set(key, [row]);
    };
    const organizationDateKey = (value: Date) =>
      toIsoDate(getUtcDateInTimeZone(value, timeZone));
    const instancesBySchedule = new Map<
      number,
      (typeof allInstances)[number][]
    >();
    allInstances.forEach((instance) => {
      const key = instance.scheduledFor.getTime();
      const existing = instancesBySchedule.get(key);
      if (existing) existing.push(instance);
      else instancesBySchedule.set(key, [instance]);
    });
    const alertsByDate = new Map<
      string,
      (typeof classifiedEmployeeAlerts.alerts)[number][]
    >();
    classifiedEmployeeAlerts.alerts.forEach((alert) =>
      appendByKey(alertsByDate, organizationDateKey(alert.raisedAt), alert),
    );
    const abnormalitiesByDate = new Map<
      string,
      (typeof classifiedEmployeeAlerts.abnormalities)[number][]
    >();
    classifiedEmployeeAlerts.abnormalities.forEach((alert) =>
      appendByKey(
        abnormalitiesByDate,
        organizationDateKey(alert.raisedAt),
        alert,
      ),
    );
    const acknowledgedTasksByDate = new Map<
      string,
      (typeof allTasks)[number][]
    >();
    const completedTasksByDate = new Map<string, (typeof allTasks)[number][]>();
    allTasks.forEach((task) => {
      if (task.assignedById !== null && task.acknowledgedAt !== null) {
        appendByKey(
          acknowledgedTasksByDate,
          organizationDateKey(task.createdAt),
          task,
        );
      }
      if (completedStatuses.has(task.status)) {
        appendByKey(
          completedTasksByDate,
          organizationDateKey(task.updatedAt),
          task,
        );
      }
    });
    const completedInstancesByDate = new Map<
      string,
      (typeof allInstances)[number][]
    >();
    allInstances.forEach((instance) => {
      if (instance.completedAt) {
        appendByKey(
          completedInstancesByDate,
          organizationDateKey(instance.completedAt),
          instance,
        );
      }
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

      const dayInsts = instancesBySchedule.get(scheduleDay.getTime()) ?? [];
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
      const dayAlertsCount = alertsByDate.get(date)?.length ?? 0;
      const dayAbnormalitiesCount = abnormalitiesByDate.get(date)?.length ?? 0;
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

      const monthTasks = acknowledgedTasksByDate.get(date) ?? [];
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

      const monthCompletedInsts = completedInstancesByDate.get(date) ?? [];
      const monthCompletedTasks = completedTasksByDate.get(date) ?? [];
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
