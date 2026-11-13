import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BOX, defaultOpen, indexPositions, layoutPositions, perRowFor, rowSizes, searchPositions } from '../components/leadership-excellence/organisation-framework/positions/layout';
import type { Position, PositionChart } from '../components/leadership-excellence/organisation-framework/positions/types';

const pos = (id: string, parentId: string | null, title = id, holders = 1): Position => ({ id, parentId, title, unit: null, vacant: false, basis: 'INFERRED_FROM_PEOPLE',
  holders: Array.from({ length: holders }, (_, i) => ({ employeeId: `${id}-${i}`, name: `${title} holder ${i + 1}`, status: 'ACTIVE' as const })) });
const chart = (positions: Position[]): PositionChart => ({ source: { kind: 'SAMPLE', label: 'Test', loadedAt: '' }, company: { id: 'o', name: 'Co' },
  multiBranch: false, positions, people: { onChart: 1, probation: 0, notConnected: 0 }, checks: [] });

test('rows: as wide as the screen allows, split evenly when they wrap, one per row on phones', () => {
  assert.deepEqual(rowSizes(14, 14), [14]);
  assert.deepEqual(rowSizes(14, 10), [7, 7]);
  assert.deepEqual(rowSizes(14, 6), [5, 5, 4]);
  assert.deepEqual(rowSizes(3, 1), [1, 1, 1]);
  assert.equal(perRowFor(390), 1, 'phone');
  assert.equal(perRowFor(1000), 7, 'never fewer than 7 side by side: the chart scrolls sideways instead');
  assert.equal(perRowFor(3000), Math.floor((3000 - 56 + BOX.gap) / (BOX.width + BOX.gap)), 'more on very wide screens');
});

test('a team sits directly under its manager, the manager centred above it; neighbours move aside; nothing overlaps', () => {
  const team = Array.from({ length: 14 }, (_, i) => pos(`t${i}`, 'm'));
  const c = chart([pos('ceo', null), pos('m', 'ceo'), pos('other', 'ceo'), ...team]);
  const index = indexPositions(c);
  const closed = layoutPositions(index, index.roots, new Set(['ceo']), 14);
  const opened = layoutPositions(index, index.roots, new Set(['ceo', 'm']), 14);
  const at = (t: ReturnType<typeof layoutPositions>, id: string) => t.placed.find(p => p.position.id === id)!;
  const members = opened.placed.filter(p => p.position.parentId === 'm');
  assert.equal(new Set(members.map(p => p.y)).size, 1, 'room for 14: one row');
  const mid = (Math.min(...members.map(p => p.x)) + Math.max(...members.map(p => p.x)) + BOX.width) / 2;
  assert.ok(Math.abs(at(opened, 'm').x + BOX.width / 2 - mid) < 1, 'manager centred above the team');
  assert.ok(at(opened, 'other').x - at(opened, 'm').x > at(closed, 'other').x - at(closed, 'm').x, 'the neighbour moved aside');
  const wrapped = layoutPositions(index, index.roots, new Set(['ceo', 'm']), 10).placed.filter(p => p.position.parentId === 'm');
  assert.deepEqual([...new Set(wrapped.map(p => p.y))].map(y => wrapped.filter(p => p.y === y).length), [7, 7], 'room for 10: two rows of 7');
  const phone = layoutPositions(index, index.roots, new Set(['ceo', 'm']), 1).placed.filter(p => p.position.parentId === 'm');
  assert.equal(new Set(phone.map(p => p.y)).size, 14, 'phone: listed downwards');
  for (const t of [opened, layoutPositions(index, index.roots, new Set(['ceo', 'm']), 10)])
    for (const a of t.placed) for (const b of t.placed) if (a !== b)
      assert.ok(Math.abs(a.x - b.x) >= BOX.width || Math.abs(a.y - b.y) >= BOX.height, `${a.position.id} overlaps ${b.position.id}`);
});

test('search finds a person in a shared role as their own card and opens the way to them; arrival shows the top two levels', async () => {
  const { withPeople, teamSummary } = await import('../components/leadership-excellence/organisation-framework/positions/layout');
  const c = withPeople(chart([pos('ceo', null, 'Chief Executive'), pos('m', 'ceo', 'Production Manager'), pos('ops', 'm', 'Machine Operator', 13)]));
  const index = indexPositions(c);
  const found = searchPositions(index, c.positions, 'holder 7')!;
  assert.deepEqual([...found.hits], ['person:ops:ops-6'], 'the person, not the whole role');
  assert.deepEqual([...found.above].sort(), ['ceo', 'm', 'ops'], 'the role opens to show them');
  assert.ok(searchPositions(index, c.positions, 'machine operator')!.hits.has('ops'), 'the role itself is found by its title');
  assert.deepEqual(teamSummary(index, 'm'), { team: [index.byId.get('ops')], direct: 13, positions: 1, sharedRoles: 1, below: 13, probation: 0 });
  assert.deepEqual([...defaultOpen(index)], ['ceo'], 'arrival: the top position open, its reports showing');
  assert.equal(index.peopleBelow('ceo'), 14);
});

