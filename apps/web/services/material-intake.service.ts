import { apiClient } from "@/lib/api-client";
import { SteelMaterialType } from "@/services/steel-sourcing.service";

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

export type SteelIntakeStage =
  | "A01_GATE_ARRIVAL_RECORDED"
  | "A02_DOCUMENTS_VERIFIED"
  | "A03_GROSS_WEIGHT_CAPTURED"
  | "A04_SAFETY_CHECKED"
  | "A05_AREA_ASSIGNED"
  | "A06_VISUAL_INSPECTED"
  | "A07_HAZARD_CHECKED"
  | "A08_RADIATION_CHECKED"
  | "A09_CERTIFICATE_VERIFIED"
  | "A10_ACCEPTANCE_DECIDED"
  | "A11_UNLOADED"
  | "A12_NET_WEIGHT_CAPTURED"
  | "A13_YARD_STORED"
  | "A14_STOCK_RELEASED";

export type SteelIntakeStatus = "DRAFT" | "IN_PROGRESS" | "ON_HOLD" | "REJECTED" | "RELEASED" | "CANCELLED";

export type MaterialAcceptanceDecision = "ACCEPT" | "HOLD" | "REJECT";

export type AllowedIntakeAction =
  | "VERIFY_DOCUMENTS"
  | "RECORD_GROSS_WEIGHT"
  | "RECORD_SAFETY_CHECK"
  | "ASSIGN_UNLOADING_AREA"
  | "RECORD_INSPECTION"
  | "RECORD_ACCEPTANCE_DECISION"
  | "RECORD_UNLOADING"
  | "RECORD_NET_WEIGHT"
  | "ASSIGN_YARD_LOCATION"
  | "RELEASE_TO_STOCK";

export const INTAKE_STAGE_LABELS: Record<SteelIntakeStage, string> = {
  A01_GATE_ARRIVAL_RECORDED: "Gate Arrival Recorded",
  A02_DOCUMENTS_VERIFIED: "Documents Verified",
  A03_GROSS_WEIGHT_CAPTURED: "Gross Weight Captured",
  A04_SAFETY_CHECKED: "Safety Checked",
  A05_AREA_ASSIGNED: "Area Assigned",
  A06_VISUAL_INSPECTED: "Visual Inspection",
  A07_HAZARD_CHECKED: "Hazard Checked",
  A08_RADIATION_CHECKED: "Radiation Checked",
  A09_CERTIFICATE_VERIFIED: "Certificate Verified",
  A10_ACCEPTANCE_DECIDED: "Acceptance Decided",
  A11_UNLOADED: "Unloaded",
  A12_NET_WEIGHT_CAPTURED: "Net Weight Captured",
  A13_YARD_STORED: "Yard Stored",
  A14_STOCK_RELEASED: "Stock Released",
};

export const INTAKE_STAGE_ORDER: SteelIntakeStage[] = [
  "A01_GATE_ARRIVAL_RECORDED",
  "A02_DOCUMENTS_VERIFIED",
  "A03_GROSS_WEIGHT_CAPTURED",
  "A04_SAFETY_CHECKED",
  "A05_AREA_ASSIGNED",
  "A06_VISUAL_INSPECTED",
  "A07_HAZARD_CHECKED",
  "A08_RADIATION_CHECKED",
  "A09_CERTIFICATE_VERIFIED",
  "A10_ACCEPTANCE_DECIDED",
  "A11_UNLOADED",
  "A12_NET_WEIGHT_CAPTURED",
  "A13_YARD_STORED",
  "A14_STOCK_RELEASED",
];

interface EmployeeRef {
  id: string;
  firstName: string;
  lastName: string;
}

export interface MaterialIntakeActivityLog {
  id: string;
  activity: string;
  performedBy: EmployeeRef;
  notes: string | null;
  data: Record<string, unknown> | null;
  createdAt: string;
}

export interface SteelMaterialIntake {
  id: string;
  intakeNumber: string;
  organizationId: string;
  sourcingOrderId: string;
  sourcingOrder: {
    id: string;
    sourcingNumber: string;
    materialType: SteelMaterialType | null;
    supplier: { id: string; name: string } | null;
    plan: { id: string; planNumber: string } | null;
  };
  stage: SteelIntakeStage;
  status: SteelIntakeStatus;

  vehicleNumber: string;
  driverName: string | null;
  transporterName: string | null;
  arrivalDateTime: string | null;
  gateEntryRef: string | null;

  purchaseOrderVerified: boolean | null;
  deliveryDocumentRef: string | null;
  documentVerificationNotes: string | null;

  grossWeightTonnes: number | null;
  grossWeighedAt: string | null;

  safetyCheckPassed: boolean | null;
  safetyCheckNotes: string | null;

  unloadingArea: string | null;

  visualInspectionNotes: string | null;
  hazardOrContaminationFound: boolean | null;
  hazardNotes: string | null;
  radiationCheckRequired: boolean | null;
  radiationCheckPassed: boolean | null;

  materialType: SteelMaterialType | null;
  grade: string | null;
  heatNumber: string | null;
  certificateRef: string | null;

  acceptanceDecision: MaterialAcceptanceDecision | null;
  decisionNotes: string | null;

  unloadedAt: string | null;

  tareWeightTonnes: number | null;
  netWeightTonnes: number | null;
  weighedAt: string | null;

  yardLocation: string | null;
  storedAt: string | null;

  stockReleasedAt: string | null;
  stockReleaseNotes: string | null;

  createdBy: EmployeeRef;
  createdAt: string;
  updatedAt: string;

  activityLogs: MaterialIntakeActivityLog[];
  // Only present on getById — the backend's authoritative list of next
  // valid actions, computed from (stage, status, acceptanceDecision).
  allowedActions?: AllowedIntakeAction[];
}

