import { Role } from 'src/common/enum/role.enum';
import { EmsService, calcEmployeeCompletion } from './ems.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { resolveReporting, ReportingRow } from './onboarding-hierarchy';
import { REPORTING_BODIES, importedReportingBody } from './reporting-bodies';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdateEmployeeReportingDto, UpdateOnboardingRecordDto } from './dto/onboarding.dto';
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


const sourceRow = (extra: Partial<ReportingRow> = {}): ReportingRow => ({id:'head',batchId:'batch',status:'READY',firstName:'Grace',lastName:'Wanjiru',jobDesignation:'Director',...extra});
describe('distinct top-level reporting bodies', () => {
  it.each(REPORTING_BODIES)('resolves imported $label and retains its chain endpoint', ({value,label}) => {
    const head=sourceRow({reportingToName:null,reportingToDesignation:label});
    const report=sourceRow({id:'report',firstName:'Samuel',lastName:'Kiprono',reportingToRecordId:'head'});
    const hierarchy=resolveReporting([report,head],[]);
    expect(hierarchy.byRecord.head).toMatchObject({target:value,error:null,depth:0,managerName:label,state:value==='BOARD'?'BOARD':'BODY'});
    expect(hierarchy.byRecord.report).toMatchObject({target:'record:head',error:null,depth:1});
    expect(hierarchy.byRecord.report.chain?.at(-1)).toMatchObject({target:value,name:label});
    expect(hierarchy.orderedIds).toEqual(['head','report']);
  });
  it.each(REPORTING_BODIES)('accepts $label in record/profile DTOs and counts it in completion', ({value}) => {
    expect(validateSync(plainToInstance(UpdateEmployeeReportingDto,{target:value}))).toEqual([]);
    expect(validateSync(plainToInstance(UpdateOnboardingRecordDto,{reportingTarget:value}))).toEqual([]);
    expect(calcEmployeeCompletion({reportingBody:value}).groups.WORK_ALLOCATION).toBe(calcEmployeeCompletion({reportingManagerId:'person'}).groups.WORK_ALLOCATION);
  });
  it('matches a named Owner as a person and does not replace them with the Owner body', () => {
    const employee={id:'owner-person',firstName:'Grace',lastName:'Wanjiru',jobTitle:'Owner',reportsToBoard:true};
    const result=resolveReporting([sourceRow({reportingToName:'Grace Wanjiru',reportingToDesignation:'Owner'})],[employee]);
    expect(result.byRecord.head).toMatchObject({target:'employee:owner-person',error:null});
  });
  it('does not turn an unmatched named owner into a body', () => {
    const result=resolveReporting([sourceRow({reportingToName:'Unknown Person',reportingToDesignation:'Owner'})],[]).byRecord.head;
    expect(result.target).toBeNull();expect(result.error).toBeTruthy();
  });
  it.each([
    {reportingToBody:'OWNER',reportingToBoard:true},
    {reportingToBody:'COMMITTEE',reportingToRecordId:'other'},
    {reportingToBody:'UNSUPPORTED'},
  ])('rejects invalid or conflicting saved choices %j', extra => {
    expect(resolveReporting([sourceRow(extra)],[]).byRecord.head.error).toBeTruthy();
  });
  it('rejects conflicting employee roots instead of claiming a valid chain', () => {
    const employee={id:'e',firstName:'Grace',lastName:'Wanjiru',jobTitle:'Director',reportingBody:'OWNER',reportsToBoard:true};
    expect(resolveReporting([],[employee]).byEmployee.e.error).toBeTruthy();
  });
  it('uses exact supported designations with whitespace/case tolerance, not fuzzy body inference', () => {
    expect(importedReportingBody(' management  COMMITTEE ')).toBe('MANAGEMENT_COMMITTEE');
    expect(importedReportingBody('Board of Directors')).toBe('BOARD');
    expect(importedReportingBody('Committee member')).toBeNull();
    expect(validateSync(plainToInstance(UpdateEmployeeReportingDto,{target:'DIRECTORS'})).length).toBeGreaterThan(0);
  });
});
describe('reporting-body save, validation and registration lifecycle', () => {
  it.each(REPORTING_BODIES)('persists $label through save, validation, registration and profile reads', async ({value,label}) => {
    const {service,ann,employees}=setup();
    await service.updateOnboardingRecord('org','ann',{reportingTarget:value});
    expect(ann).toMatchObject({reportingToName:null,reportingToDesignation:label,reportingToRecordId:null,reportingToEmployeeId:null,reportingToBoard:value==='BOARD',reportingToBody:value==='BOARD'?null:value,status:'READY'});
    expect((await service.registerOnboardingBatch('org','batch', Role.ADMIN)).registered).toBe(1);
    const employee=employees[0];
    expect(employee).toMatchObject({reportingManagerId:null,pendingReportingRecordId:null,reportsToBoard:value==='BOARD',reportingBody:value==='BOARD'?null:value});
    expect((await service.getEmployeeReporting(employee.id,'org')).assignment).toMatchObject({target:value,managerName:label,error:null,depth:0});
    expect(employees).toHaveLength(1);
  });
  it('registers an imported Management Committee assignment without a manual second choice', async () => {
    const {service,ann,employees}=setup();
    Object.assign(ann,{reportingToRecordId:null,reportingToName:null,reportingToDesignation:'Management Committee'});
    await service.validateOnboardingBatch('org','batch');expect(ann.status).toBe('READY');
    expect((await service.registerOnboardingBatch('org','batch', Role.ADMIN)).registered).toBe(1);
    expect(employees[0].reportingBody).toBe('MANAGEMENT_COMMITTEE');
  });
  it('changing a profile from Owner to a person clears the body and checks the person normally', async () => {
    const {service,employees}=setup();await service.registerOnboardingBatch('org','batch', Role.ADMIN);
    const ann=employees[0];await service.updateEmployeeReporting(ann.id,'org','OWNER');
    employees.push({id:'boss',organizationId:'org',firstName:'Grace',lastName:'Wanjiru',jobTitle:'CEO',reportsToBoard:true});
    await service.updateEmployeeReporting(ann.id,'org','employee:boss');
    expect(ann).toMatchObject({reportingManagerId:'boss',reportingBody:null,reportsToBoard:false,pendingReportingRecordId:null});
  });
  it('a later manager registration cannot overwrite HR’s Committee replacement', async () => {
    const {service,employees,manager}=setup();await service.registerOnboardingBatch('org','batch', Role.ADMIN);
    const ann=employees[0];await service.updateEmployeeReporting(ann.id,'org','COMMITTEE');
    Object.assign(manager,{mobileNumber:'0712345679',whatsappNumber:'0712345679',status:'READY'});
    await service.registerOnboardingBatch('org','batch', Role.ADMIN);
    expect(ann).toMatchObject({reportingBody:'COMMITTEE',pendingReportingRecordId:null,reportingManagerId:null});
  });
  it('editing imported manager text clears an explicit body and rematches the person', async () => {
    const {service,ann}=setup();await service.updateOnboardingRecord('org','ann',{reportingTarget:'OWNER'});
    await service.updateOnboardingRecord('org','ann',{reportingToName:'Peter Otieno',reportingToDesignation:'HOD'});
    expect(ann.reportingToBody).toBeNull();expect(ann.reportingToBoard).toBe(false);
    const batch=await service.getOnboardingBatch('org','batch');expect(batch.hierarchy.byRecord.ann.target).toBe('record:manager');
  });
  it('exclusion and put-back retain the chosen body', async () => {
    const {service,ann}=setup();await service.updateOnboardingRecord('org','ann',{reportingTarget:'OWNER'});
    await service.excludeOnboardingRecord('org','ann',{reason:'Outside this import'});expect(ann.reportingToBody).toBe('OWNER');
    await service.includeOnboardingRecord('org','ann');expect(ann.reportingToBody).toBe('OWNER');expect(ann.status).toBe('READY');
  });
  it('ignores a forged internal body field in the edit payload', async () => {
    const {service,ann}=setup();await service.updateOnboardingRecord('org','ann',{reportingTarget:'OWNER'});
    await service.updateOnboardingRecord('org','ann',{reportingToBody:'COMMITTEE',reportingToBoard:true} as never);
    expect(ann.reportingToBody).toBe('OWNER');expect(ann.reportingToBoard).toBe(false);
  });
});
