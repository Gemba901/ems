import type { PlanningPerson, PlanningReferences } from './planning.types';

export const PLANNING_PEOPLE_SOURCE = Symbol('PLANNING_PEOPLE_SOURCE');
export const PLANNING_PEOPLE_METADATA_SOURCE = Symbol(
  'PLANNING_PEOPLE_METADATA_SOURCE',
);

export interface PlanningDirectory {
  departments: PlanningReferences['departments'];
  people: PlanningPerson[];
  teams: PlanningReferences['teams'];
  source: string;
  refreshedAt: string;
  /** Actual source-record update time; never substituted with fetch time. */
  sourceUpdatedAt?: string;
}

export interface PlanningEmployeeContext {
  id: string;
  departmentId: string | null;
  reportingManagerId: string | null;
}

/** Shared structure supplies descriptions; this boundary supplies planning references. */
export interface PlanningPeopleSource {
  getDirectory(organizationId: string): Promise<PlanningDirectory>;
  getAccountName(
    organizationId: string,
    userId: string,
  ): Promise<string | null>;
  getTimeZone(organizationId: string): Promise<string>;
  findEligibleEmployee(
    organizationId: string,
    employeeId: string,
  ): Promise<PlanningEmployeeContext | null>;
  departmentExists(
    organizationId: string,
    departmentId: string,
  ): Promise<boolean>;
}

export interface PlanningPersonMetadata {
  id: string;
  /** Current identity scope; must agree with the descriptive structure snapshot. */
  departmentId: string | null;
  /** Null without a linked account membership in the requested organisation. */
  userId: string | null;
  role: string;
  /** Preserve the existing department + trimmed section team identity. */
  section: string | null;
  updatedAt: string;
}

/**
 * Temporary read-only source for fields absent from the shared structure contract.
 * Replace this binding when EMS publishes account/role and reporting metadata.
 * All methods are scoped to the requested organisation; no personal contacts.
 */
export interface PlanningPeopleMetadataSource {
  getPeopleMetadata(
    organizationId: string,
    employeeIds: string[],
  ): Promise<PlanningPersonMetadata[]>;
  getAccountName(
    organizationId: string,
    userId: string,
  ): Promise<string | null>;
  getTimeZone(organizationId: string): Promise<string>;
  findEligibleEmployee(
    organizationId: string,
    employeeId: string,
  ): Promise<PlanningEmployeeContext | null>;
}
