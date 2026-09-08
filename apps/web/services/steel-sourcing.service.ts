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

export type SteelMaterialType =
  | "SCRAP" | "DRI" | "BILLET" | "ALLOY" | "ADDITIVE" | "FUEL" | "REFRACTORY" | "PACKING_MATERIAL" | "OTHER";

export type SupplierApprovalStatus = "APPROVED" | "PENDING" | "SUSPENDED" | "BLACKLISTED";

export type SupplierRiskLevel = "LOW" | "MEDIUM" | "HIGH";

export type SteelSourcingStage =
  | "A01_REQUIREMENT_REVIEWED"
  | "A02_MATERIAL_TYPE_IDENTIFIED"
  | "A03_SUPPLIER_CHECKED"
  | "A04_SUPPLIER_RISK_REVIEWED"
  | "A05_QUOTATIONS_COLLECTED"
  | "A06_SUPPLIER_SELECTED"
  | "A07_SPEC_CONFIRMED"
  | "A08_PO_CREATED"
  | "A09_DELIVERY_CONFIRMED"
  | "A10_LOGISTICS_PREPARED"
  | "A11_INTAKE_INFORMED"
  | "A12_HANDOVER_CLOSED";

export type SteelSourcingStatus = "DRAFT" | "IN_PROGRESS" | "ON_HOLD" | "PO_ISSUED" | "CLOSED" | "CANCELLED";

export type SteelSourcingActivity =
  | "A01" | "A02" | "A03" | "A04" | "A05" | "A06" | "A07" | "A08" | "A09" | "A10" | "A11" | "A12";

export const SOURCING_STAGE_LABELS: Record<SteelSourcingStage, string> = {
  A01_REQUIREMENT_REVIEWED: "Requirement Reviewed",
  A02_MATERIAL_TYPE_IDENTIFIED: "Material Type Identified",
  A03_SUPPLIER_CHECKED: "Supplier Checked",
  A04_SUPPLIER_RISK_REVIEWED: "Supplier Risk Reviewed",
  A05_QUOTATIONS_COLLECTED: "Quotations Collected",
  A06_SUPPLIER_SELECTED: "Supplier Selected",
  A07_SPEC_CONFIRMED: "Specification Confirmed",
  A08_PO_CREATED: "Purchase Order Created",
  A09_DELIVERY_CONFIRMED: "Delivery Confirmed",
  A10_LOGISTICS_PREPARED: "Logistics Prepared",
  A11_INTAKE_INFORMED: "Intake Team Informed",
  A12_HANDOVER_CLOSED: "Handover Closed",
};

export const SOURCING_STAGE_ORDER: SteelSourcingStage[] = [
  "A01_REQUIREMENT_REVIEWED",
  "A02_MATERIAL_TYPE_IDENTIFIED",
  "A03_SUPPLIER_CHECKED",
  "A04_SUPPLIER_RISK_REVIEWED",
  "A05_QUOTATIONS_COLLECTED",
  "A06_SUPPLIER_SELECTED",
  "A07_SPEC_CONFIRMED",
  "A08_PO_CREATED",
  "A09_DELIVERY_CONFIRMED",
  "A10_LOGISTICS_PREPARED",
  "A11_INTAKE_INFORMED",
  "A12_HANDOVER_CLOSED",
];

export interface EmployeeRef {
  id: string;
  firstName: string;
  lastName: string;
}

export interface Supplier {
  id: string;
  name: string;
  code: string | null;
  materialTypes: SteelMaterialType[];
  approvalStatus: SupplierApprovalStatus;
  rejectionCount: number;
  qualityScore: number | null;
  deliveryScore: number | null;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  country: string | null;
  isImportSource: boolean;
  isActive: boolean;
  notes: string | null;
  createdBy?: EmployeeRef | null;
  updatedBy?: EmployeeRef | null;
}

export interface SteelSourcingQuotation {
  id: string;
  supplierId: string;
  supplier: Supplier;
  price: number;
  currency: string;
  quantityAvailable: number | null;
  deliveryDate: string | null;
  paymentTerms: string | null;
  qualityRiskNotes: string | null;
}

