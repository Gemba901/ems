import { Role } from '../common/enum/role.enum';

export interface AccessTokenPayload {
  // Distinguishes API access tokens from setup/reset/selection tokens.
  tokenType: 'ACCESS';

  userId: string;
  organizationId: string;

  roleId: number;
  roleLevel: Role;

  email: string | null;
  isAdminOrg: boolean;
}

// JWT payloads are external input at runtime.
// A TypeScript interface alone does not validate their contents.
export function isAccessTokenPayload(
  value: unknown,
): value is AccessTokenPayload {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const payload = value as Record<string, unknown>;

  return (
    payload.tokenType === 'ACCESS' &&

    // Reject tokens carrying a setup/reset/selection purpose.
    payload.purpose === undefined &&

    typeof payload.userId === 'string' &&
    payload.userId.trim().length > 0 &&

    typeof payload.organizationId === 'string' &&
    payload.organizationId.trim().length > 0 &&

    typeof payload.roleId === 'number' &&
    Number.isInteger(payload.roleId) &&
    payload.roleId > 0 &&

    typeof payload.roleLevel === 'string' &&
    Object.values(Role).includes(payload.roleLevel as Role) &&

    (payload.email === null || typeof payload.email === 'string') &&
    typeof payload.isAdminOrg === 'boolean' &&

    // Require an expiry claim. Passport checks whether it has expired.
    typeof payload.exp === 'number' &&
    Number.isFinite(payload.exp)
  );
}