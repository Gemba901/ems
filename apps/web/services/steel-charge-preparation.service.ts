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

export type SteelChargeStage =
  | "A01_REQUIREMENT_REVIEWED"
  | "A02_LOTS_SELECTED"
  | "A03_SCRAP_SORTED"
  | "A04_SCRAP_CUT"
  | "A05_CONTAMINANTS_REMOVED"
  | "A06_ADDITIVES_PREPARED"
  | "A07_RETURN_SCRAP_CHECKED"
  | "A08_RECIPE_PREPARED"
  | "A09_MATERIAL_STAGED"
  | "A10_VERIFICATION_DONE"
  | "A11_CHARGE_RELEASED"
  | "A12_HANDOVER_CLOSED";

export type SteelChargeStatus = "DRAFT" | "IN_PROGRESS" | "ON_HOLD" | "CLOSED" | "CANCELLED";

export type AllowedChargeAction =
  | "SELECT_LOTS"
  | "RECORD_SCRAP_SORTING"
  | "RECORD_SCRAP_CUTTING"
  | "REMOVE_CONTAMINANTS"
  | "PREPARE_ADDITIVES"
  | "CHECK_RETURN_SCRAP"
  | "PREPARE_RECIPE"
  | "STAGE_MATERIAL"
  | "VERIFY_MATERIAL"
  | "RELEASE_CHARGE"
  | "CLOSE_HANDOVER";

export const CHARGE_STAGE_LABELS: Record<SteelChargeStage, string> = {
  A01_REQUIREMENT_REVIEWED: "Requirement Reviewed",
  A02_LOTS_SELECTED: "Lots Selected",
  A03_SCRAP_SORTED: "Scrap Sorted",
  A04_SCRAP_CUT: "Scrap Cut",
  A05_CONTAMINANTS_REMOVED: "Contaminants Removed",
  A06_ADDITIVES_PREPARED: "Additives Prepared",
  A07_RETURN_SCRAP_CHECKED: "Return Scrap Checked",
  A08_RECIPE_PREPARED: "Recipe Prepared",
  A09_MATERIAL_STAGED: "Material Staged",
  A10_VERIFICATION_DONE: "Verification Done",
  A11_CHARGE_RELEASED: "Charge Released",
  A12_HANDOVER_CLOSED: "Handover Closed",
};

export const CHARGE_STAGE_ORDER: SteelChargeStage[] = [
  "A01_REQUIREMENT_REVIEWED",
  "A02_LOTS_SELECTED",
  "A03_SCRAP_SORTED",
  "A04_SCRAP_CUT",
  "A05_CONTAMINANTS_REMOVED",
  "A06_ADDITIVES_PREPARED",
  "A07_RETURN_SCRAP_CHECKED",
  "A08_RECIPE_PREPARED",
  "A09_MATERIAL_STAGED",
  "A10_VERIFICATION_DONE",
  "A11_CHARGE_RELEASED",
  "A12_HANDOVER_CLOSED",
];

interface EmployeeRef {
  id: string;
  firstName: string;
  lastName: string;
}

export interface ChargePrepIntakeRef {
  id: string;
  intakeNumber: string;
  materialType: SteelMaterialType | null;
  grade: string | null;
  netWeightTonnes: number | null;
  status: string;
}

export interface SteelChargeMaterialLot {
  id: string;
  chargePreparationId: string;
  intakeId: string;
  intake: ChargePrepIntakeRef;
}

export interface ChargePrepActivityLog {
  id: string;
  activity: string;
  performedBy: EmployeeRef;
  notes: string | null;
  data: Record<string, unknown> | null;
  createdAt: string;
}

export interface AdditivePrepared {
  itemName: string;
  quantity: number;
  lot?: string;
  issueRecord?: string;
}

export interface SteelChargePreparation {
  id: string;
  prepNumber: string;
  organizationId: string;
  planId: string;
  plan: { id: string; planNumber: string; status: string };
  stage: SteelChargeStage;
  status: SteelChargeStatus;

  stockAvailabilityConfirmed: boolean | null;
  requirementNotes: string | null;

  lotSelectionNotes: string | null;

  sortedWeightTonnes: number | null;
  rejectedItemsNotes: string | null;
  scrapGradeNotes: string | null;

  cuttingRequired: boolean | null;
  cuttingTimeMinutes: number | null;
  cuttingPowerOrGasUsed: string | null;
  cutQuantityTonnes: number | null;

