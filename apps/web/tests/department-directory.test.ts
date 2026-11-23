import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filterDepartments, type DepartmentDirectoryRow } from '../components/ems/department-directory';
const rows: DepartmentDirectoryRow[] = [{ id: 'd', name: 'Production', total: 5, active: 4, inactive: 1, branches: [
  { key: 'north', label: 'North', total: 3, active: 2, inactive: 1, hod: { state: 'NOT_RECORDED', person: null } },
  { key: '', label: 'Branch not recorded', total: 2, active: 2, inactive: 0, hod: { state: 'NOT_RECORDED', person: null } },
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
