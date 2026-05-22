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

export type SuggestionStatus =
  | "UNDER_REVIEW"
  | "APPROVED_FOR_IMPLEMENTATION"
  | "REJECTED"
  | "ON_HOLD"
  | "SELECTED_FOR_SGA";

export type ImplementationStatus =
  | "WORK_IN_PROGRESS"
  | "VERY_SLOW_WORK_IN_PROGRESS"
  | "GOOD_WORK_IN_PROGRESS"
  | "SLOW_PROGRESS"
  | "IMPLEMENTED"
  | "SHIFTED_TO_SGA"
  | "PREVIOUSLY_IMPLEMENTED"
  | "UNDER_CONSULTATION"
  | "IMPRACTICAL"
  | "SAVED_FOR_LATER";

export type SuggestionCategory =
  | "QUALITY"
  | "COST"
  | "DELIVERY"
  | "SAFETY"
  | "MORALE"
  | "TECHNOLOGY"
  | "UNKNOWN";

export const CATEGORY_WEIGHTS: Record<SuggestionCategory, number> = {
  QUALITY:    3,
  COST:       1.5,
  DELIVERY:   2,
  SAFETY:     1.5,
  MORALE:     1,
  TECHNOLOGY: 1,
  UNKNOWN:    0,
};

export function calcWeight(categories: SuggestionCategory[]): number {
  return categories.reduce((sum, c) => sum + (CATEGORY_WEIGHTS[c] ?? 0), 0);
}

export interface SuggestionReview {
  id: string;
  statusChanged: SuggestionStatus;
  note: string | null;
  createdAt: string;
  reviewer: { id: string; firstName: string; lastName: string };
}

export interface Suggestion {
  id: string;
  title: string;
  description: string;
  imageUrl: string | null;
  status: SuggestionStatus;
  implementationStatus: ImplementationStatus | null;
  implementationNote: string | null;
  categories: SuggestionCategory[];
  isAnonymous: boolean;
  employeeId: string;
  organizationId: string;
  hodId: string | null;
  hod: { id: string; firstName: string; lastName: string } | null;
  createdAt: string;
  updatedAt: string;
  employee: { id: string; firstName: string; lastName: string; department: { id: string; name: string } | null } | null;
  reviews: SuggestionReview[];
}

export interface PaginatedSuggestions {
  data: Suggestion[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

export interface CreateSuggestionPayload {
  title: string;
  description: string;
  categories: SuggestionCategory[];
  isAnonymous?: boolean;
  imageUrl?: string;
}

export interface ReviewPayload {
  statusChanged: SuggestionStatus;
  note?: string;
  implementationStatus?: ImplementationStatus;
  implementationNote?: string;
}

export interface UpdateImplementationPayload {
  implementationStatus: ImplementationStatus;
  implementationNote?: string;
}

export interface SuggestionSummary {
  department: { total: number; byStatus: Record<string, number>; byCategory: Record<string, number> };
  organization: { total: number; byStatus: Record<string, number>; byCategory: Record<string, number> };
}

function buildQuery(params: Record<string, string | number | undefined>) {
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");
  return q ? `?${q}` : "";
}

export async function uploadSuggestionImage(file: File, token: string): Promise<string> {
  const presignRes = await apiClient(`${API_URL}/uploads/presigned-url`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ fileName: file.name, fileType: file.type, folder: "suggestions" }),
  }, token);
  const { uploadUrl, fileUrl } = await handleResponse<{ uploadUrl: string; fileUrl: string }>(presignRes);
  await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
  return fileUrl;
}

export const SimsService = {
  async submit(data: CreateSuggestionPayload, token: string): Promise<Suggestion> {
    const res = await apiClient(`${API_URL}/sims`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    }, token);
    return handleResponse<Suggestion>(res);
  },

  async getMine(token: string): Promise<Suggestion[]> {
    const res = await apiClient(`${API_URL}/sims/me`, { headers: authHeaders(token) }, token);
    return handleResponse<Suggestion[]>(res);
  },

  async getSummary(token: string): Promise<SuggestionSummary> {
    const res = await apiClient(`${API_URL}/sims/summary`, { headers: authHeaders(token) }, token);
    return handleResponse<SuggestionSummary>(res);
  },

  async getDepartment(
    token: string,
    params: { status?: SuggestionStatus; category?: SuggestionCategory; page?: number; limit?: number },
  ): Promise<PaginatedSuggestions> {
    const res = await apiClient(`${API_URL}/sims/department${buildQuery(params)}`, {
      headers: authHeaders(token),
    }, token);
    return handleResponse<PaginatedSuggestions>(res);
  },

  async getAll(
    token: string,
    params: {
      status?: SuggestionStatus;
      category?: SuggestionCategory;
      departmentId?: string;
      page?: number;
      limit?: number;
    },
  ): Promise<PaginatedSuggestions> {
    const res = await apiClient(`${API_URL}/sims${buildQuery(params)}`, {
      headers: authHeaders(token),
    }, token);
    return handleResponse<PaginatedSuggestions>(res);
  },

  // Suggestions assigned to the current user for review (as HOD)
  async getQueue(
    token: string,
    params: { status?: SuggestionStatus; category?: SuggestionCategory; page?: number; limit?: number },
  ): Promise<PaginatedSuggestions> {
    const res = await apiClient(`${API_URL}/sims/queue${buildQuery(params)}`, {
      headers: authHeaders(token),
    }, token);
    return handleResponse<PaginatedSuggestions>(res);
  },

  async getById(id: string, token: string): Promise<Suggestion> {
    const res = await apiClient(`${API_URL}/sims/${id}`, { headers: authHeaders(token) }, token);
    return handleResponse<Suggestion>(res);
  },

  async review(id: string, data: ReviewPayload, token: string): Promise<SuggestionReview> {
    const res = await apiClient(`${API_URL}/sims/${id}/review`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    }, token);
    return handleResponse<SuggestionReview>(res);
  },

  async updateImplementation(id: string, data: UpdateImplementationPayload, token: string): Promise<Suggestion> {
    const res = await apiClient(`${API_URL}/sims/${id}/implementation`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    }, token);
    return handleResponse<Suggestion>(res);
  },

};