test('zoom modes, bounds, department colours (8 + Other) and views (branch / department with the line above faded)', async () => {
  const { cardMode, boundsOf, departmentColours, scopeOf, scopeChoices, layoutPositions: layout, indexPositions: idx, ZOOM } = await import('../components/leadership-excellence/organisation-framework/positions/layout');
  assert.deepEqual([cardMode(1), cardMode(ZOOM.readable), cardMode(0.45), cardMode(0.2)], ['FULL', 'FULL', 'TITLE', 'BLOCK']);
  const unit = (d: number, branch = 'Main') => ({ departmentId: `d${d}`, name: `Dept ${d}`, branch });
  const people = (n: number) => Array.from({ length: n }, (_, i) => ({ employeeId: `x${i}`, name: `P${i}`, status: 'ACTIVE' as const }));
  const positions: Position[] = [{ ...pos('ceo', null), unit: unit(0, 'HQ') }];
  for (let d = 1; d <= 10; d++) positions.push({ ...pos(`m${d}`, 'ceo'), unit: unit(d, d % 2 ? 'Ruiru' : 'HQ') }, { ...pos(`t${d}`, `m${d}`), unit: unit(d, d % 2 ? 'Ruiru' : 'HQ'), holders: people(d) });
  const c = { ...chart(positions), multiBranch: true };
  const colours = departmentColours(c);
  assert.equal(colours.legend.length, 8); assert.equal(colours.other.departments, 3);
  assert.equal(colours.slotOf(c.positions.find(p => p.id === 't10')!) > 0, true, 'the largest departments are coloured');
  assert.equal(colours.slotOf(c.positions.find(p => p.id === 'ceo')!), 0, 'small departments are "Other"');
  const index = idx(c);
  assert.deepEqual(scopeChoices(c).branches, ['HQ', 'Ruiru']);
  const dept = scopeOf(index, c, { kind: 'DEPARTMENT', departmentId: 'd3' })!;
  assert.deepEqual([...dept.inScope].sort(), ['m3', 't3']); assert.deepEqual([...dept.context], ['ceo']); assert.deepEqual(dept.tops.map(p => p.id), ['m3']);
  const t = layout(index, index.roots, new Set(['ceo', 'm3']), 7, dept.shown);
  assert.deepEqual(t.placed.map(p => p.position.id).sort(), ['ceo', 'm3', 't3'], 'only the view and the line above it are drawn');
  assert.equal(t.placed.find(p => p.position.id === 'ceo')!.childCount, 1, 'the + / − count follows the view');
  const branch = scopeOf(index, c, { kind: 'BRANCH', branch: 'Ruiru' })!;
  assert.equal(branch.inScope.size, 10); assert.ok(branch.context.has('ceo'));
  const r = boundsOf(t.placed, new Set(['m3', 't3']))!;
  assert.ok(r.bottom > r.top && r.right - r.left >= BOX.width);
});

test('views: connected only keeps the main structure; not connected keeps the separate ones', async () => {
  const { scopeOf, mainRoot } = await import('../components/leadership-excellence/organisation-framework/positions/layout');
  const c = chart([pos('ceo', null), pos('a', 'ceo'), pos('b', 'ceo'), pos('float', null), pos('f1', 'float')]);
  const index = indexPositions(c);
  assert.equal(mainRoot(index)?.id, 'ceo');
  assert.deepEqual([...scopeOf(index, c, { kind: 'CONNECTED' })!.shown].sort(), ['a', 'b', 'ceo']);
  assert.deepEqual([...scopeOf(index, c, { kind: 'NOT_CONNECTED' })!.shown].sort(), ['f1', 'float']);
});

test('several separate structures wrap into rows instead of one long row', () => {
  const tops = Array.from({ length: 10 }, (_, i) => pos(`top${i}`, null));
  const c = chart(tops); const index = indexPositions(c);
  const one = layoutPositions(index, index.roots, new Set(), 7);
  assert.equal(new Set(one.placed.map(p => p.y)).size, 1, 'without a width limit: one row');
  const wrapped = layoutPositions(index, index.roots, new Set(), 7, undefined, 1000);
  assert.ok(new Set(wrapped.placed.map(p => p.y)).size >= 3, 'within 1000 px: several rows');
  assert.ok(wrapped.width <= 1000);
  for (const a of wrapped.placed) for (const b of wrapped.placed) if (a !== b)
    assert.ok(Math.abs(a.x - b.x) >= BOX.width || Math.abs(a.y - b.y) >= BOX.height);
});
