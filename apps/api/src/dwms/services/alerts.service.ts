import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  AlertClosureApprovalStatus,
  AlertStatus,
  AlertType,
  NotificationType,
  Severity,
  TaskStatus,
} from 'db';
import type { Prisma } from 'db';
import { CreateAlertCommentDto, CreateAlertDto } from '../dto/dwms.dto';
import { UserPayload } from './base.service';
import { DwmsDirectoryService } from './directory.service';

export abstract class DwmsAlertsService extends DwmsDirectoryService {
  private serializeAlertComment(comment: any) {
    return {
      id: comment.id,
      comment: comment.comment,
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString(),
      author: comment.author
        ? {
            id: comment.author.id,
            name: `${comment.author.firstName} ${comment.author.lastName}`.trim(),
            email: comment.author.email,
          }
        : null,
    };
  }

  private serializeRelatedAlert(alert: any) {
    if (!alert) return null;
    return {
      id: alert.id,
      title: alert.title,
      description: alert.description,
      severity: alert.severity,
      status: alert.status,
      isAbnormality: alert.isAbnormality,
      abnormalitySourceAlertId: alert.abnormalitySourceAlertId,
      createdAt: alert.createdAt.toISOString(),
      resolvedAt: alert.resolvedAt ? alert.resolvedAt.toISOString() : null,
    };
  }

  private async getVisibleAlertForUser(user: UserPayload, alertId: string) {
    const { where } = await this.getAlertVisibility(user);
    const alert = await this.prisma.alert.findFirst({
      where: { AND: [where, { id: alertId }] },
      include: this.getAlertIncludeOptions(),
    });

    if (!alert) {
      throw new NotFoundException('Alert not found');
    }

    return this.serializeAlertListItem(alert);
  }

