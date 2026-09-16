import { parseTenantHostname } from './tenant-hostname';

describe('parseTenantHostname', () => {
  const base = 'gembapms.co.in';
  it.each(['acme.gembapms.co.in', 'ACME.GEMBAPMS.CO.IN'])('resolves %s', (hostname) => {
    expect(parseTenantHostname(hostname, base)).toEqual({ kind: 'tenant', slug: 'acme' });
  });
  it('uses the configured domain and normalizes its case', () => {
    expect(parseTenantHostname('beta.example.org', 'EXAMPLE.ORG')).toEqual({ kind: 'tenant', slug: 'beta' });
  });
  it.each([base, ...['www', 'api', 'admin', 'app', 'auth', 'staging', 'support'].map((slug) => `${slug}.${base}`)])('classifies %s as platform', (hostname) => {
    expect(parseTenantHostname(hostname, base)).toEqual({ kind: 'platform' });
  });
  it.each([
    '', 'acme.other.com', 'acme.gembapms.com', 'acme.gembapms',
    'acme.gembapms.co.in.evil.com', 'acme.fakegembapms.co.in',
    'team.acme.gembapms.co.in', 'https://acme.gembapms.co.in',
    'acme.gembapms.co.in:443', 'acme.gembapms.co.in/path',
    ' acme.gembapms.co.in', 'acme.gembapms.co.in ',
    'acme..gembapms.co.in', '-acme.gembapms.co.in', 'acme-.gembapms.co.in',
    'acme_1.gembapms.co.in', 'ab.gembapms.co.in',
    `${'a'.repeat(41)}.gembapms.co.in`, `${'a'.repeat(64)}.gembapms.co.in`,
  ])('rejects %s', (hostname) => {
    expect(parseTenantHostname(hostname, base)).toEqual({ kind: 'invalid' });
  });
  it.each(['', 'https://example.org', 'example.org/path', 'example.org:443', '.example.org', 'example..org'])('rejects malformed base domain %s', (domain) => {
    expect(parseTenantHostname('acme.example.org', domain)).toEqual({ kind: 'invalid' });
  });
  it('accepts the maximum slug length', () => {
    const slug = 'a'.repeat(40);
    expect(parseTenantHostname(`${slug}.${base}`, base)).toEqual({ kind: 'tenant', slug });
  });
});
