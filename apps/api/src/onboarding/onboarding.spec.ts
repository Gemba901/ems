import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { OnboardingGuard } from './onboarding.guard';
import { SignupDto } from './onboarding.dto';
import { OnboardingService, backoff, digest } from './onboarding.service';
import { WorkspaceDomainService } from './workspace-domain.service';

const secret = 'x'.repeat(64);
const context = (provided: unknown, name = 'signup') =>
  ({
    getHandler: () => ({ name }),
    switchToHttp: () => ({
      getRequest: () => ({ headers: { 'x-gemba-proxy-secret': provided } }),
    }),
  }) as any;
describe('Onboarding public boundary', () => {
  it('is disabled by default', () => {
    expect(() =>
      new OnboardingGuard(new ConfigService()).canActivate(context(secret)),
    ).toThrow();
  });
  it.each([undefined, 'wrong', [secret], 'x'.repeat(1025)])(
    'rejects invalid proxy credentials %p',
    (provided) => {
      expect(() =>
        new OnboardingGuard(
          new ConfigService({
            ONBOARDING_ENABLED: 'true',
            TENANT_PROXY_SECRET: secret,
          }),
        ).canActivate(context(provided)),
      ).toThrow();
    },
  );
  it('permits accepted verification while new signup is paused', () => {
    const guard = new OnboardingGuard(
      new ConfigService({
        ONBOARDING_WORKER_ENABLED: 'true',
        TENANT_PROXY_SECRET: secret,
      }),
    );
    expect(guard.canActivate(context(secret, 'verify'))).toBe(true);
    expect(() => guard.canActivate(context(secret))).toThrow();
  });
  it('rejects privilege fields and invalid public input', async () => {
    const errors = await validate(
      plainToInstance(SignupDto, {
        isAdminOrg: true,
        modules: ['STEEL'],
        slug: 'x',
        requestKey: 'short',
      }),
      { whitelist: true, forbidNonWhitelisted: true },
    );
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining([
        'isAdminOrg',
        'modules',
        'slug',
        'requestKey',
        'email',
      ]),
    );
  });
  it('uses different capabilities for verification and progress', () => {
    const service = new OnboardingService(
      {} as any,
      new ConfigService({ ONBOARDING_TOKEN_SECRET: secret }),
      new WorkspaceDomainService(new ConfigService()),
    );
    expect(service.token('id', 'verify')).not.toBe(
      service.token('id', 'progress'),
    );
  });
  it('validates profile fields without requiring them for older clients', async () => {
    const base = {
      requestKey: 'a'.repeat(64),
      slug: 'company',
      companyName: 'Company',
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      phone: '+254712345678',
      timeZone: 'Africa/Nairobi',
    };
    expect(await validate(plainToInstance(SignupDto, base))).toHaveLength(0);
    const invalid = await validate(
      plainToInstance(SignupDto, {
        ...base,
        shortName: ' ',
        industry: ' ',
        companyEmail: 'wrong',
        companyPhone: 'abc',
        companyAddress: ' ',
      }),
    );
    expect(invalid.map((e) => e.property)).toEqual(
      expect.arrayContaining([
        'shortName',
        'industry',
        'companyEmail',
        'companyPhone',
        'companyAddress',
      ]),
    );
  });
  it('exposes safe real progress and only offers a retry for recoverable failures', async () => {
    const request = {
      id: 'id',
      requestKeyHash: digest('key'),
      status: 'PROVISIONING',
      provisioningStage: 'CHECKING_HTTPS',
      failureCode: 'PROVISIONING_FAILED',
      companyName: 'Acme',
      passwordHash: 'private',
      verificationHash: 'private',
    };
    const service = new OnboardingService(
      {
        onboardingRequest: { findUnique: jest.fn().mockResolvedValue(request) },
      } as any,
      new ConfigService(),
      {} as any,
    );
    const result = await service.status({ id: 'id', token: 'key' });
    expect(result).toEqual(
      expect.objectContaining({
        provisioningStage: 'CHECKING_HTTPS',
        retryScheduled: true,
        canRetry: false,
      }),
    );
    expect(result).not.toHaveProperty('passwordHash');
    expect(result).not.toHaveProperty('verificationHash');
    request.status = 'FAILED';
    expect((await service.status({ id: 'id', token: 'key' })).canRetry).toBe(
      true,
    );
    request.failureCode = 'DETAILS_CONFLICT';
    expect((await service.status({ id: 'id', token: 'key' })).canRetry).toBe(
      false,
    );
  });
  it('caps retry backoff', () => {
    expect(backoff(100)).toBe(3600000);
  });
});
