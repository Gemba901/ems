import { NotFoundException } from '@nestjs/common';
import { AlertStatus, TaskStatus } from 'db';
import { endOfUtcDay, toIsoDate, toUtcDateOnly } from '../utils/taskSchedule';
import {
  completedStatuses,
  nonOverdueStatusValues,
  UserPayload,
} from './base.service';
import { DwmsAlertsService } from './alerts.service';

export abstract class DwmsDashboardService extends DwmsAlertsService {
  // Dashboard calculations
  async getOverviewStats(user: UserPayload, rawDays?: string) {
    await this.getEmployee(user.userId, user.organizationId);
    await this.checkAndRaiseDelayedTaskAlerts(user.organizationId);
    const days = this.normalizeDashboardDays(rawDays);

    const members = await this.prisma.employee.findMany({
      where: { organizationId: user.organizationId },
      include: { department: true },
    });
    const userIds = members.map((m) => m.id);

    const summary = await this.getPerformanceMetrics(
      userIds,
      user.organizationId,
      undefined,
      days,
    );
    const trends = await this.getTrendsForEntity(
      'overview',
      null,
      user.organizationId,
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
      summary,
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
    await this.getEmployee(user.userId, user.organizationId);
    await this.checkAndRaiseDelayedTaskAlerts(user.organizationId);
    const days = this.normalizeDashboardDays(rawDays);

    const members = await this.prisma.employee.findMany({
      where: { departmentId: deptId, organizationId: user.organizationId },
      select: { id: true },
    });
    const userIds = members.map((m) => m.id);

    const summary = await this.getPerformanceMetrics(
      userIds,
      user.organizationId,
      deptId,
      days,
    );
    const trends = await this.getTrendsForEntity(
      'department',
      deptId,
      user.organizationId,
      days,
    );
    const department = await this.prisma.department.findFirst({
      where: { id: deptId, organizationId: user.organizationId },
      select: { name: true },
    });
    const employeeScoreboard = await this.getEmployeeScoreboard(
      userIds,
      user.organizationId,
      days,
    );

    return {
      summary,
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
    await this.getEmployee(user.userId, user.organizationId);
    await this.checkAndRaiseDelayedTaskAlerts(user.organizationId);
    const days = this.normalizeDashboardDays(rawDays);

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

    const resolvedEmployeeId = employee.id;
    const summary = await this.getPerformanceMetrics(
      [resolvedEmployeeId],
      user.organizationId,
      undefined,
      days,
    );
    const trends = await this.getTrendsForEntity(
      'employee',
      resolvedEmployeeId,
      user.organizationId,
      days,
    );
    const reportees = await this.listReporteesRecursive(resolvedEmployeeId);
    const reporteeIds = reportees
      .filter((reportee) => reportee.organizationId === user.organizationId)
      .map((reportee) => reportee.id);
    const reporteesPerformance = await this.getEmployeeScoreboard(
      reporteeIds,
      user.organizationId,
      days,
    );

    return {
      summary,
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

  private async getPerformanceMetrics(
    userIds: string[],
    orgId: string,
    departmentId?: string,
    days = 7,
  ) {
    const now = new Date();
    const rangeEnd = endOfUtcDay(toUtcDateOnly(now));
    const rangeStart = toUtcDateOnly(now);
    rangeStart.setUTCDate(rangeStart.getUTCDate() - days + 1);

    const rangeInstances = await this.prisma.taskInstance.findMany({
      where: {
        ownerId: { in: userIds },
        scheduledFor: { gte: rangeStart, lte: rangeEnd },
      },
    });

    const rangeTasks = await this.prisma.task.findMany({
      where: {
        ownerId: { in: userIds },
        OR: [
          { dueDate: { gte: rangeStart, lte: rangeEnd } },
          { dueDate: null, createdAt: { gte: rangeStart, lte: rangeEnd } },
          {
            dueDate: { lt: rangeStart },
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
        acknowledgedAt: true,
      },
    });

    const instanceTaskIds = new Set(rangeInstances.map((inst) => inst.taskId));
    const taskOnlyRows = rangeTasks.filter(
      (task) => !instanceTaskIds.has(task.id),
    );
    const totalTasksCount = rangeInstances.length + taskOnlyRows.length;
    const completedInstancesCount = rangeInstances.filter(
      (inst) =>
        inst.status === TaskStatus.DONE ||
        inst.status === TaskStatus.NOT_APPLICABLE,
    ).length;
    const completedTaskOnlyCount = taskOnlyRows.filter((task) =>
      completedStatuses.has(task.status),
    ).length;

    const tasksPerformedTodayPercent =
      totalTasksCount > 0
        ? Math.round(
            ((completedInstancesCount + completedTaskOnlyCount) /
              totalTasksCount) *
              100,
          )
        : 100;
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

    // Number of open alerts
    const alertsWhere: any = {
      status: { not: AlertStatus.CLOSED },
      organizationId: orgId,
    };

    if (departmentId) {
      alertsWhere.departmentId = departmentId;
    } else {
      alertsWhere.OR = [
        { againstUserId: { in: userIds } },
        { taskInstance: { ownerId: { in: userIds } } },
      ];
    }

    const openAlertsCount = await this.prisma.alert.count({
      where: alertsWhere,
    });

    // Avg Acknowledge Time
    const acknowledgedTasks = await this.prisma.task.findMany({
      where: {
        ownerId: { in: userIds },
        acknowledgedAt: { not: null },
        createdAt: { gte: rangeStart, lte: rangeEnd },
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
        status: { in: [TaskStatus.DONE, TaskStatus.NOT_APPLICABLE] },
        completedAt: { not: null, gte: rangeStart, lte: rangeEnd },
      },
      include: {
        task: { select: { acknowledgedAt: true } },
      },
    });

    const completedTaskOnlyRows = taskOnlyRows.filter((task) =>
      completedStatuses.has(task.status),
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
      completedTasks: completedInstancesCount + completedTaskOnlyCount,
      overdueTasks,
      overdueCount: overdueTasks,
      completedCount: completedInstancesCount + completedTaskOnlyCount,
      tasksPerformedTodayPercent,
      openAlertsCount,
      avgAcknowledgeTimeMin,
      avgCloseTimeMin,
    };
  }

  private async getTrendsForEntity(
    entityType: 'employee' | 'department' | 'overview',
    entityId: string | null,
    orgId: string,
    daysCount: number,
  ) {
    const now = new Date();
    const rangeEnd = endOfUtcDay(toUtcDateOnly(now));
    const rangeStart = toUtcDateOnly(now);
    rangeStart.setUTCDate(rangeStart.getUTCDate() - daysCount + 1);

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
        scheduledFor: { gte: rangeStart, lte: rangeEnd },
      },
      include: {
        task: { select: { acknowledgedAt: true } },
      },
    });

    let alertsWhere: any = {
      organizationId: orgId,
      createdAt: { lte: rangeEnd },
      OR: [{ resolvedAt: null }, { resolvedAt: { gte: rangeStart } }],
    };

    if (entityType === 'employee') {
      alertsWhere.OR = [
        {
          againstUserId: entityId!,
          createdAt: { lte: rangeEnd },
          OR: [{ resolvedAt: null }, { resolvedAt: { gte: rangeStart } }],
        },
        {
          taskInstance: { ownerId: entityId! },
          createdAt: { lte: rangeEnd },
          OR: [{ resolvedAt: null }, { resolvedAt: { gte: rangeStart } }],
        },
      ];
    } else if (entityType === 'department') {
      alertsWhere.departmentId = entityId!;
    }

    const allAlerts = await this.prisma.alert.findMany({
      where: alertsWhere,
      select: {
        createdAt: true,
        resolvedAt: true,
      },
    });

    const allTasks = await this.prisma.task.findMany({
      where: {
        ownerId: { in: userIds },
        OR: [
          { createdAt: { gte: rangeStart, lte: rangeEnd } },
          { dueDate: { gte: rangeStart, lte: rangeEnd } },
          {
            dueDate: { lt: rangeStart },
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
        acknowledgedAt: true,
      },
    });

    const tasksPerformedToday: Array<{
      date: string;
      label: string;
      value: number;
      completionRate: number;
      completed: number;
      total: number;
    }> = [];
    const openAlerts: Array<{ date: string; label: string; value: number }> =
      [];
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

    for (let i = daysCount - 1; i >= 0; i--) {
      const start = toUtcDateOnly(now);
      start.setUTCDate(start.getUTCDate() - i);
      const end = endOfUtcDay(start);
      const label = start.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
      });
      const date = toIsoDate(start);

      const dayInsts = allInstances.filter(
        (inst) => inst.scheduledFor >= start && inst.scheduledFor <= end,
      );
      const dayInstanceTaskIds = new Set(dayInsts.map((inst) => inst.taskId));
      const dayTasks = allTasks.filter((task) => {
        if (dayInstanceTaskIds.has(task.id)) return false;
        if (task.dueDate) {
          return (
            task.dueDate <= end &&
            (task.dueDate >= start || !completedStatuses.has(task.status))
          );
        }
        return task.createdAt >= start && task.createdAt <= end;
      });
      const totalInsts = dayInsts.length + dayTasks.length;
      const completedInsts =
        dayInsts.filter(
          (inst) =>
            inst.status === TaskStatus.DONE ||
            inst.status === TaskStatus.NOT_APPLICABLE,
        ).length +
        dayTasks.filter((task) => completedStatuses.has(task.status)).length;
      const tasksVal =
        totalInsts > 0 ? Math.round((completedInsts / totalInsts) * 100) : 100;
      tasksPerformedToday.push({
        date,
        label,
        value: tasksVal,
        completionRate: tasksVal,
        completed: completedInsts,
        total: totalInsts,
      });

      const activeAlerts = allAlerts.filter(
        (a) =>
          a.createdAt <= end &&
          (a.resolvedAt === null || a.resolvedAt >= start),
      );
      openAlerts.push({ date, label, value: activeAlerts.length });

      const monthTasks = allTasks.filter(
        (t) =>
          t.createdAt >= start &&
          t.createdAt <= end &&
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

      const monthCompletedInsts = allInstances.filter(
        (inst) =>
          inst.completedAt !== null &&
          inst.completedAt >= start &&
          inst.completedAt <= end,
      );
      const monthCompletedTasks = allTasks.filter(
        (task) =>
          completedStatuses.has(task.status) &&
          task.updatedAt >= start &&
          task.updatedAt <= end,
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
      openAlerts,
      timeToAcknowledge,
      timeToClose,
    };
  }
}