export interface PaginatedMaterialIntakes {
  data: SteelMaterialIntake[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

function buildQuery(params: Record<string, string | number | boolean | undefined>) {
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");
  return q ? `?${q}` : "";
}

export interface CreateMaterialIntakePayload {
  sourcingOrderId: string;
  vehicleNumber: string;
  driverName?: string;
  transporterName?: string;
  arrivalDateTime?: string;
  gateEntryRef?: string;
}

export interface VerifyDocumentsPayload {
  purchaseOrderVerified: boolean;
  deliveryDocumentRef?: string;
  documentVerificationNotes?: string;
}

export interface RecordGrossWeightPayload {
  grossWeightTonnes: number;
}

export interface RecordSafetyCheckPayload {
  safetyCheckPassed: boolean;
  safetyCheckNotes?: string;
}

export interface AssignUnloadingAreaPayload {
  unloadingArea: string;
}

export interface RecordInspectionPayload {
  visualInspectionNotes?: string;
  hazardOrContaminationFound?: boolean;
  hazardNotes?: string;
  radiationCheckRequired?: boolean;
  radiationCheckPassed?: boolean;
  materialType?: SteelMaterialType;
  grade?: string;
  heatNumber?: string;
  certificateRef?: string;
}

export interface RecordAcceptanceDecisionPayload {
  decision: MaterialAcceptanceDecision;
  decisionNotes?: string;
}

export interface RecordUnloadingPayload {
  unloadedAt?: string;
}

// Note: no netWeightTonnes here — the backend always computes it server-side.
export interface RecordNetWeightPayload {
  tareWeightTonnes: number;
  weighedAt?: string;
}

export interface AssignYardLocationPayload {
  yardLocation: string;
}

export interface ReleaseToStockPayload {
  stockReleaseNotes?: string;
}

export interface UpdateIntakeStatusPayload {
  status: SteelIntakeStatus;
  notes?: string;
}

export const MaterialIntakeService = {
  async create(data: CreateMaterialIntakePayload, token: string): Promise<SteelMaterialIntake> {
    const res = await apiClient(`${API_URL}/steel/material-intake`, {
      method: "POST", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelMaterialIntake>(res);
  },

  async getAll(
    token: string,
    params: { sourcingOrderId?: string; stage?: SteelIntakeStage; status?: SteelIntakeStatus; availableOnly?: boolean; search?: string; page?: number; limit?: number },
  ): Promise<PaginatedMaterialIntakes> {
    const res = await apiClient(`${API_URL}/steel/material-intake${buildQuery(params)}`, {
      headers: authHeaders(token),
    }, token);
    return handleResponse<PaginatedMaterialIntakes>(res);
  },

  async getById(id: string, token: string): Promise<SteelMaterialIntake> {
    const res = await apiClient(`${API_URL}/steel/material-intake/${id}`, { headers: authHeaders(token) }, token);
    return handleResponse<SteelMaterialIntake>(res);
  },

  async verifyDocuments(id: string, data: VerifyDocumentsPayload, token: string): Promise<SteelMaterialIntake> {
    const res = await apiClient(`${API_URL}/steel/material-intake/${id}/documents`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelMaterialIntake>(res);
  },

  async recordGrossWeight(id: string, data: RecordGrossWeightPayload, token: string): Promise<SteelMaterialIntake> {
    const res = await apiClient(`${API_URL}/steel/material-intake/${id}/weighing`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelMaterialIntake>(res);
  },

  async recordSafetyCheck(id: string, data: RecordSafetyCheckPayload, token: string): Promise<SteelMaterialIntake> {
    const res = await apiClient(`${API_URL}/steel/material-intake/${id}/safety`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelMaterialIntake>(res);
  },

  async assignUnloadingArea(id: string, data: AssignUnloadingAreaPayload, token: string): Promise<SteelMaterialIntake> {
    const res = await apiClient(`${API_URL}/steel/material-intake/${id}/area`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelMaterialIntake>(res);
  },

  async recordInspection(id: string, data: RecordInspectionPayload, token: string): Promise<SteelMaterialIntake> {
    const res = await apiClient(`${API_URL}/steel/material-intake/${id}/inspection`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelMaterialIntake>(res);
  },

  async recordAcceptanceDecision(id: string, data: RecordAcceptanceDecisionPayload, token: string): Promise<SteelMaterialIntake> {
    const res = await apiClient(`${API_URL}/steel/material-intake/${id}/decision`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelMaterialIntake>(res);
  },

  async recordUnloading(id: string, data: RecordUnloadingPayload, token: string): Promise<SteelMaterialIntake> {
    const res = await apiClient(`${API_URL}/steel/material-intake/${id}/unloading`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelMaterialIntake>(res);
  },

  async recordNetWeight(id: string, data: RecordNetWeightPayload, token: string): Promise<SteelMaterialIntake> {
    const res = await apiClient(`${API_URL}/steel/material-intake/${id}/net-weight`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelMaterialIntake>(res);
  },

  async assignYardLocation(id: string, data: AssignYardLocationPayload, token: string): Promise<SteelMaterialIntake> {
    const res = await apiClient(`${API_URL}/steel/material-intake/${id}/yard`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelMaterialIntake>(res);
  },

  async releaseToStock(id: string, data: ReleaseToStockPayload, token: string): Promise<SteelMaterialIntake> {
    const res = await apiClient(`${API_URL}/steel/material-intake/${id}/release`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelMaterialIntake>(res);
  },

  async updateStatus(id: string, data: UpdateIntakeStatusPayload, token: string): Promise<SteelMaterialIntake> {
    const res = await apiClient(`${API_URL}/steel/material-intake/${id}/status`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelMaterialIntake>(res);
  },
};
