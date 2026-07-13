import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationsService } from 'src/notifications/notifications.service';
import { EscalationContactRule, TaskPermissionRole, TaskStatus } from 'db';
import { TASK_ROLE_VALUES } from '../dto/dwmsSettings.dto';

export class UserPayload {
  userId!: string;
  organizationId!: string;
  roleLevel!: string;
}

export const APPROVAL_PENDING_STATUS = 'APPROVAL_PENDING' as TaskStatus;
export const completedStatuses = new Set<TaskStatus>([
  TaskStatus.DONE,
  TaskStatus.NOT_APPLICABLE,
]);
export const nonOverdueStatuses = new Set<TaskStatus>([
  TaskStatus.DONE,
  TaskStatus.NOT_APPLICABLE,
  APPROVAL_PENDING_STATUS,
]);
export const nonOverdueStatusValues = [
  TaskStatus.DONE,
  TaskStatus.NOT_APPLICABLE,
  APPROVAL_PENDING_STATUS,
];

export abstract class DwmsBaseService {
  protected constructor(
    protected readonly prisma: PrismaService,
    protected readonly notifications: NotificationsService,
  ) {}

  async getEmployee(userId: string, organizationId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { userId, organizationId },
      include: {
        department: true,
      },
    });
    if (!employee)
      throw new UnauthorizedException(
        'Employee profile not found in this organization',
      );
    return employee;
  }

  protected normalizeAckWindowFallback(
    mins: number | null | undefined,
    fallback: number,
  ) {
    const value =
      typeof mins === 'number' && Number.isFinite(mins)
        ? Math.trunc(mins)
        : fallback;
    return Math.max(0, value);
  }

  protected async validateDwmsEmployee(
    employeeId: string,
    organizationId: string,
    errorMessage: string,
  ) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, organizationId },
      select: { id: true },
    });

    if (!employee) {
      throw new BadRequestException(errorMessage);
    }

    return employee;
  }

  protected normalizeTaskRoles(input?: TaskPermissionRole[]) {
    const selected = [
      ...new Set(
        (input ?? []).filter((value): value is TaskPermissionRole =>
          TASK_ROLE_VALUES.includes(value as TaskPermissionRole),
        ),
      ),
    ];
    if (selected.includes(TaskPermissionRole.ANYONE)) {
      return [TaskPermissionRole.ANYONE];
    }
    return selected;
  }

  protected async normalizeCustomEmployeeIds(
    employeeIds: string[] | undefined,
    organizationId: string,
    label: string,
  ) {
    const normalized = [
      ...new Set(
        (employeeIds ?? []).map((value) => value.trim()).filter(Boolean),
      ),
    ];
    if (normalized.length > 3) {
      throw new BadRequestException(`${label} can include at most 3 employees`);
    }

    for (const employeeId of normalized) {
      await this.validateDwmsEmployee(
        employeeId,
        organizationId,
        `${label} must belong to the current organization`,
      );
    }

    return normalized;
  }

  protected async normalizeEmployeeIds(
    employeeIds: string[] | undefined,
    organizationId: string,
    label: string,
    maxSize?: number,
  ) {
    const normalized = [
      ...new Set(
        (employeeIds ?? []).map((value) => value.trim()).filter(Boolean),
      ),
    ];
    if (typeof maxSize === 'number' && normalized.length > maxSize) {
      throw new BadRequestException(
        `${label} can include at most ${maxSize} employees`,
      );
    }

    for (const employeeId of normalized) {
      await this.validateDwmsEmployee(
        employeeId,
        organizationId,
        `${label} must belong to the current organization`,
      );
    }

    return normalized;
  }

  protected normalizeEscalationContactRules(input?: EscalationContactRule[]) {
    const selected = [...new Set((input ?? []).filter(Boolean))];
    if (selected.length === 0) {
      return [EscalationContactRule.ASSIGNER];
    }
    return selected;
  }

  protected formatDwmsPermissionConfig(config: any) {
    if (!config) return config;

    const escalationContactRules =
      Array.isArray(config.escalationContactRules) &&
      config.escalationContactRules.length > 0
        ? config.escalationContactRules
        : [EscalationContactRule.ASSIGNER];

    return {
      ...config,
      escalationContactRules,
      escalateUnacknowledgedMediumMins: this.normalizeAckWindowFallback(
        config.escalateUnacknowledgedMediumMins,
        1440,
      ),
      escalateUnacknowledgedHighMins: this.normalizeAckWindowFallback(
        config.escalateUnacknowledgedHighMins,
        480,
      ),
      escalateUnacknowledgedCriticalMins: this.normalizeAckWindowFallback(
        config.escalateUnacknowledgedCriticalMins,
        120,
      ),
      customEscalationContactIds:
        Array.isArray(config.customEscalationContactIds) &&
        config.customEscalationContactIds.length > 0
          ? config.customEscalationContactIds
          : [],
    };
  }

  // Dynamic role level mapper from EMS to DWMS format
  getDwmsRole(roleLevel: string): string {
    const role = String(roleLevel).toUpperCase().trim();
    if (
      role === 'SUPER_ADMIN' ||
      role === 'ADMIN' ||
      role === 'MANAGEMENT' ||
      role === 'HR'
    ) {
      return 'MANAGEMENT';
    }
    if (role === 'HOD') {
      return 'HOD';
    }
    return 'OPERATOR';
  }

  protected canUpdateDwmsPermissions(roleLevel: string) {
    const role = String(roleLevel).toUpperCase().trim();
    return (
      role === 'SUPER_ADMIN' ||
      role === 'ADMIN' ||
      role === 'MANAGEMENT' ||
      role === 'HR'
    );
  }

  protected normalizeDashboardDays(rawDays?: string) {
    const days = Number(rawDays);
    if (!Number.isFinite(days)) return 7;
    return Math.min(90, Math.max(1, Math.trunc(days)));
  }

  async isSuperior(superiorId: string, employeeId: string): Promise<boolean> {
    let currentId: string | null = employeeId;
    const visited = new Set<string>();
    while (currentId) {
      if (visited.has(currentId)) break;
      visited.add(currentId);
      const employee = await this.prisma.employee.findUnique({
        where: { id: currentId },
        select: { reportingManagerId: true },
      });
      if (!employee || !employee.reportingManagerId) break;
      if (employee.reportingManagerId === superiorId) {
        return true;
      }
      currentId = employee.reportingManagerId;
    }
    return false;
  }
}
