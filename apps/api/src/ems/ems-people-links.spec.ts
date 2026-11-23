import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ConflictException } from '@nestjs/common';
import { EmsController } from './ems.controller';
import { ROLES_KEY } from 'src/auth/decorators/roles.decorator';
import { Role } from 'src/common/enum/role.enum';
import { UpdateDepartmentHodDto, UpdateEmployeeRelieversDto } from './dto/onboarding.dto';
import { assertPeopleLinksAllowBatchRemoval, employeePeopleLinks, loadPeopleLinks, relieverDraftData,
  resolvePendingPeopleLinks, saveDepartmentHod, saveEmployeeHod, saveEmployeeRelievers } from './ems-people-links';

// Stateful query doubles verify decisions and conditional writes; database isolation is checked separately.
function fixture() {
  const rows:any[]=['a','boss','other-branch'].map((id,i)=>({id,batchId:'batch',organizationId:'org',status:'READY',firstName:id,lastName:'Person',
    jobDesignation:'Operator',currentDepartment:'Production',plantBranchCode:i===2?'Mombasa':'Nairobi',hodName:'boss Person',hodDesignation:'Operator'}));
  const employees:any[]=['employee','replacement'].map(id=>({id,organizationId:'org',firstName:id,lastName:'Person',jobTitle:'Operator',
    departmentId:'production',department:{name:'Production'},plantBranch:'Nairobi',firstRelieverId:null,secondRelieverId:null,pendingFirstRelieverRecordId:null,pendingSecondRelieverRecordId:null}));
  const assignments:any[]=[];
  const batch={id:'batch',organizationId:'org',status:'READY',records:rows};
  const matches=(obj:any,where:any)=>Object.entries(where).every(([key,value]:any)=> key==='department' ? value.organizationId==='org' : obj[key]===value);
  const db:any={
    employee:{findMany:jest.fn(async({where})=>employees.filter(e=>e.organizationId===where.organizationId)),
      update:jest.fn(async({where,data})=>Object.assign(employees.find(e=>matches(e,where)),data)),
      updateMany:jest.fn(async({where,data})=>{const selected=employees.filter(e=>matches(e,where));selected.forEach(e=>Object.assign(e,data));return {count:selected.length};}),
      count:jest.fn().mockResolvedValue(0)},
    department:{findMany:jest.fn(async({where})=>where.organizationId==='org'?[{id:'production',name:'Production'}]:[])},
    emsDepartmentHod:{findMany:jest.fn(async({where})=>where.department.organizationId==='org'?assignments:[]),count:jest.fn().mockResolvedValue(0),
      upsert:jest.fn(async({where,create,update})=>{let a=assignments.find(a=>a.departmentId===where.departmentId_branchKey.departmentId&&a.branchKey===where.departmentId_branchKey.branchKey);
        if(a)Object.assign(a,update);else {a={id:'head-'+assignments.length,...create};assignments.push(a);}return a;}),
      updateMany:jest.fn(async({where,data})=>{const selected=assignments.filter(a=>matches(a,where));selected.forEach(a=>Object.assign(a,data));return {count:selected.length};})},
    emsOnboardingBatch:{findFirst:jest.fn(async({where})=>where.organizationId==='org'&&where.id===batch.id?batch:null)},
    emsOnboardingRecord:{findMany:jest.fn(async({where})=>rows.filter(r=>r.organizationId===where.organizationId&&where.id.in.includes(r.id))),
      updateMany:jest.fn(async({where,data})=>{const selected=rows.filter(r=>r.organizationId===where.organizationId&&r.batchId===where.batchId&&where.id.in.includes(r.id)&&!where.status.notIn.includes(r.status));
        selected.forEach(r=>Object.assign(r,data));return {count:selected.length};})},
  };
  const version=async()=> (await loadPeopleLinks(db,'org',rows)).byRecord.a.hod.version;
  return {db,rows,employees,assignments,batch,version};
}

