import { resolveReporting } from './onboarding-hierarchy';
const row = (id: string, extra: object = {}) => ({ id, status: 'READY', firstName: id, lastName: 'Person', rowNumber: 1,
  jobDesignation: 'Clerk', reportingToName: null, reportingToDesignation: 'Board', ...extra });
const boss = { id: 'boss', firstName: 'Jane', lastName: 'Boss', jobTitle: 'HR Manager', reportingManagerId: null, reportsToBoard: true };
const staff = () => row('staff', { reportingToName: 'Jane Boss', reportingToDesignation: 'HR Manager' });
describe('designation-led reporting resolution', () => {
  it('resolves one exact designation/name in the same supplied organization', () => {
    expect(resolveReporting([staff()], [boss]).byRecord.staff).toMatchObject({ target: 'employee:boss', error: null, depth: 1 });
  });
  it('uses designation to distinguish identical names', () => {
    const other = { ...boss, id: 'other', jobTitle: 'Supervisor' };
    expect(resolveReporting([staff()], [boss, other]).byRecord.staff.target).toBe('employee:boss');
  });
  it('allows normalization of case and spaces', () => {
    const r = { ...staff(), reportingToName: ' JANE   boss ', reportingToDesignation: 'hr MANAGER' };
    expect(resolveReporting([r], [boss]).byRecord.staff.error).toBeNull();
  });
  it.each(['Managing DIR', 'HR Mgr'])('does not silently expand title %s', title => {
    expect(resolveReporting([{ ...staff(), reportingToDesignation: title }], [boss]).byRecord.staff.error).toMatch(/designation was not found/);
  });
  it.each(['Janet Boss', 'Jane'])('requires selection for name variation %s', name => {
    expect(resolveReporting([{ ...staff(), reportingToName: name }], [boss]).byRecord.staff.error).toMatch(/name does not/);
  });
  it('does not ignore a conflicting name even if the title is unique', () => {
    expect(resolveReporting([{ ...staff(), reportingToName: 'Other Person' }], [boss]).byRecord.staff.target).toBeNull();
  });
  it('permits an explicit HR selection to resolve a reversed name', () => {
    const r = { ...staff(), reportingToName: 'Boss Jane', reportingToEmployeeId: 'boss' };
    expect(resolveReporting([r], [boss]).byRecord.staff.target).toBe('employee:boss');
  });
  it('rejects duplicate name and title matches', () => {
    expect(resolveReporting([staff()], [boss, { ...boss, id: 'other' }]).byRecord.staff.error).toMatch(/Multiple people/);
  });
  it('rejects an employee ID absent from the scoped options', () => {
    expect(resolveReporting([{ ...staff(), reportingToEmployeeId: 'foreign' }], [boss]).byRecord.staff.error).toMatch(/unavailable/);
  });
  it('rejects a batch record ID absent from this import', () => {
    expect(resolveReporting([{ ...staff(), reportingToRecordId: 'other-batch' }], []).byRecord.staff.error).toMatch(/unavailable/);
  });
  it('rejects an excluded manager', () => {
    const r = { ...staff(), reportingToRecordId: 'manager' };
    expect(resolveReporting([r, row('manager', { status: 'EXCLUDED' })], []).byRecord.staff.error).toMatch(/unavailable/);
  });
  it('rejects contradictory saved targets', () => {
    expect(resolveReporting([{ ...staff(), reportingToEmployeeId: 'boss', reportingToBoard: true }], [boss]).byRecord.staff.error).toMatch(/only one/);
  });
  it('rejects self-reporting', () => {
    expect(resolveReporting([row('self', { reportingToRecordId: 'self' })], []).byRecord.self.error).toMatch(/themselves/);
  });
  it('rejects cycles and their downstream reports', () => {
    const rows = [row('a',{reportingToRecordId:'b'}),row('b',{reportingToRecordId:'a'}),row('c',{reportingToRecordId:'a'})];
    const h=resolveReporting(rows, []);
    for(const r of rows) expect(h.byRecord[r.id].error).toMatch(/circular|Circular/);
    expect(h.orderedIds).toHaveLength(3);
  });
  it('checks cycles through existing employees', () => {
    expect(resolveReporting([staff()], [{...boss,reportsToBoard:false,reportingManagerId:'other'}, {...boss,id:'other',firstName:'Other',reportsToBoard:false,reportingManagerId:'boss'}]).byRecord.staff.error).toMatch(/circular/i);
  });
  it('rejects an existing employee chain that leaves the organization', () => {
    expect(resolveReporting([staff()], [{...boss,reportsToBoard:false,reportingManagerId:'foreign'}]).byRecord.staff.error).toMatch(/unresolved/);
  });
  it('accepts existing employee roots without requiring a Board row in the import', () => {
    expect(resolveReporting([staff()], [boss]).byRecord.staff.error).toBeNull();
  });
  it('follows registered batch managers through their employee IDs without duplicate options', () => {
    const rows=[{...staff(),reportingToRecordId:'registered'},row('registered',{status:'REGISTERED',employeeId:'boss'})];
    const h=resolveReporting(rows,[boss]);
    expect(h.byRecord.staff.target).toBe('employee:boss');
    expect(h.options.filter(o=>o.target==='record:registered')).toHaveLength(0);
  });
  it('sorts by levels instead of finishing each manager subtree first', () => {
    const rows=[row('child',{rowNumber:2,reportingToRecordId:'a'}),row('a',{rowNumber:3,reportingToRecordId:'root'}),row('b',{rowNumber:4,reportingToRecordId:'root'}),row('root',{rowNumber:9})];
    expect(resolveReporting(rows,[]).orderedIds).toEqual(['root','a','b','child']);
    expect(rows[0].rowNumber).toBe(2);
  });
  it('keeps unresolved records and excluded records at the end', () => {
    const rows=[row('excluded',{status:'EXCLUDED',rowNumber:1}),{...staff(),rowNumber:2},row('root',{rowNumber:3})];
    expect(resolveReporting(rows,[]).orderedIds).toEqual(['root','staff','excluded']);
  });
  it('uses stable spreadsheet order for peers', () => {
    expect(resolveReporting([row('a',{rowNumber:2}),row('b',{rowNumber:1}),row('c',{rowNumber:1})],[]).orderedIds).toEqual(['b','c','a']);
  });
  it('does not mutate raw imported values', () => {
    const rows=[staff()];const before=JSON.stringify(rows);resolveReporting(rows,[boss]);expect(JSON.stringify(rows)).toBe(before);
  });
});

