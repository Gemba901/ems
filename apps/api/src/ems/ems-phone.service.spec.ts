import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EmsService } from './ems.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdateOnboardingBatchCountryDto } from './dto/onboarding.dto';

const row = (id = 'r1', mobileNumber = '0712345678') => ({
  id, organizationId: 'org1', batchId: 'b1', employeeCode: id,
  firstName: 'Test', lastName: 'Person', companyCode: 'ACME',
  mobileNumber, workEmail: null, currentDepartment: 'HR',
  beesAccessLevel: 'employee', status: 'READY',
});

function fixture() {
  const batch = { id: 'b1', organizationId: 'org1', status: 'READY', defaultPhoneCountry: 'KE', records: [row()] };
  const db = {
    emsOnboardingBatch: { findFirst: jest.fn().mockResolvedValue(batch), update: jest.fn(), updateMany: jest.fn() },
    emsOnboardingRecord: { update: jest.fn(), updateMany: jest.fn(), findMany: jest.fn().mockResolvedValue([{ status: 'REGISTERED' }]) },
    employee: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue({ id: 'emp1' }) },
    department: { findMany: jest.fn().mockResolvedValue([{ id: 'dept1', name: 'HR' }]) },
    role: { findMany: jest.fn().mockResolvedValue([{ id: 1, name: 'EMPLOYEE' }]) },
    user: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue({ id: 'u1', phone: '254712345678', email: null }) },
    userOrganization: { upsert: jest.fn() },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn(),
  };
  // A unit-test transaction double. Actual PostgreSQL rollback requires integration testing.
  db.$transaction.mockImplementation(async (callback) => callback(db));
  const service = new EmsService(db as unknown as PrismaService);
  return { db, service, batch };
}

describe('EMS phone validation', () => {
  it('flags both equivalent numbers, not just the second row', async () => {
    const { db, service, batch } = fixture();
    batch.records.push(row('r2', '+254712345678'));
    await service.validateOnboardingBatch('org1', 'b1');
    expect(db.emsOnboardingRecord.update).toHaveBeenCalledTimes(2);
    for (const [call] of db.emsOnboardingRecord.update.mock.calls) {
      expect(call.data.status).toBe('NEEDS_FIXING');
      expect(call.data.validationErrors).toContainEqual(expect.objectContaining({ message: expect.stringContaining('another record') }));
    }
  });
  it('ignores an excluded duplicate', async () => {
    const { db, service, batch } = fixture();
    batch.records.push({ ...row('r2'), status: 'EXCLUDED' });
    await service.validateOnboardingBatch('org1', 'b1');
    expect(db.emsOnboardingRecord.update).toHaveBeenCalledTimes(1);
    expect(db.emsOnboardingRecord.update.mock.calls[0][0].data.status).toBe('READY');
  });
  it('rejects an existing employee phone with different formatting', async () => {
    const { db, service } = fixture();
    db.employee.findMany.mockResolvedValue([{ phone: '+254 (712) 345-678', employeeCode: 'OLD', email: null, userId: 'old' }]);
    await service.validateOnboardingBatch('org1', 'b1');
    expect(db.emsOnboardingRecord.update.mock.calls[0][0].data.validationErrors)
      .toContainEqual(expect.objectContaining({ message: expect.stringContaining('already used') }));
    expect(db.employee.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: 'org1' } }));
  });
  it('does not silently assign the import country to an existing local phone', async () => {
    const { db, service } = fixture();
    db.employee.findMany.mockResolvedValue([{ phone: '0712345678', employeeCode: 'OLD', email: null, userId: 'old' }]);
    await service.validateOnboardingBatch('org1', 'b1');
    expect(db.emsOnboardingRecord.update.mock.calls[0][0].data.validationErrors)
      .toContainEqual(expect.objectContaining({ message: expect.stringContaining('review') }));
  });
  it('rejects a batch outside the requesting organization', async () => {
    const { db, service } = fixture();
    db.emsOnboardingBatch.findFirst.mockResolvedValue(null);
    await expect(service.validateOnboardingBatch('other', 'b1')).rejects.toBeInstanceOf(NotFoundException);
    expect(db.emsOnboardingBatch.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'b1', organizationId: 'other' } }));
  });
});

