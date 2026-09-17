// Imported only by the server route. Configuration is supplied at request time.
const RESERVED = new Set(['www', 'api', 'admin', 'app', 'auth', 'staging', 'support']);
const ROOTS = new Set(['operations', 'onboarding', 'auth', 'organizations', 'company', 'employee', 'departments', 'committees', 'notices', 'notifications', 'tickets', 'sims', 'kaizen', 'sga', 'ems', 'leave', 'calendar', 'dwms', 'uploads', 'chat', 'quotes', 'steel']);
const AUTH = new Set(['login', 'refresh', 'logout', 'select-org', 'verify-first-time', 'create-password', 'forgot-password', 'reset-password', 'verify-temp-password', 'my-org']);
const COMPANY_AUTH = new Set(['login', 'refresh', 'logout', 'verify-first-time', 'create-password']);
const LIMIT = 20 * 1024 * 1024;

export class ProxyError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new ProxyError(status, message); };
export const validSlug = value => typeof value === 'string' && value.length >= 3 && value.length <= 40 && /^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(value) && !RESERVED.has(value);
const validHostname = value => value.length <= 253 && value.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));

export function workspace(host, config) {
  const base = config.baseDomain?.toLowerCase();
  if (!base || !validHostname(base)) fail(503, 'Workspace configuration is unavailable');
  if (!host || !/^[a-zA-Z0-9.-]+(?::[0-9]{1,5})?$/.test(host)) fail(400, 'Invalid hostname');
  const [hostname, port] = host.toLowerCase().split(':');
  if (!validHostname(hostname) || (port && (+port < 1 || +port > 65535))) fail(400, 'Invalid hostname');
  if (config.production && port && port !== '443') fail(400, 'Invalid hostname');
  const authority = hostname + (port && !(config.production && port === '443') ? `:${port}` : '');
  const origin = `${config.production ? 'https' : 'http'}://${authority}`;
  const platforms = config.platformHosts?.split(',').map(value => value.trim().toLowerCase()).filter(Boolean) ?? [base];
  if (platforms.includes(hostname)) {
    if (config.platformSlug && !validSlug(config.platformSlug)) fail(503, 'Workspace configuration is unavailable');
    return { kind: 'platform', hostname, origin, base, port, tenantHostname: config.platformSlug ? `${config.platformSlug}.${base}` : null };
  }
  const suffix = `.${base}`;
  if (!hostname.endsWith(suffix)) fail(404, 'Workspace not found');
  const slug = hostname.slice(0, -suffix.length);
  if (!validSlug(slug)) fail(404, 'Workspace not found');
  return { kind: 'company', hostname, origin, base, port, slug, tenantHostname: hostname };
}

function upstreamPath(parts, scope) {
  if (!parts.length || parts.some(part => !/^[a-zA-Z0-9_~.-]+$/.test(part) || part === '.' || part === '..') || !ROOTS.has(parts[0])) fail(404, 'API route not found');
  if (parts[0] === 'operations' && (scope.kind !== 'platform' || (parts.join('/') !== 'operations/readiness' && !(parts.length === 4 && parts[1] === 'files')))) fail(404, 'API route not found');
  if (parts[0] === 'onboarding') {
    if (scope.kind !== 'platform' || parts.length !== 2 || !['signup', 'verify', 'status', 'retry', 'resend'].includes(parts[1])) fail(404, 'API route not found');
  }
  if (parts[0] === 'auth') {
    if (parts.length !== 2 || !AUTH.has(parts[1])) fail(404, 'API route not found');
    if (scope.kind === 'company' && parts[1] === 'select-org') fail(403, 'Use this company workspace to sign in');
    if (scope.kind === 'company' && COMPANY_AUTH.has(parts[1])) return `auth/company/${parts[1]}`;
    if (scope.kind === 'platform' && parts[1] === 'my-org') return 'auth/platform/my-org';
  }
  if (!scope.tenantHostname && !['operations', 'onboarding', 'auth', 'organizations'].includes(parts[0])) fail(403, 'Open your company workspace to continue');
  return parts.join('/');
}

async function bodyBytes(request) {
  if (Number(request.headers.get('content-length')) > LIMIT) fail(413, 'Request is too large');
  if (!request.body) return undefined;
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > LIMIT) { await reader.cancel(); fail(413, 'Request is too large'); }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
  return body;
}

