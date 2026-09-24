# Company signup and login experience

## Flow

1. **Administrator:** first/last name, personal work email and phone. This email receives the verification link and owns the first administrator account.
2. **Company:** name, editable slug, short name, industry (including a free-text Other option), company email, phone, address and timezone. Slugs follow the existing 3–40 character hostname policy. The preview uses the server-configured tenant base domain, not a hardcoded production address. Name changes update the suggestion until the user edits the slug.
3. **Verification:** email instructions and resend feedback, followed by password and confirmation with independent visibility toggles. Existing account holders explicitly choose to use their current password; verification does not reset that password. New passwords must be at least 12 characters and all passwords must fit bcrypt's 72-byte limit.
4. **Provisioning:** the browser polls the capability-protected status endpoint without overlapping requests. The worker reports domain registration, HTTPS readiness and company/admin creation. No artificial percentages or separate database creation are shown. Retries remain bounded by the existing worker policy, with recoverable failures offering a manual retry.
5. **Welcome:** a ready workspace shows its address and an explicit "Go to sign in" button. There is no automatic cross-domain login. The user signs in with their verified credentials.
6. **Logo:** the welcome link adds `?welcome=1` to the company login. After successful administrator sign-in, a logo upload is offered using the existing authenticated upload, completion and company update endpoints. Users can skip and upload later in Company Settings. This flag grants no permissions; company context and role checks remain server-enforced. PNG/JPEG/WebP up to 5 MB are accepted by this UI.

Company-host login collects an identifier and password in one submission. Email, international phone and employee-code modes remain supported. Central login retains its company-discovery/selection flow. Both use the same origin proxy; the organization is still resolved from the trusted hostname.

## Visual design

The shell is a split layout. The left navy panel (`#283548`) shows the Gemba gear mark (`public/gemba-mark-light.png`) with the BEES wordmark, a checklist of the four real setup steps, and the workspace address. On company sign-in, the panel shows "Signing in to" and the company address instead of the checklist. On narrow screens the panel becomes a top bar with the step or address. Brand colours are Tailwind tokens in `apps/web/app/globals.css` (`gemba-navy`, `gemba-lime`, `gemba-red`, plus `-ink` variants that stay readable as text on white). Primary buttons are navy, progress and success use lime, and errors use brand red. Copy stays operational: no slogans, taglines or decorative icon tiles.

## Data and rollout

`20260923120000_onboarding_company_profile` adds nullable profile fields and `provisioningStage` to `OnboardingRequest`. It does not create databases or change organization isolation. The organization already has profile fields; the worker copies the new values inside its existing final transaction. Old pending requests and old clients can finish with null/omitted profile fields. Newly deployed UI requires the company fields.

Deploy the additive migration using the normal reviewed `prisma migrate deploy` process **before** starting the new API/worker. Do not use `migrate dev` against staging or production. Generate/build the database package, deploy the API, then the web app. UI status data depends on the updated API; deploy them together. Rollback can retain the nullable columns while reverting application code.

Logo upload still depends on the existing S3 CORS policy allowing company origins. Validate a new company host's upload during staging acceptance; a successful login alone does not verify upload configuration.

## Implementation map

| File | Responsibility |
| --- | --- |
| `apps/web/components/onboarding/OnboardingShell.tsx` | Navy brand panel with setup checklist and address preview; shared fields, buttons, notices and `StepHeading`. |
| `apps/web/app/(auth)/signup/page.tsx` | Two-step administrator/company form and idempotent submission. |
| `apps/web/lib/onboarding.ts` | Slug suggestions, industry options, bounded onboarding requests. |
| `apps/web/app/(auth)/signup/verify/page.tsx` | Email, password, real progress, recovery and ready states. |
| `apps/web/components/auth/CompanyLogin.tsx` | One-submission tenant login and authenticated handoff to logo setup. |
| `apps/web/components/onboarding/CompanyLogoSetup.tsx` | Secure image upload and optional skip. |
| `apps/web/app/(auth)/login/page.tsx` | Host-aware choice of company login or existing central flow. |
| `apps/web/lib/server/api-proxy.mjs` | Adds safe public base-domain/port metadata for address previews. |
| `apps/api/src/onboarding/onboarding.dto.ts` | Validates optional company profile values for rolling compatibility. |
| `apps/api/src/onboarding/onboarding.service.ts` | Stores profile, copies it to the organization, exposes safe progress and retry eligibility. |
| `apps/api/src/onboarding/workspace-domain.service.ts` | Reports domain and HTTPS phases around actual provider operations. |
| `packages/db/prisma/schema.prisma` and additive migration | Durable profile and setup-stage fields. |

## Acceptance checks

- Name-to-slug suggestion; manual edits survive subsequent name changes; reserved/invalid slugs rejected; duplicate addresses still rejected server-side.
- Other industry requires text; admin contact and company contact remain distinct after provisioning.
- Resend errors, expired links, existing-account passwords, confirmation mismatch and multibyte password limits.
- Reloading verification/progress resumes without storing plaintext passwords; failed network requests recover without overlapping polls.
- Real provider failure does not create a company or expose a ready URL; recoverable retry and permanent conflict have different actions.
- A fresh ready signup signs in on its own host, uploads a logo, and enters the workspace. Skip remains usable.
- Company login email/phone/employee code, incorrect credentials, password recovery and foreign-company membership rejection.
- Desktop and narrow mobile layout, keyboard controls, password visibility labels and status announcements.

## Local validation

Run from the repository root:

```sh
pnpm --filter db build
pnpm --filter api exec jest --runInBand src/onboarding/onboarding.spec.ts src/onboarding/onboarding.domain.spec.ts src/onboarding/workspace-domain.service.spec.ts
pnpm --filter web test:proxy
pnpm --filter web test:onboarding
pnpm --filter web exec next typegen
pnpm --filter web exec tsc --noEmit
```

On 2026-09-23, the database build, 35 targeted backend tests, 42 proxy tests, slug checks, changed-file lint and web type check passed. Local browser checks with mocked APIs covered desktop/mobile signup, custom slug preservation, Other industry submission, password mismatch/visibility, backend-stage rendering, welcome, single-form company login, the authenticated logo prompt, and the logo upload/completion/profile-save sequence. These checks do not replace staging acceptance against real SES, Vercel, PostgreSQL and S3 services. No database migration was applied to a live environment during UI validation.
