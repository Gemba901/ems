// Addresses that are never a company. Tenant hostname resolution treats these
// as platform hosts, so only add a name here if no company uses it.
// apps/web/lib/reserved-slugs.mjs mirrors these lists, and
// apps/web/tests/reserved-slugs.test.mjs fails if they drift.
export const RESERVED_ORGANIZATION_SLUGS = new Set([
  'www',
  'api',
  'admin',
  'app',
  'auth',
  'staging',
  'support',
]);

// Extra names refused for new self-service signups only, so existing companies
// keep resolving: infrastructure names and sign-in or billing terms that make
// convincing phishing pages.
export const SIGNUP_RESERVED_ORGANIZATION_SLUGS = new Set([
  'mail',
  'smtp',
  'status',
  'cdn',
  'dev',
  'test',
  'login',
  'signin',
  'sso',
  'account',
  'billing',
  'pay',
  'security',
  'verify',
  'help',
]);

// Our own brand names may not appear anywhere in a self-service address.
export const SIGNUP_RESERVED_ORGANIZATION_SLUG_TERMS = ['gemba', 'bees'];

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

export function getSignupOrganizationSlugError(slug: string): string | null {
  const error = getOrganizationSlugError(slug);
  if (error) return error;
  if (SIGNUP_RESERVED_ORGANIZATION_SLUGS.has(slug) || SIGNUP_RESERVED_ORGANIZATION_SLUG_TERMS.some((term) => slug.includes(term))) {
    return 'This organization slug is reserved.';
  }
  return null;
}

function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

// True when a self-service signup would look like an existing company:
// the same name with a hyphenated prefix or suffix (kbcl-hr for kbcl), or a
// one-character change of a name long enough for that to look deliberate.
export function isLookalikeOrganizationSlug(slug: string, existingSlugs: Iterable<string>): boolean {
  for (const existing of existingSlugs) {
    if (!existing || existing === slug) continue;
    if (slug.startsWith(`${existing}-`) || slug.endsWith(`-${existing}`)) return true;
    if (existing.length >= 5 && withinOneEdit(slug, existing)) return true;
  }
  return false;
}
