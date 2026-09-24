import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import * as bcrypt from 'bcrypt';
jest.mock('bcrypt');

describe('Verified account setup', () => {
  const user = {
    id: 'user',
    name: 'User',
    email: 'user@example.test',
    password: null,
    organizations: [],
  };
  const jwt = new JwtService({ secret: 'test-account-setup' });
  let db: any;
  let service: AuthService;
  beforeEach(() => {
    db = {
      user: {
        findFirst: jest.fn().mockResolvedValue(user),
        findUnique: jest.fn().mockResolvedValue(user),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      passwordResetToken: {
        findUnique: jest
          .fn()
          .mockResolvedValue({
            userId: user.id,
            usedAt: null,
            expiresAt: new Date(Date.now() + 60000),
          }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      refreshToken: { deleteMany: jest.fn() },
    };
    db.$transaction = jest.fn(async (callback: any) => callback(db));
    service = new AuthService(
      db,
      jwt,
      new ConfigService(),
      { send: jest.fn() } as any,
      { get: jest.fn().mockResolvedValue(undefined), set: jest.fn() } as any,
    );
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed');
  });
  // Temporary: identifier lookup issues a setup token until employee invitations
  // replace it (infra/company-onboarding/security.md, item 11).
  it('identifier lookup issues a first-time setup token for passwordless accounts', async () => {
    const result = await service.verifyFirstTimeUser(user.email);
    expect(result).toMatchObject({ hasPassword: false });
    expect(result).toHaveProperty('setupToken');
  });
  it('first-time setup tokens only set a password that is still empty', async () => {
    await service.createPassword(
      jwt.sign({ userId: user.id, purpose: 'FIRST_TIME_SETUP' }),
      'new-password',
    );
    expect(db.user.updateMany).toHaveBeenCalledWith({
      where: { id: user.id, password: null },
      data: { password: 'hashed' },
    });
  });
  it('reset replay losing atomic consumption cannot update a password', async () => {
    await expect(
      service.resetPassword('secret', 'new-password', 'test'),
    ).rejects.toMatchObject({ status: 401 });
    expect(db.user.update).not.toHaveBeenCalled();
    expect(db.refreshToken.deleteMany).not.toHaveBeenCalled();
  });
  it('temporary-password replay cannot clear an existing password', async () => {
    await expect(
      service.verifyTempPassword('secret', 'test'),
    ).rejects.toMatchObject({ status: 401 });
    expect(db.user.update).not.toHaveBeenCalled();
  });
  it('password setup uses a conditional null-password write', async () => {
    await service.createPassword(
      jwt.sign({ userId: user.id, purpose: 'PASSWORD_RESET_SETUP' }),
      'new-password',
    );
    expect(db.user.updateMany).toHaveBeenCalledWith({
      where: { id: user.id, password: null },
      data: { password: 'hashed' },
    });
  });
});
