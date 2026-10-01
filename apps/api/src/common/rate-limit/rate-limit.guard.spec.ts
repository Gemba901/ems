import 'reflect-metadata';
import { Controller, INestApplication, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AUTH_LIMITS } from '../../auth/auth-rate-limits';
import { clientIp } from './client-ip';
import { RateLimit, RateLimitGuard } from './rate-limit.guard';
import { RateLimitService, TooManyRequestsException } from './rate-limit.service';

// In-memory stand-in with the same contract as the Postgres service.
class FakeRateLimitService {
  readonly calls: string[] = [];
  private readonly counts = new Map<string, number>();
  async consume(key: string, max: number) {
    this.calls.push(key);
    const count = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, count);
    if (count > max) throw new TooManyRequestsException(42);
  }
}

@Controller('auth')
class ProbeController {
  @Post('login')
  @RateLimit(...AUTH_LIMITS.login)
  login() { return { ok: true }; }

  @Post('forgot-password')
  @RateLimit(...AUTH_LIMITS.forgotPassword)
  forgot() { return { ok: true }; }
}

describe('RateLimitGuard over HTTP', () => {
  let app: INestApplication;
  let limits: FakeRateLimitService;

  beforeEach(async () => {
    limits = new FakeRateLimitService();
    const moduleRef = await Test.createTestingModule({
      controllers: [ProbeController],
      providers: [RateLimitGuard, { provide: RateLimitService, useValue: limits }],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });
  afterEach(() => app.close());

  const login = (body: object, ip = '203.0.113.7', host?: string) => {
    const call = request(app.getHttpServer()).post('/auth/login').set('x-gemba-client-ip', ip);
    if (host) call.set('x-gemba-tenant-hostname', host);
    return call.send(body);
  };

  it('locks one account after 10 attempts, whatever IP the attempts come from', async () => {
    for (let i = 0; i < 10; i++) await login({ phoneOrEmail: 'Ann@Example.com' }, `203.0.113.${i}`).expect(201);
    const blocked = await login({ phoneOrEmail: 'ann@example.com ' }, '198.51.100.9').expect(429);
    expect(blocked.headers['retry-after']).toBe('42');
    await login({ phoneOrEmail: 'bob@example.com' }, '198.51.100.9').expect(201);
  });

  it('treats phone-number variants as the same account', async () => {
    for (const phone of ['0712345678', '+254712345678', '254 712 345 678', '0712-345-678', '712345678']) await login({ phoneOrEmail: phone }).expect(201);
    for (let i = 0; i < 5; i++) await login({ phoneOrEmail: '0712345678' }).expect(201);
    await login({ phoneOrEmail: '+254712345678' }).expect(429);
  });

  it('keeps the same account on different companies in separate buckets', async () => {
    for (let i = 0; i < 10; i++) await login({ employeeCode: 'E1' }, undefined, 'acme.example.test').expect(201);
    await login({ employeeCode: 'E1' }, undefined, 'acme.example.test').expect(429);
    await login({ employeeCode: 'E1' }, undefined, 'other.example.test').expect(201);
  });

  it('buckets by the forwarded client IP, not the socket', async () => {
    await login({}, '203.0.113.7');
    await login({}, '198.51.100.1');
    expect(limits.calls).toEqual(['login:ip:203.0.113.7', 'login:ip:198.51.100.1']);
  });

  it('limits password-reset requests per email', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer()).post('/auth/forgot-password').set('x-gemba-client-ip', `203.0.113.${i}`).send({ email: 'ann@example.com' }).expect(201);
    }
    await request(app.getHttpServer()).post('/auth/forgot-password').send({ email: 'ANN@example.com' }).expect(429);
  });
});

describe('clientIp', () => {
  it('uses the proxy-forwarded address when it is a valid IP', () => {
    expect(clientIp({ headers: { 'x-gemba-client-ip': '2001:db8::1' }, ip: '10.0.0.1' })).toBe('2001:db8::1');
  });
  it.each([undefined, 'not-an-ip', ['203.0.113.7'], '203.0.113.7, 10.0.0.2'])('falls back to the socket for %p', (value) => {
    expect(clientIp({ headers: { 'x-gemba-client-ip': value }, ip: '10.0.0.1' })).toBe('10.0.0.1');
  });
});
