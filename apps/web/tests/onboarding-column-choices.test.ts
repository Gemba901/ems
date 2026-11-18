import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyRememberedChoices, columnChoicesToSave, headingSaysIgnore, initialImportMapping } from '../app/ems/onboarding/import-extra-fields';
import { summariseImportedColumns } from '../components/ems/imported-columns';

test('a heading that says ignore starts as Ignore, in any case', () => {
  assert.equal(headingSaysIgnore('Test case (ignore this column)'), true);
  assert.equal(headingSaysIgnore('IGNORE – internal'), true);
  assert.equal(headingSaysIgnore('Notes'), false);
  assert.deepEqual(initialImportMapping(['Employee code', 'Test case (ignore this column)', 'Notes'], [['E1', 'x', 'y']]), ['employeeCode', null, 'extra']);
});

test('remembered choices apply over built-in recognition; the ignore marker still wins', () => {
  const headers = ['Staff No.', 'Plant & Department', 'Notes (ignore)', 'Date of birth', 'Old field'];
  const initial = initialImportMapping(headers, [['1', 'a', 'b', '1990-01-01', 'z']]);
  const { mapping, remembered } = applyRememberedChoices(headers, initial,
    ['employeeCode', 'ignore', 'extra', null, 'noLongerOffered']);
  assert.deepEqual(mapping, ['employeeCode', null, null, 'profile:dateOfBirth', 'extra']);
  assert.deepEqual(remembered, [true, true, false, false, false]);
});

test('every titled column is remembered with its final choice', () => {
  assert.deepEqual(columnChoicesToSave(['Code', '', 'Notes', 'DOB'], ['employeeCode', 'extra', null, 'profile:dateOfBirth']), [
    { heading: 'Code', destination: 'employeeCode' }, { heading: 'Notes', destination: 'ignore' }, { heading: 'DOB', destination: 'profile:dateOfBirth' },
  ]);
});

test('imported columns are summarised once per column, counting only open records for changes', () => {
  const field = (column: number, heading: string, value: string, target: string | null = null) => ({ column, heading, originalValue: value, value, target } as never);
  const rows = summariseImportedColumns({ records: [
    { status: 'READY', extraFields: [field(6, 'DOB', '1990-01-01'), field(7, 'Notes', '')] },
    { status: 'NEEDS_FIXING', extraFields: [field(6, 'DOB', '1990-01-01', 'dateOfBirth')] },
    { status: 'REGISTERED', extraFields: [field(6, 'DOB', '1980-02-02', 'dateOfBirth')] },
    { status: 'EXCLUDED', extraFields: [field(6, 'DOB', '1970-03-03')] },
  ] });
  assert.equal(rows.length, 2);
  const [dob, notes] = rows;
  assert.deepEqual([dob.column, dob.total, dob.withValue, dob.open], [6, 4, 4, 2]);
  assert.deepEqual(dob.samples, ['1990-01-01', '1980-02-02', '1970-03-03']);
  assert.deepEqual([...dob.targets].sort(), [null, 'dateOfBirth'].sort());
  assert.deepEqual([notes.withValue, notes.open], [0, 1]);
});
