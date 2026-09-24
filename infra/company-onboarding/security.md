# Onboarding security risks

Last reviewed: **2026-09-24** against commit `283b64f` on `feat/onboarding-redesign`.
Scope: public self-service signup, company sign-in, and the auth routes they depend
on. This is a code and configuration review, not a penetration test. Recheck each
item against current code before acting on it.

**Status:** nothing below is fixed yet. Items marked **Must fix** block opening
public signup in production. **Should fix** items can follow shortly after launch
but need an owner and a date.

## Summary

| # | Priority | Risk | Main location |
| --- | --- | --- | --- |
| 1 | Must fix | The API can be called directly, and the `/auth/*` routes skip the proxy check | `apps/api/src/auth/auth.controller.ts`, nginx |
| 2 | Must fix | Rate limits share one IP bucket, reset on restart, and don't cover login | `apps/api/src/auth/auth.service.ts`, `apps/api/src/main.ts` |
| 3 | Must fix | Anyone can use up the global signup quota and block all real signups | `onboarding.service.ts` `signup` |
| 4 | Must fix | Vercel domain slots can be used up, and orphaned domains are never cleaned up | `onboarding.service.ts`, `workspace-domain.service.ts` |
| 5 | Must fix | Look-alike company addresses on our own domain can be used for phishing | `common/utils/organization-slug.ts` plus two web copies |
| 6 | Should fix | Signup email can be used to spam third parties and damage SES reputation | Onboarding outbox, SES |
| 7 | Should fix | Business tables have no row-level security | Database |
| 8 | Should fix | Progress tokens never expire | `onboarding.service.ts` `token` |
| 9 | Should fix | Static AWS keys and broad provider tokens | API environment |
| 10 | Should fix | Vercel Deployment Protection is off for the whole project | Vercel project settings |
| 11 | Must fix | Anyone who knows an employee's email, phone or code can set that employee's first password | `auth.service.ts` `verifyFirstTimeUser`, `employee.service.ts` |

## Exposed endpoints

All onboarding routes are unauthenticated by design. They are protected only by
the proxy secret and capability tokens.

| Endpoint | Guard today | What an attacker can do | Related risk |
| --- | --- | --- | --- |
| `POST /onboarding/signup` | Proxy secret | Use up the global quota, reserve slugs, send email to any address | 3, 4, 5, 6 |
| `POST /onboarding/verify` | Proxy secret + verify token | Guess an existing user's password (5 attempts per request) | 2 |
| `POST /onboarding/status` | Proxy secret + progress token | Read status with a leaked token, indefinitely | 8 |
| `POST /onboarding/resend` | Proxy secret + progress token | Send up to 10 emails per request, one per minute | 6 |
| `POST /onboarding/retry` | Proxy secret + progress token | Restart provisioning every minute with no cap | 4 |
| `POST /auth/login` | **None** | Unlimited password guessing | 1, 2 |
| `POST /auth/select-org`, `/auth/refresh`, `/auth/logout` | **None** | Called directly, bypassing the proxy's host and origin checks | 1 |
| `POST /auth/forgot-password` | **None** | Email bombing; exhaust the shared per-IP bucket so real users are blocked | 1, 2, 6 |
| `POST /auth/reset-password`, `/auth/verify-temp-password` | **None** | Guess tokens and temporary passwords; lock everyone out through the shared bucket | 1, 2 |
| `POST /auth/verify-first-time`, `/auth/create-password` | **None** | Called directly, bypassing the proxy | 1 |
| `POST /auth/company/verify-first-time` | Proxy secret | Get a password-setup token for any employee who hasn't set a password yet; list staff and read their names, with no rate limit | 2, 11 |

## 1. The API is reachable directly

**Problem.** The API is served publicly through nginx on EC2 (the sslip.io
hostname and the Elastic IP). `OnboardingGuard` and `TrustedTenantContextGuard`
check the proxy secret. The legacy routes in `AuthController` (`login`,
`select-org`, `refresh`, `logout`, `verify-first-time`, `create-password`,
`forgot-password`, `reset-password`, `verify-temp-password`) have no guard at
all. Anyone who finds the API host can call them directly and bypass the web
proxy's host, origin and path checks.

**Fix.**
- Add one global guard (`APP_GUARD`) that requires a valid `x-gemba-proxy-secret`
  on every route, and only exempt the health check. Opting out of the guard is
  safer than having to remember to opt in.
- At the network level, also restrict the EC2 security group or nginx so that
  only Vercel egress reaches the API. Otherwise, rotate the secret on a schedule
  and alert on proxy-secret failures.

**Done when.** A direct `curl` to the API host returns `403` for every route
except health, and the web app still works.

## 2. Rate limiting doesn't work as intended