describe('department HOD persistence and review',()=>{
  it('saves one branch-scoped pending head and confirms only active same-scope rows, preserving imported text',async()=>{
    const f=fixture();f.rows.push({...f.rows[0],id:'excluded',status:'EXCLUDED'});
    await saveDepartmentHod(f.db,'org','batch','a','record:boss',await f.version(),'reviewer');
    expect(f.assignments).toEqual([expect.objectContaining({departmentId:'production',branchKey:'nairobi',pendingRecordId:'boss',employeeId:null,updatedByUserId:'reviewer',revision:1})]);
    expect(f.rows[0].hodReviewKey).toBe('head-0:1');expect(f.rows[1].hodReviewKey).toBe('head-0:1');
    expect(f.rows[2].hodReviewKey).toBeUndefined();expect(f.rows[3].hodReviewKey).toBeUndefined();expect(f.rows[0].hodName).toBe('boss Person');
  });
  it('rejects a stale HOD revision without overwriting the new choice',async()=>{
    const f=fixture(),old=await f.version();await saveDepartmentHod(f.db,'org','batch','a','record:boss',old,'reviewer');
    await expect(saveDepartmentHod(f.db,'org','batch','a','employee:replacement',old,'reviewer')).rejects.toBeInstanceOf(ConflictException);
    expect(f.assignments[0].pendingRecordId).toBe('boss');
  });
  it('rejects a stale department or branch scope',async()=>{
    const f=fixture(),old=await f.version();f.rows[0].plantBranchCode='Mombasa';
    await expect(saveDepartmentHod(f.db,'org','batch','a','record:boss',old,'reviewer')).rejects.toBeInstanceOf(ConflictException);
    expect(f.assignments).toEqual([]);
  });
  it('preserves the revision on unchanged choices and increments on explicit reassignment',async()=>{
    const f=fixture();await saveDepartmentHod(f.db,'org','batch','a','record:boss',await f.version(),'reviewer');
    await saveDepartmentHod(f.db,'org','batch','a','record:boss',await f.version(),'reviewer');expect(f.assignments[0].revision).toBe(1);
    await saveDepartmentHod(f.db,'org','batch','a','employee:replacement',await f.version(),'reviewer');expect(f.assignments[0].revision).toBe(2);
  });
  it('rejects foreign IDs and inactive or foreign import records',async()=>{
    const f=fixture();await expect(saveDepartmentHod(f.db,'org','batch','a','employee:foreign',await f.version(),'reviewer')).rejects.toThrow(/unavailable/);
    f.rows[0].status='EXCLUDED';await expect(saveDepartmentHod(f.db,'org','batch','a','NONE',await f.version(),'reviewer')).rejects.toThrow(/active/);
    await expect(saveDepartmentHod(f.db,'other-org','batch','a','NONE','x','reviewer')).rejects.toThrow(/not found/);
  });
  it('requires the authenticated reviewer ID',async()=>{
    const f=fixture();await expect(saveDepartmentHod(f.db,'org','batch','a','NONE',await f.version(),'')).rejects.toThrow(/authenticated/);
  });
  it('allows a person to be HOD of their own department without changing their access role',async()=>{
    const f=fixture(),current=await employeePeopleLinks(f.db,'org','employee');
    await saveEmployeeHod(f.db,'org','employee','employee:employee',current.hodVersion,'reviewer');
    expect(f.assignments[0].employeeId).toBe('employee');expect(f.db.employee.update).not.toHaveBeenCalled();
  });
  it('registers the pending head without changing the reviewed revision',async()=>{
    const f=fixture();await saveDepartmentHod(f.db,'org','batch','a','record:boss',await f.version(),'reviewer');
    Object.assign(f.rows[1],{status:'REGISTERED',employeeId:'replacement'});await resolvePendingPeopleLinks(f.db,'org');
    expect(f.assignments[0]).toMatchObject({employeeId:'replacement',pendingRecordId:null,revision:1});
    expect(f.db.emsDepartmentHod.updateMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({revision:1,pendingRecordId:'boss',employeeId:null,isUnassigned:false})}));
  });
  it('increments revision when an unavailable head becomes explicitly unassigned',async()=>{
    const f=fixture();f.assignments.push({id:'head',departmentId:'production',branchKey:'nairobi',branchLabel:'Nairobi',employeeId:null,pendingRecordId:null,isUnassigned:false,revision:3});
    const current=await employeePeopleLinks(f.db,'org','employee');
    await saveEmployeeHod(f.db,'org','employee','NONE',current.hodVersion,'reviewer');
    expect(f.assignments[0]).toMatchObject({isUnassigned:true,revision:4});
  });
});

