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
    expect(result.first.error).toMatch(/both name and job title/); expect(result.second.error).toMatch(/could not be matched/);
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

describe('batch-scoped matching indexes', () => {
  it('does not let a duplicate second-slot error contaminate another row or its first slot', () => {
    const rows=[row('a',{reliever1Name:'boss Person',reliever1Designation:'Operator',reliever2Name:'boss Person',reliever2Designation:'Operator'}),
      row('b',{reliever1Name:'boss Person',reliever1Designation:'Operator'}),row('boss')];
    const result=links(rows,[person('boss')]);
    expect(result.byRecord.a.first.error).toBeNull();
    expect(result.byRecord.a.second.error).toMatch(/different person/);
    expect(result.byRecord.b.first.error).toBeNull();
  });
  it('keeps identical imported names in different batches in their own candidate scopes', () => {
    const rows=[row('a',{reliever1Name:'Shared Person',reliever1Designation:'Operator'}),
      row('b',{batchId:'other',reliever1Name:'Shared Person',reliever1Designation:'Operator'}),row('boss'),row('other-boss',{batchId:'other'})];
    const result=links(rows,[person('boss',{name:'Shared Person'}),person('other-boss',{name:'Shared Person',batchId:'other'})]);
    expect(result.byRecord.a.first.target).toBe('record:boss');
    expect(result.byRecord.b.first.target).toBe('record:other-boss');
  });
  it('counts active department/branch rows once without conflating blank branches or duplicate departments', () => {
    const rows=[row('a'),row('b',{currentDepartment:' PRODUCTION '}),row('c',{status:'EXCLUDED'}),row('d',{status:'REGISTERED'}),
      row('e',{plantBranchCode:null}),row('f',{plantBranchCode:'Mombasa'})];
    const result=links(rows,[]);
    expect(result.byRecord.a.hod.affectedRecords).toBe(2);
    expect(result.byRecord.c.hod.affectedRecords).toBe(2);
    expect(result.byRecord.e.hod.affectedRecords).toBe(1);
    expect(result.byRecord.f.hod.affectedRecords).toBe(1);
  });
  it('sees an excluded candidate on the next resolution instead of retaining its earlier match', () => {
    const rows=[row('a',{reliever1Name:'boss Person',reliever1Designation:'Operator'}),row('boss')];
    expect(links(rows,[person('boss')]).byRecord.a.first.state).toBe('PENDING');
    expect(links(rows,[person('boss',{unavailable:true})]).byRecord.a.first.state).toBe('NEEDS_ATTENTION');
  });
  it('does not hide a newly ambiguous name on a later resolution', () => {
    const rows=[row('a',{reliever1Name:'boss Person',reliever1Designation:'Operator'}),row('boss'),row('other')];
    expect(links(rows,[person('boss')]).byRecord.a.first.target).toBe('record:boss');
    expect(links(rows,[person('boss'),person('other',{name:'boss Person'})]).byRecord.a.first.error).toMatch(/Several/);
  });
});


describe('review-only HOD and reliever suggestions',()=>{
  const grace=person('grace',{name:'Grace Muthoni Wanjiru',designation:'Director'});
  it('keeps a fuzzy HOD unconfirmed and lists candidate reasons',()=>{
    const r=row('a',{hodName:'Grace Wanjiku',hodDesignation:'Director'});
    const h=links([r,row('grace')],[grace]).byRecord.a.hod;
    expect(h.target).toBeNull();expect(h.suggestedTarget).toBeNull();expect(h.error).not.toBeNull();
    expect(h.suggestions?.[0]).toMatchObject({target:'record:grace',suggestionReasons:expect.arrayContaining(['Possible spelling match — check spelling and confirm'])});
  });
  it('offers a reliever with a different title without assigning it',()=>{
    const r=row('a',{reliever1Name:'Grace Muthoni Wanjiru',reliever1Designation:'DIR'});
    const result=resolveRecordRelievers(r,[grace]);
    expect(result.first.target).toBeNull();expect(result.first.error).not.toBeNull();
    expect(result.first.suggestions?.[0].suggestionReasons).toContain('Job title differs — check the imported and recorded values');
  });
  it('allows missing-title exact-name review but not automatic matching',()=>{
    const result=resolveRecordRelievers(row('a',{reliever1Name:grace.name}),[grace]);
    expect(result.first.target).toBeNull();expect(result.first.suggestions?.[0].suggestionReasons).toContain('Imported job title is missing');
  });
  it('excludes self, excluded people and foreign pending imports from reliever hints',()=>{
    const r=row('a',{reliever1Name:'Grace Wanjiku',reliever1Designation:'Director'});
    const options=[{...grace,target:'record:a',recordId:'a'},{...grace,target:'record:excluded',unavailable:true},{...grace,target:'record:foreign',batchId:'other'}];
    expect(resolveRecordRelievers(r,options).first.suggestions).toEqual([]);
  });
  it('does not suggest the already assigned other reliever',()=>{
    const r=row('a',{reliever1RecordId:'grace',reliever2Name:'Grace Wanjiku',reliever2Designation:'Director'});
    const result=resolveRecordRelievers(r,[grace],[r,row('grace')]);
    expect(result.first.target).toBe('record:grace');expect(result.second.suggestions).toEqual([]);
  });
  it('retains every ambiguous exact candidate for review',()=>{
    const other={...grace,target:'employee:other',recordId:undefined};
    const result=resolveRecordRelievers(row('a',{reliever1Name:grace.name,reliever1Designation:'Director'}),[grace,other]);
    expect(result.first.target).toBeNull();expect(result.first.suggestions).toHaveLength(2);
  });
  it('does not change unique exact reliever matching',()=>{
    const result=resolveRecordRelievers(row('a',{reliever1Name:grace.name,reliever1Designation:'Director'}),[grace]);
    expect(result.first.target).toBe('record:grace');expect(result.first.suggestions).toBeUndefined();
  });
});


