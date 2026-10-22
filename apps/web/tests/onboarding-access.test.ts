import test from 'node:test';
import assert from 'node:assert/strict';
import { importedAccountRole, registrationAccess, registrationOutcomeMessage } from '../components/ems/onboarding-access';

test('HR can register employee and supervisor while elevated choices remain available for an Admin', () => {
  for (const value of ['Employee','Supervisor','Employee (ordinary)']) assert.equal(registrationAccess('HR', value), 'ALLOWED');
  for (const value of ['HOD','HR','Management','Admin','Head of Department','Manager','Human Resources','System Administrator'])
    assert.equal(registrationAccess('HR', value), 'ADMIN_REQUIRED');
});
test('Admin and Super Admin can register supported organisation roles, but never import platform access', () => {
  for (const actor of ['ADMIN','SUPER_ADMIN']) {
    for (const value of ['Employee','Supervisor','HOD','HR','Management','Admin']) assert.equal(registrationAccess(actor, value), 'ALLOWED');
    for (const value of ['SUPER_ADMIN','super admin','','__proto__','constructor']) assert.equal(registrationAccess(actor, value), 'INVALID_LEVEL');
  }
});
test('missing or unauthorised actor cannot use registration controls', () => {
  for (const actor of [undefined,null,'EMPLOYEE','HOD','MANAGEMENT','admin']) assert.equal(registrationAccess(actor,'Employee'),'FORBIDDEN');
});
test('aliases retain existing access mappings without inferring from a job title', () => {
  assert.equal(importedAccountRole(' Supervisor '),'EMPLOYEE');
  assert.equal(importedAccountRole('Head of Department'),'HOD');
  assert.equal(importedAccountRole('Director'),undefined);
  assert.equal(importedAccountRole(null),undefined);
});
test('result message separates Admin handoff from real failures, including zero new registrations', () => {
  assert.equal(registrationOutcomeMessage({registered:0,failed:0,awaitingAdmin:2}), 'Registration result · 0 registered · 2 require an Admin to register');
  assert.equal(registrationOutcomeMessage({registered:2,failed:1,awaitingAdmin:3}), 'Registration result · 2 registered · 1 could not register · 3 require an Admin to register');
  assert.equal(registrationOutcomeMessage({registered:2,failed:0}), 'Registration result · 2 registered');
});
