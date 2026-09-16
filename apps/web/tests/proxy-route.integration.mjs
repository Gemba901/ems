// Runs the real Next route against a disposable HTTP API stub; never uses the application database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

test('Next route isolates company hosts, cookies, origins and forwarding headers', { timeout: 180000 }, async () => {
  const seen = [];
  const api = http.createServer((req, res) => {
    seen.push({ path: req.url, headers: req.headers });
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/auth/company/login') {
      res.setHeader('Set-Cookie', `refresh_token=${'a'.repeat(128)}; Path=/auth; HttpOnly; Domain=localhost; Max-Age=86400`);
      res.end(JSON.stringify({ accessToken: 'test-token', user: { organizationId: 'org-acme' } }));
    } else res.end(JSON.stringify({ hostname: req.headers['x-gemba-tenant-hostname'] }));
  });
  await new Promise((resolve, reject) => { api.once('error', reject); api.listen(0, '127.0.0.1', resolve); });
  // Ask the OS for an available web port rather than assuming the user's dev port is free.
  const probe = http.createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, NODE_ENV: 'development', API_INTERNAL_URL: `http://127.0.0.1:${api.address().port}`, TENANT_BASE_DOMAIN: 'localhost', TENANT_PLATFORM_HOSTS: 'localhost', TENANT_PROXY_SECRET: 't'.repeat(64) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', value => { output += value; });
  child.stderr.on('data', value => { output += value; });
  // Use Node HTTP so the explicit Host is preserved independently of DNS.
  const request = (host, path, options = {}) => new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: `/api/${path}`, method: options.method ?? 'GET', headers: { Host: `${host}:${port}`, ...options.headers } }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: res.statusCode, headers: res.headers })));
    });
    req.on('error', reject);
    req.end(options.body);
  });
  try {
    let ready = false;
    for (let i = 0; i < 120; i++) {
      if (child.exitCode !== null) throw new Error(output);
      try { ready = (await request('acme.localhost', 'workspace')).ok; } catch {}
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    assert.ok(ready, output);
    const login = await request('acme.localhost', 'auth/login', { method: 'POST', headers: { Origin: `http://acme.localhost:${port}`, 'Content-Type': 'application/json', 'x-gemba-tenant-hostname': 'evil.localhost', 'x-gemba-proxy-secret': 'forged' }, body: '{}' });
    assert.equal(login.status, 200, await login.text());
    const cookie = login.headers.get('set-cookie');
    assert.match(cookie, /^gemba_refresh=/);
    assert.match(cookie, /Path=\//);
    assert.match(cookie, /HttpOnly/);
    assert.doesNotMatch(cookie, /Domain=/i);
    assert.equal(seen.at(-1).path, '/auth/company/login');
    assert.equal(seen.at(-1).headers['x-gemba-tenant-hostname'], 'acme.localhost');
    assert.equal(seen.at(-1).headers['x-gemba-proxy-secret'], 't'.repeat(64));
    await request('acme.localhost', 'auth/refresh', { method: 'POST', headers: { Origin: `http://acme.localhost:${port}`, Cookie: cookie.split(';')[0] } });
    assert.equal(seen.at(-1).headers.cookie, `refresh_token=${'a'.repeat(128)}`);
    const beta = await request('beta.localhost', 'employee');
    assert.equal((await beta.json()).hostname, 'beta.localhost');
    assert.equal(seen.at(-1).headers.cookie, undefined);
    const count = seen.length;
    const forged = await request('beta.localhost', 'auth/login', { method: 'POST', headers: { Origin: `http://acme.localhost:${port}` }, body: '{}' });
    assert.equal(forged.status, 403);
    assert.equal(seen.length, count);
    assert.equal((await request('unknown.example', 'employee')).status, 404);
  } finally {
    child.kill('SIGTERM');
    if (child.exitCode === null) await once(child, 'exit');
    await new Promise(resolve => api.close(resolve));
  }
});
