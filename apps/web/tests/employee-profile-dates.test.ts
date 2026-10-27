import {test} from 'node:test';
import assert from 'node:assert/strict';
import {profileSavePayload,localCalendarToday} from '../components/ems/employee-profile-dates';
test('blank optional dates are omitted while ordinary edits remain',()=>{
 assert.deepEqual(profileSavePayload({jobTitle:'Supervisor',dateOfBirth:'',dateJoined:'   '}),{jobTitle:'Supervisor'});
});
test('dates are retained and input is not mutated',()=>{
 const form={jobTitle:'Supervisor',dateOfBirth:'2000-02-29',dateJoined:'2026-10-21'};
 const before=JSON.stringify(form);assert.deepEqual(profileSavePayload(form),form);assert.equal(JSON.stringify(form),before);
});
test('an ordinary draft cannot send its old employment status',()=>{
 const form={employmentStatus:'ACTIVE' as const,jobTitle:'Supervisor',dateJoined:''};
 assert.deepEqual(profileSavePayload(form),{jobTitle:'Supervisor'});assert.equal(form.employmentStatus,'ACTIVE');
});
test('local today is a padded calendar date',()=>{
 assert.equal(localCalendarToday(new Date(2026,0,2,23,59)),'2026-01-02');
});
