import 'reflect-metadata';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication, RequestMethod } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { PrismaModule } from '../prisma/prisma.module';
import { TenancyModule } from './tenancy.module';
import { TenantGuard } from './tenant.guard';
import { TrustedTenantContextGuard } from './trusted-tenant-context.guard';
import { TENANT_REQUIRED_KEY } from './tenant-route.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtStrategy } from '../auth/jwt.strategy';
import { Role } from '../common/enum/role.enum';
import { OrgStatus } from 'db';
import request from 'supertest';

// Discover controllers so future business endpoints must opt into tenant guards.
function controllerFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? controllerFiles(path) : entry.name.endsWith('.controller.ts') ? [path] : [];
  });
}
const platformOrPublic = new Set(['auth', 'auth/company', 'organizations', 'onboarding', 'operations', '/']);
const controllers = controllerFiles(join(__dirname, '..')).flatMap(file => Object.values(require(file)))
  .filter((value: any) => typeof value === 'function' && Reflect.hasMetadata(PATH_METADATA, value)) as any[];
const business = controllers.filter(controller => !platformOrPublic.has(Reflect.getMetadata(PATH_METADATA, controller)));
const routes = business.flatMap(controller => Object.getOwnPropertyNames(controller.prototype).flatMap(name => {
  const handler = controller.prototype[name];
  if (!Reflect.hasMetadata(METHOD_METADATA, handler)) return [];
  const prefix = Reflect.getMetadata(PATH_METADATA, controller);
  const path = Reflect.getMetadata(PATH_METADATA, handler);
  if (prefix === 'dwms' && path === 'status') return [];
  const guards = [...(Reflect.getMetadata(GUARDS_METADATA, controller) ?? []), ...(Reflect.getMetadata(GUARDS_METADATA, handler) ?? [])];
  return [{ controller, handler, guards, prefix, path, name }];
}));

describe('Business route tenant coverage', () => {
  it.each(routes.map(route => [`${route.prefix}/${route.path}`, route] as const))('%s requires tenant resolution before authentication/authorization', (_, route) => {
    const marked = Reflect.getMetadata(TENANT_REQUIRED_KEY, route.handler) ?? Reflect.getMetadata(TENANT_REQUIRED_KEY, route.controller);
    expect(marked).toBe(true);
    expect(route.guards[0]).toBe(TrustedTenantContextGuard);
    if (route.prefix === 'dwms' && route.path.startsWith('auth/')) return;
    expect(route.guards.slice(0, 3)).toEqual([TrustedTenantContextGuard, JwtAuthGuard, TenantGuard]);
    // Reauthenticating after membership would restore stale JWT permissions.
    expect(route.guards.slice(3)).not.toContain(JwtAuthGuard);
  });
});

describe('Business HTTP tenant boundary', () => {
  let app: INestApplication;
  const secret = 'test-business-jwt-secret';
  const proxySecret = 'b'.repeat(64);
  const oldSecret = process.env.JWT_SECRET;
  const jwt = new JwtService({ secret, signOptions: { expiresIn: '5m' } });
  const calls = jest.fn().mockResolvedValue({ ok: true });
  const prisma = {
    organization: { findUnique: jest.fn().mockResolvedValue({ id: 'org-one', slug: 'acme', name: 'Acme', status: OrgStatus.ACTIVE, modules: [], isAdminOrg: false }) },
    userOrganization: { findUnique: jest.fn() },
  };
  const samples = business.map(controller => routes.find(route => route.controller === controller && !route.path.startsWith('auth/'))!).filter(Boolean);

  beforeAll(async () => {
    process.env.JWT_SECRET = secret;
    const dependencies = [...new Set(business.flatMap(controller => Reflect.getMetadata('design:paramtypes', controller) ?? []))];
    const providers = dependencies.filter(dependency => dependency !== PrismaService).map((dependency: any) => ({
      provide: dependency,
      useValue: new Proxy({}, { get: (_, name) => ['then', 'onModuleInit', 'onApplicationBootstrap', 'onModuleDestroy', 'beforeApplicationShutdown', 'onApplicationShutdown'].includes(String(name)) ? undefined : calls }),
    }));
    const module = await Test.createTestingModule({
      imports: [ConfigModule, PrismaModule, TenancyModule], controllers: business,
      providers: [...providers, JwtStrategy],
    }).overrideProvider(PrismaService).useValue(prisma)
      .overrideProvider(ConfigService).useValue(new ConfigService({ TENANT_BASE_DOMAIN: 'gembapms.co.in', TENANT_PROXY_SECRET: proxySecret }))
      .compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
    if (oldSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = oldSecret;
  });
  beforeEach(() => {
    calls.mockClear();
    prisma.userOrganization.findUnique.mockResolvedValue({ roleId: 2, role: { name: Role.ADMIN }, organization: { status: OrgStatus.ACTIVE, isAdminOrg: false } });
  });

  function token(organizationId: string) {
    return jwt.sign({ tokenType: 'ACCESS', userId: 'user-one', organizationId, roleId: 2, roleLevel: Role.ADMIN, email: null, isAdminOrg: false });
  }
  function send(route: typeof samples[number], organizationId: string) {
    const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, route.handler)].toLowerCase();
    const path = `/${route.prefix}/${route.path}`.replace(/\/+$/, '').replace(/:[^/]+/g, 'record-one');
    return (request(app.getHttpServer()) as any)[method](path)
      .set('x-gemba-proxy-secret', proxySecret).set('x-gemba-tenant-hostname', 'acme.gembapms.co.in')
      .set('Authorization', `Bearer ${token(organizationId)}`);
  }

  it.each(samples.map(route => [route.prefix, route] as const))('%s rejects a valid JWT for another company', async (_, route) => {
    await send(route, 'org-two').expect(403);
    expect(calls).not.toHaveBeenCalled();
  });

  it('rejects revoked membership before department access', async () => {
    prisma.userOrganization.findUnique.mockResolvedValue(null);
    await send(samples.find(route => route.prefix === 'departments')!, 'org-one').expect(403);
    expect(calls).not.toHaveBeenCalled();
  });

  it('permits a matching company and current role through the complete HTTP guard chain', async () => {
    const route = routes.find(route => route.prefix === 'departments' && route.name === 'getDepartments')!;
    await send(route, 'org-one').expect(200);
    expect(calls).toHaveBeenCalledWith('org-one');
  });
});
