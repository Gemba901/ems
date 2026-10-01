import {
  getOrganizationSlugError,
  getSignupOrganizationSlugError,
  isLookalikeOrganizationSlug,
  normalizeOrganizationSlug,
} from './organization-slug';

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

  it.each(['login', 'billing', 'gembapms', 'gemba-plastics', 'bees-admin', 'test'])('refuses %s for new signups but keeps it valid for existing companies', (slug) => {
    expect(getSignupOrganizationSlugError(slug)).toContain('reserved');
    expect(getOrganizationSlugError(slug)).toBeNull();
  });
  it('flags addresses that imitate an existing company', () => {
    const existing = ['kbcl', 'acme-steel'];
    expect(isLookalikeOrganizationSlug('kbcl-hr', existing)).toBe(true);
    expect(isLookalikeOrganizationSlug('hr-kbcl', existing)).toBe(true);
    expect(isLookalikeOrganizationSlug('acme-stee1', existing)).toBe(true);
    expect(isLookalikeOrganizationSlug('acme-steels', existing)).toBe(true);
    expect(isLookalikeOrganizationSlug('kbclx', existing)).toBe(false);
    expect(isLookalikeOrganizationSlug('kbcl', existing)).toBe(false);
    expect(isLookalikeOrganizationSlug('northwind', existing)).toBe(false);
  });
});
