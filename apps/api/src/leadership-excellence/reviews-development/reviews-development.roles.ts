import { Role } from 'src/common/enum/role.enum';
import { LEX_ALL } from '../common/lex-roles';

// Roles are only a coarse gate. Who is the subject, the reviewer, the manager
// or an independent checker comes from the records and is checked in the services.
// Every set includes SUPER_ADMIN: RolesGuard denies silently (403, no log line).

/** Every LEX user: reviews, coaching and checks are open to any employee who takes part. */
export const DEVELOPMENT_USERS: Role[] = LEX_ALL;

/** Read-only integration reads (Area 07 dashboards and reports). */
export const DEVELOPMENT_READERS: Role[] = LEX_ALL;

/** May see metadata (and department review content) across every department. */
export const DEVELOPMENT_ORG_WIDE: Role[] = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.MANAGEMENT,
];
