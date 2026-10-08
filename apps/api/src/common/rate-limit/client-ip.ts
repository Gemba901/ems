import { isIP } from 'node:net';

// The Next.js proxy copies the platform-set x-real-ip into x-gemba-client-ip.
// It is trustworthy only because ProxySecretGuard (APP_GUARD) has already
// verified the request came from that proxy; never read it before then.
export function clientIp(request: { headers: Record<string, unknown>; ip?: string }): string {
  const forwarded = request.headers['x-gemba-client-ip'];
  if (typeof forwarded === 'string' && isIP(forwarded)) return forwarded;

  // Local development without x-real-ip: every caller shares the proxy's address.
  return request.ip ?? 'unknown';
}
