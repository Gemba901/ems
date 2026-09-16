<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

### Tenant hostname resolution (milestone 2)

The API now registers `TenancyModule`. Set this required variable in the API's local `.env` and in each deployment's environment before starting the updated API:

```env
TENANT_BASE_DOMAIN=gembapms.co.in
TENANT_PROXY_SECRET=<server-only-random-secret>
```

Use your actual company-domain suffix, without a protocol, port, path or surrounding whitespace. For example, `acme.gembapms.co.in` resolves the organization with slug `acme`. A development suffix such as `example.test` can be used for direct resolver tests without public DNS. Missing or malformed configuration prevents initialization. No fallback production domain is assumed.

The registered trusted-context guard also requires a random `TENANT_PROXY_SECRET` (64–1024 characters, no whitespace). Generate a value with `openssl rand -hex 32`; the placeholder above is not a usable secret. Configure the same credential in the Next.js server proxy, never in a `NEXT_PUBLIC_` variable or browser code. Proxy-to-API traffic must use HTTPS. Redact the credential from logs and rotate it if exposed. The proxy must overwrite `x-gemba-proxy-secret` and derive/overwrite `x-gemba-tenant-hostname` from its validated incoming hostname. It must not pass through browser-supplied tenant headers.

Production/staging deployment variables must be configured on the API host, not only in local `.env` files. Recreate the API container after changing its environment file; restarting an existing container does not reload that file. Keep each environment's base domain and organization slugs consistent.

The parser permits exactly one tenant label and classifies reserved labels and the base domain as platform addresses. The company resolver rejects platform/invalid hosts and unknown companies with 404, and inactive/suspended companies with 403. Database failures propagate as operational errors. Existing companies need the milestone 1 slug migration/backfill before they can be resolved.

### Company authentication and authorization (milestone 3)

Company business routes require `TrustedTenantContextGuard → JwtAuthGuard → TenantGuard`, followed by existing role/module guards. TenantGuard rechecks current membership, company status, and permissions. JWT authentication must not run again after TenantGuard, as that would restore stale permissions. Company login, refresh and logout require trusted hostname resolution but do not require an unexpired access token.

The audited business areas include employees, departments, committees, notices, notifications, tickets, SIMS, Kaizen, EMS, leave, calendar, DWMS, uploads and all steel controllers. Company queries use organization filters or a tenant-owned parent/employee access check. Related employee, department, invitee, Kaizen team and DWMS alert references are checked before writes. Existing steel parent/foreign-key validation and organization-filtered analytics are retained.

Platform administration requires current SUPER_ADMIN membership in the ACTIVE organization designated `isAdminOrg`. Holding SUPER_ADMIN in a client company does not authorize platform operations. Intentional cross-company operations are the organization administration endpoints, explicitly guarded Calendar consultancy administration, and the system-ticket support routes.

API changes for the milestone 4 frontend/proxy:

- Company sessions: `POST /auth/company/login`, `/refresh`, `/logout`. The existing DWMS refresh/logout aliases now require trusted company forwarding and bind to that company.
- Company profile: `GET/PATCH /company/organization`. Company admins cannot change enabled modules. `/organizations` remains platform administration.
- Platform support: `GET /tickets/system`, `GET/PATCH /tickets/system/:id`. Ordinary ticket detail/update routes stay company-scoped, including for platform users.
- Employee contact updates/imports change company employee records, not shared login identities. Shared accounts must use email password recovery rather than company-admin temporary credentials. Company onboarding/import cannot grant SUPER_ADMIN.
- Upload signing requires company authentication. New object keys use `organizations/<organizationId>/<folder>/<uuid>-<filename>`. This does not change existing S3 objects or their read policy.
- `/auth/my-org` now requires trusted company forwarding and current membership.

Browser calls to protected routes require the milestone 4 same-origin proxy. Never expose `TENANT_PROXY_SECRET` in browser code. These API changes should ship with that proxy and the corresponding frontend endpoint changes.

Focused tests, from `apps/api`:

```bash
pnpm exec jest --runInBand departments employee tenancy auth/access-token-payload.spec.ts auth/jwt.strategy.spec.ts auth/company-auth.service.spec.ts auth/company-auth.controller.spec.ts uploads/upload-key.spec.ts steel dwms
```

The HTTP integration suite discovers business controllers and checks guard ordering on every business route, then exercises real Nest/Passport requests for cross-company denial. Database access in these HTTP tests is mocked; the runner needs permission to open local sockets. Service tests cover scoped lookups, related-record rejection, current permissions and shared-account boundaries. The repository's unrelated legacy tests are not included in this focused command.

Refresh rollback/concurrency tests use real PostgreSQL, with an explicit test URL (never the application's DATABASE_URL). To reproduce using a disposable container:

```bash
docker run --detach --rm --name gemba-m3-postgres-test -e POSTGRES_PASSWORD=local-test-only -p 127.0.0.1:55439:5432 postgres:16-alpine
# From packages/db, after PostgreSQL is ready:
DATABASE_URL=postgresql://postgres:local-test-only@127.0.0.1:55439/postgres pnpm exec prisma db push
# From apps/api:
NODE_OPTIONS=--experimental-vm-modules MILESTONE3_TEST_DATABASE_URL=postgresql://postgres:local-test-only@127.0.0.1:55439/postgres pnpm exec jest --runInBand auth/company-refresh.postgres.spec.ts
docker stop gemba-m3-postgres-test
```

These tests prove persistence/replay rejection, wrong-company token preservation, rollback of the old-token deletion on replacement failure, and exactly one replacement when two real transactions read the same token. Without the explicit test URL this suite is skipped. Tests clean up their own records; the container is disposable.

Milestone 4 covers browser/proxy integration, cookie forwarding, frontend endpoint updates and end-to-end company-hostname tests. DNS/TLS rollout and operational/database isolation hardening remain later deployment work.

```bash
$ pnpm install
```

## Compile and run the project

```bash
# development
$ pnpm run start

# watch mode
$ pnpm run start:dev

# production mode
$ pnpm run start:prod
```

## Run tests

```bash
# unit tests
$ pnpm run test

# e2e tests
$ pnpm run test:e2e

# test coverage
$ pnpm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ pnpm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).

The milestone 4 proxy and browser-session implementation is documented in [the web README](../web/README.md#company-workspaces--milestone-4). It uses private runtime configuration; the old public API URL is no longer used by web services.

### Verified onboarding (milestone 5)

See [the onboarding runbook](src/onboarding/README.md) for the signup state machine, migration order, private configuration, worker retry behavior and tests. Signup is disabled by default. Existing account setup now requires email recovery or a secret administrator-issued temporary password; identifier lookup no longer grants password setup.

### Staging readiness (milestone 6)

See [the milestone 6 rollout and manual-test runbook](../../infra/staging/README.md)
for private files, job controls, database roles, migrations, monitoring and rollback.
The central platform administration UI exposes `/admin/readiness`.
