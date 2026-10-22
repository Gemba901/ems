import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PrismaService } from 'src/prisma/prisma.service';
import { DwmsService } from 'src/dwms/dwms.service';
import { EmsController } from './ems.controller';
import { EmsService } from './ems.service';
import { changeEmploymentStatus, getEmploymentStatus, retryEmploymentActivitySync } from './ems-employment-status';
import { isActiveEmployment, ACTIVE_EMPLOYMENT_STATUSES, INACTIVE_EMPLOYMENT_STATUSES } from './employment-status';
import { ChangeEmploymentStatusDto, EmploymentStatusDto, EmployeeActivityStateDto, QueryEmsEmployeesDto } from './dto/ems.dto';

const date = new Date('2026-10-20T10:00:00.000Z');
function fixture() {
  let employee = { id: 'employee', organizationId: 'org', employmentStatus: 'ACTIVE', employmentStatusRevision: 0, updatedAt: date, departmentId: 'dept', jobTitle: 'Inspector' };
  let history: any[] = [];
  const matches = (row: any, where: any) => Object.entries(where).every(([key, val]) => val instanceof Date ? row[key]?.getTime() === val.getTime() : row[key] === val);
  const sync = jest.fn().mockResolvedValue(undefined);
  const prisma: any = {
    employee: {
      findFirst: jest.fn(async ({where}) => matches(employee, where) ? {...employee} : null),
      updateMany: jest.fn(async ({where, data}) => {
        if (!matches(employee, where)) return { count: 0 };
        employee = {...employee, employmentStatus: data.employmentStatus, employmentStatusRevision: employee.employmentStatusRevision + 1, updatedAt: new Date(employee.updatedAt.getTime() + 1)};
        return { count: 1 };
      }),
    },
    user: { findUnique: jest.fn(async () => ({ name: 'HR Reviewer' })) },
    emsEmploymentStatusChange: {
      findUnique: jest.fn(async ({where}) => history.find(row => matches(row, where.organizationId_requestId)) ?? null),
      findFirst: jest.fn(async ({where}) => history.find(row => matches(row, where)) ?? null),
      findMany: jest.fn(async ({where, take}) => history.filter(row => matches(row, where)).sort((a,b) => b.revision-a.revision).slice(0,take)),
      create: jest.fn(async ({data}) => { const row = {...data, id: randomUUID(), changedAt: new Date(), activitySync: 'PENDING'}; history.push(row); return {...row}; }),
      updateMany: jest.fn(async ({where, data}) => { const row = history.find(row => matches(row, where)); if(row) Object.assign(row, data); return {count: row ? 1 : 0}; }),
    },
    $transaction: jest.fn(async (fn: any) => { const before = structuredClone({employee,history}); try { return await fn(prisma); } catch(e) {employee=before.employee;history=before.history;throw e;} }),
  };
  const dto = (status = EmploymentStatusDto.SUSPENDED): ChangeEmploymentStatusDto => ({status,reason:'  HR review decision  ',expectedRevision:employee.employmentStatusRevision,expectedUpdatedAt:employee.updatedAt.toISOString(),requestId:randomUUID()});
  const run = (payload = dto(), org = 'org', actor = 'hr') => changeEmploymentStatus(prisma as PrismaService, {synchronizeEmployeeActivities:sync} as unknown as DwmsService, org, 'employee', actor, payload);
  return {prisma, sync, dto, run, state:() => ({employee,history}), externalEdit:() => {employee.updatedAt=new Date(employee.updatedAt.getTime()+1);}};
}

describe('employment status rules', () => {
  test.each(ACTIVE_EMPLOYMENT_STATUSES)('%s is active', status => expect(isActiveEmployment(status)).toBe(true));
  test.each([...INACTIVE_EMPLOYMENT_STATUSES, null, 'ON_LEAVE', 'unknown'])('%s is not treated as active', status => expect(isActiveEmployment(status)).toBe(false));
});

