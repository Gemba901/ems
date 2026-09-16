import { tenantTransaction } from '../prisma/tenant-transaction';
import { managedFileIds } from '../uploads/upload-policy';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OrgStatus } from 'db';

import { PrismaService } from '../prisma/prisma.service';
import { Role } from '../common/enum/role.enum';
import { TENANT_REQUIRED_KEY } from './tenant-route.decorator';
import type { TenantRequest } from './tenant-context';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<boolean>(
      TENANT_REQUIRED_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Platform routes retain their separate authorization.
    if (!required) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<TenantRequest>();

    const { tenant, user } = request;

    // Missing context must never fall back to a body/header organization ID.
    if (!tenant) {
      throw new ForbiddenException('Company context is required.');
    }

    if (!user || user.tokenType !== 'ACCESS') {
      throw new UnauthorizedException('Authentication is required.');
    }

    // A valid token for another company cannot access this workspace.
    if (user.organizationId !== tenant.organizationId) {
      throw new ForbiddenException('Company access denied.');
    }

    const membership = await this.prisma.userOrganization.findUnique({
      where: {
        userId_organizationId: {
          userId: user.userId,
          organizationId: tenant.organizationId,
        },
      },
      select: {
        roleId: true,
        role: {
          select: {
            name: true,
          },
        },
        organization: {
          select: {
            status: true,
            isAdminOrg: true,
          },
        },
      },
    });

    // Deleted membership means immediate loss of company access.
    if (!membership) {
      throw new ForbiddenException('Company access denied.');
    }

    // Recheck status here rather than relying solely on earlier resolution.
    if (membership.organization.status !== OrgStatus.ACTIVE) {
      throw new ForbiddenException('This company workspace is not active.');
    }

    const currentRole = membership.role.name;

    // Keep the database role and application authorization enum aligned.
    if (!Object.values(Role).includes(currentRole as Role)) {
      throw new ForbiddenException('Unsupported company role.');
    }

    // Managed file references must belong to this workspace, including nested DTOs.
    const fileIds = [...managedFileIds(request.body)];
    if (fileIds.length) {
      const owned = await tenantTransaction(this.prisma, tenant.organizationId, tx => tx.fileAsset.count({ where: { id: { in: fileIds }, organizationId: tenant.organizationId, status: 'READY' } }));
      if (owned !== fileIds.length) throw new ForbiddenException('File access denied.');
    }

    // Downstream RolesGuard must use current permissions, not stale claims.
    request.user = {
      ...user,
      roleId: membership.roleId,
      roleLevel: currentRole as Role,
      isAdminOrg: membership.organization.isAdminOrg,
    };

    return true;
  }
}