  contaminantsRemoved: boolean | null;
  removedItemsNotes: string | null;
  contaminationIssueNotes: string | null;

  additivesPrepared: AdditivePrepared[] | null;
  additivesNotes: string | null;

  returnScrapAvailable: boolean | null;
  returnScrapQtyTonnes: number | null;
  returnScrapSource: string | null;
  returnScrapGrade: string | null;
  returnScrapContaminationNotes: string | null;

  recipeScrapWeightTonnes: number | null;
  recipeDriWeightTonnes: number | null;
  recipeAlloyWeightTonnes: number | null;
  recipeAdditiveWeightTonnes: number | null;
  targetChemistry: Record<string, unknown> | null;
  recipeNotes: string | null;

  stagingLocation: string | null;
  stagedWeightTonnes: number | null;
  stagingSequence: number | null;

  actualWeightTonnes: number | null;
  actualGrade: string | null;
  weightVarianceTonnes: number | null;
  varianceApproved: boolean | null;
  verificationNotes: string | null;

  chargeNumber: string | null;
  chargeReleasedAt: string | null;

  furnaceReadinessConfirmed: boolean | null;
  plannedHeatReference: string | null;
  handoverNotes: string | null;
  handoverClosedAt: string | null;

  createdBy: EmployeeRef;
  createdAt: string;
  updatedAt: string;

  materialLots: SteelChargeMaterialLot[];
  activityLogs: ChargePrepActivityLog[];
  // Only present on getById — backend's authoritative list of next valid actions.
  allowedActions?: AllowedChargeAction[];
  // Only present on getAll (list rows return counts instead of the full
  // materialLots/activityLogs relations to keep the list endpoint light).
  _count?: { materialLots: number; activityLogs: number };
}

