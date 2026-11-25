// Shared policy contract: keep the API and web copies in sync.
// Job title, department and HOD appointment never determine account access.
export const ACCESS_LEVEL_VALUES = {
  employee: 'EMPLOYEE', supervisor: 'EMPLOYEE',
  // Shown as "Executive" on screen; the stored role name stays MANAGEMENT. A plain "Manager" is not recognised:
  // managers differ too much between companies, so an Admin decides each case (Treat as, remembered per company).
  management: 'MANAGEMENT', executive: 'MANAGEMENT', exec: 'MANAGEMENT', seniormanagement: 'MANAGEMENT',
  director: 'MANAGEMENT', managingdirector: 'MANAGEMENT', md: 'MANAGEMENT', ceo: 'MANAGEMENT',
  hod: 'HOD', headofdepartment: 'HOD', hr: 'HR', humanresources: 'HR',
  admin: 'ADMIN', administrator: 'ADMIN', systemadministrator: 'ADMIN',
} as const;

/** How each access role is named on screen. */
export const ACCESS_ROLE_LABELS: Record<OnboardingAccountRole, string> = {
  EMPLOYEE: 'Employee', MANAGEMENT: 'Executive', HOD: 'HOD', HR: 'HR', ADMIN: 'Admin',
};

export type OnboardingAccountRole = typeof ACCESS_LEVEL_VALUES[keyof typeof ACCESS_LEVEL_VALUES];
export type RegistrationAccess = 'ALLOWED' | 'ADMIN_REQUIRED' | 'INVALID_LEVEL' | 'FORBIDDEN';
export const ADMIN_REGISTRATION_MESSAGE = 'An Admin must register this access level.';

export function importedAccountRole(value: string | null | undefined): OnboardingAccountRole | undefined {
  const key = (value ?? '').replace(/\([^)]*\)/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return Object.prototype.hasOwnProperty.call(ACCESS_LEVEL_VALUES, key)
    ? ACCESS_LEVEL_VALUES[key as keyof typeof ACCESS_LEVEL_VALUES] : undefined;
}

export function canRegisterOnboarding(actorRole: string | null | undefined): boolean {
  return actorRole === 'ADMIN' || actorRole === 'SUPER_ADMIN' || actorRole === 'HR';
}

/**
 * Everyone registers as Employee, so HR and Admins can register any row. The sheet's access value is only a
 * suggestion (see suggestedAccessRole) that an Admin approves after registration.
 */
export function registrationAccess(actorRole: string | null | undefined, _value?: string | null): RegistrationAccess {
  return canRegisterOnboarding(actorRole) ? 'ALLOWED' : 'FORBIDDEN';
}

/** The role every imported person starts with. */
export const REGISTRATION_ROLE: OnboardingAccountRole = 'EMPLOYEE';

/** The sheet's access value as a suggestion for an Admin: a recognised level above Employee, otherwise none. */
export function suggestedAccessRole(value: string | null | undefined): Exclude<OnboardingAccountRole, 'EMPLOYEE'> | undefined {
  const role = importedAccountRole(value);
  return role && role !== 'EMPLOYEE' ? role : undefined;
}

/** Roles an Admin can give in EMS, lowest first. Super Admin is never given here. */
export const ASSIGNABLE_ROLES: readonly OnboardingAccountRole[] = ['EMPLOYEE', 'MANAGEMENT', 'HOD', 'HR', 'ADMIN'];

/** Only Admins (and Super Admins) change access or decide suggestions. */
export function canChangeAccess(actorRole: string | null | undefined): boolean {
  return actorRole === 'ADMIN' || actorRole === 'SUPER_ADMIN';
}

export function registrationOutcomeMessage(result: {registered: number; failed: number; awaitingAdmin?: number}): string {
  const parts = [`Registration result · ${result.registered} registered`];
  if (result.failed) parts.push(`${result.failed} could not register`);
  if (result.awaitingAdmin) parts.push(`${result.awaitingAdmin} ${result.awaitingAdmin === 1 ? 'requires' : 'require'} an Admin to register`);
  return parts.join(' · ');
}
