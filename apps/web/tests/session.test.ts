import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { useAuthStore, type User } from '../store/auth.store';
import { apiClient } from '../lib/api-client';
import { refreshSession, endSession, invalidateLocalSession } from '../lib/session';
const originalFetch = globalThis.fetch;
const user = { userId: 'user-one', organizationId: 'org-one', roleLevel: 'ADMIN' } as User;
const response = () => Response.json({ accessToken: 'fresh', user });
afterEach(() => { globalThis.fetch = originalFetch; invalidateLocalSession(); });
test('concurrent refreshes share one request', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return response(); };
  assert.deepEqual(await Promise.all([refreshSession(), refreshSession(), refreshSession()]), ['fresh', 'fresh', 'fresh']);
  assert.equal(calls, 1);
  assert.equal(useAuthStore.getState().accessToken, 'fresh');
});
test('401 refreshes and retries with the new bearer token', async () => {
  useAuthStore.getState().setAuth(user, 'old');
  const tokens: string[] = [];
  globalThis.fetch = async (url, options) => {
    if (url === '/api/auth/refresh') return response();
    tokens.push(new Headers(options?.headers).get('authorization')!);
    return new Response(null, { status: tokens.length === 1 ? 401 : 200 });
  };
  assert.equal((await apiClient('/api/employee', {}, 'old')).status, 200);
  assert.deepEqual(tokens, ['Bearer old', 'Bearer fresh']);
});
test('403 does not trigger a refresh', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response(null, { status: 403 }); };
  assert.equal((await apiClient('/api/employee', {}, 'old')).status, 403);
  assert.equal(calls, 1);
});
test('temporary refresh failure preserves the current session', async () => {
  useAuthStore.getState().setAuth(user, 'old');
  globalThis.fetch = async () => new Response(null, { status: 503 });
  await assert.rejects(refreshSession(), /Unable to restore/);
  assert.equal(useAuthStore.getState().accessToken, 'old');
});
test('external URLs cannot receive bearer tokens', async () => {
  globalThis.fetch = async () => { throw new Error('must not fetch'); };
  await assert.rejects(apiClient('https://other.test/api/employee', {}, 'secret'), /same-origin/);
});
test('logout waits for refresh and discards its stale result', async () => {
  let release!: () => void;
  let started!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const ready = new Promise<void>(resolve => { started = resolve; });
  const calls: string[] = [];
  globalThis.fetch = async url => {
    calls.push(String(url));
    if (url === '/api/auth/refresh') { started(); await gate; return response(); }
    return new Response(null, { status: 200 });
  };
  const refreshing = refreshSession();
  await ready;
  const logout = endSession();
  assert.deepEqual(calls, ['/api/auth/refresh']);
  release();
  assert.equal(await refreshing, null);
  await logout;
  assert.deepEqual(calls, ['/api/auth/refresh', '/api/auth/logout']);
  assert.equal(useAuthStore.getState().isAuthenticated, false);
});
