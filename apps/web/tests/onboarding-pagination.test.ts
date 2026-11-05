import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageWindow, recordPage } from '../components/ems/onboarding-pagination';
const rows = Array.from({length: 61}, (_, i) => ({id: String(i)}));
test('pages preserve supplied hierarchy order and source array', () => {
  const before = JSON.stringify(rows);
  assert.deepEqual(pageWindow(rows, 2, 25).rows, rows.slice(25, 50));
  assert.equal(JSON.stringify(rows), before);
});
test('last page clamps after records disappear', () => {
  const p = pageWindow(rows.slice(0, 20), 3, 25);
  assert.equal(p.page, 1); assert.equal(p.pages, 1); assert.equal(p.end, 20);
});
test('empty page is safe and does not claim a first record', () => {
  const p = pageWindow([], 9, 25);
  assert.equal(p.page, 1); assert.equal(p.start, 0); assert.equal(p.end, 0); assert.deepEqual(p.rows, []);
});
test('record destinations follow current order after a move', () => {
  assert.equal(recordPage(rows, '55', 25), 3);
  assert.equal(recordPage([rows[55], ...rows.filter(r => r.id !== '55')], '55', 25), 1);
  assert.equal(recordPage(rows, 'missing', 25), null);
});
test('page size changes correctly recalculate destinations', () => {
  assert.equal(recordPage(rows, '55', 50), 2);
  assert.equal(recordPage(rows, '55', 100), 1);
});
test('filter before pagination can find a record outside the first page', () => {
  const filtered = rows.filter(r => r.id === '55');
  assert.deepEqual(pageWindow(filtered, 1, 25).rows, [rows[55]]);
});
