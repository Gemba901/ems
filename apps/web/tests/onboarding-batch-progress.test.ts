import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {OnboardingRecord, OnboardingRecordStatus, OnboardingBatchStatus, ReportingResolution} from '../services/ems.service';
import {summarizeBatchProgress, waitingOnChain, needsDuplicateReview} from '../components/ems/onboarding-batch-progress';

// Only fields used by the presentation helper are material to these fixtures.
const row=(id:string,status:OnboardingRecordStatus,extra:Partial<OnboardingRecord>={}):OnboardingRecord =>
  ({id,status,validationErrors:null,...extra}) as OnboardingRecord;
const resolution=(extra:Partial<ReportingResolution>={}):ReportingResolution =>
  ({target:'record:manager',error:null,warning:null,depth:null,state:'PENDING',managerName:'Manager',...extra});
const batch=(records:OnboardingRecord[],byRecord:Record<string,ReportingResolution>={},status:OnboardingBatchStatus='DRAFT') =>
  ({records,status,hierarchy:{options:[],orderedIds:records.map(r=>r.id),byRecord}});
const duplicate={requiresReview:true} as OnboardingRecord['duplicateReview'];
const chainError='Manager selected. Wider reporting chain needs attention.';
const waiting=row('waiting','NEEDS_FIXING',{validationErrors:[{field:'reportingToName',message:chainError}]});
const upstream=resolution({errorScope:'UPSTREAM',error:chainError});

