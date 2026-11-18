// Shared policy contract: keep the API and web copies in sync.
// Job title, department and HOD appointment never determine account access.
export const ACCESS_LEVEL_VALUES = {
  employee: 'EMPLOYEE', supervisor: 'EMPLOYEE',
  management: 'MANAGEMENT', manager: 'MANAGEMENT',
  hod: 'HOD', headofdepartment: 'HOD', hr: 'HR', humanresources: 'HR',
  admin: 'ADMIN', administrator: 'ADMIN', systemadministrator: 'ADMIN',
} as const;

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

export function registrationAccess(actorRole: string | null | undefined, value: string | null | undefined): RegistrationAccess {
  if (!canRegisterOnboarding(actorRole)) return 'FORBIDDEN';
  const target = importedAccountRole(value);
  if (!target) return 'INVALID_LEVEL';
  return actorRole === 'HR' && target !== 'EMPLOYEE' ? 'ADMIN_REQUIRED' : 'ALLOWED';
}

export function registrationOutcomeMessage(result: {registered: number; failed: number; awaitingAdmin?: number}): string {
  const parts = [`Registration result · ${result.registered} registered`];
  if (result.failed) parts.push(`${result.failed} could not register`);
  if (result.awaitingAdmin) parts.push(`${result.awaitingAdmin} ${result.awaitingAdmin === 1 ? 'requires' : 'require'} an Admin to register`);
  return parts.join(' · ');
}
