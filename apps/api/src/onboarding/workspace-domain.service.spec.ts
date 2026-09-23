import { ConfigService } from '@nestjs/config';
import { WorkspaceDomainService } from './workspace-domain.service';

const hostname = 'test-company.bees.example.com';
const settings = {
  ONBOARDING_VERCEL_DOMAINS_ENABLED: 'true',
  VERCEL_TOKEN: 'private-test-token',
  VERCEL_PROJECT_ID: 'prj_test',
  VERCEL_TEAM_ID: 'team_test',
  VERCEL_DOMAIN_ENVIRONMENT: 'preview',
  VERCEL_DOMAIN_GIT_BRANCH: 'staging',
  TENANT_BASE_DOMAIN: 'bees.example.com',
  ONBOARDING_ORIGIN: 'https://bees.example.com',
};
const domain = { name: hostname, verified: true, gitBranch: 'staging' };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
const login = () =>
  new Response('<html>Login</html>', {
    headers: { 'content-type': 'text/html' },
  });

describe('Workspace domain provisioning', () => {
  let fetchMock: jest.SpyInstance;
  const service = (overrides = {}) =>
    new WorkspaceDomainService(
      new ConfigService({ ...settings, ...overrides }),
    );
  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });
  afterEach(() => jest.restoreAllMocks());

  it('does nothing when disabled', async () => {
    await new WorkspaceDomainService(new ConfigService()).ensureReady(
      'test-company',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('requires an explicit deployment environment and credentials on startup', () => {
    expect(() => service({ VERCEL_TOKEN: '' }).onModuleInit()).toThrow(
      'Missing VERCEL_TOKEN',
    );
    expect(() =>
      service({ VERCEL_DOMAIN_ENVIRONMENT: '' }).onModuleInit(),
    ).toThrow();
    expect(() =>
      service({ VERCEL_DOMAIN_GIT_BRANCH: '' }).onModuleInit(),
    ).toThrow();
  });
  it('rejects malformed slugs before network calls', async () => {
    await expect(service().ensureReady('other.example.com')).rejects.toThrow(
      'Invalid workspace slug',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('creates a branch domain and checks DNS and HTTPS without sending credentials to the tenant', async () => {
    fetchMock
      .mockResolvedValueOnce(json({}, 404))
      .mockResolvedValueOnce(json(domain))
      .mockResolvedValueOnce(json(domain))
      .mockResolvedValueOnce(json({ misconfigured: false }))
      .mockResolvedValueOnce(login());
    await service().ensureReady('test-company');
    const [url, options] = fetchMock.mock.calls[1];
    expect(url.toString()).toBe(
      'https://api.vercel.com/v10/projects/prj_test/domains?teamId=team_test',
    );
    expect(JSON.parse(options.body)).toEqual({
      name: hostname,
      gitBranch: 'staging',
    });
    expect(fetchMock.mock.calls[4]).toEqual([
      `https://${hostname}/login`,
      { redirect: 'manual', signal: expect.any(AbortSignal) },
    ]);
  });
  it('reuses an existing domain on retry without creating another', async () => {
    fetchMock
      .mockResolvedValueOnce(json(domain))
      .mockResolvedValueOnce(json({ misconfigured: false }))
      .mockResolvedValueOnce(login());
    await service().ensureReady('test-company');
    expect(
      fetchMock.mock.calls.every(
        ([, init]) => !init.method || init.method === 'GET',
      ),
    ).toBe(true);
  });
  it.each([400, 409])(
    'recovers from a concurrent registration (%s) only after reading the domain',
    async (status) => {
      fetchMock
        .mockResolvedValueOnce(json({}, 404))
        .mockResolvedValueOnce(json({}, status))
        .mockResolvedValueOnce(json(domain))
        .mockResolvedValueOnce(json({ misconfigured: false }))
        .mockResolvedValueOnce(login());
      await service().ensureReady('test-company');
    },
  );
  it.each([
    { gitBranch: 'main' },
    { customEnvironmentId: 'env_other' },
    { redirect: 'other.example.com' },
    { name: 'other.example.com' },
  ])(
    'does not reassign or accept a domain with conflicting settings: %p',
    async (override) => {
      fetchMock.mockResolvedValueOnce(json({ ...domain, ...override }));
      await expect(service().ensureReady('test-company')).rejects.toThrow(
        'assignment mismatch',
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );
  it('retries ownership verification but does not treat an unverified domain as ready', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ ...domain, verified: false }))
      .mockResolvedValueOnce(json({ ...domain, verified: false }));
    await expect(service().ensureReady('test-company')).rejects.toThrow(
      'ownership verification pending',
    );
    expect(fetchMock.mock.calls[1][0].pathname).toMatch(/\/verify$/);
  });
  it('waits for DNS propagation', async () => {
    fetchMock
      .mockResolvedValueOnce(json(domain))
      .mockResolvedValueOnce(json({ misconfigured: true }));
    await expect(service().ensureReady('test-company')).rejects.toThrow(
      'DNS configuration pending',
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it.each([302, 401, 404, 503])(
    'rejects an HTTPS page with status %s',
    async (status) => {
      fetchMock
        .mockResolvedValueOnce(json(domain))
        .mockResolvedValueOnce(json({ misconfigured: false }))
        .mockResolvedValueOnce(new Response('', { status }));
      await expect(service().ensureReady('test-company')).rejects.toThrow(
        'HTTPS login page not ready',
      );
    },
  );
  it('waits for a trusted TLS certificate and suppresses raw network errors', async () => {
    fetchMock
      .mockResolvedValueOnce(json(domain))
      .mockResolvedValueOnce(json({ misconfigured: false }))
      .mockRejectedValueOnce(
        new Error('certificate error with sensitive details'),
      );
    await expect(service().ensureReady('test-company')).rejects.toThrow(
      'Workspace HTTPS login page not ready',
    );
  });
  it('reports rate limits without provider bodies or credentials', async () => {
    fetchMock.mockResolvedValueOnce(
      json({ error: 'sensitive provider detail' }, 429),
    );
    await expect(service().ensureReady('test-company')).rejects.toThrow(
      'Vercel API HTTP 429',
    );
  });
  it('targets production only when explicitly configured', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ ...domain, gitBranch: null }))
      .mockResolvedValueOnce(json({ misconfigured: false }))
      .mockResolvedValueOnce(login());
    await service({ VERCEL_DOMAIN_ENVIRONMENT: 'production' }).ensureReady(
      'test-company',
    );
  });
});
