# Milestone 5: verified onboarding

This module adds signup at the **central web hostname** `/signup`. Company hosts
cannot call onboarding through the proxy. API endpoints require the server proxy
credential. Request DTOs expose company/contact details only; role, platform-team
membership and platform privileges are never taken from signup input.

## Deployment order

1. Deploy `20260916000000_add_verified_onboarding` using `prisma migrate deploy`.
   The migration adds two tables; it does not enforce the still-staged required
   organization-slug column. Complete that rollout separately.
2. Rebuild `db`, API and web. Existing companies are unchanged. Organization
   creation now also checks signup reservations, so apply the migration before
   deploying this API release, even when public signup is disabled.
3. Configure the API's private environment:

```dotenv
ONBOARDING_ENABLED=false
ONBOARDING_WORKER_ENABLED=false
ONBOARDING_ORIGIN=https://your-central-web-host
ONBOARDING_TOKEN_SECRET=replace-with-a-separate-random-secret
ONBOARDING_DEFAULT_MODULES=EMS
```

Generate the token secret with `openssl rand -hex 32`. Keep it stable for the
lifetime of pending signups; changing it invalidates verification and progress
capabilities. Do not reuse the proxy credential. Use the same central host in the
web's `TENANT_PLATFORM_HOSTS`, with existing `TENANT_BASE_DOMAIN` and proxy
configuration from the web README. For local testing use
`ONBOARDING_ORIGIN=http://localhost:3000`. Modules are a comma-separated subset of
`ModuleType`; an empty setting enables none. Public callers cannot choose modules.

4. Verify SES credentials and sender identity, and configure edge request limits
   before enabling signup. Delivery failures are retried, never logged as email
   content or silently treated as success. Tests stub delivery; no real email is
   sent by the tests.
5. Enable the worker and signup in staging, then run browser acceptance with a
   new email and an existing account. Turn off `ONBOARDING_ENABLED` to pause new
   requests; leave the worker on so accepted verification and provisioning can
   finish. Disabling both hides all onboarding endpoints and pauses work.

## State and retry contract

### Automatic company domains with external DNS

Keep the existing DNS provider and configure one wildcard CNAME for `*.bees`
pointing to the frontend project's Vercel CNAME target. The separate `bees`
record remains necessary for the central signup host. Vercel registers individual
company hostnames through its API; this mode does not require a Vercel wildcard
domain or a wildcard certificate. Remove only the invalid `*.bees.gembapms.com`
project-domain entry when using this mode; retain existing exact company domains.
Do not change the root website, mail records, nameservers, or Hostinger CDN.

Set these in the **API container's private environment**, not browser variables:

```dotenv
ONBOARDING_VERCEL_DOMAINS_ENABLED=true
VERCEL_TOKEN=replace-with-private-team-scoped-token
VERCEL_PROJECT_ID=replace-with-ems-web-project-id
VERCEL_TEAM_ID=replace-with-owning-team-id
VERCEL_DOMAIN_ENVIRONMENT=preview
VERCEL_DOMAIN_GIT_BRANCH=staging
TENANT_BASE_DOMAIN=bees.gembapms.com
ONBOARDING_ORIGIN=https://bees.gembapms.com
```

Create the token at https://vercel.com/account/tokens scoped to the team owning
`ems-web`, with project-domain management access; store it directly on EC2, never
in chat, source control, logs, or NEXT_PUBLIC variables. Obtain the project ID in
project Settings → General and team ID in team Settings → General. Monitor token
expiry. For production set `VERCEL_DOMAIN_ENVIRONMENT=production`; the branch
setting is ignored. Custom Vercel environments are not supported by this adapter.
Preview branch domains must be publicly accessible without Vercel authentication
so the company login and HTTPS readiness probe can reach them.

The switch defaults to disabled, preserving existing manual/wildcard deployments.
When enabled, missing settings fail startup. Deploy the API code and recreate the
container with its updated environment (a restart does not reload `--env-file`).
No database migration or new npm dependency is required for domain automation.

After email verification, the worker creates or reuses the exact domain on the
configured project and branch, attempts ownership verification, checks Vercel's
DNS configuration, and requires a successful HTTPS HTML response from `/login`.
Requests use timeouts and no redirects; the public probe has no Vercel credentials.
The probe confirms HTTPS page availability, not successful authentication; company
login and tenant isolation still require live acceptance tests after provisioning.
Provider calls run before the final database transaction. A domain may remain on
Vercel after a failed signup; the reserved slug and retries reuse it. Operators
should review unused domain entries rather than deleting them during retries.

