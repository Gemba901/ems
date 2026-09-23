# Onboarding operations

Last reviewed: 2026-09-23. [Architecture](README.md) · [Scaling roadmap](scaling.md)

## Configuration and ownership

The staging API runs in `gemba-api-staging` on EC2, with Docker `--env-file`
`/home/ubuntu/.env.staging`. Port mapping is `5001:5000`; set `PORT=5000`.
Use unquoted values in that Docker environment file. Keep secrets outside Git.

| Setting | Service | Purpose |
| --- | --- | --- |
| `API_INTERNAL_URL` | Next.js server | Reachable API origin; never a browser URL setting |
| `TENANT_BASE_DOMAIN=bees.gembapms.com` | Web and API | Allowed tenant hostname suffix |
| `TENANT_PLATFORM_HOSTS=bees.gembapms.com` | Web | Central platform/signup host |
| `TENANT_PLATFORM_SLUG` | Web | Existing platform organization's reviewed slug where configured |
| `TENANT_PROXY_SECRET` | Web and API | Same private trusted-forwarding credential on both services |
| `ONBOARDING_ORIGIN=https://bees.gembapms.com` | API | Verification and workspace URL origin |
| `ONBOARDING_ENABLED=true` | API | Accept new signup requests |
| `ONBOARDING_WORKER_ENABLED=true` | API | Process pending provisioning and email jobs |
| `ONBOARDING_TOKEN_SECRET` | API | Stable separate secret, at least 64 characters without whitespace |
| `ONBOARDING_DEFAULT_MODULES` | API | Operator-selected modules enabled for new companies |
| `ONBOARDING_VERCEL_DOMAINS_ENABLED=true` | API | Turn on exact-domain registration; defaults off |
| `VERCEL_TOKEN` | API only | Private token scoped to the team with required project-domain access |
| `VERCEL_PROJECT_ID` / `VERCEL_TEAM_ID` | API only | Owning frontend project and team |
| `VERCEL_DOMAIN_ENVIRONMENT=preview` | API | Explicit staging deployment mode |
| `VERCEL_DOMAIN_GIT_BRANCH=staging` | API | Branch assigned to new staging domains |
| `AWS_REGION=eu-north-1` | API | SES/S3 region as configured |
| `SES_FROM_EMAIL=info@gembapms.com` | API | Tested sender address |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | API only | Explicit credentials currently used by the email implementation |
| `AWS_PRIVATE_UPLOAD_BUCKET` | API | Private upload bucket |
| `DATABASE_URL` / `EXPECTED_DATABASE_NAME` | API | Runtime database connection and expected database check |
| `BUSINESS_JOBS_ENABLED=false` | API staging | Separate switch for business schedules; does not disable onboarding worker |

For production domain registration use `VERCEL_DOMAIN_ENVIRONMENT=production`;
the branch setting is ignored. Custom Vercel environments are not supported by
the current adapter. Changing this setting does not migrate existing domains.

Never expose these credentials through `NEXT_PUBLIC_*`. Generate new secrets only
when needed; rotating the onboarding token secret invalidates existing verification
and progress capabilities. Resolve any previously exposed database credential via
the normal credential-rotation procedure; its rotation status was not verified here.

## Deploy or enable automation

1. Review the release and backup procedure in the [staging runbook](../staging/README.md).
   Use handwritten migrations and `prisma migrate deploy` with the migration
   account. Domain automation itself added no migration. Inspect other pending
   migrations in the release rather than assuming none exist.
2. Confirm Hostinger is still authoritative and its `*.bees` CNAME points to the
   project target. Retain `bees` for central signup. Keep existing website/mail records.
3. Configure the API environment with the Vercel token, IDs, and intended branch.
4. Deploy the reviewed API release and recreate the container to load the env file.
   `docker restart` does not reload Docker `--env-file`. The current GitHub Actions
   workflow deploys API images on pushes to `staging` and `main`; coordinate a push
   with configuration readiness. Verify frontend and API versions separately.
