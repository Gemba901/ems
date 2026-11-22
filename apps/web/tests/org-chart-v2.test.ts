import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chartSummary, departmentTops, findPeople, indexChart, outlineRows, peersOf, type ChartData } from '../components/ems/org-chart-v2/model';

const person = (id: string, name: string, managerId: string | null, extra: object = {}) => ({ id, name, jobTitle: 'Title', department: { id: 'd1', name: 'Production' },
  branch: null, branchText: null, managerId, reportsToBody: null, status: 'ACTIVE', photoUrl: null, ...extra });
const data = (people: ReturnType<typeof person>[], issues: { employeeId: string; kind: string }[] = []): ChartData => ({ people, issues, source: 'EMS', refreshedAt: '2026-11-06T00:00:00Z' });

const company = data([
  person('ceo', 'Surya Pareek', null, { reportsToBody: 'BOARD', department: { id: 'ex', name: 'Executive' } }),
  person('coo', 'Rodgers Munene', 'ceo', { department: { id: 'ex', name: 'Executive' } }),
  person('chro', 'Priyanka Jonas', 'ceo', { department: { id: 'hr', name: 'HR' } }),
  person('pm', 'Daniel Ochieng', 'coo'), person('s1', 'Peter Muthoni', 'pm'), person('s2', 'Moses Kiprop', 'pm'),
  person('o1', 'Collins Omondi', null),
], [{ employeeId: 'o1', kind: 'NO_MANAGER' }]);

test('starts on the person at the top with the most people under them, and walks the chain', () => {
  const index = indexChart(company);
  assert.equal(index.start?.id, 'ceo');
  assert.deepEqual(index.chain('s1').map(p => p.id), ['ceo', 'coo', 'pm']);
  assert.deepEqual(index.teamOf('pm').map(p => p.name), ['Moses Kiprop', 'Peter Muthoni']);
  assert.equal(index.everyoneBelow('ceo'), 5);
  assert.deepEqual(peersOf(index, index.byId.get('coo')!).map(p => p.id), ['chro']);
  assert.deepEqual(index.unconnected.map(p => p.id), ['o1']);
});

test('loops, self-reporting and missing managers never hang or crash', () => {
  const broken = data([person('a', 'Ann', 'b'), person('b', 'Ben', 'a'), person('c', 'Cy', 'c'), person('d', 'Di', 'gone')]);
  const index = indexChart(broken);
  assert.ok(index.chain('a').length <= 1);
  assert.deepEqual(index.chain('c'), []);
  assert.deepEqual(index.chain('d'), []);
  assert.ok(index.everyoneBelow('a') <= 1);
});

test('summary, search, department tops and the list outline', () => {
  const index = indexChart(company);
  assert.deepEqual(chartSummary(index, company), { people: 7, layers: 4, average: 1.7 });
  assert.deepEqual(findPeople(company, 'mo').map(p => p.name), ['Moses Kiprop', 'Collins Omondi']);
  assert.deepEqual(departmentTops(index, company, 'd1').map(p => p.id), ['o1', 'pm']);
  assert.deepEqual(outlineRows(index, new Set(['ceo'])).map(r => `${r.person.id}:${r.depth}`), ['ceo:0', 'chro:1', 'coo:1']);
});

