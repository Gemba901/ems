# Milestone 6: staging rollout and acceptance

This release wires private company files, coordinated scheduled jobs, request
logging, safe error responses and a platform-only `/admin/readiness` page.
It does not deploy infrastructure. Record the release commit and the results below
before calling staging accepted. Full production readiness additionally requires
the production gates at the end of this document.

## 1. Confirm the deployment targets

Use the existing staging services and a staging-only database and private bucket.
Replace these examples with your actual hostnames:

| Setting | Example |
| --- | --- |
| Central web host | `staging.example.com` |
| Tenant base domain | `staging.example.com` |
| Two test companies | `acme.staging.example.com`, `beta.staging.example.com` |
| API origin | `https://api-staging.example.com` |

Both company hosts must reach the same staging Next.js deployment with working
HTTPS. Configure the hosting provider's domains and certificates as well as DNS.
The proxy validates the original Host; ingress must preserve it. Disable CDN
caching for `/api/*`. Restrict public signup traffic at ingress before enabling it.
Use separate staging secrets; do not copy production connection strings or data.

Set these private web variables (never `NEXT_PUBLIC_*`):

```dotenv
API_INTERNAL_URL=https://api-staging.example.com
TENANT_BASE_DOMAIN=staging.example.com
TENANT_PLATFORM_HOSTS=staging.example.com
TENANT_PLATFORM_SLUG=your-existing-platform-organization-slug
TENANT_PROXY_SECRET=replace-with-64-random-hex-characters
```

Set the API variables in addition to its existing authentication/mail configuration:

```dotenv
NODE_ENV=production
DEPLOYMENT_ENV=staging
PORT=5000
DATABASE_URL=postgresql://runtime-login:password@staging-db-host/staging_database
EXPECTED_DATABASE_NAME=staging_database
TENANT_BASE_DOMAIN=staging.example.com
TENANT_PROXY_SECRET=the-same-private-value-as-the-web
AWS_REGION=your-region
AWS_PRIVATE_UPLOAD_BUCKET=your-new-private-staging-bucket
SES_FROM_EMAIL=your-verified-sender
ONBOARDING_ORIGIN=https://staging.example.com
ONBOARDING_TOKEN_SECRET=a-separate-64-character-random-secret
ONBOARDING_DEFAULT_MODULES=EMS
ONBOARDING_ENABLED=false
ONBOARDING_WORKER_ENABLED=false
BUSINESS_JOBS_ENABLED=false
```

The existing EC2 workflow maps host port 5001 to container port 5000 for staging;
therefore explicitly set PORT=5000 there. The Dockerfile default is 3001.
Generate each secret separately with `openssl rand -hex 32`. Prefer the instance
IAM role for AWS access; never put credentials in source or browser variables.

With each environment already loaded, run from the repository root:

```bash
node infra/staging/check-env.mjs api
node infra/staging/check-env.mjs web
```

Run each command in its corresponding service environment. This checks shape and
database name without printing secrets; it does not verify connectivity, actual
database identity, matching secrets, DNS, TLS or cloud permissions.

## 2. Apply the database release before the application

Take and verify a staging backup. Use a separate migration-owner connection for
migrations, not the runtime login. From `packages/db`, with that staging connection
loaded as DATABASE_URL:

```bash
pnpm exec prisma migrate status
pnpm exec prisma migrate deploy
pnpm exec prisma migrate status
```

The new migration is `20260917000000_add_private_files_and_job_runs`; deploy also
applies earlier pending migrations. It creates FileAsset with forced RLS and
ScheduledJobRun. Never use `migrate dev`, `db push`, or the destructive test suite
against staging. The production image does not include migration sources; run
migrations from the reviewed release checkout using the same lockfile.

Complete the reviewed slug backfill in
[the slug rollout guide](../../packages/db/rollouts/organization-slug/README.md).
The required-slug SQL intentionally remains staged until every organization has
a reviewed slug; promote it as a later migration only after that prerequisite.

Review and apply [runtime-role.sql](runtime-role.sql) as the migration owner, then
grant that privilege group to a dedicated runtime login through your normal
credential procedure. Audit existing role memberships too: the login must not be
a superuser, have BYPASSRLS, own application tables, or inherit an owner/bypass
role. Default grants apply to the owner that executes the script. Recheck grants
after migrations. Set the runtime login in the API's DATABASE_URL.

Run [database-audit.sql](database-audit.sql) with the runtime connection and keep
the output with the release evidence. FileAsset operations set tenant context
inside a transaction; never set a connection-wide tenant value in a pool.
Existing business tables still depend on application guards and service filters;
their RLS rollout is not complete and is reported by readiness.

## 3. Configure private storage

Use a separate private bucket for new uploads. Do not disable an existing public
bucket without first inventorying references. Replace placeholders in:

- [private-bucket-public-access-block.json](private-bucket-public-access-block.json)
- [private-bucket-cors.json](private-bucket-cors.json)
- [private-bucket-runtime-policy.json](private-bucket-runtime-policy.json)

Apply them using your normal AWS administration process. The runtime role needs
PutObject/GetObject (HeadObject uses GetObject permission) and the two bucket
inspection permissions. Keep all four public-access blocks enabled. CORS permits
PUT from staging web origins and the signed `Content-Type`/`If-None-Match` headers;
browser File uploads supply Content-Length. Confirm the actual browser preflight.
Downloads go through the authenticated same-origin API; direct object reads must
fail without AWS authorization. Presigned PUT expires after 60 seconds and permits
one write to its generated key. Completion verifies declared size and MIME type.
MIME metadata validation is not malware scanning or file-content inspection.