5. Ensure the company login page is public at the hosting layer. In staging,
   `ems-web → Settings → Deployment Protection → Vercel Authentication` was disabled.
   This exposes other previews in that project too; Gemba's own authorization still
   applies. Prefer a dedicated public application project for production isolation.
6. With exact-domain automation, the invalid `*.bees.gembapms.com` Vercel project
   entry is unnecessary. Remove only that entry, retaining the wildcard DNS record
   and working exact domain entries. No nameserver change is needed.
7. Run a fresh signup using a new slug, verify its email, observe the domain on
   the correct branch, sign in, reload, and check company isolation. Existing READY
   signups are not backfilled automatically; add their exact hostname manually if
   needed, without creating duplicate organizations.

## Diagnose a pending workspace

The browser polls every five seconds. The worker ticks every ten seconds but
backoff can postpone work for minutes. Successful `POST /onboarding/status` means
polling worked, not that email or provisioning succeeded.

On EC2, inspect relevant recent logs:

```bash
docker logs --since 30m gemba-api-staging 2>&1 \
  | grep -E 'Workspace domain pending|Onboarding|Vercel'
```

Do not paste entire env files, cookies, tokens, verification URLs, or unfiltered
provider payloads into tickets. Correlate with the request ID and timestamp.

Replace `COMPANY-SLUG` below. This uses a real GET like the readiness check, validates
TLS normally, does not follow redirects, and sends no API token to the company host:

```bash
docker exec -i gemba-api-staging node <<'NODE'
const url = 'https://COMPANY-SLUG.bees.gembapms.com/login';
(async () => {
  try {
    const r = await fetch(url, {
      redirect: 'manual', signal: AbortSignal.timeout(15000),
    });
    const location = r.headers.get('location');
    // Omit query strings; authentication redirects can contain nonces.
    const redirect = location ? new URL(location, url) : null;
    console.log({
      status: r.status,
      contentType: r.headers.get('content-type'),
      redirect: redirect ? redirect.origin + redirect.pathname : null,
    });
    await r.body?.cancel();
  } catch (e) {
    console.log({ name: e.name, causeCode: e.cause?.code });
  }
})();
NODE
```

Expected: `200`, `text/html`, no redirect. This proves page/TLS availability, not
successful customer authentication. The worker has an eight-second probe timeout;
a diagnostic succeeding only after that threshold still indicates a latency problem.

| Diagnostic | Meaning / action |
| --- | --- |
| `Vercel API HTTP 401` or `403` | Check token expiry, permissions, and owning project/team IDs |
| `Vercel API HTTP 429` | Rate limit; examine team-wide usage and retry backlog |
| `Vercel API HTTP 404` | Inspect project ID/access and exact domain; not proof of DNS failure |
| `domain assignment mismatch` | Domain exists with wrong branch, redirect, or custom environment; correct it deliberately |
| `ownership verification pending` | Complete any required Vercel TXT ownership challenge |
| `DNS configuration pending` | Check wildcard CNAME, authoritative provider and conflicting exact records |
| `HTTPS login page not ready` + `302` to Vercel SSO | Deployment Protection is blocking public access |
| `HTTPS login page not ready` + `404` | Check project/branch deployment and `/login` route |
| `HTTPS login page not ready` + timeout/TLS error | Check DNS, EC2 egress, certificate state and public reachability |
| No worker progress | Confirm deployed image, worker flag, database connectivity and request status |
| `FAILED` / `PROVISIONING_FAILED` | Fix cause, then use Retry setup after the one-minute cooldown |
| `DETAILS_CONFLICT` | Requires operator investigation; never silently merge identities or change ownership |

Do not bypass the HTTPS gate just to turn a signup green. The SSO redirect incident
demonstrated that the gate prevented sending customers to an unusable login page.

## SES delivery

