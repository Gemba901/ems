import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filterDepartments, type DepartmentDirectoryRow } from '../components/ems/department-directory';
const rows: DepartmentDirectoryRow[] = [{ id: 'd', name: 'Production', total: 5, active: 4, probation: 0, inactive: 1, withoutManager: 0, branches: [
  { key: 'north', label: 'North', total: 3, active: 2, probation: 0, inactive: 1, withoutManager: 0, hod: { state: 'NOT_RECORDED', person: null } },
  { key: '', label: 'Branch not recorded', total: 2, active: 2, probation: 0, inactive: 0, withoutManager: 0, hod: { state: 'NOT_RECORDED', person: null } },
] }];
test('department search is trimmed and case-insensitive', () => { assert.equal(filterDepartments(rows, ' PROD ', null).length, 1); });
test('selected branch gets its own totals without changing the source', () => {
  const [row] = filterDepartments(rows, '', 'north');
  assert.deepEqual([row.total, row.active, row.inactive], [3, 2, 1]); assert.equal(rows[0].total, 5);
});
test('missing branch is a distinct selection from all branches', () => {
  assert.equal(filterDepartments(rows, '', '')[0].total, 2); assert.equal(filterDepartments(rows, '', null)[0].total, 5);
});
test('unknown branch never silently shows all employees', () => { assert.deepEqual(filterDepartments(rows, '', 'unknown'), []); });

import { activeOnly, departmentIssues, departmentSummary, groupByBranch, hasSeveralBranches, hodColumn, hodRows, initials, sortDepartments } from '../components/ems/department-directory';

const hod = (state: string, name?: string) => ({ state, person: name ? { id: 'p', name, employeeCode: '1', jobTitle: 'Manager' } : null }) as never;
const branch = (key: string, label: string, extra: object = {}) => ({ key, label, total: 10, active: 9, probation: 2, inactive: 1, withoutManager: 0, hod: hod('ASSIGNED', 'Ann Wu'), ...extra });
const dept = (id: string, name: string, branches: object[], extra: object = {}) => {
  const b = branches as { total: number; active: number; probation: number; inactive: number; withoutManager: number }[];
  const sum = (k: keyof typeof b[0]) => b.reduce((n, x) => n + x[k], 0);
  return { id, name, total: sum('total'), active: sum('active'), probation: sum('probation'), inactive: sum('inactive'), withoutManager: sum('withoutManager'), branches, ...extra } as never;
};

test('active excludes probation, and branches only show when there are several real ones', () => {
  assert.equal(activeOnly({ active: 9, probation: 2 }), 7);
  assert.equal(hasSeveralBranches([dept('a', 'A', [branch('ho', 'Head Office')]), dept('b', 'B', [branch('x', 'Branch not recorded')])]), false);
  assert.equal(hasSeveralBranches([dept('a', 'A', [branch('ho', 'Head Office'), branch('im', 'Injection Moulding')])]), true);
});

test('issues are one clear line each, and the HOD column summarises branches without a HOD', () => {
  const production = dept('p', 'Production', [branch('ho', 'Head Office', { hod: hod('NOT_RECORDED') }), branch('im', 'Injection Moulding', { hod: hod('PENDING', 'Pat Ndungu'), withoutManager: 3 })]);
  assert.deepEqual(departmentIssues(production, true).map(i => i.text), ['1 of 2 branches have no HOD: Head Office', 'HOD not registered yet at Injection Moulding', '3 people have no manager']);
  assert.deepEqual(departmentIssues(production, false).map(i => i.text), ['No HOD', 'HOD not registered yet', '3 people have no manager']);
  assert.ok(departmentIssues(production, true).every(i => i.help.length > 20), 'every issue explains itself');
  assert.deepEqual(departmentIssues(dept('q', 'Quality', [branch('ho', 'Head Office', { hod: hod('UNASSIGNED') })]), false), []);
  assert.deepEqual(departmentIssues(dept('e', 'Empty', []), false).map(i => i.kind), ['EMPTY']);
  const nowhere = dept('s', 'Safety', ['A', 'B', 'C', 'D'].map(l => branch(l, l, { hod: hod('NOT_RECORDED'), withoutManager: 0 })));
  assert.equal(departmentIssues(nowhere, true)[0].text, 'No HOD at any of its 4 branches: A, B, C +1');
  const column = hodColumn(production);
  assert.deepEqual([column.shown.map(b => b.label), column.missing.map(b => b.label)], [['Injection Moulding'], ['Head Office']]);
  assert.equal(hodColumn(nowhere).missing.length, 4);
});

test('HOD view: one row per department and branch, with a missing-only filter', () => {
  const rows = [dept('b', 'Finance', [branch('ho', 'Head Office')]), dept('a', 'Assembly', [branch('im', 'Injection Moulding', { hod: hod('NOT_RECORDED') }), branch('ho', 'Head Office')])];
  assert.deepEqual(hodRows(rows, false).map(r => `${r.department.name}/${r.branch.label}`), ['Assembly/Head Office', 'Assembly/Injection Moulding', 'Finance/Head Office']);
  assert.deepEqual(hodRows(rows, true).map(r => `${r.department.name}/${r.branch.label}`), ['Assembly/Injection Moulding']);
});

test('summary chips, sorting by issues and grouping by branch', () => {
  const rows = [dept('a', 'Assembly', [branch('im', 'Injection Moulding', { hod: hod('NOT_RECORDED') })]),
    dept('b', 'Finance', [branch('ho', 'Head Office')]), dept('c', 'Procurement', [])];
  assert.deepEqual(departmentSummary(rows, true), { all: 3, noHod: 1, attention: 2, empty: 1 });
  assert.deepEqual(sortDepartments(rows, 'ISSUES', true).map((r: { name: string }) => r.name), ['Assembly', 'Finance', 'Procurement']);
  assert.deepEqual(groupByBranch(rows).map(g => [g.label, g.entries.length]), [['Head Office', 1], ['Injection Moulding', 1]]);
  assert.equal(initials('Patrick Akinyi Ndungu'), 'PN');
});
