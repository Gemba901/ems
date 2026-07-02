# Deployment

## Architecture

| Component | Where | How |
|---|---|---|
| Web (Next.js) | Vercel | Auto-deploys from git, not covered here |
| API (NestJS) | AWS EC2, two containers on one host | Docker image built in CI, pulled from ECR |
| Database | Single AWS RDS Postgres instance | Two databases on it: `postgres` (production data) and `gemba_staging` (staging data) |

Production and staging share the **same RDS instance** but use **different database names** in the connection string — they are not different servers, and not automatically kept in sync with each other in either schema or data.

## CI/CD pipeline

Defined in [.github/workflows/deploy.yml](../.github/workflows/deploy.yml), triggered on push to `main` (production) or `staging` (staging):

1. `build-and-push-api` — builds the API image from [apps/api/Dockerfile](../apps/api/Dockerfile) and pushes it to ECR, tagged `latest` (from `main`) or `staging-latest` (from `staging`), plus the commit SHA.
2. `deploy-api-prod` / `deploy-api-staging` — SSHes into the EC2 host and:
   - logs in to ECR
   - pulls the new image
   - stops/removes the existing container (`gemba-api` or `gemba-api-staging`)
   - runs a new container with `--env-file /home/ubuntu/.env` (prod) or `--env-file /home/ubuntu/.env.staging` (staging)

The web app's `apps/api/.env` (local dev) is unrelated to these — the files that matter for deployed environments live only on the EC2 host at `/home/ubuntu/.env` and `/home/ubuntu/.env.staging`, outside version control.

Note that `docker run --env-file` does **not** run through a shell — whatever bytes are in the file after `KEY=` become the literal env var value. Do **not** quote values in these files:

```
# correct
DATABASE_URL=postgresql://user:pass@host:5432/dbname?sslmode=require

# wrong — Prisma will fail to parse this, the quotes become part of the string
DATABASE_URL="postgresql://user:pass@host:5432/dbname?sslmode=require"
```

## Finding the ECR registry / image

If you need the full image path and don't have AWS CLI credentials handy on the EC2 host, just read it off an already-pulled image:

```bash
docker images | grep gemba-api
```

The `REPOSITORY` column is `<ECR_REGISTRY>/gemba-api`, e.g. `632752100139.dkr.ecr.eu-north-1.amazonaws.com/gemba-api`.

## Redeploying manually on the EC2 host

Useful when you've changed the env file and need the container to pick it up (`docker restart` does **not** re-read `--env-file`; it must be recreated):

```bash
docker stop gemba-api-staging && docker rm gemba-api-staging
docker run -d \
  --name gemba-api-staging \
  --restart unless-stopped \
  -p 5001:5000 \
  --env-file /home/ubuntu/.env.staging \
  <ECR_REGISTRY>/gemba-api:staging-latest
```

Swap `gemba-api-staging` / `.env.staging` / `staging-latest` / port `5001` for `gemba-api` / `.env` / `latest` / port `5000` for production.

## Database migrations

Schema lives in [packages/db/prisma/schema.prisma](../packages/db/prisma/schema.prisma); migrations in `packages/db/prisma/migrations/`.

**Every schema change must go through a migration file.** Do not run `prisma db push` or hand-edit the schema via `psql` against staging or production — this has happened multiple times in this project's history and produced real, hard-to-diagnose drift (see "Known drift" below).

To apply pending migrations to an environment:

```bash
cd packages/db
DATABASE_URL="<full connection string for that environment>" pnpm exec prisma migrate deploy
```

Get the connection string from `/home/ubuntu/.env` or `/home/ubuntu/.env.staging` on the EC2 host (or your local `.env` if testing against a dev DB).

**Known flakiness:** `prisma migrate deploy` / `prisma db execute` can intermittently fail with `P1001: Can't reach database server` against this RDS instance even when the database is reachable (confirmed via plain `psql` and raw `pg` client working fine in the same failing moment). If you hit this, just retry — it has consistently succeeded on retry or when run from a different machine/Node version. It is not a sign the database is actually down.

### Cloning production data into staging

There is no automatic sync — staging starts empty and stays empty unless you explicitly copy data in. To do a full clone:

1. Confirm both databases have **identical schemas** first (`\d "TableName"` in `psql` for any tables you're unsure about, or diff `information_schema.columns`). If they don't match, data copies will fail with errors like `extra data after last expected column` — fix the schema drift (write a migration) before copying data, don't try to force the copy.
2. Truncate the target (staging) tables.
3. Copy each table from prod to staging using `psql`'s `\copy ... FROM PROGRAM 'psql "<prod_url>" -c "\copy ... TO STDOUT"'` — this works across differing Postgres client/server versions, unlike `pg_dump`/`pg_restore` (see below).
4. Set `SET session_replication_role = replica;` before copying so foreign-key triggers don't block load order, and reset it to `DEFAULT` after.

`pg_dump`/`pg_restore` require the client tool's major version to be **>=** the server's. This RDS instance runs Postgres 17, and the sandbox/dev machine may only have `postgresql-client-16` installed, which makes `pg_dump` refuse to run (`aborting because of server version mismatch`). The `\copy ... FROM PROGRAM` approach above sidesteps this since it only uses the wire protocol, not `pg_dump`'s dump-format code.

### Known drift (fixed 2026-07-02, watch for recurrence)

Production's live schema had at least three columns that existed in `schema.prisma` and on the actual production database, but had **no corresponding migration file**: `Organization.shortName`, `ConsultancyVisit.rescheduleCount`, `Employee.notificationPreferences`. Separately, the `Suggestion` table's committee-review columns (`committeeId`) were added by a real migration, then reverted directly on production back to HOD-based review (`hodId`, `implementationStatus`, `implementationNote`) without ever recording that reversal as a migration.

Both were fixed by adding reconciliation migrations ([20260702_add_org_shortname_visit_reschedule_count](../packages/db/prisma/migrations/20260702_add_org_shortname_visit_reschedule_count/migration.sql), [20260702_reconcile_suggestion_hod_review_and_employee_notifications](../packages/db/prisma/migrations/20260702_reconcile_suggestion_hod_review_and_employee_notifications/migration.sql)) that bring the migration history in line with what's actually running. If you see a `P2022: The column ... does not exist` error, the underlying cause is almost always this same pattern — check whether the field in `schema.prisma` has a matching `ADD COLUMN` somewhere under `prisma/migrations/`, and if not, production's real schema (not `schema.prisma`) is the source of truth for what the fix-up migration should produce.
