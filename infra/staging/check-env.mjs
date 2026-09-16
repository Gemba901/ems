// Run separately with the API and web environment loaded. Never prints secret values.
import { pathToFileURL } from 'node:url';
export function inspectEnvironment(env, component) {
  const problems = [];
  const requireValue = key => { if (!env[key]?.trim()) problems.push(`${key} is required`); };
  for (const key of ['TENANT_BASE_DOMAIN', 'TENANT_PROXY_SECRET']) requireValue(key);
  if (env.TENANT_PROXY_SECRET && (env.TENANT_PROXY_SECRET.length < 64 || /\s/.test(env.TENANT_PROXY_SECRET))) problems.push('TENANT_PROXY_SECRET must be at least 64 characters without whitespace');
  if (env.TENANT_BASE_DOMAIN && !/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(env.TENANT_BASE_DOMAIN)) problems.push('TENANT_BASE_DOMAIN must be a lowercase hostname without scheme or port');
  const origin = key => {
    requireValue(key);
    try { const url = new URL(env[key]); if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw Error(); return url; }
    catch { problems.push(`${key} must be a credential-free HTTPS URL`); }
  };
  if (component === 'web') {
    origin('API_INTERNAL_URL'); requireValue('TENANT_PLATFORM_HOSTS'); requireValue('TENANT_PLATFORM_SLUG');
  } else if (component === 'api') {
    for (const key of ['DATABASE_URL', 'EXPECTED_DATABASE_NAME', 'AWS_REGION', 'AWS_PRIVATE_UPLOAD_BUCKET', 'SES_FROM_EMAIL']) requireValue(key);
    if (env.DEPLOYMENT_ENV !== 'staging') problems.push('DEPLOYMENT_ENV must be staging for this check');
    try { if (decodeURIComponent(new URL(env.DATABASE_URL).pathname.slice(1)) !== env.EXPECTED_DATABASE_NAME) problems.push('DATABASE_URL targets a different database than EXPECTED_DATABASE_NAME'); } catch { problems.push('DATABASE_URL is invalid'); }
    if (env.ONBOARDING_ENABLED === 'true' || env.ONBOARDING_WORKER_ENABLED === 'true') {
      const url = origin('ONBOARDING_ORIGIN');
      if (url && url.pathname !== '/') problems.push('ONBOARDING_ORIGIN must not contain a path');
      requireValue('ONBOARDING_TOKEN_SECRET');
      if ((env.ONBOARDING_TOKEN_SECRET?.length ?? 0) < 64 || /\s/.test(env.ONBOARDING_TOKEN_SECRET ?? '')) problems.push('ONBOARDING_TOKEN_SECRET must be at least 64 characters without whitespace');
      if (env.ONBOARDING_TOKEN_SECRET === env.TENANT_PROXY_SECRET) problems.push('Use separate onboarding and proxy secrets');
    }
    if (env.ONBOARDING_ENABLED === 'true' && env.ONBOARDING_WORKER_ENABLED !== 'true') problems.push('Signup requires an enabled onboarding worker');
    if (!['true', 'false'].includes(env.BUSINESS_JOBS_ENABLED)) problems.push('Set BUSINESS_JOBS_ENABLED explicitly');
  } else problems.push('Choose api or web');
  return problems;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const problems = inspectEnvironment(process.env, process.argv[2]);
  for (const problem of problems) process.stderr.write(`FAIL: ${problem}\n`);
  if (!problems.length) process.stdout.write('Environment shape checks passed. Live connectivity, policies and paired secrets still require verification.\n');
  process.exitCode = problems.length ? 1 : 0;
}
