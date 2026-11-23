import { RegistrationLeaseLost } from './ems-registration.types';
import { Role } from 'src/common/enum/role.enum';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { EmsService } from './ems.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdateOnboardingBatchCountryDto } from './dto/onboarding.dto';

const row = (id = 'r1', mobileNumber = '0712345678') => ({
  id, organizationId: 'org1', batchId: 'b1', employeeCode: id, updatedAt: new Date('2026-10-14T12:00:00Z'),
  firstName: id === 'manager' ? 'Samuel' : id === 'r2' ? 'Alice' : 'Test', lastName: id === 'manager' ? 'Kiprono' : id === 'r2' ? 'Winter' : 'Person', companyCode: 'ACME',
  mobileNumber, whatsappNumber: mobileNumber as string | null, workEmail: null as string | null, currentDepartment: 'HR',
  beesAccessLevel: 'employee', status: 'READY',
  jobDesignation: 'Clerk' as string | null,
  reportingToName: 'Jane Boss' as string | null,
  reportingToDesignation: 'HR Manager' as string | null,
});

function fixture() {
  const batch = { id: 'b1', organizationId: 'org1', status: 'READY', defaultPhoneCountry: 'KE', records: [row()] };
  const db = {
    emsAccountLink: { create: jest.fn() },
    emsInvitation: { create: jest.fn() },
    emsDepartmentHod: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    emsOnboardingBatch: { findFirst: jest.fn().mockResolvedValue(batch), findMany: jest.fn().mockResolvedValue([batch]), update: jest.fn(), updateMany: jest.fn() },
    emsOnboardingRecord: { update: jest.fn(), updateMany: jest.fn(), findMany: jest.fn().mockImplementation(async args => args?.select?.mobileNumber
      ? batch.records.filter(r => !['REGISTERED','EXCLUDED'].includes(r.status)).map(r => ({...r, batch: {defaultPhoneCountry: batch.defaultPhoneCountry, label: null, sourceFileName: null}}))
      : args?.select?.firstName ? batch.records : [{ status: 'REGISTERED' }]) },
    employee: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockImplementation(async (args) => args?.select?.firstName
      ? [{ id: 'boss', firstName: 'Jane', lastName: 'Boss', jobTitle: 'HR Manager', reportingManagerId: null, reportsToBoard: true, pendingReportingRecordId: null }]
      : []), create: jest.fn().mockResolvedValue({ id: 'emp1' }), updateMany: jest.fn() },
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

function hooks() {
  return { recordIds: ['r1'], authorize: jest.fn().mockResolvedValue(Role.ADMIN), checkpoint: jest.fn() };
}
describe('durable registration record transactions', () => {
  it('selects a row whose previous duplicate finding has since cleared, just like the Ready view',async()=>{
    const {db,service,batch}=fixture();
    const candidate={...batch.records[0],status:'NEEDS_FIXING',validationErrors:[{field:'duplicateReview',code:'DUPLICATE_PERSON',message:'Old match'}]};
    const ids=await service.registrationReadyIds(db as never,'org1',[candidate] as never,'KE',Role.ADMIN);
    expect(ids).toEqual(['r1']);
  });
  it('commits employee and checkpoint through the same transaction client, sharing pre-write reads', async () => {
    const { db, service } = fixture(), run = hooks();
    await service.registerOnboardingRecords('org1', 'b1', Role.ADMIN, run);
    expect(run.checkpoint).toHaveBeenCalledWith(db, 'r1', 'registered');
    expect(run.checkpoint.mock.invocationCallOrder[0]).toBeGreaterThan(db.emsOnboardingRecord.update.mock.invocationCallOrder[0]);
    const beforeCreate = db.employee.create.mock.invocationCallOrder[0];
    // Initial hierarchy and duplicate overview, then ONE shared locked snapshot.
    expect(db.employee.findMany.mock.invocationCallOrder.filter(n => n < beforeCreate)).toHaveLength(3);
    expect(db.userOrganization.upsert).toHaveBeenCalledTimes(1);
  });
  it('fences a previous worker before any employee or identity writes', async () => {
    const {db, service} = fixture(), run = hooks();
    run.authorize.mockRejectedValue(new RegistrationLeaseLost());
    await expect(service.registerOnboardingRecords('org1','b1',Role.ADMIN,run)).rejects.toBeInstanceOf(RegistrationLeaseLost);
    expect(db.user.create).not.toHaveBeenCalled(); expect(db.employee.create).not.toHaveBeenCalled();
    expect(db.emsOnboardingRecord.updateMany).not.toHaveBeenCalled();
  });
  it('uses the current role inside the transaction if an Admin becomes HR', async () => {
    const {db, service, batch} = fixture(), run = hooks();
    batch.records[0].beesAccessLevel = 'Admin';
    run.authorize.mockResolvedValue(Role.HR);
    await service.registerOnboardingRecords('org1','b1',Role.ADMIN,run);
    expect(db.user.create).not.toHaveBeenCalled(); expect(db.employee.create).not.toHaveBeenCalled();
    expect(run.checkpoint).toHaveBeenCalledWith(db,'r1','awaitingAdmin');
  });
  it('skips a target registered by an earlier committed attempt', async () => {
    const {db,service,batch} = fixture(), run = hooks();
    batch.records[0].status = 'REGISTERED';
    await service.registerOnboardingRecords('org1','b1',Role.ADMIN,run);
    expect(db.employee.create).not.toHaveBeenCalled();
    expect(run.checkpoint).toHaveBeenCalledWith(db,'r1','skipped');
  });
  it('checks only the original selected records and does not absorb new ready rows', async () => {
    const {db,service,batch} = fixture(), run = hooks();
    batch.records.push(row('r2', '0712987654'));
    await service.registerOnboardingRecords('org1','b1',Role.ADMIN,run);
    expect(db.employee.create).toHaveBeenCalledTimes(1);
    expect(run.checkpoint).toHaveBeenCalledTimes(1);
  });
  it('records a validation failure and continues rather than calling it a server failure', async () => {
    const {db,service,batch} = fixture(), run = hooks();
    batch.records[0].firstName = 'N/A';
    await service.registerOnboardingRecords('org1','b1',Role.ADMIN,run);
    expect(db.employee.create).not.toHaveBeenCalled();
    expect(run.checkpoint).toHaveBeenCalledWith(db,'r1','failed');
    expect(db.emsOnboardingRecord.updateMany).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:'NEEDS_FIXING'})}));
  });
  it('keeps technical errors off the employee validation record', async () => {
    const {db,service} = fixture(), run = hooks();
    db.employee.create.mockRejectedValue(Object.assign(new Error('private SQL text'), {code:'P2028'}));
    await expect(service.registerOnboardingRecords('org1','b1',Role.ADMIN,run)).rejects.toMatchObject({code:'P2028'});
    expect(run.checkpoint).not.toHaveBeenCalled(); expect(db.emsOnboardingRecord.updateMany).not.toHaveBeenCalled();
  });
  it('propagates checkpoint failure so the enclosing DB transaction rolls back', async () => {
    const {service} = fixture(), run = hooks();
    run.checkpoint.mockRejectedValue(new RegistrationLeaseLost());
    await expect(service.registerOnboardingRecords('org1','b1',Role.ADMIN,run)).rejects.toBeInstanceOf(RegistrationLeaseLost);
  });
  it('reconciles the batch after restart with no unprocessed targets', async () => {
    const {db,service} = fixture(), run = hooks(); run.recordIds = [];
    await service.registerOnboardingRecords('org1','b1',Role.ADMIN,run);
    expect(db.employee.create).not.toHaveBeenCalled();
    expect(db.emsOnboardingBatch.updateMany).toHaveBeenCalledWith(expect.objectContaining({data:{status:'REGISTERED'}}));
  });
});
