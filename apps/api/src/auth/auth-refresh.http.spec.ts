import 'reflect-metadata';
import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../tenancy/platform-admin.guard';
import { TrustedTenantContextGuard } from '../tenancy/trusted-tenant-context.guard';
import { TenantGuard } from '../tenancy/tenant.guard';
import { SafeExceptionFilter } from '../operations/safe-exception.filter';

describe('Central refresh without a session', () => {
  let app: INestApplication;
  const refresh = jest.fn();
  let log: jest.SpyInstance;
  beforeAll(async () => {
    let builder = Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: { refresh } }],
    });
    // These guards belong to other routes, not the public refresh endpoint.
    for (const guard of [JwtAuthGuard, PlatformAdminGuard, TrustedTenantContextGuard, TenantGuard]) {
      builder = builder.overrideGuard(guard).useValue({ canActivate: () => true });
    }
    const module = await builder.compile();
    app = module.createNestApplication();
    app.useGlobalFilters(new SafeExceptionFilter());
    await app.init();
    log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterAll(async () => { log?.mockRestore(); await app?.close(); });
  it('returns one 401 response and does not log a spurious server error', async () => {
    const response = await request(app.getHttpServer()).post('/auth/refresh').expect(401);
    expect(response.body.message).toBe('No refresh token');
    expect(response.headers['set-cookie']).toEqual(expect.arrayContaining([expect.stringContaining('refresh_token=;')]));
    expect(refresh).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });
});