DNS, certificate, API, and rate-limit failures use the existing five-attempt
backoff and `PROVISIONING_FAILED` retry flow. Only safe local diagnostics and HTTP
status numbers appear in logs (`Workspace domain pending`); provider response
bodies and tokens do not. A conflicting branch, redirect, or custom environment
requires correcting the domain assignment in Vercel before retrying. A required
ownership TXT challenge must be completed through the Vercel dashboard. Domain
limits and token permissions must be checked on the actual Vercel plan.

Acceptance: use a fresh signup slug that has no individual DNS or Vercel entry;
verify its email; confirm the exact hostname appears on the staging branch;
confirm progress waits for HTTPS, then reaches READY; sign in and check isolation.
Existing READY signups are not retroactively registered: add their exact domain
in Vercel manually with the staging branch. Do not create duplicate companies.

API references: [project domain registration](https://vercel.com/docs/rest-api/projects/add-a-domain-to-a-project),
[domain configuration](https://vercel.com/docs/rest-api/domains/get-a-domain-s-configuration).

### Provisioning and delivery

`PENDING_VERIFICATION → PROVISIONING → READY`, with `EXPIRED` for abandoned signup
and `FAILED` for exhausted provisioning or a permanent conflict. The existing
Organization status continues to govern access. No Organization exists until the
provisioning transaction completes, so partially provisioned companies cannot
resolve or authenticate. Lifecycle state lives on `OnboardingRequest`.

A browser-generated 256-bit request key makes submission retries idempotent. Its
hash is stored; reusing it with changed details returns 409. A unique nullable
reservation column plus a database advisory lock coordinates concurrent signup
and platform creation. Reservations expire after 30 minutes if unverified.
Verification is an HMAC capability sent in an email URL fragment, with only its
hash persisted. No password is collected at initial signup. Verification requires
an existing user's password, or hashes a new user's password after proving email
ownership. Public onboarding never attaches an existing user merely by email.

Repeated verification after a lost response returns progress for the same request;
it cannot change the accepted password or queue another company. Verification
capabilities expire after 30 minutes. A separate progress capability or the
original request key authorizes status and retries. Neither is an access token.
Browser signup state uses sessionStorage; normal session tokens remain in memory
and HttpOnly cookies. Use a new signup request after reservation expiry.

Provisioning claims use `FOR UPDATE SKIP LOCKED`, a two-minute retry timestamp,
and conditional attempt ownership. Company, user/membership, employee, READY
state and welcome outbox record commit together. A transient failure rolls them
all back and schedules exponential backoff, up to five attempts. Status exposes
safe failure codes. A verified request can retry `PROVISIONING_FAILED` after a
one-minute cooldown. `DETAILS_CONFLICT` requires operator resolution; identities
are never silently merged. FAILED reservations remain held for that resolution.

Email jobs use a two-minute lease, conditional lease ownership and backoff.
Delivery is **at least once**: a crash after SES accepts an email but before the
DB records success can send a duplicate. Verification itself remains idempotent.
A welcome email failure never changes READY. Users can request bounded resend
attempts for unexpired verification. Inspect `failedAt` jobs operationally and
alert on them in milestone 6. There is no delivery-provider acceptance test yet.

The database enforces three signup requests per email per hour and 100 globally
per hour, with serialized quota checks across replicas. Verification has five
password attempts per request. These conservative limits do not replace edge
abuse protection/captcha for unrestricted public launch; tune the rollout rather
than exposing signup without an ingress limit.

## Existing account setup

Identifier lookup no longer issues FIRST_TIME_SETUP tokens. Users without a
password must use the existing email password-reset flow or an administrator's
secret temporary password. Legacy identifier-only setup JWTs are rejected.
Reset and temporary-password redemption now consume tokens conditionally inside
the same transaction as password/session changes. Setup uses a conditional
null-password update to prevent simultaneous redemptions overwriting each other.

## Verification

From `apps/api`:

```bash
pnpm exec jest --runInBand onboarding/onboarding.spec.ts auth/verified-account-setup.spec.ts organizations/organizations.service.spec.ts
pnpm exec jest --runInBand onboarding/workspace-domain.service.spec.ts onboarding/onboarding.domain.spec.ts onboarding/onboarding.http.spec.ts
```

`onboarding.postgres.spec.ts` requires explicit `MILESTONE5_TEST_DATABASE_URL` and
rejects any address except `127.0.0.1:55440/onboarding_test`. Initialize a disposable
PostgreSQL database from the schema, then test the handwritten migration there.
Never point this destructive fixture suite at a shared or customer database.
Prisma's compiler needs `NODE_OPTIONS=--experimental-vm-modules` under Jest.

Database rollout, real mail delivery, browser verification and production
monitoring remain explicit acceptance steps. This implementation does not add
billing, custom domains or cross-company SSO.
