import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AlertType, NotificationType, Severity, TaskStatus, ViewLevel } from 'db';
import type { Prisma } from 'db';
import {
  AcknowledgeAlertOccurrenceDto,
  CreateAlertCommentDto,
  CreateAlertDto,
} from '../dto/dwms.dto';
import { UserPayload } from './base.service';
import { DwmsDirectoryService } from './directory.service';

const employeeSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
} as const;

export abstract class DwmsAlertsService extends DwmsDirectoryService {
  private person(value: any) {
    return value
      ? {
          id: value.id,
          name: `${value.firstName} ${value.lastName}`.trim(),
          email: value.email,
        }
      : null;
  }

  private alertInclude() {
    return {
      raisedBy: { select: employeeSelect },
      againstUser: { select: employeeSelect },
      department: { select: { id: true, name: true } },
      taskInstance: {
        select: {
          id: true,
          task: { select: { id: true, title: true, assignedById: true } },
          owner: { select: { ...employeeSelect, reportingManagerId: true } },
        },
      },
      occurrences: {
        include: {
          raisedBy: { select: employeeSelect },
          acknowledgedBy: { select: employeeSelect },
        },
        orderBy: [{ raisedAt: 'asc' as const }, { id: 'asc' as const }],
      },
    };
  }

  private serializeAlert(alert: any) {
    return {
      ...alert,
      raisedBy: this.person(alert.raisedBy),
      againstUser: this.person(alert.againstUser),
      responsibleEmployee: this.person(alert.againstUser),
      taskInstance: alert.taskInstance
        ? {
            id: alert.taskInstance.id,
            task: alert.taskInstance.task,
            owner: this.person(alert.taskInstance.owner),
          }
        : null,
      pendingAcknowledgments: (alert.occurrences ?? []).filter(
        (item: any) => !item.acknowledgedAt && alert.againstUserId,
      ).length,
      occurrences: (alert.occurrences ?? []).map((item: any) => ({
        id: item.id,
        raisedAt: item.raisedAt.toISOString(),
        raisedBy: this.person(item.raisedBy),
        acknowledgedAt: item.acknowledgedAt?.toISOString() ?? null,
        acknowledgmentNote: item.acknowledgmentNote,
        acknowledgedBy: this.person(item.acknowledgedBy),
      })),
    };
  }

  private async assertCanRaiseForPerson(
    user: UserPayload,
    raiserId: string,
    responsibleId: string,
    taskInstanceId?: string | null,
  ) {
    if (raiserId === responsibleId) {
      throw new BadRequestException('You cannot raise an alert against yourself');
    }
    if (this.getDwmsRole(user.roleLevel) === 'MANAGEMENT') return;
    if (await this.isSuperior(raiserId, responsibleId, user.organizationId)) return;
    if (taskInstanceId) {
      const assigned = await this.prisma.taskInstance.findFirst({
        where: {
          id: taskInstanceId,
          ownerId: responsibleId,
          task: { assignedById: raiserId },
        },
        select: { id: true },
      });
      if (assigned) return;
    }
    throw new ForbiddenException('You may raise alerts only for your team or a task you assigned');
  }

