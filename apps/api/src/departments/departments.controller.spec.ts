import 'reflect-metadata';
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { OrgStatus } from 'db';
import { DepartmentsController } from './departments.controller';
import { DepartmentsService } from './departments.service';
import { DepartmentsModule } from './departments.module';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role } from '../common/enum/role.enum';
import { TenantGuard } from '../tenancy/tenant.guard';
import { TrustedTenantContextGuard } from '../tenancy/trusted-tenant-context.guard';
import type { TenantRequest } from '../tenancy/tenant-context';

describe('Department controller guard wiring', () => {
  const secret = 'a'.repeat(64);
  const membership = jest.fn();
  const service = {
    createDepartment: jest.fn(), getDepartments: jest.fn(), getDepartmentById: jest.fn(),
    updateDepartment: jest.fn(), deleteDepartment: jest.fn(),
  };
  const actions = ['createDepartment', 'getDepartments', 'getDepartmentById', 'updateDepartment', 'deleteDepartment'] as const;
  let module: TestingModule;
  let controller: DepartmentsController;

  beforeEach(async () => {
    jest.clearAllMocks();
    membership.mockResolvedValue({ roleId: 2, role: { name: Role.ADMIN }, organization: { status: OrgStatus.ACTIVE, isAdminOrg: false } });
    module = await Test.createTestingModule({ imports: [DepartmentsModule] })
      .overrideProvider(PrismaService).useValue({
        organization: { findUnique: jest.fn().mockResolvedValue({ id: 'org-one', slug: 'acme', name: 'Acme', status: OrgStatus.ACTIVE }) },
        userOrganization: { findUnique: membership },
      })
      .overrideProvider(ConfigService).useValue(new ConfigService({ TENANT_BASE_DOMAIN: 'gembapms.co.in', TENANT_PROXY_SECRET: secret }))
      .overrideProvider(DepartmentsService).useValue(service)
      .compile();
    await module.init();
    controller = module.get(DepartmentsController);
  });
  afterEach(async () => { await module?.close(); });

  function request(): TenantRequest {
    return {
      headers: { 'x-gemba-proxy-secret': secret, 'x-gemba-tenant-hostname': 'acme.gembapms.co.in' },
      user: { tokenType: 'ACCESS', userId: 'user-one', organizationId: 'org-one', roleId: 2, roleLevel: Role.ADMIN, email: null, isAdminOrg: false },
      body: { organizationId: 'org-two' },
    } as TenantRequest;
  }
  function context(req: TenantRequest, action: typeof actions[number]) {
    return { getClass: () => DepartmentsController, getHandler: () => controller[action], switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
  }

  it('initializes the module and registers the guard order', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, DepartmentsController)).toEqual([
      TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, RolesGuard,
    ]);
  });

  it.each(actions)('rejects a different-company JWT on %s', async (action) => {
    const req = request();
    req.user!.organizationId = 'org-two';
    const ctx = context(req, action);
    await module.get(TrustedTenantContextGuard).canActivate(ctx);
    // JWT signature verification is covered by jwt.strategy.spec.ts.
    await expect(module.get(TenantGuard).canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
    expect(membership).not.toHaveBeenCalled();
  });

  it('uses current permissions when authorizing a rename', async () => {
    const req = request();
    const ctx = context(req, 'updateDepartment');
    await module.get(TrustedTenantContextGuard).canActivate(ctx);
    membership.mockResolvedValue({ roleId: 6, role: { name: Role.EMPLOYEE }, organization: { status: OrgStatus.ACTIVE, isAdminOrg: false } });
    await module.get(TenantGuard).canActivate(ctx);
    expect(new RolesGuard(new Reflector()).canActivate(ctx)).toBe(false);
  });

  it('passes the resolved company to every service method', async () => {
    const req = request();
    await module.get(TrustedTenantContextGuard).canActivate(context(req, 'getDepartments'));
    controller.createDepartment({ name: 'Finance' }, req);
    controller.getDepartments(req);
    controller.getDepartmentById('dept-one', req);
    controller.updateDepartment('dept-one', { name: 'Renamed' }, req);
    controller.deleteDepartment('dept-one', req);
    expect(service.createDepartment).toHaveBeenCalledWith('Finance', 'org-one');
    expect(service.getDepartments).toHaveBeenCalledWith('org-one');
    expect(service.getDepartmentById).toHaveBeenCalledWith('dept-one', 'org-one');
    expect(service.updateDepartment).toHaveBeenCalledWith('dept-one', 'Renamed', 'org-one');
    expect(service.deleteDepartment).toHaveBeenCalledWith('dept-one', 'org-one');
  });

  it('fails closed if trusted context is missing', () => {
    expect(() => controller.getDepartments(request())).toThrow(UnauthorizedException);
    expect(service.getDepartments).not.toHaveBeenCalled();
  });
});
