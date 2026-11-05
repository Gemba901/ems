import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chainRegistrationNotice, duplicateFilterState, requestedPage} from '../components/ems/onboarding-editor-controls';
import type {DuplicateReview, ReportingResolution} from '../services/ems.service';

const review = (fields: Partial<DuplicateReview>={}): DuplicateReview => ({token:null,hardConflicts:[],possibleMatches:[],reviewed:false,requiresReview:false,blocked:false,confirmedAt:null,...fields});
const record = (duplicateReview?: DuplicateReview | null) => ({duplicateReview});
const resolution = (fields: Partial<ReportingResolution>={}): ReportingResolution => ({target:'record:manager',error:null,warning:null,state:'PENDING',managerName:'Manager',depth:1,...fields});
const match = {key:'match'} as DuplicateReview['possibleMatches'][number];

test('missing duplicate check is not treated as no current matches',()=>{
  assert.equal(duplicateFilterState(record()),'UNCHECKED');assert.equal(duplicateFilterState(record(null)),'UNCHECKED');
  assert.equal(duplicateFilterState(record(review())),'NO_MATCHES');
});
test('hard conflicts and new review requirements override an earlier confirmation',()=>{
  assert.equal(duplicateFilterState(record(review({reviewed:true,hardConflicts:[match]}))),'REQUIRES_REVIEW');
  assert.equal(duplicateFilterState(record(review({reviewed:true,requiresReview:true,possibleMatches:[match]}))),'REQUIRES_REVIEW');
});
test('reviewed as distinct requires current matches; disappeared matches are no matches',()=>{
  assert.equal(duplicateFilterState(record(review({reviewed:true,possibleMatches:[match]}))),'REVIEWED');
  assert.equal(duplicateFilterState(record(review({reviewed:true}))),'NO_MATCHES');
  assert.equal(duplicateFilterState(record(review({possibleMatches:[match]}))),'REQUIRES_REVIEW');
});
test('page entry accepts only whole pages within the current range',()=>{
  for(const text of ['', '0', '-1', '2.5', '1e2', 'Infinity', 'x', '4'])assert.equal(requestedPage(text,3),null);
  assert.equal(requestedPage(' 2 ',3),2);assert.equal(requestedPage('3',3),3);
});
test('valid pending manager explicitly permits a Ready record to register',()=>{
  const notice=chainRegistrationNotice({status:'READY'},resolution());
  assert.equal(notice?.kind,'pending');assert.match(notice!.next,/can register now/);
});
test('other personal findings do not turn a valid pending manager into the blocker',()=>{
  const notice=chainRegistrationNotice({status:'NEEDS_FIXING'},resolution());
  assert.equal(notice?.kind,'pending');assert.match(notice!.next,/other findings/);
});
test('upstream reporting errors explain the blocking person and revalidation',()=>{
  const notice=chainRegistrationNotice({status:'NEEDS_FIXING'},resolution({error:'Upstream error',errorScope:'UPSTREAM',
    blocker:{target:'record:head',recordId:'head',batchId:'batch',label:'Head',reason:'Choose a manager.'}}));
  assert.equal(notice?.kind,'blocked');assert.match(notice!.message,/Head: Choose a manager/);assert.match(notice!.next,/validate/);
});
test('stale Ready, direct errors and historical warnings do not falsely promise eligibility',()=>{
  assert.match(chainRegistrationNotice({status:'READY'},resolution({error:'Upstream error',errorScope:'UPSTREAM'}))!.heading,/refreshing/);
  assert.equal(chainRegistrationNotice({status:'NEEDS_FIXING'},resolution({error:'Choose manager',errorScope:'DIRECT'})),null);
  assert.equal(chainRegistrationNotice({status:'READY'},resolution({state:'ASSIGNED',warning:'Historical chain unknown'})),null);
});
test('registered and excluded rows receive no registration-blocked instruction',()=>{
  for(const status of ['REGISTERED','EXCLUDED'] as const)assert.equal(chainRegistrationNotice({status},resolution({error:'Upstream error',errorScope:'UPSTREAM'})),null);
});
