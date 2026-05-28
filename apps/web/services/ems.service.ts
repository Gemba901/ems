import { apiClient } from "@/lib/api-client";
const API_URL = process.env.NEXT_PUBLIC_API_URL;

function authHeaders(token: string) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Request failed with status ${res.status}`);
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

export interface EmployeeProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
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
  workStation: string | null;
  section: string | null;
  subSection: string | null;
  shift: string | null;
  reportingManagerId: string | null;
  reportingManager: { id: string; firstName: string; lastName: string } | null;
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

export interface CompletionResult {
  overall: number;
  groups: Record<GroupKey, number>;
  lowestGroup?: GroupKey;
}

export interface EmployeeWithCompletion extends EmployeeProfile {
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
  workStation?: string;
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

// ── Client ────────────────────────────────────────────────────────────────────

export const EmsService = {
  async getMyProfile(token: string): Promise<{ employee: EmployeeProfile; completion: CompletionResult }> {
    const res = await apiClient(`${API_URL}/ems/me`, { headers: authHeaders(token) }, token);
    return handleResponse(res);
  },

  async getDashboard(token: string): Promise<EmsDashboard> {
    const res = await apiClient(`${API_URL}/ems/dashboard`, { headers: authHeaders(token) }, token);
    return handleResponse(res);
  },

  async getEmployees(
    token: string,
    params: { page?: number; limit?: number; departmentId?: string; employmentStatus?: EmploymentStatus },
  ): Promise<{ data: EmployeeWithCompletion[]; pagination: { page: number; limit: number; total: number; pages: number } }> {
    const q = Object.entries(params)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join("&");
    const res = await apiClient(`${API_URL}/ems/employees${q ? `?${q}` : ""}`, { headers: authHeaders(token) }, token);
    return handleResponse(res);
  },

  async getEmployee(id: string, token: string): Promise<{ employee: EmployeeProfile; completion: CompletionResult }> {
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
