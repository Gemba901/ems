import { buildPositionChart, type PositionEmployee } from './position-chart';

const source = { kind: 'SAMPLE' as const, label: 'Test', loadedAt: '2026-11-07T00:00:00.000Z' };
const person = (id: string, manager: string | null, title: string, extra: Partial<PositionEmployee> = {}): PositionEmployee => ({
  id, firstName: id.toUpperCase(), lastName: 'Test', jobTitle: title, departmentId: 'prod', plantBranch: null,
  employmentStatus: 'ACTIVE', reportingManagerId: manager, ...extra,
});
const departments = [{ id: 'exec', name: 'Executive' }, { id: 'prod', name: 'Production' }];
const build = (employees: PositionEmployee[]) => buildPositionChart({ company: { id: 'org', name: 'Co' }, departments, employees, source });

describe('02.02 position chart (worked out from people)', () => {
  it('team leaders hold their own positions; people with nobody under them share one position per job title', () => {
    const chart = build([
      person('ceo', null, 'Chief Executive Officer', { departmentId: 'exec' }),
      person('pm', 'ceo', 'Production Manager'),
      person('s1', 'pm', 'Supervisor'), person('s2', 'pm', 'Supervisor'),
      ...Array.from({ length: 13 }, (_, i) => person(`o${i}`, 's1', i % 5 === 0 ? 'machine operator ' : 'Machine Operator', i === 3 ? { employmentStatus: 'PROBATION' } : {})),
      person('o99', 's2', 'Machine Operator'), person('q1', 's2', 'Quality Checker'),
    ]);
    const byTitle = (title: string) => chart.positions.filter(p => p.title === title);
    expect(byTitle('Chief Executive Officer')[0]).toMatchObject({ id: 'pos:ceo', parentId: null, unit: { name: 'Executive' } });
    // Supervisors lead teams, so each holds their own position (not grouped although they share a title).
    expect(byTitle('Supervisor').map(p => p.id)).toEqual(['pos:s1', 'pos:s2']);
    // s1's 13 operators: one shared position, spelling variants merged, most common spelling as the label.
    const s1Operators = chart.positions.find(p => p.parentId === 'pos:s1')!;
    expect(s1Operators).toMatchObject({ id: 'group:pos:s1:machine operator', title: 'Machine Operator', vacant: false, basis: 'INFERRED_FROM_PEOPLE' });
    expect(s1Operators.holders).toHaveLength(13);
    expect(s1Operators.holders.find(h => h.employeeId === 'o3')?.status).toBe('PROBATION');
    // s2's single operator and single checker: a position each.
    expect(chart.positions.filter(p => p.parentId === 'pos:s2').map(p => p.id).sort()).toEqual(['pos:o99', 'pos:q1']);
    expect(chart.people).toEqual({ onChart: 19, probation: 1, notConnected: 0 });
    expect(chart.checks).toEqual([]);
  });

  it('broken reporting keeps people off the chart and is listed by name; people who left never appear', () => {
    const chart = build([
      person('ceo', null, 'CEO'), person('m', 'ceo', 'Manager'), person('ok', 'm', 'Clerk'),
      person('gone', 'ceo', 'Manager', { employmentStatus: 'RESIGNED' }), person('orphan', 'gone', 'Clerk'),
      person('lost', 'nobody', 'Clerk'), person('self', 'self', 'Clerk'),
      person('a', 'b', 'Clerk'), person('b', 'a', 'Clerk'),
      person('alone', null, 'Driver'), person('untitled', 'm', ' n/a '),
    ]);
    expect(chart.positions.map(p => p.id).sort()).toEqual(['pos:ceo', 'pos:m', 'pos:ok', 'pos:untitled']);
    expect(chart.checks.map(c => [c.kind, c.severity, c.count])).toEqual([
      ['MANAGER_MISSING', 'ERROR', 2], ['REPORTING_LOOP', 'ERROR', 2], ['MANAGER_INACTIVE', 'WARNING', 1], ['NO_MANAGER', 'WARNING', 1], ['NO_JOB_TITLE', 'WARNING', 1],
    ]);
    expect(chart.checks.find(c => c.kind === 'MANAGER_MISSING')!.people).toEqual(['LOST Test', 'SELF Test']);
    expect(chart.positions.find(p => p.id === 'pos:untitled')!.title).toBe('No job title');
    expect(chart.people.notConnected).toBe(6);
  });

  it('shows the branch with the department only when the company has several branches', () => {
    const one = build([person('ceo', null, 'CEO', { plantBranch: 'Head Office' }), person('a', 'ceo', 'Clerk', { plantBranch: 'Head Office' })]);
    expect(one.multiBranch).toBe(false); expect(one.positions[1].unit?.branch).toBeNull();
    const two = build([person('ceo', null, 'CEO', { plantBranch: 'Head Office' }), person('a', 'ceo', 'Clerk', { plantBranch: 'Ruiru' })]);
    expect(two.multiBranch).toBe(true); expect(two.positions[1].unit?.branch).toBe('Ruiru');
  });
});

