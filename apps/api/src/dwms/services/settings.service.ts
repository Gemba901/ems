import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EscalationContactRule, TaskPermissionRole } from 'db';
import { UpdateDwmsPermissionConfigDto } from '../dto/dwmsSettings.dto';
import { UserPayload } from './base.service';
import { DwmsActivityService } from './activity.service';

export abstract class DwmsSettingsService extends DwmsActivityService {
  async getDwmsPermissionConfig(user: UserPayload) {
    await this.getEmployee(user.userId, user.organizationId);

    const config = await this.prisma.dwmsPermissionConfig.upsert({
      where: { organizationId: user.organizationId },
      create: { organizationId: user.organizationId },
      update: {},
    });

    return this.formatDwmsPermissionConfig(config);
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

    const existing = await this.prisma.dwmsPermissionConfig.findUnique({
      where: { organizationId: user.organizationId },
    });

    const updateData: any = {};

    if (dto.approverRoles !== undefined) {
      const approverRoles = this.normalizeTaskRoles(dto.approverRoles);
      if (approverRoles.length === 0) {
        throw new BadRequestException('Select at least one task approver role');
      }
      if (approverRoles.includes(TaskPermissionRole.CUSTOM)) {
        const customApproverIds = await this.normalizeCustomEmployeeIds(
          dto.approverCustomEmployeeIds,
          user.organizationId,
          'Approver custom employees',
        );
        if (customApproverIds.length === 0) {
          throw new BadRequestException(
            'Select up to 3 custom approver employees when CUSTOM is enabled',
          );
        }
        updateData.approverCustomEmployeeIds = customApproverIds;
      } else {
        updateData.approverCustomEmployeeIds = [];
      }
      updateData.approverRoles = approverRoles;
    }

    if (dto.alertViewLevel !== undefined)
      updateData.alertViewLevel = dto.alertViewLevel;
    if (dto.analyticsViewLevel !== undefined)
      updateData.analyticsViewLevel = dto.analyticsViewLevel;
    if (dto.escalateUnacknowledgedMins !== undefined) {
      updateData.escalateUnacknowledgedMins = Math.trunc(
        dto.escalateUnacknowledgedMins,
      );
    }
    if (dto.escalateUnacknowledgedMediumMins !== undefined) {
      updateData.escalateUnacknowledgedMediumMins = Math.trunc(
        dto.escalateUnacknowledgedMediumMins,
      );
    }
    if (dto.escalateUnacknowledgedHighMins !== undefined) {
      updateData.escalateUnacknowledgedHighMins = Math.trunc(
        dto.escalateUnacknowledgedHighMins,
      );
    }
    if (dto.escalateUnacknowledgedCriticalMins !== undefined) {
      updateData.escalateUnacknowledgedCriticalMins = Math.trunc(
        dto.escalateUnacknowledgedCriticalMins,
      );
    }
    if (dto.abnormalityMediumMins !== undefined) {
      updateData.abnormalityMediumMins = Math.trunc(
        dto.abnormalityMediumMins,
      );
    }
    if (dto.abnormalityHighMins !== undefined) {
      updateData.abnormalityHighMins = Math.trunc(
        dto.abnormalityHighMins,
      );
    }
    if (dto.abnormalityCriticalMins !== undefined) {
      updateData.abnormalityCriticalMins = Math.trunc(
        dto.abnormalityCriticalMins,
      );
    }

    if (dto.escalationContactRules !== undefined) {
      const escalationContactRules = this.normalizeEscalationContactRules(
        dto.escalationContactRules,
      );
      updateData.escalationContactRules = escalationContactRules;
    }

    const effectiveEscalationRules =
      dto.escalationContactRules !== undefined
        ? this.normalizeEscalationContactRules(dto.escalationContactRules)
        : existing?.escalationContactRules?.length
          ? existing.escalationContactRules
          : [EscalationContactRule.ASSIGNER];

    if (effectiveEscalationRules.includes(EscalationContactRule.CUSTOM)) {
      const customEscalationContactIds =
        dto.customEscalationContactIds !== undefined
          ? await this.normalizeCustomEmployeeIds(
              dto.customEscalationContactIds,
              user.organizationId,
              'Custom escalation contacts',
            )
          : (existing?.customEscalationContactIds ?? []);

      if (customEscalationContactIds.length === 0) {
        throw new BadRequestException(
          'Select up to 3 custom escalation contacts when CUSTOM is enabled',
        );
      }

      updateData.customEscalationContactIds = customEscalationContactIds;
    } else if (dto.customEscalationContactIds !== undefined) {
      updateData.customEscalationContactIds = [];
    }

    const config = await this.prisma.dwmsPermissionConfig.upsert({
      where: { organizationId: user.organizationId },
      create: {
        organizationId: user.organizationId,
        ...updateData,
      },
      update: updateData,
    });

    return {
      message: 'DWMS settings updated successfully',
      updatedBy: {
        id: employee.id,
        name: `${employee.firstName} ${employee.lastName}`.trim(),
      },
      config: this.formatDwmsPermissionConfig(config),
    };
  }
}

