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
  furnaceRefId: string | null;
  furnace: { id: string; code: string; name: string; status: string } | null;
  plannedHeatRef: string | null;
  operatorName: string | null;
  shift: string | null;

  liningCampaignId: string | null;
  liningRefId: string | null;
  lining: {
    id: string;
    installedAt: string;
    heatsCompleted: number;
    condition: string | null;
    status: string;
  } | null;
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
  _count?: { activityLogs: number; materialCharges?: number; cycleEvents?: number };
}

export type HeatChargeMaterialCategory = "SCRAP" | "RAW_METAL" | "ALLOY" | "ADDITIVE" | "OTHER";

export interface HeatMaterialCharge {
  id: string;
  meltingId: string;
  sequence: number;
  material: string;
  materialCategory: HeatChargeMaterialCategory;
  grade: string | null;
  batchRef: string | null;
  plannedQuantity: number | null;
  actualQuantity: number;
  unit: string;
  chargedAt: string;
  chargedBy: EmployeeRef;
  createdAt: string;
}

export type HeatCycleEventType =
  | "HEAT_STARTED"
  | "FURNACE_CHARGING"
  | "HEATING_STARTED"
  | "TEMPERATURE_READING"
  | "MATERIAL_ADDITION"
  | "ADJUSTMENT"
  | "ALARM"
  | "DELAY"
  | "OPERATOR_INTERVENTION"
  | "TARGET_TEMPERATURE_REACHED"
  | "TAPPING_STARTED"
  | "TAPPING_COMPLETED"
  | "HEAT_COMPLETED"
  | "OTHER";

export const HEAT_CYCLE_EVENT_LABELS: Record<HeatCycleEventType, string> = {
  HEAT_STARTED: "Heat Started",
  FURNACE_CHARGING: "Furnace Charging",
  HEATING_STARTED: "Heating Started",
  TEMPERATURE_READING: "Temperature Reading",
  MATERIAL_ADDITION: "Material Addition",
  ADJUSTMENT: "Adjustment",
  ALARM: "Alarm",
  DELAY: "Delay",
  OPERATOR_INTERVENTION: "Operator Intervention",
  TARGET_TEMPERATURE_REACHED: "Target Temperature Reached",
  TAPPING_STARTED: "Tapping Started",
  TAPPING_COMPLETED: "Tapping Completed",
  HEAT_COMPLETED: "Heat Completed",
  OTHER: "Other",
};

export interface HeatCycleEvent {
  id: string;
  meltingId: string;
  eventType: HeatCycleEventType;
  occurredAt: string;
  temperatureCelsius: number | null;
  quantity: number | null;
  unit: string | null;
  notes: string | null;
  recordedBy: EmployeeRef;
  createdAt: string;
}

// Stored measurements plus server-computed derived metrics. Fields explicitly
// documented as "not implemented" (e.g. energyPerTonne) reflect formulas the
// business has not yet confirmed — see MeltingService.getHeatSummary on the API.
export interface HeatSummary {
  heatId: string;
  heatInProcessNumber: string;
  furnace: { id: string; code: string; name: string; status: string } | null;
  lining: { id: string; installedAt: string; heatsCompleted: number; condition: string | null; status: string } | null;
  stage: SteelMeltingStage;
  status: SteelMeltingStatus;

  totalMaterialInput: number;
  totalOutputTonnes: number | null;
  materialAdditionsCount: number;
  eventsCount: number;
  targetTemperatureCelsius: number | null;
  liquidTemperatureCelsius: number | null;
  outputEnergyTotalKwh: number | null;
  meltingStartTime: string | null;
  handoverToRefiningAt: string | null;

  materialLossTonnes: number | null;
  yieldPercent: number | null;
  cycleDurationMinutes: number | null;
  energyPerTonne: number | null;
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
  furnaceRefId?: string;
  plannedHeatRef?: string;
  operatorName?: string;
  shift?: string;
}

export interface FurnaceLiningCheckPayload {
  liningCampaignId?: string;
  liningRefId?: string;
  liningHeatCount?: number;
  liningVisualCondition?: string;
}

export interface AddHeatMaterialChargePayload {
  material: string;
  materialCategory: HeatChargeMaterialCategory;
  grade?: string;
  batchRef?: string;
  plannedQuantity?: number;
  actualQuantity: number;
  unit: string;
  chargedAt?: string;
}

