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

export type DemandSource =
  | "CUSTOMER_ORDER"
  | "DEALER_REQUIREMENT"
  | "PROJECT_REQUIREMENT"
  | "FORECAST"
  | "INTERNAL_STOCK_PLAN";

export type OrderPriority = "NORMAL" | "URGENT" | "EXPORT" | "PROJECT" | "STOCK_REPLENISHMENT";

export type CreditStatus = "APPROVED" | "ON_HOLD" | "PENDING";

export type ProductType = "TMT_BAR" | "BILLET" | "WIRE_ROD" | "SECTION" | "OTHER";

export type StockDecision = "DISPATCH_FROM_STOCK" | "PRODUCTION_REQUIRED";

export type PlantRoute =
  | "INTEGRATED_PLANT"
  | "SCRAP_BASED_FURNACE_PLANT"
  | "RE_ROLLER_PLANT"
  | "OWN_CCM_BILLET_ROUTE"
  | "LOCAL_PURCHASED_BILLET_ROUTE"
  | "IMPORTED_BILLET_ROUTE"
  | "HOT_CHARGE_ROUTE"
  | "COLD_CHARGE_ROUTE"
  | "MULTIPLE_ROUTES";

export type AvailabilityStatus = "AVAILABLE" | "PARTIAL" | "NOT_AVAILABLE";

export type SteelPlanStage =
  | "A01_DEMAND_CAPTURED"
  | "A02_PRIORITY_CONFIRMED"
  | "A03_PRODUCT_CONFIRMED"
  | "A04_SPEC_CONFIRMED"
  | "A05_STOCK_CHECKED"
  | "A06_STOCK_DECISION_MADE"
  | "A07_ROUTE_SELECTED"
  | "A08_MATERIAL_CHECKED"
  | "A09_CAPACITY_CHECKED"
  | "A10_PLAN_DRAFTED"
  | "A11_PLAN_COMMUNICATED"
  | "A12_PLAN_RELEASED";

export type SteelPlanOverallStatus = "DRAFT" | "IN_PROGRESS" | "ON_HOLD" | "RELEASED" | "CANCELLED";

export type SteelPlanActivity =
  | "A01" | "A02" | "A03" | "A04" | "A05" | "A06" | "A07" | "A08" | "A09" | "A10" | "A11" | "A12";

export type SteelDepartment =
  | "PROCUREMENT" | "YARD" | "FURNACE" | "CCM" | "ROLLING" | "QUALITY" | "MAINTENANCE" | "STORES" | "DISPATCH";

export const STAGE_LABELS: Record<SteelPlanStage, string> = {
  A01_DEMAND_CAPTURED: "Demand Captured",
  A02_PRIORITY_CONFIRMED: "Priority Confirmed",
  A03_PRODUCT_CONFIRMED: "Product Confirmed",
  A04_SPEC_CONFIRMED: "Specification Confirmed",
  A05_STOCK_CHECKED: "Stock Checked",
  A06_STOCK_DECISION_MADE: "Stock Decision Made",
  A07_ROUTE_SELECTED: "Route Selected",
  A08_MATERIAL_CHECKED: "Material Checked",
  A09_CAPACITY_CHECKED: "Capacity Checked",
  A10_PLAN_DRAFTED: "Production Plan Drafted",
  A11_PLAN_COMMUNICATED: "Plan Communicated",
  A12_PLAN_RELEASED: "Plan Released",
};

export const STAGE_ORDER: SteelPlanStage[] = [
  "A01_DEMAND_CAPTURED",
  "A02_PRIORITY_CONFIRMED",
  "A03_PRODUCT_CONFIRMED",
  "A04_SPEC_CONFIRMED",
  "A05_STOCK_CHECKED",
  "A06_STOCK_DECISION_MADE",
  "A07_ROUTE_SELECTED",
  "A08_MATERIAL_CHECKED",
  "A09_CAPACITY_CHECKED",
  "A10_PLAN_DRAFTED",
  "A11_PLAN_COMMUNICATED",
  "A12_PLAN_RELEASED",
];

interface EmployeeRef {
  id: string;
  firstName: string;
  lastName: string;
}

export interface SteelPlanDepartmentAck {
  id: string;
  department: SteelDepartment;
  acknowledged: boolean;
  acknowledgedBy: EmployeeRef | null;
  acknowledgedAt: string | null;
  notes: string | null;
}

export interface SteelPlanActivityLog {
  id: string;
  activity: SteelPlanActivity;
  performedBy: EmployeeRef;
  notes: string | null;
  data: Record<string, unknown> | null;
  createdAt: string;
}