describe('reliever draft and employee lifecycle',()=>{
  it('shows legacy HOD text as unconfirmed evidence without inventing a department assignment',async()=>{
    const f=fixture();Object.assign(f.employees[0],{hodName:'Legacy Head',hodDesignation:'Director'});
    const current=await employeePeopleLinks(f.db,'org','employee');
    expect(current.hod.state).toBe('UNASSIGNED');expect(current.previousHod).toEqual({name:'Legacy Head',designation:'Director'});expect(f.assignments).toEqual([]);
  });

  it('canonicalizes an import selection that registered while the editor was open',async()=>{
    const f=fixture();Object.assign(f.rows[1],{status:'REGISTERED',employeeId:'replacement'});
    expect(await relieverDraftData(f.db,'org',f.rows,f.rows[0],{reliever1Target:'record:boss'})).toMatchObject({reliever1RecordId:null,reliever1EmployeeId:'replacement'});
  });
  it('clears an old selection when imported text is actually edited, but preserves it on unrelated saves',async()=>{
    const f=fixture();Object.assign(f.rows[0],{reliever1RecordId:'boss',reliever1Name:'boss Person'});
    expect(await relieverDraftData(f.db,'org',f.rows,f.rows[0],{})).toEqual({});
    expect(await relieverDraftData(f.db,'org',f.rows,f.rows[0],{reliever1Name:'Someone Else'})).toEqual({reliever1RecordId:null,reliever1EmployeeId:null});
  });
  it('requires a registered choice or retention of the unchanged pending choice on the employee profile',async()=>{
    const f=fixture();f.employees[0].pendingFirstRelieverRecordId='boss';let current=await employeePeopleLinks(f.db,'org','employee');
    await saveEmployeeRelievers(f.db,'org','employee','record:boss','NONE',current.version);
    expect(f.employees[0].pendingFirstRelieverRecordId).toBe('boss');
    await expect(saveEmployeeRelievers(f.db,'org','employee','record:a','NONE',current.version)).rejects.toThrow(/existing employee/);
  });
  it('completes pending first and second links once, without duplicating writes on another pass',async()=>{
    const f=fixture();f.employees[0].pendingFirstRelieverRecordId='boss';f.employees[1].pendingSecondRelieverRecordId='a';
    Object.assign(f.rows[1],{status:'REGISTERED',employeeId:'replacement'});Object.assign(f.rows[0],{status:'REGISTERED',employeeId:'employee'});
    await resolvePendingPeopleLinks(f.db,'org');expect(f.employees[0]).toMatchObject({firstRelieverId:'replacement',pendingFirstRelieverRecordId:null});
    expect(f.employees[1]).toMatchObject({secondRelieverId:'employee',pendingSecondRelieverRecordId:null});
    f.db.employee.updateMany.mockClear();await resolvePendingPeopleLinks(f.db,'org');expect(f.db.employee.updateMany).not.toHaveBeenCalled();
  });
  it('does not overwrite HR replacement when the former pending reliever registers',async()=>{
    const f=fixture();f.employees[0].pendingFirstRelieverRecordId='boss';const current=await employeePeopleLinks(f.db,'org','employee');
    await saveEmployeeRelievers(f.db,'org','employee','employee:replacement','NONE',current.version);
    f.employees.push({...f.employees[1],id:'late'});Object.assign(f.rows[1],{status:'REGISTERED',employeeId:'late'});
    await resolvePendingPeopleLinks(f.db,'org');expect(f.employees[0]).toMatchObject({firstRelieverId:'replacement',pendingFirstRelieverRecordId:null});
  });
  it('rejects stale reliever saves, self choices, duplicate slots, and foreign IDs',async()=>{
    const f=fixture(),current=await employeePeopleLinks(f.db,'org','employee');
    for(const [first,second] of [['employee:employee','NONE'],['employee:replacement','employee:replacement'],['employee:foreign','NONE']])
      await expect(saveEmployeeRelievers(f.db,'org','employee',first,second,current.version)).rejects.toThrow();
    await expect(saveEmployeeRelievers(f.db,'org','employee','NONE','NONE','stale')).rejects.toBeInstanceOf(ConflictException);
    expect(f.db.employee.update).not.toHaveBeenCalled();
  });
  it('flags excluded and cancelled pending people without clearing their reference',async()=>{
    const f=fixture();f.employees[0].pendingFirstRelieverRecordId='boss';f.rows[1].status='EXCLUDED';
    expect((await employeePeopleLinks(f.db,'org','employee')).first.state).toBe('NEEDS_ATTENTION');
    f.rows[1].status='READY';f.rows[1].batch={status:'CANCELLED'};
    expect((await employeePeopleLinks(f.db,'org','employee')).first.state).toBe('NEEDS_ATTENTION');
    expect(f.employees[0].pendingFirstRelieverRecordId).toBe('boss');
  });
  it('blocks removal of imports referenced by pending employee or department links',async()=>{
    const f=fixture();f.db.employee.count.mockResolvedValue(1);await expect(assertPeopleLinksAllowBatchRemoval(f.db,'org','batch')).rejects.toThrow(/replacements/);
    f.db.employee.count.mockResolvedValue(0);f.db.emsDepartmentHod.count.mockResolvedValue(1);await expect(assertPeopleLinksAllowBatchRemoval(f.db,'org','batch')).rejects.toThrow(/replacements/);
    f.db.emsDepartmentHod.count.mockResolvedValue(0);await expect(assertPeopleLinksAllowBatchRemoval(f.db,'org','batch')).resolves.toBeUndefined();
  });
  it('does not expose another organization’s employees or options',async()=>{
    const f=fixture();await expect(employeePeopleLinks(f.db,'foreign','employee')).rejects.toThrow(/not found/);
    expect(f.db.employee.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{organizationId:'foreign'}}));
  });
});

