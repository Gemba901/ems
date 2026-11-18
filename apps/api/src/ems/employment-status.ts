import { EmploymentStatus } from 'db';

export const ACTIVE_EMPLOYMENT_STATUSES: EmploymentStatus[] = ['ACTIVE', 'PROBATION'];
export const INACTIVE_EMPLOYMENT_STATUSES: EmploymentStatus[] = ['RESIGNED', 'TERMINATED', 'RETIRED', 'SUSPENDED', 'ABSCONDED', 'CONTRACT_ENDED'];

// This answers only the employment-status part of future invitation eligibility.
// Channel, identity, consent and existing invitation checks belong to the sender.
export function isActiveEmployment(status: unknown): boolean {
  return status === 'ACTIVE' || status === 'PROBATION';
}

export function employmentActivityState(status: EmploymentStatus): 'ACTIVE' | 'INACTIVE' {
  return isActiveEmployment(status) ? 'ACTIVE' : 'INACTIVE';
}
