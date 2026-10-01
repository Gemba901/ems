// Fail at startup, with every problem listed, instead of at the first request.
// Never include secret values in messages. TENANT_PROXY_SECRET's shape is
// enforced by ProxySecretGuard's constructor.
export function validateEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  const problems: string[] = [];
  for (const key of ['DATABASE_URL', 'JWT_SECRET', 'TENANT_PROXY_SECRET']) {
    if (!env[key]?.trim()) problems.push(`${key} is required`);
  }
  if (env.JWT_SECRET && env.JWT_SECRET === env.TENANT_PROXY_SECRET) {
    problems.push('JWT_SECRET and TENANT_PROXY_SECRET must be different secrets');
  }
  if (env.CORS_ORIGINS) {
    for (const origin of env.CORS_ORIGINS.split(',').map(o => o.trim())) {
      let url: URL | undefined;
      try { url = new URL(origin); } catch { /* reported below */ }
      if (!url || url.origin !== origin) problems.push(`CORS_ORIGINS entry "${origin}" must be a bare origin like https://app.example.com`);
      else if (env.NODE_ENV === 'production' && url.protocol !== 'https:') problems.push(`CORS_ORIGINS entry "${origin}" must use https in production`);
    }
  }
  return problems;
}
