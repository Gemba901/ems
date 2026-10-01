import { readFileSync } from 'node:fs';

// TLS settings for one-off scripts (seeds, backfills). Certificates are always
// verified. For RDS, download the global CA bundle once
// (https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem) and point
// DATABASE_CA_CERT at it. Local databases connect without TLS.
export function scriptSsl(connectionString: string) {
  const host = new URL(connectionString).hostname;
  if (['localhost', '127.0.0.1', '::1'].includes(host)) return false;
  const caPath = process.env.DATABASE_CA_CERT;
  return { rejectUnauthorized: true, ...(caPath ? { ca: readFileSync(caPath, 'utf8') } : {}) };
}
