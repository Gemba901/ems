import { apiClient } from "@/lib/api-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function authHeaders(token: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || `Request failed with status ${res.status}`);
  }
  return res.json();
}

export type SteelHeatApprovalStage =
  | "A01_TAKE_SAMPLE"
  | "A02_ANALYZE_SAMPLE"
  | "A03_COMPARE_CHEMISTRY"
  | "A04_DECIDE_CORRECTION"
  | "A05_ADD_CORRECTION_MATERIAL"
  | "A06_RETEST_CHEMISTRY"
  | "A07_CHECK_TEMPERATURE"
  | "A08_CHECK_LADLE_READINESS"
  | "A09_APPROVE_CHEMISTRY_TEMPERATURE"
  | "A10_CONFIRM_HEAT_NUMBER"
  | "A11_TAPPING_APPROVAL"
  | "A12_TAP_TO_LADLE"
  | "A13_RELEASE_TO_CASTING";

export type SteelHeatApprovalStatus = "DRAFT" | "IN_PROGRESS" | "ON_HOLD" | "CLOSED" | "CANCELLED";

export type AllowedHeatApprovalAction =
  | "ANALYZE_SAMPLE"
  | "COMPARE_CHEMISTRY"
  | "DECIDE_CORRECTION"
  | "ADD_CORRECTION_MATERIAL"
  | "RETEST_CHEMISTRY"
  | "CHECK_TEMPERATURE"
  | "CHECK_LADLE_READINESS"
  | "APPROVE_CHEMISTRY_TEMPERATURE"
  | "CONFIRM_HEAT_NUMBER"
  | "TAPPING_APPROVAL"
  | "TAP_TO_LADLE"
  | "RELEASE_TO_CASTING";

export const HEAT_APPROVAL_STAGE_LABELS: Record<SteelHeatApprovalStage, string> = {
  A01_TAKE_SAMPLE: "Sample Taken",
  A02_ANALYZE_SAMPLE: "Sample Analyzed",
  A03_COMPARE_CHEMISTRY: "Chemistry Compared",
  A04_DECIDE_CORRECTION: "Correction Decided",
  A05_ADD_CORRECTION_MATERIAL: "Correction Material Added",
  A06_RETEST_CHEMISTRY: "Chemistry Re-tested",
  A07_CHECK_TEMPERATURE: "Temperature Checked",
  A08_CHECK_LADLE_READINESS: "Ladle Readiness Checked",
  A09_APPROVE_CHEMISTRY_TEMPERATURE: "Chemistry & Temperature Approved",
  A10_CONFIRM_HEAT_NUMBER: "Heat Number Confirmed",
  A11_TAPPING_APPROVAL: "Tapping Approved",
  A12_TAP_TO_LADLE: "Tapped Into Ladle",
  A13_RELEASE_TO_CASTING: "Released to Casting",
};

export const HEAT_APPROVAL_STAGE_ORDER: SteelHeatApprovalStage[] = [
  "A01_TAKE_SAMPLE",
  "A02_ANALYZE_SAMPLE",
  "A03_COMPARE_CHEMISTRY",
  "A04_DECIDE_CORRECTION",
  "A05_ADD_CORRECTION_MATERIAL",
  "A06_RETEST_CHEMISTRY",
  "A07_CHECK_TEMPERATURE",
  "A08_CHECK_LADLE_READINESS",
  "A09_APPROVE_CHEMISTRY_TEMPERATURE",
  "A10_CONFIRM_HEAT_NUMBER",
  "A11_TAPPING_APPROVAL",
  "A12_TAP_TO_LADLE",
  "A13_RELEASE_TO_CASTING",
];

interface EmployeeRef {
  id: string;
  firstName: string;
  lastName: string;
}

export interface HeatApprovalActivityLog {
  id: string;
  activity: string;
  performedBy: EmployeeRef;
  notes: string | null;
  data: Record<string, unknown> | null;
  createdAt: string;
}

export interface CorrectionMaterial {
  material: string;
  quantity: number;
  unit?: string;
}