  private getAlertIncludeOptions() {
    return {
      raisedBy: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
      againstUser: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
      department: { select: { id: true, name: true } },
      taskInstance: {
        select: {
          id: true,
          task: { select: { title: true } },
          owner: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              reportingManagerId: true,
            },
          },
        },
      },
    };
  }

  private serializeAlertListItem(alert: any) {
    return {
      ...alert,
      raisedBy: alert.raisedBy
        ? {
            id: alert.raisedBy.id,
            name: `${alert.raisedBy.firstName} ${alert.raisedBy.lastName}`,
            email: alert.raisedBy.email,
          }
        : null,
      againstUser: alert.againstUser
        ? {
            id: alert.againstUser.id,
            name: `${alert.againstUser.firstName} ${alert.againstUser.lastName}`,
            email: alert.againstUser.email,
          }
        : null,
      taskInstance: alert.taskInstance
        ? {
            id: alert.taskInstance.id,
            task: alert.taskInstance.task,
            owner: alert.taskInstance.owner
              ? {
                  id: alert.taskInstance.owner.id,
                  name: `${alert.taskInstance.owner.firstName} ${alert.taskInstance.owner.lastName}`.trim(),
                  email: alert.taskInstance.owner.email,
                  reportingToId: alert.taskInstance.owner.reportingManagerId,
                }
              : null,
          }
        : null,
    };
  }

  async createAlert(user: UserPayload, dto: CreateAlertDto) {
    const employee = await this.getEmployee(user.userId, user.organizationId);
    const role = this.getDwmsRole(user.roleLevel);

    if (dto.severity === Severity.LOW) {
      throw new BadRequestException('DWMS alerts cannot have low severity');
    }

    const targetType = dto.targetType ?? 'GENERAL';
    const suppliedTargets = [
      dto.taskInstanceId && 'TASK',
      dto.againstUserId && 'PERSON',
      dto.departmentId && 'DEPARTMENT',
    ].filter(Boolean);
    if (
      !['GENERAL', 'TASK', 'PERSON', 'DEPARTMENT'].includes(targetType) ||
      suppliedTargets.some((target) => target !== targetType)
    ) {
      throw new BadRequestException('Alert target fields must match targetType');
    }

    // Validate the supplied target relation within the organization.
    if (dto.departmentId && !await this.prisma.department.findFirst({ where: { id: dto.departmentId, organizationId: user.organizationId }, select: { id: true } })) {
      throw new NotFoundException('Department not found');
    }
    if (dto.againstUserId) await this.validateDwmsEmployee(dto.againstUserId, user.organizationId, 'Employee not found in this organization');
    if (dto.taskInstanceId && !await this.prisma.taskInstance.findFirst({ where: { id: dto.taskInstanceId, owner: { organizationId: user.organizationId } }, select: { id: true } })) {
      throw new NotFoundException('Task instance not found');
    }
    if (targetType === 'GENERAL') {
      if (role !== 'HOD' && role !== 'MANAGEMENT') {
        throw new ForbiddenException(
          'Organisation level alerts can only be raised by HODs or Management',
        );
      }
    } else if (targetType === 'DEPARTMENT') {
      if (!dto.departmentId) {
        throw new BadRequestException(
          'departmentId is required when targetType is DEPARTMENT',
        );
      }
      const isHodOrMgmt = role === 'HOD' || role === 'MANAGEMENT';
      if (!isHodOrMgmt) {
        if (!employee.departmentId) {
          throw new ForbiddenException(
            'You are not assigned to any department',
          );
        }
        if (dto.departmentId !== employee.departmentId) {
          throw new ForbiddenException(
            'You can only raise alerts in your own department',
          );
        }
      }
    } else if (targetType === 'PERSON') {
      if (!dto.againstUserId) {
        throw new BadRequestException(
          'againstUserId is required when targetType is PERSON',
        );
      }
      if (employee.id === dto.againstUserId) {
        throw new BadRequestException(
          'You cannot raise an alert against yourself',
        );
      }
      const assignableUsers = await this.listReportees(user);
      const canRaiseAgainstPerson = (assignableUsers.users ?? []).some(
        (candidate) => candidate.id === dto.againstUserId,
      );
      if (!canRaiseAgainstPerson) {
        throw new ForbiddenException(
          'You can only raise alerts against users available for task assignment',
        );
      }
    } else if (targetType === 'TASK') {
      if (!dto.taskInstanceId) {
        throw new BadRequestException(
          'taskInstanceId is required when targetType is TASK',
        );
      }
      const instance = await this.prisma.taskInstance.findUnique({
        where: { id: dto.taskInstanceId, owner: { organizationId: user.organizationId } },
        select: { ownerId: true },
      });
      if (!instance) {
        throw new NotFoundException('Task instance not found');
      }
      if (instance.ownerId === employee.id) {
        throw new ForbiddenException(
          'You cannot raise an alert against your own tasks',
        );
      }
      const isMgmt = role === 'MANAGEMENT';
      const isUserSuperior = await this.isSuperior(
        employee.id,
        instance.ownerId,
        user.organizationId,
      );
      if (!isUserSuperior && !isMgmt) {
        throw new ForbiddenException(
          'You can only raise alerts against tasks assigned to users who report to you',
        );
      }
    }

    const alert = await this.prisma.alert.create({
      data: {
        type: AlertType.ABNORMAL_SITUATION,
        title: dto.title,
        description: dto.description,
        raisedById: employee.id,
        organizationId: user.organizationId,
        severity: dto.severity,
        taskInstanceId: dto.taskInstanceId ?? null,
        departmentId: dto.departmentId ?? null,
        againstUserId: dto.againstUserId ?? null,
        status: AlertStatus.OPEN,
      },
    });

    // Alert notification escalation
    let notifyTargetId: string | null = null;
    if (dto.againstUserId) {
      notifyTargetId = dto.againstUserId;
    } else if (dto.taskInstanceId) {
      const inst = await this.prisma.taskInstance.findUnique({
        where: { id: dto.taskInstanceId, owner: { organizationId: user.organizationId } },
        select: { ownerId: true },
      });
      notifyTargetId = inst?.ownerId ?? null;
    }

    if (notifyTargetId) {
      await this.notifications.create({
        employeeId: notifyTargetId,
        type: NotificationType.ALERT,
        module: 'DWMS',
        title: 'Alert Raised Against You',
        message: `An alert was raised: "${dto.title}".`,
        actionUrl: `/dwms/alerts/${alert.id}`,
      });
    }

    return { message: 'Alert created successfully', alert };
  }

  async getAlertTargets(user: UserPayload) {
    const employee = await this.getEmployee(user.userId, user.organizationId);
    const role = this.getDwmsRole(user.roleLevel);
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const assignableUsers = await this.listReportees(user);

    let departments: any[] = [];
    if (role === 'MANAGEMENT') {
      departments = await this.prisma.department.findMany({
        where: { organizationId: user.organizationId },
        select: { id: true, name: true },
      });
    } else if (employee.departmentId) {
      const dept = await this.prisma.department.findUnique({
        where: { id: employee.departmentId },
        select: { id: true, name: true },
      });
      departments = dept ? [dept] : [];
    }

    const reporteesForTasks = await this.listReporteesRecursive(employee.id);

    return {
      users: (assignableUsers.users ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        role: r.designation ?? 'Employee',
      })),
      departments,
      tasks: await this.getRecentCompletedReporteeTasks(
        employee.id,
        reporteesForTasks.map((r) => r.id),
        user.organizationId,
        sevenDaysAgo,
      ),
    };
  }

  private async getRecentCompletedReporteeTasks(
    managerId: string,
    reporteeIds: string[],
    organizationId: string,
    completedSince: Date,
  ) {
    const instances = await this.prisma.taskInstance.findMany({
      where: {
        owner: { organizationId },
        ownerId: { in: reporteeIds },
        status: { in: [TaskStatus.DONE, TaskStatus.NOT_APPLICABLE] },
        OR: [
          { completedAt: { gte: completedSince } },
          { updatedAt: { gte: completedSince } },
        ],
      },
      include: {
        owner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            jobTitle: true,
          },
        },
        task: { select: { id: true, title: true } },
      },
      orderBy: [{ completedAt: 'desc' }, { updatedAt: 'desc' }],
    });

    return instances.map((instance) => ({
      instanceId: instance.id,
      title: instance.task.title,
      ownerName:
        `${instance.owner.firstName} ${instance.owner.lastName}`.trim(),
      ownerEmail: instance.owner.email,
      status: instance.status,
      dueAt: instance.dueAt.toISOString(),
      frequency: instance.frequency,
      completedAt: instance.completedAt?.toISOString() ?? null,
    }));
  }

  private async getAlertVisibility(user: UserPayload) {
    const [employee, config] = await Promise.all([
      this.getEmployee(user.userId, user.organizationId),
      this.prisma.dwmsPermissionConfig.findUnique({
        where: { organizationId: user.organizationId },
        select: { alertViewLevel: true },
      }),
    ]);
    const role = this.getDwmsRole(user.roleLevel);
    const configLevel = config?.alertViewLevel ?? 'OWN';

    let effectiveViewLevel: 'OWN' | 'DEPARTMENT' | 'ORGANIZATION' = 'OWN';
    if (role === 'MANAGEMENT') {
      effectiveViewLevel = 'ORGANIZATION';
    } else if (role === 'HOD') {
      effectiveViewLevel =
        configLevel === 'ORGANIZATION' ? 'ORGANIZATION' : 'DEPARTMENT';
    } else {
      effectiveViewLevel = configLevel as 'OWN' | 'DEPARTMENT' | 'ORGANIZATION';
    }

    if (effectiveViewLevel === 'ORGANIZATION') {
      return {
        employee,
        where: { organizationId: user.organizationId },
      };
    }

    if (effectiveViewLevel === 'DEPARTMENT') {
      const reporteeIds = (await this.listReporteesRecursive(employee.id)).map(
        (r) => r.id,
      );

      return {
        employee,
        where: {
          organizationId: user.organizationId,
          OR: [
            { raisedById: employee.id },
            { recipientEmployeeIds: { has: employee.id } },
            { againstUserId: employee.id },
            { taskInstance: { ownerId: employee.id } },
            employee.departmentId
              ? { departmentId: employee.departmentId }
              : undefined,
            { againstUserId: { in: reporteeIds } },
            { taskInstance: { ownerId: { in: reporteeIds } } },
          ].filter(
            (cond): cond is Exclude<typeof cond, undefined> =>
              cond !== undefined,
          ),
        },
      };
    }

    return {
      employee,
      where: {
        organizationId: user.organizationId,
        OR: [
          { raisedById: employee.id },
          { recipientEmployeeIds: { has: employee.id } },
          { againstUserId: employee.id },
          { taskInstance: { ownerId: employee.id } },
        ],
      },
    };
  }

  async getAlerts(
    user: UserPayload,
    rawTab?: string,
    rawPage?: string,
    rawLimit?: string,
    rawStatus?: string,
    rawSeverity?: string,
    rawSearch?: string,
  ) {
    const { employee, where: visibilityWhere } =
      await this.getAlertVisibility(user);
    const allowedTabs = new Set([
      'ALL',
      'MY_ALERTS',
      'ABNORMALITIES',
      'DEPARTMENTAL',
      'ORGANISATIONAL',
      'OPENED_BY_ME',
    ]);
    const tab = rawTab?.trim().toUpperCase() || 'ALL';
    if (!allowedTabs.has(tab)) {
      throw new BadRequestException('Invalid alert tab');
    }

    const pageValue = Number(rawPage ?? 1);
    const limitValue = Number(rawLimit ?? 20);
    const page = Number.isFinite(pageValue)
      ? Math.max(1, Math.trunc(pageValue))
      : 1;
    const limit = Number.isFinite(limitValue)
      ? Math.min(100, Math.max(1, Math.trunc(limitValue)))
      : 20;

    const status = rawStatus?.trim().toUpperCase();
    if (
      status &&
      status !== 'ALL' &&
      !Object.values(AlertStatus).includes(status as AlertStatus)
    ) {
      throw new BadRequestException('Invalid alert status');
    }
    const severity = rawSeverity?.trim().toUpperCase();
    if (
      severity &&
      severity !== 'ALL' &&
      !Object.values(Severity).includes(severity as Severity)
    ) {
      throw new BadRequestException('Invalid alert severity');
    }
    const search = rawSearch?.trim().slice(0, 100) ?? '';

    const tabWhere: Prisma.AlertWhereInput =
      tab === 'MY_ALERTS'
        ? {
            isAbnormality: false,
            OR: [
              { againstUserId: employee.id },
              { taskInstance: { ownerId: employee.id } },
            ],
          }
        : tab === 'ABNORMALITIES'
          ? { isAbnormality: true }
          : tab === 'DEPARTMENTAL'
            ? { isAbnormality: false, departmentId: { not: null } }
            : tab === 'ORGANISATIONAL'
              ? {
                  isAbnormality: false,
                  departmentId: null,
                  againstUserId: null,
                  taskInstanceId: null,
                }
              : tab === 'OPENED_BY_ME'
                ? { isAbnormality: false, raisedById: employee.id }
                : {};

    const filters: Prisma.AlertWhereInput[] = [visibilityWhere, tabWhere];

    if (status && status !== 'ALL') {
      filters.push({ status: status as AlertStatus });
    }
    if (severity && severity !== 'ALL') {
      filters.push(
        severity === Severity.MEDIUM
          ? { severity: { in: [Severity.MEDIUM, Severity.LOW] } }
          : { severity: severity as Severity },
      );
    }
    if (search) {
      filters.push({
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          {
            raisedBy: {
              OR: [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
              ],
            },
          },
          {
            againstUser: {
              OR: [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
              ],
            },
          },
          {
            department: {
              name: { contains: search, mode: 'insensitive' },
            },
          },
        ],
      });
    }
    const where: Prisma.AlertWhereInput = { AND: filters };

    const [alerts, total] = await Promise.all([
      this.prisma.alert.findMany({
        where,
        include: this.getAlertIncludeOptions(),
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.alert.count({ where }),
    ]);

    return {
      count: total,
      alerts: alerts.map((alert) => this.serializeAlertListItem(alert)),
      employeeId: employee.id,
      pagination: {
        page,
        limit,
        total,
        pages: total > 0 ? Math.ceil(total / limit) : 0,
      },
    };
  }

  async getMyResponsibleAlertCount(user: UserPayload) {
    const employee = await this.getEmployee(user.userId, user.organizationId);

    const count = await this.prisma.alert.count({
      where: {
        organizationId: user.organizationId,
        status: { in: [AlertStatus.OPEN, AlertStatus.IN_PROGRESS] },
        OR: [
          { againstUserId: employee.id },
          { taskInstance: { ownerId: employee.id } },
        ],
      },
    });

    return { count };
  }

  async getAlertDetail(user: UserPayload, alertId: string) {
    const employee = await this.getEmployee(user.userId, user.organizationId);
    const alert = await this.getVisibleAlertForUser(user, alertId);

    const [comments, sourceAlert, abnormalities] = await Promise.all([
      this.prisma.alertComment.findMany({
        where: { alertId },
        include: {
          author: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      alert.abnormalitySourceAlertId
        ? this.prisma.alert.findUnique({
            where: { id: alert.abnormalitySourceAlertId },
          })
        : Promise.resolve(null),
      this.prisma.alert.findMany({
        where: { abnormalitySourceAlertId: alertId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      alert,
      comments: comments.map((comment) => this.serializeAlertComment(comment)),
      sourceAlert: this.serializeRelatedAlert(sourceAlert),
      abnormalities: abnormalities.map((item) =>
        this.serializeRelatedAlert(item),
      ),
      employeeId: employee.id,
    };
  }

  private serializeEmployeeDwmsAlert(alert: any) {
    return {
      ...alert,
      createdAt: alert.createdAt.toISOString(),
      updatedAt: alert.updatedAt?.toISOString?.() ?? alert.updatedAt,
      resolvedAt: alert.resolvedAt ? alert.resolvedAt.toISOString() : null,
      raisedBy: alert.raisedBy
        ? {
            id: alert.raisedBy.id,
            name: `${alert.raisedBy.firstName} ${alert.raisedBy.lastName}`.trim(),
            email: alert.raisedBy.email,
          }
        : null,
      againstUser: alert.againstUser
        ? {
            id: alert.againstUser.id,
            name: `${alert.againstUser.firstName} ${alert.againstUser.lastName}`.trim(),
            email: alert.againstUser.email,
          }
        : null,
      taskInstance: alert.taskInstance
        ? {
            id: alert.taskInstance.id,
            task: alert.taskInstance.task,
            owner: alert.taskInstance.owner
              ? {
                  id: alert.taskInstance.owner.id,
                  name: `${alert.taskInstance.owner.firstName} ${alert.taskInstance.owner.lastName}`.trim(),
                  email: alert.taskInstance.owner.email,
                  reportingToId: alert.taskInstance.owner.reportingManagerId,
                }
              : null,
          }
        : null,
    };
  }

  async getEmployeeDwmsProfile(
    user: UserPayload,
    employeeId: string,
    requestedPages: {
      taskPage?: number;
      currentAlertPage?: number;
      abnormalityPage?: number;
      raisedAlertPage?: number;
    } = {},
  ) {
    await this.getEmployee(user.userId, user.organizationId);
    if (!this.canUpdateDwmsPermissions(user.roleLevel)) {
      throw new ForbiddenException(
        'You are not authorized to view employee DWMS profile',
      );
    }

    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, organizationId: user.organizationId },
      include: { department: true },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    const alertInclude = {
      raisedBy: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
      againstUser: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
      department: { select: { id: true, name: true } },
      taskInstance: {
        select: {
          id: true,
          task: { select: { title: true } },
          owner: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              reportingManagerId: true,
            },
          },
        },
      },
    };

    const pageSize = 5;
    const normalizePage = (page?: number) =>
      Number.isFinite(page) ? Math.max(1, Math.floor(page!)) : 1;
    const pages = {
      currentTasks: normalizePage(requestedPages.taskPage),
      currentAlerts: normalizePage(requestedPages.currentAlertPage),
      abnormalities: normalizePage(requestedPages.abnormalityPage),
      raisedAlerts: normalizePage(requestedPages.raisedAlertPage),
    };

    const taskWhere = {
      ownerId: employeeId,
      task: { owner: { organizationId: user.organizationId } },
      status: { notIn: [TaskStatus.DONE, TaskStatus.NOT_APPLICABLE] },
    };
    const currentAlertWhere = {
      organizationId: user.organizationId,
      isAbnormality: false,
      status: { not: AlertStatus.CLOSED },
      OR: [
        { againstUserId: employeeId },
        { taskInstance: { ownerId: employeeId } },
      ],
    };
    const abnormalityWhere = {
      organizationId: user.organizationId,
      isAbnormality: true,
      status: { not: AlertStatus.CLOSED },
      OR: [
        { raisedById: employeeId },
        { againstUserId: employeeId },
        { taskInstance: { ownerId: employeeId } },
      ],
    };
    const raisedAlertWhere = {
      organizationId: user.organizationId,
      raisedById: employeeId,
      isAbnormality: false,
      status: { not: AlertStatus.CLOSED },
    };

    const [
      taskInstances,
      currentTaskCount,
      currentAlerts,
      currentAlertCount,
      abnormalities,
      abnormalityCount,
      raisedAlerts,
      raisedAlertCount,
      roleActivities,
    ] = await Promise.all([
      this.prisma.taskInstance.findMany({
        where: taskWhere,
        include: {
          task: {
            include: {
              owner: true,
              assignedBy: true,
              approvedBy: true,
              activity: true,
              department: true,
            },
          },
          comments: true,
          events: true,
          alerts: { orderBy: { createdAt: 'desc' } },
        },
        orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
        skip: (pages.currentTasks - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.taskInstance.count({ where: taskWhere }),
      this.prisma.alert.findMany({
        where: currentAlertWhere,
        include: alertInclude,
        orderBy: { createdAt: 'desc' },
        skip: (pages.currentAlerts - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.alert.count({ where: currentAlertWhere }),
      this.prisma.alert.findMany({
        where: abnormalityWhere,
        include: alertInclude,
        orderBy: { createdAt: 'desc' },
        skip: (pages.abnormalities - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.alert.count({ where: abnormalityWhere }),
      this.prisma.alert.findMany({
        where: raisedAlertWhere,
        include: alertInclude,
        orderBy: { createdAt: 'desc' },
        skip: (pages.raisedAlerts - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.alert.count({ where: raisedAlertWhere }),
      this.listEmployeeRoleActivities(user, employeeId),
    ]);

    const pagination = (page: number, totalItems: number) => ({
      page,
      pageSize,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
    });

    return {
      employee: {
        id: employee.id,
        name: `${employee.firstName} ${employee.lastName}`.trim(),
        email: employee.email,
        employeeCode: employee.employeeCode,
        jobTitle: employee.jobTitle,
        department: employee.department
          ? { id: employee.department.id, name: employee.department.name }
          : null,
      },
      counts: {
        currentTasks: currentTaskCount,
        currentAlerts: currentAlertCount,
        abnormalities: abnormalityCount,
        raisedAlerts: raisedAlertCount,
        applicableActivities: roleActivities.count,
        activeActivities: roleActivities.activities.filter(
          (item: any) => item.status === 'ACTIVE',
        ).length,
      },
      pagination: {
        currentTasks: pagination(pages.currentTasks, currentTaskCount),
        currentAlerts: pagination(pages.currentAlerts, currentAlertCount),
        abnormalities: pagination(pages.abnormalities, abnormalityCount),
        raisedAlerts: pagination(pages.raisedAlerts, raisedAlertCount),
      },
      currentTasks: taskInstances.map((instance) =>
        this.serializeTaskInstance(instance.task, instance),
      ),
      currentAlerts: currentAlerts.map((alert) =>
        this.serializeEmployeeDwmsAlert(alert),
      ),
      abnormalities: abnormalities.map((alert) =>
        this.serializeEmployeeDwmsAlert(alert),
      ),
      raisedAlerts: raisedAlerts.map((alert) =>
        this.serializeEmployeeDwmsAlert(alert),
      ),
      applicableActivities: roleActivities.activities,
    };
  }
  async addAlertComment(
    user: UserPayload,
    alertId: string,
    dto: CreateAlertCommentDto,
  ) {
    const employee = await this.getEmployee(user.userId, user.organizationId);
    await this.getVisibleAlertForUser(user, alertId);

    const comment = dto.comment.trim();
    if (!comment) {
      throw new BadRequestException('Comment is required');
    }

    const created = await this.prisma.alertComment.create({
      data: {
        alertId,
        authorId: employee.id,
        comment,
      },
      include: {
        author: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    return {
      message: 'Comment added successfully',
      comment: this.serializeAlertComment(created),
    };
  }
  async logCorrectiveAction(
    user: UserPayload,
    alertId: string,
    correctiveAction: string,
  ) {
    const employee = await this.getEmployee(user.userId, user.organizationId);

    const alert = await this.prisma.alert.findFirst({
      where: { id: alertId, organizationId: user.organizationId },
    });

    if (!alert) {
      throw new NotFoundException('Alert not found');
    }

    if (alert.status === AlertStatus.CLOSED) {
      throw new BadRequestException('Closed alerts cannot be changed');
    }
    const action = correctiveAction.trim();
    if (!action) {
      throw new BadRequestException('Corrective action is required');
    }

    // Authorization check: Only target user, owner of target task, HOD, or Management can respond
    const role = this.getDwmsRole(user.roleLevel);
    const isMgmt = role === 'MANAGEMENT';
    const isHod =
      role === 'HOD' && employee.departmentId === alert.departmentId;

    let isTarget = alert.againstUserId === employee.id;
    if (!isTarget && alert.taskInstanceId) {
      const inst = await this.prisma.taskInstance.findUnique({
        where: { id: alert.taskInstanceId },
        select: { ownerId: true },
      });
      isTarget = inst?.ownerId === employee.id;
    }

    if (!isTarget && !isMgmt && !isHod) {
      throw new ForbiddenException(
        'You are not authorized to respond to this alert',
      );
    }

    const updated = await this.prisma.alert.update({
      where: { id: alertId },
      data: {
        correctiveAction: action,
        status: AlertStatus.IN_PROGRESS,
      },
    });

    await this.notifications.create({
      employeeId: alert.raisedById,
      type: NotificationType.INFO,
      module: 'DWMS',
      title: 'Alert Response Logged',
      message: `${employee.firstName} ${employee.lastName} logged corrective action for alert: "${alert.title}".`,
      actionUrl: '/dwms/alerts',
    });

    return { message: 'Corrective action logged successfully', alert: updated };
  }

  private async addAlertHistoryEntry(
    alertId: string,
    authorId: string,
    title: string,
    note?: string | null,
  ) {
    const trimmed = note?.trim();
    const comment = trimmed ? `${title}: ${trimmed}` : title;

    return this.prisma.alertComment.create({
      data: {
        alertId,
        authorId,
        comment,
      },
    });
  }
  private async isResponsibleForAlert(alert: any, employeeId: string) {
    if (alert.againstUserId === employeeId) return true;
    if (!alert.taskInstanceId) return false;

    const instance = await this.prisma.taskInstance.findUnique({
      where: { id: alert.taskInstanceId },
      select: { ownerId: true },
    });

    return instance?.ownerId === employeeId;
  }

  private canApproveAlertClosure(user: UserPayload, employee: any, alert: any) {
    const role = this.getDwmsRole(user.roleLevel);
    const isMgmt = role === 'MANAGEMENT';
    const isHod =
      role === 'HOD' && employee.departmentId === alert.departmentId;
    const isApprover =
      (alert.closureApproverId ?? alert.raisedById) === employee.id;

    return isApprover || isMgmt || isHod;
  }

  private serializeApprovalAlert(alert: any) {
    return {
      ...alert,
      raisedBy: alert.raisedBy
        ? {
            id: alert.raisedBy.id,
            name: `${alert.raisedBy.firstName} ${alert.raisedBy.lastName}`.trim(),
            email: alert.raisedBy.email,
          }
        : null,
      againstUser: alert.againstUser
        ? {
            id: alert.againstUser.id,
            name: `${alert.againstUser.firstName} ${alert.againstUser.lastName}`.trim(),
            email: alert.againstUser.email,
          }
        : null,
      taskInstance: alert.taskInstance
        ? {
            id: alert.taskInstance.id,
            task: alert.taskInstance.task,
            owner: alert.taskInstance.owner
              ? {
                  id: alert.taskInstance.owner.id,
                  name: `${alert.taskInstance.owner.firstName} ${alert.taskInstance.owner.lastName}`.trim(),
                  email: alert.taskInstance.owner.email,
                  reportingToId: alert.taskInstance.owner.reportingManagerId,
                }
              : null,
          }
        : null,
      closureRequestedBy: alert.closureRequestedBy
        ? {
            id: alert.closureRequestedBy.id,
            name: `${alert.closureRequestedBy.firstName} ${alert.closureRequestedBy.lastName}`.trim(),
            email: alert.closureRequestedBy.email,
          }
        : null,
    };
  }

  async requestAlertClosure(
    user: UserPayload,
    alertId: string,
    closureNote: string,
  ) {
    const employee = await this.getEmployee(user.userId, user.organizationId);

    const alert = await this.prisma.alert.findFirst({
      where: { id: alertId, organizationId: user.organizationId },
    });

    if (!alert) {
      throw new NotFoundException('Alert not found');
    }
    if (alert.status === AlertStatus.CLOSED) {
      throw new BadRequestException('Alert is already closed');
    }

    const note = closureNote.trim();
    if (!note) {
      throw new BadRequestException('Closure note is required');
    }

    if (this.canApproveAlertClosure(user, employee, alert)) {
      return this.closeAlert(user, alertId, note);
    }

    const isResponsible = await this.isResponsibleForAlert(alert, employee.id);
    if (!isResponsible) {
      throw new ForbiddenException(
        'You are not authorized to request closure for this alert',
      );
    }

    const approverId = alert.raisedById;
    const updated = await this.prisma.alert.update({
      where: { id: alertId },
      data: {
        closureNote: note,
        closureApproverId: approverId,
        closureRequestedById: employee.id,
        closureRequestedAt: new Date(),
        closureApprovalStatus: AlertClosureApprovalStatus.PENDING,
        closureRejectedAt: null,
        closureRejectionNote: null,
        status: AlertStatus.IN_PROGRESS,
      },
    });

    await this.addAlertHistoryEntry(
      alertId,
      employee.id,
      'Closure requested',
      note,
    );

    if (approverId !== employee.id) {
      await this.notifications.create({
        employeeId: approverId,
        type: NotificationType.ACTION_REQUIRED,
        module: 'DWMS',
        title: 'Alert Closure Approval Pending',
        message: `${employee.firstName} ${employee.lastName} requested closure for alert: "${alert.title}".`,
        actionUrl: '/dwms/approvalTasks',
      });
    }

    return { message: 'Alert closure request submitted', alert: updated };
  }

  async getAlertClosureApprovals(user: UserPayload, status = 'pending') {
    const employee = await this.getEmployee(user.userId, user.organizationId);
    const normalizedStatus =
      status === 'approved'
        ? AlertClosureApprovalStatus.APPROVED
        : status === 'rejected'
          ? AlertClosureApprovalStatus.REJECTED
          : AlertClosureApprovalStatus.PENDING;

    const alerts = await this.prisma.alert.findMany({
      where: {
        organizationId: user.organizationId,
        closureApprovalStatus: normalizedStatus,
        closureApproverId: employee.id,
      },
      include: {
        raisedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        againstUser: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        taskInstance: {
          select: {
            id: true,
            task: { select: { title: true } },
            owner: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                reportingManagerId: true,
              },
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const requestedByIds = [
      ...new Set(
        alerts
          .map((alert) => alert.closureRequestedById)
          .filter((id): id is string => !!id),
      ),
    ];
    const requesters = await this.prisma.employee.findMany({
      where: { id: { in: requestedByIds } },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    const requesterById = new Map(
      requesters.map((requester) => [requester.id, requester]),
    );

    return {
      count: alerts.length,
      alerts: alerts.map((alert) =>
        this.serializeApprovalAlert({
          ...alert,
          closureRequestedBy: alert.closureRequestedById
            ? requesterById.get(alert.closureRequestedById)
            : null,
        }),
      ),
    };
  }

  async approveAlertClosure(
    user: UserPayload,
    alertId: string,
    comment?: string | null,
  ) {
    const employee = await this.getEmployee(user.userId, user.organizationId);
    const alert = await this.prisma.alert.findFirst({
      where: { id: alertId, organizationId: user.organizationId },
    });

    if (!alert) {
      throw new NotFoundException('Alert not found');
    }
    if (alert.closureApprovalStatus !== AlertClosureApprovalStatus.PENDING) {
      throw new BadRequestException('Alert closure is not pending approval');
    }
    if (!this.canApproveAlertClosure(user, employee, alert)) {
      throw new ForbiddenException(
        'You are not authorized to approve this alert closure',
      );
    }

    const approvalComment = comment?.trim() ?? '';
    if (!approvalComment) {
      throw new BadRequestException('Approval comment is required');
    }
    const updated = await this.prisma.alert.update({
      where: { id: alertId },
      data: {
        closureApprovalStatus: AlertClosureApprovalStatus.APPROVED,
        status: AlertStatus.CLOSED,
        resolvedAt: new Date(),
        closureRejectionNote: null,
        closureRejectedAt: null,
        closureNote: approvalComment || alert.closureNote,
      },
    });

    await this.addAlertHistoryEntry(
      alertId,
      employee.id,
      'Closure approved',
      approvalComment || 'Final acceptance confirmed',
    );

    if (
      alert.closureRequestedById &&
      alert.closureRequestedById !== employee.id
    ) {
      await this.notifications.create({
        employeeId: alert.closureRequestedById,
        type: NotificationType.INFO,
        module: 'DWMS',
        title: 'Alert Closure Approved',
        message: `${employee.firstName} ${employee.lastName} approved closure for alert: "${alert.title}".`,
        actionUrl: `/dwms/alerts/${alert.id}`,
      });
    }

    return { message: 'Alert closure approved', alert: updated };
  }

  async rejectAlertClosure(
    user: UserPayload,
    alertId: string,
    comment?: string | null,
  ) {
    const employee = await this.getEmployee(user.userId, user.organizationId);
    const alert = await this.prisma.alert.findFirst({
      where: { id: alertId, organizationId: user.organizationId },
    });

    if (!alert) {
      throw new NotFoundException('Alert not found');
    }
    if (alert.closureApprovalStatus !== AlertClosureApprovalStatus.PENDING) {
      throw new BadRequestException('Alert closure is not pending approval');
    }
    if (!this.canApproveAlertClosure(user, employee, alert)) {
      throw new ForbiddenException(
        'You are not authorized to reject this alert closure',
      );
    }

    const rejectionNote = comment?.trim() ?? '';
    if (!rejectionNote) {
      throw new BadRequestException('Rejection comment is required');
    }
    const updated = await this.prisma.alert.update({
      where: { id: alertId },
      data: {
        closureApprovalStatus: AlertClosureApprovalStatus.REJECTED,
        closureRejectedAt: new Date(),
        closureRejectionNote: rejectionNote,
        status: AlertStatus.IN_PROGRESS,
      },
    });

    await this.addAlertHistoryEntry(
      alertId,
      employee.id,
      'Closure rejected',
      rejectionNote,
    );

    if (
      alert.closureRequestedById &&
      alert.closureRequestedById !== employee.id
    ) {
      await this.notifications.create({
        employeeId: alert.closureRequestedById,
        type: NotificationType.ALERT,
        module: 'DWMS',
        title: 'Alert Closure Rejected',
        message: `${employee.firstName} ${employee.lastName} rejected closure for alert: "${alert.title}".`,
        actionUrl: `/dwms/alerts/${alert.id}`,
      });
    }

    return { message: 'Alert closure rejected', alert: updated };
  }

  async closeAlert(user: UserPayload, alertId: string, closureNote: string) {
    const employee = await this.getEmployee(user.userId, user.organizationId);

    const alert = await this.prisma.alert.findFirst({
      where: { id: alertId, organizationId: user.organizationId },
    });

    if (!alert) {
      throw new NotFoundException('Alert not found');
    }

    if (alert.status === AlertStatus.CLOSED) {
      throw new BadRequestException('Alert is already closed');
    }

    if (!this.canApproveAlertClosure(user, employee, alert)) {
      throw new ForbiddenException(
        'You are not authorized to close this alert',
      );
    }

    const note = closureNote.trim();
    if (!note) {
      throw new BadRequestException('Closure note is required');
    }

    const updated = await this.prisma.alert.update({
      where: { id: alertId },
      data: {
        closureNote: note,
        status: AlertStatus.CLOSED,
        resolvedAt: new Date(),
        closureApproverId: employee.id,
        closureApprovalStatus: AlertClosureApprovalStatus.APPROVED,
        closureRejectedAt: null,
        closureRejectionNote: null,
      },
    });

    await this.addAlertHistoryEntry(alertId, employee.id, 'Alert closed', note);

    return { message: 'Alert closed successfully', alert: updated };
  }
  async remindAlertOwner(user: UserPayload, alertId: string) {
    const employee = await this.getEmployee(user.userId, user.organizationId);

    const alert = await this.prisma.alert.findFirst({
      where: { id: alertId, organizationId: user.organizationId },
    });

    if (!alert) {
      throw new NotFoundException('Alert not found');
    }
    if (!this.canApproveAlertClosure(user, employee, alert)) {
      throw new ForbiddenException('You are not authorized to remind this alert owner');
    }
    if (alert.status === AlertStatus.CLOSED) {
      throw new BadRequestException('Alert is already closed');
    }

    if (!alert.againstUserId) {
      throw new BadRequestException(
        'This alert is not raised against a specific employee',
      );
    }

    if (!alert.taskInstanceId) {
      throw new BadRequestException(
        'This alert is not linked to a task instance',
      );
    }

    const taskInstance = await this.prisma.taskInstance.findUnique({
      where: { id: alert.taskInstanceId },
      include: { task: true },
    });

    if (!taskInstance) {
      throw new NotFoundException('Task instance not found');
    }

    // Check if reminder was already sent
    const existingNotification = await this.prisma.notification.findFirst({
      where: {
        employeeId: alert.againstUserId,
        type: NotificationType.ACTION_REQUIRED,
        module: 'DWMS',
        title: 'Task Reminder',
        message: { contains: taskInstance.task.title },
      },
    });

    if (existingNotification) {
      throw new BadRequestException(
        'Reminder has already been sent to this employee',
      );
    }

    await this.notifications.create({
      employeeId: alert.againstUserId,
      type: NotificationType.ACTION_REQUIRED,
      module: 'DWMS',
      title: 'Task Reminder',
      message: `Reminder: Please complete/acknowledge task "${taskInstance.task.title}" immediately.`,
      actionUrl: '/dwms/tasks',
    });

    return { message: 'Reminder sent successfully' };
  }

  async reassignEscalatedTask(
    user: UserPayload,
    alertId: string,
    newOwnerId: string,
  ) {
    const employee = await this.getEmployee(user.userId, user.organizationId);

    const alert = await this.prisma.alert.findFirst({
      where: { id: alertId, organizationId: user.organizationId },
    });

    if (!alert || !alert.taskInstanceId) {
      throw new BadRequestException('Alert is not linked to a task instance');
    }

    if (!this.canApproveAlertClosure(user, employee, alert)) {
      throw new ForbiddenException('You are not authorized to reassign this task');
    }
    if (alert.status === AlertStatus.CLOSED) {
      throw new BadRequestException('Alert is already closed');
    }

    const taskInstance = await this.prisma.taskInstance.findUnique({
      where: { id: alert.taskInstanceId, owner: { organizationId: user.organizationId } },
      include: { task: true },
    });

    if (!taskInstance) {
      throw new NotFoundException('Task instance not found');
    }

    const newOwner = await this.prisma.employee.findUnique({
      where: { id: newOwnerId, organizationId: user.organizationId },
    });

    if (!newOwner || newOwner.organizationId !== user.organizationId) {
      throw new BadRequestException('New owner not found in organization');
    }

    const newOwnerName = `${newOwner.firstName} ${newOwner.lastName}`.trim();

    await this.prisma.$transaction([
      this.prisma.task.update({
        where: { id: taskInstance.taskId },
        data: { ownerId: newOwnerId, ownerName: newOwnerName },
      }),
      this.prisma.taskInstance.update({
        where: { id: taskInstance.id },
        data: { ownerId: newOwnerId },
      }),
      this.prisma.alert.update({
        where: { id: alertId },
        data: { againstUserId: newOwnerId },
      }),
    ]);

    await this.notifications.create({
      employeeId: newOwnerId,
      type: NotificationType.ACTION_REQUIRED,
      module: 'DWMS',
      title: 'Task Reassigned',
      message: `You have been reassigned a task via escalation: "${taskInstance.task.title}".`,
      actionUrl: '/dwms/tasks',
    });

    return { message: 'Task reassigned successfully' };
  }

  async escalateAlertFurther(user: UserPayload, alertId: string) {
    const employee = await this.getEmployee(user.userId, user.organizationId);

    const alert = await this.prisma.alert.findFirst({
      where: { id: alertId, organizationId: user.organizationId },
    });

    if (!alert) {
      throw new NotFoundException('Alert not found');
    }
    if (!this.canApproveAlertClosure(user, employee, alert)) {
      throw new ForbiddenException('You are not authorized to escalate this alert');
    }
    if (alert.status === AlertStatus.CLOSED) {
      throw new BadRequestException('Alert is already closed');
    }

    const managerOfManagerId = employee.reportingManagerId;

    if (managerOfManagerId) {
      await this.notifications.create({
        employeeId: managerOfManagerId,
        type: NotificationType.ALERT,
        module: 'DWMS',
        title: 'Alert Escalated Further',
        message: `${employee.firstName} ${employee.lastName} escalated alert "${alert.title}" to you.`,
        actionUrl: `/dwms/alerts/${alert.id}`,
      });
    } else {
      const admin = await this.prisma.employee.findFirst({
        where: {
          organizationId: user.organizationId,
          user: {
            organizations: {
              some: {
                organizationId: user.organizationId,
                role: {
                  name: { in: ['SUPER_ADMIN', 'ADMIN', 'MANAGEMENT'] as any },
                },
              },
            },
          },
        },
        select: { id: true },
      });
      if (admin?.id) {
        await this.notifications.create({
          employeeId: admin.id,
          type: NotificationType.ALERT,
          module: 'DWMS',
          title: 'Alert Escalated Further',
          message: `Alert "${alert.title}" was escalated further.`,
          actionUrl: '/dwms/alerts',
        });
      }
    }

    const updated = await this.prisma.alert.update({
      where: { id: alertId },
      data: { status: AlertStatus.ESCALATED },
    });

    return { message: 'Alert escalated successfully', alert: updated };
  }
}
