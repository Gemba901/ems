import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backfillOrganizationSlugs, planSlugBackfill, type BackfillClient } from './organization-slug-backfill';

const organizations = [
  { id: 'one', name: 'Acme', slug: null },
  { id: 'two', name: 'Beta', slug: 'beta' },
  { id: 'three', name: 'Gamma', slug: null },
];
const mapping = [{ organizationId: 'one', slug: ' ACME ' }];

test('normalizes reviewed mapping and reports remaining organizations', () => {
  const plan = planSlugBackfill(organizations, mapping);
  assert.equal(plan.changes[0].slug, 'acme');
  assert.deepEqual(plan.remaining.map((org) => org.id), ['three']);
});
test('reruns preserve already assigned slugs', () => {
  const plan = planSlugBackfill(organizations, [{ organizationId: 'two', slug: 'BETA' }]);
  assert.equal(plan.changes.length, 0);
  assert.deepEqual(plan.skipped, ['two']);
});
for (const [name, entries] of [
  ['overwrite', [{ organizationId: 'two', slug: 'other' }]],
  ['existing collision', [{ organizationId: 'one', slug: 'beta' }]],
  ['mapping collision', [...mapping, { organizationId: 'three', slug: 'acme' }]],
  ['repeated ID', [...mapping, ...mapping]],
  ['unknown ID', [{ organizationId: 'missing', slug: 'acme' }]],
  ['reserved slug', [{ organizationId: 'one', slug: 'admin' }]],
  ['malformed input', {}],
] as const) {
  test(`rejects ${name}`, () => assert.throws(() => planSlugBackfill(organizations, entries)));
}
test('rejects invalid pre-existing slugs before approving a plan', () => {
  assert.throws(() => planSlugBackfill([{ id: 'one', name: 'Acme', slug: ' ACME ' }], []));
});

function fakeClient(updateCount = 1) {
  const calls: string[] = [];
  const client: BackfillClient = {
    async query(sql) {
      calls.push(sql);
      return { rows: sql.startsWith('SELECT') ? organizations : [], rowCount: sql.startsWith('UPDATE') ? updateCount : null };
    },
  };
  return { client, calls };
}
test('dry-run performs only a read', async () => {
  const { client, calls } = fakeClient();
  await backfillOrganizationSlugs(client, mapping);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].startsWith('SELECT'));
});
test('apply locks, validates and commits conditional updates', async () => {
  const { client, calls } = fakeClient();
  await backfillOrganizationSlugs(client, mapping, true);
  assert.equal(calls[0], 'BEGIN');
  assert.ok(calls.some((sql) => sql.startsWith('LOCK TABLE')));
  assert.ok(calls.some((sql) => sql.startsWith('UPDATE') && sql.includes('"slug" IS NULL')));
  assert.equal(calls.at(-1), 'COMMIT');
});
test('a changed row rolls back instead of overwriting', async () => {
  const { client, calls } = fakeClient(0);
  await assert.rejects(backfillOrganizationSlugs(client, mapping, true), /concurrently/);
  assert.equal(calls.at(-1), 'ROLLBACK');
});
test('invalid mapping fails before any updates and rolls back', async () => {
  const { client, calls } = fakeClient();
  await assert.rejects(backfillOrganizationSlugs(client, [...mapping, { organizationId: 'three', slug: 'beta' }], true));
  assert.ok(!calls.some((sql) => sql.startsWith('UPDATE')));
  assert.equal(calls.at(-1), 'ROLLBACK');
});