export interface SteelSourcingAttachment {
  id: string;
  sourcingId: string;
  stage: SteelSourcingStage;
  fileName: string;
  fileUrl: string;
  uploadedBy: EmployeeRef | null;
  createdAt: string;
}

export interface SteelSourcingActivityLog {
  id: string;
  activity: SteelSourcingActivity;
  performedBy: EmployeeRef;
  notes: string | null;
  data: Record<string, unknown> | null;
  createdAt: string;
}

export interface SteelSourcingOrder {
  id: string;
  sourcingNumber: string;
  organizationId: string;
  planId: string;
  plan: {
    id: string; planNumber: string; plantRoute: string | null; customerName: string | null; dealerName: string | null;
    productType: string | null; grade: string | null; size: string | null; requestedQuantityTonnes: number;
    expectedDeliveryDate: string | null;
  };
  stage: SteelSourcingStage;
  status: SteelSourcingStatus;

  materialRequirementNotes: string | null;
  requiredByDate: string | null;

  materialType: SteelMaterialType | null;
  materialTypeNotes: string | null;

  materialSource: SteelSourcingMaterialSource | null;
  supplierId: string | null;
  supplier: Supplier | null;
  supplierApprovalConfirmed: boolean | null;
  supplierCheckNotes: string | null;
  stockFulfillmentNotes: string | null;

  supplierRiskLevel: SupplierRiskLevel | null;
  rejectionRateNotes: string | null;
  complaintHistoryNotes: string | null;

  quotationsCollectedAt: string | null;
  quotations: SteelSourcingQuotation[];

  selectedSupplierId: string | null;
  qcdComparisonNotes: string | null;

  specificationRequirementNotes: string | null;
  certificateRequired: boolean | null;
  documentsRequired: string[];

  poNumber: string | null;
  poItem: string | null;
  poQuantity: number | null;
  poPrice: number | null;
  poCurrency: string | null;
  poDeliveryTerms: string | null;
  poCreatedAt: string | null;

  confirmedDispatchDate: string | null;
  confirmedArrivalDate: string | null;
  vehicleContainerInfo: string | null;

  billOfLading: string | null;
  countryOfOrigin: string | null;
  portClearanceStatus: string | null;
  importLogisticsNotes: string | null;

  intakeInformedAt: string | null;
  intakeNotifyNotes: string | null;

  handoverClosedAt: string | null;
  handoverNotes: string | null;

  createdBy: EmployeeRef;
  createdAt: string;
  updatedAt: string;

  activityLogs: SteelSourcingActivityLog[];
}

