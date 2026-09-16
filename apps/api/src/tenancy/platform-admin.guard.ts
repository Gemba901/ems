import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { OrgStatus } from 'db';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '../common/enum/role.enum';
import type { TenantRequest } from './tenant-context';

// Cross-company operations require current SUPER_ADMIN membership in the
// designated platform organization. A role in a client company is insufficient.
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<TenantRequest>();
    const user = req.user;
    if (!user || user.tokenType !== 'ACCESS') throw new ForbiddenException('Platform access denied.');
    const membership = await this.prisma.userOrganization.findUnique({
      where: { userId_organizationId: { userId: user.userId, organizationId: user.organizationId } },
      select: { roleId: true, role: { select: { name: true } }, organization: { select: { status: true, isAdminOrg: true } } },
    });
    if (!membership || membership.role.name !== Role.SUPER_ADMIN ||
        !membership.organization.isAdminOrg || membership.organization.status !== OrgStatus.ACTIVE) {
      throw new ForbiddenException('Platform access denied.');
    }
    req.user = { ...user, roleId: membership.roleId, roleLevel: Role.SUPER_ADMIN, isAdminOrg: true };
    return true;
  }
}
