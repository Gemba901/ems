import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeRegistrationProgress, registrationControls, registrationActive, registrationProgressText, type RegistrationProgress } from '../components/ems/registration-progress';
const run: RegistrationProgress = {id:'run',status:'RUNNING',total:526,processed:273,registered:273,failed:0,awaitingAdmin:0,skipped:0,recoveries:0,message:null,startedAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
test('a lost response does not say registration stopped',()=>{
  assert.equal(registrationActive(run),true);
  assert.match(registrationProgressText(run,true),/may still be running/);
  assert.doesNotMatch(registrationProgressText(run,true),/Registration stopped/);
});
test('completed and paused runs unlock the next action',()=>{
  for(const status of ['COMPLETED','FAILED','STOPPED'] as const)assert.equal(registrationActive({...run,status}),false);
  assert.equal(registrationActive({...run,status:'QUEUED'}),true);
  assert.equal(registrationActive(null),false);
});
test('recovered runs explain that completed employees were saved',()=>{
  assert.match(registrationProgressText({...run,recoveries:1},false),/recovered/);
});
test('stalled progress does not promise normal loading indefinitely',()=>{
  assert.match(registrationProgressText({...run,updatedAt:new Date(Date.now()-180000).toISOString()},false),/longer than expected/);
});
test('failed or stopped run displays the saved reason',()=>{
  assert.equal(registrationProgressText({...run,status:'FAILED',message:'Review the import.'},false),'Review the import.');
});

test('a successful empty body and JSON null both mean no registration run',()=>{
  assert.equal(decodeRegistrationProgress(''),null);
  assert.equal(decodeRegistrationProgress('  '),null);
  assert.equal(decodeRegistrationProgress('null'),null);
  assert.deepEqual(decodeRegistrationProgress(JSON.stringify(run)),run);
  assert.throws(()=>decodeRegistrationProgress('not JSON'));
  assert.throws(()=>decodeRegistrationProgress('{}'));
});
test('checking or failing to check a fresh import never labels it Registering or locks editing',()=>{
  for(const state of [{checking:true,disconnected:false},{checking:false,disconnected:true}]){
    const controls=registrationControls({...state,run:null,starting:false,uncertain:false});
    assert.equal(controls.editingBlocked,false);assert.equal(controls.startBlocked,true);
    assert.notEqual(controls.label,'Registering…');
  }
  assert.deepEqual(registrationControls({run:null,checking:false,disconnected:false,starting:false,uncertain:false}),
    {active:false,editingBlocked:false,startBlocked:false,label:null});
});
test('a known active run still blocks writes and duplicate starts during a connection failure',()=>{
  const controls=registrationControls({run,checking:false,disconnected:true,starting:false,uncertain:false});
  assert.equal(controls.active,true);assert.equal(controls.editingBlocked,true);assert.equal(controls.startBlocked,true);
  assert.equal(controls.label,'Reconnecting…');
});
test('an uncertain start remains guarded until reconciled without claiming active registration',()=>{
  const controls=registrationControls({run:null,checking:false,disconnected:false,starting:false,uncertain:true});
  assert.equal(controls.editingBlocked,true);assert.equal(controls.startBlocked,true);assert.equal(controls.label,'Checking request…');
});
