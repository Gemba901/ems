import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../tenancy/platform-admin.guard';
import { OperationsController } from './operations.controller';
import { ScheduledJobsService } from './scheduled-jobs.service';
import { ReadinessService } from './readiness.service';
import { requestLogging } from './request-logging';
import { SafeExceptionFilter } from './safe-exception.filter';
describe('Operational boundaries', () => {
  it('protects diagnostics and cross-company support downloads with current platform membership', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, OperationsController)).toEqual([
      JwtAuthGuard,
      PlatformAdminGuard,
    ]);
  });
  it('does not run business jobs by default', async () => {
    const db = { $queryRaw: jest.fn() };
    const work = jest.fn();
    await new ScheduledJobsService(db as any, new ConfigService()).run(
      'job',
      'window',
      work,
    );
    expect(work).not.toHaveBeenCalled();
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });
  it('reports a blocked readiness check without leaking database errors', async () => {
    const service = new ReadinessService(
      {
        $queryRaw: jest.fn().mockRejectedValue(new Error('postgres://secret')),
      } as any,
      new ConfigService(),
      {
        storageReadiness: async () => ({ checked: false, private: false }),
      } as any,
    );
    const result = await service.inspect();
    expect(result.readyForManualTests).toBe(false);
    expect(JSON.stringify(result)).not.toContain('postgres://');
  });
  it('blocks a bypass role and failed work even when storage and migrations are ready', async () => {
    const db = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([
          { database: 'staging', superuser: false, bypassRls: true },
        ])
        .mockResolvedValueOnce([
          {
            table: 'FileAsset',
            rls: true,
            forced: true,
            owner: false,
            policies: 1,
          },
        ]),
      organization: { findMany: async () => [] },
      onboardingRequest: { count: async () => 1 },
      onboardingMessage: { count: async () => 1 },
      scheduledJobRun: {
        findMany: async () => [{ failedAt: new Date(), completedAt: null }],
      },
    };
    const result = await new ReadinessService(
      db as any,
      new ConfigService({ EXPECTED_DATABASE_NAME: 'staging' }),
      {
        storageReadiness: async () => ({ checked: true, private: true }),
      } as any,
    ).inspect();
    expect(result.readyForManualTests).toBe(false);
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        expect.stringContaining('bypasses RLS'),
        expect.stringContaining('failed onboarding'),
        expect.stringContaining('failed scheduled'),
      ]),
    );
  });
  it('logs denied requests without query strings, cookies or request bodies', () => {
    const log = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const response = Object.assign(new EventEmitter(), {
      statusCode: 403,
      setHeader: jest.fn(),
    });
    requestLogging(
      {
        method: 'POST',
        url: '/auth/reset?token=private',
        body: { password: 'private-password' },
        route: { path: '/auth/reset' },
        tenant: { organizationId: 'org-one' },
      } as any,
      response as any,
      jest.fn(),
    );
    response.emit('finish');
    const record = JSON.parse(log.mock.calls[0][0]);
    expect(record).toMatchObject({
      status: 403,
      tenantId: 'org-one',
      route: '/auth/reset',
    });
    expect(JSON.stringify(record)).not.toContain('private');
    log.mockRestore();
  });
  it('does not expose unexpected exception details in responses or logs', () => {
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const response: any = {
      getHeader: () => 'request-one',
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    new SafeExceptionFilter().catch(new Error('password=secret'), {
      switchToHttp: () => ({ getResponse: () => response }),
    } as any);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 500,
      message: 'Internal server error',
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret');
    log.mockRestore();
  });
});
