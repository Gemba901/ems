import assert from 'node:assert/strict';
import test from 'node:test';
import { reviewDepartments, namesFromColumn, suggestColumn, sheetOrigin, columnSummary, departmentColumnWarnings } from '../app/ems/onboarding/departments/department-setup';

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
test('recognises the template heading "Current Department" below a key row', () => {
  const rows = [['CLIENT DATA SHEET · 27 columns · Key: …'], ['Company Code', 'Employee Code', 'Current Department'], ['GPL', 'EMP-001', 'Production']];
  assert.deepEqual(suggestColumn(rows), { header: 1, column: 2 });
});
test('prefers the plain Department column over a combined "Plant & Department" column', () => {
  assert.deepEqual(suggestColumn([['Department', 'Plant & Department'], ['Quality', 'Head Office - Quality']]), { header: 0, column: 0 });
});
test('reads where a worksheet starts, for real row and column labels', () => {
  assert.deepEqual(sheetOrigin('A1:AA999'), { row: 0, col: 0 });
  assert.deepEqual(sheetOrigin('B3:N262'), { row: 2, col: 1 });
  assert.deepEqual(sheetOrigin('AA10:AC20'), { row: 9, col: 26 });
  assert.deepEqual(sheetOrigin(undefined), { row: 0, col: 0 });
});
test('summarises a department column: values, distinct names and the rows they span', () => {
  const rows = [['Name', 'Department'], ['Sam', 'Production'], ['Faith', ''], ['Ann', ' production '], ['Bo', 'Quality']];
  assert.deepEqual(columnSummary(rows, 0, 1), { count: 3, distinct: 2, first: 1, last: 4 });
  assert.deepEqual(columnSummary(rows, 0, 0).count, 4);
});
test('a real department column raises no warnings', () => {
  const rows = [['Name', 'Department'], ...Array.from({ length: 20 }, (_, i) => [`P${i}`, i % 2 ? 'Production' : 'Quality'])];
  assert.deepEqual(departmentColumnWarnings(rows, 0, 1), []);
});
test('employee names, codes and phones are flagged as unlikely departments', () => {
  const rows = [['Employee Name', 'Employee Number', 'Mobile'], ...Array.from({ length: 20 }, (_, i) => [`Person ${i}`, String(1000 + i), `07110010${String(i).padStart(2, '0')}`])];
  assert.ok(departmentColumnWarnings(rows, 0, 0).some((w) => w.includes('Almost every row')));
  assert.ok(departmentColumnWarnings(rows, 0, 0).some((w) => w.includes('doesn’t mention')));
  assert.ok(departmentColumnWarnings(rows, 0, 1).some((w) => w.includes('numbers or codes')));
  assert.ok(departmentColumnWarnings(rows, 0, 2).some((w) => w.includes('phone')));
});
test('a combined Plant & Department column is flagged', () => {
  const rows = [['Plant & Department'], ['Head Office - Finance'], ['Head Office - Finance']];
  assert.ok(departmentColumnWarnings(rows, 0, 0).some((w) => w.includes('combined')));
});