**Problem.**
- `main.ts` never sets `trust proxy`, so `req.ip` is always nginx or the Docker
  gateway. Even with it set, the real caller is Vercel's server-side proxy, not
  the user's browser.
- So all users share one IP bucket:
  - forgot-password: 20 per hour across the whole platform;
  - reset-password and temp-password attempts: 10 per 15 minutes.
- One person can lock everyone out of password recovery.
- `checkRateLimit` keeps its counters in memory. They reset on every deploy,
  aren't shared between instances, and the separate get-then-set isn't atomic,
  so parallel requests can slip past the limit.
- `POST /auth/login` has no rate limit at all.
- The onboarding `verify` step checks an existing user's password (5 attempts
  per signup request). Combined with 3 signups per email per hour, that gives
  about 15 password guesses per hour against any account.

**Fix.**
- In `api-proxy.mjs`, forward the client IP from Vercel's `x-real-ip` /
  `x-forwarded-for` header in a dedicated header. The API should trust that
  header only on requests that carry a valid proxy secret.
- Move rate-limit counters to Postgres (atomic `INSERT … ON CONFLICT … RETURNING`)
  or Redis (`INCR` + `EXPIRE`).
- Add login throttles per account and per IP, with backoff. Count failed
  onboarding `verify` attempts toward the same per-account limit.

**Done when.** Tests show that one IP can't block another, that limits survive
an API restart, and that login returns `429` after the threshold.

## 3. Global signup quota can be used to block signups

**Problem.** `signup` rejects new requests once there are 100 signups per hour
across the platform, or 3 per email per hour. There is no per-IP limit and no
bot check. One script with 100 made-up addresses blocks every genuine signup
for an hour, and can repeat that every hour.

**Fix.**
- Add a Cloudflare Turnstile check on signup, verified server-side in the API.
- Add a per-IP limit (using the forwarded IP from item 2) and a Vercel Firewall
  rate-limit rule on `/api/onboarding/signup`.
- Keep the global cap only as a safety limit, and alert when it's reached.

**Done when.** A scripted burst from one source is rejected before it affects
the global count, and reaching the global cap triggers an alert.

## 4. Vercel domain slots can be used up

**Problem.**
- Each verified signup registers a real domain on the Vercel project. Hobby
  allows 50 domains per project (confirm your plan's actual limit).
- Verification only proves the person controls an inbox, so disposable email
  addresses pass.
- Domains registered for failed signups are never removed.
- `retry` resets the attempt count after a one-minute cooldown with no overall
  cap. So a failing request can call the Vercel API indefinitely, using up
  shared Vercel API rate limits.

**Fix.**
- Block disposable email domains at signup.
- Add a daily cap on verified signups.
- Add an optional `ONBOARDING_REQUIRE_APPROVAL` flag, so an operator must approve
  a signup before its domain is registered.
- Cap manual retries at about 3 per request.
- Add a cleanup job that removes Vercel domains for `FAILED` or `EXPIRED`
  requests that never became a company.
- Alert when domain usage reaches 70% of the limit (already listed in
  [scaling](scaling.md)).

**Done when.** A failed or expired signup leaves no domain behind after cleanup,
and retries stop after the cap.

## 5. Look-alike addresses on our domain

**Problem.** Only 7 slugs are reserved (`www`, `api`, `admin`, `app`, `auth`,
`staging`, `support`). Anyone can create `login`, `billing`, `security`,
`gembapms`, `bees-admin`, or a look-alike of an existing customer
(`kbcl-hr`, `gemba-plastics`). Each gets a real HTTPS site under
`bees.gembapms.com` that shows the standard sign-in page. That is convincing
enough to phish customers' staff. The list is also copied in three places
(`organization-slug.ts`, `apps/web/lib/server/api-proxy.mjs`,
`apps/web/lib/onboarding.ts`), so the copies will drift apart.

**Fix.**
- Keep one shared reserved list in a package that both the API and the web app
  import, and extend it with:
  - brand terms: `gemba`, `gembapms`, `bees`;
  - auth and billing terms: `login`, `signin`, `sso`, `account`, `billing`,
    `pay`, `security`, `verify`, `help`;
  - infrastructure terms: `mail`, `smtp`, `status`, `cdn`, `dev`, `test`.
- Flag or hold signups whose slug is close to an existing company's slug (edit
  distance, or the existing slug plus a suffix) for manual review.
- Notify the platform team about every new workspace.

**Done when.** Reserved and look-alike slugs are rejected or held in both the
API and the web app from one source list.

## 6. Signup email can be used to spam third parties

**Problem.**
- Anyone can enter someone else's email address. Each signup queues a
  verification email.
- `resend` allows up to 10 sends per request, one per minute.
- With 3 signups per email per hour, one address can receive about 30 emails per
  hour from `gembapms.com`.
