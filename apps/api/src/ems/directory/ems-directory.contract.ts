/** Read-only EMS data for BEES modules. Employee IDs are records in one company, not global login IDs.
 * Calling controllers retain their module/tenant guards. This module exposes no public HTTP routes or writes. */
export type EmsHodState =
  | 'ASSIGNED'
  | 'PENDING'
  | 'UNASSIGNED'
  | 'NOT_RECORDED'
  | 'NEEDS_ATTENTION';
export type EmsDetailTier = 'BASIC' | 'MANAGER' | 'FULL';
export interface EmsDirectoryPerson {
  id: string;
  name: string;
  employeeCode: string | null;
  jobTitle: string | null;
  departmentId: string | null;
  branch: string | null;
  /** Existing EMS normalised key; a label/key is not a permanent location record ID. */
  branchKey: string;
  section: string | null;
  employmentStatus: string;
  active: boolean;
  avatarUrl: string | null;
  reporting: {
    managerId: string | null;
    body: string | null;
    state:
      | 'MANAGER'
      | 'MANAGER_INACTIVE'
      | 'BODY'
      | 'UNASSIGNED'
      | 'PENDING'
      | 'UNAVAILABLE'
      | 'CONFLICT';
  };
}
export interface EmsDirectory {
  schemaVersion: 1;
  source: 'EMS';
  loadedAt: string;
  company: { id: string; name: string };
  departments: { id: string; name: string }[];
  people: EmsDirectoryPerson[];
  /** Job titles must never be mistaken for recorded positions or saved as position IDs. */
  capabilities: { recordedPositions: false };
}
export interface EmsDepartmentHod {
  departmentId: string;
  branchKey: string;
  branchLabel: string;
  state: EmsHodState;
  /** Only a registered, active/probation employee can be an assigned HOD. Draft identities stay in onboarding. */
  person: {
    id: string;
    name: string;
    employeeCode: string | null;
    jobTitle: string | null;
    avatarUrl: string | null;
  } | null;
}
export interface EmsOrganisationSnapshot extends EmsDirectory {
  hodAssignments: EmsDepartmentHod[];
}
export interface EmsPersonDetails {
  tier: EmsDetailTier;
  employeeId: string;
  name: string;
  employeeCode: string | null;
  jobTitle: string | null;
  department: { id: string; name: string } | null;
  branch: string | null;
  section: string | null;
  subSection: string | null;
  manager: { employeeId: string; name: string } | null;
  work?: {
    status: string;
    employmentType: string | null;
    dateJoined: string | null;
    shift: string | null;
    workStation: string | null;
    level: string | null;
    grade: string | null;
    skillLevel: string | null;
    trainingNeeded: boolean | null;
  };
  role?: {
    jobCategory: string | null;
    primaryWorkRole: string | null;
    machineProcess: string | null;
    hrRecordOwner: { employeeId: string; name: string } | null;
    canBeLeader: boolean;
    canBeMember: boolean;
    canBeAssignedTasks: boolean;
  };
  history: null;
  emsProfileUrl: string | null;
}