  async createAlert(user: UserPayload, dto: CreateAlertDto) {
    const employee = await this.getEmployee(user.userId, user.organizationId);
    if (!dto.title?.trim() || !dto.description?.trim()) {
      throw new BadRequestException('Alert title and description are required');
    }
    if (dto.severity === Severity.LOW) {
      throw new BadRequestException('DWMS alerts cannot have low severity');
    }
    const targetType = dto.targetType ?? 'GENERAL';
    const supplied = [dto.taskInstanceId && 'TASK', dto.againstUserId && 'PERSON', dto.departmentId && 'DEPARTMENT'].filter(Boolean);
    if (!['GENERAL', 'TASK', 'PERSON', 'DEPARTMENT'].includes(targetType) ||
        supplied.some((kind) => kind !== targetType)) {
      throw new BadRequestException('Alert target fields must match targetType');
    }
    let responsibleId: string | null = null;
    if (targetType === 'PERSON') {
      if (!dto.againstUserId) throw new BadRequestException('againstUserId is required');
      await this.validateDwmsEmployee(dto.againstUserId, user.organizationId, 'Employee not found in this organization');
      responsibleId = dto.againstUserId;
      await this.assertCanRaiseForPerson(user, employee.id, responsibleId);
    } else if (targetType === 'TASK') {
      if (!dto.taskInstanceId) throw new BadRequestException('taskInstanceId is required');
      const instance = await this.prisma.taskInstance.findFirst({
        where: { id: dto.taskInstanceId, owner: { organizationId: user.organizationId } },
        select: { ownerId: true },
      });
      if (!instance) throw new NotFoundException('Task instance not found');
      responsibleId = instance.ownerId;
      await this.assertCanRaiseForPerson(user, employee.id, responsibleId, dto.taskInstanceId);
    } else if (targetType === 'DEPARTMENT') {
      if (!dto.departmentId) throw new BadRequestException('departmentId is required');
      const department = await this.prisma.department.findFirst({
        where: { id: dto.departmentId, organizationId: user.organizationId },
        select: { id: true },
      });
      if (!department) throw new NotFoundException('Department not found');
      const role = this.getDwmsRole(user.roleLevel);
      if (role !== 'HOD' && role !== 'MANAGEMENT' && employee.departmentId !== dto.departmentId) {
        throw new ForbiddenException('You can only raise alerts in your department');
      }
    } else if (this.getDwmsRole(user.roleLevel) !== 'HOD' &&
               this.getDwmsRole(user.roleLevel) !== 'MANAGEMENT') {
      throw new ForbiddenException('Organization alerts require HOD or Management role');
    }

    const alert = await this.prisma.alert.create({
      data: {
        type: AlertType.ABNORMAL_SITUATION,
        title: dto.title.trim(),
        description: dto.description.trim(),
        raisedById: employee.id,
        organizationId: user.organizationId,
        severity: dto.severity,
        taskInstanceId: dto.taskInstanceId ?? null,
        departmentId: dto.departmentId ?? null,
        againstUserId: responsibleId,
        raiseCount: 1,
        occurrences: { create: { raisedById: employee.id } },
      },
      include: this.alertInclude(),
    });
    if (responsibleId) {
      await this.notifyResponsible(responsibleId, alert.id, alert.title, false);
    }
    return { message: 'Alert raised', alert: this.serializeAlert(alert) };
  }

  private async notifyResponsible(id: string, alertId: string, title: string, abnormality: boolean) {
    await this.notifications.create({
      employeeId: id,
      type: NotificationType.ALERT,
      module: 'DWMS',
      title: abnormality ? 'Abnormality Raised Against You' : 'Alert Raised Against You',
      message: `Please acknowledge: "${title}".`,
      actionUrl: `/dwms/alerts/${alertId}`,
    });
  }