describe('02.02 detail tiers (who may see how much)', () => {
  // ceo ← m ← s ← o ;  other ← x
  const managerOf = new Map<string, string | null>([['ceo', null], ['m', 'ceo'], ['s', 'm'], ['o', 's'], ['other', null], ['x', 'other'], ['loopA', 'loopB'], ['loopB', 'loopA']]);
  const { tierOf } = jest.requireActual('./position-chart') as typeof import('./position-chart');
  it('HR, admins and super admins see full details of everyone; management sees work details of everyone', () => {
    for (const role of ['HR', 'ADMIN', 'SUPER_ADMIN']) expect(tierOf({ role, viewerEmployeeId: null, targetId: 'x', managerOf })).toBe('FULL');
    expect(tierOf({ role: 'MANAGEMENT', viewerEmployeeId: null, targetId: 'x', managerOf })).toBe('MANAGER');
  });
  it('a manager (or HOD, or anyone) sees work details of people below them and of themselves; basics otherwise', () => {
    expect(tierOf({ role: 'HOD', viewerEmployeeId: 'm', targetId: 'o', managerOf })).toBe('MANAGER');
    expect(tierOf({ role: 'EMPLOYEE', viewerEmployeeId: 's', targetId: 's', managerOf })).toBe('MANAGER');
    expect(tierOf({ role: 'HOD', viewerEmployeeId: 'm', targetId: 'x', managerOf })).toBe('BASIC');
    expect(tierOf({ role: 'EMPLOYEE', viewerEmployeeId: 'o', targetId: 'm', managerOf })).toBe('BASIC');
    expect(tierOf({ role: 'HOD', viewerEmployeeId: null, targetId: 'o', managerOf })).toBe('BASIC');
    expect(tierOf({ role: 'HOD', viewerEmployeeId: 'm', targetId: 'loopA', managerOf })).toBe('BASIC');
  });
});

describe('02.02 person details from the core records', () => {
  const { CoreRecordsPositionsSource } = jest.requireActual('./core-records-positions.source') as typeof import('./core-records-positions.source');
  const row = {
    id: 'e1', firstName: 'Ann', middleName: null, lastName: 'Kim', employeeCode: ' 7001 ', jobTitle: 'Supervisor', plantBranch: 'Ruiru',
    section: 'Line 1', subSection: null, employmentStatus: 'PROBATION', employmentType: 'FULL_TIME', dateJoined: new Date('2026-03-01T00:00:00Z'),
    shift: 'A', workStation: null, level: 'L3', grade: null, skillLevel: 'LEVEL_2', trainingNeeded: false, jobCategory: 'Production',
    primaryWorkRole: null, machineProcess: 'Injection', canBeLeader: true, canBeMember: true, canBeAssignedTasks: true,
    department: { id: 'd1', name: 'Production' }, reportingManager: { id: 'm1', firstName: 'Bo', middleName: null, lastName: 'Li' }, hrRecordOwner: null,
  };
  const source = (found: unknown) => {
    const findFirst = jest.fn(async () => found);
    return { findFirst, source: new CoreRecordsPositionsSource({ employee: { findFirst } } as never) };
  };
  it('sends only what the tier allows, and never selects personal fields', async () => {
    const { source: s, findFirst } = source(row);
    const basic = await s.getPerson('org', 'e1', 'BASIC');
    expect(basic).toMatchObject({ name: 'Ann Kim', employeeCode: '7001', manager: { employeeId: 'm1', name: 'Bo Li' }, history: null, emsProfileUrl: null });
    expect(basic).not.toHaveProperty('work'); expect(basic).not.toHaveProperty('role');
    const manager = await s.getPerson('org', 'e1', 'MANAGER');
    expect(manager?.work).toMatchObject({ status: 'PROBATION', dateJoined: '2026-03-01', shift: 'A' }); expect(manager).not.toHaveProperty('role');
    expect((await s.getPerson('org', 'e1', 'FULL'))?.role).toMatchObject({ machineProcess: 'Injection', canBeLeader: true });
    const selected = Object.keys((findFirst.mock.calls[0] as unknown as [{ select: Record<string, unknown> }])[0].select);
    for (const personal of ['email', 'phone', 'nationalId', 'dateOfBirth', 'homeAddress', 'whatsappNumber', 'emergencyContactName', 'gender', 'nationality'])
      expect(selected).not.toContain(personal);
    const where = (findFirst.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where;
    expect(where).toMatchObject({ id: 'e1', organizationId: 'org' });
  });
  it('returns nothing for someone outside the company or no longer active', async () => {
    expect(await source(null).source.getPerson('org', 'e9', 'FULL')).toBeNull();
  });
});