export interface RecordHeatCycleEventPayload {
  eventType: HeatCycleEventType;
  occurredAt?: string;
  temperatureCelsius?: number;
  quantity?: number;
  unit?: string;
  notes?: string;
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

export type MeltingDashboardRange = "TODAY" | "7D" | "30D" | "CUSTOM";

interface FurnaceRef {
  id: string;
  code: string;
  name: string;
}

export interface DashboardFurnaceStatus {
  id: string;
  code: string;
  name: string;
  status: string; // Furnace enum: READY | MAINTENANCE | DOWN | RETIRED
  activeHeat: {
    id: string;
    heatInProcessNumber: string;
    stage: SteelMeltingStage;
    temperatureCelsius: number | null;
  } | null;
  lining: {
    id: string;
    installedAt: string;
    heatsCompleted: number;
    condition: string | null;
    thicknessRemainingMm: number | null;
    status: string; // FurnaceLining enum: ACTIVE | RETIRED
  } | null;
}

export interface DashboardActiveHeat {
  id: string;
  heatInProcessNumber: string;
  furnace: FurnaceRef | null;
  stage: SteelMeltingStage;
  status: SteelMeltingStatus;
  meltingStartTime: string | null;
  startedAt: string;
  temperatureCelsius: number | null;
  materialInput: number;
}

export interface DashboardFurnacePerformance {
  furnaceId: string;
  code: string;
  name: string;
  heatsCompleted: number;
  averageYieldPercent: number | null;
  averageCycleDurationMinutes: number | null;
  totalMaterialInput: number;
  totalOutputTonnes: number;
}

export interface DashboardLiningStatus {
  furnaceId: string;
  furnaceCode: string;
  id: string;
  installedAt: string;
  heatsCompleted: number;
  condition: string | null;
  thicknessRemainingMm: number | null;
  status: string;
}

export interface DashboardRecentHeat {
  id: string;
  heatInProcessNumber: string;
  chargeNumberSnapshot: string | null;
  furnace: FurnaceRef | null;
  liningRefId: string | null;
  status: SteelMeltingStatus;
  handoverToRefiningAt: string | null;
  materialInput: number | null;
  output: number | null;
  materialLoss: number | null;
  yieldPercent: number | null;
  cycleDurationMinutes: number | null;
}

export interface DashboardRecentEvent {
  id: string;
  occurredAt: string;
  eventType: HeatCycleEventType;
  temperatureCelsius: number | null;
  quantity: number | null;
  unit: string | null;
  notes: string | null;
  meltingId: string;
  heatInProcessNumber: string;
  recordedBy: EmployeeRef;
}

// Mirrors MeltingService.getDashboard on the API exactly. Fields it does not
// compute (energy/tonne, lining "efficiency") are simply absent here too —
// no business-approved formula exists for either yet.
export interface MeltingDashboard {
  period: { range: MeltingDashboardRange; from: string; to: string };
  kpis: {
    activeHeats: number;
    completedHeats: number;
    averageYieldPercent: number | null;
    totalMaterialInput: number;
    totalOutputTonnes: number;
    averageCycleDurationMinutes: number | null;
  };
  materialOverview: {
    totalInputTonnes: number;
    totalOutputTonnes: number;
    totalLossTonnes: number;
    averageYieldPercent: number | null;
  };
  furnaceStatus: DashboardFurnaceStatus[];
  activeHeats: DashboardActiveHeat[];
  furnacePerformance: DashboardFurnacePerformance[];
  liningStatus: DashboardLiningStatus[];
  recentHeats: DashboardRecentHeat[];
  recentEvents: DashboardRecentEvent[];
}

export interface DashboardQueryParams {
  range?: MeltingDashboardRange;
  from?: string;
  to?: string;
  furnaceId?: string;
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

  async addMaterialCharge(id: string, data: AddHeatMaterialChargePayload, token: string): Promise<HeatMaterialCharge> {
    const res = await apiClient(`${API_URL}/steel/melting/${id}/material-charges`, {
      method: "POST", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<HeatMaterialCharge>(res);
  },

  async getMaterialCharges(id: string, token: string): Promise<HeatMaterialCharge[]> {
    const res = await apiClient(`${API_URL}/steel/melting/${id}/material-charges`, { headers: authHeaders(token) }, token);
    return handleResponse<HeatMaterialCharge[]>(res);
  },

  async recordCycleEvent(id: string, data: RecordHeatCycleEventPayload, token: string): Promise<HeatCycleEvent> {
    const res = await apiClient(`${API_URL}/steel/melting/${id}/events`, {
      method: "POST", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<HeatCycleEvent>(res);
  },

  async getCycleEvents(id: string, token: string): Promise<HeatCycleEvent[]> {
    const res = await apiClient(`${API_URL}/steel/melting/${id}/events`, { headers: authHeaders(token) }, token);
    return handleResponse<HeatCycleEvent[]>(res);
  },

  async getHeatSummary(id: string, token: string): Promise<HeatSummary> {
    const res = await apiClient(`${API_URL}/steel/melting/${id}/summary`, { headers: authHeaders(token) }, token);
    return handleResponse<HeatSummary>(res);
  },

  async getDashboard(token: string, params: DashboardQueryParams = {}): Promise<MeltingDashboard> {
    const res = await apiClient(`${API_URL}/steel/melting/dashboard${buildQuery({
      range: params.range,
      from: params.from,
      to: params.to,
      furnaceId: params.furnaceId,
    })}`, { headers: authHeaders(token) }, token);
    return handleResponse<MeltingDashboard>(res);
  },
};