export interface SteelProductionSequenceItem {
  batch: string;
  description?: string;
  quantityTonnes?: number;
  sequenceDate?: string;
}

export interface SteelProductionPlan {
  id: string;
  planNumber: string;
  organizationId: string;
  stage: SteelPlanStage;
  status: SteelPlanOverallStatus;

  demandSource: DemandSource;
  customerName: string | null;
  dealerName: string | null;
  projectReference: string | null;
  salesOrderNumber: string | null;
  forecastReference: string | null;
  stockRequirementReference: string | null;
  expectedDeliveryDate: string | null;
  requestedQuantityTonnes: number;
  demandNotes: string | null;

  priority: OrderPriority | null;
  deliveryPromiseDate: string | null;
  creditStatus: CreditStatus | null;

  productType: ProductType | null;
  productStandard: string | null;
  customerSpecification: string | null;

  grade: string | null;
  size: string | null;
  length: string | null;
  bundleType: string | null;
  totalQuantity: number | null;
  toleranceNotes: string | null;

  certifiedStockAvailableQty: number | null;
  stockBundleIds: string[];
  stockHeatNumbers: string[];
  stockCertificateRefs: string[];

  stockDecision: StockDecision | null;
  stockDecisionNotes: string | null;

  plantRoute: PlantRoute | null;
  routeNotes: string | null;

  materialAvailability: AvailabilityStatus | null;
  materialShortageNotes: string | null;
  purchaseRequirementNotes: string | null;

  equipmentAvailability: AvailabilityStatus | null;
  manpowerAvailability: AvailabilityStatus | null;
  maintenanceShutdownNotes: string | null;
  shiftPlanNotes: string | null;

  productionSequence: SteelProductionSequenceItem[] | null;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  planNotes: string | null;

  planCommunicatedAt: string | null;

  approvedBy: EmployeeRef | null;
  approvedAt: string | null;
  releaseNotes: string | null;

  createdBy: EmployeeRef;
  createdAt: string;
  updatedAt: string;

  departmentAcks: SteelPlanDepartmentAck[];
  activityLogs: SteelPlanActivityLog[];
}

