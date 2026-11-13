/**
 * The 02.02 position chart as the page receives it. Mirrors the API's position-chart.contract.ts (the web app can't
 * import API code); keep the two in step until the shape moves into LEX's shared contracts.
 */
export interface PositionHolder { employeeId: string; name: string; status: 'ACTIVE' | 'PROBATION' }
export interface Position {
  id: string; parentId: string | null; title: string;
  /** Web only: a holder of a shared role, shown as a person card when that role is opened. */
  person?: PositionHolder;
  unit: { departmentId: string | null; name: string; branch: string | null } | null;
  holders: PositionHolder[]; vacant: boolean; basis: 'RECORDED' | 'INFERRED_FROM_PEOPLE';
}
export interface PositionCheck {
  kind: 'NO_MANAGER' | 'MANAGER_MISSING' | 'MANAGER_INACTIVE' | 'REPORTING_LOOP' | 'NO_JOB_TITLE';
  severity: 'ERROR' | 'WARNING'; count: number; people: string[]; employeeIds: string[]; message: string;
}
/** How much of a person's record this viewer may see (decided by the API; see the contract). */
export type DetailTier = 'BASIC' | 'MANAGER' | 'FULL';
export interface PersonDetails {
  tier: DetailTier; employeeId: string; name: string; employeeCode: string | null; jobTitle: string | null;
  department: { id: string; name: string } | null; branch: string | null; section: string | null; subSection: string | null;
  manager: { employeeId: string; name: string } | null;
  work?: { status: string; employmentType: string | null; dateJoined: string | null; shift: string | null; workStation: string | null;
    level: string | null; grade: string | null; skillLevel: string | null; trainingNeeded: boolean | null };
  role?: { jobCategory: string | null; primaryWorkRole: string | null; machineProcess: string | null;
    hrRecordOwner: { employeeId: string; name: string } | null; canBeLeader: boolean; canBeMember: boolean; canBeAssignedTasks: boolean };
  history: null; emsProfileUrl: string | null;
}
export interface PositionChart {
  source: { kind: 'EMS' | 'CORE_RECORDS' | 'SAMPLE'; label: string; loadedAt: string };
  company: { id: string; name: string };
  multiBranch: boolean;
  positions: Position[];
  people: { onChart: number; probation: number; notConnected: number };
  checks: PositionCheck[];
}
