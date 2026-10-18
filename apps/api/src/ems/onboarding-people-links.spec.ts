import { LinkPerson, LinkRecord, HodAssignment, resolveBatchPeopleLinks, resolveRecordRelievers, peopleLinkFindings } from './onboarding-people-links';

const row = (id: string, extra: Partial<LinkRecord> = {}): LinkRecord => ({id, batchId:'batch', status:'READY', firstName:id,
  lastName:'Person', jobDesignation:'Operator', currentDepartment:'Production', plantBranchCode:'Nairobi', ...extra});
const person = (id: string, extra: Partial<LinkPerson> = {}): LinkPerson => ({target:`record:${id}`, recordId:id, batchId:'batch', name:`${id} Person`,
  designation:'Operator', department:'Production', branch:'Nairobi', employeeCode:id, ...extra});
const head = (extra: Partial<HodAssignment> = {}): HodAssignment => ({id:'head', departmentId:'production', branchKey:'nairobi', branchLabel:'Nairobi',
  revision:1, employeeId:null, pendingRecordId:'boss', isUnassigned:false, ...extra});
const departments = [{id:'production',name:'Production'}];
const links = (rows: LinkRecord[], options: LinkPerson[], assignments: HodAssignment[] = []) => resolveBatchPeopleLinks(rows,options,departments,assignments);

