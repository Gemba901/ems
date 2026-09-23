import { ConfigService } from '@nestjs/config';
import { OnboardingService } from './onboarding.service';
import {
  WorkspaceDomainService,
  WorkspaceDomainError,
} from './workspace-domain.service';

describe('Onboarding domain readiness gate', () => {
  const claimed = {
    id: 'request-id',
    verifiedAt: new Date(),
    attempts: 1,
    requestedSlug: 'test-company',
    status: 'PROVISIONING',
    existingUserId: 'user-id',
    email: 'test@example.com',
    shortName: 'SFL',
    industry: 'Food & Beverage',
    companyEmail: 'office@example.com',
    companyPhone: '+254712345678',
    companyAddress: 'Nairobi',
  };
  function fixture(domainFailure?: Error, attempts = 1) {
    const row = { ...claimed, attempts };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: row.id }]),
      onboardingRequest: {
        update: jest.fn().mockResolvedValue(row),
        findUniqueOrThrow: jest.fn().mockResolvedValue(row),
      },
      role: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 2 }) },
      user: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ id: 'user-id', email: row.email }),
      },
      organization: { create: jest.fn().mockResolvedValue({ id: 'org-id' }) },
      userOrganization: { create: jest.fn() },
      employee: { create: jest.fn() },
      onboardingMessage: { create: jest.fn() },
    };
    const db = {
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(tx)),
      onboardingRequest: { updateMany: jest.fn() },
    };
    const domains = {
      ensureReady: domainFailure
        ? jest.fn().mockRejectedValue(domainFailure)
        : jest.fn().mockResolvedValue(undefined),
    };
    const service = new OnboardingService(
      db as any,
      new ConfigService(),
      domains as unknown as WorkspaceDomainService,
    );
    return { service, db, tx, domains };
  }
  it('reports progress against the claimed attempt before creating company records', async () => {
    const { service, db, tx, domains } = fixture();
    domains.ensureReady.mockImplementation(
      async (_slug: string, report: (stage: string) => Promise<void>) => {
        await report('REGISTERING_DOMAIN');
        await report('CHECKING_HTTPS');
      },
    );
    await service.provisionOne();
    expect(
      db.onboardingRequest.updateMany.mock.calls.map(
        (call) => call[0].data.provisioningStage,
      ),
    ).toEqual(['REGISTERING_DOMAIN', 'CHECKING_HTTPS', 'CREATING_WORKSPACE']);
    expect(db.onboardingRequest.updateMany).toHaveBeenCalledWith({
      where: {
        id: claimed.id,
        status: 'PROVISIONING',
        attempts: claimed.attempts,
      },
      data: { provisioningStage: 'CREATING_WORKSPACE', failureCode: null },
    });
    expect(
      db.onboardingRequest.updateMany.mock.invocationCallOrder[2],
    ).toBeLessThan(tx.organization.create.mock.invocationCallOrder[0]);
  });
  it('does not create a company or welcome email before domain readiness', async () => {
    const { service, db, tx } = fixture(
      new WorkspaceDomainError('Workspace HTTPS login page not ready'),
    );
    await service.provisionOne();
    expect(tx.organization.create).not.toHaveBeenCalled();
    expect(tx.onboardingMessage.create).not.toHaveBeenCalled();
    expect(db.onboardingRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'PROVISIONING',
          failureCode: 'PROVISIONING_FAILED',
        }),
      }),
    );
  });
  it('keeps an exhausted domain failure eligible for the existing manual retry flow', async () => {
    const { service, db } = fixture(
      new WorkspaceDomainError('Vercel API HTTP 429'),
      5,
    );
    await service.provisionOne();
    expect(db.onboardingRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'request-id', status: 'PROVISIONING', attempts: 5 },
        data: expect.objectContaining({
          status: 'FAILED',
          failureCode: 'PROVISIONING_FAILED',
        }),
      }),
    );
  });
  it('creates the company and queues welcome only after domain readiness succeeds', async () => {
    const { service, tx, domains } = fixture();
    await service.provisionOne();
    expect(domains.ensureReady).toHaveBeenCalledWith(
      'test-company',
      expect.any(Function),
    );
    expect(tx.organization.create).toHaveBeenCalledTimes(1);
    expect(tx.organization.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        shortName: 'SFL',
        industry: 'Food & Beverage',
        email: 'office@example.com',
        phone: '+254712345678',
        address: 'Nairobi',
      }),
    });
    expect(tx.onboardingMessage.create).toHaveBeenCalledWith({
      data: { requestId: claimed.id, kind: 'WELCOME' },
    });
    expect(tx.onboardingRequest.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'READY',
          organizationId: 'org-id',
        }),
      }),
    );
    expect(domains.ensureReady.mock.invocationCallOrder[0]).toBeLessThan(
      tx.organization.create.mock.invocationCallOrder[0],
    );
  });
});
