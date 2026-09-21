import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { TaskPermissionRole, ViewLevel } from 'db';
import { UpdateDwmsPermissionConfigDto } from '../dto/dwmsSettings.dto';
import { UserPayload } from './base.service';
import { DwmsActivityService } from './activity.service';

export abstract class DwmsSettingsService extends DwmsActivityService {
  protected viewLevelAtLeast(actual: ViewLevel, required: ViewLevel) {
    const rank: Record<ViewLevel, number> = {
      [ViewLevel.OWN]: 0,
      [ViewLevel.DEPARTMENT]: 1,
      [ViewLevel.ORGANIZATION]: 2,
    };
    return rank[actual] >= rank[required];
  }

  private applyRoleMinimum(configured: ViewLevel, roleLevel: string) {
    const role = this.getDwmsRole(roleLevel);
    if (role === 'MANAGEMENT') return ViewLevel.ORGANIZATION;
    if (
      role === 'HOD' &&
      !this.viewLevelAtLeast(configured, ViewLevel.DEPARTMENT)
    ) {
      return ViewLevel.DEPARTMENT;
    }
    return configured;
  }

  async getDwmsAccessCapabilities(user: UserPayload) {
    const employee = await this.getEmployee(user.userId, user.organizationId);
    const [config, reportee] = await Promise.all([
      this.prisma.dwmsPermissionConfig.findUnique({
        where: { organizationId: user.organizationId },
        select: { alertViewLevel: true, analyticsViewLevel: true },
      }),
      this.prisma.employee.findFirst({
        where: {
          organizationId: user.organizationId,
          reportingManagerId: employee.id,
        },
        select: { id: true },
      }),
    ]);

    return {
      alertViewLevel: this.applyRoleMinimum(
        config?.alertViewLevel ?? ViewLevel.OWN,
        user.roleLevel,
      ),
      analyticsViewLevel: this.applyRoleMinimum(
        config?.analyticsViewLevel ?? ViewLevel.DEPARTMENT,
        user.roleLevel,
      ),
      hasReportees: Boolean(reportee),
    };
  }

  async getDwmsPermissionConfig(user: UserPayload) {
    await this.getEmployee(user.userId, user.organizationId);
    const config = await this.prisma.dwmsPermissionConfig.upsert({
      where: { organizationId: user.organizationId },
      create: { organizationId: user.organizationId },
      update: {},
    });
    return config;
  }

  async updateDwmsPermissionConfig(
    user: UserPayload,
    dto: UpdateDwmsPermissionConfigDto,
  ) {
    const employee = await this.getEmployee(user.userId, user.organizationId);
    if (!this.canUpdateDwmsPermissions(user.roleLevel)) {
      throw new ForbiddenException(
        'Only admin, management, HR, and super admin users can update DWMS permissions',
      );
    }
    const updateData: {
      approverRoles?: TaskPermissionRole[];
      approverCustomEmployeeIds?: string[];
      alertViewLevel?: ViewLevel;
      analyticsViewLevel?: ViewLevel;
    } = {};
    if (dto.approverRoles !== undefined) {
      const roles = this.normalizeTaskRoles(dto.approverRoles);
      if (roles.length === 0)
        throw new BadRequestException('Select at least one task approver role');
      if (roles.includes(TaskPermissionRole.CUSTOM)) {
        const ids = await this.normalizeCustomEmployeeIds(
          dto.approverCustomEmployeeIds,
          user.organizationId,
          'Approver custom employees',
        );
        if (ids.length === 0)
          throw new BadRequestException('Select custom approver employees');
        updateData.approverCustomEmployeeIds = ids;
      } else {
        updateData.approverCustomEmployeeIds = [];
      }
      updateData.approverRoles = roles;
    }
    if (dto.alertViewLevel !== undefined)
      updateData.alertViewLevel = dto.alertViewLevel;
    if (dto.analyticsViewLevel !== undefined)
      updateData.analyticsViewLevel = dto.analyticsViewLevel;
    const config = await this.prisma.dwmsPermissionConfig.upsert({
      where: { organizationId: user.organizationId },
      create: { organizationId: user.organizationId, ...updateData },
      update: updateData,
    });
    return {
      message: 'DWMS settings updated successfully',
      updatedBy: {
        id: employee.id,
        name: `${employee.firstName} ${employee.lastName}`.trim(),
      },
      config,
    };
  }
}
