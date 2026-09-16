# Milestone 1: organization slug rollout

The database stays `slug String? @unique` until every environment has completed its backfill. The creation DTO requires a slug for all new companies. No script automatically chooses company addresses.

## 1. Deploy the nullable column and updated creation code

From `packages/db`, with `DATABASE_URL` set to the intended environment:

```bash
pnpm exec prisma migrate deploy
```

This applies all pending migrations, including `20260914000000_add_organization_slug`. Rebuild the database package from the repository root with `pnpm --filter db build` before building/deploying the API. Verify new organization creation stores a normalized slug. Do not run migration commands against an unintended environment.

## 2. Review a mapping

From `packages/db`:

```bash
pnpm exec tsx scripts/backfill-organization-slugs.ts --list
```

Create a local reviewed JSON mapping using the returned organization IDs:

```json
[
  { "organizationId": "replace-with-real-organization-id", "slug": "acme" }
]
```

Do not commit customer inventory/mapping files. The script trims and lowercases mapped slugs, rejects invalid/reserved/colliding slugs, and preserves assigned values. Include every organization still missing a slug; IDs can differ by environment. `--list` includes names for review and does not generate slugs.

## 3. Dry-run, then apply

```bash
pnpm exec tsx scripts/backfill-organization-slugs.ts --mapping /path/to/reviewed-slugs.json
pnpm exec tsx scripts/backfill-organization-slugs.ts --mapping /path/to/reviewed-slugs.json --apply
```

No writes occur without `--apply`. Apply revalidates the mapping inside one transaction and takes a short organization-table write lock; use a quiet maintenance window. A lock wait over five seconds fails instead of waiting indefinitely. Updates require `slug IS NULL`, and any conflict rolls the transaction back. Rerunning the same mapping skips already assigned values. The output reports remaining unassigned organizations; partial mappings are allowed but do not qualify for NOT NULL.

## 4. Promote the required-column migration as a separate release

Only after backfill reports zero missing slugs in every target environment:

1. Change the Prisma field to `slug String @unique`.
2. Copy `packages/db/rollouts/organization-slug/require-organization-slug.sql` into a **new, chronologically later** `packages/db/prisma/migrations/<timestamp>_require_organization_slug/migration.sql`.
3. Deploy that release with `prisma migrate deploy`, then regenerate/build the database client.

The prepared SQL is deliberately outside Prisma's migrations directory so the first deploy cannot enforce NOT NULL prematurely. It includes a null-data precondition and timeouts. If a deployed migration fails, investigate and reconcile Prisma's failed migration state before retrying; do not mark an unapplied migration as applied.

## Tests

From `apps/api`:

```bash
pnpm exec jest --runInBand common/utils/organization-slug.spec.ts organizations/organizations.service.spec.ts organizations/dto/organizations.dto.spec.ts
```

From `packages/db`:

```bash
pnpm exec tsx --test scripts/lib/organization-slug-backfill.test.ts
```

The tests use mocks, not a live database. On staging, additionally exercise real creation, duplicate slug rejection, a dry-run/apply/rerun backfill, and the final constraint. Never use customer data as disposable fixtures. Backfill and migration deployment are operator steps; adding these files does not execute them.
