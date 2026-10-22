import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { Role } from 'src/common/enum/role.enum';
import { PrismaService } from 'src/prisma/prisma.service';
import { EmsService } from './ems.service';
import { EmsController } from './ems.controller';
import { importedAccountRole, registrationAccess, registrationOutcomeMessage } from './onboarding-access';

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
    emsDepartmentHod: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    emsOnboardingBatch: { findFirst: jest.fn().mockResolvedValue(batch), findMany: jest.fn().mockResolvedValue([batch]), update: jest.fn(), updateMany: jest.fn() },
    emsOnboardingRecord: { update: jest.fn(), updateMany: jest.fn(), findMany: jest.fn().mockImplementation(async args => args?.select?.mobileNumber
      ? batch.records.filter(r => !['REGISTERED','EXCLUDED'].includes(r.status)).map(r => ({...r, batch: {defaultPhoneCountry: batch.defaultPhoneCountry, label: null, sourceFileName: null}}))
      : args?.select?.firstName ? batch.records : [{ status: 'REGISTERED' }]) },
    employee: { findMany: jest.fn().mockImplementation(async (args) => args?.select?.firstName
      ? [{ id: 'boss', firstName: 'Jane', lastName: 'Boss', jobTitle: 'HR Manager', reportingManagerId: null, reportsToBoard: true, pendingReportingRecordId: null }]
      : []), create: jest.fn().mockResolvedValue({ id: 'emp1' }), updateMany: jest.fn() },
    department: { findMany: jest.fn().mockResolvedValue([{ id: 'dept1', name: 'HR' }]) },
    role: { findMany: jest.fn().mockResolvedValue(['EMPLOYEE', 'HOD', 'HR', 'MANAGEMENT', 'ADMIN', 'SUPER_ADMIN'].map((name, index) => ({id: index + 10, name}))) },
    organization: { findUnique: jest.fn().mockResolvedValue({ communicationChannel: 'WHATSAPP' }), update: jest.fn() },
    user: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue({ id: 'u1', phone: '254712345678', email: null }) },
    userOrganization: { upsert: jest.fn() },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn(),
  };

  // A unit-test transaction double. Actual PostgreSQL rollback requires integration testing.
  db.$transaction.mockImplementation(async (callback) => callback(db));
  const service = new EmsService(db as unknown as PrismaService);
  db.emsOnboardingRecord.update.mockImplementation(async ({where, data}) => {
    const record = batch.records.find(record => record.id === where.id);
    if (record) Object.assign(record, data);
    return record;
  });
  db.emsOnboardingRecord.findMany.mockImplementation(async args => args?.select?.mobileNumber
    ? batch.records.filter(r => !['REGISTERED','EXCLUDED'].includes(r.status)).map(r => ({...r, batch: {defaultPhoneCountry: batch.defaultPhoneCountry, label: null, sourceFileName: null}}))
    : batch.records);
  jest.spyOn(service, 'getOnboardingBatch').mockImplementation(async () => batch as never);
  return { db, service, batch };
}

