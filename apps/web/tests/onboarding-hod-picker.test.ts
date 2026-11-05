import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hodPickerModel, personViewLink} from '../components/ems/onboarding-hod-picker';
import type {HodDirectoryEntry, ReportingOption} from '../services/ems.service';
const registered: ReportingOption={target:'employee:bruno',name:'Bruno Mars',employeeCode:'1151',department:'Division Management',branch:'Film Division',designation:'Plant Head'};
const pending: ReportingOption={...registered,target:'record:bruno',recordId:'bruno',batchId:'batch-one'};
const entry=(person:ReportingOption, source:'CONFIRMED'|'IMPORTED'='CONFIRMED', overrides:Partial<HodDirectoryEntry>={}):HodDirectoryEntry=>({key:person.target+source,source,department:'Production',branch:'Film Division',target:person.target,person,selectable:true,note:null,...overrides});
test('registered and pending people sharing name and code stay separate',()=>{
 const model=hodPickerModel([registered,pending],[],[]);
 assert.deepEqual(model.people.map(p=>p.target),[registered.target,pending.target]);
});
test('multiple confirmed appointments produce one selectable person with appointment scopes',()=>{
 const model=hodPickerModel([registered,registered],[entry(registered),entry(registered,'CONFIRMED',{key:'second',branch:'Head Office'})],[]);
 assert.equal(model.people.length,1);assert.equal(model.existing.length,1);
 assert.deepEqual(model.appointments.get(registered.target),['Production · Film Division','Production · Head Office']);
 assert.equal(model.notes[registered.target].detail,'HOD for Production · Film Division (+1 more)');
});
test('imported and suggested HOD names never become confirmed appointments',()=>{
 const model=hodPickerModel([registered,pending],[entry(pending,'IMPORTED')],[{...registered,suggestionReasons:['Name matches; designation differs.']}]);
 assert.equal(model.existing.length,0);
 assert.equal(model.notes[pending.target].badge,'Suggested · unconfirmed');
 assert.deepEqual(model.reasons.get(registered.target),['Name matches; designation differs.']);
});
test('saved and suggested facts for one target keep their distinct meaning',()=>{
 const model=hodPickerModel([registered],[entry(registered)],[{...registered,suggestionReasons:['2 existing profiles name Bruno']}]);
 assert.equal(model.notes[registered.target].badge,'Existing HOD');
 assert.deepEqual(model.reasons.get(registered.target),['2 existing profiles name Bruno']);
});
test('a directory entry or suggestion cannot inject a person outside the eligible options',()=>{
 const model=hodPickerModel([registered],[entry(pending)],[pending]);
 assert.deepEqual(model.people,[registered]);assert.equal(model.existing.length,0);assert.equal(model.reasons.has(pending.target),false);
 assert.equal(model.unavailable.length,1);
});
test('unselectable confirmed entries are retained as information, not existing HOD choices',()=>{
 const model=hodPickerModel([pending],[entry(pending,'CONFIRMED',{selectable:false,note:'Pending in another import'})],[]);
 assert.equal(model.existing.length,0);assert.equal(model.unavailable[0].note,'Pending in another import');
});
test('profile links derive from target identity, never from a name or code',()=>{
 assert.deepEqual(personViewLink({...registered,target:'employee:a/b'}),{href:'/ems/employees/a%2Fb',label:'Open employee profile'});
 assert.equal(personViewLink({...registered,target:'employee:'}),null);
});
test('pending links require the actual source batch and focus its record',()=>{
 assert.deepEqual(personViewLink(pending),{href:'/ems/onboarding/batch-one?record=bruno',label:'Open import record'});
 assert.equal(personViewLink({...pending,batchId:undefined}),null);
 assert.equal(personViewLink({...pending,target:'BOARD'}),null);
});
