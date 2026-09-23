# Scaling roadmap

Last reviewed: 2026-09-23. [Architecture](README.md) · [Operations](operations.md)

Everything in this roadmap is a **recommendation unless explicitly described as
implemented**. Thresholds below are initial review triggers, not measured capacity
limits, committed SLAs, or infrastructure already deployed. Assign named owners
and dates during release planning.

## Principles

- Scale from measured concurrency, queue age, database load, and business workload,
  not company count alone. Ten heavy companies can cost more than hundreds of quiet ones.
- Keep the modular monolith and shared database until measurements or isolation
  requirements justify more complexity. Subdomains do not require per-company servers.
- Separate application traffic from provisioning dependencies. Existing companies
  should not require a domain-management API call to sign in.
- Budget limits must cover Vercel, EC2, database, storage/egress, SES, observability,
  and operational effort. Review cost per active company alongside performance.

## Phase 1: establish a production baseline

Complete these before treating successful staging onboarding as production readiness.

| Work | Suggested owner | Exit evidence |
| --- | --- | --- |
| Separate production/staging application projects, origins, credentials, database and bucket | Platform | Staging deployment cannot modify production domains or customer data |
| Choose public app hosting protection deliberately | Platform + security | Anonymous visitor reaches the Gemba login; protected internal previews remain restricted |
| Audit every company endpoint and ownership relationship | API + QA | Cross-company reads/writes, role changes, refresh and file access tested across modules |
| Extend reviewed transaction-local tenant context and RLS to business tables | Database + API | Non-owner runtime role, policy tests and query coverage; no pooled connection context leakage |
| Complete reviewed slug enforcement rollout | Database | All existing slugs reviewed, unique, and required after compatible deployment |
| Inventory/migrate legacy public files | API + storage | References migrated and checked before public access is closed |
| Backup/restore and recovery procedure | Platform + database | Restore into isolated environment with outbound email/jobs disabled; agree and measure RPO/RTO |
| SES production access, sender authentication and delivery events | Platform | Account/region quotas checked; bounce/complaint handling and notification ownership demonstrated |
| Signup abuse controls and resource limits | API + security | Ingress controls tested, quotas reviewed, sensitive credentials absent from logs |
| Monitoring and operator ownership | Platform | A controlled failed signup produces an actionable alert and documented recovery |

The current SES client explicitly supplies access keys. Prefer an instance/task role
and the SDK credential provider chain, but that requires an application change and
acceptance test; attaching a role alone does not replace those explicit credentials.
Store other credentials in a managed secret store, document rotation, and alert on
Vercel token expiry. Version onboarding capability secrets if rotation must preserve
already-issued links; the current implementation has no signing-key versioning.

## Phase 2: improve observability and signup reliability

| Measure | Initial review trigger | Action |
| --- | --- | --- |
| Verification-to-READY latency | p95 above five minutes over a useful sample | Separate DNS, certificate, API and DB delays before scaling compute |
| Oldest provisioning request | Older than ten minutes | Inspect backoff/provider status; current retries may legitimately continue beyond this |
| Final provisioning failures | Any unexpected FAILED request | Alert support; retain request and retry after cause is fixed |
| Domain quota usage | 70% of the actual account limit | Plan capacity/upgrade or wildcard migration before reaching the limit |
| Domain API usage | 70% of published/account allowance or repeated 429s | Pace work across replicas; avoid retry bursts |
| API/database resources | Sustained CPU/memory pressure, connection waits, slow queries | Profile, tune queries/indexes and load-test the limiting resource |
| Availability and HTTP errors | Agreed error budget exceeded | Investigate provider/app causes; do not assume traffic count proves overload |
| Email delivery failures | Unexpected rejection, bounce/complaint growth | Inspect provider events and suppress invalid recipients |

Record queue age, attempts, safe reason codes, provider status, probe latency and
provisioning phase. Avoid logging raw API bodies, tokens, passwords or signed links.
Show users useful stages such as “Preparing secure company address,” elapsed time,
and retry guidance. Persist phases before exposing them; currently the UI primarily
shows PROVISIONING rather than detailed stages.

The current adapter creates/reuses a domain, checks assignment/verification/DNS,
and probes `/login`; it does not independently monitor certificate expiry or
reconcile domains after onboarding. Add a scheduled audit for domain drift,
certificate health, stale registrations and missing company routes, with reviewed
cleanup rules. Never automatically delete a domain solely because one API lookup fails.

## Phase 3: remove domain-management bottlenecks when justified

