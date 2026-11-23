import { Role } from 'src/common/enum/role.enum';

// Shared role sets for @Roles(...) across Leadership Excellence.
// Every set includes SUPER_ADMIN: RolesGuard denies silently (403, no log line).

/** Approve, lock, return for changes, module-wide settings. */
export const LEX_APPROVERS: Role[] = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.MANAGEMENT,
];

/** Draft, edit and submit for review. */
export const LEX_EDITORS: Role[] = [...LEX_APPROVERS, Role.HR, Role.HOD];

/** Read-only access to approved content. */
export const LEX_ALL: Role[] = [...LEX_EDITORS, Role.EMPLOYEE];
