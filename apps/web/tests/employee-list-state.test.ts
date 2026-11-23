import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEmployeeListState, saveEmployeeListState } from '../components/ems/employee-list-state';

const store = new Map<string, string>();
(globalThis as any).sessionStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };

test('the Employees list keeps search, filters, page and ticks per company, and fills in newer filters', () => {
  saveEmployeeListState('org-a', { search: 'ke', filters: { page: 2, jobTitle: 'Clerk' }, selected: [['e1', 'Kevin Ochieng']], allMatching: false, moreFilters: true });
  const back = loadEmployeeListState('org-a', { page: 1, jobTitle: '', shift: '' });
  assert.deepEqual(back, { search: 'ke', filters: { page: 2, jobTitle: 'Clerk', shift: '' }, selected: [['e1', 'Kevin Ochieng']], allMatching: false, moreFilters: true });
  assert.equal(loadEmployeeListState('org-b', { page: 1 }), null);
});

test('a damaged or missing entry is ignored', () => {
  store.set('ems-employee-list:org-c', '{not json');
  assert.equal(loadEmployeeListState('org-c', { page: 1 }), null);
  store.set('ems-employee-list:org-d', JSON.stringify({ selected: [['ok', 'Name'], [1, 2], 'x'] }));
  assert.deepEqual(loadEmployeeListState('org-d', { page: 1 })?.selected, [['ok', 'Name']]);
  assert.equal(loadEmployeeListState(undefined, { page: 1 }), null);
});