test('chart layout: teams hang under their manager; closed teams hide; big teams wrap under the manager', async () => {
  const { layoutTree, CARD } = await import('../components/ems/org-chart-v2/model');
  const index = indexChart(company);
  const closed = layoutTree(index, index.tops, new Set());
  assert.deepEqual(closed.nodes.map(n => n.person.id), ['ceo']);
  const tree = layoutTree(index, index.tops, new Set(['ceo', 'coo']));
  const at = (id: string) => tree.nodes.find(n => n.person.id === id)!;
  assert.deepEqual(tree.nodes.map(n => n.person.id).sort(), ['ceo', 'chro', 'coo', 'pm']);
  assert.ok(at('coo').y > at('ceo').y && at('pm').y > at('coo').y, 'each level sits below its manager');
  assert.equal(at('pm').x + CARD.width / 2, at('coo').x + CARD.width / 2, 'an only child sits straight under its manager');
  assert.ok(at('ceo').x >= Math.min(at('coo').x, at('chro').x) && at('ceo').x <= Math.max(at('coo').x, at('chro').x), 'manager centred over the team');
  // A team of 13 with no open teams of its own stacks in 2 columns (7 rows) under its manager.
  const big = data([person('m', 'Manager', null, { reportsToBody: 'BOARD' }), ...Array.from({ length: 13 }, (_, i) => person(`p${i}`, `Person ${String(i).padStart(2, '0')}`, 'm'))]);
  const bigIndex = indexChart(big), wrapped = layoutTree(bigIndex, bigIndex.tops, new Set(['m']));
  const members = wrapped.nodes.filter(n => n.person.id !== 'm');
  assert.equal(new Set(members.map(n => n.y)).size, 7);
  assert.equal(new Set(members.map(n => n.x)).size, 2);
  assert.ok(wrapped.width < 3 * (CARD.width + CARD.gap), 'stacking keeps the team narrow');
  // Four or fewer stay in one row; a mixed team (someone's own team open) of 12+ wraps in rows of 6.
  const small = data([person('m', 'Manager', null, { reportsToBody: 'BOARD' }), ...Array.from({ length: 4 }, (_, i) => person(`q${i}`, `Q ${i}`, 'm'))]);
  const smallIndex = indexChart(small);
  assert.equal(new Set(layoutTree(smallIndex, smallIndex.tops, new Set(['m'])).nodes.filter(n => n.person.id !== 'm').map(n => n.y)).size, 1);
  const mixed = data([person('m', 'Manager', null, { reportsToBody: 'BOARD' }), ...Array.from({ length: 13 }, (_, i) => person(`p${i}`, `P ${i}`, 'm')), person('x', 'Under P0', 'p0')]);
  const mixedIndex = indexChart(mixed), mixedTree = layoutTree(mixedIndex, mixedIndex.tops, new Set(['m', 'p0']));
  assert.equal(new Set(mixedTree.nodes.filter(n => n.person.id.startsWith('p')).map(n => n.y)).size, 3);
  // Every card is a separate place: no two overlap.
  for (const a of wrapped.nodes) for (const b of wrapped.nodes) if (a !== b)
    assert.ok(Math.abs(a.x - b.x) >= CARD.width || Math.abs(a.y - b.y) >= CARD.height, `${a.person.id} overlaps ${b.person.id}`);
});

test('chart routes: each team member has a route from under their manager’s +/− button down to their card', async () => {
  const { layoutTree, CARD } = await import('../components/ems/org-chart-v2/model');
  const big = data([person('m', 'Manager', null, { reportsToBody: 'BOARD' }), ...Array.from({ length: 13 }, (_, i) => person(`p${i}`, `Person ${i + 1}`, 'm'))]);
  const index = indexChart(big), tree = layoutTree(index, index.tops, new Set(['m']));
  const manager = tree.nodes.find(n => n.person.id === 'm')!;
  for (const node of tree.nodes.filter(n => n.person.id !== 'm')) {
    const route = tree.routes.get(node.person.id)!;
    assert.deepEqual(route[0], [manager.x + CARD.width / 2, manager.y + CARD.height + CARD.chipClear], 'starts below the button');
    assert.deepEqual(route[route.length - 1], [node.x + CARD.width / 2, node.y], 'ends at the top of the card');
    for (let i = 1; i < route.length; i++) assert.ok(route[i][0] === route[i - 1][0] || route[i][1] === route[i - 1][1], 'straight segments only');
  }
  // Person 13 is on the last row: its route goes via the trunk on the left.
  const last = tree.routes.get('p12')!;
  assert.ok(last.length === 6 && last[2][0] < Math.min(...tree.nodes.filter(n => n.person.id !== 'm').map(n => n.x)), 'later rows are reached through the trunk');
  // The line from a manager starts below their button, leaving clear space.
  assert.ok(tree.lines.every(l => !(l.x1 === l.x2 && l.x1 === manager.x + CARD.width / 2 && l.y1 < manager.y + CARD.height + CARD.chipClear && l.y2 > manager.y + CARD.height)), 'no line under the button');
});

test('zoom: fit, limits, zooming around a point, card modes and department colours', async () => {
  const { fitZoom, clampZoom, zoomAround, cardMode, departmentColours, ZOOM } = await import('../components/ems/org-chart-v2/model');
  assert.equal(fitZoom(4000, 1000, 1000, 600), 0.25);
  assert.equal(fitZoom(40000, 1000, 1000, 600), ZOOM.min, 'very wide charts stop at the smallest zoom');
  assert.equal(fitZoom(500, 300, 1000, 600), 1, 'never zooms in past 100% to fit');
  assert.equal(clampZoom(0.01), ZOOM.min); assert.equal(clampZoom(9), ZOOM.max);
  // The content point under the cursor stays under the cursor.
  const next = zoomAround({ left: 100, top: 50 }, { x: 200, y: 100 }, 1, 2);
  assert.deepEqual(next, { left: 400, top: 200 });
  assert.equal((next.left + 200) / 2, (100 + 200) / 1);
  assert.deepEqual([cardMode(1), cardMode(0.5), cardMode(0.2)], ['FULL', 'NAME', 'BLOCK']);
  const { colourOf, legend, others } = departmentColours(company.people);
  assert.equal(legend.length, 3); assert.deepEqual(others, { departments: 0, people: 0 });
  assert.notEqual(colourOf(company.people[0]), colourOf(company.people[3]), 'different departments, different colours');
});