describe('reporting placeholders', () => {
  it.each(['No info', '--', '?'])('treats %s as blank for a Board root', value => {
    expect(resolveReporting([row('root', { reportingToName: value })], []).byRecord.root.target).toBe('BOARD');
  });
  it.each(['N/A', 'not applicable'])('rejects a selected manager with designation %s', designation => {
    const r = { ...staff(), reportingToEmployeeId: 'boss' };
    expect(resolveReporting([r], [{ ...boss, jobTitle: designation }]).byRecord.staff.error).toMatch(/needs a name and job designation/);
  });
});


describe('complete names in different word orders', () => {
  it('automatically resolves a uniquely matching complete reversed name', () => {
    expect(resolveReporting([{ ...staff(), reportingToName: 'Boss Jane' }], [boss]).byRecord.staff.target).toBe('employee:boss');
  });
  it('handles a compound first name without flattening its words', () => {
    const manager = { ...boss, firstName: 'Mary Ann', lastName: 'Otieno' };
    expect(resolveReporting([{ ...staff(), reportingToName: 'Otieno Mary Ann' }], [manager]).byRecord.staff.target).toBe('employee:boss');
  });
  it('requires confirmation when a middle name is missing', () => {
    expect(resolveReporting([staff()], [{ ...boss, middleName: 'Wanjiru' }]).byRecord.staff.error).toMatch(/missing middle names/);
  });
  it('accepts a complete reordered name including its middle name', () => {
    expect(resolveReporting([{ ...staff(), reportingToName: 'Boss Wanjiru Jane' }], [{ ...boss, middleName: 'Wanjiru' }]).byRecord.staff.target).toBe('employee:boss');
  });
  it('does not erase repeated name words', () => {
    expect(resolveReporting([{ ...staff(), reportingToName: 'Jane Jane Boss' }], [boss]).byRecord.staff.error).not.toBeNull();
  });
  it('requires a choice if two people share all name words and designation', () => {
    expect(resolveReporting([staff()], [boss, { ...boss, id: 'other', firstName: 'Boss', lastName: 'Jane' }]).byRecord.staff.error).toMatch(/Multiple people/);
  });
  it('preserves apostrophes rather than silently matching a different spelling', () => {
    const manager = { ...boss, lastName: "O'Neil" };
    expect(resolveReporting([{ ...staff(), reportingToName: 'Jane ONeil' }], [manager]).byRecord.staff.error).not.toBeNull();
  });
  it('matches complete Unicode names without deleting their characters', () => {
    const manager = { ...boss, firstName: '美咲', lastName: '田中' };
    expect(resolveReporting([{ ...staff(), reportingToName: '田中 美咲' }], [manager]).byRecord.staff.target).toBe('employee:boss');
  });
});