test('confirmed change is scoped, audited and invokes existing DWMS contract', async () => {
  const f=fixture(); const result=await f.run();
  expect(result).toMatchObject({status:'SUSPENDED',activityState:'INACTIVE',revision:1,syncChangeId:null});
  expect(result.history[0]).toMatchObject({fromStatus:'ACTIVE',toStatus:'SUSPENDED',actorUserId:'hr',actorName:'HR Reviewer',reason:'HR review decision',source:'EMS_MANUAL',activitySync:'SYNCED'});
  expect(f.sync).toHaveBeenCalledWith('org','employee',{previousDepartmentId:'dept',previousJobTitle:'Inspector',previousEmploymentStatus:'ACTIVE'});
  expect(f.prisma.$transaction.mock.calls[0][1]).toMatchObject({isolationLevel:'Serializable'});
});
test('inactive to probation reactivates without touching accounts or identity', async () => {
  const f=fixture();await f.run();const result=await f.run(f.dto(EmploymentStatusDto.PROBATION));
  expect(result).toMatchObject({status:'PROBATION',activityState:'ACTIVE',revision:2});
  expect(f.prisma.user.findUnique).toHaveBeenCalledTimes(2);
  expect(f.state().employee).toMatchObject({departmentId:'dept',jobTitle:'Inspector',organizationId:'org'});
});
test('same confirmation retry adds no history and performs no second successful sync', async () => {
  const f=fixture(), dto=f.dto();await f.run(dto);await f.run(dto);
  expect(f.state().history).toHaveLength(1);expect(f.sync).toHaveBeenCalledTimes(1);
});
test('cannot reuse a confirmation for another reason or actor', async () => {
  const f=fixture(), dto=f.dto();await f.run(dto);
  await expect(f.run({...dto,reason:'Different decision'})).rejects.toThrow('confirmation key');
  await expect(f.run(dto,'org','other-hr')).rejects.toThrow('confirmation key');
  expect(f.state().history).toHaveLength(1);
});
test('stale HR confirmation cannot overwrite a newer status', async () => {
  const f=fixture(), stale=f.dto(EmploymentStatusDto.RETIRED);await f.run();
  await expect(f.run(stale)).rejects.toThrow('changed while');expect(f.state().employee.employmentStatus).toBe('SUSPENDED');
});
test('ABA status changes still reject an old confirmation', async () => {
  const f=fixture(), stale=f.dto();await f.run();await f.run(f.dto(EmploymentStatusDto.ACTIVE));
  await expect(f.run(stale)).rejects.toThrow('changed while');
});
test('edits through another endpoint invalidate a stale snapshot', async () => {
  const f=fixture(), stale=f.dto();f.externalEdit();await expect(f.run(stale)).rejects.toThrow('changed while');expect(f.state().history).toHaveLength(0);
});
test('same status is a no-op error without history or sync', async () => {
  const f=fixture();await expect(f.run(f.dto(EmploymentStatusDto.ACTIVE))).rejects.toThrow('already has');expect(f.sync).not.toHaveBeenCalled();
});
test('cross-organisation read, change and retry cannot access this employee', async () => {
  const f=fixture();await expect(f.run(f.dto(),'other-org')).rejects.toThrow('Employee not found');
  await expect(getEmploymentStatus(f.prisma,'other-org','employee')).rejects.toThrow('Employee not found');
  await f.run();await expect(retryEmploymentActivitySync(f.prisma,undefined,'other-org','employee',f.state().history[0].id)).rejects.toThrow('not found');
});
test('history failure rolls back status and revision', async () => {
  const f=fixture();f.prisma.emsEmploymentStatusChange.create.mockRejectedValueOnce(Error('database unavailable'));
  await expect(f.run()).rejects.toThrow('database unavailable');expect(f.state().employee.employmentStatusRevision).toBe(0);expect(f.sync).not.toHaveBeenCalled();
});
test('CAS losing an edit is a conflict without an audit entry', async () => {
  const f=fixture();f.prisma.employee.updateMany.mockResolvedValueOnce({count:0});
  await expect(f.run()).rejects.toThrow('changed while');expect(f.state().history).toHaveLength(0);
});
test('activity failure retains saved status and can be retried', async () => {
  const f=fixture();f.sync.mockRejectedValueOnce(Error('dwms offline'));
  const result=await f.run();expect(result).toMatchObject({status:'SUSPENDED',activitySync:'FAILED'});expect(result.syncChangeId).toBeTruthy();
  const retried=await retryEmploymentActivitySync(f.prisma,{synchronizeEmployeeActivities:f.sync} as unknown as DwmsService,'org','employee',result.syncChangeId!);
  expect(retried.syncChangeId).toBeNull();expect(f.state().history).toHaveLength(1);
});
test('missing DWMS is explicitly unavailable, not falsely synced', async () => {
  const f=fixture();const result=await changeEmploymentStatus(f.prisma,undefined,'org','employee','hr',f.dto());
  expect(result.activitySync).toBe('UNAVAILABLE');expect(result.syncChangeId).toBeTruthy();
});
test('sync result write failure leaves recoverable PENDING rather than failing the save', async () => {
  const f=fixture();f.prisma.emsEmploymentStatusChange.updateMany.mockRejectedValueOnce(Error('lost connection'));
  expect(await f.run()).toMatchObject({status:'SUSPENDED',activitySync:'PENDING'});
});
test('retry of an old event never reapplies old status or triggers sync', async () => {
  const f=fixture();f.sync.mockRejectedValueOnce(Error('offline'));const first=await f.run();await f.run(f.dto(EmploymentStatusDto.RETIRED));f.sync.mockClear();
  const result=await retryEmploymentActivitySync(f.prisma,{synchronizeEmployeeActivities:f.sync} as unknown as DwmsService,'org','employee',first.syncChangeId!);
  expect(result.status).toBe('RETIRED');expect(f.sync).not.toHaveBeenCalled();
});
test('missing trusted actor is rejected', async () => {const f=fixture();await expect(f.run(f.dto(),'org','')).rejects.toThrow();expect(f.state().history).toHaveLength(0);});
test.each([{reason:'  '},{reason:'x'.repeat(501)},{status:'ON_LEAVE'},{expectedRevision:-1},{requestId:'forged'},{expectedUpdatedAt:'bad'}])('invalid payload %j is rejected without a write',async invalid=>{
  const f=fixture();await expect(f.run({...f.dto(),...invalid} as ChangeEmploymentStatusDto)).rejects.toThrow();expect(f.state().history).toHaveLength(0);
});
test('DTO validates trimmed reasons and rejects forged actor/source fields under whitelist validation', async () => {
  const f=fixture();const dto=plainToInstance(ChangeEmploymentStatusDto,{...f.dto(),actorUserId:'forged',source:'EXIT_MODULE'});
  const errors=await validate(dto,{whitelist:true,forbidNonWhitelisted:true});expect(errors.map(e=>e.property)).toEqual(expect.arrayContaining(['actorUserId','source']));expect(dto.reason).toBe('HR review decision');
});
test('status controller takes organisation and actor from current user, with HR-only metadata', async () => {
  const change=jest.fn(),controller=new EmsController({changeEmploymentStatus:change} as unknown as EmsService),dto=fixture().dto();
  await controller.changeEmploymentStatus('employee',dto,{organizationId:'trusted-org',userId:'trusted-user'});
  expect(change).toHaveBeenCalledWith('employee','trusted-org','trusted-user',dto);
  for(const handler of ['getEmploymentStatus','changeEmploymentStatus','retryEmploymentActivitySync'] as const){
    const roles=Reflect.getMetadata('roles',EmsController.prototype[handler]);
    expect(roles).toEqual(expect.arrayContaining(['ADMIN','HR','SUPER_ADMIN']));expect(roles).not.toContain('EMPLOYEE');
  }
});
test('active filter includes probation; inactive filter includes all six reasons', async () => {
  const f=fixture();f.prisma.employee.findMany=jest.fn(async()=>[]);f.prisma.employee.count=jest.fn(async()=>0);const service=new EmsService(f.prisma);
  for(const state of [EmployeeActivityStateDto.ACTIVE,EmployeeActivityStateDto.INACTIVE]){
    await service.getEmployees('org',{page:1,limit:20,activityState:state});
    expect(f.prisma.employee.findMany).toHaveBeenLastCalledWith(expect.objectContaining({where:{organizationId:'org',employmentStatus:{in:state==='ACTIVE'?ACTIVE_EMPLOYMENT_STATUSES:INACTIVE_EMPLOYMENT_STATUSES}}}));
  }
  await expect(service.getEmployees('org',{page:1,limit:20,activityState:EmployeeActivityStateDto.ACTIVE,employmentStatus:EmploymentStatusDto.RETIRED})).rejects.toThrow('does not belong');
});
test('generic profile save cannot bypass status confirmation', async () => {
  const f=fixture(),service=new EmsService(f.prisma);(service as any).lockReporting=jest.fn();
  await expect(service.updateEmployee('employee','org',{employmentStatus:EmploymentStatusDto.RETIRED})).rejects.toThrow('Use Change employment status');expect(f.state().history).toHaveLength(0);
});
