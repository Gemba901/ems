import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getOrganizationSlugError } from '../common/utils/organization-slug';

// Only these locally generated diagnostics may be logged; never log provider bodies.
export class WorkspaceDomainError extends Error {}

type ProjectDomain = {
  name: string;
  verified: boolean;
  gitBranch?: string | null;
  customEnvironmentId?: string | null;
  redirect?: string | null;
};

@Injectable()
export class WorkspaceDomainService {
  constructor(private readonly config: ConfigService) {}

  private enabled() {
    return this.config.get('ONBOARDING_VERCEL_DOMAINS_ENABLED') === 'true';
  }

  onModuleInit() {
    if (this.enabled()) this.settings();
  }

  private settings() {
    const required = (key: string) => {
      const value = this.config.get<string>(key)?.trim();
      if (!value) throw new WorkspaceDomainError(`Missing ${key}`);
      return value;
    };
    const token = required('VERCEL_TOKEN');
    const project = required('VERCEL_PROJECT_ID');
    const team = required('VERCEL_TEAM_ID');
    const environment = required('VERCEL_DOMAIN_ENVIRONMENT');
    if (!['preview', 'production'].includes(environment))
      throw new WorkspaceDomainError('Invalid VERCEL_DOMAIN_ENVIRONMENT');
    const branch =
      environment === 'preview' ? required('VERCEL_DOMAIN_GIT_BRANCH') : null;
    const base = required('TENANT_BASE_DOMAIN');
    if (
      base.length > 212 ||
      !base.includes('.') ||
      !base
        .split('.')
        .every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
    )
      throw new WorkspaceDomainError('Invalid TENANT_BASE_DOMAIN');
    const origin = new URL(required('ONBOARDING_ORIGIN'));
    if (origin.protocol !== 'https:' || origin.port)
      throw new WorkspaceDomainError(
        'Vercel domains require an HTTPS onboarding origin',
      );
    return { token, project, team, branch, base };
  }

  async ensureReady(
    slug: string,
    reportStage?: (
      stage: 'REGISTERING_DOMAIN' | 'CHECKING_HTTPS',
    ) => Promise<void>,
  ): Promise<void> {
    if (!this.enabled()) return;
    if (getOrganizationSlugError(slug))
      throw new WorkspaceDomainError('Invalid workspace slug');
    const settings = this.settings();
    const hostname = `${slug}.${settings.base}`;
    const project = encodeURIComponent(settings.project);
    const domainPath = `/v9/projects/${project}/domains/${hostname}`;

    const api = async (path: string, method = 'GET', body?: object) => {
      const url = new URL(path, 'https://api.vercel.com');
      url.searchParams.set('teamId', settings.team);
      try {
        return await fetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${settings.token}`,
            'Content-Type': 'application/json',
          },
          body: body ? JSON.stringify(body) : undefined,
          redirect: 'error',
          signal: AbortSignal.timeout(8_000),
        });
      } catch {
        throw new WorkspaceDomainError('Vercel API connection failed');
      }
    };
    const read = async <T>(response: Response): Promise<T> => {
      if (!response.ok) {
        await response.body?.cancel();
        throw new WorkspaceDomainError(`Vercel API HTTP ${response.status}`);
      }
      try {
        return (await response.json()) as T;
      } catch {
        throw new WorkspaceDomainError('Invalid Vercel API response');
      }
    };

    await reportStage?.('REGISTERING_DOMAIN');
    let response = await api(domainPath);
    if (response.status === 404) {
      await response.body?.cancel();
      const added = await api(`/v10/projects/${project}/domains`, 'POST', {
        name: hostname,
        ...(settings.branch ? { gitBranch: settings.branch } : {}),
      });
      // A concurrent worker or a lost POST response can leave the domain registered.
      // A 400/409 is only acceptable if a fresh GET proves the expected assignment.
      if (!added.ok && ![400, 409].includes(added.status)) await read(added);
      await added.body?.cancel();
      response = await api(domainPath);
    }
    let domain = await read<ProjectDomain>(response);
    const checkAssignment = () => {
      if (
        domain.name !== hostname ||
        domain.redirect ||
        domain.customEnvironmentId ||
        (domain.gitBranch ?? null) !== settings.branch
      )
        throw new WorkspaceDomainError('Vercel domain assignment mismatch');
    };
    checkAssignment();
    if (domain.verified !== true) {
      domain = await read<ProjectDomain>(
        await api(`${domainPath}/verify`, 'POST'),
      );
      checkAssignment();
      if (domain.verified !== true)
        throw new WorkspaceDomainError(
          'Vercel domain ownership verification pending',
        );
    }
    const dns = await read<{ misconfigured: boolean }>(
      await api(`/v6/domains/${hostname}/config`),
    );
    if (dns.misconfigured !== false)
      throw new WorkspaceDomainError('Vercel domain DNS configuration pending');

    await reportStage?.('CHECKING_HTTPS');
    // A verified domain alone does not prove that its certificate has been issued.
    // Use normal TLS validation, no credentials, and never follow redirects.
    try {
      const page = await fetch(`https://${hostname}/login`, {
        redirect: 'manual',
        signal: AbortSignal.timeout(8_000),
      });
      const ready =
        page.status === 200 &&
        page.headers.get('content-type')?.includes('text/html');
      await page.body?.cancel();
      if (!ready) throw new Error();
    } catch {
      throw new WorkspaceDomainError('Workspace HTTPS login page not ready');
    }
  }
}