export interface PaginatedSteelPlans {
  data: SteelProductionPlan[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

export interface SteelPlanSummary {
  total: number;
  byStage: Partial<Record<SteelPlanStage, number>>;
  byStatus: Partial<Record<SteelPlanOverallStatus, number>>;
}

function buildQuery(params: Record<string, string | number | boolean | undefined>) {
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");
  return q ? `?${q}` : "";
}

export interface CreateSteelDemandPayload {
  demandSource: DemandSource;
  customerName?: string;
  dealerName?: string;
  projectReference?: string;
  salesOrderNumber?: string;
  forecastReference?: string;
  stockRequirementReference?: string;
  expectedDeliveryDate?: string;
  requestedQuantityTonnes: number;
  demandNotes?: string;
}

export interface ConfirmPriorityPayload {
  priority: OrderPriority;
  deliveryPromiseDate?: string;
  creditStatus?: CreditStatus;
  notes?: string;
}

export interface ConfirmProductPayload {
  productType: ProductType;
  productStandard: string;
  customerSpecification?: string;
  notes?: string;
}

export interface ConfirmSpecificationPayload {
  grade: string;
  size: string;
  length?: string;
  bundleType?: string;
  totalQuantity: number;
  toleranceNotes?: string;
}

export interface StockCheckPayload {
  certifiedStockAvailableQty: number;
  stockBundleIds?: string[];
  stockHeatNumbers?: string[];
  stockCertificateRefs?: string[];
}

export interface StockDecisionPayload {
  stockDecision: StockDecision;
  stockDecisionNotes?: string;
}

export interface SelectRoutePayload {
  plantRoute: PlantRoute;
  routeNotes?: string;
}

export interface MaterialCheckPayload {
  materialAvailability: AvailabilityStatus;
  materialShortageNotes?: string;
  purchaseRequirementNotes?: string;
}

export interface CapacityCheckPayload {
  equipmentAvailability: AvailabilityStatus;
  manpowerAvailability: AvailabilityStatus;
  maintenanceShutdownNotes?: string;
  shiftPlanNotes?: string;
}

export interface PrepareProductionPlanPayload {
  productionSequence: SteelProductionSequenceItem[];
  plannedStartDate?: string;
  plannedEndDate?: string;
  planNotes?: string;
}

export interface CommunicatePlanPayload {
  departments: SteelDepartment[];
  notes?: string;
}

export interface AckDepartmentPayload {
  acknowledged?: boolean;
  notes?: string;
}

export interface ReleasePlanPayload {
  releaseNotes?: string;
}

export interface UpdateStatusPayload {
  status: SteelPlanOverallStatus;
  notes?: string;
}

export const SteelService = {
  async create(data: CreateSteelDemandPayload, token: string): Promise<SteelProductionPlan> {
    const res = await apiClient(`${API_URL}/steel/plans`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelProductionPlan>(res);
  },

  async getAll(
    token: string,
    params: {
      stage?: SteelPlanStage;
      status?: SteelPlanOverallStatus;
      priority?: OrderPriority;
      search?: string;
      scheduledOnly?: boolean;
      sortBy?: "createdAt" | "plannedStartDate";
      sortOrder?: "asc" | "desc";
      page?: number;
      limit?: number;
    },
  ): Promise<PaginatedSteelPlans> {
    const res = await apiClient(`${API_URL}/steel/plans${buildQuery(params)}`, {
      headers: authHeaders(token),
    }, token);
    return handleResponse<PaginatedSteelPlans>(res);
  },

  async getSummary(token: string): Promise<SteelPlanSummary> {
    const res = await apiClient(`${API_URL}/steel/plans/summary`, { headers: authHeaders(token) }, token);
    return handleResponse<SteelPlanSummary>(res);
  },

  async getById(id: string, token: string): Promise<SteelProductionPlan> {
    const res = await apiClient(`${API_URL}/steel/plans/${id}`, { headers: authHeaders(token) }, token);
    return handleResponse<SteelProductionPlan>(res);
  },

  async confirmPriority(id: string, data: ConfirmPriorityPayload, token: string): Promise<SteelProductionPlan> {
    const res = await apiClient(`${API_URL}/steel/plans/${id}/priority`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelProductionPlan>(res);
  },

  async confirmProduct(id: string, data: ConfirmProductPayload, token: string): Promise<SteelProductionPlan> {
    const res = await apiClient(`${API_URL}/steel/plans/${id}/product`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelProductionPlan>(res);
  },

  async confirmSpecification(id: string, data: ConfirmSpecificationPayload, token: string): Promise<SteelProductionPlan> {
    const res = await apiClient(`${API_URL}/steel/plans/${id}/specification`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelProductionPlan>(res);
  },

  async checkStock(id: string, data: StockCheckPayload, token: string): Promise<SteelProductionPlan> {
    const res = await apiClient(`${API_URL}/steel/plans/${id}/stock-check`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelProductionPlan>(res);
  },

  async decideStockOrProduction(id: string, data: StockDecisionPayload, token: string): Promise<SteelProductionPlan> {
    const res = await apiClient(`${API_URL}/steel/plans/${id}/stock-decision`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelProductionPlan>(res);
  },

  async selectRoute(id: string, data: SelectRoutePayload, token: string): Promise<SteelProductionPlan> {
    const res = await apiClient(`${API_URL}/steel/plans/${id}/route`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelProductionPlan>(res);
  },

  async checkMaterial(id: string, data: MaterialCheckPayload, token: string): Promise<SteelProductionPlan> {
    const res = await apiClient(`${API_URL}/steel/plans/${id}/material-check`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelProductionPlan>(res);
  },

  async checkCapacity(id: string, data: CapacityCheckPayload, token: string): Promise<SteelProductionPlan> {
    const res = await apiClient(`${API_URL}/steel/plans/${id}/capacity-check`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelProductionPlan>(res);
  },

  async prepareProductionPlan(id: string, data: PrepareProductionPlanPayload, token: string): Promise<SteelProductionPlan> {
    const res = await apiClient(`${API_URL}/steel/plans/${id}/production-plan`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelProductionPlan>(res);
  },

  async communicatePlan(id: string, data: CommunicatePlanPayload, token: string): Promise<SteelProductionPlan> {
    const res = await apiClient(`${API_URL}/steel/plans/${id}/communicate`, {
      method: "POST", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelProductionPlan>(res);
  },

  async acknowledgeDepartment(
    id: string,
    department: SteelDepartment,
    data: AckDepartmentPayload,
    token: string,
  ): Promise<SteelPlanDepartmentAck> {
    const res = await apiClient(`${API_URL}/steel/plans/${id}/departments/${department}/ack`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelPlanDepartmentAck>(res);
  },

  async releasePlan(id: string, data: ReleasePlanPayload, token: string): Promise<SteelProductionPlan> {
    const res = await apiClient(`${API_URL}/steel/plans/${id}/release`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelProductionPlan>(res);
  },

  async updateStatus(id: string, data: UpdateStatusPayload, token: string): Promise<SteelProductionPlan> {
    const res = await apiClient(`${API_URL}/steel/plans/${id}/status`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelProductionPlan>(res);
  },
};
