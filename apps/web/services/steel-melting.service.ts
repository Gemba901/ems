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

export type SteelMeltingStage =
  | "A01_CONFIRM_FURNACE_AVAILABILITY"
  | "A02_FURNACE_LINING_CHECK"
  | "A03_FURNACE_SYSTEMS_CHECK"
  | "A04_PREVIOUS_HEAT_READINESS"
  | "A05_VERIFY_CHARGE_RECIPE"
  | "A06_LOAD_CHARGE"
  | "A07_START_MELTING"
  | "A08_MONITOR_POWER"
  | "A09_MONITOR_TEMPERATURE"
  | "A10_RECORD_ADDITIONS"
  | "A11_REMOVE_SLAG"
  | "A12_RECORD_MELT_OUTPUT"
  | "A13_CONFIRM_LIQUID_READY"
  | "A14_HANDOVER_TO_REFINING";

export type SteelMeltingStatus = "DRAFT" | "IN_PROGRESS" | "ON_HOLD" | "CLOSED" | "CANCELLED";

export type AllowedMeltingAction =
  | "CHECK_LINING"
  | "CHECK_UTILITIES"
  | "CHECK_PREVIOUS_HEAT"
  | "VERIFY_CHARGE"
  | "LOAD_CHARGE"
  | "START_MELTING"
  | "MONITOR_POWER"
  | "MONITOR_TEMPERATURE"
  | "RECORD_ADDITIONS"
  | "REMOVE_SLAG"
  | "RECORD_OUTPUT"
  | "CONFIRM_READY"
  | "REFINING_HANDOVER";

export const MELTING_STAGE_LABELS: Record<SteelMeltingStage, string> = {
  A01_CONFIRM_FURNACE_AVAILABILITY: "Furnace Availability Confirmed",
  A02_FURNACE_LINING_CHECK: "Lining Checked",
  A03_FURNACE_SYSTEMS_CHECK: "Systems Checked",
  A04_PREVIOUS_HEAT_READINESS: "Previous Heat Readiness Confirmed",
  A05_VERIFY_CHARGE_RECIPE: "Charge Verified",
  A06_LOAD_CHARGE: "Charge Loaded",
  A07_START_MELTING: "Melting Started",
  A08_MONITOR_POWER: "Power Monitored",
  A09_MONITOR_TEMPERATURE: "Temperature Monitored",
  A10_RECORD_ADDITIONS: "Additions Recorded",
  A11_REMOVE_SLAG: "Slag Removed",
  A12_RECORD_MELT_OUTPUT: "Output Recorded",
  A13_CONFIRM_LIQUID_READY: "Liquid Steel Ready",
  A14_HANDOVER_TO_REFINING: "Handed Over to Refining",
};

export const MELTING_STAGE_ORDER: SteelMeltingStage[] = [
  "A01_CONFIRM_FURNACE_AVAILABILITY",
  "A02_FURNACE_LINING_CHECK",
  "A03_FURNACE_SYSTEMS_CHECK",
  "A04_PREVIOUS_HEAT_READINESS",
  "A05_VERIFY_CHARGE_RECIPE",
  "A06_LOAD_CHARGE",
  "A07_START_MELTING",
  "A08_MONITOR_POWER",
  "A09_MONITOR_TEMPERATURE",
  "A10_RECORD_ADDITIONS",
  "A11_REMOVE_SLAG",
  "A12_RECORD_MELT_OUTPUT",
  "A13_CONFIRM_LIQUID_READY",
  "A14_HANDOVER_TO_REFINING",
];

interface EmployeeRef {
  id: string;
  firstName: string;
  lastName: string;
}

export interface MeltingActivityLog {
  id: string;
  activity: string;
  performedBy: EmployeeRef;
  notes: string | null;
  data: Record<string, unknown> | null;
  createdAt: string;
}

export interface MeltingAddition {
  itemName: string;
  quantity: number;
  reason?: string;
  approved?: boolean;
}

export interface SteelMelting {
  id: string;
  heatInProcessNumber: string;
  organizationId: string;
  chargePreparationId: string;
  chargePreparation: { id: string; prepNumber: string; chargeNumber: string | null; status: string };
  stage: SteelMeltingStage;
  status: SteelMeltingStatus;

  chargeNumberSnapshot: string | null;
  recipeScrapWeightSnapshot: number | null;
  recipeDriWeightSnapshot: number | null;
  recipeAlloyWeightSnapshot: number | null;
  recipeAdditiveWeightSnapshot: number | null;

  furnaceId: string | null;
  plannedHeatRef: string | null;
  operatorName: string | null;
  shift: string | null;

