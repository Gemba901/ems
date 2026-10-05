import { Role } from 'src/common/enum/role.enum';

// App roles map to Team Workspace capabilities here, so controllers (@Roles)
// and WorkAccessService use one definition. Always include SUPER_ADMIN:
// RolesGuard denies without logging.

// May create projects.
export const PROJECT_CREATOR_ROLES: readonly Role[] = [
    Role.SUPER_ADMIN,
    Role.ADMIN,
    Role.MANAGEMENT,
    Role.HOD,
];

// See and manage every project in the organization without being a member.
export const ORG_PROJECT_ADMIN_ROLES: readonly Role[] = [
    Role.SUPER_ADMIN,
    Role.ADMIN,
];

// See team attendance and locations, and correct records.
// Kept independent of the project lists: project permissions never grant attendance access.
export const ATTENDANCE_MANAGER_ROLES: readonly Role[] = [
    Role.SUPER_ADMIN,
    Role.ADMIN,
    Role.MANAGEMENT,
    Role.HR,
];
