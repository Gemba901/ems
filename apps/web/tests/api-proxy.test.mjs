import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proxyRequest, workspace, refreshCookieName } from '../lib/server/api-proxy.mjs';

const config = { apiUrl: 'https://internal.example.test', baseDomain: 'example.test', secret: 'a'.repeat(64), production: true, platformHosts: 'example.test,admin.example.test', platformSlug: 'gemba' };
const raw = 'b'.repeat(128);
function req(path, { host = 'acme.example.test', method = 'GET', origin, headers = {}, body } = {}) {
  return new Request(`https://${host}/api/${path}`, { method, headers: { host, ...(origin ? { origin } : {}), ...headers }, body });
}
const json = (value, headers = {}, status = 200) => Response.json(value, { status, headers });

for (const host of ['example.test.evil.org', 'a.b.example.test', 'api.example.test', 'ab.example.test', 'acme.example.test.', 'https://acme.example.test', 'acme.example.test:99999', 'acme.example.test:80', 'acme.example.test,evil.test']) {
  test(`rejects hostname ${host}`, () => assert.throws(() => workspace(host, config)));
}
test('classifies company and explicitly configured platform hosts', () => {
  assert.equal(workspace('ACME.EXAMPLE.TEST', config).tenantHostname, 'acme.example.test');
  assert.equal(workspace('admin.example.test', config).kind, 'platform');
  assert.equal(workspace('example.test', config).tenantHostname, 'gemba.example.test');
});
test('supports company localhost subdomains in development', () => {
  assert.equal(workspace('acme.localhost:3000', { ...config, production: false, baseDomain: 'localhost' }).origin, 'http://acme.localhost:3000');
});
for (const origin of [undefined, 'null', 'https://other.example.test', 'http://acme.example.test', 'https://acme.example.test.evil.org']) {
  test(`rejects write origin ${origin}`, async () => {
    const response = await proxyRequest(req('auth/login', { method: 'POST', origin }), ['auth', 'login'], config, () => { throw Error('must not fetch'); });
    assert.equal(response.status, 403);
  });
}
test('overwrites spoofed forwarding headers, forwards only the session cookie, and preserves query', async () => {
  const response = await proxyRequest(req('employee?limit=5', { headers: {
    authorization: 'Bearer access', cookie: `${refreshCookieName(true)}=${raw}; unrelated=private`,
    'x-gemba-proxy-secret': 'attacker', 'x-gemba-tenant-hostname': 'other.example.test', 'x-forwarded-host': 'other.example.test',
  } }), ['employee'], config, async (url, options) => {
    assert.equal(url.href, 'https://internal.example.test/employee?limit=5');
    assert.equal(options.headers.get('x-gemba-proxy-secret'), config.secret);
    assert.equal(options.headers.get('x-gemba-tenant-hostname'), 'acme.example.test');
    assert.equal(options.headers.get('x-forwarded-host'), null);
    assert.equal(options.headers.get('host'), null);
    assert.equal(options.headers.get('cookie'), `refresh_token=${raw}`);
    assert.equal(options.headers.get('authorization'), 'Bearer access');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.redirect, 'manual');
    return json({ ok: true });
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /no-store/);
});
for (const action of ['login', 'refresh', 'logout', 'verify-first-time', 'create-password']) {
  test(`maps company ${action} and isolates its cookie`, async () => {
    const response = await proxyRequest(req(`auth/${action}`, { method: 'POST', origin: 'https://acme.example.test', body: '{}' }), ['auth', action], config, async (url) => {
      assert.equal(url.pathname, `/auth/company/${action}`);
      return json({ ok: true }, { 'set-cookie': `refresh_token=${raw}; Domain=example.test; Max-Age=2592000; Path=/` });
    });
    assert.equal(response.status, 200);
    const cookie = response.headers.get('set-cookie');
    assert.ok(cookie.startsWith(`__Host-gemba_refresh=${raw}`));
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Secure/);
    assert.match(cookie, /SameSite=Lax/);
    assert.doesNotMatch(cookie, /Domain=/i);
  });
}
test('forwards logout expiry without a domain attribute', async () => {
  const response = await proxyRequest(req('auth/logout', { method: 'POST', origin: 'https://acme.example.test' }), ['auth', 'logout'], config, async () => json({}, { 'set-cookie': 'refresh_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT' }));
  assert.match(response.headers.get('set-cookie'), /__Host-gemba_refresh=;.*Expires=Thu, 01 Jan 1970/);
});
test('preserves an existing cookie on failed refresh', async () => {
  const response = await proxyRequest(req('auth/refresh', { method: 'POST', origin: 'https://acme.example.test' }), ['auth', 'refresh'], config, async () => json({ message: 'Denied' }, {}, 401));
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('set-cookie'), null);
});
test('platform login keeps central routes and gives non-platform users a token-free workspace URL', async () => {
  const response = await proxyRequest(req('auth/login', { host: 'example.test', method: 'POST', origin: 'https://example.test' }), ['auth', 'login'], config, async url => {
    assert.equal(url.pathname, '/auth/login');
    return json({ accessToken: 'sensitive', user: { organizationSlug: 'acme', isAdminOrg: false, roleLevel: 'ADMIN' } }, { 'set-cookie': `refresh_token=${raw}` });
  });
  assert.deepEqual(await response.json(), { workspaceUrl: 'https://acme.example.test/login' });
  assert.equal(response.headers.get('set-cookie'), null);
});
test('platform organization selection retains its central response', async () => {
  const response = await proxyRequest(req('auth/login', { host: 'example.test', method: 'POST', origin: 'https://example.test' }), ['auth', 'login'], config, async () => json({ requiresOrgSelection: true, selectionToken: 'selection' }));
  assert.equal((await response.json()).requiresOrgSelection, true);
});
test('rejects organization selection on company hosts', async () => {
  const response = await proxyRequest(req('auth/select-org', { method: 'POST', origin: 'https://acme.example.test' }), ['auth', 'select-org'], config);
  assert.equal(response.status, 403);
});
for (const parts of [['employee', '..', 'organizations'], ['employee', '%2e%2e'], ['employee', 'one/two'], ['auth', 'company', 'login'], ['https:', 'evil.test']]) {
  test(`rejects unsafe or unexposed route ${parts.join('/')}`, async () => {
    const response = await proxyRequest(req('anything'), parts, config);
    assert.equal(response.status, 404);
  });
}
test('does not follow upstream redirects or forward their cookies', async () => {
  const response = await proxyRequest(req('employee'), ['employee'], config, async () => new Response(null, { status: 302, headers: { location: 'https://evil.test', 'set-cookie': `refresh_token=${raw}` } }));
  assert.equal(response.status, 502);
  assert.equal(response.headers.get('location'), null);
  assert.equal(response.headers.get('set-cookie'), null);
});
test('streams downloads and forwards disposition', async () => {
  const response = await proxyRequest(req('calendar/export/ical'), ['calendar', 'export', 'ical'], config, async () => new Response('BEGIN:VCALENDAR', { headers: { 'content-type': 'text/calendar', 'content-disposition': 'attachment; filename=calendar.ics' } }));
  assert.equal(await response.text(), 'BEGIN:VCALENDAR');
  assert.equal(response.headers.get('content-disposition'), 'attachment; filename=calendar.ics');
});
test('preserves multipart bytes and boundary', async () => {
  const response = await proxyRequest(req('employee/import', { method: 'POST', origin: 'https://acme.example.test', headers: { 'content-type': 'multipart/form-data; boundary=test' }, body: '--test\r\nhello\r\n--test--' }), ['employee', 'import'], config, async (_, options) => {
    assert.equal(new TextDecoder().decode(options.body), '--test\r\nhello\r\n--test--');
    assert.equal(options.headers.get('content-type'), 'multipart/form-data; boundary=test');
    return json({ ok: true });
  });
  assert.equal(response.status, 200);
});
test('rejects oversized uploads before contacting the API', async () => {
  const response = await proxyRequest(req('employee/import', { method: 'POST', origin: 'https://acme.example.test', headers: { 'content-length': String(21 * 1024 * 1024) }, body: 'test' }), ['employee', 'import'], config);
  assert.equal(response.status, 413);
});
test('rejects duplicate session cookies', async () => {
  const response = await proxyRequest(req('employee', { headers: { cookie: `__Host-gemba_refresh=${raw}; __Host-gemba_refresh=${raw}` } }), ['employee'], config);
  assert.equal(response.status, 400);
});
test('rejects non-HTTPS API targets in production', async () => {
  const response = await proxyRequest(req('employee'), ['employee'], { ...config, apiUrl: 'http://internal.test' });
  assert.equal(response.status, 503);
});
test('does not expose upstream errors or configuration secrets', async () => {
  const response = await proxyRequest(req('employee'), ['employee'], config, async () => { throw Error(config.secret); });
  assert.equal(response.status, 502);
  assert.doesNotMatch(await response.text(), new RegExp(config.secret));
});

