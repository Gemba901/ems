import assert from 'node:assert/strict';
import { test } from 'node:test';
import { employeeNeighbours } from '../components/ems/employee-navigation';

const context = { filters: {}, page: 2, limit: 3, pages: 3, total: 8, ids: ['d', 'e', 'f'] };

test('position and neighbours follow the saved list page', () => {
  assert.deepEqual(employeeNeighbours(context, 'e'), { position: 5, total: 8, previousId: 'd', nextId: 'f', previousPage: null, nextPage: null });
});
test('at a page edge the neighbour is on the adjacent page', () => {
  assert.deepEqual(employeeNeighbours(context, 'd'), { position: 4, total: 8, previousId: null, nextId: 'e', previousPage: 1, nextPage: null });
  assert.deepEqual(employeeNeighbours(context, 'f'), { position: 6, total: 8, previousId: 'e', nextId: null, previousPage: null, nextPage: 3 });
});
test('no navigation for a profile not in the saved list, or without one', () => {
  assert.equal(employeeNeighbours(context, 'zzz'), null);
  assert.equal(employeeNeighbours(null, 'e'), null);
  assert.equal(employeeNeighbours({ ...context, page: 3, pages: 3, ids: ['g', 'h'] }, 'h')?.nextPage, null);
});
