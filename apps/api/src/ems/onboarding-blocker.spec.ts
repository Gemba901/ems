import {resolveReporting, type ReportingRow, type ReportingEmployee} from './onboarding-hierarchy';

const row = (id: string, fields: Partial<ReportingRow> = {}): ReportingRow => ({id, batchId:'batch', status:'READY',
  firstName:id, lastName:'Person', employeeCode:id, jobDesignation:'Manager', reportingToBoard:true, ...fields});
const employee = (id: string, fields: Partial<ReportingEmployee> = {}): ReportingEmployee => ({id, firstName:id,
  lastName:'Person', employeeCode:id, jobTitle:'Manager', reportsToBoard:true, ...fields});
const unresolved = (id: string, fields: Partial<ReportingRow> = {}) => row(id, {reportingToBoard:false, ...fields});
const report = (id: string, manager: string) => row(id, {reportingToBoard:false, reportingToRecordId:manager});

test('names the upstream owner who needs a reporting selection', () => {
  const r=resolveReporting([unresolved('head'),report('manager','head'),report('report','manager')],[]).byRecord.report;
  expect(r.errorScope).toBe('UPSTREAM');
  expect(r.blocker).toMatchObject({target:'record:head',recordId:'head',batchId:'batch',label:'head Person'});
  expect(r.blocker?.reason).toContain('Choose a reporting person');
});
test('full-walk blocker survives the 24-person display limit', () => {
  const rows=[unresolved('head'),...Array.from({length:40},(_,i)=>report(`r${i}`,i?`r${i-1}`:'head'))];
  const r=resolveReporting(rows,[]).byRecord.r39;
  expect(r.chainEnd).toBe('LIMIT');expect(r.chain).toHaveLength(24);expect(r.blocker?.recordId).toBe('head');
});
test('links to a pending person in another import via an existing manager', () => {
  const r=resolveReporting([row('report',{reportingToBoard:false,reportingToEmployeeId:'manager'})],
    [employee('manager',{reportsToBoard:false,pendingReportingRecordId:'external'})],
    [unresolved('external',{batchId:'other-batch'})]).byRecord.report;
  expect(r.blocker).toMatchObject({recordId:'external',batchId:'other-batch'});
  expect(r.chain?.some(person=>person.recordId==='external')).toBe(false);
});
test('an unavailable ancestor points to the last existing owner, not the missing person', () => {
  const r=resolveReporting([row('report',{reportingToBoard:false,reportingToEmployeeId:'manager'})],
    [employee('manager',{reportsToBoard:false,reportingManagerId:'missing'})]).byRecord.report;
  expect(r.blocker).toMatchObject({target:'employee:manager',employeeId:'manager'});
  expect(r.blocker?.reason).toContain('unavailable');
});
test('an excluded upstream selection points to the record that must choose a replacement', () => {
  const r=resolveReporting([row('excluded',{status:'EXCLUDED'}),report('manager','excluded'),report('report','manager')],[]).byRecord.report;
  expect(r.blocker?.recordId).toBe('manager');expect(r.blocker?.reason).toContain('excluded');
});
test('registered import aliases resolve to the employee profile for corrections', () => {
  const r=resolveReporting([row('old',{status:'REGISTERED',employeeId:'manager'}),report('report','old')],
    [employee('manager',{reportsToBoard:false,reportingManagerId:'missing'})]).byRecord.report;
  expect(r.blocker?.employeeId).toBe('manager');expect(r.blocker?.recordId).toBeUndefined();
});
test('manager personal errors do not turn valid pending registration into a blocker', () => {
  const r=resolveReporting([row('head',{status:'NEEDS_FIXING'}),report('report','head')],[]).byRecord.report;
  expect(r.error).toBeNull();expect(r.state).toBe('PENDING');expect(r.blocker).toBeUndefined();
});
test('unknown historical reporting above an existing manager remains a warning', () => {
  const r=resolveReporting([row('report',{reportingToBoard:false,reportingToEmployeeId:'manager'})],
    [employee('manager',{reportsToBoard:false})]).byRecord.report;
  expect(r.error).toBeNull();expect(r.warning).toBeTruthy();expect(r.blocker).toBeUndefined();
});
test('direct errors and cycles do not invent a different upstream blocker', () => {
  const direct=resolveReporting([unresolved('head')],[]).byRecord.head;
  expect(direct.errorScope).toBe('DIRECT');expect(direct.blocker).toBeUndefined();
  const cycle=resolveReporting([report('a','b'),report('b','a')],[]);
  expect(cycle.byRecord.a.error).toContain('Circular');expect(cycle.byRecord.a.blocker).toBeUndefined();
});
