export const RESERVED_ORGANIZATION_SLUGS = new Set([
  'www',
  'api',
  'admin',
  'app',
  'auth',
  'staging',
  'support',
]);

export function normalizeOrganizationSlug(value: string): string {
  return value.trim().toLowerCase();
}

export function getOrganizationSlugError(slug: string): string | null {
  if (slug.length < 3 || slug.length > 40) {
    return 'Organization slug must contain 3–40 characters.';
  }

  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug)) {
    return 'Use letters, numbers and hyphens, without leading or trailing hyphens.';
  }

  if (RESERVED_ORGANIZATION_SLUGS.has(slug)) {
    return 'This organization slug is reserved.';
  }

  return null;
}