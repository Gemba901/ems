import { getOrganizationSlugError, normalizeOrganizationSlug } from './organization-slug';

describe('organization slug rules', () => {
  it('normalizes whitespace and case without silently replacing characters', () => {
    expect(normalizeOrganizationSlug(' ACME ')).toBe('acme');
    expect(normalizeOrganizationSlug('Acme Ltd')).toBe('acme ltd');
  });
  it.each(['abc', 'acme-123', 'a'.repeat(40)])('accepts %s', (slug) => {
    expect(getOrganizationSlugError(slug)).toBeNull();
  });
  it.each(['', 'ab', 'a'.repeat(41), '-acme', 'acme-', 'acme ltd', 'acme.com', 'acme_1', 'école'])('rejects invalid slug %s', (slug) => {
    expect(getOrganizationSlugError(slug)).not.toBeNull();
  });
  it.each(['www', 'api', 'admin', 'app', 'auth', 'staging', 'support'])('rejects reserved address %s after normalization', (slug) => {
    expect(getOrganizationSlugError(normalizeOrganizationSlug(` ${slug.toUpperCase()} `))).toContain('reserved');
  });
});
