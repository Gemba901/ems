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

function toQuery(params: Record<string, string | undefined>): string {
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");
  return q ? `?${q}` : "";
}

export type ProductType = "TMT_BAR" | "BILLET" | "WIRE_ROD" | "SECTION" | "OTHER";
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
export type SteelDepartment =
  | "PROCUREMENT" | "YARD" | "FURNACE" | "CCM" | "ROLLING" | "QUALITY" | "MAINTENANCE" | "STORES" | "DISPATCH";
export type SteelMaterialType =
  | "SCRAP" | "DRI" | "BILLET" | "ALLOY" | "ADDITIVE" | "FUEL" | "REFRACTORY" | "PACKING_MATERIAL" | "OTHER";
export type AvailabilityStatus = "AVAILABLE" | "PARTIAL" | "NOT_AVAILABLE";
export type CreditStatus = "APPROVED" | "ON_HOLD" | "PENDING";

export interface MasterCustomer {
  id: string;
  name: string;
  dealerName: string | null;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  creditStatus: CreditStatus | null;
  notes: string | null;
}

export interface MasterProduct {
  id: string;
  code: string;
  name: string;
  productType: ProductType;
}

export interface MasterProductSpecification {
  id: string;
  productId: string;
  code: string;
  standard: string;
  grade: string;
  size: string;
  length: string | null;
  toleranceNotes: string | null;
  product: MasterProduct;
  displayLabel: string;
}

export interface MasterRouteStep {
  id: string;
  routeId: string;
  sequence: number;
  processName: string;
  department: SteelDepartment;
}

export interface MasterProductionRoute {
  id: string;
  code: string;
  name: string;
  plantRoute: PlantRoute;
  steps: MasterRouteStep[];
}

export interface MasterDealer {
  id: string;
  name: string;
  code: string;
  region: string | null;
}

export interface MasterMaterial {
  id: string;
  code: string;
  name: string;
  unit: string;
}

export interface MasterFinishedGoodsStock {
  certifiedQtyTonnes: number;
  bundleIds: string[];
  heatNumbers: string[];
  certificateRefs: string[];
}

export interface MaterialAvailabilityResult {
  materialType: SteelMaterialType;
  requiredQtyTonnes: number;
  availableQtyTonnes: number;
  status: AvailabilityStatus;
}

export const SteelMasterDataService = {
  async getCustomers(token: string, q?: string): Promise<MasterCustomer[]> {
    const res = await apiClient(
      `${API_URL}/steel/master-data/customers${toQuery({ q })}`,
      { headers: authHeaders(token) },
      token,
    );
    return handleResponse<MasterCustomer[]>(res);
  },

  async getDealers(token: string, q?: string): Promise<MasterDealer[]> {
    const res = await apiClient(
      `${API_URL}/steel/master-data/dealers${toQuery({ q })}`,
      { headers: authHeaders(token) },
      token,
    );
    return handleResponse<MasterDealer[]>(res);
  },

  async getProducts(token: string, params: { q?: string; productType?: ProductType } = {}): Promise<MasterProduct[]> {
    const res = await apiClient(
      `${API_URL}/steel/master-data/products${toQuery(params)}`,
      { headers: authHeaders(token) },
      token,
    );
    return handleResponse<MasterProduct[]>(res);
  },

  async getProductSpecifications(
    token: string,
    params: { q?: string; productId?: string } = {},
  ): Promise<MasterProductSpecification[]> {
    const res = await apiClient(
      `${API_URL}/steel/master-data/product-specifications${toQuery(params)}`,
      { headers: authHeaders(token) },
      token,
    );
    return handleResponse<MasterProductSpecification[]>(res);
  },

  async getRoutes(token: string, q?: string): Promise<MasterProductionRoute[]> {
    const res = await apiClient(
      `${API_URL}/steel/master-data/routes${toQuery({ q })}`,
      { headers: authHeaders(token) },
      token,
    );
    return handleResponse<MasterProductionRoute[]>(res);
  },

  async getRouteSteps(routeId: string, token: string): Promise<MasterRouteStep[]> {
    const res = await apiClient(
      `${API_URL}/steel/master-data/routes/${routeId}/steps`,
      { headers: authHeaders(token) },
      token,
    );
    return handleResponse<MasterRouteStep[]>(res);
  },

  async getMaterials(token: string, q?: string): Promise<MasterMaterial[]> {
    const res = await apiClient(
      `${API_URL}/steel/master-data/materials${toQuery({ q })}`,
      { headers: authHeaders(token) },
      token,
    );
    return handleResponse<MasterMaterial[]>(res);
  },

  async getFinishedGoodsStock(productSpecificationId: string, token: string): Promise<MasterFinishedGoodsStock> {
    const res = await apiClient(
      `${API_URL}/steel/master-data/finished-goods-stock${toQuery({ productSpecificationId })}`,
      { headers: authHeaders(token) },
      token,
    );
    return handleResponse<MasterFinishedGoodsStock>(res);
  },

  async getMaterialAvailability(
    params: { materialType: SteelMaterialType; requiredQtyTonnes: number },
    token: string,
  ): Promise<MaterialAvailabilityResult> {
    const res = await apiClient(
      `${API_URL}/steel/master-data/material-availability${toQuery({
        materialType: params.materialType,
        requiredQtyTonnes: String(params.requiredQtyTonnes),
      })}`,
      { headers: authHeaders(token) },
      token,
    );
    return handleResponse<MaterialAvailabilityResult>(res);
  },
};