export function refreshCookieName(production) { return production ? '__Host-gemba_refresh' : 'gemba_refresh'; }
function upstreamCookie(header, production) {
  const name = refreshCookieName(production);
  const values = (header ?? '').split(';').map(value => value.trim()).filter(value => value.startsWith(`${name}=`));
  if (values.length > 1) fail(400, 'Ambiguous session cookie');
  if (!values.length) return null;
  const token = values[0].slice(name.length + 1);
  if (!/^[a-f0-9]{128}$/.test(token)) fail(401, 'Invalid session cookie');
  return `refresh_token=${token}`;
}
function browserCookie(cookie, production) {
  const [pair, ...attributes] = cookie.split(';').map(value => value.trim());
  if (!pair.startsWith('refresh_token=')) return null;
  const token = pair.slice('refresh_token='.length);
  if (token && !/^[a-f0-9]{128}$/.test(token)) fail(502, 'Invalid session response');
  const result = [`${refreshCookieName(production)}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (production) result.push('Secure');
  const maxAge = attributes.find(value => /^max-age=/i.test(value));
  const expires = attributes.find(value => /^expires=/i.test(value));
  if (maxAge && /^max-age=-?\d+$/i.test(maxAge)) result.push(maxAge);
  if (expires && Number.isFinite(Date.parse(expires.slice(8)))) result.push(`Expires=${new Date(expires.slice(8)).toUTCString()}`);
  return result.join('; ');
}

export async function proxyRequest(request, parts, config, fetcher = fetch) {
  try {
    const scope = workspace(request.headers.get('host'), config);
    // SameSite does not isolate sibling subdomains. Require an exact origin for writes.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && request.headers.get('origin') !== scope.origin) fail(403, 'Request origin is not allowed');
    if (request.headers.get('sec-fetch-site') === 'cross-site') fail(403, 'Request origin is not allowed');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
    if (parts.join('/') === 'workspace') return Response.json({ kind: scope.kind, hostname: scope.hostname, slug: scope.slug ?? null }, { headers: { 'Cache-Control': 'no-store' } });
    const path = upstreamPath(parts, scope);
    if (!config.apiUrl || !config.secret || config.secret.length < 64 || config.secret.length > 1024 || /\s/.test(config.secret)) fail(503, 'API configuration is unavailable');
    const api = new URL(config.apiUrl);
    if (api.username || api.password || api.search || api.hash || !['http:', 'https:'].includes(api.protocol) || (config.production && api.protocol !== 'https:')) fail(503, 'API configuration is unavailable');
    const target = new URL(`${api.pathname.replace(/\/$/, '')}/${path}`, api.origin);
    target.search = new URL(request.url).search;
    const headers = new Headers();
    for (const name of ['content-type', 'accept', 'authorization']) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    // Never copy caller-provided forwarding headers, Host, or unrelated cookies.
    headers.set('x-gemba-proxy-secret', config.secret);
    if (scope.tenantHostname) headers.set('x-gemba-tenant-hostname', scope.tenantHostname);
    const cookie = upstreamCookie(request.headers.get('cookie'), config.production);
    if (cookie) headers.set('cookie', cookie);
    const upstream = await fetcher(target, {
      method: request.method, headers, cache: 'no-store', redirect: 'manual',
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : await bodyBytes(request),
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]),
    });
    if (upstream.status >= 300 && upstream.status < 400) fail(502, 'Unexpected API redirect');
    const output = new Headers({ 'Cache-Control': 'private, no-store', 'Vary': 'Host, Cookie, Authorization', 'X-Content-Type-Options': 'nosniff' });
    for (const name of ['content-type', 'content-disposition', 'retry-after', 'x-request-id', 'content-security-policy']) {
      const value = upstream.headers.get(name);
      if (value) output.set(name, value);
    }
    for (const item of upstream.headers.getSetCookie()) {
      const cookie = browserCookie(item, config.production);
      if (cookie) output.append('set-cookie', cookie);
    }
    // Central sign-in can discover a workspace; never put tokens into redirect URLs.
    if (scope.kind === 'platform' && ['auth/login', 'auth/select-org', 'auth/refresh'].includes(path) && upstream.ok) {
      const data = await upstream.json();
      if (data.user && !(data.user.isAdminOrg && data.user.roleLevel === 'SUPER_ADMIN')) {
        const slug = data.user.organizationSlug;
        if (!validSlug(slug)) fail(409, 'This company does not have a workspace address yet');
        output.delete('set-cookie');
        const port = !config.production && scope.port ? `:${scope.port}` : '';
        return Response.json({ workspaceUrl: `${config.production ? 'https' : 'http'}://${slug}.${scope.base}${port}/login` }, { headers: output });
      }
      return Response.json(data, { status: upstream.status, headers: output });
    }
    return new Response(upstream.body, { status: upstream.status, headers: output });
  } catch (error) {
    const status = error instanceof ProxyError ? error.status : 502;
    return Response.json({ message: error instanceof ProxyError ? error.message : 'The API is temporarily unavailable' }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