describe('people-link boundary contracts',()=>{
  it('requires HR/admin roles on every new endpoint',()=>{
    for(const method of ['updateOnboardingDepartmentHod','getEmployeePeopleLinks','updateEmployeeRelievers','updateEmployeeDepartmentHod'])
      expect(Reflect.getMetadata(ROLES_KEY,(EmsController.prototype as any)[method])).toEqual([Role.SUPER_ADMIN,Role.ADMIN,Role.HR]);
  });
  it('validates target syntax and requires the stale-write snapshot',()=>{
    expect(validateSync(plainToInstance(UpdateDepartmentHodDto,{recordId:'a',target:'record:boss',expectedVersion:'snapshot'}))).toEqual([]);
    expect(validateSync(plainToInstance(UpdateDepartmentHodDto,{recordId:'a',target:'BOARD',expectedVersion:'snapshot'})).length).toBeGreaterThan(0);
    expect(validateSync(plainToInstance(UpdateEmployeeRelieversDto,{first:'NONE',second:'employee:x'})).length).toBeGreaterThan(0);
  });
});

describe('HOD scope and existing-system suggestions',()=>{
  it('replaces the same profile scope once and removes the old head from that directory entry',async()=>{
    const f=fixture();
    let current=await employeePeopleLinks(f.db,'org','employee');
    expect(current.hasHodAssignment).toBe(false);
    await saveEmployeeHod(f.db,'org','employee','employee:employee',current.hodVersion,'reviewer');
    current=await employeePeopleLinks(f.db,'org','employee');
    await saveEmployeeHod(f.db,'org','employee','employee:replacement',current.hodVersion,'reviewer');
    const after=await employeePeopleLinks(f.db,'org','employee');
    expect(f.assignments).toHaveLength(1);expect(after.hod.target).toBe('employee:replacement');expect(after.hasHodAssignment).toBe(true);
    expect(after.hodDirectory).toHaveLength(1);expect(after.hodDirectory[0]).toMatchObject({departmentId:'production',branchKey:'nairobi',target:'employee:replacement'});
  });
  it('keeps two branch appointments separate even when both heads work in Nairobi',async()=>{
    const f=fixture();
    await saveDepartmentHod(f.db,'org','batch','a','employee:employee',await f.version(),'reviewer');
    const other=(await loadPeopleLinks(f.db,'org',f.rows)).byRecord['other-branch'].hod;
    await saveDepartmentHod(f.db,'org','batch','other-branch','employee:replacement',other.version,'reviewer');
    expect(f.assignments).toHaveLength(2);
    const result=await loadPeopleLinks(f.db,'org',f.rows);
    expect(result.byRecord.a.hod.target).toBe('employee:employee');
    expect(result.byRecord['other-branch'].hod.target).toBe('employee:replacement');
    expect(result.hodDirectory.find(e=>e.branch==='Mombasa')).toMatchObject({branchKey:'mombasa',person:{branch:'Nairobi'}});
  });
  it('returns existing recorded hints only for the same department and branch without extra queries or writes',async()=>{
    const f=fixture();Object.assign(f.employees[0],{hodName:'replacement Person',hodDesignation:'Operator'});
    const batch=await loadPeopleLinks(f.db,'org',f.rows);
    expect(batch.byRecord.a.hod.recordedSuggestions?.[0].target).toBe('employee:replacement');
    expect(batch.byRecord['other-branch'].hod.recordedSuggestions).toEqual([]);
    expect(batch.byRecord.a.hod.target).toBeNull();expect(f.assignments).toEqual([]);
    expect(f.db.employee.findMany).toHaveBeenCalledTimes(1);expect(f.db.emsDepartmentHod.upsert).not.toHaveBeenCalled();
    expect((await employeePeopleLinks(f.db,'org','employee')).recordedHodSuggestions?.[0].target).toBe('employee:replacement');
  });
  it('retains a confirmed choice even when older profile text names another head',async()=>{
    const f=fixture();Object.assign(f.employees[0],{hodName:'employee Person',hodDesignation:'Operator'});
    const before=await employeePeopleLinks(f.db,'org','employee');
    await saveEmployeeHod(f.db,'org','employee','employee:replacement',before.hodVersion,'reviewer');
    const after=await employeePeopleLinks(f.db,'org','employee');
    expect(after.hod.target).toBe('employee:replacement');expect(after.recordedHodSuggestions?.[0].target).toBe('employee:employee');
    expect(f.assignments).toHaveLength(1);
  });
});