  async getAlertTargets(user: UserPayload) {
    const employee = await this.getEmployee(user.userId, user.organizationId);
    const role = this.getDwmsRole(user.roleLevel);
    const assignable = await this.listReportees(user);
    const reportees = await this.listReporteesRecursive(employee.id);
    const reporteeIds = reportees.map((item) => item.id);
    const departments = role === 'MANAGEMENT'
      ? await this.prisma.department.findMany({ where: { organizationId: user.organizationId }, select: { id: true, name: true } })
      : employee.departmentId
        ? await this.prisma.department.findMany({ where: { id: employee.departmentId }, select: { id: true, name: true } })
        : [];
    const tasks = await this.prisma.taskInstance.findMany({
      where: {
        owner: { organizationId: user.organizationId },
        AND: [
          { OR: [
            { ownerId: { in: reporteeIds } },
            { task: { assignedById: employee.id } },
          ] },
          { OR: [
            { status: { notIn: [TaskStatus.DONE, TaskStatus.NOT_APPLICABLE] } },
            { updatedAt: { gte: new Date(Date.now() - 7 * 86400000) } },
          ] },
        ],
      },
      include: { owner: { select: employeeSelect }, task: { select: { title: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    return {
      users: (assignable.users ?? []).map((item) => ({
        id: item.id,
        name: item.name,
        email: item.email,
        role: item.designation ?? 'Employee',
      })),
      departments,
      tasks: tasks.map((item) => ({
        instanceId: item.id,
        ownerId: item.ownerId,
        title: item.task.title,
        ownerName: `${item.owner.firstName} ${item.owner.lastName}`.trim(),
        ownerEmail: item.owner.email,
        status: item.status,
        dueAt: item.dueAt.toISOString(),
        frequency: item.frequency,
        completedAt: item.completedAt?.toISOString() ?? null,
      })),
    };
  }

  async getAlertHistories(
    user: UserPayload,
    rawTargetType: string,
    targetId: string,
  ) {
    const employee = await this.getEmployee(user.userId, user.organizationId);
    const targetType = rawTargetType?.trim().toUpperCase();
    let targetWhere: Prisma.AlertWhereInput;

    if (targetType === 'PERSON') {
      await this.validateDwmsEmployee(targetId, user.organizationId, 'Employee not found');
      await this.assertCanRaiseForPerson(user, employee.id, targetId);
      targetWhere = {
        againstUserId: targetId,
        taskInstanceId: null,
        departmentId: null,
      };
    } else if (targetType === 'TASK') {
      const taskInstance = await this.prisma.taskInstance.findFirst({
        where: { id: targetId, owner: { organizationId: user.organizationId } },
        select: { ownerId: true },
      });
      if (!taskInstance) throw new NotFoundException('Task instance not found');
      await this.assertCanRaiseForPerson(user, employee.id, taskInstance.ownerId, targetId);
      targetWhere = { taskInstanceId: targetId };
    } else if (targetType === 'DEPARTMENT') {
      const department = await this.prisma.department.findFirst({
        where: { id: targetId, organizationId: user.organizationId },
        select: { id: true },
      });
      if (!department) throw new NotFoundException('Department not found');
      const role = this.getDwmsRole(user.roleLevel);
      if (role !== 'HOD' && role !== 'MANAGEMENT' && employee.departmentId !== targetId) {
        throw new ForbiddenException('You can only raise alerts in your department');
      }
      targetWhere = {
        departmentId: targetId,
        againstUserId: null,
        taskInstanceId: null,
      };
    } else if (targetType === 'GENERAL') {
      if (!['HOD', 'MANAGEMENT'].includes(this.getDwmsRole(user.roleLevel))) {
        throw new ForbiddenException('Organization alerts require HOD or Management role');
      }
      targetWhere = {
        departmentId: null,
        againstUserId: null,
        taskInstanceId: null,
      };
    } else {
      throw new BadRequestException('Invalid alert target type');
    }

    const alerts = await this.prisma.alert.findMany({
      where: {
        organizationId: user.organizationId,
        AND: [
          targetWhere,
          {
            OR: [
              { raisedById: employee.id },
              { occurrences: { some: { raisedById: employee.id } } },
            ],
          },
        ],
      },
      include: this.alertInclude(),
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    return { alerts: alerts.map((alert) => this.serializeAlert(alert)) };
  }

  async raiseAlertAgain(user: UserPayload, alertId: string) {
    const employee = await this.getEmployee(user.userId, user.organizationId);
    const existing = await this.prisma.alert.findFirst({
      where: { id: alertId, organizationId: user.organizationId },
    });
    if (!existing) throw new NotFoundException('Alert not found');
    if (existing.againstUserId) {
      await this.assertCanRaiseForPerson(user, employee.id, existing.againstUserId, existing.taskInstanceId);
    } else if (existing.departmentId) {
      const role = this.getDwmsRole(user.roleLevel);
      if (role !== 'HOD' && role !== 'MANAGEMENT' && employee.departmentId !== existing.departmentId) {
        throw new ForbiddenException('You can only raise alerts in your department');
      }
    } else if (!['HOD', 'MANAGEMENT'].includes(this.getDwmsRole(user.roleLevel))) {
      throw new ForbiddenException('Organization alerts require HOD or Management role');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const alert = await tx.alert.update({
        where: { id: alertId },
        data: { raiseCount: { increment: 1 } },
      });
      if (alert.raiseCount >= 3 && !alert.isAbnormality) {
        await tx.alert.update({ where: { id: alertId }, data: { isAbnormality: true } });
      }
      await tx.alertOccurrence.create({
        data: { alertId, raisedById: employee.id },
      });
      return tx.alert.findUniqueOrThrow({ where: { id: alertId }, include: this.alertInclude() });
    });
    if (updated.againstUserId) {
      await this.notifyResponsible(updated.againstUserId, updated.id, updated.title, updated.isAbnormality);
    }
    return { message: 'Alert raised again', alert: this.serializeAlert(updated) };
  }

  async acknowledgeAlertOccurrence(
    user: UserPayload,
    alertId: string,
    occurrenceId: string,
    dto: AcknowledgeAlertOccurrenceDto,
  ) {
    const employee = await this.getEmployee(user.userId, user.organizationId);
    const note = dto.note?.trim();
    if (!note) throw new BadRequestException('Acknowledgment note is required');
    const alert = await this.prisma.alert.findFirst({
      where: { id: alertId, organizationId: user.organizationId },
      select: { againstUserId: true },
    });
    if (!alert) throw new NotFoundException('Alert not found');
    if (alert.againstUserId !== employee.id) {
      throw new ForbiddenException('Only the responsible person can acknowledge this alert');
    }
    const result = await this.prisma.alertOccurrence.updateMany({
      where: { id: occurrenceId, alertId, acknowledgedAt: null },
      data: { acknowledgedAt: new Date(), acknowledgedById: employee.id, acknowledgmentNote: note },
    });
    if (result.count !== 1) throw new BadRequestException('Occurrence is missing or already acknowledged');
    return { message: 'Alert acknowledged' };
  }

  private async visibility(user: UserPayload) {
    const employee = await this.getEmployee(user.userId, user.organizationId);
    const teamIds = (await this.listReporteesRecursive(employee.id)).map((item) => item.id);
    return { employee, teamIds };
  }

  async getAlerts(
    user: UserPayload,
    rawTab?: string,
    rawPage?: string,
    rawLimit?: string,
    _rawStatus?: string,
    rawSeverity?: string,
    rawSearch?: string,
  ) {
    const { employee, teamIds } = await this.visibility(user);
    const access = await this.getDwmsAccessCapabilities(user);
    const isManagement = this.getDwmsRole(user.roleLevel) === 'MANAGEMENT';
    const tab = rawTab?.trim().toUpperCase() || 'MY_ALERTS';
    const allowed = ['MY_ALERTS', 'TEAM_ALERTS', 'MY_ABNORMALITIES', 'TEAM_ABNORMALITIES', 'DEPARTMENTAL', 'ORGANISATIONAL', 'OPENED_BY_ME'];
    if (!allowed.includes(tab)) throw new BadRequestException('Invalid alert tab');
    if ((tab === 'TEAM_ALERTS' || tab === 'TEAM_ABNORMALITIES') && !isManagement && !access.hasReportees) {
      throw new ForbiddenException('Reporting-team alert access is required');
    }
    if (tab === 'DEPARTMENTAL' && !this.viewLevelAtLeast(access.alertViewLevel, ViewLevel.DEPARTMENT)) {
      throw new ForbiddenException('Department alert access is required');
    }
    if (tab === 'ORGANISATIONAL' && access.alertViewLevel !== ViewLevel.ORGANIZATION) {
      throw new ForbiddenException('Organization alert access is required');
    }
    const page = Math.max(1, Number(rawPage) || 1);
    const limit = Math.min(100, Math.max(1, Number(rawLimit) || 20));
    const where: Prisma.AlertWhereInput = { organizationId: user.organizationId };
    if (tab === 'MY_ALERTS') Object.assign(where, { againstUserId: employee.id, isAbnormality: false });
    if (tab === 'TEAM_ALERTS') Object.assign(where, {
      againstUserId: isManagement ? { not: null } : { in: teamIds },
      ...(isManagement ? {} : { raisedById: { not: employee.id } }),
      isAbnormality: false,
    });
    if (tab === 'MY_ABNORMALITIES') Object.assign(where, { againstUserId: employee.id, isAbnormality: true });
    if (tab === 'TEAM_ABNORMALITIES') Object.assign(where, {
      againstUserId: isManagement ? { not: null } : { in: teamIds },
      isAbnormality: true,
    });
    if (tab === 'DEPARTMENTAL') Object.assign(where, {
      departmentId: access.alertViewLevel === ViewLevel.ORGANIZATION
        ? { not: null }
        : employee.departmentId ?? '__none__',
      againstUserId: null,
      isAbnormality: false,
    });
    if (tab === 'ORGANISATIONAL') Object.assign(where, { departmentId: null, againstUserId: null, taskInstanceId: null, isAbnormality: false });
    if (tab === 'OPENED_BY_ME') Object.assign(where, {
      OR: [
        { raisedById: employee.id },
        { occurrences: { some: { raisedById: employee.id } } },
      ],
      isAbnormality: false,
    });
    const filters: Prisma.AlertWhereInput[] = [where];
    const severity = rawSeverity?.trim().toUpperCase();
    if (severity && severity !== 'ALL') {
      if (!Object.values(Severity).includes(severity as Severity)) throw new BadRequestException('Invalid severity');
      filters.push({ severity: severity as Severity });
    }
    const search = rawSearch?.trim().slice(0, 100);
    if (search) filters.push({ OR: [
      { title: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ] });
    const query = { AND: filters };
    const [alerts, total] = await Promise.all([
      this.prisma.alert.findMany({
        where: query,
        include: this.alertInclude(),
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.alert.count({ where: query }),
    ]);
    return {
      count: total,
      alerts: alerts.map((item) => this.serializeAlert(item)),
      employeeId: employee.id,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async getMyAlertCount(user: UserPayload) {
    const employee = await this.getEmployee(user.userId, user.organizationId);
    const count = await this.prisma.alertOccurrence.count({
      where: {
        alert: { organizationId: user.organizationId, againstUserId: employee.id },
      },
    });
    return { count };
  }

  private async visibleAlert(user: UserPayload, alertId: string) {
    const { employee, teamIds } = await this.visibility(user);
    const access = await this.getDwmsAccessCapabilities(user);
    const visibility: Prisma.AlertWhereInput[] = [
      { againstUserId: employee.id },
      { raisedById: employee.id },
      { occurrences: { some: { raisedById: employee.id } } },
    ];
    if (access.hasReportees && teamIds.length > 0) {
      visibility.push({ againstUserId: { in: teamIds } });
    }
    if (this.viewLevelAtLeast(access.alertViewLevel, ViewLevel.DEPARTMENT)) {
      visibility.push({
        departmentId: access.alertViewLevel === ViewLevel.ORGANIZATION
          ? { not: null }
          : employee.departmentId ?? '__none__',
        againstUserId: null,
      });
    }
    if (access.alertViewLevel === ViewLevel.ORGANIZATION) {
      visibility.push({ departmentId: null, againstUserId: null, taskInstanceId: null });
    }
    const alert = await this.prisma.alert.findFirst({
      where: {
        id: alertId,
        organizationId: user.organizationId,
        OR: visibility,
      },
      include: this.alertInclude(),
    });
    if (!alert) throw new NotFoundException('Alert not found');
    return alert;
  }

  async getAlertDetail(user: UserPayload, alertId: string) {
    const employee = await this.getEmployee(user.userId, user.organizationId);
    const alert = await this.visibleAlert(user, alertId);
    const comments = await this.prisma.alertComment.findMany({
      where: { alertId },
      include: { author: { select: employeeSelect } },
      orderBy: { createdAt: 'asc' },
    });
    return {
      alert: this.serializeAlert(alert),
      employeeId: employee.id,
      comments: comments.map((item) => ({
        id: item.id,
        comment: item.comment,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
        author: this.person(item.author),
      })),
    };
  }

  async addAlertComment(user: UserPayload, alertId: string, dto: CreateAlertCommentDto) {
    const employee = await this.getEmployee(user.userId, user.organizationId);
    await this.visibleAlert(user, alertId);
    const comment = dto.comment?.trim();
    if (!comment) throw new BadRequestException('Comment is required');
    const created = await this.prisma.alertComment.create({
      data: { alertId, authorId: employee.id, comment },
      include: { author: { select: employeeSelect } },
    });
    return {
      message: 'Comment added',
      comment: {
        id: created.id,
        comment: created.comment,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
        author: this.person(created.author),
      },
    };
  }

  async getEmployeeDwmsProfile(
    user: UserPayload,
    employeeId: string,
    requestedPages: { routinePage?: number; assignedPage?: number; currentAlertPage?: number; abnormalityPage?: number } = {},
  ) {
    await this.getEmployee(user.userId, user.organizationId);
    if (!this.canUpdateDwmsPermissions(user.roleLevel)) {
      throw new ForbiddenException('You are not authorized to view employee DWMS profile');
    }
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, organizationId: user.organizationId },
      include: { department: true },
    });
    if (!employee) throw new NotFoundException('Employee not found');
    const pageSize = 5;
    const normalize = (value?: number) => Math.max(1, Math.trunc(value || 1));
    const pages = {
      routineWork: normalize(requestedPages.routinePage),
      assignedTasks: normalize(requestedPages.assignedPage),
      currentAlerts: normalize(requestedPages.currentAlertPage),
      abnormalities: normalize(requestedPages.abnormalityPage),
    };
    const taskWhere: Prisma.TaskInstanceWhereInput = {
      ownerId: employeeId,
      status: { notIn: [TaskStatus.DONE, TaskStatus.NOT_APPLICABLE] },
    };
    const assignedTaskWhere: Prisma.TaskInstanceWhereInput = {
      ...taskWhere,
      task: { assignedById: { not: null } },
    };
    const routineTaskWhere: Prisma.TaskInstanceWhereInput = {
      ...taskWhere,
      task: { activityId: { not: null }, assignedById: null },
    };
    const alertWhere = (extra: Prisma.AlertWhereInput): Prisma.AlertWhereInput => ({
      organizationId: user.organizationId, ...extra,
    });
    const currentWhere = alertWhere({ againstUserId: employeeId, isAbnormality: false });
    const abnormalWhere = alertWhere({ againstUserId: employeeId, isAbnormality: true });
    const [routineTasks, routineTaskCount, assignedTasks, assignedTaskCount, current, currentCount, abnormal, abnormalCount, activities] =
      await Promise.all([
        this.prisma.taskInstance.findMany({
          where: routineTaskWhere,
          include: {
            task: { include: { owner: true, assignedBy: true, approvedBy: true, activity: true, department: true } },
            comments: true, events: true, alerts: { orderBy: { createdAt: 'desc' } },
          },
          orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
          skip: (pages.routineWork - 1) * pageSize, take: pageSize,
        }),
        this.prisma.taskInstance.count({ where: routineTaskWhere }),
        this.prisma.taskInstance.findMany({
          where: assignedTaskWhere,
          include: {
            task: { include: { owner: true, assignedBy: true, approvedBy: true, activity: true, department: true } },
            comments: true, events: true, alerts: { orderBy: { createdAt: 'desc' } },
          },
          orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
          skip: (pages.assignedTasks - 1) * pageSize, take: pageSize,
        }),
        this.prisma.taskInstance.count({ where: assignedTaskWhere }),
        this.prisma.alert.findMany({ where: currentWhere, include: this.alertInclude(), orderBy: { updatedAt: 'desc' }, skip: (pages.currentAlerts - 1) * pageSize, take: pageSize }),
        this.prisma.alert.count({ where: currentWhere }),
        this.prisma.alert.findMany({ where: abnormalWhere, include: this.alertInclude(), orderBy: { updatedAt: 'desc' }, skip: (pages.abnormalities - 1) * pageSize, take: pageSize }),
        this.prisma.alert.count({ where: abnormalWhere }),
        this.listEmployeeRoleActivities(user, employeeId),
      ]);
    const pagination = (page: number, count: number) => ({
      page, pageSize, totalItems: count, totalPages: Math.max(1, Math.ceil(count / pageSize)),
    });
    return {
      employee: {
        id: employee.id,
        name: `${employee.firstName} ${employee.lastName}`.trim(),
        email: employee.email,
        employeeCode: employee.employeeCode,
        jobTitle: employee.jobTitle,
        department: employee.department ? { id: employee.department.id, name: employee.department.name } : null,
      },
      counts: {
        routineWork: routineTaskCount,
        assignedTasks: assignedTaskCount, currentAlerts: currentCount, abnormalities: abnormalCount,
        applicableActivities: activities.count,
        activeActivities: activities.activities.filter((item: any) => item.status === 'ACTIVE').length,
      },
      pagination: {
        routineWork: pagination(pages.routineWork, routineTaskCount),
        assignedTasks: pagination(pages.assignedTasks, assignedTaskCount),
        currentAlerts: pagination(pages.currentAlerts, currentCount),
        abnormalities: pagination(pages.abnormalities, abnormalCount),
      },
      routineWork: routineTasks.map((item) => this.serializeTaskInstance(item.task, item)),
      assignedTasks: assignedTasks.map((item) => this.serializeTaskInstance(item.task, item)),
      currentAlerts: current.map((item) => this.serializeAlert(item)),
      abnormalities: abnormal.map((item) => this.serializeAlert(item)),
      applicableActivities: activities.activities,
    };
  }
}