New records store `/api/uploads/files/<id>`, not public S3 URLs. Company guards
reject references to another company's files. Platform administrators have a
separate authenticated support route, including for company branding previews.
Branding copies can share one immutable object; do not delete an object merely
because one metadata row was removed. Object retention, orphan cleanup and malware
scanning require a separately reviewed policy before unrestricted uploads.

## 4. Deploy and inspect

Build db, API and web from the same release. Existing deploy automation does not
apply migrations; complete step 2 first. This branch itself does not trigger the
main/staging deployment workflow. Deploy the API and web together after review.
The Docker build context now excludes environment files and local build caches.

Sign in as a current platform administrator on the central host and open
`/admin/readiness`. Run its check. Resolve every manual-test blocker. Confirm the
reported database, non-bypass runtime role, private storage check and migrations.
The page performs read-only inspection. Company users must not access it or the
underlying `/api/operations/readiness` endpoint. A green manual-test result is not
production approval: production follow-up items and browser checks are separate.

After SES sender/delivery configuration and ingress limits are ready, enable
ONBOARDING_WORKER_ENABLED and ONBOARDING_ENABLED together. Start with test inboxes.
See [onboarding behavior and retries](../../apps/api/src/onboarding/README.md).

Enable BUSINESS_JOBS_ENABLED on one staging API instance initially. All enabled
instances use a shared database claim per job/window; completed windows skip,
leases renew every 30 seconds and expire after five minutes without renewal.
Daily schedules use a UTC day; escalation uses a UTC hour. Review the existing
scheduler timezone before acceptance. Failures remain visible in ScheduledJobRun;
retry happens on a subsequent invocation, not through the readiness page.
Do not manually delete live leases. A crash after an external notification can
still repeat that notification on retry: delivery is at least once, not exactly
once. Use test recipients and inspect lease recovery before adding replicas.

## 5. Manual acceptance record

Record date, release commit, tester, company slugs, request IDs and pass/fail for
each row. Do not record passwords, capabilities, cookies or connection strings.

| Check | Expected result |
| --- | --- |
| Central signup and verified email | No company before verification; one ACTIVE company afterward; its hostname opens |
| Signup/verification retries and slug collision | No duplicate company; safe conflict/retry response |
| Existing account signup | Requires the current password after proving email ownership |
| Two company logins, reload and refresh | Independent sessions; HttpOnly, Secure, host-only refresh cookies |
| Logout with two companies and multiple tabs | Own company's tabs sign out; other company stays signed in |
| Company A token/record ID used at B | Request rejected and no B data changed |
| Deleted membership or suspended company | Access denied on the next request |
| Spoofed Host, tenant headers or sibling Origin | Rejected; browser cannot choose tenant context |
| Image/document upload and reload | Private object, completion succeeds, authenticated preview/download works |
| Cross-company file URL in read or nested write | Rejected; no attachment or record persisted |
| Anonymous object URL and API file URL | No file bytes returned |
| Presigned PUT replay, wrong size/type, excessive size | Rejected; invalid uploads are not READY |
| Company branding through platform administration | Uploaded logo persists and is visible to the intended company |
| Two enabled workers and restart during a job | One active claim; expired claim recovers; completed window skips |
| Failed provisioning/email/job | Visible on readiness; documented retries recover without duplicate company |
| Request/error logging | Request ID present; no passwords, JWTs, capability links or database credentials |
| Backup restored into isolated database | Restore verified; no email/jobs enabled on the restored copy |

## 6. Monitoring and rollback

Send structured logs to the existing staging log collector. `http_request`
includes method, route template, status, duration, request ID and authenticated
tenant/user IDs where available. Restrict log access and retention accordingly.
Monitor `scheduled_job_failed`, HTTP 5xx/latency, failed/overdue onboarding, failed
mail and expiring leases; readiness exposes database counters for operator review.
Configure actual alarms and their owner in your monitoring platform; this code
does not create cloud alarms. Run a controlled failure to verify alert delivery.

To pause new signup, set ONBOARDING_ENABLED=false and leave the worker enabled to
finish accepted requests. BUSINESS_JOBS_ENABLED=false prevents new claims after
restart; drain in-flight work before stopping instances. Keep private file-serving
code deployed if new managed URLs already exist. Rolling back to an old public
upload release would break these links and weaken upload privacy. Prefer a forward
fix or a compatible prior image. Do not drop the new tables or restore an old
database over new writes as a routine rollback. Preserve a pre-release backup and
test restoration into a separate target before planning any data rollback.

## Production gates still requiring evidence or additional rollout

- Extend transaction-local tenant context and reviewed RLS policies to business
  tables, including indirect tenant relationships and privileged worker access.
  Do not enable policies globally before adapting and testing all query paths.
- Inventory/migrate legacy public URLs; close public access only after references
  and rendering paths are migrated and tested.
- Complete the required-slug rollout, runtime-role audit, real DNS/TLS/SES/S3
  acceptance, alert delivery and backup/restore rehearsal.
- Set upload retention/scanning and abuse controls appropriate to public launch;
  evaluate notification idempotency before relying on crash-safe delivery.

## Repeatable local verification

From the repository root:

```bash
pnpm --filter db build
pnpm --filter api build
pnpm --filter web build
node infra/staging/check-env.test.mjs
pnpm --filter web test:proxy
```

The PostgreSQL suite requires a disposable database named readiness_test on
127.0.0.1:55442 and MILESTONE6_TEST_DATABASE_URL explicitly set. It drops its fixture
tables, creates the FK prerequisite, applies the actual handwritten milestone 6
migration, tests a non-bypass role on a single reused connection, and checks job
claim/retry behavior. Run from apps/api with NODE_OPTIONS=--experimental-vm-modules:
`pnpm exec jest --runInBand src/operations/readiness.postgres.spec.ts`.
It never defaults to DATABASE_URL. It tests this migration, not the entire historical
migration chain or a deployed staging service.