describe('Clive workbook scenarios under the combined policy', () => {
  const director = row('md', { firstName: 'Grace', middleName: 'Muthoni', lastName: 'Wanjiru', jobDesignation: 'Managing Director', reportingToName: null, reportingToDesignation: 'Board' });
  const manager = row('pm', { firstName: 'Peter', lastName: 'Otieno', jobDesignation: 'Production Manager', reportingToName: 'Grace Muthoni Wanjiru', reportingToDesignation: 'Managing Director' });
  const supervisor = row('ss', { firstName: 'Peter', lastName: 'Otieno', jobDesignation: 'Shift Supervisor', reportingToName: 'Peter Otieno', reportingToDesignation: 'Production Manager' });
  it('orders a four-level chain with duplicate names distinguished by designation', () => {
    const operator = row('op', { firstName: 'Joy', lastName: 'Akinyi', reportingToName: 'OTIENO peter', reportingToDesignation: 'shift supervisor' });
    const h = resolveReporting([operator, supervisor, manager, director], []);
    expect(h.orderedIds).toEqual(['md', 'pm', 'ss', 'op']);
    expect(h.byRecord.ss.target).toBe('record:pm');
    expect(h.byRecord.op).toMatchObject({ target: 'record:ss', depth: 3, error: null });
  });
  it('requires confirmation for Grace Wanjiru and accepts the saved choice', () => {
    const incomplete = { ...manager, reportingToName: 'Grace Wanjiru' };
    expect(resolveReporting([director, incomplete], []).byRecord.pm.error).not.toBeNull();
    expect(resolveReporting([director, { ...incomplete, reportingToRecordId: 'md' }], []).byRecord.pm.target).toBe('record:md');
  });
  it('does not treat Sam Kiprono as Samuel Kiprono', () => {
    const quality = row('qm', { firstName: 'Samuel', lastName: 'Kiprono', jobDesignation: 'Quality Manager' });
    const inspector = row('qa', { reportingToName: 'Sam Kiprono', reportingToDesignation: 'Quality Manager' });
    expect(resolveReporting([quality, inspector], []).byRecord.qa.error).not.toBeNull();
  });
  it('rejects an unmatched title even when the name is present twice', () => {
    const ann = row('ann', { reportingToName: 'Peter Otieno', reportingToDesignation: 'Line Supervisor' });
    expect(resolveReporting([director, manager, supervisor, ann], []).byRecord.ann.error).toMatch(/designation was not found/);
  });
  it('rejects the self-reporting cleaner, not the designation Cleaner', () => {
    const paul = row('paul', { firstName: 'Paul', lastName: 'Njoroge', jobDesignation: 'Cleaner', reportingToName: 'Paul Njoroge', reportingToDesignation: 'Cleaner' });
    expect(resolveReporting([paul], []).byRecord.paul.error).toMatch(/themselves/);
    const other = row('other', { firstName: 'Ann', lastName: 'Chebet', jobDesignation: 'Cleaner' });
    expect(resolveReporting([other, { ...paul, reportingToName: 'Ann Chebet' }], []).byRecord.paul.target).toBe('record:other');
  });
  it('flags both sides of Esther and Rose’s reporting loop', () => {
    const a = row('a', { firstName: 'Esther', lastName: 'Nduta', jobDesignation: 'Packer', reportingToName: 'Rose Atieno', reportingToDesignation: 'Packing Supervisor' });
    const b = row('b', { firstName: 'Rose', lastName: 'Atieno', jobDesignation: 'Packing Supervisor', reportingToName: 'Esther Nduta', reportingToDesignation: 'Packer' });
    const h = resolveReporting([a, b], []);
    expect(h.byRecord.a.error).toMatch(/Circular/); expect(h.byRecord.b.error).toMatch(/Circular/);
  });
  it('links Tom to existing John Kamau at his actual hierarchy level', () => {
    const tom = row('tom', { firstName: 'Tom', lastName: 'Mutua', reportingToName: 'John Kamau', reportingToDesignation: 'Stores Manager' });
    const john = { id: 'john', firstName: 'John', lastName: 'Kamau', jobTitle: 'Stores Manager', reportingManagerId: 'boss' };
    const h = resolveReporting([tom], [boss, john]);
    expect(h.byRecord.tom).toMatchObject({ target: 'employee:john', depth: 2, error: null });
  });
});

