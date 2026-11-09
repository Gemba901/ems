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