The current exact-domain API approach remains suitable while its limits and latency
meet the business need. Vercel documents automatic certificates and programmatic
registration. [Domain management](https://vercel.com/docs/platforms/multi-tenant-platforms/configuring-domains)

At review time, Vercel's plan table lists 50 custom domains on Hobby, with higher
capacity on paid plans. Its multi-tenant limits page also lists domain addition at
100 requests/hour/team and verification at 50/hour/team. That page contains a
conflicting generic “unlimited” custom-domains statement; confirm the effective
account limits in the dashboard/support and current plan terms before committing
capacity. Do not design around the permissive statement. [Vercel limits](https://vercel.com/docs/platforms/multi-tenant-platforms/limits)

The application itself allows up to 100 signup submissions globally/hour and three
per email/hour. Those are abuse limits, not throughput guarantees. They are not
coordinated with the provider's team-wide domain quotas. Retries and other projects
also consume provider operations. Add shared rate limiting, retry jitter and
provider-aware backoff (including Retry-After where appropriate) before scaling
registration workers aggressively. These are not implemented today.

Consider a true wildcard project binding when API calls, domain count or certificate
waiting become a material onboarding bottleneck. Options:

1. Use a dedicated application domain managed by Vercel, preserving marketing DNS.
2. Delegate `_acme-challenge.bees` where the authoritative provider supports it.
3. Migrate the parent zone only after preserving every service record and resolving
   the Hostinger CDN/origin problem.

The current Vercel docs describe challenge delegation plus wildcard traffic DNS.
Hostinger support must confirm whether its authoritative service can provide that
delegation. A registrar change or adding NS rows at a non-authoritative provider
does not implement it. [External-DNS wildcard setup](https://vercel.com/docs/domains/working-with-domains/add-a-domain#use-wildcard-domains-with-an-external-dns-provider)

For any migration: inventory/export current DNS; stage and validate the destination;
check DNSSEC, mail, website, API, IPv4/IPv6 and certificates; test a canary company;
document rollback and propagation; then cut over. Keep exact working domains until
wildcard coverage is proven. Disable exact-domain automation only after that proof.
If hostnames change, plan sessions, verification links, bookmarked file URLs, upload
CORS, base-domain configuration and company communications; a DNS change alone is
not a complete application migration.

## Phase 4: scale workers and API compute

Today the worker is inside each API process, with a local busy flag, a ten-second
timer, and one provisioning request plus one email job per tick. Database claims
coordinate replicas. The theoretical quick-work ceiling per process is roughly six
requests and six email jobs per minute; real throughput is lower with provider delays.
A signup normally needs both verification and welcome mail. This is not a benchmark.

First measure queue age and job duration. Then consider:

- Run dedicated worker processes so slow provider operations do not couple worker
  deployment/concurrency to API traffic. Keep transactional outbox state durable.
- Introduce bounded concurrency and a durable queue when PostgreSQL polling/throughput
  becomes limiting. Retain idempotency and conditional attempt/lease ownership.
- Preserve a single organization per signup, unique slug reservations, and
  reconciliation after a crash between external domain creation and database commit.
- Match lease duration/renewal to the longest operation. Test crash recovery,
  overlapping retries, duplicate delivery, and interrupted deploys before adding replicas.
- Scale stateless APIs behind a load balancer after verifying shared database session
  state and distributed job claims. Move any rate limits or caches needing global
  consistency out of process-local memory.
- Size the combined database connection pools across all API and worker replicas;
  additional instances can overload PostgreSQL before CPU becomes the bottleneck.

## Phase 5: data, files and tenant fairness

Profile queries with realistic company sizes and workload distributions. Add indexes
matching frequent organization-scoped filters and ordering, paginate large endpoints,
and remove N+1 query patterns. Load-test reporting/export jobs separately from login
and interactive operations. Scope every cache key to company and permission context
where required; shared caches must not return another company's data.

Introduce per-company request, upload, job and export budgets so one tenant cannot
consume all shared resources. RLS improves defense in depth but does not provide
compute/resource fairness. Consider dedicated databases or infrastructure only when
compliance, residency, restore requirements or measured noisy-neighbor pressure
justify migration, routing and operational complexity.

For uploads, define retention, maximum sizes, malware/content checks, orphan cleanup,
storage/egress budgets and audit trails. Private file downloads currently traverse
application authorization; measure streaming load and memory before growing API
capacity. Evaluate short-lived authorized download links or a private CDN only with
tests for tenant authorization, link expiry, cache behavior and revocation tradeoffs.
Never “scale” by making the private bucket public.
Check the bucket's CORS rules against a newly generated company hostname: a list
containing only the first two staging companies will not automatically grow when
Vercel adds a domain. Use a reviewed origin pattern or controlled configuration
automation and test browser preflight, signed headers, upload completion and reload.

Configure SES delivery events, suppression and complaint handling before volume grows.
Check actual regional daily and per-second sending quotas and budget for retries and
both verification/welcome messages. [SES sending limits](https://docs.aws.amazon.com/ses/latest/dg/manage-sending-quotas.html)

## Review cadence and ownership

| Cadence / event | Review |
| --- | --- |
| Every release affecting auth/proxy/domains | Cross-company regression and fresh signup acceptance |
| Monthly, initially | Active company count, domain headroom, token expiry, failed jobs, latency and provider spend |
| Before a signup campaign | Expected arrival rate, queue drain time, provider quotas and support coverage |
| Before more API/worker replicas | Database pool budget, leases, duplicate work and failure recovery |
| Before DNS/plan/provider changes | Current authoritative records, effective quotas, certificate renewal and rollback |
| Recovery exercise schedule agreed by owners | Restore test, measured RPO/RTO, secrets access and incident escalation |

Assign named owners for platform/domain/SES configuration, API authorization and
workers, database recovery/RLS, frontend onboarding/session UX, and acceptance QA.
Replace these suggested roles with actual owners and agreed deadlines in release
planning. No infrastructure change is authorized merely by appearing in this roadmap.