describe('pending valid links and incomplete historical chains', () => {
  it('allows a link to an unknown historical root without inventing a level', () => {
    const h = resolveReporting([staff()], [{ ...boss, reportsToBoard: false }]);
    expect(h.byRecord.staff).toMatchObject({ target: 'employee:boss', state: 'ASSIGNED', error: null, depth: null });
    expect(h.byRecord.staff.warning).toMatch(/not been recorded/);
  });
  it('keeps managers before reports within an unknown-root chain', () => {
    const manager = row('manager', { reportingToEmployeeId: 'boss', rowNumber: 8 });
    const child = row('child', { reportingToRecordId: 'manager', rowNumber: 1 });
    const h = resolveReporting([child, manager], [{ ...boss, reportsToBoard: false }]);
    expect(h.orderedIds).toEqual(['manager', 'child']);
    expect(h.byRecord.child.depth).toBeNull();
    expect(h.byRecord.child.state).toBe('PENDING');
  });
  it('marks an existing employee’s valid pending link without changing their registered status', () => {
    const manager = row('manager');
    const employee = { ...boss, id: 'ann', reportsToBoard: false, pendingReportingRecordId: 'manager' };
    const registered = row('ann-row', { status: 'REGISTERED', employeeId: 'ann' });
    const h = resolveReporting([registered, manager], [employee]);
    expect(h.byRecord['ann-row']).toMatchObject({ state: 'PENDING', error: null, target: 'record:manager' });
    expect(registered.status).toBe('REGISTERED');
  });
  it('flags an excluded pending manager while preserving the saved target', () => {
    const manager = row('manager', { status: 'EXCLUDED' });
    const employee = { ...boss, id: 'ann', reportsToBoard: false, pendingReportingRecordId: 'manager' };
    const h = resolveReporting([manager], [employee]);
    expect(h.byEmployee.ann).toMatchObject({ state: 'NEEDS_ATTENTION', target: 'record:manager' });
    expect(h.byEmployee.ann.error).toMatch(/excluded/);
    expect(employee.pendingReportingRecordId).toBe('manager');
  });
  it('detects a loop through an existing employee’s pending import reference', () => {
    const manager = row('manager', { reportingToEmployeeId: 'ann' });
    const ann = { ...boss, id: 'ann', reportsToBoard: false, pendingReportingRecordId: 'manager' };
    const h = resolveReporting([manager], [ann]);
    expect(h.byEmployee.ann.error).toMatch(/circular/i);
    expect(h.byRecord.manager.error).toMatch(/circular/i);
  });
  it('uses context rows for another import without offering them as candidates', () => {
    const manager = row('manager', { batchId: 'old-batch' });
    const ann = { ...boss, id: 'ann', reportsToBoard: false, pendingReportingRecordId: 'manager' };
    const newRow = row('new', { batchId: 'new-batch', reportingToEmployeeId: 'ann' });
    const h = resolveReporting([newRow], [ann], [manager]);
    expect(h.byRecord.new.error).toBeNull();
    expect(h.options.some(o => o.target === 'record:manager')).toBe(false);
    expect(resolveReporting([{ ...newRow, reportingToEmployeeId: null, reportingToRecordId: 'manager' }], [ann], [manager]).byRecord.new.error).not.toBeNull();
  });
  it('rejects a pending reference whose import was cancelled', () => {
    const manager = row('manager', { batch: { status: 'CANCELLED' } });
    const ann = { ...boss, id: 'ann', reportsToBoard: false, pendingReportingRecordId: 'manager' };
    expect(resolveReporting([manager], [ann]).byEmployee.ann.state).toBe('NEEDS_ATTENTION');
  });
  it('does not infer Board from a conflicting named reporting person', () => {
    const r = row('x', { reportingToName: 'Someone Else', reportingToDesignation: 'Board' });
    expect(resolveReporting([r], []).byRecord.x.error).not.toBeNull();
  });
});


