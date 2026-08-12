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
    const list = await this.getAlerts(user);
    const alert = (list.alerts ?? []).find((item: any) => item.id === alertId);

    if (!alert) {
      throw new NotFoundException('Alert not found');
    }

    return alert;
  }

  async createAlert(user: UserPayload, dto: CreateAlertDto) {
    const employee = await this.getEmployee(user.userId, user.organizationId);
    const role = this.getDwmsRole(user.roleLevel);

    if (dto.severity === Severity.LOW) {
      throw new BadRequestException('DWMS alerts cannot have low severity');
    }

    const targetType = dto.targetType ?? 'GENERAL';

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
        where: { id: dto.taskInstanceId },
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
        where: { id: dto.taskInstanceId },
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
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 7);
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

  async getAlerts(user: UserPayload) {
    const employee = await this.getEmployee(user.userId, user.organizationId);
    const role = this.getDwmsRole(user.roleLevel);

    const config = await this.prisma.dwmsPermissionConfig.findUnique({
      where: { organizationId: user.organizationId },
      select: { alertViewLevel: true },
    });
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

    let alerts: any[] = [];

    const includeOptions = {
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

    if (effectiveViewLevel === 'ORGANIZATION') {
      alerts = await this.prisma.alert.findMany({
        where: { organizationId: user.organizationId },
        include: includeOptions,
        orderBy: { createdAt: 'desc' },
      });
    } else if (effectiveViewLevel === 'DEPARTMENT') {
      const reporteeIds = (await this.listReporteesRecursive(employee.id)).map(
        (r) => r.id,
      );

      alerts = await this.prisma.alert.findMany({
        where: {
          organizationId: user.organizationId,
          OR: [
            { raisedById: employee.id },
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
        include: includeOptions,
        orderBy: { createdAt: 'desc' },
      });
    } else {
      alerts = await this.prisma.alert.findMany({
        where: {
          organizationId: user.organizationId,
          OR: [
            { raisedById: employee.id },
            { againstUserId: employee.id },
            { taskInstance: { ownerId: employee.id } },
          ],
        },
        include: includeOptions,
        orderBy: { createdAt: 'desc' },
      });
    }

    return {
      count: alerts.length,
      alerts: alerts.map((a) => ({
        ...a,
        raisedBy: a.raisedBy
          ? {
              id: a.raisedBy.id,
              name: `${a.raisedBy.firstName} ${a.raisedBy.lastName}`,
              email: a.raisedBy.email,
            }
          : null,
        againstUser: a.againstUser
          ? {
              id: a.againstUser.id,
              name: `${a.againstUser.firstName} ${a.againstUser.lastName}`,
              email: a.againstUser.email,
            }
          : null,
        taskInstance: a.taskInstance
          ? {
              id: a.taskInstance.id,
              task: a.taskInstance.task,
              owner: a.taskInstance.owner
                ? {
                    id: a.taskInstance.owner.id,
                    name: `${a.taskInstance.owner.firstName} ${a.taskInstance.owner.lastName}`.trim(),
                    email: a.taskInstance.owner.email,
                    reportingToId: a.taskInstance.owner.reportingManagerId,
                  }
                : null,
            }
          : null,
      })),
      employeeId: employee.id,
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
      abnormalities: abnormalities.map((item) => this.serializeRelatedAlert(item)),
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

  async getEmployeeDwmsProfile(user: UserPayload, employeeId: string) {
    await this.getEmployee(user.userId, user.organizationId);
    if (!this.canUpdateDwmsPermissions(user.roleLevel)) {
      throw new ForbiddenException('You are not authorized to view employee DWMS profile');
    }

    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, organizationId: user.organizationId },
      include: { department: true },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    await this.checkAndRaiseDelayedTaskAlerts(user.organizationId);

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

    const [taskInstances, currentAlerts, abnormalities, raisedAlerts, roleActivities] =
      await Promise.all([
        this.prisma.taskInstance.findMany({
          where: {
            ownerId: employeeId,
            task: { owner: { organizationId: user.organizationId } },
            status: { notIn: [TaskStatus.DONE, TaskStatus.NOT_APPLICABLE] },
          },
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
          take: 25,
        }),
        this.prisma.alert.findMany({
          where: {
            organizationId: user.organizationId,
            isAbnormality: false,
            status: { not: AlertStatus.CLOSED },
            OR: [
              { againstUserId: employeeId },
              { taskInstance: { ownerId: employeeId } },
            ],
          },
          include: alertInclude,
          orderBy: { createdAt: 'desc' },
          take: 25,
        }),
        this.prisma.alert.findMany({
          where: {
            organizationId: user.organizationId,
            isAbnormality: true,
            status: { not: AlertStatus.CLOSED },
            OR: [
              { raisedById: employeeId },
              { againstUserId: employeeId },
              { taskInstance: { ownerId: employeeId } },
            ],
          },
          include: alertInclude,
          orderBy: { createdAt: 'desc' },
          take: 25,
        }),
        this.prisma.alert.findMany({
          where: {
            organizationId: user.organizationId,
            raisedById: employeeId,
            isAbnormality: false,
            status: { not: AlertStatus.CLOSED },
          },
          include: alertInclude,
          orderBy: { createdAt: 'desc' },
          take: 25,
        }),
        this.listEmployeeRoleActivities(user, employeeId),
      ]);

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
        currentTasks: taskInstances.length,
        currentAlerts: currentAlerts.length,
        abnormalities: abnormalities.length,
        raisedAlerts: raisedAlerts.length,
        applicableActivities: roleActivities.count,
        activeActivities: roleActivities.activities.filter(
          (item: any) => item.status === 'ACTIVE',
        ).length,
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
        correctiveAction,
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
    const isHod = role === 'HOD' && employee.departmentId === alert.departmentId;
    const isApprover = (alert.closureApproverId ?? alert.raisedById) === employee.id;

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

    if (alert.closureRequestedById && alert.closureRequestedById !== employee.id) {
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

    if (alert.closureRequestedById && alert.closureRequestedById !== employee.id) {
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

    await this.addAlertHistoryEntry(
      alertId,
      employee.id,
      'Alert closed',
      note,
    );

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

    const taskInstance = await this.prisma.taskInstance.findUnique({
      where: { id: alert.taskInstanceId },
      include: { task: true },
    });

    if (!taskInstance) {
      throw new NotFoundException('Task instance not found');
    }

    const newOwner = await this.prisma.employee.findUnique({
      where: { id: newOwnerId },
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