describe('HOD evidence and organization shortlist',()=>{
 it('counts matching saved fields in one department/branch, with registered included and excluded omitted',()=>{
  const rows=[row('a',{hodName:'Boss Person',hodDesignation:'Operator',rowNumber:4}),row('b',{status:'REGISTERED',hodName:' boss  person ',hodDesignation:'operator'}),row('excluded',{status:'EXCLUDED',hodName:'Other',hodDesignation:'Other'}),row('different',{plantBranchCode:'Mombasa',hodName:'Other',hodDesignation:'Other'})];
  const result=links(rows,[person('boss')]);const evidence=result.hodEvidence[result.byRecord.a.hod.evidenceKey!];
  expect(evidence).toMatchObject({total:2,blank:0,groups:[{count:2,name:'Boss Person',designation:'Operator'}]});expect(evidence.groups[0].records[0].rowNumber).toBe(4);
  expect(result.byRecord.a.hod.affectedRecords).toBe(1);
 });
 it('separates conflicting titles, blank entries, and half-filled HOD values',()=>{
  const result=links([row('a',{hodName:'Boss Person',hodDesignation:'Operator'}),row('b',{hodName:'Boss Person',hodDesignation:'Director'}),row('c'),row('d',{hodName:'N/A',hodDesignation:'N/A'}),row('e',{hodName:'Boss Person'})],[]);
  const e=result.hodEvidence[result.byRecord.a.hod.evidenceKey!];expect(e.total).toBe(5);expect(e.blank).toBe(2);expect(e.groups).toHaveLength(3);
 });
 it('includes confirmed HODs with scope labels but disables unavailable people',()=>{
  const result=links([row('a')],[person('boss',{target:'employee:boss'})],[head({employeeId:'boss',pendingRecordId:null}),head({id:'missing',branchKey:'elsewhere',branchLabel:'Elsewhere',employeeId:'missing',pendingRecordId:null})]);
  expect(result.hodDirectory.find(e=>e.key==='confirmed:head')).toMatchObject({source:'CONFIRMED',department:'Production',target:'employee:boss',selectable:true});
  expect(result.hodDirectory.find(e=>e.key==='confirmed:missing')?.selectable).toBe(false);
 });
 it('shows another import pending HOD without making it selectable',()=>{
  const foreign=person('foreign',{batchId:'other'});
  const result=resolveBatchPeopleLinks([row('a')],[foreign],departments,[head({pendingRecordId:'foreign'})],[row('foreign',{batchId:'other'})]);
  expect(result.hodDirectory[0]).toMatchObject({target:'record:foreign',selectable:false});expect(result.hodDirectory[0].note).toMatch(/another import/);
 });
 it('deduplicates imported exact suggestions and does not promote fuzzy hints into directory',()=>{
  const result=links([row('a',{hodName:'Boss Person',hodDesignation:'Operator'}),row('b',{hodName:'Boss Person',hodDesignation:'Operator'}),row('c',{hodName:'Boss Persom',hodDesignation:'Operator'})],[person('boss',{target:'employee:boss'})]);
  expect(result.hodDirectory.filter(e=>e.source==='IMPORTED')).toHaveLength(1);expect(result.hodDirectory[0].note).toMatch(/not confirmation/);
 });
 it('stores evidence once per scope rather than repeating record lists on every row',()=>{
  const rows=Array.from({length:300},(_,i)=>row(String(i),{hodName:'Boss Person',hodDesignation:'Operator'}));
  const result=links(rows,[person('boss')]);expect(Object.keys(result.hodEvidence)).toHaveLength(1);expect(result.hodEvidence[result.byRecord['0'].hod.evidenceKey!].total).toBe(300);expect(result.byRecord['0'].hod).not.toHaveProperty('evidence');
 });
});