describe('reporting feedback and suggestions', () => {
  it('describes the immediate pending manager before the wider chain', () => {
    const h = resolveReporting([row('Grace'), row('Peter', { reportingToRecordId: 'Grace' }), row('Ann', { reportingToRecordId: 'Peter' })], []);
    expect(h.byRecord.Ann.warning).toBe('Manager assignment pending Peter Person’s registration. The reporting relationship is valid. Wider reporting chain: Peter Person is awaiting Grace Person’s registration.');
  });
  it('keeps an assigned manager distinct from their pending assignment', () => {
    const h = resolveReporting([row('Grace'), row('Ann', { reportingToEmployeeId: 'peter' })], [{ id: 'peter', firstName: 'Peter', lastName: 'Person', jobTitle: 'Clerk', pendingReportingRecordId: 'Grace' }]);
    expect(h.byRecord.Ann.state).toBe('ASSIGNED');
    expect(h.byRecord.Ann.warning).toBe('Wider reporting chain: Peter Person is awaiting Grace Person’s registration.');
  });
  it('never calls a broken or circular chain valid', () => {
    for (const rows of [[row('a', { reportingToRecordId: 'b' }), row('b', { reportingToRecordId: 'missing' })], [row('a', { reportingToRecordId: 'b' }), row('b', { reportingToRecordId: 'a' })]]) {
      const h = resolveReporting(rows, []);
      for (const r of rows) { expect(h.byRecord[r.id].error).toBeTruthy(); expect(h.byRecord[r.id].warning).toBeNull(); }
    }
  });
  const grace = row('grace', { firstName: 'Grace', middleName: 'Muthoni', lastName: 'Wanjiru', jobDesignation: 'Director' });
  const report = row('report', { reportingToName: 'Wanjiru Grace', reportingToDesignation: 'Director' });
  it('suggests an omitted middle name without assigning it', () => {
    const h = resolveReporting([report, grace], []);
    expect(h.suggestionsByRecord.report.map(o => o.target)).toEqual(['record:grace']);
    expect(h.byRecord.report.target).toBeNull(); expect(h.byRecord.report.error).toBeTruthy();
    expect(resolveReporting([{ ...report, reportingToRecordId: 'grace' }, grace], []).byRecord.report.error).toBeNull();
  });
  it('presents every matching candidate for HR to distinguish', () => {
    const h = resolveReporting([report, grace, { ...grace, id: 'other', middleName: 'A' }], []);
    expect(h.suggestionsByRecord.report).toHaveLength(2); expect(h.byRecord.report.target).toBeNull();
  });
  it.each(['G Wanjiru', 'Gracie Wanjiru', 'Grace', 'Grace W'])('does not suggest partial or nickname %s', name => {
    expect(resolveReporting([{ ...report, reportingToName: name }, grace], []).suggestionsByRecord.report).toEqual([]);
  });
  it('does not suggest excluded people, other imports, or different titles', () => {
    expect(resolveReporting([report, { ...grace, status: 'EXCLUDED' }], []).suggestionsByRecord.report).toEqual([]);
    expect(resolveReporting([report], [], [{ ...grace, batchId: 'other' }]).suggestionsByRecord.report).toEqual([]);
    expect(resolveReporting([{ ...report, reportingToDesignation: 'DIR' }, grace], []).suggestionsByRecord.report).toEqual([]);
  });
  it('honours an explicit choice instead of suggesting alternatives', () => {
    expect(resolveReporting([{ ...report, reportingToRecordId: 'grace' }, grace], []).suggestionsByRecord.report).toEqual([]);
  });
  it('offers an existing employee with an omitted middle name', () => {
    const h = resolveReporting([report], [{ id: 'g', firstName: 'Grace', middleName: 'Muthoni', lastName: 'Wanjiru', jobTitle: 'Director', reportsToBoard: true }]);
    expect(h.suggestionsByRecord.report[0].target).toBe('employee:g');
  });
});