The console test sender and API sender can use different IAM identities. The
observed failure was `ses:SendEmail` denied to the identity owning the API's explicit
AWS keys. Grant least-privilege sending access to the verified sender/domain in
`eu-north-1`, restricted to the intended From address. Changing an EC2 instance role
alone does not change permissions of explicit keys used by this implementation.

The application uses the SES API, not SMTP. `SES_FROM_EMAIL` defaults to
`info@gembapms.com`, so a missing environment value alone was not the original
cause. Sandbox status and sending quota are regional/account-specific; confirm them
in SES. A sandbox account requires verified recipients (apart from supported test
destinations); console success does not establish production access.
[SES sandbox guidance](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html)

SES accepting a message is not proof of inbox delivery. Check inbox/spam and, for
production, delivery/bounce/complaint events. Verification links expire after
30 minutes; start a fresh signup if the verification reservation has expired.
Failed verification mail and failed provisioning are different queues and remedies.

## Incident record and migration cautions

| Incident | Evidence | Resolution / follow-up |
| --- | --- | --- |
| Verification mail failed | API SES request returned IAM AccessDenied | Sender permission added to API credential identity; subsequent delivery and verification succeeded |
| Wildcard Vercel domain stayed invalid | Dashboard requested nameserver/challenge configuration | Chose Hostinger wildcard DNS + exact Vercel API registration |
| Main website timed out without Hostinger CDN | Direct hosting IP `145.223.104.205` timed out on HTTP/HTTPS in tests | Re-enabled CDN; operator later confirmed full website loaded; direct-origin root cause remains unverified |
| Google DKIM import corrupted | Vercel published literal quotes from split zone-file TXT input | Replaced TXT value with original single value; DNS query confirmed correction |
| Company domain appeared but setup stayed pending | `/login` returned 302 to `vercel.com/sso-api` | Disabled Vercel Authentication for staging project; API probe returned 200 HTML; operator confirmed complete flow |

The prepared Vercel DNS zone was not adopted as authoritative in the recorded
setup. It contains a direct-origin website A record: do not later switch nameservers
to it without revalidating current records, origin reachability and CDN compatibility.
Re-export authoritative DNS before any future migration; historical exports are not
current backups. Preserve MX, SPF, DKIM, DMARC, SES and service records; check DNSSEC
delegation requirements and both IPv4/IPv6 routing before cutover. Verify Google
DKIM's concatenated value after import, not only the dashboard's truncated text.

## Pause and recover

- Pause new signup with `ONBOARDING_ENABLED=false`, keeping the worker enabled to
  finish accepted work. Recreate the container after changing its env file.
- For a domain API incident, repair the token/settings and retry existing requests.
  Already registered company domains do not require a successful domain API call
  on every login; they still depend on DNS, Vercel, API, database and certificates.
- Do not disable domain automation as a shortcut while wildcard project routing is
  absent: new requests could become READY with an unreachable hostname.
- Preserve pending requests, slug reservations, and stable signing secrets during
  rollback. Do not drop onboarding tables or restore an old database over live writes.
- Retain private-file serving compatibility once records contain managed file URLs.
- For abandoned exact domains, review company/request ownership before manual
  removal. Automated retirement/reconciliation is future work.

## Acceptance record template

| Field | Record |
| --- | --- |
| Date / operator / API and frontend release SHA | Fill during deployment |
| New slug and exact Vercel branch assignment | Fill during deployment |
| Verification mail received; signup ready; login/reload/logout | Pass/fail with times |
| Two-company session and foreign-record/file tests | Pass/fail, selected endpoint coverage |
| Upload and reload on the newly created hostname | Pass/fail; verifies private bucket CORS covers new company origins |
| Forced transient failure and retry | No duplicate organization/membership; recovered request |
| Readiness, runtime role, private storage | Evidence reference |
| Remaining failures and owner | Explicit unresolved items |

The earlier 38 targeted tests were local unit/HTTP tests, not a real Vercel acceptance
suite. Run the commands in the onboarding module README. PostgreSQL fixtures require
their explicit disposable database; never substitute staging or production URLs.
