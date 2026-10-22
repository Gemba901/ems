import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdateEmployeeEmsDto } from './dto/ems.dto';
import { assertProfileBirthDate, optionalProfileDate, profileCalendarToday } from './employee-profile-dates';
import { EmsService } from './ems.service';

const errors = (data: object) => validateSync(plainToInstance(UpdateEmployeeEmsDto, data));
test.each([undefined, null, '', '   '])('optional blank date %j does not block unrelated edits', value => {
  const dto=plainToInstance(UpdateEmployeeEmsDto,{jobTitle:'Supervisor',dateOfBirth:value,dateJoined:value});
  expect(validateSync(dto)).toEqual([]);expect(dto.dateOfBirth).toBeUndefined();expect(dto.dateJoined).toBeUndefined();
});
test.each(['not-a-date','2026-02-30','21/10/2026',123])('rejects invalid supplied dates: %j', value=>{
  expect(errors({dateOfBirth:value,dateJoined:value}).map(error=>error.property).sort()).toEqual(['dateJoined','dateOfBirth']);
});
test('valid dates and ISO timestamps remain supported; dates do not become required',()=>{
  expect(errors({jobTitle:'Supervisor'})).toEqual([]);
  expect(errors({dateOfBirth:'2000-02-29',dateJoined:'2026-10-21T00:00:00.000Z'})).toEqual([]);
  expect(optionalProfileDate(' 2020-01-01 ')).toBe('2020-01-01');
});
test('birth-date boundary uses the organisation calendar, including midnight and DST',()=>{
  const now=new Date('2026-10-21T22:00:00Z');
  expect(profileCalendarToday('Africa/Nairobi',now)).toBe('2026-10-22');
  expect(()=>assertProfileBirthDate('2026-10-22','Africa/Nairobi',now)).not.toThrow();
  expect(()=>assertProfileBirthDate('2026-10-23','Africa/Nairobi',now)).toThrow('cannot be in the future');
  expect(profileCalendarToday('America/New_York',new Date('2026-03-08T06:59:00Z'))).toBe('2026-03-08');
});
function fixture(){
  const employee:any={id:'person',organizationId:'org',organization:{timeZone:'Africa/Nairobi'},departmentId:'dept',jobTitle:'Inspector',employmentStatus:'ACTIVE',reportingManagerId:null};
  const update=jest.fn(async({data})=>Object.assign(employee,data));
  const db:any={employee:{findFirst:jest.fn(async()=>({...employee})),update},$transaction:jest.fn(async(fn:any)=>fn(db))};
  const service=new EmsService(db);(service as any).lockReporting=jest.fn();(service as any).resolvePendingAssignments=jest.fn();
  return {employee,db,service,update};
}
test('ordinary profile save after an independent status change retains the new status',async()=>{
  const f=fixture();const draft=plainToInstance(UpdateEmployeeEmsDto,{jobTitle:'Supervisor',dateOfBirth:'',dateJoined:''});
  f.employee.employmentStatus='RETIRED';
  const result=await f.service.updateEmployee('person','org',draft);
  expect(result.employee).toMatchObject({jobTitle:'Supervisor',employmentStatus:'RETIRED'});
  expect(f.update.mock.calls[0][0].data).toEqual({jobTitle:'Supervisor'});
});
test('API rejects a future birth date before any write',async()=>{
  const f=fixture();await expect(f.service.updateEmployee('person','org',{dateOfBirth:'9999-01-01'})).rejects.toThrow('cannot be in the future');
  expect(f.db.$transaction).not.toHaveBeenCalled();expect(f.update).not.toHaveBeenCalled();
});
test('a future joined date remains allowed and does not activate an inactive employee',async()=>{
  const f=fixture();f.employee.employmentStatus='RETIRED';
  await f.service.updateEmployee('person','org',{dateJoined:'2099-01-01'});
  expect(f.employee.dateJoined).toEqual(new Date('2099-01-01'));expect(f.employee.employmentStatus).toBe('RETIRED');
});
