import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EmsService } from './ems.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdateOnboardingBatchCountryDto } from './dto/onboarding.dto';

const row = (id = 'r1', mobileNumber = '0712345678') => ({
  id, organizationId: 'org1', batchId: 'b1', employeeCode: id,
  firstName: 'Test', lastName: 'Person', companyCode: 'ACME',
  mobileNumber, whatsappNumber: mobileNumber as string | null, workEmail: null as string | null, currentDepartment: 'HR',
  beesAccessLevel: 'employee', status: 'READY',
  jobDesignation: 'Clerk' as string | null,
  reportingToName: 'Jane Boss' as string | null,
  reportingToDesignation: 'HR Manager' as string | null,
});

function fixture() {
  const batch = { id: 'b1', organizationId: 'org1', status: 'READY', defaultPhoneCountry: 'KE', records: [row()] };
  const db = {
    emsOnboardingBatch: { findFirst: jest.fn().mockResolvedValue(batch), findMany: jest.fn().mockResolvedValue([batch]), update: jest.fn(), updateMany: jest.fn() },
    emsOnboardingRecord: { update: jest.fn(), updateMany: jest.fn(), findMany: jest.fn().mockResolvedValue([{ status: 'REGISTERED' }]) },
    employee: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue({ id: 'emp1' }) },
    department: { findMany: jest.fn().mockResolvedValue([{ id: 'dept1', name: 'HR' }]) },
    role: { findMany: jest.fn().mockResolvedValue([{ id: 1, name: 'EMPLOYEE' }]) },
    organization: { findUnique: jest.fn().mockResolvedValue({ communicationChannel: 'WHATSAPP' }), update: jest.fn() },
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
  it('ignores an account that owns the same email and registers by phone', async () => {
    const { db, service, batch } = fixture();
    Object.assign(batch.records[0], { workEmail: 'person@example.com' });
    db.user.findMany.mockResolvedValue([{ id: 'different-account' }]);
    const result = await service.registerOnboardingBatch('org1', 'b1');
    expect(result.failed).toBe(0);
    expect(db.user.create).toHaveBeenCalledTimes(1);
    expect(db.userOrganization.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ userId: 'u1' }),
    }));
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

const findingsFor = (db: ReturnType<typeof fixture>['db'], id: string) => {
  const call = db.emsOnboardingRecord.update.mock.calls.find(([args]) => args.where.id === id);
  const errors = call?.[0].data.validationErrors;
  return Array.isArray(errors) ? errors : [];
};

describe('EMS communication channel rules', () => {
  it('requires WhatsApp when the organisation uses WhatsApp', async () => {
    const { db, service, batch } = fixture();
    batch.records = [{ ...row(), whatsappNumber: null, status: 'DRAFT' }];
    await service.validateOnboardingBatch('org1', 'b1');
    expect(findingsFor(db, 'r1')).toContainEqual(expect.objectContaining({ field: 'whatsappNumber' }));
  });

  it('requires email, not WhatsApp, when the organisation uses email', async () => {
    const { db, service, batch } = fixture();
    db.organization.findUnique.mockResolvedValue({ communicationChannel: 'EMAIL' });
    batch.records = [{ ...row(), whatsappNumber: null, status: 'DRAFT' }];
    await service.validateOnboardingBatch('org1', 'b1');
    const fields = findingsFor(db, 'r1').map((f) => f.field);
    expect(fields).toContain('workEmail');
    expect(fields).not.toContain('whatsappNumber');
  });

  it('flags an invalid WhatsApp number whatever the channel', async () => {
    const { db, service, batch } = fixture();
    db.organization.findUnique.mockResolvedValue({ communicationChannel: 'EMAIL' });
    batch.records = [{ ...row(), workEmail: 'a@b.co', whatsappNumber: '12345', status: 'DRAFT' }];
    await service.validateOnboardingBatch('org1', 'b1');
    expect(findingsFor(db, 'r1')).toContainEqual(expect.objectContaining({ field: 'whatsappNumber' }));
  });

  it('allows two people to share a work email', async () => {
    const { db, service, batch } = fixture();
    batch.records = [
      { ...row('r1', '0712345678'), workEmail: 'production@acme.co', status: 'DRAFT' },
      { ...row('r2', '0722345678'), workEmail: 'production@acme.co', status: 'DRAFT' },
    ];
    await service.validateOnboardingBatch('org1', 'b1');
    expect(findingsFor(db, 'r1')).toEqual([]);
    expect(findingsFor(db, 'r2')).toEqual([]);
  });

  it('refuses to register until the organisation has chosen a channel', async () => {
    const { db, service } = fixture();
    db.organization.findUnique.mockResolvedValue({ communicationChannel: null });
    await expect(service.registerOnboardingBatch('org1', 'b1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('keeps the work email off the login and stores WhatsApp on the employee', async () => {
    const { db, service, batch } = fixture();
    batch.records = [{ ...row(), workEmail: 'production@acme.co' }];
    await service.registerOnboardingBatch('org1', 'b1');
    expect(db.user.create.mock.calls[0][0].data).not.toHaveProperty('email');
    expect(db.employee.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ email: 'production@acme.co', whatsappNumber: '254712345678' }),
    }));
  });
});

describe('EMS communication channel setting', () => {
  it('re-validates open imports when the channel changes', async () => {
    const { db, service } = fixture();
    await service.updateCommunicationChannel('org1', { communicationChannel: 'EMAIL' } as any);
    expect(db.organization.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { communicationChannel: 'EMAIL' },
    }));
    expect(db.emsOnboardingRecord.update).toHaveBeenCalled();
  });

  it('does nothing when the same channel is chosen again', async () => {
    const { db, service } = fixture();
    await service.updateCommunicationChannel('org1', { communicationChannel: 'WHATSAPP' } as any);
    expect(db.organization.update).not.toHaveBeenCalled();
    expect(db.emsOnboardingRecord.update).not.toHaveBeenCalled();
  });
});

describe('EMS reporting and designation rules', () => {
  it('requires job designation and both reporting fields', async () => {
    const { db, service, batch } = fixture();
    batch.records = [{
      ...row(), status: 'DRAFT',
      jobDesignation: null, reportingToName: null, reportingToDesignation: null,
    }];
    await service.validateOnboardingBatch('org1', 'b1');
    const fields = findingsFor(db, 'r1').map((f) => f.field);
    expect(fields).toEqual(expect.arrayContaining(['jobDesignation', 'reportingToName', 'reportingToDesignation']));
  });

  it('lets the most senior person report to the Board with no name', async () => {
    const { db, service, batch } = fixture();
    batch.records = [{
      ...row(), status: 'DRAFT',
      reportingToName: null, reportingToDesignation: 'Board of Directors',
    }];
    await service.validateOnboardingBatch('org1', 'b1');
    expect(findingsFor(db, 'r1')).toEqual([]);
  });
});