export interface PaginatedSteelSourcingOrders {
  data: SteelSourcingOrder[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

export interface SteelSourcingSummary {
  total: number;
  byStage: Partial<Record<SteelSourcingStage, number>>;
  byStatus: Partial<Record<SteelSourcingStatus, number>>;
}

function buildQuery(params: Record<string, string | number | undefined>) {
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");
  return q ? `?${q}` : "";
}

export interface CreateSourcingOrderPayload {
  planId: string;
  materialRequirementNotes?: string;
  requiredByDate?: string;
}

export interface IdentifyMaterialTypePayload {
  materialType: SteelMaterialType;
  materialTypeNotes?: string;
}

export type SteelSourcingMaterialSource = "EXISTING_STOCK" | "EXTERNAL_SUPPLIER";

export interface SelectMaterialSourcePayload {
  source: SteelSourcingMaterialSource;
  supplierId?: string;
  supplierApprovalConfirmed?: boolean;
  supplierCheckNotes?: string;
  stockFulfillmentNotes?: string;
}

export interface ReviewSupplierRiskPayload {
  supplierRiskLevel: SupplierRiskLevel;
  rejectionRateNotes?: string;
  complaintHistoryNotes?: string;
}

export interface QuotationItemPayload {
  supplierId: string;
  price: number;
  currency?: string;
  quantityAvailable?: number;
  deliveryDate?: string;
  paymentTerms?: string;
  qualityRiskNotes?: string;
}

export interface CollectQuotationsPayload {
  quotations: QuotationItemPayload[];
}

export interface SelectSupplierPayload {
  selectedSupplierId: string;
  qcdComparisonNotes?: string;
}

export interface ConfirmSpecPayload {
  specificationRequirementNotes?: string;
  certificateRequired?: boolean;
  documentsRequired?: string[];
}

export interface CreatePurchaseOrderPayload {
  poNumber: string;
  poItem?: string;
  poQuantity: number;
  poPrice: number;
  poCurrency?: string;
  poDeliveryTerms?: string;
}

export interface ConfirmDeliverySchedulePayload {
  confirmedDispatchDate?: string;
  confirmedArrivalDate?: string;
  vehicleContainerInfo?: string;
}

export interface PrepareLogisticsPayload {
  billOfLading?: string;
  countryOfOrigin?: string;
  portClearanceStatus?: string;
  importLogisticsNotes?: string;
}

export interface InformIntakePayload {
  intakeNotifyNotes?: string;
}

export interface CloseHandoverPayload {
  handoverNotes?: string;
}

export interface UpdateSourcingStatusPayload {
  status: SteelSourcingStatus;
  notes?: string;
}

export interface CreateSupplierPayload {
  name: string;
  code?: string;
  materialTypes?: SteelMaterialType[];
  approvalStatus?: SupplierApprovalStatus;
  qualityScore?: number;
  deliveryScore?: number;
  contactPerson?: string;
  phone?: string;
  email?: string;
  country?: string;
  isImportSource?: boolean;
  notes?: string;
}

export const SteelSourcingService = {
  async create(data: CreateSourcingOrderPayload, token: string): Promise<SteelSourcingOrder> {
    const res = await apiClient(`${API_URL}/steel/sourcing`, {
      method: "POST", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelSourcingOrder>(res);
  },

  async getAll(
    token: string,
    params: { planId?: string; stage?: SteelSourcingStage; status?: SteelSourcingStatus; materialType?: SteelMaterialType; search?: string; page?: number; limit?: number },
  ): Promise<PaginatedSteelSourcingOrders> {
    const res = await apiClient(`${API_URL}/steel/sourcing${buildQuery(params)}`, {
      headers: authHeaders(token),
    }, token);
    return handleResponse<PaginatedSteelSourcingOrders>(res);
  },

  async getSummary(token: string): Promise<SteelSourcingSummary> {
    const res = await apiClient(`${API_URL}/steel/sourcing/summary`, { headers: authHeaders(token) }, token);
    return handleResponse<SteelSourcingSummary>(res);
  },

  async getById(id: string, token: string): Promise<SteelSourcingOrder> {
    const res = await apiClient(`${API_URL}/steel/sourcing/${id}`, { headers: authHeaders(token) }, token);
    return handleResponse<SteelSourcingOrder>(res);
  },

  async identifyMaterialType(id: string, data: IdentifyMaterialTypePayload, token: string): Promise<SteelSourcingOrder> {
    const res = await apiClient(`${API_URL}/steel/sourcing/${id}/material-type`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelSourcingOrder>(res);
  },

  async selectMaterialSource(id: string, data: SelectMaterialSourcePayload, token: string): Promise<SteelSourcingOrder> {
    const res = await apiClient(`${API_URL}/steel/sourcing/${id}/material-source`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelSourcingOrder>(res);
  },

  async reviewSupplierRisk(id: string, data: ReviewSupplierRiskPayload, token: string): Promise<SteelSourcingOrder> {
    const res = await apiClient(`${API_URL}/steel/sourcing/${id}/supplier-risk`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelSourcingOrder>(res);
  },

  async collectQuotations(id: string, data: CollectQuotationsPayload, token: string): Promise<SteelSourcingOrder> {
    const res = await apiClient(`${API_URL}/steel/sourcing/${id}/quotations`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelSourcingOrder>(res);
  },

  async selectSupplier(id: string, data: SelectSupplierPayload, token: string): Promise<SteelSourcingOrder> {
    const res = await apiClient(`${API_URL}/steel/sourcing/${id}/select-supplier`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelSourcingOrder>(res);
  },

  async confirmSpecification(id: string, data: ConfirmSpecPayload, token: string): Promise<SteelSourcingOrder> {
    const res = await apiClient(`${API_URL}/steel/sourcing/${id}/specification`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelSourcingOrder>(res);
  },

  async createPurchaseOrder(id: string, data: CreatePurchaseOrderPayload, token: string): Promise<SteelSourcingOrder> {
    const res = await apiClient(`${API_URL}/steel/sourcing/${id}/purchase-order`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelSourcingOrder>(res);
  },

  async confirmDeliverySchedule(id: string, data: ConfirmDeliverySchedulePayload, token: string): Promise<SteelSourcingOrder> {
    const res = await apiClient(`${API_URL}/steel/sourcing/${id}/delivery-schedule`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelSourcingOrder>(res);
  },

  async prepareLogistics(id: string, data: PrepareLogisticsPayload, token: string): Promise<SteelSourcingOrder> {
    const res = await apiClient(`${API_URL}/steel/sourcing/${id}/logistics`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelSourcingOrder>(res);
  },

  async informIntakeTeam(id: string, data: InformIntakePayload, token: string): Promise<SteelSourcingOrder> {
    const res = await apiClient(`${API_URL}/steel/sourcing/${id}/inform-intake`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelSourcingOrder>(res);
  },

  async closeHandover(id: string, data: CloseHandoverPayload, token: string): Promise<SteelSourcingOrder> {
    const res = await apiClient(`${API_URL}/steel/sourcing/${id}/close-handover`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelSourcingOrder>(res);
  },

  async updateStatus(id: string, data: UpdateSourcingStatusPayload, token: string): Promise<SteelSourcingOrder> {
    const res = await apiClient(`${API_URL}/steel/sourcing/${id}/status`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelSourcingOrder>(res);
  },

  async getSuppliers(token: string, params: { materialType?: SteelMaterialType; approvalStatus?: SupplierApprovalStatus; search?: string; includeInactive?: boolean } = {}): Promise<Supplier[]> {
    const res = await apiClient(`${API_URL}/steel/sourcing/suppliers${buildQuery({ ...params, includeInactive: params.includeInactive ? "true" : undefined })}`, {
      headers: authHeaders(token),
    }, token);
    return handleResponse<Supplier[]>(res);
  },

  async createSupplier(data: CreateSupplierPayload, token: string): Promise<Supplier> {
    const res = await apiClient(`${API_URL}/steel/sourcing/suppliers`, {
      method: "POST", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<Supplier>(res);
  },

  async updateSupplier(id: string, data: Partial<CreateSupplierPayload & { isActive: boolean }>, token: string): Promise<Supplier> {
    const res = await apiClient(`${API_URL}/steel/sourcing/suppliers/${id}`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<Supplier>(res);
  },

  async getSupplierEligibleMaterials(id: string, token: string): Promise<Array<{ id: string; materialId: string; material: { id: string; code: string; name: string; unit: string } }>> {
    const res = await apiClient(`${API_URL}/steel/sourcing/suppliers/${id}/eligible-materials`, {
      headers: authHeaders(token),
    }, token);
    return handleResponse(res);
  },

  async getAttachments(id: string, token: string): Promise<SteelSourcingAttachment[]> {
    const res = await apiClient(`${API_URL}/steel/sourcing/${id}/attachments`, {
      headers: authHeaders(token),
    }, token);
    return handleResponse<SteelSourcingAttachment[]>(res);
  },

  async addAttachment(id: string, data: { stage: SteelSourcingStage; fileName: string; fileUrl: string }, token: string): Promise<SteelSourcingAttachment> {
    const res = await apiClient(`${API_URL}/steel/sourcing/${id}/attachments`, {
      method: "POST", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<SteelSourcingAttachment>(res);
  },

  async deleteAttachment(attachmentId: string, token: string): Promise<{ success: boolean }> {
    const res = await apiClient(`${API_URL}/steel/sourcing/attachments/${attachmentId}`, {
      method: "DELETE", headers: authHeaders(token),
    }, token);
    return handleResponse(res);
  },
};