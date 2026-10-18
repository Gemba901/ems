import assert from 'node:assert/strict';
import test from 'node:test';
import { reviewDepartments, namesFromColumn, suggestColumn } from '../app/ems/onboarding/departments/department-setup';

test('repeated employees produce one department entry, with an occurrence count', () => {
  assert.deepEqual(reviewDepartments('Production\n production \n\nQuality', []), [
    { key: 'production', name: 'Production', occurrences: 2, status: 'new', detail: 'Will be created when selected.' },
    { key: 'quality', name: 'Quality', occurrences: 1, status: 'new', detail: 'Will be created when selected.' },
  ]);
});
test('existing names are reused regardless of case and repeated spaces', () => {
  assert.equal(reviewDepartments('Human  Resources', [{ id: 'a', name: 'Human Resources' }])[0].status, 'existing');
});
test('placeholders and invalid names cannot be selected for creation', () => {
  for (const value of ['N/A', 'Nil', 'None', '--', '?', 'x'.repeat(161)]) assert.equal(reviewDepartments(value, [])[0].status, 'invalid');
});
test('existing duplicate names are flagged without silently choosing one', () => {
  assert.equal(reviewDepartments('Production', [{ id: 'a', name: 'Production' }, { id: 'b', name: 'PRODUCTION' }])[0].status, 'ambiguous');
});
test('names that the current importer conflates are flagged', () => {
  assert.ok(reviewDepartments('R&D\nRD', []).every(row => row.status === 'ambiguous'));
  assert.equal(reviewDepartments('Production (Line 1)', [{ id: 'a', name: 'Production' }])[0].status, 'ambiguous');
});
test('does not suggest an arbitrary column when the department heading is absent', () => {
  assert.equal(suggestColumn([['Name', 'Designation'], ['Sam', 'Inspector']]), null);
});
test('finds a department header below workbook title rows', () => {
  const rows = [['Gemba Plastics'], [], ['Name', 'Dept.'], ['Sam', 'Quality'], ['Faith', 'Quality']];
  assert.deepEqual(suggestColumn(rows), { header: 2, column: 1 });
  assert.deepEqual(namesFromColumn(rows, 2, 1), ['Quality', 'Quality']);
});
test('extracts only the chosen column below the chosen header, excluding blanks', () => {
  assert.deepEqual(namesFromColumn([['Company'], ['Name', 'Department'], ['Sam', ' Production '], ['Faith', ''], ['Ann', 'Quality']], 1, 1), ['Production', 'Quality']);
});
