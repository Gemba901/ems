This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Company workspaces — milestone 4

Browser requests now use `/api/*` on the current web origin. The Next.js route
handler validates `Host`, derives the company hostname and forwards it to the API
with a server-only credential. The API independently resolves the company and
checks the token's current membership. Browser-supplied tenant/forwarding headers
are discarded. This removes cross-origin API requests from the browser flow.

Set these **private runtime environment variables** on the web server (for example,
in `.env.local` for development). Never prefix them with `NEXT_PUBLIC_`:

```dotenv
API_INTERNAL_URL=http://localhost:3001
TENANT_BASE_DOMAIN=localhost
TENANT_PLATFORM_HOSTS=localhost
TENANT_PLATFORM_SLUG=your-platform-organization-slug
TENANT_PROXY_SECRET=replace-with-the-same-random-secret-as-the-api
```

Use the API's actual port. Generate a secret with `openssl rand -hex 32`; the
placeholder is intentionally rejected. The API needs the same
`TENANT_BASE_DOMAIN` and `TENANT_PROXY_SECRET`. `TENANT_PLATFORM_SLUG` must identify
the existing ACTIVE platform organization with `isAdminOrg=true`; it supplies
company context for platform staff's business routes. It never grants a user a
platform role. Without this mapping, central organization administration still
works, but business routes are blocked. `TENANT_PLATFORM_HOSTS` is a comma-separated
list of exact central hostnames, without schemes or ports; if omitted it defaults
to the base domain.

Run the API and `pnpm --filter web dev`, then open `http://acme.localhost:3000/login`
and `http://beta.localhost:3000/login` using existing ACTIVE companies with those
slugs. Use hosts-file entries pointing both names to `127.0.0.1` if local wildcard
resolution is unavailable. Opening the app by LAN IP is not supported by the
company-hostname validator.

For production, use your actual base domain and central hostnames, HTTPS for both
the browser and `API_INTERNAL_URL`, and wildcard DNS/TLS pointing company hosts at
the same Next.js deployment. Any upstream ingress must preserve the original
`Host`; this proxy deliberately ignores `X-Forwarded-Host`. Deploy the API and web
changes together. Do not cache `/api/*` at a CDN. Requests have a 20 MiB body limit
and a 30-second upstream timeout. Presigned object uploads still go directly to
storage; their bucket CORS configuration must permit the intended web origins.

Access tokens live only in memory. Refresh tokens use a host-only HttpOnly cookie
(`__Host-gemba_refresh; Secure; Path=/; SameSite=Lax` in production). Each company
therefore has a separate browser session. The previous localStorage login is
removed on startup, so existing users must sign in again. Mutating requests must
carry an exact matching Origin, including the local development port; sibling
company origins are rejected. API responses and the PWA API runtime cache use
network-only/no-store behavior.

Startup restores the session through refresh. Concurrent refreshes in a tab share
one promise; Web Locks serialize refresh/logout across tabs on the same origin.
Browsers without Web Locks only get serialization within each tab. Logout is
broadcast to other tabs. Temporary connection failures preserve the session and
show retry feedback. Changing users or organizations clears the query cache.

Central login retains platform administration. For ordinary company users it
returns a token-free workspace address and opens that company's login page;
users sign in there again. Seamless cross-domain SSO is not implemented. Company
identifier lookup and first-time password setup enforce company membership.
Password-reset links remain the existing global-account recovery flow.

Run the focused checks from the repository root:

```bash
pnpm --filter web test:proxy
pnpm --filter web test:session
pnpm --filter web test:proxy-integration
pnpm --filter web exec tsc --noEmit --incremental false
pnpm --filter web build
```

The integration test starts a real Next.js route and disposable localhost API
stub; it does not connect to a database or prove browser cookie enforcement.
Before deployment, exercise two real company hosts in a browser: sign in to both,
reload, expire an access token, use concurrent tabs, log out of one company and
confirm the other stays signed in. Check platform login and ordinary-company
redirects, downloads and uploads, and rejection of a company-A token on company B.
DNS/TLS rollout and this live browser acceptance check remain deployment tasks.

## Verified signup — milestone 5

The central host exposes `/signup` and `/signup/verify`. Signup forwards only through central-host `/api/onboarding/*` routes. See [the API onboarding runbook](../api/src/onboarding/README.md) before enabling it. No public environment variables or browser-held proxy secrets are required. A new workspace has the server-configured default modules and an ADMIN membership; existing users must verify their email and authenticate with their current password.

## Staging readiness — milestone 6

Platform administrators can inspect `/admin/readiness` on the central host.
New uploaded images and documents use authenticated company file routes; their
components fetch with the current session instead of exposing public object URLs.
Follow [the staging rollout and acceptance runbook](../../infra/staging/README.md)
for storage policies, deployment order, worker flags and browser checks.
