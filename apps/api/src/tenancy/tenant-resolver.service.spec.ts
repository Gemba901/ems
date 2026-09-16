import 'reflect-metadata';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { OrgStatus } from 'db';
import { PrismaService } from '../prisma/prisma.service';
import { TenantResolverService } from './tenant-resolver.service';
import { TenancyModule } from './tenancy.module';
import { TrustedTenantContextGuard } from './trusted-tenant-context.guard';
import { TenantGuard } from './tenant.guard';

describe('TenantResolverService', () => {
  const organization = { id: 'org-one', slug: 'acme', name: 'Acme', status: OrgStatus.ACTIVE };
  let findUnique: jest.Mock;
  let service: TenantResolverService;
  beforeEach(() => {
    findUnique = jest.fn().mockResolvedValue(organization);
    service = new TenantResolverService(
      { organization: { findUnique } } as unknown as PrismaService,
      new ConfigService({ TENANT_BASE_DOMAIN: 'GEMBAPMS.CO.IN' }),
    );
  });
  it('looks up the normalized unique slug and returns only tenant context', async () => {
    await expect(service.resolveCompanyHostname('ACME.gembapms.co.in')).resolves.toEqual({
      organizationId: 'org-one', slug: 'acme', name: 'Acme',
    });
    expect(findUnique).toHaveBeenCalledWith({
      where: { slug: 'acme' }, select: { id: true, slug: true, name: true, status: true },
    });
  });
  it.each(['admin.gembapms.co.in', 'gembapms.co.in', 'acme.other.org', 'acme.gembapms.co.in.evil.com'])('rejects %s without querying the database', async (hostname) => {
    await expect(service.resolveCompanyHostname(hostname)).rejects.toBeInstanceOf(NotFoundException);
    expect(findUnique).not.toHaveBeenCalled();
  });
  it('returns 404 for unknown companies', async () => {
    findUnique.mockResolvedValue(null);
    await expect(service.resolveCompanyHostname('acme.gembapms.co.in')).rejects.toBeInstanceOf(NotFoundException);
  });
  it.each([OrgStatus.SUSPENDED, OrgStatus.INACTIVE])('denies status %s', async (status) => {
    findUnique.mockResolvedValue({ ...organization, status });
    await expect(service.resolveCompanyHostname('acme.gembapms.co.in')).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('checks status again on the next lookup', async () => {
    await service.resolveCompanyHostname('acme.gembapms.co.in');
    findUnique.mockResolvedValue({ ...organization, status: OrgStatus.SUSPENDED });
    await expect(service.resolveCompanyHostname('acme.gembapms.co.in')).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('preserves database failures', async () => {
    const error = new Error('Database unavailable');
    findUnique.mockRejectedValue(error);
    await expect(service.resolveCompanyHostname('acme.gembapms.co.in')).rejects.toBe(error);
  });
});

describe('TenancyModule wiring and initialization', () => {
  const prisma = { organization: { findUnique: jest.fn() } };
  function builder(domain: string | undefined, secret: string | undefined = 'a'.repeat(64)) {
    return Test.createTestingModule({ imports: [TenancyModule] })
      .overrideProvider(PrismaService).useValue(prisma)
      .overrideProvider(ConfigService).useValue({
        get: (key: string) => key === 'TENANT_BASE_DOMAIN' ? domain :
          key === 'TENANT_PROXY_SECRET' ? secret : undefined,
      });
  }
  it('initializes and exports the resolver with valid configuration', async () => {
    const module = await builder('gembapms.co.in').compile();
    try {
      await module.init();
      expect(module.get(TenantResolverService)).toBeInstanceOf(TenantResolverService);
      expect(module.get(TrustedTenantContextGuard)).toBeInstanceOf(TrustedTenantContextGuard);
      expect(module.get(TenantGuard)).toBeInstanceOf(TenantGuard);
    } finally {
      await module.close();
    }
  });
  it.each([undefined, '', 'https://gembapms.co.in', 'gembapms.co.in/path', 'gembapms.co.in:443', ' gembapms.co.in'])('fails initialization with invalid domain %s', async (domain) => {
    await expect(builder(domain).compile()).rejects.toThrow('TENANT_BASE_DOMAIN must be a valid hostname');
  });
  it.each(['', 'short', 'a'.repeat(1025)])('fails initialization with invalid proxy secret', async (secret) => {
    await expect(builder('gembapms.co.in', secret).compile()).rejects.toThrow('TENANT_PROXY_SECRET');
  });
});