export interface SteelHeatApproval {
  id: string;
  approvalNumber: string;
  organizationId: string;
  meltingId: string;
  melting: { id: string; heatInProcessNumber: string; chargeNumberSnapshot: string | null; status: string; stage: string };
  stage: SteelHeatApprovalStage;
  status: SteelHeatApprovalStatus;

  sampleRef: string | null;
  sampleTakenAt: string | null;

  chemistryComposition: Record<string, number> | null;
  labRef: string | null;

  requiredGrade: string | null;
  chemistryMatchesGrade: boolean | null;
  chemistryDeviationNotes: string | null;

  correctionRequired: boolean | null;
  correctionReason: string | null;

  correctionMaterials: CorrectionMaterial[] | null;
  correctionNotApplicable: boolean | null;

  retestChemistryComposition: Record<string, number> | null;
  retestNotApplicable: boolean | null;
  correctionAttempts: number;

  liquidTemperatureCelsius: number | null;

  ladleId: string | null;
  ladleLiningCondition: string | null;
  ladleReady: boolean | null;

  chemistryTemperatureApproved: boolean | null;
  approvalNotes: string | null;

  heatNumber: string | null;

  tappingApproved: boolean | null;

  tapStartTime: string | null;
  tapEndTime: string | null;
  tapOperator: string | null;

  releasedToCastingAt: string | null;

  createdBy: EmployeeRef;
  createdAt: string;
  updatedAt: string;

  activityLogs: HeatApprovalActivityLog[];
  // Only present on getById — backend's authoritative list of next valid actions.
  allowedActions?: AllowedHeatApprovalAction[];
  _count?: { activityLogs: number };
}

