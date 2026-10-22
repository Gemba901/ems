import { Role } from 'src/common/enum/role.enum';
import { BadRequestException } from '@nestjs/common';
import { EmsService, calcEmployeeCompletion } from './ems.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdateEmployeeReportingDto } from './dto/onboarding.dto';

// Stateful doubles exercise event-to-event behavior, but do not simulate PostgreSQL isolation.
function setup() {
  const manager: any = { id: 'manager', batchId: 'batch', organizationId: 'org', status: 'NEEDS_FIXING',
    firstName: 'Peter', lastName: 'Otieno', jobDesignation: 'HOD', employeeCode: 'M1', mobileNumber: 'bad', whatsappNumber: 'bad',
    beesAccessLevel: 'employee', currentDepartment: 'Production', reportingToName: null, reportingToDesignation: 'Board' };
  const ann: any = { id: 'ann', batchId: 'batch', organizationId: 'org', status: 'READY',
    firstName: 'Ann', lastName: 'Akinyi', employeeCode: 'A1', jobDesignation: 'Operator', mobileNumber: '0712345678', whatsappNumber: '0712345678',
    beesAccessLevel: 'employee', currentDepartment: 'Production', reportingToRecordId: 'manager', reportingToName: 'Peter Otieno', reportingToDesignation: 'HOD' };
  const batch: any = { id: 'batch', organizationId: 'org', status: 'READY', defaultPhoneCountry: 'KE', records: [ann, manager] };
  const employees: any[] = [];
  const db: any = {
    emsDepartmentHod: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    $queryRaw: jest.fn().mockResolvedValue([]), $transaction: jest.fn(),
    organization: { findUnique: jest.fn().mockResolvedValue({ communicationChannel: 'WHATSAPP' }) },
    role: { findMany: jest.fn().mockResolvedValue([{ id: 5, name: 'EMPLOYEE' }]) },
    department: { findMany: jest.fn().mockResolvedValue([{ id: 'production', name: 'Production' }]) },
    user: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue({ id: 'user' }) },
    userOrganization: { upsert: jest.fn() },
    employee: {
      findMany: jest.fn().mockImplementation(async () => employees.map(e => ({...e, emsOnboardingRecord: batch.records.find((r: any) => r.employeeId === e.id) ?? null}))),
      findFirst: jest.fn().mockImplementation(async ({ where }: any) => employees.find(e => e.id === where.id && e.organizationId === where.organizationId) ?? null),
      create: jest.fn().mockImplementation(async ({ data }: any) => { const e = { ...data, id: `employee-${data.employeeCode}` }; employees.push(e); return e; }),
      update: jest.fn().mockImplementation(async ({ where, data }: any) => {
        const e = employees.find(e => e.id === where.id); if (!e) throw new Error('Missing employee'); Object.assign(e, data); return e;
      }),
      updateMany: jest.fn().mockImplementation(async ({ where, data }: any) => {
        const list = employees.filter(e => Object.entries(where).every(([k,v]) => e[k] === v));
        list.forEach(e => Object.assign(e, data)); return { count: list.length };
      }),
    },
    emsOnboardingBatch: {
      updateMany: jest.fn().mockImplementation(async ({data}: any) => { Object.assign(batch,data); return {count:1}; }),
      findFirst: jest.fn().mockImplementation(async ({ where }: any) => where.organizationId === 'org' ? { ...batch,
        _count: { records: batch.records.filter((r: any) => r.status === 'REGISTERED').length } } : null),
      update: jest.fn().mockImplementation(async ({ data }: any) => Object.assign(batch, data)),
    },
    emsOnboardingRecord: {
      findFirst: jest.fn().mockImplementation(async ({ where }: any) => batch.records.find((r: any) => r.id === where.id && r.organizationId === where.organizationId) ?? null),
      findMany: jest.fn().mockImplementation(async (args: any) => args?.select?.mobileNumber
        ? batch.records.filter((r: any) => !['REGISTERED','EXCLUDED'].includes(r.status)).map((r: any) => ({...r, batch: {defaultPhoneCountry: batch.defaultPhoneCountry, label: null, sourceFileName: null}}))
        : batch.records),
      update: jest.fn().mockImplementation(async ({ where, data }: any) => Object.assign(batch.records.find((r: any) => r.id === where.id), data)),
      updateMany: jest.fn().mockImplementation(async ({ where, data }: any) => {
        const r = batch.records.find((r: any) => r.id === where.id && (typeof where.status === 'string' ? r.status === where.status : where.status.in.includes(r.status)));
        if (r) Object.assign(r,data);return { count:r ? 1 : 0 };
      }),
    },
  };
  db.$transaction.mockImplementation(async (callback: any) => callback(db));
  const service = new EmsService(db as PrismaService);
  return { service, db, batch, manager, ann, employees };
}

