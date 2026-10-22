import type { FiveSLocationCategory } from '@/components/ems/five-s-location';
import type { ImportedExtraField } from '@/components/ems/onboarding-extra-fields';
import { apiClient } from "@/lib/api-client";
const API_URL = "/api";

function authHeaders(token: string) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const rawMessage = err?.message;

    const messages: string[] = Array.isArray(rawMessage)
      ? rawMessage.filter(
          (message): message is string => typeof message === "string",
        )
      : typeof rawMessage === "string"
        ? [rawMessage]
        : [];

    const requiredReason = "An exclusion reason is required";

    const message = messages.includes(requiredReason)
      ? requiredReason
      : messages.filter(Boolean).join("; ");

    throw new Error(
      message || `Request failed with status ${res.status}`,
    );
  }

  return res.json();
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type EmploymentStatus =
  | "ACTIVE" | "PROBATION" | "RESIGNED" | "TERMINATED"
  | "RETIRED" | "SUSPENDED" | "ABSCONDED" | "CONTRACT_ENDED";

export type EmploymentType = "FULL_TIME" | "PART_TIME" | "CONTRACT" | "INTERN" | "CASUAL";

export type Gender = "MALE" | "FEMALE" | "OTHER";

export type SkillLevel = "LEVEL_1" | "LEVEL_2" | "LEVEL_3" | "LEVEL_4";

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  FULL_TIME: "Full Time",
  PART_TIME: "Part Time",
  CONTRACT:  "Contract",
  INTERN:    "Intern",
  CASUAL:    "Casual",
};

export type GroupKey =
  | "IDENTITY" | "WORK_ALLOCATION" | "ROLE_RESPONSIBILITY" | "CONTACT" | "SKILL";

export const GROUP_LABELS: Record<GroupKey, string> = {
  IDENTITY:           "Employee Basic Identity",
  WORK_ALLOCATION:    "Work Allocation",
  ROLE_RESPONSIBILITY: "Role & Responsibility",
  CONTACT:            "Contact",
  SKILL:              "Skill",
};

export const EMPLOYMENT_STATUS_LABELS: Record<EmploymentStatus, string> = {
  ACTIVE:         "Active",
  PROBATION:      "Probation",
  RESIGNED:       "Resigned",
  TERMINATED:     "Terminated",
  RETIRED:        "Retired",
  SUSPENDED:      "Suspended",
  ABSCONDED:      "Absconded",
  CONTRACT_ENDED: "Contract Ended",
};

export const SKILL_LEVEL_LABELS: Record<SkillLevel, string> = {
  LEVEL_1: "Level 1 — Learner",
  LEVEL_2: "Level 2 — Can Work with Support",
  LEVEL_3: "Level 3 — Can Work Independently",
  LEVEL_4: "Level 4 — Can Train Others",
};

export interface EmployeeImportSource {
  recordId: string;
  importedAt: string;
  batchId: string;
  label: string | null;
  sourceFileName: string | null;
  rowNumber: number | null;
  registeredAt: string | null;
}

export interface EmployeeProfile {
  importedExtraFields?: ImportedExtraField[] | null;
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  departmentId: string | null;
  department: { id: string; name: string } | null;
  updatedAt: string | null;

  // Identity
  employeeCode: string | null;
  middleName: string | null;
  gender: Gender | null;
  dateOfBirth: string | null;
  nationalId: string | null;
  nationality: string | null;

  // Work Allocation
  employmentStatus: EmploymentStatus;
  employmentType: EmploymentType | null;
  jobTitle: string | null;
  dateJoined: string | null;
  plantBranch: string | null;
  workStation: string | null;
  fiveSLocationCategory?: FiveSLocationCategory | null;
  section: string | null;
  subSection: string | null;
  shift: string | null;
  reportingManagerId: string | null;
  reportsToBoard: boolean;
  reportingBody?: string | null;
  pendingReportingRecordId: string | null;
  reportingManager: {
    id: string; firstName: string; lastName: string;
    jobTitle?: string | null; avatarUrl?: string | null;
  } | null;
  hrRecordOwnerId: string | null;
  hrRecordOwner: { id: string; firstName: string; lastName: string } | null;

  // Role & Responsibility
  jobDescription: string | null;
  level: string | null;
  grade: string | null;
  jobCategory: string | null;
  primaryWorkRole: string | null;
  machineProcess: string | null;
  canBeAssignedTasks: boolean;
  canBeMember: boolean;
  canBeLeader: boolean;