export interface PaginatedHeatApprovals {
  data: SteelHeatApproval[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

export interface SteelHeatApprovalSummary {
  total: number;
  byStage: Partial<Record<SteelHeatApprovalStage, number>>;
  byStatus: Partial<Record<SteelHeatApprovalStatus, number>>;
}

function buildQuery(params: Record<string, string | number | undefined>) {
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");
  return q ? `?${q}` : "";
}

export interface CreateHeatApprovalPayload {
  meltingId: string;
  sampleRef?: string;
  sampleTakenAt?: string;
}

export interface AnalyzeSamplePayload {
  chemistryComposition: Record<string, number>;
  labRef?: string;
}

export interface CompareChemistryPayload {
  requiredGrade?: string;
  chemistryMatchesGrade: boolean;
  chemistryDeviationNotes?: string;
}

export interface DecideCorrectionPayload {
  correctionRequired: boolean;
  correctionReason?: string;
}

export interface AddCorrectionMaterialPayload {
  correctionNotApplicable?: boolean;
  correctionMaterials?: CorrectionMaterial[];
}

export interface RetestChemistryPayload {
  retestNotApplicable?: boolean;
  retestChemistryComposition?: Record<string, number>;
  retestMatchesGrade?: boolean;
}

export interface CheckTemperaturePayload {
  liquidTemperatureCelsius: number;
}

export interface CheckLadleReadinessPayload {
  ladleId?: string;
  ladleLiningCondition: string;
  ladleReady: boolean;
}

export interface ApproveChemistryTemperaturePayload {
  chemistryTemperatureApproved: boolean;
  approvalNotes?: string;
}

export interface ConfirmHeatNumberPayload {
  heatNumber?: string;
}

export interface TappingApprovalPayload {
  tappingApproved: boolean;
}

export interface TapToLadlePayload {
  tapStartTime?: string;
  tapEndTime?: string;
  tapOperator?: string;
}

export interface ReleaseToCastingPayload {
  notes?: string;
}

export interface UpdateHeatApprovalStatusPayload {
  status: SteelHeatApprovalStatus;
  notes?: string;
}

export const HeatApprovalService = {
  async create(data: CreateHeatApprovalPayload, token: string): Promise<SteelHeatApproval> {
    const res = await apiClient(`${API_URL}/steel/heat-approval`, {
      method: "POST", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelHeatApproval>(res);
  },

  async getAll(
    token: string,
    params: { meltingId?: string; stage?: SteelHeatApprovalStage; status?: SteelHeatApprovalStatus; search?: string; page?: number; limit?: number },
  ): Promise<PaginatedHeatApprovals> {
    const res = await apiClient(`${API_URL}/steel/heat-approval${buildQuery(params)}`, {
      headers: authHeaders(token),
    }, token);
    return handleResponse<PaginatedHeatApprovals>(res);
  },

  async getSummary(token: string): Promise<SteelHeatApprovalSummary> {
    const res = await apiClient(`${API_URL}/steel/heat-approval/summary`, { headers: authHeaders(token) }, token);
    return handleResponse<SteelHeatApprovalSummary>(res);
  },

  async getById(id: string, token: string): Promise<SteelHeatApproval> {
    const res = await apiClient(`${API_URL}/steel/heat-approval/${id}`, { headers: authHeaders(token) }, token);
    return handleResponse<SteelHeatApproval>(res);
  },

  async analyzeSample(id: string, data: AnalyzeSamplePayload, token: string): Promise<SteelHeatApproval> {
    const res = await apiClient(`${API_URL}/steel/heat-approval/${id}/analyze-sample`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelHeatApproval>(res);
  },

  async compareChemistry(id: string, data: CompareChemistryPayload, token: string): Promise<SteelHeatApproval> {
    const res = await apiClient(`${API_URL}/steel/heat-approval/${id}/compare-chemistry`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelHeatApproval>(res);
  },

  async decideCorrection(id: string, data: DecideCorrectionPayload, token: string): Promise<SteelHeatApproval> {
    const res = await apiClient(`${API_URL}/steel/heat-approval/${id}/decide-correction`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelHeatApproval>(res);
  },

  async addCorrectionMaterial(id: string, data: AddCorrectionMaterialPayload, token: string): Promise<SteelHeatApproval> {
    const res = await apiClient(`${API_URL}/steel/heat-approval/${id}/add-correction-material`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelHeatApproval>(res);
  },

  async retestChemistry(id: string, data: RetestChemistryPayload, token: string): Promise<SteelHeatApproval> {
    const res = await apiClient(`${API_URL}/steel/heat-approval/${id}/retest-chemistry`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelHeatApproval>(res);
  },

  async checkTemperature(id: string, data: CheckTemperaturePayload, token: string): Promise<SteelHeatApproval> {
    const res = await apiClient(`${API_URL}/steel/heat-approval/${id}/check-temperature`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelHeatApproval>(res);
  },

  async checkLadleReadiness(id: string, data: CheckLadleReadinessPayload, token: string): Promise<SteelHeatApproval> {
    const res = await apiClient(`${API_URL}/steel/heat-approval/${id}/check-ladle-readiness`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelHeatApproval>(res);
  },

  async approveChemistryTemperature(id: string, data: ApproveChemistryTemperaturePayload, token: string): Promise<SteelHeatApproval> {
    const res = await apiClient(`${API_URL}/steel/heat-approval/${id}/approve-chemistry-temperature`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelHeatApproval>(res);
  },

  async confirmHeatNumber(id: string, data: ConfirmHeatNumberPayload, token: string): Promise<SteelHeatApproval> {
    const res = await apiClient(`${API_URL}/steel/heat-approval/${id}/confirm-heat-number`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelHeatApproval>(res);
  },

  async tappingApproval(id: string, data: TappingApprovalPayload, token: string): Promise<SteelHeatApproval> {
    const res = await apiClient(`${API_URL}/steel/heat-approval/${id}/tapping-approval`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelHeatApproval>(res);
  },

  async tapToLadle(id: string, data: TapToLadlePayload, token: string): Promise<SteelHeatApproval> {
    const res = await apiClient(`${API_URL}/steel/heat-approval/${id}/tap-to-ladle`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelHeatApproval>(res);
  },

  async releaseToCasting(id: string, data: ReleaseToCastingPayload, token: string): Promise<SteelHeatApproval> {
    const res = await apiClient(`${API_URL}/steel/heat-approval/${id}/release-to-casting`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelHeatApproval>(res);
  },

  async updateStatus(id: string, data: UpdateHeatApprovalStatusPayload, token: string): Promise<SteelHeatApproval> {
    const res = await apiClient(`${API_URL}/steel/heat-approval/${id}/status`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelHeatApproval>(res);
  },
};
