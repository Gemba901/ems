import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { coloursForGroups, colourOf, OTHER_COLOUR, PALETTE, rankColourGroups, UNRECORDED_COLOUR } from '../components/ems/branch-colours';
import {
  DEFAULT_PAGE_STATE, departmentIssues, departmentsBackHref, departmentsCsv, filterDepartments, hodColumn, hodGroups, hodRows, hodStateCounts,
  readPageState, sortDepartments, writePageState,
  type DepartmentBranch, type DepartmentDirectoryRow, type DepartmentHod,
} from '../components/ems/department-directory';

const hod = (state: DepartmentHod['state'], name?: string): DepartmentHod =>
  ({ state, person: name ? { id: `p-${name}`, name, employeeCode: null, jobTitle: 'Lead' } : null });
const branch = (key: string, label: string, h: DepartmentHod, total = 5, active = 5): DepartmentBranch =>
  ({ key, label, total, active, probation: 0, inactive: total - active, withoutManager: 0, hod: h });
const row = (id: string, name: string, branches: DepartmentBranch[]): DepartmentDirectoryRow => ({
  id, name, branches, probation: 0, withoutManager: 0,
  total: branches.reduce((n, b) => n + b.total, 0), active: branches.reduce((n, b) => n + b.active, 0), inactive: branches.reduce((n, b) => n + b.inactive, 0),
});

describe('EMS branch colours (shared with the org chart)', () => {
  it('ranks by people working, then everyone, then name; 13 colours, the rest grey', () => {
    const groups = Array.from({ length: 15 }, (_, i) => ({ id: `b${i}`, name: `Branch ${String(i).padStart(2, '0')}`, people: 20 + i, activePeople: i < 2 ? 50 : 10 }));
    const colours = coloursForGroups(groups);
    assert.equal(colours.get('b1'), PALETTE[0]); // tie on active → more people first
    assert.equal(colours.get('b0'), PALETTE[1]);
    assert.equal([...colours.values()].filter(c => c !== OTHER_COLOUR).length, PALETTE.length);
    assert.equal(colours.get('b2'), OTHER_COLOUR); // the two smallest
  });
  it('leaves "not recorded" out of the ranking and pale', () => {
    const colours = coloursForGroups([{ id: '', name: 'Branch not recorded', people: 99, activePeople: 99 }, { id: 'north', name: 'North', people: 1, activePeople: 1 }]);
    assert.equal(colours.get('north'), PALETTE[0]);
    assert.equal(colourOf(colours, ''), UNRECORDED_COLOUR);
    assert.deepEqual(rankColourGroups([{ id: '', name: 'x', people: 1, activePeople: 1 }]).main, []);
  });
});

describe('EMS Departments status', () => {
  const six = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot'];
  it('names the branches with no HOD; "No HOD (by choice)" is not a problem', () => {
    const r = row('d', 'Production', six.map((l, i) => branch(l.toLowerCase(), l, i < 2 ? hod('ASSIGNED', 'Jo') : hod('NOT_RECORDED'))));
    assert.deepEqual(departmentIssues(r, true).map(i => i.text), ['4 of 6 branches have no HOD: Charlie, Delta, Echo +1']);
    assert.deepEqual(departmentIssues(row('d', 'P', [branch('a', 'A', hod('UNASSIGNED')), branch('b', 'B', hod('ASSIGNED', 'Jo'))]), true), []);
    const none = row('d', 'P', [branch('a', 'A', hod('NOT_RECORDED')), branch('b', 'B', hod('NOT_RECORDED'))]);
    assert.equal(departmentIssues(none, true)[0].text, 'No HOD at any of its 2 branches: A, B');
    assert.equal(departmentIssues(none, false)[0].text, 'No HOD');
  });
  it('flags a department with nobody active, without also asking for a HOD', () => {
    const issues = departmentIssues(row('d', 'Old', [branch('a', 'A', hod('NOT_RECORDED'), 3, 0)]), true);
    assert.deepEqual(issues.map(i => [i.kind, i.text]), [['NO_ACTIVE', 'No active people (3 inactive)']]);
  });
  it('the HOD column lists HODs and returns missing branches separately', () => {
    const c = hodColumn(row('d', 'P', [branch('a', 'A', hod('ASSIGNED', 'Jo')), branch('b', 'B', hod('NOT_RECORDED'))]));
    assert.deepEqual([c.shown.map(b => b.key), c.missing.map(b => b.key)], [['a'], ['b']]);
  });
});

describe('EMS Departments HOD view groups', () => {
  const rows = [row('p', 'Production', [branch('n', 'North', hod('ASSIGNED', 'Jo')), branch('', 'Branch not recorded', hod('NOT_RECORDED')), branch('s', 'South', hod('NOT_RECORDED'))]),
    row('h', 'HR', [branch('s', 'South', hod('ASSIGNED', 'Al'))])];
  it('groups by department (default) or by branch, "Branch not recorded" last', () => {
    assert.deepEqual(hodGroups(rows, false, 'DEPARTMENT').map(g => [g.label, g.entries.length]), [['HR', 1], ['Production', 3]]);
    assert.deepEqual(hodGroups(rows, false, 'BRANCH').map(g => g.label), ['North', 'South', 'Branch not recorded']);
    assert.deepEqual(hodGroups(rows, true, 'BRANCH').map(g => [g.label, g.entries.length]), [['South', 1], ['Branch not recorded', 1]]);
  });
});