  // Contact
  whatsappNumber: string | null;
  homeAddress: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelationship: string | null;

  // Skill
  skillLevel: SkillLevel | null;
  trainingNeeded: boolean | null;

  // Steering Committee (read-only)
  committeeMembers: Array<{
    roleInCommittee: string | null;
    committee: { id: string; name: string; type: string };
  }>;
}

export interface Reportee {
  id: string;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
  avatarUrl: string | null;
  employeeCode: string | null;
}

export interface PublicHoliday {
  date: string; // YYYY-MM-DD
  name: string;
}

export interface MyProfileResponse {
  employee: EmployeeProfile;
  completion: CompletionResult;
  reportees?: Reportee[];
  reporteeCount?: number;
  upcomingHolidays?: PublicHoliday[];
  /** 0 = Sunday … 6 = Saturday */
  workingDays?: number[];
}

export interface CompletionResult {
  overall: number;
  groups: Record<GroupKey, number>;
  lowestGroup?: GroupKey;
}

export type EmployeeListSort = 'BEST_MATCH' | 'NAME_ASC' | 'NAME_DESC' | 'IMPORT_NEWEST' | 'IMPORT_OLDEST';
export interface EmployeeImportBatch { id: string; label: string | null; sourceFileName: string | null; importedAt: string }

export interface EmployeeWithCompletion extends EmployeeProfile {
  sourceImport?: EmployeeImportSource | null;
  completion: CompletionResult;
}

export interface GroupSummaryItem {
  key: GroupKey;
  label: string;
  avgCompletion: number;
  status: string;
  message: string;
}

export interface EmsDashboard {
  summary: {
    total: number;
    activeOrProbation: number;
    overallAvg: number;
    recordsNeedingUpdate: number;
    avgAge: number | null;
    avgService: number | null;
  };
  groupSummary: GroupSummaryItem[];
  statusCounts: Record<string, number>;
  genderCounts: Record<string, number>;
  skillCounts: Record<string, number>;
  deptBreakdown: { id: string; name: string; activeCount: number; totalCount: number; pct: number }[];
  committeeSummary: { id: string; name: string; type: string; memberCount: number; pctOfEmployees: number }[];
  priorityEmployees: {
    id: string;
    employeeCode: string | null;
    firstName: string;
    lastName: string;
    department: { id: string; name: string } | null;
    overall: number;
    lowestGroup: GroupKey;
    lowestGroupLabel: string;
  }[];
}

export interface EmploymentStatusDetail {
  status: EmploymentStatus;
  activityState: 'ACTIVE' | 'INACTIVE';
  revision: number;
  updatedAt: string;
  syncChangeId: string | null;
  activitySync: string | null;
  history: { id: string; fromStatus: EmploymentStatus; toStatus: EmploymentStatus; reason: string; actorName: string | null; actorUserId: string; source: string; changedAt: string; activitySync: string }[];
  hasMoreHistory: boolean;
}
export interface ChangeEmploymentStatusPayload {
  status: EmploymentStatus;
  reason: string;
  expectedRevision: number;
  expectedUpdatedAt: string;
  requestId: string;
}

export interface UpdateEmployeeEmsPayload {
  // Identity
  employeeCode?: string;
  middleName?: string;
  gender?: Gender;
  dateOfBirth?: string;
  nationalId?: string;
  nationality?: string;

  // Work Allocation
  employmentStatus?: EmploymentStatus;
  employmentType?: EmploymentType;
  jobTitle?: string;
  dateJoined?: string;
  plantBranch?: string;
  workStation?: string;
  fiveSLocationCategory?: FiveSLocationCategory | null;
  section?: string;
  subSection?: string;
  shift?: string;
  reportingManagerId?: string;
  hrRecordOwnerId?: string;

  // Role & Responsibility
  jobDescription?: string;
  level?: string;
  grade?: string;
  jobCategory?: string;
  primaryWorkRole?: string;
  machineProcess?: string;
  canBeAssignedTasks?: boolean;
  canBeMember?: boolean;
  canBeLeader?: boolean;

  // Contact
  whatsappNumber?: string;
  homeAddress?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelationship?: string;

  // Skill
  skillLevel?: SkillLevel;
  trainingNeeded?: boolean;
}