  liningCampaignId: string | null;
  liningHeatCount: number | null;
  liningVisualCondition: string | null;

  waterPressureFlowOk: boolean | null;
  powerSystemOk: boolean | null;
  hydraulicSystemOk: boolean | null;
  alarmsOk: boolean | null;

  previousHeatRef: string | null;
  slagCleaningStatus: string | null;
  readinessDelayReason: string | null;

  materialLotRef: string | null;
  actualWeightVsRecipeOk: boolean | null;

  loadingTime: string | null;
  loadingEquipment: string | null;
  chargeSequence: string | null;

  meltingStartTime: string | null;
  meltingFurnaceId: string | null;
  meltingOperator: string | null;
  meltingChargeId: string | null;

  powerKwh: number | null;
  powerElapsedMinutes: number | null;
  powerTonnage: number | null;
  powerInterruptions: string | null;

  temperatureCelsius: number | null;
  temperatureElapsedMinutes: number | null;
  temperatureDelayReason: string | null;

  additions: MeltingAddition[] | null;

  slagRemovalTime: string | null;
  slagQuantityEstimate: number | null;
  slagIssueFound: string | null;
  slagNotApplicable: boolean | null;

  outputChargeId: string | null;
  outputFurnaceId: string | null;
  outputMeltTimeMinutes: number | null;
  outputEnergyTotalKwh: number | null;
  outputAdditionsSummary: string | null;
  outputWeightTonnes: number | null;

  liquidReady: boolean | null;
  liquidTemperatureCelsius: number | null;
  liquidOperatorConfirmed: boolean | null;

  handoverToRefiningAt: string | null;

  createdBy: EmployeeRef;
  createdAt: string;
  updatedAt: string;

  activityLogs: MeltingActivityLog[];
  // Only present on getById — backend's authoritative list of next valid actions.
  allowedActions?: AllowedMeltingAction[];
  _count?: { activityLogs: number };
}