describe('valid pending assignment lifecycle', () => {
  it('registers Ann now and automatically links her when Peter registers later', async () => {
    const {service, manager, ann, employees, db} = setup();
    expect((await service.registerOnboardingBatch('org','batch', Role.ADMIN)).registered).toBe(1);
    const employee = employees.find(e => e.employeeCode === 'A1');
    expect(ann.status).toBe('REGISTERED');
    expect(employee).toMatchObject({reportingManagerId:null,pendingReportingRecordId:'manager',reportsToBoard:false});
    expect((await service.getEmployeeReporting(employee.id,'org')).assignment.state).toBe('PENDING');
    Object.assign(manager,{mobileNumber:'0712345679',whatsappNumber:'0712345679',status:'READY'});
    expect((await service.registerOnboardingBatch('org','batch', Role.ADMIN)).registered).toBe(1);
    expect(employee).toMatchObject({reportingManagerId:'employee-M1',pendingReportingRecordId:null});
    expect((await service.getEmployeeReporting(employee.id,'org')).assignment).toMatchObject({state:'ASSIGNED',error:null,depth:1});
    expect(employees.find(e=>e.id==='employee-M1').reportsToBoard).toBe(true);
    expect(db.employee.updateMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({pendingReportingRecordId:'manager',reportingManagerId:null,reportsToBoard:false})}));
  });
  it('keeps Ann registered and flags her assignment if Peter is excluded', async () => {
    const {service,ann,employees}=setup();await service.registerOnboardingBatch('org','batch', Role.ADMIN);
    await service.excludeOnboardingRecord('org','manager',{reason:'Duplicate import'});
    expect(ann.status).toBe('REGISTERED');
    expect((await service.getEmployeeReporting(employees[0].id,'org')).assignment).toMatchObject({state:'NEEDS_ATTENTION',target:'record:manager'});
    expect(employees[0].pendingReportingRecordId).toBe('manager');
  });
  it('never overwrites an HR replacement when Peter eventually registers', async () => {
    const {service,manager,employees}=setup();await service.registerOnboardingBatch('org','batch', Role.ADMIN);
    const annEmployee=employees[0];employees.push({id:'replacement',organizationId:'org',firstName:'Grace',lastName:'Wanjiru',jobTitle:'Director',reportsToBoard:true,reportingManagerId:null,pendingReportingRecordId:null});
    await service.updateEmployeeReporting(annEmployee.id,'org','employee:replacement');
    Object.assign(manager,{mobileNumber:'0712345679',whatsappNumber:'0712345679',status:'READY'});
    await service.registerOnboardingBatch('org','batch', Role.ADMIN);
    expect(annEmployee).toMatchObject({reportingManagerId:'replacement',pendingReportingRecordId:null});
  });
  it('can explicitly confirm Board without creating a Board employee', async () => {
    const {service,employees}=setup();await service.registerOnboardingBatch('org','batch', Role.ADMIN);
    await service.updateEmployeeReporting(employees[0].id,'org','BOARD');
    expect(employees).toHaveLength(1);
    expect(employees[0]).toMatchObject({reportsToBoard:true,reportingManagerId:null,pendingReportingRecordId:null});
  });
  it('rejects a self-assignment and a loop through Peter’s pending row', async () => {
    const {service,manager,employees}=setup();await service.registerOnboardingBatch('org','batch', Role.ADMIN);
    const annEmployee=employees[0];
    await expect(service.updateEmployeeReporting(annEmployee.id,'org',`employee:${annEmployee.id}`)).rejects.toBeInstanceOf(BadRequestException);
    Object.assign(manager,{mobileNumber:'0712345679',whatsappNumber:'0712345679',status:'READY',reportingToBoard:false,reportingToEmployeeId:annEmployee.id});
    expect((await service.registerOnboardingBatch('org','batch', Role.ADMIN)).failed).toBe(1);
    expect(employees).toHaveLength(1);
  });
  it('blocks Ann if the manager was excluded before Ann registers', async () => {
    const {service,manager,employees}=setup();manager.status='EXCLUDED';
    expect((await service.registerOnboardingBatch('org','batch', Role.ADMIN)).failed).toBe(1);
    expect(employees).toHaveLength(0);
  });
  it('keeps cancellation prohibited after Ann has registered', async () => {
    const {service,batch}=setup();await service.registerOnboardingBatch('org','batch', Role.ADMIN);
    await expect(service.cancelOnboardingBatch('org','batch')).rejects.toThrow('Cannot cancel');
    expect(batch.status).not.toBe('CANCELLED');
  });
  it('does not expose reporting options for another organization’s employee', async () => {
    const {service}=setup();await service.registerOnboardingBatch('org','batch', Role.ADMIN);
    // Simulates the organization-scoped query; no employee returned for the other tenant.
    const ctx=setup();ctx.db.employee.findMany.mockResolvedValue([]);
    await expect(ctx.service.getEmployeeReporting('employee-A1','other-org')).rejects.toThrow('Employee not found');
    expect(ctx.db.employee.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{organizationId:'other-org'}}));
  });
  it('rejects a foreign or missing replacement ID', async () => {
    const {service,employees}=setup();await service.registerOnboardingBatch('org','batch', Role.ADMIN);
    await expect(service.updateEmployeeReporting(employees[0].id,'org','employee:foreign')).rejects.toThrow('this organization');
    expect(employees[0].pendingReportingRecordId).toBe('manager');
  });
  it('does not let a normal profile save clear an unrelated pending manager', async () => {
    const {service,employees}=setup();await service.registerOnboardingBatch('org','batch', Role.ADMIN);
    await service.updateEmployee(employees[0].id,'org',{reportingManagerId:'',jobTitle:'Senior Operator'});
    expect(employees[0]).toMatchObject({pendingReportingRecordId:'manager',reportingManagerId:null,jobTitle:'Senior Operator'});
  });
});

