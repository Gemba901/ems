import test from 'node:test';
import assert from 'node:assert/strict';
import { blankStatusIds, isBlankForFix, valueFixAllowed, valueFixGroups } from '../components/ems/onboarding-value-fixes';
import { ISSUE_GROUPS, issueFilterFromParam, issueGroupsOf } from '../components/ems/onboarding-issue-groups';
import { mapHeaders } from '../app/ems/onboarding/column-map';
import { importedAccountRole } from '../components/ems/onboarding-access';

const odd = (field: string, value: string) => ({ field, message: field === 'beesAccessLevel' ? `Unrecognised access level "${value}"` : `Unrecognised value "${value}"` });

test('each odd value shows once per column, with its count, most common first', () => {
  const records = [
    { id: 'a', status: 'NEEDS_FIXING', employmentType: 'Perm', beesAccessLevel: 'Exec x', validationErrors: [odd('employmentType', 'Perm'), odd('beesAccessLevel', 'Exec x')] },
    { id: 'b', status: 'NEEDS_FIXING', employmentType: 'perm.', validationErrors: [odd('employmentType', 'perm.')] },
    { id: 'c', status: 'NEEDS_FIXING', employmentType: 'Temp', validationErrors: [odd('employmentType', 'Temp')] },
    { id: 'r', status: 'REGISTERED', employmentType: 'Perm', validationErrors: [odd('employmentType', 'Perm')] },
    { id: 'd', status: 'READY', employmentType: 'Perm', validationErrors: [] },
  ];
  assert.deepEqual(valueFixGroups(records).map(g => [g.field, g.value, g.count]),
    [['beesAccessLevel', 'Exec x', 1], ['employmentType', 'Perm', 2], ['employmentType', 'Temp', 1]]);
});

test('blank, placeholder and N/A statuses count as blank; registered and excluded records do not', () => {
  assert.deepEqual(['', '  ', 'nil', 'N/A', '-', 'Active'].map(isBlankForFix), [true, true, true, true, true, false]);
  assert.deepEqual(blankStatusIds([{ id: 'a', status: 'READY', employmentStatus: null }, { id: 'b', status: 'REGISTERED', employmentStatus: null },
    { id: 'c', status: 'EXCLUDED' }, { id: 'd', status: 'DRAFT', employmentStatus: 'Probation' }]), ['a']);
});

test('HR can map access to Employee only', () => {
  assert.equal(valueFixAllowed('beesAccessLevel', 'EMPLOYEE', 'HR'), true);
  assert.equal(valueFixAllowed('beesAccessLevel', 'MANAGEMENT', 'HR'), false);
  assert.equal(valueFixAllowed('beesAccessLevel', 'ADMIN', 'ADMIN'), true);
  assert.equal(valueFixAllowed('employmentType', 'CASUAL', 'HR'), true);
});

test('issue groups: reporting line apart from HOD and relievers; missing contact in both groups', () => {
  assert.deepEqual(issueGroupsOf({ field: 'reportingToName', message: 'Reporting person not found' }), ['reporting']);
  assert.deepEqual(issueGroupsOf({ field: 'hodName', message: 'x', code: 'PEOPLE_LINK' }), ['department']);
  assert.deepEqual(issueGroupsOf({ field: 'reliever1Name', message: 'x' }), ['relievers']);
  assert.deepEqual(issueGroupsOf({ field: 'whatsappNumber', message: 'A WhatsApp number is required because your organisation communicates by WhatsApp' }), ['missing', 'contact']);
  assert.deepEqual(issueGroupsOf({ field: 'jobDesignation', message: 'Required' }), ['missing']);
  assert.deepEqual(issueGroupsOf({ field: 'currentDepartment', message: 'This field applies to every employee, so N/A is not accepted' }), ['missing', 'department']);
  assert.deepEqual(issueGroupsOf({ field: 'employeeCode', message: 'Duplicated within this import' }), ['duplicate']);
  assert.deepEqual(issueGroupsOf({ field: 'beesAccessLevel', message: 'Unrecognised access level "x"' }), ['access']);
  assert.deepEqual(issueGroupsOf({ field: 'employmentType', message: 'Unrecognised value "x"' }), ['format']);
  assert.deepEqual(issueGroupsOf({ field: 'reportingToName', message: 'Choose a reporting person, or leave the name blank and use Board, Committee, Management Committee or Owner in the Reporting to job title field.' }), ['missing', 'reporting']);
  assert.equal(issueFilterFromParam('imported'), 'format');
  assert.equal(issueFilterFromParam('reporting'), 'reporting');
  assert.equal(issueFilterFromParam('nonsense'), undefined);
  assert.equal(ISSUE_GROUPS[0].value, '');
});

test('Head of Department headings and Suggested access map automatically', () => {
  assert.deepEqual(mapHeaders(['Head of Department', 'Head of Dept', 'Head of Dept (Name)', 'Department Head', 'HOD']),
    ['hodName', 'hodName', 'hodName', 'hodName', 'hodName']);
  assert.deepEqual(mapHeaders(['Head of Dept (Job title)', 'Head of Department Job Title', 'Head of Department Designation', 'HOD Job Title']),
    ['hodDesignation', 'hodDesignation', 'hodDesignation', 'hodDesignation']);
  assert.deepEqual(mapHeaders(['Suggested access', 'Suggested access level', 'BEES Access Level']), ['beesAccessLevel', 'beesAccessLevel', 'beesAccessLevel']);
});

test('Executive, Exec, Senior management, Management, Director, MD and CEO are the Executive access level; a plain Manager is not', () => {
  for (const value of ['Executive', 'Exec', 'Senior management', 'Management', 'Director', 'Managing Director', 'MD', 'CEO']) assert.equal(importedAccountRole(value), 'MANAGEMENT');
  for (const value of ['Manager', 'Plant Manager', 'General Manager']) assert.equal(importedAccountRole(value), undefined);
});