export interface PaginatedMeltings {
  data: SteelMelting[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

export interface SteelMeltingSummary {
  total: number;
  byStage: Partial<Record<SteelMeltingStage, number>>;
  byStatus: Partial<Record<SteelMeltingStatus, number>>;
}

function buildQuery(params: Record<string, string | number | undefined>) {
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");
  return q ? `?${q}` : "";
}

export interface CreateMeltingPayload {
  chargePreparationId: string;
  furnaceId?: string;
  plannedHeatRef?: string;
  operatorName?: string;
  shift?: string;
}

export interface FurnaceLiningCheckPayload {
  liningCampaignId?: string;
  liningHeatCount?: number;
  liningVisualCondition?: string;
}

export interface FurnaceSystemsCheckPayload {
  waterPressureFlowOk: boolean;
  powerSystemOk: boolean;
  hydraulicSystemOk: boolean;
  alarmsOk: boolean;
}

export interface PreviousHeatReadinessPayload {
  previousHeatRef?: string;
  slagCleaningStatus?: string;
  readinessDelayReason?: string;
}

export interface VerifyChargeRecipePayload {
  materialLotRef?: string;
  actualWeightVsRecipeOk: boolean;
}

export interface LoadChargePayload {
  loadingTime?: string;
  loadingEquipment?: string;
  chargeSequence?: string;
}

export interface StartMeltingPayload {
  meltingStartTime?: string;
  meltingFurnaceId?: string;
  meltingOperator?: string;
}

export interface MonitorPowerPayload {
  powerKwh?: number;
  powerElapsedMinutes?: number;
  powerTonnage?: number;
  powerInterruptions?: string;
}

export interface MonitorTemperaturePayload {
  temperatureCelsius: number;
  temperatureElapsedMinutes?: number;
  temperatureDelayReason?: string;
}

export interface RecordAdditionsPayload {
  additions?: MeltingAddition[];
}

export interface RemoveSlagPayload {
  slagNotApplicable?: boolean;
  slagRemovalTime?: string;
  slagQuantityEstimate?: number;
  slagIssueFound?: string;
}

export interface RecordMeltOutputPayload {
  outputChargeId?: string;
  outputFurnaceId?: string;
  outputMeltTimeMinutes?: number;
  outputEnergyTotalKwh?: number;
  outputAdditionsSummary?: string;
  outputWeightTonnes: number;
}

export interface ConfirmLiquidReadyPayload {
  liquidReady: boolean;
  liquidTemperatureCelsius?: number;
  liquidOperatorConfirmed: boolean;
}

export interface RefiningHandoverPayload {
  notes?: string;
}

export interface UpdateMeltingStatusPayload {
  status: SteelMeltingStatus;
  notes?: string;
}

export const MeltingService = {
  async create(data: CreateMeltingPayload, token: string): Promise<SteelMelting> {
    const res = await apiClient(`${API_URL}/steel/melting`, {
      method: "POST", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelMelting>(res);
  },

  async getAll(
    token: string,
    params: { chargePreparationId?: string; stage?: SteelMeltingStage; status?: SteelMeltingStatus; search?: string; page?: number; limit?: number },
  ): Promise<PaginatedMeltings> {
    const res = await apiClient(`${API_URL}/steel/melting${buildQuery(params)}`, {
      headers: authHeaders(token),
    }, token);
    return handleResponse<PaginatedMeltings>(res);
  },

  async getSummary(token: string): Promise<SteelMeltingSummary> {
    const res = await apiClient(`${API_URL}/steel/melting/summary`, { headers: authHeaders(token) }, token);
    return handleResponse<SteelMeltingSummary>(res);
  },

  async getById(id: string, token: string): Promise<SteelMelting> {
    const res = await apiClient(`${API_URL}/steel/melting/${id}`, { headers: authHeaders(token) }, token);
    return handleResponse<SteelMelting>(res);
  },

  async furnaceLiningCheck(id: string, data: FurnaceLiningCheckPayload, token: string): Promise<SteelMelting> {
    const res = await apiClient(`${API_URL}/steel/melting/${id}/furnace-lining-check`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelMelting>(res);
  },

  async furnaceSystemsCheck(id: string, data: FurnaceSystemsCheckPayload, token: string): Promise<SteelMelting> {
    const res = await apiClient(`${API_URL}/steel/melting/${id}/furnace-systems-check`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelMelting>(res);
  },

  async previousHeatReadiness(id: string, data: PreviousHeatReadinessPayload, token: string): Promise<SteelMelting> {
    const res = await apiClient(`${API_URL}/steel/melting/${id}/previous-heat-readiness`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelMelting>(res);
  },

  async verifyChargeRecipe(id: string, data: VerifyChargeRecipePayload, token: string): Promise<SteelMelting> {
    const res = await apiClient(`${API_URL}/steel/melting/${id}/verify-charge-recipe`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelMelting>(res);
  },

  async loadCharge(id: string, data: LoadChargePayload, token: string): Promise<SteelMelting> {
    const res = await apiClient(`${API_URL}/steel/melting/${id}/load-charge`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelMelting>(res);
  },

  async startMelting(id: string, data: StartMeltingPayload, token: string): Promise<SteelMelting> {
    const res = await apiClient(`${API_URL}/steel/melting/${id}/start-melting`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelMelting>(res);
  },

  async monitorPower(id: string, data: MonitorPowerPayload, token: string): Promise<SteelMelting> {
    const res = await apiClient(`${API_URL}/steel/melting/${id}/monitor-power`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelMelting>(res);
  },

  async monitorTemperature(id: string, data: MonitorTemperaturePayload, token: string): Promise<SteelMelting> {
    const res = await apiClient(`${API_URL}/steel/melting/${id}/monitor-temperature`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelMelting>(res);
  },

  async recordAdditions(id: string, data: RecordAdditionsPayload, token: string): Promise<SteelMelting> {
    const res = await apiClient(`${API_URL}/steel/melting/${id}/record-additions`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelMelting>(res);
  },

  async removeSlag(id: string, data: RemoveSlagPayload, token: string): Promise<SteelMelting> {
    const res = await apiClient(`${API_URL}/steel/melting/${id}/remove-slag`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelMelting>(res);
  },

  async recordMeltOutput(id: string, data: RecordMeltOutputPayload, token: string): Promise<SteelMelting> {
    const res = await apiClient(`${API_URL}/steel/melting/${id}/record-melt-output`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelMelting>(res);
  },

  async confirmLiquidReady(id: string, data: ConfirmLiquidReadyPayload, token: string): Promise<SteelMelting> {
    const res = await apiClient(`${API_URL}/steel/melting/${id}/confirm-liquid-ready`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelMelting>(res);
  },

  async refiningHandover(id: string, data: RefiningHandoverPayload, token: string): Promise<SteelMelting> {
    const res = await apiClient(`${API_URL}/steel/melting/${id}/refining-handover`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelMelting>(res);
  },

  async updateStatus(id: string, data: UpdateMeltingStatusPayload, token: string): Promise<SteelMelting> {
    const res = await apiClient(`${API_URL}/steel/melting/${id}/status`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelMelting>(res);
  },
};