test('empty imports have no misleading 100% progress',()=>{
  const p=summarizeBatchProgress(batch([]));assert.equal(p.label,'Empty import');assert.equal(p.registeredPercent,null);assert.equal(p.readyPercent,null);assert.equal(p.complete,false);
});
test('all excluded is not registered and has no denominator',()=>{
  const p=summarizeBatchProgress(batch([row('a','EXCLUDED'),row('b','EXCLUDED')]));
  assert.equal(p.label,'All records excluded');assert.equal(p.included,0);assert.equal(p.registeredPercent,null);assert.equal(p.readyPercent,null);assert.equal(p.complete,false);
});
test('fully Ready still means zero registered',()=>{
  const p=summarizeBatchProgress(batch([row('a','READY'),row('b','READY')]));
  assert.equal(p.label,'Ready to register');assert.equal(p.readyPercent,100);assert.equal(p.registeredPercent,0);assert.equal(p.remaining,2);assert.equal(p.complete,false);
});
test('registered with exclusions uses included denominator and has no remaining readiness percentage',()=>{
  const p=summarizeBatchProgress(batch([row('a','REGISTERED'),row('b','EXCLUDED')]));
  assert.equal(p.label,'Registered with exclusions');assert.equal(p.registeredPercent,100);assert.equal(p.readyPercent,null);assert.equal(p.counts.excluded,1);assert.equal(p.complete,true);
});
test('all registered without exclusions is labelled Registered',()=>{
  const p=summarizeBatchProgress(batch([row('a','REGISTERED')]));assert.equal(p.label,'Registered');assert.equal(p.complete,true);
});
test('partial registration and readiness use different explicit denominators',()=>{
  const p=summarizeBatchProgress(batch([row('a','REGISTERED'),row('b','READY'),row('c','NEEDS_FIXING'),row('d','EXCLUDED')]));
  assert.equal(p.label,'Partially registered');assert.equal(p.included,3);assert.equal(p.remaining,2);
  assert.equal(p.registeredPercent,33.3);assert.equal(p.readyPercent,50);
});
test('not-yet-validated imported rows remain counted',()=>{
  const p=summarizeBatchProgress(batch([row('a','DRAFT'),row('b','DRAFT')]));assert.equal(p.label,'Awaiting validation');assert.equal(p.counts.unchecked,2);
});
test('mixed statuses have an in-progress label',()=>{
  const p=summarizeBatchProgress(batch([row('a','READY'),row('b','DRAFT')]));assert.equal(p.label,'In progress');assert.equal(p.readyPercent,50);
});
test('valid pending manager registration is Ready, not waiting or needs fixing',()=>{
  const p=summarizeBatchProgress(batch([row('a','READY')],{a:resolution({warning:'Valid manager assignment pending'})}));
  assert.equal(p.counts.ready,1);assert.equal(p.counts.waiting,0);assert.equal(p.counts.needsFixing,0);
});
test('an upstream-only error is waiting while direct errors need fixing',()=>{
  const direct=row('direct','NEEDS_FIXING',{validationErrors:[{field:'reportingToName',message:'Choose a person'}]});
  const p=summarizeBatchProgress(batch([waiting,direct],{waiting:upstream,direct:resolution({errorScope:'DIRECT',error:'Choose a person'})}));
  assert.equal(p.counts.waiting,1);assert.equal(p.counts.needsFixing,1);
});
test('additional personal errors classify as needs fixing despite upstream issues',()=>{
  const person={...waiting,validationErrors:[...waiting.validationErrors!,{field:'firstName',message:'Required'}]};
  const p=summarizeBatchProgress(batch([person],{waiting:upstream}));assert.equal(p.counts.needsFixing,1);assert.equal(p.counts.waiting,0);
});
test('duplicate-only review is separate from ordinary correction',()=>{
  const person=row('review','NEEDS_FIXING',{duplicateReview:duplicate,validationErrors:[{field:'duplicateReview',message:'Review possible match'}]});
  const p=summarizeBatchProgress(batch([person]));assert.equal(p.counts.needsReview,1);assert.equal(p.counts.needsFixing,0);
});
test('overlapping duplicate-review and chain flags never double-count or make fixing negative',()=>{
  const person={...waiting,duplicateReview:duplicate};const p=summarizeBatchProgress(batch([person],{waiting:upstream}));
  assert.equal(needsDuplicateReview(person,upstream),true);assert.equal(waitingOnChain(person,upstream),false);
  assert.equal(p.counts.needsReview,1);assert.equal(p.counts.waiting,0);assert.equal(p.counts.needsFixing,0);
  assert.equal(Object.values(p.counts).reduce((a,b)=>a+b,0),p.total);
});
test('all seven count categories are exhaustive and exclusive',()=>{
  const rows=[row('a','READY'),row('b','REGISTERED'),row('c','EXCLUDED'),row('d','DRAFT'),row('e','NEEDS_FIXING'),waiting,
    row('f','NEEDS_FIXING',{duplicateReview:duplicate,validationErrors:[{field:'duplicateReview',message:'Review'}]})];
  const p=summarizeBatchProgress(batch(rows,{waiting:upstream}));assert.deepEqual(Object.values(p.counts),[1,1,1,1,1,1,1]);
});
test('cancelled batches retain historical counts without claiming completion',()=>{
  const p=summarizeBatchProgress(batch([row('a','READY'),row('b','EXCLUDED')],{},'CANCELLED'));
  assert.equal(p.label,'Cancelled');assert.equal(p.counts.ready,1);assert.equal(p.cancelled,true);assert.equal(p.complete,false);
});
test('VALIDATING presentation respects the operation status',()=>{
  assert.equal(summarizeBatchProgress(batch([row('a','READY')],{},'VALIDATING')).label,'Validating');
});
test('large incomplete imports cannot round up to 100%',()=>{
  const rows=Array.from({length:10000},(_,i)=>row(String(i),i===9999?'NEEDS_FIXING':'READY'));
  assert.equal(summarizeBatchProgress(batch(rows)).readyPercent,99.9);
});
test('exclude and put-back recalculate progress without modifying saved inputs',()=>{
  const before=batch([row('a','READY'),row('b','NEEDS_FIXING')]),copy=JSON.stringify(before);
  assert.equal(summarizeBatchProgress(before).readyPercent,50);
  const excluded=batch([before.records[0],{...before.records[1],status:'EXCLUDED'}]);assert.equal(summarizeBatchProgress(excluded).readyPercent,100);
  const restored=batch([before.records[0],{...before.records[1],status:'DRAFT'}]);assert.equal(summarizeBatchProgress(restored).readyPercent,50);
  assert.equal(JSON.stringify(before),copy);
});
