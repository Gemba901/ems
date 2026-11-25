import test from 'node:test';
import assert from 'node:assert/strict';
import { ASSIGNABLE_ROLES, REGISTRATION_ROLE, canChangeAccess, importedAccountRole, registrationAccess, registrationOutcomeMessage, suggestedAccessRole } from '../components/ems/onboarding-access';

test('HR and Admins register every row: everyone starts as Employee, whatever the sheet suggests', () => {
  for (const actor of ['HR','ADMIN','SUPER_ADMIN'])
    for (const value of ['Employee','Supervisor','HOD','HR','Management','Executive','Admin','SUPER_ADMIN','','Team Lead'])
      assert.equal(registrationAccess(actor, value), 'ALLOWED');
  assert.equal(REGISTRATION_ROLE, 'EMPLOYEE');
});
test('the sheet value becomes a suggestion only when it is a recognised level above Employee', () => {
  assert.deepEqual(['HOD','Human Resources','Exec','Senior management','System Administrator'].map(suggestedAccessRole), ['HOD','HR','MANAGEMENT','MANAGEMENT','ADMIN']);
  for (const value of ['Employee','Supervisor','SUPER_ADMIN','super admin','__proto__','constructor','',null]) assert.equal(suggestedAccessRole(value), undefined);
});
test('only Admins change access; Super Admin is never given in EMS', () => {
  assert.deepEqual(['ADMIN','SUPER_ADMIN','HR','HOD','MANAGEMENT','EMPLOYEE',undefined].map(canChangeAccess), [true,true,false,false,false,false,false]);
  assert.ok(!ASSIGNABLE_ROLES.includes('SUPER_ADMIN' as never));
});
test('missing or unauthorised actor cannot use registration controls', () => {
  for (const actor of [undefined,null,'EMPLOYEE','HOD','MANAGEMENT','admin']) assert.equal(registrationAccess(actor,'Employee'),'FORBIDDEN');
});
test('aliases retain existing access mappings without inferring from a job title', () => {
  assert.equal(importedAccountRole(' Supervisor '),'EMPLOYEE');
  assert.equal(importedAccountRole('Head of Department'),'HOD');
  // Director / MD / CEO written in the access column mean Executive (decided Nov 2026); a plain job title still means nothing.
  assert.equal(importedAccountRole('Director'),'MANAGEMENT');
  assert.equal(importedAccountRole('Machine Operator'),undefined);
  assert.equal(importedAccountRole('Manager'),undefined);
  assert.equal(importedAccountRole(null),undefined);
});
test('result message separates Admin handoff from real failures, including zero new registrations', () => {
  assert.equal(registrationOutcomeMessage({registered:0,failed:0,awaitingAdmin:2}), 'Registration result · 0 registered · 2 require an Admin to register');
  assert.equal(registrationOutcomeMessage({registered:2,failed:1,awaitingAdmin:3}), 'Registration result · 2 registered · 1 could not register · 3 require an Admin to register');
  assert.equal(registrationOutcomeMessage({registered:2,failed:0}), 'Registration result · 2 registered');
});