describe('upstream reporting errors and ordering', () => {
  const sam = () => row('sam', { firstName: 'Samuel', lastName: 'Kiprono', rowNumber: 19,
    jobDesignation: 'Quality Manager', reportingToName: 'Grace Wanjiru', reportingToDesignation: 'Director' });
  const faith = () => row('faith', { firstName: 'Faith', lastName: 'Njeri', rowNumber: 14, reportingToRecordId: 'sam' });
  const grace = () => row('grace', { firstName: 'Grace', middleName: 'Muthoni', lastName: 'Wanjiru', jobDesignation: 'Director' });
  it('names the selected manager and the source of an upstream error', () => {
    const h = resolveReporting([faith(), sam(), grace()], []);
    expect(h.byRecord.faith).toMatchObject({ target: 'record:sam', errorScope: 'UPSTREAM', state: 'NEEDS_ATTENTION', warning: null });
    expect(h.byRecord.faith.error).toMatch(/Samuel Kiprono is selected as manager.*Samuel Kiprono/);
    expect(h.byRecord.sam.errorScope).toBe('DIRECT');
  });
  it('orders a broken-chain manager before an earlier spreadsheet report', () => {
    expect(resolveReporting([faith(), sam(), grace()], []).orderedIds).toEqual(['grace', 'sam', 'faith']);
  });
  it('preserves the original source through multiple reporting levels', () => {
    const junior = row('junior', { rowNumber: 2, reportingToRecordId: 'faith' });
    const h = resolveReporting([junior, faith(), sam(), grace()], []);
    expect(h.byRecord.junior.error).toMatch(/Faith Njeri is selected as manager.*Samuel Kiprono/);
    expect(h.orderedIds).toEqual(['grace', 'sam', 'faith', 'junior']);
  });
  it('uses spreadsheet order for peers in the same broken chain', () => {
    const peer = row('peer', { rowNumber: 3, reportingToRecordId: 'sam' });
    expect(resolveReporting([faith(), sam(), peer], []).orderedIds).toEqual(['sam', 'peer', 'faith']);
  });
  it('clears the upstream error when the manager selection is confirmed', () => {
    const h = resolveReporting([faith(), {...sam(), reportingToRecordId: 'grace'}, grace()], []);
    expect(h.byRecord.faith.error).toBeNull();
    expect(h.byRecord.faith.errorScope).toBe(undefined);
    expect(h.byRecord.faith.state).toBe('PENDING');
  });
  it('does not classify self-reporting as upstream waiting', () => {
    const h = resolveReporting([row('self', {reportingToRecordId: 'self'})], []);
    expect(h.byRecord.self.errorScope).toBe('DIRECT');
  });
  it('keeps circular chains as errors rather than upstream waiting', () => {
    const h = resolveReporting([row('a', {reportingToRecordId:'b'}), row('b', {reportingToRecordId:'a'})], []);
    expect(h.byRecord.a.errorScope).toBe('DIRECT');
    expect(h.byRecord.b.errorScope).toBe('DIRECT');
  });
  it('keeps an excluded immediate manager as a direct error', () => {
    const h = resolveReporting([faith(), {...sam(),status:'EXCLUDED'}], []);
    expect(h.byRecord.faith.errorScope).toBe('DIRECT');
    expect(h.orderedIds).toEqual(['faith','sam']);
  });
});

