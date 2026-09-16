import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import pg from 'pg';
import { backfillOrganizationSlugs } from './lib/organization-slug-backfill';

async function main() {
  const { values } = parseArgs({
    options: {
      mapping: { type: 'string' },
      apply: { type: 'boolean', default: false },
      list: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });
  if (values.help) {
    console.log('Usage: tsx scripts/backfill-organization-slugs.ts --list\n' +
      '       tsx scripts/backfill-organization-slugs.ts --mapping reviewed-slugs.json [--apply]\n' +
      'Defaults to dry-run. Uses DATABASE_URL; never prints connection credentials.');
    return;
  }
  if (values.list && (values.mapping || values.apply)) throw new Error('--list cannot be combined with --mapping or --apply.');
  if (!values.list && !values.mapping) throw new Error('Supply --mapping or --list. Use --help for usage.');
  const mapping: unknown = values.mapping ? JSON.parse(await readFile(values.mapping, 'utf8')) : null;
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10_000 });
  try {
    const client = await pool.connect();
    try {
      if (values.list) {
        const result = await client.query('SELECT "id" AS "organizationId", "name", "slug" FROM "Organization" ORDER BY "name", "id"');
        console.log(JSON.stringify(result.rows, null, 2));
        return;
      }
      const plan = await backfillOrganizationSlugs(client, mapping, values.apply);
      console.log(values.apply ? 'Applied reviewed slug mapping.' : 'DRY RUN: no records changed.');
      console.table(plan.changes);
      console.log(`Already assigned: ${plan.skipped.length}. Missing after ${values.apply ? 'apply' : 'planned changes'}: ${plan.remaining.length}.`);
      if (plan.remaining.length) {
        console.table(plan.remaining.map(({ id, name }) => ({ organizationId: id, name })));
        console.log('Do not enforce NOT NULL until these organizations have reviewed slugs.');
      }
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Backfill failed.');
  process.exitCode = 1;
});