//standalone onboarding front
export type OnboardingBatchStatus =
  | "DRAFT" | "VALIDATING" | "READY" | "PARTIALLY_REGISTERED" | "REGISTERED" | "CANCELLED";

export type OnboardingRecordStatus =
  | "DRAFT" | "NEEDS_FIXING" | "READY" | "REGISTERED" | "EXCLUDED";

export const BATCH_STATUS_LABELS: Record<OnboardingBatchStatus, string> = {
  DRAFT:                "Draft",
  VALIDATING:           "Validating",
  READY:                "Ready",
  PARTIALLY_REGISTERED: "Partially registered",
  REGISTERED:           "Registered",
  CANCELLED:            "Cancelled",
};

export const RECORD_STATUS_LABELS: Record<OnboardingRecordStatus, string> = {
  DRAFT:        "Draft",
  NEEDS_FIXING: "Needs fixing",
  READY:        "Ready",
  REGISTERED:   "Registered",
  EXCLUDED:     "Excluded",
};

export type CommunicationChannel = "WHATSAPP" | "EMAIL";

export const COMMUNICATION_CHANNEL_LABELS: Record<CommunicationChannel, string> = {
  WHATSAPP: "WhatsApp",
  EMAIL:    "Email",
};

/** The operation committed. This does not mean every imported row is Ready. */
export interface OnboardingBatchAcknowledgement {
  id: string;
}

export interface OnboardingBatchSummary {
  id: string;
  label: string | null;
  sourceFileName: string | null;
  defaultPhoneCountry: string | null;
  status: OnboardingBatchStatus;
  createdAt: string;
  uploadedBy: { id: string; name: string } | null;
  _count: { records: number };
   /** Present on list/create responses. NEEDS_FIXING includes upstream-chain waiting. */
  statusCounts?: Record<OnboardingRecordStatus, number>;
}

export interface ReportingOption {
  target: string; name: string; designation: string; employeeCode: string; department: string; branch: string;
  /** People-link responses include these identifiers; other reporting responses may omit them. */
  employeeId?: string | null; recordId?: string; batchId?: string;
}
export type PersonSuggestion = ReportingOption & { suggestionReasons?: string[] };
export type ReportingState = 'BOARD' | 'BODY' | 'ASSIGNED' | 'PENDING' | 'UNKNOWN' | 'NEEDS_ATTENTION';
export interface ReportingChainItem {
  target: string; name: string; label: string; designation: string; employeeCode: string;
  recordId?: string; employeeId?: string;
  status: 'PENDING' | 'REGISTERED' | 'NEEDS_ATTENTION' | 'UNKNOWN' | 'BOARD' | 'BODY';
}
export interface ReportingResolution {
  /** Person whose reporting assignment needs correction, from the full validation walk. */
  blocker?: { target: string; label: string; reason: string; recordId?: string; batchId?: string; employeeId?: string };
  target: string | null; error: string | null; warning: string | null; depth: number | null;
  state: ReportingState; managerName: string | null;
  errorScope?: 'DIRECT' | 'UPSTREAM';
  chain?: ReportingChainItem[];
  chainEnd?: 'BOARD' | 'BODY' | 'UNRESOLVED' | 'UNKNOWN' | 'CYCLE' | 'LIMIT';
}
export interface EmployeeReportingDetail { assignment: ReportingResolution; options: ReportingOption[]; }
export const REPORTING_STATE_LABELS: Record<ReportingState, string> = {
  BOARD: 'Reports to Board', BODY: 'Top-level reporting body assigned', ASSIGNED: 'Manager assigned', PENDING: 'Valid manager assignment pending',
  UNKNOWN: 'Reporting information incomplete', NEEDS_ATTENTION: 'Reporting needs attention',
};

export type DuplicateReason = 'EMPLOYEE_CODE' | 'PERSONAL_MOBILE' | 'SAME_NAME' | 'NAME_FORMAT' | 'PARTIAL_NAME' | 'SIMILAR_NAME';
export interface DuplicateMatch {
  key: string;
  kind: 'EMPLOYEE' | 'IMPORT';
  employeeId: string | null;
  recordId: string | null;
  batchId: string | null;
  batchLabel: string | null;
  sourceFileName: string | null;
  rowNumber: number | null;
  name: string;
  employeeCode: string | null;
  personalMobile: string | null;
  department: string | null;
  designation: string | null;
  branch: string | null;
  reasons: DuplicateReason[];
  supportingDetails: ('DEPARTMENT' | 'DESIGNATION' | 'BRANCH')[];
}
export interface DuplicateReview {
  token: string | null;
  hardConflicts: DuplicateMatch[];
  possibleMatches: DuplicateMatch[];
  reviewed: boolean;
  requiresReview: boolean;
  blocked: boolean;
  confirmedAt: string | null;
}

