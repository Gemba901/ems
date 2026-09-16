import 'reflect-metadata';
import { ExecutionContext, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { TenantRequired } from './tenant-route.decorator';
import { TenantResolverService } from './tenant-resolver.service';
import { TrustedTenantContextGuard } from './trusted-tenant-context.guard';
import type { TenantRequest } from './tenant-context';

// Exercise real decorator metadata and Reflector lookups, not a mocked boolean.
@TenantRequired()
class CompanyController {
  handle() {}
}
class MixedController {
  platform() {}

  @TenantRequired()
  company() {}
}

describe('TrustedTenantContextGuard', () => {
  const secret = 'a'.repeat(64); // Fixture, never a deployment credential.
  const tenant = { organizationId: 'acme-id', slug: 'acme', name: 'Acme' };
  let resolve: jest.Mock;
  let guard: TrustedTenantContextGuard;

  beforeEach(() => {
    resolve = jest.fn().mockResolvedValue(tenant);
    guard = new TrustedTenantContextGuard(
      new Reflector(),
      { resolveCompanyHostname: resolve } as unknown as TenantResolverService,
      { get: () => secret } as unknown as ConfigService,
    );
  });

  function request(headers: TenantRequest['headers'] = {}) {
    return {
      headers,
      tenant: { organizationId: 'untrusted-id', slug: 'untrusted', name: 'Untrusted' },
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

  function validHeaders(): TenantRequest['headers'] {
    return { 'x-gemba-proxy-secret': secret, 'x-gemba-tenant-hostname': 'acme.gembapms.co.in' };
  }

  it('allows an unmarked route without a lookup, clearing stale tenant context', async () => {
    const req = request();
    await expect(guard.canActivate(context(req, 'platform'))).resolves.toBe(true);
    expect(req.tenant).toBeUndefined();
    expect(resolve).not.toHaveBeenCalled();
  });

  it.each(['controller', 'handler'] as const)('attaches resolved context for a marked %s', async (scope) => {
    const req = request(validHeaders());
    await expect(guard.canActivate(context(req, scope))).resolves.toBe(true);
    expect(resolve).toHaveBeenCalledWith('acme.gembapms.co.in');
    expect(req.tenant).toEqual(tenant);
  });

  it.each(['controller', 'handler'] as const)('requires credentials for a marked %s', async (scope) => {
    await expect(guard.canActivate(context(request(), scope))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(resolve).not.toHaveBeenCalled();
  });

  it.each([
    undefined, '', 'wrong', 'b'.repeat(64), [secret, secret],
    `${secret}, ${secret}`, 'a'.repeat(1025),
  ])('rejects invalid proxy credentials without resolving a company (%#)', async (value) => {
    const req = request({ ...validHeaders(), 'x-gemba-proxy-secret': value });
    await expect(guard.canActivate(context(req))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(resolve).not.toHaveBeenCalled();
    expect(req.tenant).toBeUndefined();
  });

  it('does not trust tenant ID or forwarded-host headers without proxy authentication', async () => {
    const req = request({
      'x-tenant-id': 'acme-id', 'x-forwarded-host': 'acme.gembapms.co.in',
      'x-gemba-tenant-hostname': 'acme.gembapms.co.in',
    });
    await expect(guard.canActivate(context(req))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(resolve).not.toHaveBeenCalled();
  });

  it.each([undefined, '', ['acme.gembapms.co.in'], 'a'.repeat(254)])('rejects missing/invalid hostname headers (%#)', async (hostname) => {
    const req = request({ ...validHeaders(), 'x-gemba-tenant-hostname': hostname });
    await expect(guard.canActivate(context(req))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(resolve).not.toHaveBeenCalled();
    expect(req.tenant).toBeUndefined();
  });

  it('uses only the authenticated hostname header, ignoring unrelated forwarding headers', async () => {
    const req = request({ ...validHeaders(), 'x-forwarded-host': 'beta.gembapms.co.in', 'x-tenant-id': 'beta-id' });
    await guard.canActivate(context(req));
    expect(resolve).toHaveBeenCalledWith('acme.gembapms.co.in');
    expect(req.tenant).toEqual(tenant);
  });

  it.each([
    new NotFoundException('Invalid or unknown company'),
    new ForbiddenException('Company inactive'),
    new Error('Database unavailable'),
  ])('propagates resolver failures without attaching tenant context (%#)', async (error) => {
    resolve.mockRejectedValue(error);
    const req = request(validHeaders());
    await expect(guard.canActivate(context(req))).rejects.toBe(error);
    expect(req.tenant).toBeUndefined();
  });

  it('delegates malformed hostname rejection to the real resolver before querying the database', async () => {
    const findUnique = jest.fn();
    const resolver = new TenantResolverService(
      { organization: { findUnique } } as unknown as ConstructorParameters<typeof TenantResolverService>[0],
      { get: () => 'gembapms.co.in' } as unknown as ConfigService,
    );
    const integratedGuard = new TrustedTenantContextGuard(
      new Reflector(), resolver, { get: () => secret } as unknown as ConfigService,
    );
    const req = request({ ...validHeaders(), 'x-gemba-tenant-hostname': 'acme.gembapms.co.in.evil.com' });
    await expect(integratedGuard.canActivate(context(req))).rejects.toBeInstanceOf(NotFoundException);
    expect(findUnique).not.toHaveBeenCalled();
    expect(req.tenant).toBeUndefined();
  });

  it.each([undefined, '', 'a'.repeat(63), `${secret} `, `${secret}\n`, 'a'.repeat(1025), 123])('rejects invalid secret configuration (%#)', (value) => {
    expect(() => new TrustedTenantContextGuard(
      new Reflector(), { resolveCompanyHostname: resolve } as unknown as TenantResolverService,
      { get: () => value } as unknown as ConfigService,
    )).toThrow('TENANT_PROXY_SECRET');
  });

  it('accepts and verifies a secret at the maximum supported length', async () => {
    const longSecret = 'a'.repeat(1024);
    const configuredGuard = new TrustedTenantContextGuard(
      new Reflector(), { resolveCompanyHostname: resolve } as unknown as TenantResolverService,
      { get: () => longSecret } as unknown as ConfigService,
    );
    await expect(configuredGuard.canActivate(context(request({
      ...validHeaders(), 'x-gemba-proxy-secret': longSecret,
    })))).resolves.toBe(true);
  });
});