describe('Onboarding access authority', () => {
  it.each([Role.EMPLOYEE, Role.HOD, Role.MANAGEMENT, undefined, 'employee', 'UNKNOWN'])('denies caller %s before reading or writing records', async actor => {
    const {service, db} = fixture();
    await expect(service.registerOnboardingBatch('org1', 'b1', actor as Role)).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.emsOnboardingBatch.findFirst).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it.each(['Employee', 'Supervisor'])('HR registers %s with Employee membership', async access => {
    const {service, db, batch} = fixture();
    batch.records[0].beesAccessLevel = access;
    expect(await service.registerOnboardingBatch('org1', 'b1', Role.HR)).toMatchObject({registered:1, failed:0, awaitingAdmin:0});
    expect(db.userOrganization.upsert).toHaveBeenCalledWith(expect.objectContaining({update:{}, create:expect.objectContaining({organizationId:'org1',roleId:10})}));
  });

  it.each(['HOD', 'HR', 'Management', 'Admin', 'Head of Department', 'System Administrator'])('HR skips %s without changing Ready or creating accounts', async access => {
    const {service, db, batch} = fixture();
    batch.records[0].beesAccessLevel = access;
    const before = JSON.stringify(batch);
    expect(await service.registerOnboardingBatch('org1', 'b1', Role.HR)).toMatchObject({registered:0, failed:0, awaitingAdmin:1});
    expect(JSON.stringify(batch)).toBe(before);
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.user.create).not.toHaveBeenCalled();
    expect(db.userOrganization.upsert).not.toHaveBeenCalled();
    expect(db.employee.create).not.toHaveBeenCalled();
    expect(db.emsOnboardingRecord.updateMany).not.toHaveBeenCalled();
    expect(db.emsOnboardingBatch.updateMany).not.toHaveBeenCalled();
  });

  it.each([Role.ADMIN, Role.SUPER_ADMIN])('%s can register each supported organisation role', async actor => {
    for (const access of ['Employee','HOD','HR','Management','Admin']) {
      const {service, db, batch} = fixture();
      batch.records[0].beesAccessLevel = access;
      expect(await service.registerOnboardingBatch('org1', 'b1', actor)).toMatchObject({registered:1, failed:0, awaitingAdmin:0});
      const assigned = db.userOrganization.upsert.mock.calls[0][0].create.roleId;
      expect((await db.role.findMany()).find((r:{id:number}) => r.id === assigned)?.name).toBe(importedAccountRole(access));
    }
  });

  it('registers eligible rows in a mixed batch and leaves the elevated row Ready for an Admin', async () => {
    const {service, db, batch} = fixture();
    batch.records.push({...row('r2', '0712345679'), beesAccessLevel:'Admin'});
    expect(await service.registerOnboardingBatch('org1', 'b1', Role.HR)).toMatchObject({registered:1, failed:0, awaitingAdmin:1});
    expect(batch.records.map(r => r.status)).toEqual(['REGISTERED','READY']);
    expect(db.employee.create).toHaveBeenCalledTimes(1);
    expect(db.emsOnboardingRecord.updateMany).not.toHaveBeenCalled();
    expect(db.emsOnboardingBatch.updateMany).toHaveBeenCalledWith(expect.objectContaining({data:{status:'PARTIALLY_REGISTERED'}}));
    expect(await service.registerOnboardingBatch('org1', 'b1', Role.ADMIN)).toMatchObject({registered:1, failed:0, awaitingAdmin:0});
    expect(batch.records.map(r => r.status)).toEqual(['REGISTERED','REGISTERED']);
    expect(db.employee.create).toHaveBeenCalledTimes(2);
  });

  it('rechecks access after a concurrent row change before any account writes', async () => {
    const {service, db, batch} = fixture();
    db.$transaction.mockImplementation(async callback => {
      batch.records[0].beesAccessLevel = 'Admin';
      return callback(db);
    });
    expect(await service.registerOnboardingBatch('org1', 'b1', Role.HR)).toMatchObject({registered:0, failed:0, awaitingAdmin:1});
    expect(batch.records[0].status).toBe('READY');
    expect(db.user.create).not.toHaveBeenCalled();
    expect(db.userOrganization.upsert).not.toHaveBeenCalled();
    expect(db.employee.create).not.toHaveBeenCalled();
    expect(db.emsOnboardingRecord.updateMany).not.toHaveBeenCalled();
  });

  it.each(['SUPER_ADMIN', 'super admin', '__proto__', 'constructor'])('never creates platform or unknown access from %s', async access => {
    const {service, db, batch} = fixture();
    batch.records[0].beesAccessLevel = access;
    expect(await service.registerOnboardingBatch('org1', 'b1', Role.SUPER_ADMIN)).toMatchObject({registered:0, failed:1, awaitingAdmin:0});
    expect(db.user.create).not.toHaveBeenCalled();
    expect(db.userOrganization.upsert).not.toHaveBeenCalled();
    expect(db.employee.create).not.toHaveBeenCalled();
  });

  it('a Head of Department designation does not grant HOD account permissions', async () => {
    const {service, db, batch} = fixture();
    batch.records[0].jobDesignation = 'Head of Department';
    const before = JSON.stringify(batch.records[0]);
    expect(registrationAccess(Role.HR, batch.records[0].beesAccessLevel)).toBe('ALLOWED');
    expect(JSON.stringify(batch.records[0])).toBe(before);
    await service.registerOnboardingBatch('org1', 'b1', Role.HR);
    expect(db.userOrganization.upsert).toHaveBeenCalledWith(expect.objectContaining({create:expect.objectContaining({roleId:10})}));
    expect(db.emsDepartmentHod.findMany).toHaveBeenCalled();
  });

  it('preserves an existing account membership instead of replacing its role from the sheet', async () => {
    const {service, db, batch} = fixture();
    batch.records[0].beesAccessLevel = 'Admin';
    db.$queryRaw.mockImplementation(async sql => String(sql[0]).includes('SELECT id, phone, email')
      ? [{id:'existing',phone:'+254712345678',email:null}] : []);
    await service.registerOnboardingBatch('org1', 'b1', Role.ADMIN);
    expect(db.user.create).not.toHaveBeenCalled();
    expect(db.userOrganization.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where:{userId_organizationId:{userId:'existing',organizationId:'org1'}}, update:{},
    }));
  });

  it('passes the trusted caller role from the controller and keeps its existing route roles', async () => {
    const register = jest.fn().mockResolvedValue({registered:0, failed:0, awaitingAdmin:1});
    const controller = new EmsController({registerOnboardingBatch:register} as unknown as EmsService);
    await controller.registerOnboardingBatch('b1', {organizationId:'org1',roleLevel:Role.HR});
    expect(register).toHaveBeenCalledWith('org1','b1',Role.HR);
    expect(Reflect.getMetadata('roles', controller.registerOnboardingBatch)).toEqual(expect.arrayContaining([Role.ADMIN,Role.SUPER_ADMIN,Role.HR]));
  });

  it('reports permission skips separately from validation failures', () => {
    expect(registrationOutcomeMessage({registered:2,failed:1,awaitingAdmin:3})).toBe('Registration result · 2 registered · 1 could not register · 3 require an Admin to register');
    expect(registrationOutcomeMessage({registered:0,failed:0,awaitingAdmin:1})).not.toMatch(/failed|could not/);
  });
});
