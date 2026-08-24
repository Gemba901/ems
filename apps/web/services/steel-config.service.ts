import { apiClient } from "@/lib/api-client";
import type { ProductType, PlantRoute, SteelDepartment, CreditStatus } from "./steel-master-data.service";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function authHeaders(token: string) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
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

async function get<T>(path: string, token: string): Promise<T> {
  const res = await apiClient(`${API_URL}${path}`, { headers: authHeaders(token) }, token);
  return handleResponse<T>(res);
}
async function post<T>(path: string, body: unknown, token: string): Promise<T> {
  const res = await apiClient(`${API_URL}${path}`, { method: "POST", headers: authHeaders(token), body: JSON.stringify(body) }, token);
  return handleResponse<T>(res);
}
async function patch<T>(path: string, body: unknown, token: string): Promise<T> {
  const res = await apiClient(`${API_URL}${path}`, { method: "PATCH", headers: authHeaders(token), body: JSON.stringify(body) }, token);
  return handleResponse<T>(res);
}
async function del<T>(path: string, token: string): Promise<T> {
  const res = await apiClient(`${API_URL}${path}`, { method: "DELETE", headers: authHeaders(token) }, token);
  return handleResponse<T>(res);
}

export interface ConfigProduct {
  id: string;
  code: string;
  name: string;
  productType: ProductType;
  isActive: boolean;
}

export interface ConfigProductSpecification {
  id: string;
  productId: string;
  code: string;
  grade: string;
  size: string;
  standard: string;
  length: string | null;
  toleranceNotes: string | null;
  isActive: boolean;
  product: ConfigProduct;
  displayLabel: string;
}

export interface ConfigRouteStep {
  id: string;
  routeId: string;
  sequence: number;
  processName: string;
  department: SteelDepartment;
}

export interface ConfigRoute {
  id: string;
  code: string;
  name: string;
  plantRoute: PlantRoute;
  isActive: boolean;
  steps: ConfigRouteStep[];
}

export interface ConfigCustomer {
  id: string;
  name: string;
  defaultDeliveryLocation: string | null;
  creditStatus: CreditStatus | null;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  isActive: boolean;
}

export interface ConfigDealer {
  id: string;
  name: string;
  code: string;
  region: string | null;
  isActive: boolean;
}

export interface ConfigMaterial {
  id: string;
  code: string;
  name: string;
  unit: string;
  isActive: boolean;
}

export interface ImportPreviewRow {
  row: number;
  data: Record<string, unknown>;
  errors: string[];
}
export interface ImportPreviewResult {
  totalRows: number;
  validCount: number;
  errorCount: number;
  rows: ImportPreviewRow[];
}
export interface ImportCommitResult {
  created: number;
  skipped: number;
}
export type ImportEntity =
  | "products"
  | "product-specifications"
  | "customers"
  | "dealers"
  | "materials"
  | "production-routes";