export interface OnboardingRecord {
  extraFields?: ImportedExtraField[] | null;
  reliever1RecordId?: string | null; reliever1EmployeeId?: string | null;
  reliever2RecordId?: string | null; reliever2EmployeeId?: string | null;
  reportingToRecordId: string | null;
  reportingToEmployeeId: string | null;
  reportingToBoard: boolean;
  reportingToBody?: string | null;
  id: string;
  rowNumber: number | null;
  companyCode: string | null;
  plantBranchCode: string | null;
  employeeCode: string | null;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  mobileNumber: string | null;
  whatsappNumber: string | null;
  workEmail: string | null;
  gender: string | null;
  nationality: string | null;
  currentDepartment: string | null;
  hodName: string | null;
  hodDesignation: string | null;
  workArea: string | null;
  fiveSLocationCategory?: string | null;
  subSection: string | null;
  jobDesignation: string | null;
  beesAccessLevel: string | null;
  shift: string | null;
  reportingToName: string | null;
  reportingToDesignation: string | null;
  employmentStatus: string | null;
  employmentType: string | null;
  reliever1Name: string | null;
  reliever1Designation: string | null;
  reliever2Name: string | null;
  reliever2Designation: string | null;
  status: OnboardingRecordStatus;
  validationErrors: { field: string; message: string; code?: string }[] | null;
  duplicateReview?: DuplicateReview | null;
  exclusionReason: string | null;
  employeeId: string | null;
  registeredAt: string | null;
}

export interface PersonLinkResolution {
  target: string | null;
  state: 'UNASSIGNED' | 'ASSIGNED' | 'PENDING' | 'NEEDS_ATTENTION';
  person: ReportingOption | null;
  error: string | null;
  warning: string | null;
  suggestions?: PersonSuggestion[];
}
export interface HodEvidence {
  total: number; blank: number;
  groups: {name: string; designation: string; count: number; records: {id: string; name: string; employeeCode: string; rowNumber: number | null}[]}[];
}
export interface HodDirectoryEntry {
  key: string; source: 'CONFIRMED' | 'IMPORTED'; department: string; branch: string;
  departmentId?: string | null; branchKey?: string;
  target: string | null; person: ReportingOption | null; selectable: boolean; note: string | null;
}
export interface DepartmentHodResolution extends PersonLinkResolution {
  recordedSuggestions?: PersonSuggestion[];
  evidenceKey?: string;
  departmentId: string | null; departmentName: string; branchKey: string; branchLabel: string;
  version: string; reviewKey: string | null; suggestedTarget: string | null; affectedRecords: number;
}
export interface RecordPeopleLinks {
  hod: DepartmentHodResolution; first: PersonLinkResolution; second: PersonLinkResolution;
}
export interface EmployeePeopleLinks {
  hasHodAssignment?: boolean;
  hodDirectory?: HodDirectoryEntry[]; recordedHodSuggestions?: PersonSuggestion[];
  previousHod: {name: string; designation: string} | null;
  hod: PersonLinkResolution; first: PersonLinkResolution; second: PersonLinkResolution;
  departmentId: string | null; departmentName: string; branchLabel: string;
  options: ReportingOption[]; hodOptions: ReportingOption[]; version: string; hodVersion: string;
}

export interface OnboardingFieldOptions {
  departments: { name: string; usable: boolean }[];
  designations: { value: string; departments: string[]; existing: boolean; imported: boolean }[];
}

export interface OnboardingBatchDetail extends OnboardingBatchSummary {
  fieldOptions?: OnboardingFieldOptions;
  peopleLinks?: { hodEvidence?: Record<string, HodEvidence>; hodDirectory?: HodDirectoryEntry[]; options: ReportingOption[]; byRecord: Record<string, RecordPeopleLinks> };
  hierarchy: { suggestionsByRecord?: Record<string, PersonSuggestion[]>; options: ReportingOption[]; byRecord: Record<string, ReportingResolution>; orderedIds: string[] };
  organizationId: string;
  records: OnboardingRecord[];
}