export interface PaginatedChargePreparations {
  data: SteelChargePreparation[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

export interface SteelChargeSummary {
  total: number;
  byStage: Partial<Record<SteelChargeStage, number>>;
  byStatus: Partial<Record<SteelChargeStatus, number>>;
}

function buildQuery(params: Record<string, string | number | undefined>) {
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");
  return q ? `?${q}` : "";
}

export interface CreateChargePreparationPayload {
  planId: string;
  stockAvailabilityConfirmed?: boolean;
  requirementNotes?: string;
}

export interface SelectMaterialLotsPayload {
  intakeIds: string[];
  lotSelectionNotes?: string;
}

export interface RecordScrapSortingPayload {
  sortedWeightTonnes: number;
  rejectedItemsNotes?: string;
  scrapGradeNotes?: string;
}

export interface RecordScrapCuttingPayload {
  cuttingRequired: boolean;
  cuttingTimeMinutes?: number;
  cuttingPowerOrGasUsed?: string;
  cutQuantityTonnes?: number;
}

export interface RecordContaminantRemovalPayload {
  contaminantsRemoved: boolean;
  removedItemsNotes?: string;
  contaminationIssueNotes?: string;
}

export interface PrepareAdditivesPayload {
  additivesPrepared?: AdditivePrepared[];
  additivesNotes?: string;
}

export interface RecordReturnScrapCheckPayload {
  returnScrapAvailable: boolean;
  returnScrapQtyTonnes?: number;
  returnScrapSource?: string;
  returnScrapGrade?: string;
  returnScrapContaminationNotes?: string;
}

export interface PrepareChargeRecipePayload {
  recipeScrapWeightTonnes: number;
  recipeDriWeightTonnes?: number;
  recipeAlloyWeightTonnes?: number;
  recipeAdditiveWeightTonnes?: number;
  targetChemistry?: Record<string, unknown>;
  recipeNotes?: string;
}

export interface StageChargeMaterialPayload {
  stagingLocation: string;
  stagedWeightTonnes: number;
  stagingSequence?: number;
}

export interface VerifyChargeMaterialPayload {
  actualWeightTonnes: number;
  actualGrade?: string;
  varianceApproved?: boolean;
  verificationNotes?: string;
}

export interface ReleaseChargePayload {
  releaseNotes?: string;
}

export interface CloseFurnaceHandoverPayload {
  furnaceReadinessConfirmed: boolean;
  plannedHeatReference?: string;
  handoverNotes?: string;
}

export interface UpdateChargeStatusPayload {
  status: SteelChargeStatus;
  notes?: string;
}

export const ChargePreparationService = {
  async create(data: CreateChargePreparationPayload, token: string): Promise<SteelChargePreparation> {
    const res = await apiClient(`${API_URL}/steel/charge-preparation`, {
      method: "POST", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelChargePreparation>(res);
  },

  async getAll(
    token: string,
    params: { planId?: string; stage?: SteelChargeStage; status?: SteelChargeStatus; search?: string; page?: number; limit?: number },
  ): Promise<PaginatedChargePreparations> {
    const res = await apiClient(`${API_URL}/steel/charge-preparation${buildQuery(params)}`, {
      headers: authHeaders(token),
    }, token);
    return handleResponse<PaginatedChargePreparations>(res);
  },

  async getSummary(token: string): Promise<SteelChargeSummary> {
    const res = await apiClient(`${API_URL}/steel/charge-preparation/summary`, { headers: authHeaders(token) }, token);
    return handleResponse<SteelChargeSummary>(res);
  },

  async getById(id: string, token: string): Promise<SteelChargePreparation> {
    const res = await apiClient(`${API_URL}/steel/charge-preparation/${id}`, { headers: authHeaders(token) }, token);
    return handleResponse<SteelChargePreparation>(res);
  },

  async selectMaterialLots(id: string, data: SelectMaterialLotsPayload, token: string): Promise<SteelChargePreparation> {
    const res = await apiClient(`${API_URL}/steel/charge-preparation/${id}/lot-selection`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelChargePreparation>(res);
  },

  async recordScrapSorting(id: string, data: RecordScrapSortingPayload, token: string): Promise<SteelChargePreparation> {
    const res = await apiClient(`${API_URL}/steel/charge-preparation/${id}/scrap-sorting`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelChargePreparation>(res);
  },

  async recordScrapCutting(id: string, data: RecordScrapCuttingPayload, token: string): Promise<SteelChargePreparation> {
    const res = await apiClient(`${API_URL}/steel/charge-preparation/${id}/scrap-cutting`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelChargePreparation>(res);
  },

  async recordContaminantRemoval(id: string, data: RecordContaminantRemovalPayload, token: string): Promise<SteelChargePreparation> {
    const res = await apiClient(`${API_URL}/steel/charge-preparation/${id}/contaminant-removal`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelChargePreparation>(res);
  },

  async prepareAdditives(id: string, data: PrepareAdditivesPayload, token: string): Promise<SteelChargePreparation> {
    const res = await apiClient(`${API_URL}/steel/charge-preparation/${id}/additives`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelChargePreparation>(res);
  },

  async recordReturnScrapCheck(id: string, data: RecordReturnScrapCheckPayload, token: string): Promise<SteelChargePreparation> {
    const res = await apiClient(`${API_URL}/steel/charge-preparation/${id}/return-scrap`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelChargePreparation>(res);
  },

  async prepareChargeRecipe(id: string, data: PrepareChargeRecipePayload, token: string): Promise<SteelChargePreparation> {
    const res = await apiClient(`${API_URL}/steel/charge-preparation/${id}/charge-recipe`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelChargePreparation>(res);
  },

  async stageChargeMaterial(id: string, data: StageChargeMaterialPayload, token: string): Promise<SteelChargePreparation> {
    const res = await apiClient(`${API_URL}/steel/charge-preparation/${id}/staging`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelChargePreparation>(res);
  },

  async verifyChargeMaterial(id: string, data: VerifyChargeMaterialPayload, token: string): Promise<SteelChargePreparation> {
    const res = await apiClient(`${API_URL}/steel/charge-preparation/${id}/verification`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelChargePreparation>(res);
  },

  async releaseCharge(id: string, data: ReleaseChargePayload, token: string): Promise<SteelChargePreparation> {
    const res = await apiClient(`${API_URL}/steel/charge-preparation/${id}/release-charge`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelChargePreparation>(res);
  },

  async closeFurnaceHandover(id: string, data: CloseFurnaceHandoverPayload, token: string): Promise<SteelChargePreparation> {
    const res = await apiClient(`${API_URL}/steel/charge-preparation/${id}/furnace-handover`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelChargePreparation>(res);
  },

  async updateStatus(id: string, data: UpdateChargeStatusPayload, token: string): Promise<SteelChargePreparation> {
    const res = await apiClient(`${API_URL}/steel/charge-preparation/${id}/status`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelChargePreparation>(res);
  },
};
