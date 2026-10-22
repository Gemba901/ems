import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normaliseFiveSLocation } from '../components/ems/five-s-location';
import { profileSavePayload } from '../components/ems/employee-profile-dates';
import { mapHeaders, findHeaderRow, findMappingConflicts, requiredFields } from '../app/ems/onboarding/column-map';
import { buildImportRows, initialImportMapping } from '../app/ems/onboarding/import-extra-fields';

test('current job-title headings map to existing employee and relationship fields', () => {
  assert.deepEqual(mapHeaders(['Job title', 'HOD job title', 'Reporting to job title', '1st reliever job title', '2nd reliever job title', 'Email']),
    ['jobDesignation', 'hodDesignation', 'reportingToDesignation', 'reliever1Designation', 'reliever2Designation', 'workEmail']);
});

test('historical designation and work-email headings remain accepted', () => {
  assert.deepEqual(mapHeaders(['Job Designation', 'Designation', 'HOD Designation', 'Reporting To Designation', 'Reliever 1 Designation', 'Reliever 2 Designation', 'Work Email']),
    ['jobDesignation', 'jobDesignation', 'hodDesignation', 'reportingToDesignation', 'reliever1Designation', 'reliever2Designation', 'workEmail']);
});

test('ordinal and word-based reliever headings identify the correct slot', () => {
  assert.deepEqual(mapHeaders(['First Reliever Job Title', 'Reliever 1 Job Title', 'Second Reliever Job Title', 'Reliever 2 Job Title', '1st Reliever Designation', '2nd Reliever Designation']),
    ['reliever1Designation', 'reliever1Designation', 'reliever2Designation', 'reliever2Designation', 'reliever1Designation', 'reliever2Designation']);
});

test('work and personal email columns require a mapping choice rather than overwriting', () => {
  const mapping = mapHeaders(['Employee code', 'Email', 'Personal email address', 'Work email']);
  assert.deepEqual(findMappingConflicts(mapping), [{ field: 'workEmail', columns: [1, 2, 3] }]);
});

test('old and new title columns are recognised as competing mappings', () => {
  const mapping = mapHeaders(['Job title', 'Job designation', 'HOD job title', 'HOD designation']);
  assert.deepEqual(findMappingConflicts(mapping), [
    { field: 'jobDesignation', columns: [0, 1] }, { field: 'hodDesignation', columns: [2, 3] },
  ]);
});

test('new headings import actual values into the unchanged registration payload', () => {
  const grid = [
    ['Employee code', 'Full name', 'Job title', 'Email', 'Reporting to job title', 'HOD job title', '1st reliever job title'],
    ['EMP-42', 'Nancy Akinyi', 'Inspector', 'nancy@example.test', 'Board', 'Quality Manager', 'Inspector'],
  ];
  const result = buildImportRows(grid, 0, 0, initialImportMapping(grid[0], grid.slice(1)), 'FIRST_LAST');
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.rows, [{ rowNumber: 2, employeeCode: 'EMP-42', firstName: 'Nancy', middleName: undefined,
    lastName: 'Akinyi', jobDesignation: 'Inspector', workEmail: 'nancy@example.test', reportingToDesignation: 'Board',
    hodDesignation: 'Quality Manager', reliever1Designation: 'Inspector' }]);
});

test('header detection understands the new labels while unrelated role columns remain unmapped', () => {
  assert.equal(findHeaderRow([['Staff import'], [], ['Job title', 'Email']]), 2);
  assert.deepEqual(mapHeaders(['Role', 'Position ID', 'Professional credential']), [null, null, null]);
});

test('renaming email does not change the channel requirement or create a second contact field', () => {
  assert.equal(requiredFields('EMAIL').has('workEmail'), true);
  assert.equal(requiredFields('WHATSAPP').has('workEmail'), false);
  assert.equal(requiredFields('WHATSAPP').has('whatsappNumber'), true);
});

test('the screenshot Position/Role headings map to all five job-title fields', () => {
  assert.deepEqual(mapHeaders(['Job Position/Role', 'HOD Position/Role', 'Reporting To Position/Role', 'Reliever 1 Position/Role', 'Reliever 2 Position/Role']),
    ['jobDesignation', 'hodDesignation', 'reportingToDesignation', 'reliever1Designation', 'reliever2Designation']);
});