describe('employee reporting request validation', () => {
  it.each(['', 'record:abc', 'UNKNOWN', 'employee:', 'employee:a/b', null, undefined])('rejects invalid target %s', target => {
    expect(validateSync(plainToInstance(UpdateEmployeeReportingDto,{target})).length).toBeGreaterThan(0);
  });
  it.each(['BOARD','employee:abc-123'])('accepts target %s', target => {
    expect(validateSync(plainToInstance(UpdateEmployeeReportingDto,{target}))).toHaveLength(0);
  });
});


describe('Board reporting completion', () => {
  it('counts explicit Board reporting as complete without an individual manager', () => {
    expect(calcEmployeeCompletion({reportsToBoard:true}).groups.WORK_ALLOCATION).toBe(calcEmployeeCompletion({reportingManagerId:'boss'}).groups.WORK_ALLOCATION);
    expect(calcEmployeeCompletion({reportsToBoard:true}).groups.WORK_ALLOCATION).toBeGreaterThan(calcEmployeeCompletion({}).groups.WORK_ALLOCATION);
  });
});


describe('onboarding registration with independent people links', () => {
  it('registers a valid report with a pending reliever, then fills the slot when that person registers', async () => {
    const {service,manager,ann,employees}=setup();
    Object.assign(ann,{reliever1RecordId:'manager',reliever1Name:'Peter Otieno',reliever1Designation:'HOD'});
    await service.validateOnboardingBatch('org','batch');
    expect(ann.status).toBe('READY'); expect(manager.status).toBe('NEEDS_FIXING');
    expect((await service.registerOnboardingBatch('org','batch', Role.ADMIN)).registered).toBe(1);
    const employee=employees.find(e=>e.employeeCode==='A1');
    expect(employee).toMatchObject({firstRelieverId:null,pendingFirstRelieverRecordId:'manager'});
    await service.updateOnboardingRecord('org','manager',{mobileNumber:'0712345679',whatsappNumber:'0712345679'});
    expect((await service.registerOnboardingBatch('org','batch', Role.ADMIN)).registered).toBe(1);
    expect(employee).toMatchObject({firstRelieverId:'employee-M1',pendingFirstRelieverRecordId:null});
    await expect(service.registerOnboardingBatch('org','batch', Role.ADMIN)).rejects.toThrow('No records are ready');
    expect(employees).toHaveLength(2);
  });
  it('blocks registration when a stale Ready row now has an excluded reliever', async () => {
    const {service,manager,ann,employees}=setup();
    Object.assign(ann,{reliever1RecordId:'manager',reportingToRecordId:null,reportingToBoard:true,reportingToName:null,reportingToDesignation:'Board'});
    manager.status='EXCLUDED';
    expect((await service.registerOnboardingBatch('org','batch', Role.ADMIN)).failed).toBe(1);
    expect(employees).toHaveLength(0);
  });
});
