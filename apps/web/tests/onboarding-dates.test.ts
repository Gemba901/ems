import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as XLSX from 'xlsx';
import { excelSerialToIso, inferDateOrder, readDate } from '../components/ems/import-dates';
import { applyRememberedChoices, buildImportRows, columnChoicesToSave } from '../app/ems/onboarding/import-extra-fields';

const today = '2026-10-23';
const read = (value: string, order: 'DMY' | 'MDY' | null = 'DMY', kind: 'birth' | 'event' = 'birth') => readDate(value, kind, today, order);

test('digit-only birth dates convert only when one reading is plausible', () => {
  assert.deepEqual(read('220987'), { iso: '1987-09-22' });
  assert.deepEqual(read('080987'), { iso: '1987-09-08' });
  assert.deepEqual(read('80987'), { iso: '1987-09-08' }, 'a General cell that lost its leading zero');
  assert.deepEqual(read('08987'), { iso: '1987-09-08' });
  assert.deepEqual(read('090801'), { iso: '2001-08-09' });
  assert.deepEqual(read('19870922'), { iso: '1987-09-22' });
  assert.deepEqual(read('8987'), { candidates: ['1987-09-08'] }, 'four digits are only a suggestion');
  assert.deepEqual(read('090887', null), { candidates: ['1987-08-09', '1987-09-08'] });
});

test('separated, named and year-first dates', () => {
  assert.deepEqual(read('3/16/05', null), { iso: '2005-03-16' });
  assert.deepEqual(read('22/09/1987', 'MDY'), { iso: '1987-09-22' }, 'the value itself proves day-first');
  assert.deepEqual(read('09/08/87', 'MDY'), { iso: '1987-09-08' });
  assert.deepEqual(read('16 Mar 2005', null), { iso: '2005-03-16' });
  assert.deepEqual(read('Mar 16, 2005', null), { iso: '2005-03-16' });
  assert.deepEqual(read('1987/9/22', null), { iso: '1987-09-22' });
});

test('implausible or nonsense values are not guessed', () => {
  for (const value of ['3/16/3105', '2505-01-14', '31/02/1990', 'n/a', '???', '12']) assert.deepEqual(read(value, null), { unreadable: true }, value);
  assert.deepEqual(read('20220912'), { unreadable: true }, 'a four-year-old is not a plausible employee');
  assert.deepEqual(read('20220912', 'DMY', 'event'), { iso: '2022-09-12' }, 'but it is a fine joining date');
});

test('column order comes from values that prove it', () => {
  assert.equal(inferDateOrder(['22/09/87', '01/02/90']), 'DMY');
  assert.equal(inferDateOrder(['3/16/05', '01/02/90']), 'MDY');
  assert.equal(inferDateOrder(['22/09/87', '3/16/05']), 'MIXED');
  assert.equal(inferDateOrder(['01/02/90', '220987']), null);
});

test('Excel day counts count only when plausible', () => {
  assert.equal(excelSerialToIso(32042, false, 'birth', today), '1987-09-22');
  assert.equal(excelSerialToIso(220987, false, 'birth', today), null);
});

test('a General number is read as digits, while a date-formatted cell is a real date', () => {
  const sheet = XLSX.utils.aoa_to_sheet([['Employee code', 'Date of birth'], ['E1', 220987], ['E2', 32042]]);
  sheet.B2.z = 'General';
  sheet.B3.z = 'dd/mm/yyyy';
  const grid = [['Employee code', 'Date of birth'], ['E1', 220987], ['E2', 32042]];
  const rows = buildImportRows(grid, 0, 0, ['employeeCode', 'profile:dateOfBirth'], 'FIRST_LAST', sheet, false, { today }).rows;
  assert.equal(rows[0].extraFields![0].value, '1987-09-22');
  assert.equal(rows[1].extraFields![0].value, '1987-09-22');
});

test('an unresolved column leaves ambiguous dates as written', () => {
  const grid = [['Employee code', 'Date of birth'], ['E1', '09/08/87']];
  const rows = buildImportRows(grid, 0, 0, ['employeeCode', 'profile:dateOfBirth'], 'FIRST_LAST', undefined, false, { today, dateOrders: { 1: null } }).rows;
  assert.equal(rows[0].extraFields![0].value, '09/08/87');
  const dayFirst = buildImportRows(grid, 0, 0, ['employeeCode', 'profile:dateOfBirth'], 'FIRST_LAST', undefined, false, { today, dateOrders: { 1: 'DMY' } }).rows;
  assert.equal(dayFirst[0].extraFields![0].value, '1987-08-09');
});

test('a date column remembers its day/month order', () => {
  const saved = columnChoicesToSave(['DOB', 'Notes'], ['profile:dateOfBirth', 'extra'], { 0: 'MDY' });
  assert.deepEqual(saved, [{ heading: 'DOB', destination: 'profile:dateOfBirth@MDY' }, { heading: 'Notes', destination: 'extra' }]);
  const applied = applyRememberedChoices(['DOB', 'Notes'], ['extra', 'extra'], ['profile:dateOfBirth@MDY', null]);
  assert.deepEqual(applied.mapping, ['profile:dateOfBirth', 'extra']);
  assert.deepEqual(applied.dateOrders, { 0: 'MDY' });
});