describe('EMS phone registration', () => {
  it('stores international digits on both the new login and employee', async () => {
    const { db, service } = fixture();
    const result = await service.registerOnboardingBatch('org1', 'b1');
    expect(result.registered).toBe(1);
    expect(db.user.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ phone: '254712345678' }) }));
    expect(db.employee.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ phone: '254712345678', userId: 'u1' }) }));
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: 'Serializable' }));
  });
  it('reuses one international match and preserves an existing membership role', async () => {
    const { db, service } = fixture();
    db.$queryRaw.mockImplementation(async (sql) => String(sql[0]).includes('SELECT id, phone, email')
      ? [{ id: 'existing', phone: '+254712345678', email: null }] : []);
    await service.registerOnboardingBatch('org1', 'b1');
    expect(db.user.create).not.toHaveBeenCalled();
    expect(db.userOrganization.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: {}, create: expect.objectContaining({ userId: 'existing' }) }));
  });
  it.each([
    [[{ id: 'legacy', phone: '0712345678', email: null }]],
    [[{ id: 'u1', phone: '+254712345678', email: null }, { id: 'u2', phone: '254712345678', email: null }]],
  ])('blocks ambiguous existing accounts', async (candidates) => {
    const { db, service } = fixture();
    db.$queryRaw.mockImplementation(async (sql) => String(sql[0]).includes('SELECT id, phone, email') ? candidates : []);
    const result = await service.registerOnboardingBatch('org1', 'b1');
    expect(result.failed).toBe(1);
    expect(db.user.create).not.toHaveBeenCalled();
    expect(db.employee.create).not.toHaveBeenCalled();
    expect(db.userOrganization.upsert).not.toHaveBeenCalled();
  });
  it('does not link an account by email when the phone differs', async () => {
    const { db, service, batch } = fixture();
    Object.assign(batch.records[0], { workEmail: 'person@example.com' });
    db.user.findMany.mockResolvedValue([{ id: 'different-account' }]);
    const result = await service.registerOnboardingBatch('org1', 'b1');
    expect(result.failed).toBe(1);
    expect(db.user.create).not.toHaveBeenCalled();
    expect(db.userOrganization.upsert).not.toHaveBeenCalled();
  });
  it('rechecks an existing employee even if the row was marked READY', async () => {
    const { db, service } = fixture();
    db.employee.findMany.mockResolvedValue([{ phone: '254712345678', userId: 'old' }]);
    expect((await service.registerOnboardingBatch('org1', 'b1')).failed).toBe(1);
    expect(db.employee.create).not.toHaveBeenCalled();
  });
  it('never marks a failed employee write as registered', async () => {
    const { db, service } = fixture();
    db.employee.create.mockRejectedValue(new Error('database failure'));
    expect((await service.registerOnboardingBatch('org1', 'b1')).failed).toBe(1);
    expect(db.emsOnboardingRecord.update).not.toHaveBeenCalled();
    expect(db.emsOnboardingRecord.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'r1', organizationId: 'org1', status: 'READY' } }));
  });
  it('rejects a cancelled batch before writing', async () => {
    const { db, service, batch } = fixture();
    batch.status = 'CANCELLED';
    await expect(service.registerOnboardingBatch('org1', 'b1')).rejects.toBeInstanceOf(BadRequestException);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

describe('Batch country changes', () => {
  it('saves the country, invalidates pending readiness, then revalidates', async () => {
    const { db, service } = fixture();
    const revalidate = jest.spyOn(service, 'validateOnboardingBatch').mockResolvedValue({} as never);
    await service.updateOnboardingBatchCountry('org1', 'b1', { defaultPhoneCountry: 'JP' });
    expect(db.emsOnboardingBatch.update).toHaveBeenCalledWith({ where: { id: 'b1' }, data: { defaultPhoneCountry: 'JP' } });
    expect(db.emsOnboardingRecord.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { batchId: 'b1', organizationId: 'org1', status: { in: ['DRAFT', 'READY', 'NEEDS_FIXING'] } } }));
    expect(revalidate).toHaveBeenCalledWith('org1', 'b1');
  });
  it('rejects a country change after registration has started', async () => {
    const { service, batch } = fixture();
    batch.records[0].status = 'REGISTERED';
    await expect(service.updateOnboardingBatchCountry('org1', 'b1', { defaultPhoneCountry: 'JP' })).rejects.toThrow('after registration');
  });
  it.each(['', 'XX', 'Kenya', 'ke'])('rejects invalid country %s', (country) => {
    const dto = plainToInstance(UpdateOnboardingBatchCountryDto, { defaultPhoneCountry: country });
    expect(validateSync(dto).length).toBeGreaterThan(0);
  });
  it.each(['KE', 'US', 'JP'])('accepts supported country %s', (country) => {
    expect(validateSync(plainToInstance(UpdateOnboardingBatchCountryDto, { defaultPhoneCountry: country }))).toHaveLength(0);
  });
});
