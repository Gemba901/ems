import 'reflect-metadata';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Controller, Get, INestApplication, Post } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { PUBLIC_HEALTH_KEY, PublicHealth } from '../decorators/public-health.decorator';
import { ProxySecretGuard } from './proxy-secret.guard';

const secret = 'p'.repeat(64);

@Controller()
class ProbeController {
  @Get()
  @PublicHealth()
  health() { return 'ok'; }

  @Post('auth/login')
  login() { return { ok: true }; }
}

describe('ProxySecretGuard over HTTP', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ ignoreEnvFile: true, load: [() => ({ TENANT_PROXY_SECRET: secret })] })],
      controllers: [ProbeController],
      providers: [{ provide: APP_GUARD, useClass: ProxySecretGuard }],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });
  afterAll(() => app.close());

  it('rejects a direct call with no proxy secret', () =>
    request(app.getHttpServer()).post('/auth/login').expect(401));

  it('rejects a wrong proxy secret', () =>
    request(app.getHttpServer()).post('/auth/login').set('x-gemba-proxy-secret', 'q'.repeat(64)).expect(401));

  it('rejects an oversized proxy secret', () =>
    request(app.getHttpServer()).post('/auth/login').set('x-gemba-proxy-secret', 'p'.repeat(2048)).expect(401));

  it('accepts the proxy secret', () =>
    request(app.getHttpServer()).post('/auth/login').set('x-gemba-proxy-secret', secret).expect(201));

  it('leaves the health check open', () =>
    request(app.getHttpServer()).get('/').expect(200));
});

describe('ProxySecretGuard configuration', () => {
  const config = (value: unknown) => ({ get: () => value }) as any;

  it.each([undefined, '', 'short', `${'x'.repeat(64)} `, 'x'.repeat(1025)])(
    'refuses to start with an unsuitable secret (%p)',
    (value) => expect(() => new ProxySecretGuard({} as any, config(value))).toThrow(/TENANT_PROXY_SECRET/),
  );
});

// Discover every controller so new routes can't quietly opt out.
function controllerFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? controllerFiles(path) : entry.name.endsWith('.controller.ts') ? [path] : [];
  });
}

describe('Proxy secret route coverage', () => {
  it('is registered as a global guard in AppModule', () => {
    const { AppModule } = require('../../app.module');
    const providers: any[] = Reflect.getMetadata('providers', AppModule) ?? [];
    expect(providers).toContainEqual({ provide: APP_GUARD, useClass: ProxySecretGuard });
  });

  it('exempts only the health check', () => {
    const controllers = controllerFiles(join(__dirname, '..', '..'))
      .flatMap(file => Object.values(require(file)))
      .filter((value: any) => typeof value === 'function' && Reflect.hasMetadata(PATH_METADATA, value)) as any[];

    const exempt = controllers.flatMap(controller => {
      if (Reflect.getMetadata(PUBLIC_HEALTH_KEY, controller)) return [`${controller.name} (whole controller)`];
      return Object.getOwnPropertyNames(controller.prototype)
        .filter(name => Reflect.hasMetadata(METHOD_METADATA, controller.prototype[name]))
        .filter(name => Reflect.getMetadata(PUBLIC_HEALTH_KEY, controller.prototype[name]))
        .map(name => `${controller.name}.${name}`);
    });

    expect(exempt).toEqual(['AppController.getHello']);
  });
});
