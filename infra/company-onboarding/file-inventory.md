# Onboarding and tenancy file inventory

Last reviewed: 2026-09-23. [Architecture](README.md) · [Operations](operations.md) · [Scaling](scaling.md)

Historical scope: `94f39a5` (initial tenancy/onboarding rollout) and `61e7b5e` (automatic Vercel company domains).
Later SGA/DWMS changes are not attributed to onboarding here. Some historical files have since been replaced or removed.
The purpose column summarizes each file’s role in these commits; it is not a line-by-line audit or a claim that every isolation path has been tested.

Infrastructure console changes (DNS, SES IAM permissions, Vercel Deployment Protection, EC2 secrets) are not Git files.

234 paths in the initial rollout; 8 in the latest commit; 237 unique paths across both.

| File | Purpose of the change | Commit scope |
|---|---|---|
| [.dockerignore](<../../.dockerignore>) | Excludes local secrets, dependencies, and build artifacts from Docker build context. | Initial rollout |
| [apps/api/README.md](<../../apps/api/README.md>) | Documents API tenant/auth boundaries and deployment configuration. | Initial rollout |
| [apps/api/src/app.module.ts](<../../apps/api/src/app.module.ts>) | Registers tenancy, onboarding, and operations modules in the NestJS application. | Initial rollout |
| [apps/api/src/auth/access-token-payload.spec.ts](<../../apps/api/src/auth/access-token-payload.spec.ts>) | Regression tests: isAccessTokenPayload. | Initial rollout |
| [apps/api/src/auth/access-token-payload.ts](<../../apps/api/src/auth/access-token-payload.ts>) | Defines and validates the token fields needed to distinguish access tokens and company identity. | Initial rollout |
| [apps/api/src/auth/auth.controller.ts](<../../apps/api/src/auth/auth.controller.ts>) | Separates platform organization access from guarded company organization access. | Initial rollout |
| [apps/api/src/auth/auth.module.ts](<../../apps/api/src/auth/auth.module.ts>) | Wires tenancy guards and related providers into this NestJS feature module. | Initial rollout |
| [apps/api/src/auth/auth.service.spec.ts](<../../apps/api/src/auth/auth.service.spec.ts>) | Regression tests: AuthService; login; verifyFirstTimeUser. | Initial rollout |
| [apps/api/src/auth/auth.service.ts](<../../apps/api/src/auth/auth.service.ts>) | Implements company-aware login, membership checks, company refresh-token rotation/revocation, and safer account setup. | Initial rollout |
| [apps/api/src/auth/company-auth.controller.spec.ts](<../../apps/api/src/auth/company-auth.controller.spec.ts>) | Regression tests: CompanyAuthController and tenant guard wiring. | Initial rollout |
| [apps/api/src/auth/company-auth.controller.ts](<../../apps/api/src/auth/company-auth.controller.ts>) | Exposes company login/refresh/logout and sets host-only HttpOnly refresh cookies. | Initial rollout |
| [apps/api/src/auth/company-auth.service.spec.ts](<../../apps/api/src/auth/company-auth.service.spec.ts>) | Regression tests: Company authentication service. | Initial rollout |
| [apps/api/src/auth/company-refresh.postgres.spec.ts](<../../apps/api/src/auth/company-refresh.postgres.spec.ts>) | Regression tests: company refresh. PostgreSQL fixtures require an explicitly configured disposable database. | Initial rollout |
| [apps/api/src/auth/jwt.strategy.spec.ts](<../../apps/api/src/auth/jwt.strategy.spec.ts>) | Regression tests: JwtStrategy authentication. | Initial rollout |
| [apps/api/src/auth/jwt.strategy.ts](<../../apps/api/src/auth/jwt.strategy.ts>) | Validates access-token claims for authenticated API requests. | Initial rollout |
| [apps/api/src/auth/verified-account-setup.spec.ts](<../../apps/api/src/auth/verified-account-setup.spec.ts>) | Regression tests: Verified account setup. | Initial rollout |
| [apps/api/src/calendar/calendar.controller.ts](<../../apps/api/src/calendar/calendar.controller.ts>) | Requires trusted company context, authenticated membership, and existing feature/role authorization on business endpoints. | Initial rollout |
| [apps/api/src/calendar/calendar.module.ts](<../../apps/api/src/calendar/calendar.module.ts>) | Wires tenancy guards and related providers into this NestJS feature module. | Initial rollout |
| [apps/api/src/calendar/calendar.service.ts](<../../apps/api/src/calendar/calendar.service.ts>) | Adds company-scoped record/relationship validation to this business service so foreign IDs cannot bypass request-level guards. | Initial rollout |
| [apps/api/src/chat/chat.controller.ts](<../../apps/api/src/chat/chat.controller.ts>) | Requires trusted company context, authenticated membership, and existing feature/role authorization on business endpoints. | Initial rollout |
| [apps/api/src/chat/chat.module.ts](<../../apps/api/src/chat/chat.module.ts>) | Wires tenancy guards and related providers into this NestJS feature module. | Initial rollout |
| [apps/api/src/committee/committee.controller.ts](<../../apps/api/src/committee/committee.controller.ts>) | Requires trusted company context, authenticated membership, and existing feature/role authorization on business endpoints. | Initial rollout |
| [apps/api/src/committee/committee.module.ts](<../../apps/api/src/committee/committee.module.ts>) | Wires tenancy guards and related providers into this NestJS feature module. | Initial rollout |
| [apps/api/src/committee/committee.service.ts](<../../apps/api/src/committee/committee.service.ts>) | Adds company-scoped record/relationship validation to this business service so foreign IDs cannot bypass request-level guards. | Initial rollout |
| [apps/api/src/common/utils/organization-slug.spec.ts](<../../apps/api/src/common/utils/organization-slug.spec.ts>) | Regression tests: organization slug rules. | Initial rollout |
| [apps/api/src/common/utils/organization-slug.ts](<../../apps/api/src/common/utils/organization-slug.ts>) | Normalizes company slugs and enforces length, character, and reserved-name rules. | Initial rollout |
| [apps/api/src/departments/departments.controller.spec.ts](<../../apps/api/src/departments/departments.controller.spec.ts>) | Regression tests: Department controller guard wiring. | Initial rollout |
| [apps/api/src/departments/departments.controller.ts](<../../apps/api/src/departments/departments.controller.ts>) | Requires trusted company context, authenticated membership, and existing feature/role authorization on business endpoints. | Initial rollout |
| [apps/api/src/departments/departments.module.ts](<../../apps/api/src/departments/departments.module.ts>) | Wires tenancy guards and related providers into this NestJS feature module. | Initial rollout |
| [apps/api/src/departments/departments.service.spec.ts](<../../apps/api/src/departments/departments.service.spec.ts>) | Regression tests: Department isolation. | Initial rollout |
| [apps/api/src/departments/departments.service.ts](<../../apps/api/src/departments/departments.service.ts>) | Adds company-scoped record/relationship validation to this business service so foreign IDs cannot bypass request-level guards. | Initial rollout |
| [apps/api/src/dwms/dwms.controller.ts](<../../apps/api/src/dwms/dwms.controller.ts>) | Requires trusted company context, authenticated membership, and existing feature/role authorization on business endpoints. | Initial rollout |
| [apps/api/src/dwms/dwms.module.ts](<../../apps/api/src/dwms/dwms.module.ts>) | Wires tenancy guards and related providers into this NestJS feature module. | Initial rollout |
| `apps/api/src/dwms/escalation.service.spec.ts` (historical path) | Regression tests: DWMS overdue recipient delivery. | Initial rollout |
| `apps/api/src/dwms/escalation.service.ts` (historical path) | Wraps recurring work in coordinated database job claims to limit duplicate execution across API instances. | Initial rollout |
| [apps/api/src/dwms/services/alerts.service.ts](<../../apps/api/src/dwms/services/alerts.service.ts>) | Adds company-scoped record/relationship validation to this business service so foreign IDs cannot bypass request-level guards. | Initial rollout |
| [apps/api/src/dwms/services/base.service.ts](<../../apps/api/src/dwms/services/base.service.ts>) | Adds company-scoped record/relationship validation to this business service so foreign IDs cannot bypass request-level guards. | Initial rollout |
| [apps/api/src/dwms/services/directory.service.ts](<../../apps/api/src/dwms/services/directory.service.ts>) | Adds company-scoped record/relationship validation to this business service so foreign IDs cannot bypass request-level guards. | Initial rollout |
| [apps/api/src/dwms/services/task.service.ts](<../../apps/api/src/dwms/services/task.service.ts>) | Adds company-scoped record/relationship validation to this business service so foreign IDs cannot bypass request-level guards. | Initial rollout |
| [apps/api/src/dwms/task-instance-scheduler.service.ts](<../../apps/api/src/dwms/task-instance-scheduler.service.ts>) | Wraps recurring work in coordinated database job claims to limit duplicate execution across API instances. | Initial rollout |
| [apps/api/src/employee/employee.controller.spec.ts](<../../apps/api/src/employee/employee.controller.spec.ts>) | Regression tests: EmployeeController; onboard; getById. | Initial rollout |
| [apps/api/src/employee/employee.controller.ts](<../../apps/api/src/employee/employee.controller.ts>) | Requires trusted company context, authenticated membership, and existing feature/role authorization on business endpoints. | Initial rollout |
| [apps/api/src/employee/employee.module.ts](<../../apps/api/src/employee/employee.module.ts>) | Wires tenancy guards and related providers into this NestJS feature module. | Initial rollout |
| [apps/api/src/employee/employee.service.spec.ts](<../../apps/api/src/employee/employee.service.spec.ts>) | Regression tests: Employee company isolation. | Initial rollout |
| [apps/api/src/employee/employee.service.ts](<../../apps/api/src/employee/employee.service.ts>) | Adds company-scoped record/relationship validation to this business service so foreign IDs cannot bypass request-level guards. | Initial rollout |
| [apps/api/src/ems/ems.controller.ts](<../../apps/api/src/ems/ems.controller.ts>) | Requires trusted company context, authenticated membership, and existing feature/role authorization on business endpoints. | Initial rollout |
| [apps/api/src/ems/ems.module.ts](<../../apps/api/src/ems/ems.module.ts>) | Wires tenancy guards and related providers into this NestJS feature module. | Initial rollout |
| [apps/api/src/ems/ems.service.ts](<../../apps/api/src/ems/ems.service.ts>) | Adds company-scoped record/relationship validation to this business service so foreign IDs cannot bypass request-level guards. | Initial rollout |
| [apps/api/src/kaizen/kaizen.controller.ts](<../../apps/api/src/kaizen/kaizen.controller.ts>) | Requires trusted company context, authenticated membership, and existing feature/role authorization on business endpoints. | Initial rollout |
| [apps/api/src/kaizen/kaizen.module.ts](<../../apps/api/src/kaizen/kaizen.module.ts>) | Wires tenancy guards and related providers into this NestJS feature module. | Initial rollout |
| [apps/api/src/kaizen/kaizen.service.ts](<../../apps/api/src/kaizen/kaizen.service.ts>) | Adds company-scoped record/relationship validation to this business service so foreign IDs cannot bypass request-level guards. | Initial rollout |
| [apps/api/src/leave/leave.controller.ts](<../../apps/api/src/leave/leave.controller.ts>) | Requires trusted company context, authenticated membership, and existing feature/role authorization on business endpoints. | Initial rollout |
| [apps/api/src/leave/leave.module.ts](<../../apps/api/src/leave/leave.module.ts>) | Wires tenancy guards and related providers into this NestJS feature module. | Initial rollout |
| [apps/api/src/main.ts](<../../apps/api/src/main.ts>) | Installs request logging and safe exception handling; adjusts allowed central origin. | Initial rollout |
| [apps/api/src/notices/notices.controller.ts](<../../apps/api/src/notices/notices.controller.ts>) | Requires trusted company context, authenticated membership, and existing feature/role authorization on business endpoints. | Initial rollout |
| [apps/api/src/notices/notices.module.ts](<../../apps/api/src/notices/notices.module.ts>) | Wires tenancy guards and related providers into this NestJS feature module. | Initial rollout |
| [apps/api/src/notices/notices.service.ts](<../../apps/api/src/notices/notices.service.ts>) | Adds company-scoped record/relationship validation to this business service so foreign IDs cannot bypass request-level guards. | Initial rollout |
| [apps/api/src/notifications/channels/email.service.ts](<../../apps/api/src/notifications/channels/email.service.ts>) | Sends messages with AWS SES; required-delivery mode propagates failures without logging verification links. | Initial rollout |
| [apps/api/src/notifications/notifications.controller.ts](<../../apps/api/src/notifications/notifications.controller.ts>) | Requires trusted company context, authenticated membership, and existing feature/role authorization on business endpoints. | Initial rollout |
| [apps/api/src/notifications/notifications.module.ts](<../../apps/api/src/notifications/notifications.module.ts>) | Wires tenancy guards and related providers into this NestJS feature module. | Initial rollout |
| [apps/api/src/onboarding/README.md](<../../apps/api/src/onboarding/README.md>) | Documents onboarding states, configuration, retries, domain automation, and deployment acceptance. | Both |
| [apps/api/src/onboarding/onboarding.controller.ts](<../../apps/api/src/onboarding/onboarding.controller.ts>) | Exposes signup, verify, status, retry, and resend endpoints with DTO validation. | Initial rollout |
| [apps/api/src/onboarding/onboarding.domain.spec.ts](<../../apps/api/src/onboarding/onboarding.domain.spec.ts>) | Regression tests: Onboarding domain readiness gate. | Domain automation |
| [apps/api/src/onboarding/onboarding.dto.ts](<../../apps/api/src/onboarding/onboarding.dto.ts>) | Validates signup details, idempotency keys, capability tokens, and passwords. | Initial rollout |
| [apps/api/src/onboarding/onboarding.guard.ts](<../../apps/api/src/onboarding/onboarding.guard.ts>) | Enforces signup/worker feature switches and the trusted proxy credential. | Initial rollout |
| [apps/api/src/onboarding/onboarding.http.spec.ts](<../../apps/api/src/onboarding/onboarding.http.spec.ts>) | Regression tests: Onboarding HTTP boundary. | Initial rollout |
| [apps/api/src/onboarding/onboarding.module.ts](<../../apps/api/src/onboarding/onboarding.module.ts>) | Wires tenancy guards and related providers into this NestJS feature module. | Both |
| [apps/api/src/onboarding/onboarding.postgres.spec.ts](<../../apps/api/src/onboarding/onboarding.postgres.spec.ts>) | Regression tests: onboarding. PostgreSQL fixtures require an explicitly configured disposable database. | Both |
| [apps/api/src/onboarding/onboarding.service.ts](<../../apps/api/src/onboarding/onboarding.service.ts>) | Reserves slugs, verifies email capabilities, provisions company/admin records atomically, and tracks retries; latest change gates creation on domain readiness. | Both |
| [apps/api/src/onboarding/onboarding.spec.ts](<../../apps/api/src/onboarding/onboarding.spec.ts>) | Regression tests: Onboarding public boundary. | Both |
| [apps/api/src/onboarding/onboarding.worker.ts](<../../apps/api/src/onboarding/onboarding.worker.ts>) | Polls every ten seconds, expires reservations, runs provisioning, and leases/retries verification and welcome email jobs. | Initial rollout |
| [apps/api/src/onboarding/workspace-domain.service.spec.ts](<../../apps/api/src/onboarding/workspace-domain.service.spec.ts>) | Regression tests: Workspace domain provisioning. | Domain automation |
| [apps/api/src/onboarding/workspace-domain.service.ts](<../../apps/api/src/onboarding/workspace-domain.service.ts>) | Registers/reuses an exact Vercel domain, checks branch/ownership/DNS, and probes HTTPS login before provisioning can finish. | Domain automation |
| [apps/api/src/operations/operations.controller.ts](<../../apps/api/src/operations/operations.controller.ts>) | Exposes platform-only readiness and authorized support file downloads. | Initial rollout |
| [apps/api/src/operations/operations.module.ts](<../../apps/api/src/operations/operations.module.ts>) | Wires tenancy guards and related providers into this NestJS feature module. | Initial rollout |
| [apps/api/src/operations/operations.spec.ts](<../../apps/api/src/operations/operations.spec.ts>) | Regression tests: Operational boundaries. | Initial rollout |
| [apps/api/src/operations/readiness.postgres.spec.ts](<../../apps/api/src/operations/readiness.postgres.spec.ts>) | Regression tests: readiness. PostgreSQL fixtures require an explicitly configured disposable database. | Initial rollout |
| [apps/api/src/operations/readiness.service.ts](<../../apps/api/src/operations/readiness.service.ts>) | Inspects database/runtime role/RLS, storage configuration, migrations, and operational job/onboarding counters. | Initial rollout |
| [apps/api/src/operations/request-logging.ts](<../../apps/api/src/operations/request-logging.ts>) | Logs request identifiers, status and duration without recording request secrets. | Initial rollout |
| [apps/api/src/operations/safe-exception.filter.ts](<../../apps/api/src/operations/safe-exception.filter.ts>) | Returns controlled API errors rather than leaking internal exception details. | Initial rollout |
| [apps/api/src/operations/scheduled-jobs.service.ts](<../../apps/api/src/operations/scheduled-jobs.service.ts>) | Coordinates recurring jobs with database claims, leases, renewal, and completion tracking. | Initial rollout |
| [apps/api/src/organizations/company-organization.controller.ts](<../../apps/api/src/organizations/company-organization.controller.ts>) | Allows authorized company administrators to manage their own organization profile. | Initial rollout |
| [apps/api/src/organizations/dto/organizations.dto.spec.ts](<../../apps/api/src/organizations/dto/organizations.dto.spec.ts>) | Regression tests: CreateOrganizationDto slug. | Initial rollout |
| [apps/api/src/organizations/dto/organizations.dto.ts](<../../apps/api/src/organizations/dto/organizations.dto.ts>) | Validates organization slugs and separates platform/company-editable fields. | Initial rollout |
| [apps/api/src/organizations/organizations.controller.ts](<../../apps/api/src/organizations/organizations.controller.ts>) | Protects organization administration with platform authorization. | Initial rollout |
| [apps/api/src/organizations/organizations.module.ts](<../../apps/api/src/organizations/organizations.module.ts>) | Wires tenancy guards and related providers into this NestJS feature module. | Initial rollout |
| [apps/api/src/organizations/organizations.service.spec.ts](<../../apps/api/src/organizations/organizations.service.spec.ts>) | Regression tests: OrganizationsService.create slug handling. | Initial rollout |
| [apps/api/src/organizations/organizations.service.ts](<../../apps/api/src/organizations/organizations.service.ts>) | Adds reviewed unique slug handling and signup-reservation checks; scopes organization profile/file operations. | Initial rollout |
| [apps/api/src/prisma/prisma.service.ts](<../../apps/api/src/prisma/prisma.service.ts>) | Checks EXPECTED_DATABASE_NAME at startup to catch an incorrectly configured database. | Initial rollout |
| [apps/api/src/prisma/tenant-transaction.ts](<../../apps/api/src/prisma/tenant-transaction.ts>) | Sets transaction-local PostgreSQL company context for row-level-security operations. | Initial rollout |
| [apps/api/src/quotes/quotes.controller.ts](<../../apps/api/src/quotes/quotes.controller.ts>) | Requires trusted company context, authenticated membership, and existing feature/role authorization on business endpoints. | Initial rollout |
| [apps/api/src/quotes/quotes.module.ts](<../../apps/api/src/quotes/quotes.module.ts>) | Wires tenancy guards and related providers into this NestJS feature module. | Initial rollout |
| [apps/api/src/sims/sims.controller.ts](<../../apps/api/src/sims/sims.controller.ts>) | Requires trusted company context, authenticated membership, and existing feature/role authorization on business endpoints. | Initial rollout |
| [apps/api/src/sims/sims.module.ts](<../../apps/api/src/sims/sims.module.ts>) | Wires tenancy guards and related providers into this NestJS feature module. | Initial rollout |
| [apps/api/src/sims/sims.reminder.service.ts](<../../apps/api/src/sims/sims.reminder.service.ts>) | Wraps recurring work in coordinated database job claims to limit duplicate execution across API instances. | Initial rollout |
| [apps/api/src/sims/sims.service.ts](<../../apps/api/src/sims/sims.service.ts>) | Adds company-scoped record/relationship validation to this business service so foreign IDs cannot bypass request-level guards. | Initial rollout |
| [apps/api/src/steel/config/config.controller.ts](<../../apps/api/src/steel/config/config.controller.ts>) | Requires trusted company context, authenticated membership, and existing feature/role authorization on business endpoints. | Initial rollout |
| [apps/api/src/steel/config/config.module.ts](<../../apps/api/src/steel/config/config.module.ts>) | Wires tenancy guards and related providers into this NestJS feature module. | Initial rollout |
| [apps/api/src/steel/dashboard/dashboard.controller.ts](<../../apps/api/src/steel/dashboard/dashboard.controller.ts>) | Requires trusted company context, authenticated membership, and existing feature/role authorization on business endpoints. | Initial rollout |
| [apps/api/src/steel/dashboard/dashboard.module.ts](<../../apps/api/src/steel/dashboard/dashboard.module.ts>) | Wires tenancy guards and related providers into this NestJS feature module. | Initial rollout |
| [apps/api/src/steel/furnace/furnace.controller.ts](<../../apps/api/src/steel/furnace/furnace.controller.ts>) | Requires trusted company context, authenticated membership, and existing feature/role authorization on business endpoints. | Initial rollout |
| [apps/api/src/steel/furnace/furnace.module.ts](<../../apps/api/src/steel/furnace/furnace.module.ts>) | Wires tenancy guards and related providers into this NestJS feature module. | Initial rollout |
| [apps/api/src/steel/master-data/master-data.controller.ts](<../../apps/api/src/steel/master-data/master-data.controller.ts>) | Requires trusted company context, authenticated membership, and existing feature/role authorization on business endpoints. | Initial rollout |
| [apps/api/src/steel/master-data/master-data.module.ts](<../../apps/api/src/steel/master-data/master-data.module.ts>) | Wires tenancy guards and related providers into this NestJS feature module. | Initial rollout |
| [apps/api/src/steel/p01-demand-planning/steel.controller.ts](<../../apps/api/src/steel/p01-demand-planning/steel.controller.ts>) | Requires trusted company context, authenticated membership, and existing feature/role authorization on business endpoints. | Initial rollout |
| [apps/api/src/steel/p01-demand-planning/steel.module.ts](<../../apps/api/src/steel/p01-demand-planning/steel.module.ts>) | Wires tenancy guards and related providers into this NestJS feature module. | Initial rollout |
| [apps/api/src/steel/p02-sourcing/steel-sourcing.controller.ts](<../../apps/api/src/steel/p02-sourcing/steel-sourcing.controller.ts>) | Requires trusted company context, authenticated membership, and existing feature/role authorization on business endpoints. | Initial rollout |
| [apps/api/src/steel/p02-sourcing/steel-sourcing.module.ts](<../../apps/api/src/steel/p02-sourcing/steel-sourcing.module.ts>) | Wires tenancy guards and related providers into this NestJS feature module. | Initial rollout |
| [apps/api/src/steel/p03-material-intake/material-intake.controller.ts](<../../apps/api/src/steel/p03-material-intake/material-intake.controller.ts>) | Requires trusted company context, authenticated membership, and existing feature/role authorization on business endpoints. | Initial rollout |
| [apps/api/src/steel/p03-material-intake/material-intake.module.ts](<../../apps/api/src/steel/p03-material-intake/material-intake.module.ts>) | Wires tenancy guards and related providers into this NestJS feature module. | Initial rollout |
| [apps/api/src/steel/p04-charge-preparation/charge-preparation.controller.ts](<../../apps/api/src/steel/p04-charge-preparation/charge-preparation.controller.ts>) | Requires trusted company context, authenticated membership, and existing feature/role authorization on business endpoints. | Initial rollout |
| [apps/api/src/steel/p04-charge-preparation/charge-preparation.module.ts](<../../apps/api/src/steel/p04-charge-preparation/charge-preparation.module.ts>) | Wires tenancy guards and related providers into this NestJS feature module. | Initial rollout |
| [apps/api/src/steel/p05-melting/melting.controller.ts](<../../apps/api/src/steel/p05-melting/melting.controller.ts>) | Requires trusted company context, authenticated membership, and existing feature/role authorization on business endpoints. | Initial rollout |
| [apps/api/src/steel/p05-melting/melting.module.ts](<../../apps/api/src/steel/p05-melting/melting.module.ts>) | Wires tenancy guards and related providers into this NestJS feature module. | Initial rollout |
| [apps/api/src/steel/p06-heat-approval/heat-approval.controller.ts](<../../apps/api/src/steel/p06-heat-approval/heat-approval.controller.ts>) | Requires trusted company context, authenticated membership, and existing feature/role authorization on business endpoints. | Initial rollout |
| [apps/api/src/steel/p06-heat-approval/heat-approval.module.ts](<../../apps/api/src/steel/p06-heat-approval/heat-approval.module.ts>) | Wires tenancy guards and related providers into this NestJS feature module. | Initial rollout |
| [apps/api/src/steel/traceability/traceability.controller.ts](<../../apps/api/src/steel/traceability/traceability.controller.ts>) | Requires trusted company context, authenticated membership, and existing feature/role authorization on business endpoints. | Initial rollout |
| [apps/api/src/steel/traceability/traceability.module.ts](<../../apps/api/src/steel/traceability/traceability.module.ts>) | Wires tenancy guards and related providers into this NestJS feature module. | Initial rollout |
| [apps/api/src/tenancy/business-routes.integration.spec.ts](<../../apps/api/src/tenancy/business-routes.integration.spec.ts>) | Regression tests: Business route tenant coverage; Business HTTP tenant boundary. | Initial rollout |
| [apps/api/src/tenancy/business-services.isolation.spec.ts](<../../apps/api/src/tenancy/business-services.isolation.spec.ts>) | Regression tests: Business service tenant references. | Initial rollout |
| [apps/api/src/tenancy/platform-admin.guard.spec.ts](<../../apps/api/src/tenancy/platform-admin.guard.spec.ts>) | Regression tests: PlatformAdminGuard. | Initial rollout |
| [apps/api/src/tenancy/platform-admin.guard.ts](<../../apps/api/src/tenancy/platform-admin.guard.ts>) | Restricts platform operations using current privileged membership. | Initial rollout |
| [apps/api/src/tenancy/tenancy.module.ts](<../../apps/api/src/tenancy/tenancy.module.ts>) | Wires tenancy guards and related providers into this NestJS feature module. | Initial rollout |
| [apps/api/src/tenancy/tenant-context.ts](<../../apps/api/src/tenancy/tenant-context.ts>) | Defines the resolved company context and request types used by guards/controllers. | Initial rollout |
| [apps/api/src/tenancy/tenant-hostname.spec.ts](<../../apps/api/src/tenancy/tenant-hostname.spec.ts>) | Regression tests: parseTenantHostname. | Initial rollout |
| [apps/api/src/tenancy/tenant-hostname.ts](<../../apps/api/src/tenancy/tenant-hostname.ts>) | Parses and validates the complete hostname against the configured company base domain. | Initial rollout |
| [apps/api/src/tenancy/tenant-resolver.service.spec.ts](<../../apps/api/src/tenancy/tenant-resolver.service.spec.ts>) | Regression tests: TenantResolverService; TenancyModule wiring and initialization. | Initial rollout |
| [apps/api/src/tenancy/tenant-resolver.service.ts](<../../apps/api/src/tenancy/tenant-resolver.service.ts>) | Looks up the company by slug and rejects unknown or inactive organizations. | Initial rollout |
| [apps/api/src/tenancy/tenant-route.decorator.ts](<../../apps/api/src/tenancy/tenant-route.decorator.ts>) | Marks API routes that require company context. | Initial rollout |
| [apps/api/src/tenancy/tenant.guard.spec.ts](<../../apps/api/src/tenancy/tenant.guard.spec.ts>) | Regression tests: TenantGuard. | Initial rollout |
| [apps/api/src/tenancy/tenant.guard.ts](<../../apps/api/src/tenancy/tenant.guard.ts>) | Checks token/company agreement, current membership and company status, and ownership of managed file references. | Initial rollout |
| [apps/api/src/tenancy/trusted-tenant-context.guard.spec.ts](<../../apps/api/src/tenancy/trusted-tenant-context.guard.spec.ts>) | Regression tests: TrustedTenantContextGuard. | Initial rollout |
| [apps/api/src/tenancy/trusted-tenant-context.guard.ts](<../../apps/api/src/tenancy/trusted-tenant-context.guard.ts>) | Authenticates the forwarding proxy before trusting the company hostname header. | Initial rollout |
| [apps/api/src/tickets/tickets.controller.ts](<../../apps/api/src/tickets/tickets.controller.ts>) | Requires trusted company context, authenticated membership, and existing feature/role authorization on business endpoints. | Initial rollout |
| [apps/api/src/tickets/tickets.module.ts](<../../apps/api/src/tickets/tickets.module.ts>) | Wires tenancy guards and related providers into this NestJS feature module. | Initial rollout |
| [apps/api/src/tickets/tickets.service.ts](<../../apps/api/src/tickets/tickets.service.ts>) | Adds company-scoped record/relationship validation to this business service so foreign IDs cannot bypass request-level guards. | Initial rollout |
| [apps/api/src/uploads/upload-key.spec.ts](<../../apps/api/src/uploads/upload-key.spec.ts>) | Regression tests: Company upload keys. | Initial rollout |
| [apps/api/src/uploads/upload-key.ts](<../../apps/api/src/uploads/upload-key.ts>) | Builds company-prefixed random object keys and validates folders/filenames. | Initial rollout |
| [apps/api/src/uploads/upload-policy.spec.ts](<../../apps/api/src/uploads/upload-policy.spec.ts>) | Regression tests: Managed file references. | Initial rollout |
| [apps/api/src/uploads/upload-policy.ts](<../../apps/api/src/uploads/upload-policy.ts>) | Validates upload policy and extracts managed file IDs from nested request data. | Initial rollout |
| [apps/api/src/uploads/upload-signature.spec.ts](<../../apps/api/src/uploads/upload-signature.spec.ts>) | Regression tests: Real S3 presigner contract. | Initial rollout |
| [apps/api/src/uploads/uploads.controller.spec.ts](<../../apps/api/src/uploads/uploads.controller.spec.ts>) | Regression tests: Upload controller context. | Initial rollout |
| [apps/api/src/uploads/uploads.controller.ts](<../../apps/api/src/uploads/uploads.controller.ts>) | Adds guarded upload/completion/download endpoints with private-response headers. | Initial rollout |
| [apps/api/src/uploads/uploads.module.ts](<../../apps/api/src/uploads/uploads.module.ts>) | Wires tenancy guards and related providers into this NestJS feature module. | Initial rollout |
| [apps/api/src/uploads/uploads.service.spec.ts](<../../apps/api/src/uploads/uploads.service.spec.ts>) | Regression tests: Private tenant files. | Initial rollout |
| [apps/api/src/uploads/uploads.service.ts](<../../apps/api/src/uploads/uploads.service.ts>) | Issues private uploads, verifies completion, persists company-owned metadata, and serves authorized downloads. | Initial rollout |
| [apps/web/README.md](<../../apps/web/README.md>) | Documents same-origin proxy, company host configuration, cookies, and frontend testing. | Initial rollout |
| [apps/web/app/(auth)/signup/page.tsx](<../../apps/web/app/(auth)/signup/page.tsx>) | Collects company/contact details and reserves a slug using a retry-safe request key. | Initial rollout |
| [apps/web/app/(auth)/signup/verify/page.tsx](<../../apps/web/app/(auth)/signup/verify/page.tsx>) | Consumes the email link, accepts the password, polls progress, exposes retry, and links to the ready workspace. | Initial rollout |
| [apps/web/app/(dashboard)/department/page.tsx](<../../apps/web/app/(dashboard)/department/page.tsx>) | Adapts this UI to company-aware API/session handling and/or authenticated private images and attachments; see the tenancy commit diff for its exact substitutions. | Initial rollout |
| [apps/web/app/admin/layout.tsx](<../../apps/web/app/admin/layout.tsx>) | Restricts platform administration UI to the appropriate platform context. | Initial rollout |
| [apps/web/app/admin/organizations/[id]/page.tsx](<../../apps/web/app/admin/organizations/[id]/page.tsx>) | Updates platform company administration for slugs, workspace URLs, and private branding images. | Initial rollout |
| [apps/web/app/admin/organizations/page.tsx](<../../apps/web/app/admin/organizations/page.tsx>) | Updates platform company administration for slugs, workspace URLs, and private branding images. | Initial rollout |
| [apps/web/app/admin/page.tsx](<../../apps/web/app/admin/page.tsx>) | Adapts this UI to company-aware API/session handling and/or authenticated private images and attachments; see the tenancy commit diff for its exact substitutions. | Initial rollout |
| [apps/web/app/admin/readiness/page.tsx](<../../apps/web/app/admin/readiness/page.tsx>) | Platform administrator UI for operational readiness results. | Initial rollout |
| [apps/web/app/api/[...path]/route.ts](<../../apps/web/app/api/[...path]/route.ts>) | Next.js route handler connecting browser /api requests to the server-only proxy. | Initial rollout |
| [apps/web/app/calendar/page.tsx](<../../apps/web/app/calendar/page.tsx>) | Adapts this UI to company-aware API/session handling and/or authenticated private images and attachments; see the tenancy commit diff for its exact substitutions. | Initial rollout |
| [apps/web/app/dwms/tasks/[instanceId]/page.tsx](<../../apps/web/app/dwms/tasks/[instanceId]/page.tsx>) | Adapts this UI to company-aware API/session handling and/or authenticated private images and attachments; see the tenancy commit diff for its exact substitutions. | Initial rollout |
| [apps/web/app/ems/employees/[id]/page.tsx](<../../apps/web/app/ems/employees/[id]/page.tsx>) | Adapts this UI to company-aware API/session handling and/or authenticated private images and attachments; see the tenancy commit diff for its exact substitutions. | Initial rollout |
| [apps/web/app/hr/page.tsx](<../../apps/web/app/hr/page.tsx>) | Adapts this UI to company-aware API/session handling and/or authenticated private images and attachments; see the tenancy commit diff for its exact substitutions. | Initial rollout |
| [apps/web/app/layout.tsx](<../../apps/web/app/layout.tsx>) | Wires session lifecycle providers into the frontend. | Initial rollout |
| [apps/web/app/leave/employees/[id]/page.tsx](<../../apps/web/app/leave/employees/[id]/page.tsx>) | Adapts this UI to company-aware API/session handling and/or authenticated private images and attachments; see the tenancy commit diff for its exact substitutions. | Initial rollout |
| [apps/web/app/leave/employees/page.tsx](<../../apps/web/app/leave/employees/page.tsx>) | Adapts this UI to company-aware API/session handling and/or authenticated private images and attachments; see the tenancy commit diff for its exact substitutions. | Initial rollout |
| [apps/web/app/operations/employees/me/page.tsx](<../../apps/web/app/operations/employees/me/page.tsx>) | Adapts this UI to company-aware API/session handling and/or authenticated private images and attachments; see the tenancy commit diff for its exact substitutions. | Initial rollout |
| [apps/web/app/settings/page.tsx](<../../apps/web/app/settings/page.tsx>) | Adapts this UI to company-aware API/session handling and/or authenticated private images and attachments; see the tenancy commit diff for its exact substitutions. | Initial rollout |
| [apps/web/app/settings/tickets/page.tsx](<../../apps/web/app/settings/tickets/page.tsx>) | Adapts this UI to company-aware API/session handling and/or authenticated private images and attachments; see the tenancy commit diff for its exact substitutions. | Initial rollout |
| [apps/web/app/sims/[id]/page.tsx](<../../apps/web/app/sims/[id]/page.tsx>) | Adapts this UI to company-aware API/session handling and/or authenticated private images and attachments; see the tenancy commit diff for its exact substitutions. | Initial rollout |
| [apps/web/app/sims/new/page.tsx](<../../apps/web/app/sims/new/page.tsx>) | Adapts this UI to company-aware API/session handling and/or authenticated private images and attachments; see the tenancy commit diff for its exact substitutions. | Initial rollout |
| [apps/web/app/tickets/[id]/page.tsx](<../../apps/web/app/tickets/[id]/page.tsx>) | Adapts this UI to company-aware API/session handling and/or authenticated private images and attachments; see the tenancy commit diff for its exact substitutions. | Initial rollout |
| [apps/web/components/DashboardHero.tsx](<../../apps/web/components/DashboardHero.tsx>) | Adapts this UI to company-aware API/session handling and/or authenticated private images and attachments; see the tenancy commit diff for its exact substitutions. | Initial rollout |
| [apps/web/components/Sidebar.tsx](<../../apps/web/components/Sidebar.tsx>) | Adjusts workspace/platform navigation for company-aware sessions. | Initial rollout |
| [apps/web/components/auth/IdentifierStep.tsx](<../../apps/web/components/auth/IdentifierStep.tsx>) | Directs unverified account setup to verified recovery instead of identifier-only password creation. | Initial rollout |
| [apps/web/components/auth/LoginStep.tsx](<../../apps/web/components/auth/LoginStep.tsx>) | Handles company-aware login results and workspace navigation. | Initial rollout |
| [apps/web/components/auth/OrgPickerStep.tsx](<../../apps/web/components/auth/OrgPickerStep.tsx>) | Uses organization workspace URLs when selecting a company. | Initial rollout |
| [apps/web/components/auth/ProtectedRoute.tsx](<../../apps/web/components/auth/ProtectedRoute.tsx>) | Waits for session restoration and enforces authenticated page access. | Initial rollout |
| [apps/web/components/auth/SetupStep.tsx](<../../apps/web/components/auth/SetupStep.tsx>) | Updates setup navigation for the verified/company-aware authentication flow. | Initial rollout |
| [apps/web/components/files/TenantFileLink.tsx](<../../apps/web/components/files/TenantFileLink.tsx>) | Fetches private attachments with authentication for authorized download. | Initial rollout |
| [apps/web/components/files/TenantImage.tsx](<../../apps/web/components/files/TenantImage.tsx>) | Loads private images through authenticated file requests. | Initial rollout |
| [apps/web/components/kaizen/kaizen-ui.tsx](<../../apps/web/components/kaizen/kaizen-ui.tsx>) | Adapts this UI to company-aware API/session handling and/or authenticated private images and attachments; see the tenancy commit diff for its exact substitutions. | Initial rollout |
| [apps/web/components/kaizen/sections/03-Condition.tsx](<../../apps/web/components/kaizen/sections/03-Condition.tsx>) | Adapts this UI to company-aware API/session handling and/or authenticated private images and attachments; see the tenancy commit diff for its exact substitutions. | Initial rollout |
| [apps/web/components/kaizen/sections/09-Implementation.tsx](<../../apps/web/components/kaizen/sections/09-Implementation.tsx>) | Adapts this UI to company-aware API/session handling and/or authenticated private images and attachments; see the tenancy commit diff for its exact substitutions. | Initial rollout |
| [apps/web/components/profile/IdentityCard.tsx](<../../apps/web/components/profile/IdentityCard.tsx>) | Adapts this UI to company-aware API/session handling and/or authenticated private images and attachments; see the tenancy commit diff for its exact substitutions. | Initial rollout |
| [apps/web/components/steel/p02/AttachmentPanel.tsx](<../../apps/web/components/steel/p02/AttachmentPanel.tsx>) | Adapts this UI to company-aware API/session handling and/or authenticated private images and attachments; see the tenancy commit diff for its exact substitutions. | Initial rollout |
| [apps/web/contexts/QueryProvider.tsx](<../../apps/web/contexts/QueryProvider.tsx>) | Coordinates application query caching with the session lifecycle. | Initial rollout |
| [apps/web/contexts/SessionProvider.tsx](<../../apps/web/contexts/SessionProvider.tsx>) | Bootstraps browser authentication and handles same-origin logout notifications. | Initial rollout |
| [apps/web/lib/api-client.ts](<../../apps/web/lib/api-client.ts>) | Restricts authenticated requests to /api on the current origin and retries once after token refresh. | Initial rollout |
| [apps/web/lib/server/api-proxy.mjs](<../../apps/web/lib/server/api-proxy.mjs>) | Validates browser host/origin/path, maps company routes, forwards trusted tenant headers, and controls cookies/caching. | Initial rollout |
| [apps/web/lib/session.ts](<../../apps/web/lib/session.ts>) | Restores sessions and coordinates refresh/logout within an origin, including tabs. | Initial rollout |
| [apps/web/next.config.ts](<../../apps/web/next.config.ts>) | Supports local company hosts and prevents service-worker caching of /api responses (later DWMS changes are separate). | Initial rollout |
| [apps/web/package.json](<../../apps/web/package.json>) | Adds commands for proxy and session regression testing. | Initial rollout |
| [apps/web/services/admin.service.ts](<../../apps/web/services/admin.service.ts>) | Includes company slugs/profile data and platform administration calls through /api. | Initial rollout |
| [apps/web/services/auth.service.ts](<../../apps/web/services/auth.service.ts>) | Uses same-origin authentication/session helpers and the company profile endpoint. | Initial rollout |
| [apps/web/services/calendar.service.ts](<../../apps/web/services/calendar.service.ts>) | Routes this feature’s API requests through the current company origin (/api) and shared authentication handling. | Initial rollout |
| [apps/web/services/chat.service.ts](<../../apps/web/services/chat.service.ts>) | Routes this feature’s API requests through the current company origin (/api) and shared authentication handling. | Initial rollout |
| [apps/web/services/committee.service.ts](<../../apps/web/services/committee.service.ts>) | Routes this feature’s API requests through the current company origin (/api) and shared authentication handling. | Initial rollout |
| [apps/web/services/departments.service.ts](<../../apps/web/services/departments.service.ts>) | Routes this feature’s API requests through the current company origin (/api) and shared authentication handling. | Initial rollout |
| [apps/web/services/dwms.service.ts](<../../apps/web/services/dwms.service.ts>) | Routes this feature’s API requests through the current company origin (/api) and shared authentication handling. | Initial rollout |
| [apps/web/services/employee.service.ts](<../../apps/web/services/employee.service.ts>) | Routes this feature’s API requests through the current company origin (/api) and shared authentication handling. | Initial rollout |
| [apps/web/services/ems.service.ts](<../../apps/web/services/ems.service.ts>) | Routes this feature’s API requests through the current company origin (/api) and shared authentication handling. | Initial rollout |
| [apps/web/services/kaizen.service.ts](<../../apps/web/services/kaizen.service.ts>) | Routes this feature’s API requests through the current company origin (/api) and shared authentication handling. | Initial rollout |
| [apps/web/services/leave.service.ts](<../../apps/web/services/leave.service.ts>) | Routes this feature’s API requests through the current company origin (/api) and shared authentication handling. | Initial rollout |
| [apps/web/services/material-intake.service.ts](<../../apps/web/services/material-intake.service.ts>) | Routes this feature’s API requests through the current company origin (/api) and shared authentication handling. | Initial rollout |
| [apps/web/services/notice.service.ts](<../../apps/web/services/notice.service.ts>) | Routes this feature’s API requests through the current company origin (/api) and shared authentication handling. | Initial rollout |
| [apps/web/services/notifications.service.ts](<../../apps/web/services/notifications.service.ts>) | Routes this feature’s API requests through the current company origin (/api) and shared authentication handling. | Initial rollout |
| [apps/web/services/sims.service.ts](<../../apps/web/services/sims.service.ts>) | Routes this feature’s API requests through the current company origin (/api) and shared authentication handling. | Initial rollout |
| [apps/web/services/steel-charge-preparation.service.ts](<../../apps/web/services/steel-charge-preparation.service.ts>) | Routes this feature’s API requests through the current company origin (/api) and shared authentication handling. | Initial rollout |
| [apps/web/services/steel-config.service.ts](<../../apps/web/services/steel-config.service.ts>) | Routes this feature’s API requests through the current company origin (/api) and shared authentication handling. | Initial rollout |
| [apps/web/services/steel-dashboard.service.ts](<../../apps/web/services/steel-dashboard.service.ts>) | Routes this feature’s API requests through the current company origin (/api) and shared authentication handling. | Initial rollout |
| [apps/web/services/steel-furnace.service.ts](<../../apps/web/services/steel-furnace.service.ts>) | Routes this feature’s API requests through the current company origin (/api) and shared authentication handling. | Initial rollout |
| [apps/web/services/steel-heat-approval.service.ts](<../../apps/web/services/steel-heat-approval.service.ts>) | Routes this feature’s API requests through the current company origin (/api) and shared authentication handling. | Initial rollout |
| [apps/web/services/steel-master-data.service.ts](<../../apps/web/services/steel-master-data.service.ts>) | Routes this feature’s API requests through the current company origin (/api) and shared authentication handling. | Initial rollout |
| [apps/web/services/steel-melting.service.ts](<../../apps/web/services/steel-melting.service.ts>) | Routes this feature’s API requests through the current company origin (/api) and shared authentication handling. | Initial rollout |
| [apps/web/services/steel-sourcing.service.ts](<../../apps/web/services/steel-sourcing.service.ts>) | Routes this feature’s API requests through the current company origin (/api) and shared authentication handling. | Initial rollout |
| [apps/web/services/steel.service.ts](<../../apps/web/services/steel.service.ts>) | Routes this feature’s API requests through the current company origin (/api) and shared authentication handling. | Initial rollout |
| [apps/web/services/tickets.service.ts](<../../apps/web/services/tickets.service.ts>) | Routes this feature’s API requests through the current company origin (/api) and shared authentication handling. | Initial rollout |
| [apps/web/services/uploads.service.ts](<../../apps/web/services/uploads.service.ts>) | Uses private upload initiation/completion and authenticated file retrieval. | Initial rollout |
| [apps/web/store/auth.store.ts](<../../apps/web/store/auth.store.ts>) | Keeps authentication state in memory rather than persisting bearer tokens in browser storage. | Initial rollout |
| [apps/web/tests/api-proxy.test.mjs](<../../apps/web/tests/api-proxy.test.mjs>) | Regression tests: api proxy. | Initial rollout |
| [apps/web/tests/proxy-route.integration.mjs](<../../apps/web/tests/proxy-route.integration.mjs>) | Regression tests: proxy route. | Initial rollout |
| [apps/web/tests/session.test.ts](<../../apps/web/tests/session.test.ts>) | Regression tests: session. | Initial rollout |
| [infra/staging/README.md](<../staging/README.md>) | Runbook for staging deployment, private storage, manual acceptance, rollback, and outstanding production gates. | Initial rollout |
| [infra/staging/check-env.mjs](<../staging/check-env.mjs>) | Validates staging configuration shape without printing secrets. | Initial rollout |
| [infra/staging/check-env.test.mjs](<../staging/check-env.test.mjs>) | Regression tests: check env. | Initial rollout |
| [infra/staging/database-audit.sql](<../staging/database-audit.sql>) | Audits runtime role privileges and database row-level-security configuration. | Initial rollout |
| [infra/staging/private-bucket-cors.json](<../staging/private-bucket-cors.json>) | Template for permitted browser upload origins, methods, and headers. | Initial rollout |
| [infra/staging/private-bucket-public-access-block.json](<../staging/private-bucket-public-access-block.json>) | Template blocking public access to the private upload bucket. | Initial rollout |
| [infra/staging/private-bucket-runtime-policy.json](<../staging/private-bucket-runtime-policy.json>) | Template for the application IAM identity to access and inspect the private bucket. | Initial rollout |
| [infra/staging/runtime-role.sql](<../staging/runtime-role.sql>) | Defines runtime privileges separately from the schema/migration owner. | Initial rollout |
| [packages/db/prisma/migrations/20260914000000_add_organization_slug/migration.sql](<../../packages/db/prisma/migrations/20260914000000_add_organization_slug/migration.sql>) | Adds nullable organization slug and a unique index while legacy slugs are reviewed. | Initial rollout |
| [packages/db/prisma/migrations/20260916000000_add_verified_onboarding/migration.sql](<../../packages/db/prisma/migrations/20260916000000_add_verified_onboarding/migration.sql>) | Creates persistent onboarding request and email-outbox tables. | Initial rollout |
| [packages/db/prisma/migrations/20260917000000_add_private_files_and_job_runs/migration.sql](<../../packages/db/prisma/migrations/20260917000000_add_private_files_and_job_runs/migration.sql>) | Creates private FileAsset metadata with forced RLS, and scheduled job coordination records. | Initial rollout |
| [packages/db/prisma/schema.prisma](<../../packages/db/prisma/schema.prisma>) | Adds organization slug, onboarding/outbox state, private file metadata, and scheduled-job models; later feature edits also exist. | Initial rollout |
| [packages/db/rollouts/organization-slug/README.md](<../../packages/db/rollouts/organization-slug/README.md>) | Documents review, backfill, and later enforcement of organization slugs. | Initial rollout |
| [packages/db/rollouts/organization-slug/require-organization-slug.sql](<../../packages/db/rollouts/organization-slug/require-organization-slug.sql>) | Staged SQL to require slugs only after reviewed backfill; not automatically deployed by the initial slug migration. | Initial rollout |
| [packages/db/scripts/backfill-organization-slugs.ts](<../../packages/db/scripts/backfill-organization-slugs.ts>) | CLI for reviewing and applying slug assignments to existing organizations. | Initial rollout |
| [packages/db/scripts/lib/organization-slug-backfill.test.ts](<../../packages/db/scripts/lib/organization-slug-backfill.test.ts>) | Regression tests: organization slug backfill. | Initial rollout |
| [packages/db/scripts/lib/organization-slug-backfill.ts](<../../packages/db/scripts/lib/organization-slug-backfill.ts>) | Implements deterministic slug candidate generation and reviewed backfill handling. | Initial rollout |

## Reproduce the inventory

```bash
git show --format= --name-only 94f39a5
git show --format= --name-only 61e7b5e
git show 94f39a5 -- path/to/file
git show 61e7b5e -- path/to/file
```

Later commits may change these files. Use this history to understand the rollout,
then inspect current source when making an implementation change. Generated Prisma
client artifacts and cloud-console configuration are not a substitute for the
handwritten migration and deployment records.
