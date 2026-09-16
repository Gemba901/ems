import 'reflect-metadata';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { GUARDS_METADATA, HTTP_CODE_METADATA, MODULE_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { AuthModule } from './auth.module';
import { CompanyAuthController } from './company-auth.controller';
import { TenancyModule } from '../tenancy/tenancy.module';
import { TrustedTenantContextGuard } from '../tenancy/trusted-tenant-context.guard';
import { PrismaService } from '../prisma/prisma.service';
import { TENANT_REQUIRED_KEY } from '../tenancy/tenant-route.decorator';
import type { TenantRequest } from '../tenancy/tenant-context';
import { OrgStatus } from 'db';

describe('CompanyAuthController and tenant guard wiring', () => {
  const secret = 'a'.repeat(64);
  const tenant = { organizationId: 'org-one', slug: 'acme', name: 'Acme' };
  const dto = { phoneOrEmail: 'user@example.com', password: 'password' };
  const result = { accessToken: 'access-token', refreshToken: 'private-refresh-token', user: { organizationId: tenant.organizationId } };
  const auth = { loginForTenant: jest.fn(), refreshForTenant: jest.fn() };
  const findUnique = jest.fn();
  let module: TestingModule;
  let controller: CompanyAuthController;
  let guard: TrustedTenantContextGuard;
  let cookie: jest.Mock;
  let response: Response;

  beforeEach(async () => {
    jest.resetAllMocks();
    auth.loginForTenant.mockResolvedValue(result);
    auth.refreshForTenant.mockResolvedValue(result);
    findUnique.mockResolvedValue({ id: tenant.organizationId, slug: tenant.slug, name: tenant.name, status: OrgStatus.ACTIVE });
    module = await Test.createTestingModule({
      imports: [ConfigModule, TenancyModule],
      controllers: [CompanyAuthController],
      providers: [{ provide: AuthService, useValue: auth }],
    })
      .overrideProvider(PrismaService).useValue({ organization: { findUnique } })
      .overrideProvider(ConfigService).useValue(new ConfigService({ TENANT_BASE_DOMAIN: 'gembapms.co.in', TENANT_PROXY_SECRET: secret }))
      .compile();
    await module.init();
    controller = module.get(CompanyAuthController);
    guard = module.get(TrustedTenantContextGuard);
    cookie = jest.fn();
    response = { cookie } as unknown as Response;
  });

  afterEach(async () => { await module?.close(); });

  function request(overrides: Partial<TenantRequest> = {}): TenantRequest {
    return {
      headers: { 'x-gemba-proxy-secret': secret, 'x-gemba-tenant-hostname': 'acme.gembapms.co.in' },
      cookies: { refresh_token: 'old-token' }, ...overrides,
    } as TenantRequest;
  }

  // Exercise the real guard against controller metadata without opening a socket.
  // HTTP transport and cookie-parser integration are outside this unit suite.
  async function invoke(action: 'login' | 'refresh', req: TenantRequest) {
    const context = {
      getHandler: () => controller[action], getClass: () => CompanyAuthController,
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
    await guard.canActivate(context);
    return action === 'login' ? controller.login(dto, req, response) : controller.refresh(req, response);
  }

  it('registers the company controller and tenancy dependency in AuthModule', () => {
    expect(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, AuthModule)).toContain(CompanyAuthController);
    expect(Reflect.getMetadata(MODULE_METADATA.IMPORTS, AuthModule)).toContain(TenancyModule);
    expect(Reflect.getMetadata(PATH_METADATA, CompanyAuthController)).toBe('auth/company');
    expect(Reflect.getMetadata(GUARDS_METADATA, CompanyAuthController)).toEqual([TrustedTenantContextGuard]);
  });

  it.each(['login', 'refresh'] as const)('marks %s as tenant-required and returns status 200', (action) => {
    expect(new Reflector().getAllAndOverride(TENANT_REQUIRED_KEY, [controller[action], CompanyAuthController])).toBe(true);
    expect(Reflect.getMetadata(PATH_METADATA, controller[action])).toBe(action);
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, controller[action])).toBe(200);
  });

  it.each(['login', 'refresh'] as const)('resolves trusted context for %s and returns only public token data', async (action) => {
    const req = request({ tenant: { ...tenant, organizationId: 'spoofed' } });
    const value = await invoke(action, req);
    expect(req.tenant).toEqual(tenant);
    expect(value).toEqual({ accessToken: result.accessToken, user: result.user });
    expect(value).not.toHaveProperty('refreshToken');
    expect(cookie).toHaveBeenCalledWith('refresh_token', result.refreshToken, {
      httpOnly: true, secure: process.env.NODE_ENV !== 'development', sameSite: 'lax', path: '/', maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    expect(cookie.mock.calls[0][2]).not.toHaveProperty('domain');
    if (action === 'login') expect(auth.loginForTenant).toHaveBeenCalledWith(tenant, dto.phoneOrEmail, dto.password, undefined);
    else expect(auth.refreshForTenant).toHaveBeenCalledWith(tenant, 'old-token');
  });

  it('forwards employee-code login and ignores a body organization ID', async () => {
    const req = request({ tenant });
    await controller.login({ ...dto, employeeCode: 'EMP001', organizationId: 'org-two' } as typeof dto, req, response);
    expect(auth.loginForTenant).toHaveBeenCalledWith(tenant, dto.phoneOrEmail, dto.password, 'EMP001');
  });

  it.each(['login', 'refresh'] as const)('rejects untrusted %s before calling authentication', async (action) => {
    await expect(invoke(action, request({ headers: { 'x-gemba-tenant-hostname': 'acme.gembapms.co.in' } }))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(auth.loginForTenant).not.toHaveBeenCalled();
    expect(auth.refreshForTenant).not.toHaveBeenCalled();
    expect(findUnique).not.toHaveBeenCalled();
    expect(cookie).not.toHaveBeenCalled();
  });

  it.each(['login', 'refresh'] as const)('fails closed when %s is called without resolved context', async (action) => {
    const promise = action === 'login' ? controller.login(dto, request(), response) : controller.refresh(request(), response);
    await expect(promise).rejects.toBeInstanceOf(UnauthorizedException);
    expect(auth.loginForTenant).not.toHaveBeenCalled();
    expect(auth.refreshForTenant).not.toHaveBeenCalled();
    expect(cookie).not.toHaveBeenCalled();
  });

  it.each([undefined, '', '  ', 123, ['token']])('rejects malformed refresh cookies (%#)', async (value) => {
    await expect(invoke('refresh', request({ cookies: { refresh_token: value } }))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(auth.refreshForTenant).not.toHaveBeenCalled();
    expect(cookie).not.toHaveBeenCalled();
  });

  it.each(['login', 'refresh'] as const)('does not change cookies when %s fails', async (action) => {
    const error = new UnauthorizedException('Denied');
    auth.loginForTenant.mockRejectedValue(error);
    auth.refreshForTenant.mockRejectedValue(error);
    await expect(invoke(action, request())).rejects.toBe(error);
    expect(cookie).not.toHaveBeenCalled();
  });

  it('waits for refresh completion before replacing the cookie', async () => {
    let complete!: (value: typeof result) => void;
    auth.refreshForTenant.mockReturnValue(new Promise((resolve) => { complete = resolve; }));
    const pending = controller.refresh(request({ tenant }), response);
    expect(cookie).not.toHaveBeenCalled();
    complete(result);
    await pending;
    expect(cookie).toHaveBeenCalledTimes(1);
  });
});