describe('EMS Departments place in the address', () => {
  it('round-trips, leaves out defaults, keeps "Branch not recorded" and ignores tampered values', () => {
    const state = { ...DEFAULT_PAGE_STATE, view: 'HODS' as const, group: 'BRANCH' as const, branch: '', search: 'prod', hodState: 'MISSING' as const, hod: 'p-Jo' };
    assert.deepEqual(readPageState(new URLSearchParams(writePageState(state))), state);
    assert.equal(writePageState(DEFAULT_PAGE_STATE), '');
    assert.deepEqual(readPageState(new URLSearchParams('view=EVIL&sort=x&layout=TABLE')), { ...DEFAULT_PAGE_STATE, layout: 'TABLE' });
    // Older addresses ("missing=1") still open "No HOD"; a tampered person id is ignored.
    assert.equal(readPageState(new URLSearchParams('missing=1')).hodState, 'MISSING');
    assert.equal(readPageState(new URLSearchParams('hod=%3Cscript%3E')).hod, null);
  });
  it('Back only ever returns to a Departments address on this site', () => {
    assert.equal(departmentsBackHref('/ems/organisation?view=HODS&group=BRANCH'), '/ems/organisation?view=HODS&group=BRANCH');
    for (const bad of ['https://evil.example', '//evil.example', '/ems/organisationX', '/ems/employees', 'javascript:alert(1)', null, ''])
      assert.equal(departmentsBackHref(bad), '/ems/organisation');
  });
});

describe('EMS Departments CSV export', () => {
  it('quotes every cell and stops spreadsheet formulas', () => {
    const csv = departmentsCsv([row('d', '=HYPERLINK("x")', [branch('a', 'A "1"', hod('ASSIGNED', '+Jo'))])], true);
    assert.equal(csv.split('\r\n')[1], `"'=HYPERLINK(""x"")","A ""1""","'+Jo","Confirmed HOD","5","5","0","0",""`);
  });
});

describe('EMS Departments search and HOD filters', () => {
  const rows = [
    row('p', 'Production', [branch('n', 'North', hod('ASSIGNED', 'Doris Wanjiru')), branch('s', 'South', hod('NOT_RECORDED')), branch('e', 'East', hod('UNASSIGNED'))]),
    row('h', 'Human Resources', [branch('n', 'North', hod('ASSIGNED', 'Doris Wanjiru'), 2, 2)]),
    row('f', 'Finance', [branch('s', 'South', hod('PENDING', 'Future Hod'), 9, 9)]),
  ];
  it('the Departments search also finds a department by its HOD (within the chosen branch)', () => {
    assert.deepEqual(filterDepartments(rows, 'doris', null).map(r => r.id), ['p', 'h']);
    assert.deepEqual(filterDepartments(rows, 'doris', 's').map(r => r.id), []);
    assert.deepEqual(filterDepartments(rows, 'fin', null).map(r => r.id), ['f']);
  });
  it('HODs: by state, by person, and a search over department, branch and HOD', () => {
    assert.equal(hodRows(rows, { state: 'MISSING' }).length, 1);
    assert.equal(hodRows(rows, true).length, 1); // the old "Missing only" switch
    assert.deepEqual(hodRows(rows, { person: 'p-Doris Wanjiru' }).map(e => e.department.id), ['h', 'p']);
    assert.deepEqual(hodRows(rows, { search: 'south' }).map(e => e.department.id), ['f', 'p']);
    assert.deepEqual(hodStateCounts(rows), { ALL: 5, HAS: 2, MISSING: 1, BY_CHOICE: 1, PENDING: 1, REVIEW: 0 });
    assert.deepEqual(hodGroups(rows, { person: 'p-Doris Wanjiru' }, 'BRANCH').map(g => [g.label, g.entries.length]), [['North', 2]]);
  });
  it('sorts by fewest people', () => {
    assert.deepEqual(sortDepartments(rows, 'FEWEST', true).map(r => r.id), ['h', 'f', 'p']);
  });
  it('names the branches in Status as a list the page can link and fold', () => {
    const r = row('d', 'P', ['A', 'B', 'C', 'D', 'E'].map(l => branch(l.toLowerCase(), l, l === 'A' ? hod('ASSIGNED', 'Jo') : hod('NOT_RECORDED'))));
    const [issue] = departmentIssues(r, true);
    assert.equal(issue.lead, '4 of 5 branches have no HOD');
    assert.deepEqual(issue.branches?.map(b => b.key), ['b', 'c', 'd', 'e']);
    assert.equal(issue.text, '4 of 5 branches have no HOD: B, C, D +1');
    assert.equal(departmentIssues(r, false)[0].branches, undefined);
  });
});
