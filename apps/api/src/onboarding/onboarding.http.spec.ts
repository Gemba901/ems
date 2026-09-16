import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { OnboardingController } from './onboarding.controller';
import { OnboardingGuard } from './onboarding.guard';
import { OnboardingService } from './onboarding.service';

describe('Onboarding HTTP boundary', () => {
  let app: INestApplication;
  const secret = 's'.repeat(64);
  const handlers = { signup: jest.fn(), verify: jest.fn(), status: jest.fn(), retry: jest.fn(), resend: jest.fn() };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [OnboardingController], providers: [OnboardingGuard, { provide: ConfigService, useValue: new ConfigService({ ONBOARDING_ENABLED: 'true', TENANT_PROXY_SECRET: secret }) }, { provide: OnboardingService, useValue: handlers }] }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });
  afterAll(async () => { await app.close(); });
  it.each(['signup', 'verify', 'status', 'retry', 'resend'])('%s rejects direct calls without the proxy credential', async path => {
    await request(app.getHttpServer()).post(`/onboarding/${path}`).send({}).expect(401);
    expect(handlers[path as keyof typeof handlers]).not.toHaveBeenCalled();
  });
  it('validates the body before handing a trusted request to the service', async () => {
    await request(app.getHttpServer()).post('/onboarding/signup').set('x-gemba-proxy-secret', secret).send({ slug: 'acme' }).expect(400);
    expect(handlers.signup).not.toHaveBeenCalled();
  });
});
