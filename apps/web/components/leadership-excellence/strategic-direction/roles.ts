import { Role } from "@/store/auth.store";

// Mirror apps/api/src/leadership-excellence/strategic-direction/strategic-direction.roles.ts.
// The API enforces them again. HR and HOD read the approved version like employees.
// Who approves is a list the company chooses, not a role.

/** Write the direction and send it for review. */
export const DIRECTION_EDITORS: Role[] = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGEMENT];

/** Choose who approves the direction. */
export const DIRECTION_ADMINS: Role[] = [Role.SUPER_ADMIN, Role.ADMIN];