test('abbreviated Pos/Role headings and punctuation variations map consistently', () => {
  assert.deepEqual(mapHeaders([' JOB POS / ROLE * ', 'HOD Pos/Role', 'Reporting To Pos / Role', '1st Reliever Pos/Role', '2nd Reliever Pos/Role']),
    ['jobDesignation', 'hodDesignation', 'reportingToDesignation', 'reliever1Designation', 'reliever2Designation']);
  assert.deepEqual(mapHeaders(['HOD Job Position/Role', 'Head of Department Position/Role', 'Reporting Manager Job Pos/Role', 'First Reliever Job Position/Role', 'Second Reliever Job Pos/Role']),
    ['hodDesignation', 'hodDesignation', 'reportingToDesignation', 'reliever1Designation', 'reliever2Designation']);
});

test('Position/Role values reach the original core fields instead of retained extras', () => {
  const grid = [
    ['Employee code', 'Job Pos/Role', 'HOD Name', 'HOD Position/Role', 'Reporting To Position/Role', 'Reliever 1 Pos/Role', 'Reliever 2 Position/Role', 'Level', 'Grade', '5S Location Categiry'],
    ['EMP-7', 'Inspector', 'Jane Manager', 'Quality Manager', 'Board', 'Inspector', 'Operator', 'L2', 'G4', 'Office'],
  ];
  const mapping = initialImportMapping(grid[0], grid.slice(1));
  assert.deepEqual(mapping, ['employeeCode', 'jobDesignation', 'hodName', 'hodDesignation', 'reportingToDesignation', 'reliever1Designation', 'reliever2Designation', 'profile:level', 'profile:grade', 'fiveSLocationCategory']);
  const result = buildImportRows(grid, 0, 0, mapping, 'FIRST_LAST');
  assert.deepEqual(result.errors, []);
  const row = result.rows[0];
  assert.equal(row.jobDesignation, 'Inspector');
  assert.equal(row.hodDesignation, 'Quality Manager');
  assert.equal(row.reportingToDesignation, 'Board');
  assert.equal(row.reliever1Designation, 'Inspector');
  assert.equal(row.reliever2Designation, 'Operator');
  assert.equal(row.fiveSLocationCategory, 'Office');
  assert.equal(row.extraFields?.length, 2);
});

test('Position/Role plus a title or designation column still requires one mapping choice', () => {
  assert.deepEqual(findMappingConflicts(mapHeaders(['Job Pos/Role', 'Job title', 'HOD Position/Role', 'HOD Designation', 'Reporting To Position/Role', 'Reporting To Job Title'])), [
    {field: 'jobDesignation', columns: [0, 1]},
    {field: 'hodDesignation', columns: [2, 3]},
    {field: 'reportingToDesignation', columns: [4, 5]},
  ]);
});


test('5S category spelling variants map to one optional core field', () => {
  const mapping = mapHeaders(['5S Location Category', '5S Location Categiry', '5S Category', 'Five S Location Category']);
  assert.deepEqual(mapping, Array(4).fill('fiveSLocationCategory'));
  assert.equal(requiredFields('EMAIL').has('fiveSLocationCategory'), false);
  assert.equal(requiredFields('WHATSAPP').has('fiveSLocationCategory'), false);
  assert.deepEqual(findMappingConflicts(mapping), [{field: 'fiveSLocationCategory', columns: [0, 1, 2, 3]}]);
});


test('5S editor category labels normalise consistently and profile clearing survives payload preparation', () => {
  assert.equal(normaliseFiveSLocation('Production Shop-Floor'), 'PRODUCTION_SHOP_FLOOR');
  assert.equal(normaliseFiveSLocation('Office'), 'OFFICE');
  assert.equal(normaliseFiveSLocation('N/A'), null);
  assert.equal(normaliseFiveSLocation('Warehouse'), undefined);
  assert.equal(profileSavePayload({fiveSLocationCategory: null}).fiveSLocationCategory, null);
  assert.equal(profileSavePayload({fiveSLocationCategory: 'OFFICE', employmentStatus: 'ACTIVE'}).employmentStatus, undefined);
});
