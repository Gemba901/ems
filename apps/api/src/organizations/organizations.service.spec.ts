import { BadRequestException, ConflictException } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { Prisma } from 'db';
import { PrismaService } from 'src/prisma/prisma.service';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto } from './dto/organizations.dto';

describe('OrganizationsService.create slug handling', () => {
  const dto: CreateOrganizationDto = {
    name: 'Acme Manufacturing', slug: ' ACME ',
    adminFirstName: 'Test', adminLastName: 'Admin',
    adminEmail: 'admin@example.test', adminPhone: '254700000001',
    gembaTeamUserIds: [],
  };
  const org = { id: 'org-one', name: dto.name, slug: 'acme' };
  let service: OrganizationsService;
  let prisma: {
    organization: { findFirst: jest.Mock };
    user: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let tx: {
    $executeRaw: jest.Mock;
    onboardingRequest: { findFirst: jest.Mock };
    organization: { create: jest.Mock; findUniqueOrThrow: jest.Mock };
    role: { findUniqueOrThrow: jest.Mock };
    user: { create: jest.Mock };
    userOrganization: { create: jest.Mock };
    employee: { create: jest.Mock };
  };
  beforeEach(() => {
    tx = {
      $executeRaw: jest.fn(),
      onboardingRequest: { findFirst: jest.fn().mockResolvedValue(null) },
      organization: { create: jest.fn().mockResolvedValue(org), findUniqueOrThrow: jest.fn().mockResolvedValue(org) },
      role: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 2 }) },
      user: { create: jest.fn().mockResolvedValue({ id: 'user-one' }) },
      userOrganization: { create: jest.fn().mockResolvedValue({}) },
      employee: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma = {
      organization: { findFirst: jest.fn().mockResolvedValue(null) },
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn().mockImplementation(async (callback) => callback(tx)),
    };
    service = new OrganizationsService(prisma as unknown as PrismaService, { del: jest.fn().mockResolvedValue(undefined) } as unknown as Cache);
  });
  it('preserves an address reserved by verified onboarding', async () => {
    tx.onboardingRequest.findFirst.mockResolvedValue({ id: 'signup-one' });
    await expect(service.create(dto)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.organization.create).not.toHaveBeenCalled();
  });
  it('persists normalized slug and creates administrator membership and employee', async () => {
    await expect(service.create(dto)).resolves.toEqual(org);
    expect(tx.organization.create).toHaveBeenCalledWith({ data: expect.objectContaining({ name: dto.name, slug: 'acme' }) });
    expect(tx.userOrganization.create).toHaveBeenCalledWith({ data: { userId: 'user-one', organizationId: org.id, roleId: 2 } });
    expect(tx.employee.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: 'user-one', organizationId: org.id }) });
  });
  it.each(['', 'ab', 'admin', 'acme.com'])('rejects %s before starting a creation transaction', async (slug) => {
    await expect(service.create({ ...dto, slug })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('returns 409 when the availability check finds a duplicate slug', async () => {
    prisma.organization.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(org);
    await expect(service.create(dto)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  function uniqueError(modelName: string, target: string[]) {
    return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002', clientVersion: '7.7.0', meta: { modelName, target },
    });
  }
  it('returns 409 when the transaction asynchronously loses the slug race', async () => {
    tx.organization.create.mockRejectedValueOnce(uniqueError('Organization', ['slug']));
    const error = await service.create(dto).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getStatus()).toBe(409);
    expect(tx.user.create).not.toHaveBeenCalled();
  });
  it.each(['email', 'phone'])('does not mislabel a User.%s uniqueness failure', async (field) => {
    const error = uniqueError('User', [field]);
    tx.user.create.mockRejectedValueOnce(error);
    await expect(service.create(dto)).rejects.toBe(error);
  });
  it('rethrows other transaction failures', async () => {
    const error = new Error('Database unavailable');
    prisma.$transaction.mockRejectedValueOnce(error);
    await expect(service.create(dto)).rejects.toBe(error);
  });
  it('gives platform-uploaded branding a reference owned by the new company', async () => {
    const source = { id: 'source-file', organizationId: 'platform', createdAt: new Date(), key: 'immutable-key', folder: 'logos', status: 'READY' };
    const files = { findFirst: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(source), create: jest.fn().mockResolvedValue({ id: 'company-file' }) };
    const update = jest.fn();
    Object.assign(tx, { fileAsset: files });
    Object.assign(tx.organization, { update });
    await service.create({ ...dto, logoUrl: '/api/uploads/files/source-file' }, 'platform');
    expect(files.findFirst).toHaveBeenLastCalledWith({ where: { id: 'source-file', status: 'READY', folder: 'logos', organizationId: 'platform' } });
    expect(files.create).toHaveBeenCalledWith({ data: { organizationId: org.id, key: 'immutable-key', folder: 'logos', status: 'READY' } });
    expect(update).toHaveBeenCalledWith({ where: { id: org.id }, data: { logoUrl: '/api/uploads/files/company-file' } });
  });
  it('rejects branding unavailable to both the new company and trusted uploader company', async () => {
    const files = { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() };
    Object.assign(tx, { fileAsset: files });
    await expect(service.create({ ...dto, logoUrl: '/api/uploads/files/foreign-file' }, 'platform')).rejects.toBeInstanceOf(BadRequestException);
    expect(files.create).not.toHaveBeenCalled();
  });
});