describe('compact reporting chains and person labels', () => {
  it('distinguishes same-name managers by designation and code', () => {
    const rows = [row('daisy', { reportingToRecordId:'shift' }),
      row('shift', { firstName:'Peter',lastName:'Otieno',jobDesignation:'Shift Supervisor',employeeCode:'EMP-05', reportingToRecordId:'production' }),
      row('production', { firstName:'Peter',lastName:'Otieno',jobDesignation:'Production Manager',employeeCode:'EMP-02' })];
    const r = resolveReporting(rows, []).byRecord.daisy;
    expect(r.managerName).toBe('Peter Otieno (Shift Supervisor · EMP-05)');
    expect(r.warning).toMatch(/Production Manager · EMP-02/);
    expect(r.chain?.map(p=>p.target)).toEqual(['record:daisy','record:shift','record:production','BOARD']);
    expect(r.chainEnd).toBe('BOARD');
  });
  it('keeps unique-name labels compact and identity details available', () => {
    const r=resolveReporting([row('one',{employeeCode:'E1'})],[]).byRecord.one;
    expect(r.chain?.[0]).toMatchObject({label:'one Person',employeeCode:'E1',recordId:'one'});
  });
  it('links an existing manager to a profile rather than a made-up import row', () => {
    const r=resolveReporting([staff()],[boss]).byRecord.staff;
    expect(r.chain?.[1]).toMatchObject({employeeId:'boss',recordId:undefined,status:'REGISTERED'});
  });
  it('collapses registered row aliases and points to their current import row', () => {
    const manager=row('manager',{status:'REGISTERED',employeeId:'boss'});
    const r=resolveReporting([row('report',{reportingToRecordId:'manager'}),manager],[boss]).byRecord.report;
    expect(r.chain?.map(p=>p.target)).toEqual(['record:report','employee:boss','BOARD']);
    expect(r.chain?.[1].recordId).toBe('manager');
  });
  it('marks an unresolved ancestor without hiding the valid direct link', () => {
    const r=resolveReporting([row('report',{reportingToRecordId:'manager'}),row('manager',{reportingToName:'Missing',reportingToDesignation:'Absent'})],[]).byRecord.report;
    expect(r.chainEnd).toBe('UNRESOLVED');
    expect(r.chain?.[1].status).toBe('NEEDS_ATTENTION');
    expect(r.errorScope).toBe('UPSTREAM');
  });
  it('terminates cycles and unknown employee roots explicitly', () => {
    const h=resolveReporting([row('a',{reportingToRecordId:'b'}),row('b',{reportingToRecordId:'a'})],[]);
    expect(h.byRecord.a.chainEnd).toBe('CYCLE');
    expect(h.byRecord.a.chain).toHaveLength(2);
    expect(resolveReporting([staff()],[{...boss,reportsToBoard:false}]).byRecord.staff.chainEnd).toBe('UNKNOWN');
  });
  it('bounds display size without changing valid deep-chain eligibility', () => {
    const rows=Array.from({length:40},(_,i)=>row(String(i),i===39?{}:{reportingToRecordId:String(i+1)}));
    const r=resolveReporting(rows,[]).byRecord['0'];
    expect(r.chain).toHaveLength(24);expect(r.chainEnd).toBe('LIMIT');expect(r.error).toBeNull();expect(r.depth).toBe(39);
  });
  it('does not offer an in-batch jump to a pending record in another import', () => {
    const other=row('other',{batchId:'otherBatch'});
    const manager={...boss,reportsToBoard:false,pendingReportingRecordId:'other'};
    const r=resolveReporting([staff()],[manager],[other]).byRecord.staff;
    expect(r.chain?.[2].recordId).toBe(undefined);
    expect(r.chain?.[2].target).toBe('record:other');
  });
});