test('onboarding is available only through explicitly configured central hosts', async () => {
  let forwarded = false;
  const fetcher = async (url, options) => { forwarded = true; assert.equal(url.pathname, '/onboarding/signup'); assert.equal(options.headers.get('x-gemba-proxy-secret'), config.secret); return json({ id: 'request' }); };
  const central = await proxyRequest(req('onboarding/signup', { host: 'example.test', method: 'POST', origin: 'https://example.test', body: '{}' }), ['onboarding', 'signup'], config, fetcher);
  assert.equal(central.status, 200); assert.equal(forwarded, true);
  forwarded = false;
  const company = await proxyRequest(req('onboarding/signup', { method: 'POST', origin: 'https://acme.example.test', body: '{}' }), ['onboarding', 'signup'], config, fetcher);
  assert.equal(company.status, 404); assert.equal(forwarded, false);
});

test('operational diagnostics are restricted to central hosts and preserve request IDs', async () => {
  const result = await proxyRequest(req('operations/readiness', { host: 'example.test' }), ['operations', 'readiness'], config, async () => json({ readyForManualTests: true }, { 'x-request-id': 'request-one' }));
  assert.equal(result.status, 200); assert.equal(result.headers.get('x-request-id'), 'request-one');
  const denied = await proxyRequest(req('operations/readiness'), ['operations', 'readiness'], config, () => { throw Error('must not fetch'); });
  assert.equal(denied.status, 404);
});
