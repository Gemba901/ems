import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as XLSX from 'xlsx';
import { mapHeaders, pickHeaderSheet, findHeaderRow, ALWAYS_REQUIRED_FIELDS } from '../app/ems/onboarding/column-map';

const grids = (wb: XLSX.WorkBook) => wb.SheetNames.map(name => ({ name,
  grid: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, blankrows: true, defval: '' }) }));
const template = XLSX.read(readFileSync(resolve(__dirname, '../public/BEES onboarding staff-template.xlsx')), { type: 'buffer' });

test('the template opens on the client data sheet, not the instructions or the example', () => {
  assert.equal(pickHeaderSheet(grids(template)), 'Client data sheet');
});

test('every heading in the template maps by itself, and every required field has a column', () => {
  const grid = grids(template).find(s => s.name === 'Client data sheet')!.grid;
  const row = findHeaderRow(grid);
  assert.equal(row, 1);
  const headings = grid[row] as string[], mapped = mapHeaders(headings);
  assert.deepEqual(headings.filter((_, i) => !mapped[i]), []);
  assert.equal(mapped[headings.indexOf('Suggested Access')], 'beesAccessLevel');
  for (const field of ALWAYS_REQUIRED_FIELDS) assert.ok(mapped.includes(field), field);
  assert.ok(!headings.some(h => /designation/i.test(h)), 'headings say Job Title, not Designation');
});

test('picking a sheet: headings beat none, a sheet named example loses a tie, more filled rows win, otherwise the first', () => {
  const head = ['Employee Code', 'First Name', 'Last Name', 'Mobile Number'];
  assert.equal(pickHeaderSheet([{ name: 'Notes', grid: [['hello']] }, { name: 'Staff', grid: [head, ['E1', 'A', 'B', '0712']] }]), 'Staff');
  assert.equal(pickHeaderSheet([{ name: 'Example sheet', grid: [head, ['E1', 'A', 'B', '0712']] }, { name: 'Data', grid: [head] }]), 'Data');
  assert.equal(pickHeaderSheet([{ name: 'A', grid: [head] }, { name: 'B', grid: [head, ['E1', 'A', 'B', '0712']] }]), 'B');
  assert.equal(pickHeaderSheet([{ name: 'One', grid: [['x']] }, { name: 'Two', grid: [['y']] }]), 'One');
});
