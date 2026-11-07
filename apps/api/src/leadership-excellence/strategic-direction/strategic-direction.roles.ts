import { Role } from 'src/common/enum/role.enum';
import { LEX_ALL } from '../common/lex-roles';

// Strategic Direction is narrower than the shared LEX sets: HR and HOD only read it.
// Every set includes SUPER_ADMIN: RolesGuard denies silently (403, no log line).

/** Write the direction and send it for review. Only the chosen approvers may approve it. */
export const DIRECTION_EDITORS: Role[] = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.MANAGEMENT,
];

/** Choose who approves the direction. */
export const DIRECTION_ADMINS: Role[] = [Role.SUPER_ADMIN, Role.ADMIN];

/** Read the approved direction. */
export const DIRECTION_READERS: Role[] = LEX_ALL;
