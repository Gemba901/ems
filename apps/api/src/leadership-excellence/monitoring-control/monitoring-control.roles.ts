import { Role } from 'src/common/enum/role.enum';
import { LEX_ALL } from '../common/lex-roles';

// Roles are only a coarse gate. Any employee can be a KPI's assigned verifier,
// so "is this the assigned verifier / in my reporting scope" is checked in the services.
// Every set includes SUPER_ADMIN: RolesGuard denies silently (403, no log line).

/** Read results, gaps and alerts within your own scope. */
export const MONITORING_READERS: Role[] = LEX_ALL;

/** Verify or return results; the service checks you are the assigned verifier. */
export const MONITORING_VERIFIERS: Role[] = LEX_ALL;

/** See every department's results and alerts. */
export const MONITORING_ORG_WIDE: Role[] = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.MANAGEMENT,
];
