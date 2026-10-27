import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { buildImportRows, initialImportMapping, importHeaderCells, packImportRows } from '../app/ems/onboarding/import-extra-fields';
import { findMappingConflicts, mapHeaders, type MapField } from '../app/ems/onboarding/column-map';

test('unknown columns are kept; an explicit ignore is omitted', () => {
  const grid = [['Employee code', 'Uniform', 'Note'], ['E1', 'M', 'Ignore me']];
  const mapping = initialImportMapping(grid[0]); assert.deepEqual(mapping, ['employeeCode', 'extra', 'extra']); const ignored = mapping.map((f, i) => i === 2 ? null : f);
  const {rows, errors} = buildImportRows(grid, 0, 0, ignored, 'FIRST_LAST');
  assert.deepEqual(errors, []); assert.deepEqual(rows[0].extraFields, [{column: 2, heading: 'Uniform', originalValue: 'M', value: 'M', target: null}]);
});
test('repeated headings and zero/false values remain distinct', () => {
  const grid = [['Employee code', 'Notes', 'Notes'], ['E1', 0, false]];
  const row = buildImportRows(grid, 0, 0, initialImportMapping(grid[0]), 'FIRST_LAST').rows[0];
  assert.deepEqual(row.extraFields?.map(f => [f.column, f.value]), [[2, '0'], [3, 'false']]);
});
test('extras alone below the table do not create empty employees', () => {
  const grid = [['Employee code', 'Notes'], ['E1', 'real'], ['', 'footer'], []];
  assert.equal(buildImportRows(grid, 0, 0, initialImportMapping(grid[0]), 'FIRST_LAST').rows.length, 1);
});
test('competing department mappings still block; keep-extra can be used more than once', () => {
  assert.equal(findMappingConflicts(mapHeaders(['Department', 'Plant & Department'])).length, 1);
  assert.deepEqual(findMappingConflicts(['extra', 'extra']), []);
  assert.equal(findMappingConflicts(['profile:grade', 'profile:grade']).length, 1);
});
test('full-name rules and separately mapped names retain their precedence', () => {
  const grid = [['Full name', 'First name', 'Notes'], ['OTIENO Peter Kamau', 'Paul', 'x']];
  assert.equal(buildImportRows(grid, 0, 0, initialImportMapping(grid[0]), 'FIRST_LAST').rows[0].firstName, 'Paul');
});
test('known additional headings map to existing profile fields without making them required', () => {
  assert.deepEqual(mapHeaders(['DOB', 'Grade', 'Unknown']), ['profile:dateOfBirth', 'profile:grade', null]);
});
test('Excel date serial becomes ISO while the displayed source stays intact', () => {
  const sheet = XLSX.utils.aoa_to_sheet([['Employee code', 'Date of birth'], ['E1', 32874]]);
  sheet.B2.z = 'dd/mm/yyyy'; sheet.B2.w = '01/01/1990';
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {header: 1});
  const field = buildImportRows(grid, 0, 0, initialImportMapping(grid[0]), 'FIRST_LAST', sheet).rows[0].extraFields![0];
  assert.equal(field.originalValue, '01/01/1990'); assert.equal(field.value, '1990-01-01');
});
test('respects a sheet starting below/after A1 and the 1904 date system', () => {
  const sheet = XLSX.utils.aoa_to_sheet([]); XLSX.utils.sheet_add_aoa(sheet, [['Employee code', 'Date joined'], ['E1', 0]], {origin: 'C4'});
  sheet['!ref'] = 'C4:D5';
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {header: 1});
  const row = buildImportRows(grid, 0, 3, initialImportMapping(grid[0]), 'FIRST_LAST', sheet, true).rows[0];
  assert.equal(row.rowNumber, 5); assert.equal(row.extraFields![0].column, 4); assert.equal(row.extraFields![0].value, '1904-01-01');
});
test('preserves formatted text identifiers such as leading zeros', () => {
  const sheet = XLSX.utils.aoa_to_sheet([['Employee code', 'National ID'], ['E1', 123]]); sheet.B2.w = '00123';
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {header: 1});
  assert.equal(buildImportRows(grid, 0, 0, initialImportMapping(grid[0]), 'FIRST_LAST', sheet).rows[0].extraFields![0].value, '00123');
});
test('oversized extras report the affected Excel row before upload', () => {
  const grid = [['Employee code', 'Notes'], ['E1', 'x'.repeat(4001)]];
  assert.match(buildImportRows(grid, 0, 0, initialImportMapping(grid[0]), 'FIRST_LAST').errors[0], /Excel row 2/);
});
test('request packing respects actual UTF-8 JSON including the wrapper', () => {
  const rows = Array.from({length: 15}, () => ({name: '界'.repeat(10)}));
  const chunks = packImportRows(rows, 110, 5);
  assert.deepEqual(chunks.flat(), rows);
  for (const chunk of chunks) assert.ok(new TextEncoder().encode(JSON.stringify({records: chunk})).length <= 110);
  assert.throws(() => packImportRows([{name: '界'.repeat(100)}], 100), /exceeds/);
});
test('packing still honours the row cap for tiny records', () => {
  assert.deepEqual(packImportRows([1, 2, 3, 4, 5], 1000, 2).map(x => x.length), [2, 2, 1]);
});

test('unnamed populated columns are retained with their original column identity', () => {
  const grid = [['Employee code', '', 'Note'], ['E1', 'unnamed value', 'known']];
  const mapping = initialImportMapping(importHeaderCells(grid, 0), grid.slice(1));
  const result = buildImportRows(grid, 0, 0, mapping, 'FIRST_LAST');
  assert.equal(result.rows[0].extraFields?.[0].heading, '');
  assert.equal(result.rows[0].extraFields?.[0].value, 'unnamed value');
});
