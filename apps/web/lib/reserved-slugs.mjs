// Mirrors apps/api/src/common/utils/organization-slug.ts, which stays authoritative.
// tests/reserved-slugs.test.mjs fails if the two drift apart.

// Never a company: these hosts serve the platform itself.
export const RESERVED_SLUGS = new Set(['www', 'api', 'admin', 'app', 'auth', 'staging', 'support']);

// Also refused for new self-service signups (existing companies keep working).
export const SIGNUP_RESERVED_SLUGS = new Set([
  'mail', 'smtp', 'status', 'cdn', 'dev', 'test',
  'login', 'signin', 'sso', 'account', 'billing', 'pay', 'security', 'verify', 'help',
]);
export const SIGNUP_RESERVED_TERMS = ['gemba', 'bees'];

export const isReservedSignupSlug = slug =>
  RESERVED_SLUGS.has(slug) || SIGNUP_RESERVED_SLUGS.has(slug) || SIGNUP_RESERVED_TERMS.some(term => slug.includes(term));