describe('independent HOD and reliever resolution', () => {
  it('leaves optional blank and N/A reliever fields unassigned', () => {
    const result=resolveRecordRelievers(row('a',{reliever1Name:'N/A',reliever1Designation:'N/A'}),[]);
    expect(result.first.state).toBe('UNASSIGNED'); expect(result.second.error).toBeNull();
  });
  it('requires correction of a half-filled or unmatched reliever', () => {
    const result=resolveRecordRelievers(row('a',{reliever1Name:'boss Person',reliever2Name:'Nobody',reliever2Designation:'Operator'}),[]);
    expect(result.first.error).toMatch(/both name and designation/); expect(result.second.error).toMatch(/could not be matched/);
  });
  it('matches a unique normalized name and designation even when the person needs personal corrections', () => {
    const rows=[row('a',{reliever1Name:' BOSS   PERSON ',reliever1Designation:'operator'}),row('boss',{status:'NEEDS_FIXING'})];
    expect(links(rows,[person('a'),person('boss')]).byRecord.a.first).toMatchObject({state:'PENDING',target:'record:boss',error:null});
  });
  it('requires an explicit choice when name and designation are ambiguous', () => {
    const options=[person('boss'),person('other',{name:'boss Person'})];
    expect(resolveRecordRelievers(row('a',{reliever1Name:'boss Person',reliever1Designation:'Operator'}),options).first.error).toMatch(/Several/);
  });
  it('uses a stored ID even if another same-name candidate appears', () => {
    const rows=[row('a',{reliever1RecordId:'boss'}),row('boss'),row('other')];
    expect(links(rows,[person('boss'),person('other',{name:'boss Person'})]).byRecord.a.first.target).toBe('record:boss');
  });
  it('rejects reliever self-selection through either an import or registered alias', () => {
    const a=row('a',{employeeId:'a-employee',status:'REGISTERED',reliever1RecordId:'a',reliever2EmployeeId:'a-employee'});
    const result=resolveRecordRelievers(a,[person('a',{target:'employee:a-employee',employeeId:'a-employee'})],[a]);
    expect(result.first.error).toMatch(/own reliever/); expect(result.second.error).toMatch(/different person|own reliever/);
  });
  it('rejects the same person in both slots, including record-to-employee aliases', () => {
    const rows=[row('a',{reliever1RecordId:'boss',reliever2EmployeeId:'registered-boss'}),row('boss',{status:'REGISTERED',employeeId:'registered-boss'})];
    const result=links(rows,[person('boss',{target:'employee:registered-boss',employeeId:'registered-boss'})]).byRecord.a;
    expect(result.first.target).toBe('employee:registered-boss'); expect(result.second.error).toMatch(/different person/);
  });
  it('allows reciprocal relievers and a person to be their own department HOD', () => {
    const rows=[row('a',{reliever1RecordId:'boss'}),row('boss',{reliever1RecordId:'a',hodName:'boss Person',hodDesignation:'Operator',hodReviewKey:'head:1'})];
    const result=links(rows,[person('a'),person('boss')],[head()]);
    expect(peopleLinkFindings(result.byRecord.a)).toEqual([]); expect(peopleLinkFindings(result.byRecord.boss)).toEqual([]);
  });
  it('does not silently replace an unavailable selection', () => {
    const rows=[row('a',{reliever1RecordId:'boss'}),row('boss')];
    const result=links(rows,[person('boss',{unavailable:true}),person('replacement',{name:'boss Person'})]).byRecord.a.first;
    expect(result).toMatchObject({target:'record:boss',state:'NEEDS_ATTENTION'});
  });
  it('rejects a stored reliever from another import while allowing registered people across departments', () => {
    const rows=[row('a',{reliever1RecordId:'foreign',reliever2EmployeeId:'employee'}),row('foreign',{batchId:'other'})];
    const result=links(rows,[person('foreign',{batchId:'other'}),person('employee',{target:'employee:employee',department:'Quality'})]).byRecord.a;
    expect(result.first.error).toMatch(/this import/); expect(result.second.state).toBe('ASSIGNED');
  });
  it('proposes an exact imported HOD but requires an explicit department save', () => {
    const rows=[row('a',{hodName:'boss Person',hodDesignation:'Operator'}),row('boss')];
    const result=links(rows,[person('boss')]).byRecord.a.hod;
    expect(result).toMatchObject({state:'NEEDS_ATTENTION',suggestedTarget:'record:boss',affectedRecords:2});
  });
  it('keeps branch scopes separate and never treats a blank branch as a wildcard', () => {
    const rows=[row('nairobi'),row('mombasa',{plantBranchCode:'Mombasa'}),row('blank',{plantBranchCode:null}),row('boss')];
    const result=links(rows,[person('boss')],[head()]);
    expect(result.byRecord.nairobi.hod.target).toBe('record:boss'); expect(result.byRecord.mombasa.hod.target).toBeNull();
    expect(result.byRecord.blank.hod).toMatchObject({target:null,branchLabel:'Branch not specified'});
  });
  it('requires a new review when an imported HOD conflicts with a changed department revision', () => {
    const rows=[row('a',{hodName:'other Person',hodDesignation:'Operator',hodReviewKey:'head:1'}),row('boss'),row('other')];
    const options=[person('boss'),person('other')];
    expect(links(rows,options,[head()]).byRecord.a.hod.error).toBeNull();
    expect(links(rows,options,[head({revision:2})]).byRecord.a.hod.error).toMatch(/differs/);
  });
  it('lets blank imported HOD fields follow the reviewed department choice', () => {
    expect(links([row('a'),row('boss')],[person('boss')],[head()]).byRecord.a.hod).toMatchObject({target:'record:boss',state:'PENDING',error:null});
  });
  it('does not re-review the same HOD when its pending record registers', () => {
    const rows=[row('a',{hodName:'Old imported name',hodDesignation:'Operator',hodReviewKey:'head:1'}),row('boss',{status:'REGISTERED',employeeId:'emp-boss'})];
    expect(links(rows,[person('boss',{target:'employee:emp-boss'})],[head({employeeId:'emp-boss',pendingRecordId:null})]).byRecord.a.hod.error).toBeNull();
  });
  it('distinguishes an explicitly unassigned HOD from a deleted HOD employee', () => {
    const rows=[row('a')];
    expect(links(rows,[],[head({pendingRecordId:null,isUnassigned:true})]).byRecord.a.hod.state).toBe('UNASSIGNED');
    expect(links(rows,[],[head({pendingRecordId:null})]).byRecord.a.hod.state).toBe('NEEDS_ATTENTION');
  });
  it('does not guess between duplicate department names', () => {
    const result=resolveBatchPeopleLinks([row('a',{hodName:'boss Person',hodDesignation:'Operator'})],[],[...departments,{id:'other',name:'PRODUCTION'}],[]);
    expect(result.byRecord.a.hod.departmentId).toBeNull(); expect(result.byRecord.a.hod.error).toMatch(/unique department/);
  });
});
