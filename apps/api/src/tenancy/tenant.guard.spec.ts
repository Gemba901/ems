import 'reflect-metadata';
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OrgStatus } from 'db';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '../common/enum/role.enum';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TenantRequired } from './tenant-route.decorator';
import { TenantGuard } from './tenant.guard';
import type { TenantRequest } from './tenant-context';

@TenantRequired()
@Roles(Role.ADMIN)
class CompanyController { handle() {} }
class MixedController {
  platform() {}
  @TenantRequired()
  company() {}
}

describe('TenantGuard', () => {
  let findUnique: jest.Mock;
  let guard: TenantGuard;
  const activeMembership = {
    roleId: 2, role: { name: Role.ADMIN },
    organization: { status: OrgStatus.ACTIVE, isAdminOrg: false },
  };
  beforeEach(() => {
    findUnique = jest.fn().mockResolvedValue(activeMembership);
    guard = new TenantGuard(new Reflector(), { userOrganization: { findUnique } } as unknown as PrismaService);
  });

  function request(): TenantRequest {
    return {
      tenant: { organizationId: 'org-one', slug: 'acme', name: 'Acme' },
      user: {
        tokenType: 'ACCESS', userId: 'user-one', organizationId: 'org-one',
        roleId: 2, roleLevel: Role.ADMIN, email: null, isAdminOrg: false,
      },
    } as TenantRequest;
  }
  function context(req: TenantRequest, scope: 'controller' | 'handler' | 'platform' = 'controller') {
    return {
      switchToHttp: () => ({ getRequest: () => req }),
      getClass: () => scope === 'controller' ? CompanyController : MixedController,
      getHandler: () => scope === 'controller' ? CompanyController.prototype.handle :
        scope === 'handler' ? MixedController.prototype.company : MixedController.prototype.platform,
    } as unknown as ExecutionContext;
  }

  it('leaves unmarked routes to their own authorization without a lookup', async () => {
    const req = {} as TenantRequest;
    await expect(guard.canActivate(context(req, 'platform'))).resolves.toBe(true);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it.each(['controller', 'handler'] as const)('checks membership for a marked %s', async (scope) => {
    await expect(guard.canActivate(context(request(), scope))).resolves.toBe(true);
    expect(findUnique).toHaveBeenCalledWith({
      where: { userId_organizationId: { userId: 'user-one', organizationId: 'org-one' } },
      select: {
        roleId: true, role: { select: { name: true } },
        organization: { select: { status: true, isAdminOrg: true } },
      },
    });
  });

  it('rejects missing trusted tenant context without falling back to caller-supplied IDs', async () => {
    const req = request();
    delete req.tenant;
    req.body = { organizationId: 'org-one' };
    req.headers = { 'x-tenant-id': 'org-one' };
    await expect(guard.canActivate(context(req))).rejects.toBeInstanceOf(ForbiddenException);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('rejects missing authentication without a database lookup', async () => {
    const req = request();
    delete req.user;
    await expect(guard.canActivate(context(req))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('rejects a non-access user object', async () => {
    const req = request();
    Object.assign(req.user!, { tokenType: 'SETUP' });
    await expect(guard.canActivate(context(req))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it.each([Role.ADMIN, Role.SUPER_ADMIN])('rejects a different token organization even for %s', async (roleLevel) => {
    const req = request();
    Object.assign(req.user!, { organizationId: 'org-two', roleLevel, isAdminOrg: true });
    await expect(guard.canActivate(context(req))).rejects.toBeInstanceOf(ForbiddenException);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it.each([Role.ADMIN, Role.SUPER_ADMIN])('rejects deleted membership for %s', async (roleLevel) => {
    const req = request();
    req.user!.roleLevel = roleLevel;
    findUnique.mockResolvedValue(null);
    await expect(guard.canActivate(context(req))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each([OrgStatus.SUSPENDED, OrgStatus.INACTIVE])('rejects organization status %s', async (status) => {
    findUnique.mockResolvedValue({ ...activeMembership, organization: { status, isAdminOrg: false } });
    await expect(guard.canActivate(context(request()))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a database role unknown to the application', async () => {
    findUnique.mockResolvedValue({ ...activeMembership, role: { name: 'UNKNOWN' } });
    await expect(guard.canActivate(context(request()))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refreshes role and platform flag so RolesGuard rejects a demoted admin', async () => {
    const req = request();
    req.user!.isAdminOrg = true;
    const ctx = context(req);
    const rolesGuard = new RolesGuard(new Reflector());
    expect(rolesGuard.canActivate(ctx)).toBe(true);
    findUnique.mockResolvedValue({ ...activeMembership, roleId: 6, role: { name: Role.EMPLOYEE } });
    await guard.canActivate(ctx);
    expect(req.user).toEqual({
      tokenType: 'ACCESS', userId: 'user-one', organizationId: 'org-one',
      roleId: 6, roleLevel: Role.EMPLOYEE, email: null, isAdminOrg: false,
    });
    expect(rolesGuard.canActivate(ctx)).toBe(false);
  });

  it('rechecks membership on every request instead of caching removed access', async () => {
    await guard.canActivate(context(request()));
    findUnique.mockResolvedValue(null);
    await expect(guard.canActivate(context(request()))).rejects.toBeInstanceOf(ForbiddenException);
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it('propagates database failures', async () => {
    const error = new Error('Database unavailable');
    findUnique.mockRejectedValue(error);
    await expect(guard.canActivate(context(request()))).rejects.toBe(error);
  });

  it.each([0, 1])('checks nested managed files against the trusted tenant (owned count: %i)', async owned => {
    const id = '11111111-1111-4111-8111-111111111111';
    const req = request();
    req.body = { attachments: [{ url: `/api/uploads/files/${id}` }] };
    const count = jest.fn().mockResolvedValue(owned);
    const execute = jest.fn();
    const db = { userOrganization: { findUnique }, $transaction: (work: any) => work({ $executeRaw: execute, fileAsset: { count } }) };
    guard = new TenantGuard(new Reflector(), db as unknown as PrismaService);
    if (owned) await expect(guard.canActivate(context(req))).resolves.toBe(true);
    else await expect(guard.canActivate(context(req))).rejects.toBeInstanceOf(ForbiddenException);
    expect(count).toHaveBeenCalledWith({ where: { id: { in: [id] }, organizationId: 'org-one', status: 'READY' } });
    expect(execute).toHaveBeenCalled();
  });
});
