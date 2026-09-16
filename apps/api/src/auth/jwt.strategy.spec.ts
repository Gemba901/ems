import 'reflect-metadata';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import type { Request } from 'express';
import { Role } from '../common/enum/role.enum';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy authentication', () => {
  // Exercise Passport authentication, including cryptographic verification.
  // Calling validate() alone would not test signatures, expiry or algorithms.
  const secret = 'jwt-strategy-local-test-secret';
  const originalSecret = process.env.JWT_SECRET;
  const jwt = new JwtService({ secret });
  const claims = {
    tokenType: 'ACCESS', userId: 'user-one', organizationId: 'org-one',
    roleId: 2, roleLevel: Role.ADMIN, email: null, isAdminOrg: false,
  };

  beforeEach(() => { process.env.JWT_SECRET = secret; });
  afterEach(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });

  function sign(payload: Record<string, unknown> = claims, options: JwtSignOptions = { expiresIn: 60 }) {
    return jwt.sign(payload, options);
  }

  function authenticate(authorization?: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const strategy = new JwtStrategy();
      strategy.success = (user) => { resolve(user); };
      strategy.fail = () => { reject(new UnauthorizedException()); };
      strategy.error = reject;
      strategy.authenticate({ headers: { authorization } } as Request, {});
    });
  }

  it('accepts HS256 access tokens and exposes only authorization claims', async () => {
    const token = sign({ ...claims, phone: '254700000001', organizationName: 'Acme' });
    await expect(authenticate(`Bearer ${token}`)).resolves.toEqual(claims);
  });

  it.each([undefined, '', 'Basic credentials', 'Bearer not-a-jwt'])('rejects invalid authorization headers (%#)', async (header) => {
    await expect(authenticate(header)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a token signed with another secret', async () => {
    await expect(authenticate(`Bearer ${sign(claims, { secret: 'different-test-secret', expiresIn: 60 })}`))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects expired tokens through Passport', async () => {
    await expect(authenticate(`Bearer ${sign(claims, { expiresIn: -60 })}`))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects tokens before their not-before time', async () => {
    await expect(authenticate(`Bearer ${sign(claims, { expiresIn: 120, notBefore: 60 })}`))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a correctly signed token without an expiry', async () => {
    await expect(authenticate(`Bearer ${sign(claims, {})}`))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });

  it.each(['HS384', 'HS512'] as const)('rejects unsupported algorithm %s even with the right secret', async (algorithm) => {
    await expect(authenticate(`Bearer ${sign(claims, { algorithm, expiresIn: 60 })}`))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });

  it.each(['FIRST_TIME_SETUP', 'PASSWORD_RESET_SETUP', 'ORG_SELECTION'])('rejects signed %s tokens', async (purpose) => {
    const token = sign({ userId: claims.userId, purpose });
    await expect(authenticate(`Bearer ${token}`)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects mixed-purpose tokens even when they claim ACCESS', async () => {
    const token = sign({ ...claims, purpose: 'ORG_SELECTION' });
    await expect(authenticate(`Bearer ${token}`)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it.each(Object.keys(claims))('rejects signed payloads missing %s', async (key) => {
    const payload: Record<string, unknown> = { ...claims };
    delete payload[key];
    await expect(authenticate(`Bearer ${sign(payload)}`)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