- Forgot-password adds more mail on top of this (see item 2).
- Complaints and bounces count against our SES account. That puts delivery of
  every message from our domain at risk, including invitations and password
  resets.

**Fix.**
- Cap total sends per recipient address per day, across signups and password
  resets.
- Subscribe to SES bounce and complaint events, and stop sending to suppressed
  addresses.
- Monitor bounce and complaint rates (already a gate in [scaling](scaling.md)).

**Done when.** An address can't receive more than the daily cap, and a complaint
suppresses further sends.

## 7. No row-level security on business tables

Tenant isolation for business data relies on guards and on service code
filtering by `organizationId`. One missing filter in any new endpoint leaks data
across companies.

**Fix.**
- Enable RLS on business tables, starting with employees, users and
  memberships, using the same transaction-local context as `FileAsset`.
- Until then, add a CI test that lists every route and fails if a tenant route
  lacks `TrustedTenantContextGuard` + `JwtAuthGuard` + `TenantGuard`.

## 8. Progress tokens never expire

`token(id, 'progress')` is an HMAC of the request ID with no expiry. Anyone who
gets the token (browser history, screenshots, support tickets) can read the
request status indefinitely, and call `retry` or `resend` while those are still
allowed.

**Fix.** Include an expiry in the signed value, or refuse progress tokens once a
request has been `READY` for more than a day.

## 9. Credentials and token scope

- Replace static SES access keys in the API environment with the EC2 instance
  role.
- Limit the Vercel token to the single team and project that holds tenant
  domains, and store it only in the API environment.
- Rotate `ONBOARDING_TOKEN_SECRET` and the proxy secret on a documented schedule,
  and plan how in-flight signups behave when they change.

## 10. Vercel Deployment Protection is off

Deployment Protection was turned off for the whole project so the HTTPS readiness
check could reach company `/login` pages (see [README](README.md)). That also
exposes preview deployments.

**Fix.** Turn protection back on for previews, and exempt only the production and
staging domains that serve tenants. Alternatively, let the readiness check through
with a protection-bypass secret.

## 11. First-time account setup

**Problem.**
- Adding an employee sends nothing. There is no invitation email, so a new
  employee has no link to set their first password.
- Instead, sign-in asks for the identifier first. If that account has no
  password, `verify-first-time` returns a 15-minute `FIRST_TIME_SETUP` token and
  the page lets the person choose a password straight away.
- **Knowing an identifier is not proof of ownership.** Anyone who knows or
  guesses an employee's email, phone number or employee code can set that
  employee's password first and take over the account, with that employee's
  role and data access. Employee codes are often sequential (`EMP001`,
  `EMP002`…), and the endpoint has no rate limit.
- The same step tells an unauthenticated caller whether a person works at the
  company, whether they have set a password, and their name. That is enough to
  list a company's staff for phishing.
- History: commit `94f39a5` removed the token and sent first-time users to the
  emailed reset link. It was **restored on 2026-09-24** because new employees
  had no other practical way in. The code is marked with a `SECURITY` comment
  in `verifyFirstTimeUser`.
- Today's safeguards: the token lasts 15 minutes, only works on the employee's
  own company address, and can only set a password that is still empty.

**Fix.**
- Send an invitation email when an employee with an email address is added.
  It should contain a single-use "Set your password" link on the company's own
  subdomain, valid for about 7 days, reusing the `PasswordResetToken` table.
- Add a **Resend invite** action and an "Invite pending" / "Active" status on the
  employee record.
- Keep admin temporary passwords for staff without email, labelled as
  "Set up sign-in" in the admin UI. Log who generated each one.
- Count invite sends toward the per-recipient email cap from item 6.
- Once invitations exist, stop issuing `FIRST_TIME_SETUP` tokens from
  `verify-first-time`, and stop accepting them in `createPassword`. Then go back
  to a single email + password sign-in form with a generic error, and remove the
  identify step's name and password-status response.
- Until then, rate-limit `verify-first-time` per IP and per identifier (see
  item 2), and ask admins to have new staff sign in on their first day.

**Done when.**
- A newly added employee receives an invite and can sign in without admin help.
- Knowing an identifier alone can no longer set a password.
- An expired or used invite link is rejected.
- Sign-in no longer reveals whether an account exists or has a password.

## Suggested order

1. Items 1 and 2 together: the global guard and trusted client IP are
   prerequisites for every other rate limit. Item 11 (employee invitations)
   alongside them, because it allows account takeover today.
2. Item 3 (Turnstile and per-IP limits), item 5 (shared reserved list) and the
   retry cap from item 4.
3. The rest of item 4 (disposable email block, cleanup job, approval flag) and
   item 6.
4. Items 7–10 as scheduled hardening work.

Add each item's **Done when** check to the acceptance record described in the
[README](README.md) when it ships.
