import 'reflect-metadata';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Cache } from 'cache-manager';
import { createHash } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { OrgStatus, Prisma } from 'db';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../notifications/channels/email.service';
import { Role } from '../common/enum/role.enum';
import type { TenantContext } from '../tenancy/tenant-context';

jest.mock('bcrypt');

describe('Company authentication service', () => {
  const tenant = { organizationId: 'org-one', slug: 'acme', name: 'Acme' };
  const user = { id: 'user-one', name: 'User', email: 'user@example.com', phone: '254700000001', password: 'hashed' };
  const membership = {
    organizationId: tenant.organizationId, roleId: 2, role: { name: Role.ADMIN }, user,
    organization: { name: 'Acme', logoUrl: null, timeZone: 'Africa/Nairobi', isAdminOrg: false, status: OrgStatus.ACTIVE },
  };
  const raw = 'existing-refresh-token';
  const hash = (value: string) => createHash('sha256').update(value).digest('hex');
  const jwt = new JwtService({ secret: 'company-auth-test-secret', signOptions: { expiresIn: '7d' } });
  const delegates = () => ({
    employee: { findMany: jest.fn(), findFirst: jest.fn().mockResolvedValue(null) },
    user: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
    userOrganization: { findUnique: jest.fn().mockResolvedValue(membership), findMany: jest.fn() },
    refreshToken: { findUnique: jest.fn(), create: jest.fn().mockResolvedValue({}), deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
  });
  let db: ReturnType<typeof delegates> & { $transaction: jest.Mock };
  let tx: ReturnType<typeof delegates>;
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    tx = delegates();
    // Separate delegates catch accidental use of the root client during rotation.
    // This mock does not simulate PostgreSQL rollback or locking.
    db = { ...delegates(), $transaction: jest.fn().mockImplementation(async (callback) => callback(tx)) };
    db.user.findFirst.mockResolvedValue(user);
    db.user.findUnique.mockResolvedValue(user);
    db.user.findMany.mockResolvedValue([user]);
    db.employee.findMany.mockResolvedValue([{ userId: user.id }]);
    tx.refreshToken.findUnique.mockResolvedValue({
      tokenHash: hash(raw), userId: user.id, organizationId: tenant.organizationId,
      expiresAt: new Date(Date.now() + 60_000),
    });
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    service = new AuthService(db as unknown as PrismaService, jwt, new ConfigService(), {} as EmailService, {} as Cache);
  });

  it('limits first-time email discovery to active membership in this company', async () => {
    db.user.findFirst.mockResolvedValue({ ...user, organizations: [membership] });
    const result = await service.verifyFirstTimeForTenant(tenant, 'USER@example.com');
    expect(db.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: {
      email: user.email, organizations: { some: { organizationId: tenant.organizationId, organization: { status: OrgStatus.ACTIVE } } },
    } }));
    expect(result.organizations).toHaveLength(1);
  });

  it('scopes first-time employee-code lookup to this company', async () => {
    db.user.findUnique.mockResolvedValue({ ...user, organizations: [membership] });
    await service.verifyFirstTimeForTenant(tenant, undefined, 'EMP001');
    expect(db.employee.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: tenant.organizationId, employeeCode: 'EMP001' }) }));
  });

  it('rejects password setup without company membership', async () => {
    db.userOrganization.findUnique.mockResolvedValue(null);
    const token = jwt.sign({ userId: user.id, purpose: 'FIRST_TIME_SETUP' });
    await expect(service.createPasswordForTenant(tenant, token, 'new-password')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it('delegates valid company password setup and retains purpose checks', async () => {
    const setup = jest.spyOn(service, 'createPassword').mockResolvedValue({ message: 'created' });
    const token = jwt.sign({ userId: user.id, purpose: 'FIRST_TIME_SETUP' });
    await service.createPasswordForTenant(tenant, token, 'new-password');
    expect(setup).toHaveBeenCalledWith(token, 'new-password');
    setup.mockRestore();
    await expect(service.createPasswordForTenant(tenant, jwt.sign({ userId: user.id, tokenType: 'ACCESS' }), 'new-password')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  function expectNoIssuance() {
    expect(db.refreshToken.create).not.toHaveBeenCalled();
    expect(tx.refreshToken.create).not.toHaveBeenCalled();
  }

  it('scopes email login and persists a hashed refresh token for that company', async () => {
    const result = await service.loginForTenant(tenant, ' USER@example.com ', 'password');
    expect(db.user.findFirst).toHaveBeenCalledWith({ where: {
      email: user.email, organizations: { some: { organizationId: tenant.organizationId } },
    } });
    expect(db.userOrganization.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId_organizationId: { userId: user.id, organizationId: tenant.organizationId } },
    }));
    expect(jwt.verify(result.accessToken)).toMatchObject({ tokenType: 'ACCESS', organizationId: tenant.organizationId, roleLevel: Role.ADMIN });
    expect(result).not.toHaveProperty('selectionToken');
    expect(db.refreshToken.create).toHaveBeenCalledWith({ data: {
      tokenHash: hash(result.refreshToken), userId: user.id, organizationId: tenant.organizationId, expiresAt: expect.any(Date),
    } });
    expect(hash(result.refreshToken)).not.toBe(result.refreshToken);
  });

  it('scopes phone candidates to the company', async () => {
    await service.loginForTenant(tenant, '0700000001', 'password');
    expect(db.user.findMany).toHaveBeenCalledWith({ where: {
      phone: { in: expect.arrayContaining(['0700000001', '254700000001']) },
      organizations: { some: { organizationId: tenant.organizationId } },
    } });
  });

  it('scopes employee codes and still checks membership', async () => {
    db.userOrganization.findUnique.mockResolvedValue(null);
    await expect(service.loginForTenant(tenant, undefined, 'password', ' EMP001 ')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(db.employee.findMany).toHaveBeenCalledWith({
      where: { employeeCode: 'EMP001', userId: { not: null }, organizationId: tenant.organizationId }, select: { userId: true },
    });
    expectNoIssuance();
  });

  it('rejects an employee code not found in the company', async () => {
    db.employee.findMany.mockResolvedValue([]);
    await expect(service.loginForTenant(tenant, undefined, 'password', 'EMP001')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expectNoIssuance();
  });

  it.each(['unknown', 'unset-password', 'wrong-password', 'missing-identifier'])('rejects %s without issuing tokens', async (scenario) => {
    if (scenario === 'unknown') db.user.findFirst.mockResolvedValue(null);
    if (scenario === 'unset-password') db.user.findFirst.mockResolvedValue({ ...user, password: null });
    if (scenario === 'wrong-password') (bcrypt.compare as jest.Mock).mockResolvedValue(false);
    await expect(service.loginForTenant(tenant, scenario === 'missing-identifier' ? undefined : user.email, 'password')).rejects.toBeInstanceOf(UnauthorizedException);
    expectNoIssuance();
  });

  it.each(['missing', OrgStatus.INACTIVE, OrgStatus.SUSPENDED, 'bad-role'])('denies login for membership state %s', async (state) => {
    db.userOrganization.findUnique.mockResolvedValue(state === 'missing' ? null : {
      ...membership,
      organization: { ...membership.organization, status: state === 'bad-role' ? OrgStatus.ACTIVE : state },
      role: { name: state === 'bad-role' ? 'UNKNOWN' : Role.ADMIN },
    });
    await expect(service.loginForTenant(tenant, user.email, 'password')).rejects.toBeInstanceOf(UnauthorizedException);
    expectNoIssuance();
  });

  it('preserves central organization selection', async () => {
    db.userOrganization.findMany.mockResolvedValue([membership, { ...membership, organizationId: 'org-two' }]);
    const result = await service.login(user.email, 'password');
    expect(result).toMatchObject({ requiresOrgSelection: true, organizations: [{ id: 'org-one' }, { id: 'org-two' }] });
    expect(db.user.findFirst).toHaveBeenCalledWith({ where: { email: user.email } });
    expectNoIssuance();
  });

  it('fails closed without company context for login and refresh', async () => {
    await expect(service.loginForTenant(undefined as unknown as TenantContext, user.email, 'password')).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.refreshForTenant(undefined as unknown as TenantContext, raw)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.user.findFirst).not.toHaveBeenCalled();
  });

  it('rotates with the transaction client and current permissions', async () => {
    tx.userOrganization.findUnique.mockResolvedValue({ ...membership, roleId: 6, role: { name: Role.EMPLOYEE } });
    const result = await service.refreshForTenant(tenant, raw);
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    expect(tx.refreshToken.deleteMany).toHaveBeenCalledWith({ where: {
      tokenHash: hash(raw), userId: user.id, organizationId: tenant.organizationId, expiresAt: { gt: expect.any(Date) },
    } });
    expect(tx.refreshToken.create).toHaveBeenCalledWith({ data: {
      tokenHash: hash(result.refreshToken), userId: user.id, organizationId: tenant.organizationId, expiresAt: expect.any(Date),
    } });
    expect(jwt.verify(result.accessToken)).toMatchObject({ organizationId: tenant.organizationId, roleId: 6, roleLevel: Role.EMPLOYEE });
    expect(tx.refreshToken.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(tx.refreshToken.create.mock.invocationCallOrder[0]);
    expect(db.employee.findFirst).not.toHaveBeenCalled();
    expect(db.refreshToken.create).not.toHaveBeenCalled();
    expect(result.refreshToken).not.toBe(raw);
  });

  it('rejects another company before membership lookup or token consumption', async () => {
    await expect(service.refreshForTenant({ ...tenant, organizationId: 'org-two' }, raw)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(tx.userOrganization.findUnique).not.toHaveBeenCalled();
    expect(tx.refreshToken.deleteMany).not.toHaveBeenCalled();
    expectNoIssuance();
  });

  it.each(['missing', 'expired'])('rejects %s refresh tokens', async (state) => {
    tx.refreshToken.findUnique.mockResolvedValue(state === 'missing' ? null : {
      organizationId: tenant.organizationId, expiresAt: new Date(0),
    });
    await expect(service.refreshForTenant(tenant, raw)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(tx.refreshToken.deleteMany).not.toHaveBeenCalled();
    expectNoIssuance();
  });

  it.each(['', '   ', undefined, 123])('rejects malformed refresh input (%#)', async (value) => {
    await expect(service.refreshForTenant(tenant, value as string)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it.each(['missing', OrgStatus.INACTIVE, OrgStatus.SUSPENDED, 'bad-role'])('denies refresh for membership state %s', async (state) => {
    tx.userOrganization.findUnique.mockResolvedValue(state === 'missing' ? null : {
      ...membership,
      organization: { ...membership.organization, status: state === 'bad-role' ? OrgStatus.ACTIVE : state },
      role: { name: state === 'bad-role' ? 'UNKNOWN' : Role.ADMIN },
    });
    await expect(service.refreshForTenant(tenant, raw)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(tx.refreshToken.deleteMany).not.toHaveBeenCalled();
    expectNoIssuance();
  });

  it('does not issue a replacement when another request has consumed the token', async () => {
    tx.refreshToken.deleteMany.mockResolvedValue({ count: 0 });
    await expect(service.refreshForTenant(tenant, raw)).rejects.toBeInstanceOf(UnauthorizedException);
    expectNoIssuance();
  });

  it('propagates replacement failure out of the transaction callback', async () => {
    const error = new Error('Insert failed');
    tx.refreshToken.create.mockRejectedValue(error);
    await expect(service.refreshForTenant(tenant, raw)).rejects.toBe(error);
    expect(tx.refreshToken.deleteMany).toHaveBeenCalledTimes(1);
    // Actual restoration of the deleted row requires a PostgreSQL integration test.
    expect(db.refreshToken.create).not.toHaveBeenCalled();
  });

  it('does not return tokens if transaction commit fails', async () => {
    const error = new Error('Commit failed');
    db.$transaction.mockImplementation(async (callback) => { await callback(tx); throw error; });
    await expect(service.refreshForTenant(tenant, raw)).rejects.toBe(error);
  });

  it('retains central refresh using the stored organization', async () => {
    const result = await service.refresh(raw);
    expect(jwt.verify(result.accessToken)).toMatchObject({ organizationId: tenant.organizationId });
  });

  it('excludes suspended companies from central organization selection', async () => {
    db.userOrganization.findMany.mockResolvedValue([membership, {
      ...membership, organizationId: 'org-two', organization: { ...membership.organization, status: OrgStatus.SUSPENDED },
    }]);
    const result = await service.login(user.email, 'password');
    expect(result).not.toHaveProperty('selectionToken');
    expect(result).toHaveProperty('accessToken');
  });

  it.each([OrgStatus.SUSPENDED, OrgStatus.INACTIVE])('rejects central selection of a company with status %s', async (status) => {
    db.userOrganization.findUnique.mockResolvedValue({ ...membership, organization: { ...membership.organization, status } });
    const selection = jwt.sign({ userId: user.id, purpose: 'ORG_SELECTION' });
    await expect(service.selectOrg(selection, tenant.organizationId)).rejects.toBeInstanceOf(UnauthorizedException);
    expectNoIssuance();
  });

  it('scopes logout revocation to the current company', async () => {
    await service.revokeRefreshTokenForTenant(tenant, raw);
    expect(db.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { tokenHash: hash(raw), organizationId: tenant.organizationId } });
  });
});