test('the arrangement adapts to the screen: wide screens spread out, narrow ones stack; colours cap at 10', async () => {
  const { bestLayout, departmentColours, OTHER_COLOUR } = await import('../components/ems/org-chart-v2/model');
  const people = [person('ceo', 'CEO', null, { reportsToBody: 'BOARD' })];
  for (let m = 0; m < 8; m++) { people.push(person(`m${m}`, `Manager ${m}`, 'ceo')); for (let i = 0; i < 12; i++) people.push(person(`m${m}p${i}`, `Person ${m}-${i}`, `m${m}`)); }
  const big = data(people), index = indexChart(big), open = new Set(['ceo', ...Array.from({ length: 8 }, (_, m) => `m${m}`)]);
  const wide = bestLayout(index, index.tops, open, 1600, 500), narrow = bestLayout(index, index.tops, open, 500, 1600);
  assert.ok(wide.tree.width / wide.tree.height > narrow.tree.width / narrow.tree.height, 'wide screen gets a wider arrangement');
  assert.ok(wide.zoom >= bestLayout(index, index.tops, open, 1600, 500).zoom - 1e-9);
  // Never worse than the default arrangement.
  const { layoutTree } = await import('../components/ems/org-chart-v2/model');
  const plain = layoutTree(index, index.tops, open);
  assert.ok(wide.zoom >= Math.min(1600 / (plain.width + 64), 500 / (plain.height + 88)));
  // 12 departments: the 10 largest get colours, the 2 smallest are "Other" grey.
  const many = data(Array.from({ length: 12 }, (_, d) => Array.from({ length: d + 1 }, (_, i) => person(`d${d}p${i}`, `P ${d} ${i}`, null, { department: { id: `d${d}`, name: `Dept ${String(d).padStart(2, '0')}` } }))).flat());
  const colours = departmentColours(many.people);
  assert.equal(colours.legend.length, 10);
  assert.deepEqual(colours.others, { departments: 2, people: 3 });
  assert.equal(colours.colourOf(many.people[0]), OTHER_COLOUR, 'the smallest department is grey');
  assert.equal(new Set(colours.legend.map(d => d.colour)).size, 10, 'all different');
});

test('summaries, the leadership view and the whole-company view', async () => {
  const { layoutTree, leadershipOpen, wholeCompany, SUMMARY_FROM, bestLayout, READABLE_ZOOM } = await import('../components/ems/org-chart-v2/model');
  // A summarised team is a strip under its manager's card: no member cards, no extra level.
  const index = indexChart(company);
  const tree = layoutTree(index, index.tops, new Set(['ceo', 'coo', 'pm']), {}, new Set(['pm']));
  const pm = tree.nodes.find(n => n.key === 'pm')!;
  assert.equal(pm.summary, 2);
  assert.ok(!tree.nodes.some(n => n.person.id === 's1'), 'members are not drawn one by one');
  assert.equal(Math.max(...tree.nodes.map(n => n.y)), pm.y, 'no level below the summarised team');
  // Small companies: Open all shows everyone; big ones summarise members-only teams (managers are always drawn).
  assert.equal(wholeCompany(index, company.people).summarised.size, 0);
  const people = [person('ceo', 'CEO', null, { reportsToBody: 'BOARD' })];
  for (let m = 0; m < 30; m++) { people.push(person(`m${m}`, `M ${m}`, 'ceo')); for (let i = 0; i < 10; i++) people.push(person(`m${m}p${i}`, `P ${m}.${i}`, `m${m}`)); }
  const big = data(people), bigIndex = indexChart(big);
  assert.ok(big.people.length > SUMMARY_FROM);
  const all = wholeCompany(bigIndex, big.people);
  assert.equal(all.summarised.size, 30); assert.ok(all.open.has('ceo') && !all.summarised.has('ceo'));
  // Leadership view: as many levels as stay readable; always at least the top person's team.
  const lead = leadershipOpen(bigIndex, 1350, 700);
  assert.ok(lead.has('ceo'));
  if (lead.size > 1) assert.ok(bestLayout(bigIndex, bigIndex.tops, lead, 1350, 700).zoom >= READABLE_ZOOM);
  // A small company fits readably with every level open.
  assert.deepEqual([...leadershipOpen(index, 1350, 700)].sort(), ['ceo', 'coo', 'pm']);
});
