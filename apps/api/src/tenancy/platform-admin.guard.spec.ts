import 'reflect-metadata';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { OrgStatus } from 'db';
import { PlatformAdminGuard } from './platform-admin.guard';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '../common/enum/role.enum';

describe('PlatformAdminGuard', () => {
  const membership = { roleId: 1, role: { name: Role.SUPER_ADMIN }, organization: { isAdminOrg: true, status: OrgStatus.ACTIVE } };
  const findUnique = jest.fn();
  const guard = new PlatformAdminGuard({ userOrganization: { findUnique } } as unknown as PrismaService);
  const req = { user: { tokenType: 'ACCESS', userId: 'user', organizationId: 'platform', roleId: 1, roleLevel: Role.SUPER_ADMIN, isAdminOrg: true } };
  const ctx = { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;

  it('authorizes current active platform super-admin membership', async () => {
    findUnique.mockResolvedValue(membership);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { userId_organizationId: { userId: 'user', organizationId: 'platform' } } }));
  });

  it.each([
    null,
    { ...membership, role: { name: Role.ADMIN } },
    { ...membership, organization: { isAdminOrg: false, status: OrgStatus.ACTIVE } },
    { ...membership, organization: { isAdminOrg: true, status: OrgStatus.SUSPENDED } },
    { ...membership, organization: { isAdminOrg: true, status: OrgStatus.INACTIVE } },
  ])('rejects stale or non-platform claims (%#)', async (current) => {
    findUnique.mockResolvedValue(current);
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
