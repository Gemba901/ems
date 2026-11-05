import assert from 'node:assert/strict';
import { test } from 'node:test';
import { personFullName } from '../components/ems/person-name';
import { suggestedHodConfirmations } from '../components/ems/onboarding-hod-bulk';

test('display names leave out an N/A middle name', () => {
  assert.equal(personFullName({ firstName: 'Daniel', middleName: 'N/A', lastName: 'Ochieng' }), 'Daniel Ochieng');
  assert.equal(personFullName({ firstName: 'Peter', middleName: 'Chebet', lastName: 'Muthoni' }), 'Peter Chebet Muthoni');
  assert.equal(personFullName(undefined), '');
});

const option = (target: string, branch = 'Injection Moulding') =>
  ({ target, name: target.toUpperCase(), designation: 'Manager', employeeCode: '1', department: 'X', branch });
const hod = (key: string, extra: object = {}) => ({ target: null, state: 'NEEDS_ATTENTION', person: null, error: null, warning: null,
  evidenceKey: key, departmentId: `d-${key}`, departmentName: key, branchKey: 'injection moulding', branchLabel: 'Injection Moulding',
  version: `v-${key}`, reviewKey: null, suggestedTarget: `record:${key}-mgr`, affectedRecords: 3, ...extra });
const evidence = (count: number, blank = 0, groups = 1) => ({ total: count + blank, blank,
  groups: Array.from({ length: groups }, (_, i) => ({ name: `Name ${i}`, designation: 'Manager', count, records: [] })) });
function batch(records: { id: string; status?: string; hod: object }[], hodEvidence: Record<string, object>, options: object[]) {
  return { records: records.map(r => ({ id: r.id, status: r.status ?? 'NEEDS_FIXING' })),
    peopleLinks: { options, hodEvidence, byRecord: Object.fromEntries(records.map(r => [r.id, { hod: r.hod }])) } } as never;
}

test('departments where every record names the same HOD are offered together, once each', () => {
  const b = batch([{ id: 'a1', hod: hod('Assembly') }, { id: 'a2', hod: hod('Assembly') }, { id: 'p1', hod: hod('Production') }],
    { Assembly: evidence(2), Production: evidence(1) }, [option('record:Assembly-mgr'), option('record:Production-mgr')]);
  const { ready, individual } = suggestedHodConfirmations(b);
  assert.deepEqual(ready.map(r => [r.departmentName, r.recordId, r.count, r.version]), [['Assembly', 'a1', 2, 'v-Assembly'], ['Production', 'p1', 1, 'v-Production']]);
  assert.equal(individual, 0);
});

test('disagreement, blanks, another branch, or an already confirmed HOD are left out', () => {
  const b = batch([
    { id: 'q', hod: hod('Quality') },                       // two different HOD names
    { id: 's', hod: hod('Stores') },                        // some records blank
    { id: 'l', hod: hod('Logistics') },                     // the person is based elsewhere
    { id: 'f', hod: hod('Finance', { reviewKey: 'done' }) }, // already confirmed
    { id: 'x', status: 'EXCLUDED', hod: hod('Engineering') },
  ], { Quality: evidence(2, 0, 2), Stores: evidence(2, 1), Logistics: evidence(3), Finance: evidence(3), Engineering: evidence(3) },
  [option('record:Quality-mgr'), option('record:Stores-mgr'), option('record:Logistics-mgr', 'Head Office'), option('record:Finance-mgr'), option('record:Engineering-mgr')]);
  const { ready, individual } = suggestedHodConfirmations(b);
  assert.deepEqual(ready, []);
  assert.equal(individual, 3, 'Quality, Stores and Logistics need an individual choice; Finance is done; Engineering is excluded');
});
