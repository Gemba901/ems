import type { RateLimitRule } from '../common/rate-limit/rate-limit.guard';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Phone numbers arrive in several shapes (0712…, +254712…, 254712…); the last
// nine digits collapse them so variants share one bucket.
function normalizeIdentifier(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const trimmed = value.trim().toLowerCase();
  if (trimmed.includes('@')) return trimmed;
  const digits = trimmed.replace(/\D/g, '');
  return digits.length >= 9 ? digits.slice(-9) : trimmed;
}

// The account being targeted, scoped to the company host when there is one.
export function accountKey(host: unknown, identifier: unknown): string | undefined {
  const id = normalizeIdentifier(identifier);
  if (!id) return undefined;
  return `acct:${typeof host === 'string' ? host.toLowerCase() : 'platform'}:${id}`;
}

// Runs after ProxySecretGuard, so the tenant hostname header is trusted.
function account(request: any): string | undefined {
  const body = request.body ?? {};
  return accountKey(request.headers['x-gemba-tenant-hostname'], body.phoneOrEmail ?? body.employeeCode);
}

export function emailKey(value: unknown): string | undefined {
  const id = normalizeIdentifier(value);
  return id?.includes('@') ? `email:${id}` : undefined;
}

const email = (request: any) => emailKey(request.body?.email);

// Every email we send to an address someone else typed in (signup, resend,
// password reset) counts here, to protect third parties and our SES reputation.
export const MAIL_RECIPIENT_LIMIT = { name: 'mail-recipient', max: 10, windowMs: DAY };

// Per-IP limits are deliberately generous: a whole factory shift often signs in
// from one NAT address. Per-account limits are the real defence against guessing.
export const AUTH_LIMITS = {
  login: [
    { name: 'login', by: 'ip', max: 300, windowMs: 15 * MINUTE },
    { name: 'login', by: account, max: 10, windowMs: 15 * MINUTE },
  ],
  selectOrg: [{ name: 'select-org', by: 'ip', max: 300, windowMs: 15 * MINUTE }],
  refresh: [{ name: 'refresh', by: 'ip', max: 1200, windowMs: 15 * MINUTE }],
  verifyFirstTime: [
    { name: 'first-time', by: 'ip', max: 100, windowMs: 15 * MINUTE },
    { name: 'first-time', by: account, max: 5, windowMs: 15 * MINUTE },
  ],
  createPassword: [{ name: 'create-password', by: 'ip', max: 100, windowMs: 15 * MINUTE }],
  forgotPassword: [
    { name: 'pwreset-request', by: email, max: 5, windowMs: HOUR },
    { ...MAIL_RECIPIENT_LIMIT, by: email },
    { name: 'pwreset-request', by: 'ip', max: 20, windowMs: HOUR },
  ],
  resetPassword: [{ name: 'pwreset-attempt', by: 'ip', max: 10, windowMs: 15 * MINUTE }],
  verifyTempPassword: [{ name: 'temppwd-attempt', by: 'ip', max: 10, windowMs: 15 * MINUTE }],
} satisfies Record<string, RateLimitRule[]>;

export const ONBOARDING_LIMITS = {
  signup: [
    { name: 'onboarding-signup', by: 'ip', max: 10, windowMs: HOUR },
    { ...MAIL_RECIPIENT_LIMIT, by: email },
  ],
  verify: [{ name: 'onboarding-verify', by: 'ip', max: 30, windowMs: 15 * MINUTE }],
  resend: [{ name: 'onboarding-resend', by: 'ip', max: 30, windowMs: HOUR }],
  retry: [{ name: 'onboarding-retry', by: 'ip', max: 30, windowMs: HOUR }],
} satisfies Record<string, RateLimitRule[]>;