export interface UpdateOnboardingRecordPayload {
  extraFields?: ImportedExtraField[];
  reliever1Target?: string;
  reliever2Target?: string;
  reportingTarget?: string;
  companyCode?: string;
  plantBranchCode?: string;
  employeeCode?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  mobileNumber?: string;
  whatsappNumber?: string;
  workEmail?: string;
  gender?: string;
  nationality?: string;
  currentDepartment?: string;
  hodName?: string;
  hodDesignation?: string;
  workArea?: string;
  fiveSLocationCategory?: string;
  subSection?: string;
  jobDesignation?: string;
  beesAccessLevel?: string;
  shift?: string;
  reportingToName?: string;
  reportingToDesignation?: string;
  employmentStatus?: string;
  employmentType?: string;
  reliever1Name?: string;
  reliever1Designation?: string;
  reliever2Name?: string;
  reliever2Designation?: string;
}

// ── Client ────────────────────────────────────────────────────────────────────

export const EmsService = {
  async updateOnboardingDepartmentHod(batchId: string, data: {recordId: string; target: string; expectedVersion: string}, token: string): Promise<OnboardingBatchDetail> {
    return handleResponse(await apiClient(`${API_URL}/ems/onboarding/batches/${batchId}/department-hod`, {method: 'PATCH', headers: authHeaders(token), body: JSON.stringify(data)}, token));
  },
  async getEmployeePeopleLinks(employeeId: string, token: string): Promise<EmployeePeopleLinks> {
    return handleResponse(await apiClient(`${API_URL}/ems/employees/${employeeId}/people-links`, {headers: authHeaders(token)}, token));
  },
  async updateEmployeeRelievers(employeeId: string, data: {first: string; second: string; expectedVersion: string}, token: string): Promise<EmployeePeopleLinks> {
    return handleResponse(await apiClient(`${API_URL}/ems/employees/${employeeId}/relievers`, {method: 'PATCH', headers: authHeaders(token), body: JSON.stringify(data)}, token));
  },
  async updateEmployeeDepartmentHod(employeeId: string, data: {target: string; expectedVersion: string}, token: string): Promise<EmployeePeopleLinks> {
    return handleResponse(await apiClient(`${API_URL}/ems/employees/${employeeId}/department-hod`, {method: 'PATCH', headers: authHeaders(token), body: JSON.stringify(data)}, token));
  },
  async getMyProfile(token: string): Promise<MyProfileResponse> {
    const res = await apiClient(`${API_URL}/ems/me`, { headers: authHeaders(token) }, token);
    return handleResponse(res);
  },

  async getDashboard(token: string): Promise<EmsDashboard> {
    const res = await apiClient(`${API_URL}/ems/dashboard`, { headers: authHeaders(token) }, token);
    return handleResponse(res);
  },

  async getEmployees(
    token: string,
    params: { page?: number; limit?: number; departmentId?: string; employmentStatus?: EmploymentStatus; activityState?: 'ACTIVE' | 'INACTIVE'; search?: string; source?: 'IMPORTED' | 'UNLINKED'; importBatchId?: string; sort?: EmployeeListSort },
  ): Promise<{ data: EmployeeWithCompletion[]; pagination: { page: number; limit: number; total: number; pages: number } }> {
    const q = Object.entries(params)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join("&");
    const res = await apiClient(`${API_URL}/ems/employees${q ? `?${q}` : ""}`, { headers: authHeaders(token) }, token);
    return handleResponse(res);
  },

  async getEmployeeImportBatches(token: string): Promise<EmployeeImportBatch[]> {
    return handleResponse(await apiClient(`${API_URL}/ems/employees/import-batches`, { headers: authHeaders(token) }, token));
  },

  async getEmploymentStatus(id: string, token: string): Promise<EmploymentStatusDetail> {
    return handleResponse(await apiClient(`${API_URL}/ems/employees/${id}/employment-status`, { headers: authHeaders(token) }, token));
  },
  async changeEmploymentStatus(id: string, data: ChangeEmploymentStatusPayload, token: string): Promise<EmploymentStatusDetail> {
    return handleResponse(await apiClient(`${API_URL}/ems/employees/${id}/employment-status`, {
      method: 'PATCH', headers: authHeaders(token), body: JSON.stringify(data),
    }, token));
  },
  async retryEmploymentActivitySync(id: string, changeId: string, token: string): Promise<EmploymentStatusDetail> {
    return handleResponse(await apiClient(`${API_URL}/ems/employees/${id}/employment-status/${changeId}/retry-sync`, {
      method: 'POST', headers: authHeaders(token),
    }, token));
  },

  async getEmployeeReporting(id: string, token: string): Promise<EmployeeReportingDetail> {
    const res = await apiClient(`${API_URL}/ems/employees/${id}/reporting`, { headers: authHeaders(token) }, token);
    return handleResponse(res);
  },
  async updateEmployeeReporting(id: string, target: string, token: string): Promise<EmployeeReportingDetail> {
    const res = await apiClient(`${API_URL}/ems/employees/${id}/reporting`, {
      method: 'PATCH', headers: authHeaders(token), body: JSON.stringify({ target }),
    }, token);
    return handleResponse(res);
  },

  async getEmployee(id: string, token: string): Promise<{ employee: EmployeeProfile; completion: CompletionResult; sourceImport?: EmployeeImportSource | null }> {
    const res = await apiClient(`${API_URL}/ems/employees/${id}`, { headers: authHeaders(token) }, token);
    return handleResponse(res);
  },

  async updateEmployee(
    id: string,
    data: UpdateEmployeeEmsPayload,
    token: string,
  ): Promise<{ employee: EmployeeProfile; completion: CompletionResult }> {
    const res = await apiClient(`${API_URL}/ems/employees/${id}`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    }, token);
    return handleResponse(res);
  },

  async getCommunicationChannel(
    token: string,
  ): Promise<{ communicationChannel: CommunicationChannel | null }> {
    const res = await apiClient(`${API_URL}/ems/onboarding/communication-channel`, {
      headers: authHeaders(token),
    }, token);
    return handleResponse(res);
  },

  async updateCommunicationChannel(
    communicationChannel: CommunicationChannel,
    token: string,
  ): Promise<{ communicationChannel: CommunicationChannel }> {
    const res = await apiClient(`${API_URL}/ems/onboarding/communication-channel`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify({ communicationChannel }),
    }, token);
    return handleResponse(res);
  },

  async resetCommunicationChannel(token: string): Promise<{ communicationChannel: null }> {
    const res = await apiClient(`${API_URL}/ems/onboarding/communication-channel`, {
      method: "DELETE",
      headers: authHeaders(token),
    }, token);
    return handleResponse(res);
  },

  async listOnboardingBatches(token: string): Promise<OnboardingBatchSummary[]> {
    const res = await apiClient(`${API_URL}/ems/onboarding/batches`, { headers: authHeaders(token) }, token);
    return handleResponse(res);
  },

  async getOnboardingBatch(id: string, token: string): Promise<OnboardingBatchDetail> {
    const res = await apiClient(`${API_URL}/ems/onboarding/batches/${id}`, { headers: authHeaders(token) }, token);
    return handleResponse(res);
  },

  async updateOnboardingBatchCountry(
    id: string, defaultPhoneCountry: string, token: string,
  ): Promise<OnboardingBatchDetail> {
    const res = await apiClient(`${API_URL}/ems/onboarding/batches/${id}/phone-country`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify({ defaultPhoneCountry }),
    }, token);
    return handleResponse(res);
  },

  async createOnboardingBatch(
    data: {
      label?: string;
      sourceFileName?: string;
      defaultPhoneCountry: string;
    },
    token: string,
  ): Promise<OnboardingBatchSummary> {
    const res = await apiClient(`${API_URL}/ems/onboarding/batches`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    }, token);
    return handleResponse(res);
  },

    async validateOnboardingBatch(id: string, token: string): Promise<OnboardingBatchDetail> {
    const res = await apiClient(`${API_URL}/ems/onboarding/batches/${id}/validate`, {
      method: "POST",
      headers: authHeaders(token),
    }, token);
    return handleResponse(res);
  },

  /** The new-import page loads the full detail after navigation. */
  async validateOnboardingBatchAck(id: string, token: string): Promise<OnboardingBatchAcknowledgement> {
    const res = await apiClient(`${API_URL}/ems/onboarding/batches/${id}/validate?response=ack`, {
      method: "POST",
      headers: authHeaders(token),
    }, token);
    return handleResponse(res);
  },

  async updateOnboardingRecord(
    id: string,
    data: UpdateOnboardingRecordPayload,
    token: string,
  ): Promise<OnboardingBatchDetail> {
    const res = await apiClient(`${API_URL}/ems/onboarding/records/${id}`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    }, token);
    return handleResponse(res);
  },

  async confirmOnboardingDifferentPerson(id: string, reviewToken: string, token: string): Promise<OnboardingBatchDetail> {
    const res = await apiClient(`${API_URL}/ems/onboarding/records/${id}/confirm-different-person`, {
      method: 'POST', headers: authHeaders(token), body: JSON.stringify({ token: reviewToken }),
    }, token);
    return handleResponse(res);
  },

  async undoOnboardingDifferentPerson(id: string, reviewToken: string, token: string): Promise<OnboardingBatchDetail> {
    const res = await apiClient(`${API_URL}/ems/onboarding/records/${id}/undo-different-person`, {
      method: 'POST', headers: authHeaders(token), body: JSON.stringify({ token: reviewToken }),
    }, token);
    return handleResponse(res);
  },

  async excludeOnboardingRecord(
    id: string,
    reason: string,
    token: string,
  ): Promise<OnboardingBatchDetail> {
    const res = await apiClient(`${API_URL}/ems/onboarding/records/${id}/exclude`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify({ reason }),
    }, token);
    return handleResponse(res);
  },

  async includeOnboardingRecord(id: string, token: string): Promise<OnboardingBatchDetail> {
    const res = await apiClient(`${API_URL}/ems/onboarding/records/${id}/include`, {
      method: "PATCH",
      headers: authHeaders(token),
    }, token);
    return handleResponse(res);
  },

  async addOnboardingRecords(
    batchId: string,
    data: { records: (UpdateOnboardingRecordPayload & { rowNumber?: number })[] },
    token: string,
  ): Promise<OnboardingBatchDetail> {
    const res = await apiClient(`${API_URL}/ems/onboarding/batches/${batchId}/records`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    }, token);
    return handleResponse(res);
  },

  /** Avoid rebuilding the growing batch after each upload chunk. */
  async addOnboardingRecordsAck(
    batchId: string,
    data: { records: (UpdateOnboardingRecordPayload & { rowNumber?: number })[] },
    token: string,
  ): Promise<OnboardingBatchAcknowledgement> {
    const res = await apiClient(`${API_URL}/ems/onboarding/batches/${batchId}/records?response=ack`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    }, token);
    return handleResponse(res);
  },

  async registerOnboardingBatch(
    id: string,
    token: string,
  ): Promise<{ registered: number; failed: number; awaitingAdmin?: number; batch: OnboardingBatchDetail }> {
    const res = await apiClient(`${API_URL}/ems/onboarding/batches/${id}/register`, {
      method: "POST",
      headers: authHeaders(token),
    }, token);
    return handleResponse(res);
  },

  async cancelOnboardingBatch(id: string, token: string): Promise<OnboardingBatchSummary> {
    const res = await apiClient(`${API_URL}/ems/onboarding/batches/${id}/cancel`, {
      method: "PATCH",
      headers: authHeaders(token),
    }, token);
    return handleResponse(res);
  },

async deleteOnboardingBatch(id: string, token: string): Promise<{ deleted: boolean }> {
    const res = await apiClient(`${API_URL}/ems/onboarding/batches/${id}`, {
      method: "DELETE",
      headers: authHeaders(token),
    }, token);
    return handleResponse(res);
  },
};

// ── Completion colour helpers ─────────────────────────────────────────────────

export function completionColor(pct: number): string {
  if (pct >= 97) return "text-emerald-600";
  if (pct >= 90) return "text-blue-600";
  if (pct >= 75) return "text-amber-600";
  return "text-red-600";
}

export function completionBg(pct: number): string {
  if (pct >= 97) return "bg-emerald-500";
  if (pct >= 90) return "bg-blue-500";
  if (pct >= 75) return "bg-amber-500";
  return "bg-red-500";
}

export function completionRing(pct: number): string {
  if (pct >= 97) return "ring-emerald-200";
  if (pct >= 90) return "ring-blue-200";
  if (pct >= 75) return "ring-amber-200";
  return "ring-red-200";
}