export const SteelConfigService = {
  // Products
  listProducts: (token: string, params: { q?: string; includeInactive?: boolean } = {}) =>
    get<ConfigProduct[]>(`/steel/config/products${toQuery({ q: params.q, includeInactive: params.includeInactive ? "true" : undefined })}`, token),
  createProduct: (data: { name: string; code: string; productType: ProductType }, token: string) =>
    post<ConfigProduct>("/steel/config/products", data, token),
  updateProduct: (id: string, data: Partial<{ name: string; productType: ProductType; isActive: boolean }>, token: string) =>
    patch<ConfigProduct>(`/steel/config/products/${id}`, data, token),

  // Product Specifications
  listSpecifications: (token: string, params: { q?: string; productId?: string; includeInactive?: boolean } = {}) =>
    get<ConfigProductSpecification[]>(
      `/steel/config/product-specifications${toQuery({ q: params.q, productId: params.productId, includeInactive: params.includeInactive ? "true" : undefined })}`,
      token,
    ),
  createSpecification: (
    data: { productId: string; code: string; grade: string; size: string; standard: string; length?: string; toleranceNotes?: string },
    token: string,
  ) => post<ConfigProductSpecification>("/steel/config/product-specifications", data, token),
  updateSpecification: (
    id: string,
    data: Partial<{ grade: string; size: string; standard: string; length: string; toleranceNotes: string; isActive: boolean }>,
    token: string,
  ) => patch<ConfigProductSpecification>(`/steel/config/product-specifications/${id}`, data, token),

  // Production Routes
  listRoutes: (token: string, params: { q?: string; includeInactive?: boolean } = {}) =>
    get<ConfigRoute[]>(`/steel/config/routes${toQuery({ q: params.q, includeInactive: params.includeInactive ? "true" : undefined })}`, token),
  createRoute: (data: { name: string; code: string; plantRoute: PlantRoute }, token: string) =>
    post<ConfigRoute>("/steel/config/routes", data, token),
  updateRoute: (id: string, data: Partial<{ name: string; plantRoute: PlantRoute; isActive: boolean }>, token: string) =>
    patch<ConfigRoute>(`/steel/config/routes/${id}`, data, token),
  addRouteStep: (routeId: string, data: { processName: string; department: SteelDepartment }, token: string) =>
    post<ConfigRouteStep>(`/steel/config/routes/${routeId}/steps`, data, token),
  updateRouteStep: (stepId: string, data: Partial<{ processName: string; department: SteelDepartment }>, token: string) =>
    patch<ConfigRouteStep>(`/steel/config/routes/steps/${stepId}`, data, token),
  deleteRouteStep: (stepId: string, token: string) => del<{ success: boolean }>(`/steel/config/routes/steps/${stepId}`, token),
  reorderRouteSteps: (routeId: string, stepIdsInOrder: string[], token: string) =>
    patch<ConfigRouteStep[]>(`/steel/config/routes/${routeId}/steps/reorder`, { stepIdsInOrder }, token),

  // Customers
  listCustomers: (token: string, params: { q?: string; includeInactive?: boolean } = {}) =>
    get<ConfigCustomer[]>(`/steel/config/customers${toQuery({ q: params.q, includeInactive: params.includeInactive ? "true" : undefined })}`, token),
  createCustomer: (
    data: { name: string; defaultDeliveryLocation?: string; creditStatus?: CreditStatus; contactPerson?: string; phone?: string; email?: string; notes?: string },
    token: string,
  ) => post<ConfigCustomer>("/steel/config/customers", data, token),
  updateCustomer: (
    id: string,
    data: Partial<{ name: string; defaultDeliveryLocation: string; creditStatus: CreditStatus; contactPerson: string; phone: string; email: string; notes: string; isActive: boolean }>,
    token: string,
  ) => patch<ConfigCustomer>(`/steel/config/customers/${id}`, data, token),

  // Dealers
  listDealers: (token: string, params: { q?: string; includeInactive?: boolean } = {}) =>
    get<ConfigDealer[]>(`/steel/config/dealers${toQuery({ q: params.q, includeInactive: params.includeInactive ? "true" : undefined })}`, token),
  createDealer: (data: { name: string; code: string; region?: string }, token: string) =>
    post<ConfigDealer>("/steel/config/dealers", data, token),
  updateDealer: (id: string, data: Partial<{ name: string; region: string; isActive: boolean }>, token: string) =>
    patch<ConfigDealer>(`/steel/config/dealers/${id}`, data, token),

  // Materials
  listMaterials: (token: string, params: { q?: string; includeInactive?: boolean } = {}) =>
    get<ConfigMaterial[]>(`/steel/config/materials${toQuery({ q: params.q, includeInactive: params.includeInactive ? "true" : undefined })}`, token),
  createMaterial: (data: { name: string; code: string; unit: string }, token: string) =>
    post<ConfigMaterial>("/steel/config/materials", data, token),
  updateMaterial: (id: string, data: Partial<{ name: string; unit: string; isActive: boolean }>, token: string) =>
    patch<ConfigMaterial>(`/steel/config/materials/${id}`, data, token),

  // Import
  async previewImport(entity: ImportEntity, file: File, token: string): Promise<ImportPreviewResult> {
    const formData = new FormData();
    formData.append("file", file);
    const res = await apiClient(
      `${API_URL}/steel/config/import/${entity}/preview`,
      { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: formData },
      token,
    );
    return handleResponse<ImportPreviewResult>(res);
  },
  async commitImport(entity: ImportEntity, file: File, token: string): Promise<ImportCommitResult> {
    const formData = new FormData();
    formData.append("file", file);
    const res = await apiClient(
      `${API_URL}/steel/config/import/${entity}/commit`,
      { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: formData },
      token,
    );
    return handleResponse<ImportCommitResult>(res);
  },
};
