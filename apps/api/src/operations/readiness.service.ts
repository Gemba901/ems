import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { getOrganizationSlugError } from '../common/utils/organization-slug';
@Injectable()
export class ReadinessService {
  constructor(
    private readonly db: PrismaService,
    private readonly config: ConfigService,
    private readonly uploads: UploadsService,
  ) {}
  async inspect() {
    const blockers: string[] = [];
    const productionBlockers: string[] = [];
    let database: unknown = null;
    let jobs: unknown = null;
    try {
      const [identity] = await this.db.$queryRaw<
        { database: string; superuser: boolean; bypassRls: boolean }[]
      >`
        SELECT current_database() AS database, rolsuper AS superuser, rolbypassrls AS "bypassRls" FROM pg_roles WHERE rolname = current_user`;
      const policies = await this.db.$queryRaw<
        {
          table: string;
          rls: boolean;
          forced: boolean;
          owner: boolean;
          policies: number;
        }[]
      >`
        SELECT c.relname AS "table", c.relrowsecurity AS rls, c.relforcerowsecurity AS forced,
          c.relowner = (SELECT oid FROM pg_roles WHERE rolname = current_user) AS owner,
          (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid=c.oid) AS policies
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relkind='r' AND EXISTS (
          SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='organizationId' AND NOT a.attisdropped)
        ORDER BY c.relname`;
      const organizations = await this.db.organization.findMany({
        select: { slug: true, status: true },
      });
      const missingSlugs = organizations.filter(
        (org) =>
          org.status === 'ACTIVE' &&
          (!org.slug || getOrganizationSlugError(org.slug)),
      ).length;
      if (missingSlugs)
        blockers.push('Active companies require reviewed valid slugs');
      const expected = this.config.get<string>('EXPECTED_DATABASE_NAME');
      if (!expected || identity.database !== expected)
        blockers.push('Confirm EXPECTED_DATABASE_NAME matches this database');
      if (identity.superuser || identity.bypassRls)
        blockers.push(
          'Runtime database role bypasses RLS; use a non-bypass runtime login',
        );
      if (policies.some((row) => row.owner && !row.forced))
        productionBlockers.push(
          'Runtime role owns tenant tables without forced RLS',
        );
      if (policies.some((row) => !row.rls || !row.policies))
        productionBlockers.push(
          'Business-table RLS rollout remains incomplete',
        );
      const files = policies.find((row) => row.table === 'FileAsset');
      if (!files?.rls || !files.forced || !files.policies)
        blockers.push('Private-file RLS migration is missing');
      database = {
        ...identity,
        missingSlugs,
        directTenantTablePolicies: policies,
      };
      const failedProvisioning = await this.db.onboardingRequest.count({
        where: { status: 'FAILED' },
      });
      const failedEmail = await this.db.onboardingMessage.count({
        where: {
          failedAt: { not: null },
          sentAt: null,
          request: { status: { not: 'EXPIRED' } },
        },
      });
      const overdueProvisioning = await this.db.onboardingRequest.count({
        where: {
          status: 'PROVISIONING',
          nextAttemptAt: { lt: new Date(Date.now() - 300_000) },
        },
      });
      const scheduled = await this.db.scheduledJobRun.findMany({
        select: {
          key: true,
          window: true,
          attempts: true,
          failedAt: true,
          completedAt: true,
          leaseUntil: true,
        },
      });
      jobs = {
        failedProvisioning,
        failedEmail,
        overdueProvisioning,
        scheduled,
      };
      if (overdueProvisioning)
        blockers.push('Onboarding worker has overdue work');
      if (failedProvisioning || failedEmail)
        blockers.push(
          'Resolve failed onboarding or email jobs before acceptance',
        );
      if (scheduled.some((job) => job.failedAt && !job.completedAt))
        blockers.push('Resolve failed scheduled jobs before acceptance');
    } catch {
      blockers.push(
        'Database readiness inspection failed: verify connectivity and migrations',
      );
    }
    const storage = await this.uploads.storageReadiness();
    if (!storage.checked || !storage.private)
      blockers.push(
        'Private S3 bucket checks failed; verify policy and inspection permissions',
      );
    const signupEnabled = this.config.get('ONBOARDING_ENABLED') === 'true';
    const workerEnabled =
      this.config.get('ONBOARDING_WORKER_ENABLED') === 'true';
    if (signupEnabled && !workerEnabled)
      blockers.push('Signup is enabled but the onboarding worker is disabled');
    return {
      readyForManualTests: blockers.length === 0,
      blockers,
      productionBlockers,
      configuration: {
        signupEnabled,
        workerEnabled,
        businessJobsEnabled:
          this.config.get('BUSINESS_JOBS_ENABLED') === 'true',
        environment: this.config.get('DEPLOYMENT_ENV') ?? 'unset',
      },
      database,
      storage,
      jobs,
      manualChecks: [
        'SES delivery and verification link',
        'Two real company hosts, refresh and logout',
        'Cross-company file and record rejection',
        'Legacy public-file inventory and migration',
        'Staging DNS/TLS and storage CORS',
        'Database backup and restore rehearsal',
      ],
    };
  }
}
