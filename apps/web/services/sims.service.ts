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
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "NEEDS_CLARIFICATION"
  | "APPROVED"
  | "REJECTED"
  | "IMPLEMENTED"
  | "ARCHIVED";

export type SuggestionCategory =
  | "QUALITY"
  | "COST"
  | "DELIVERY"
  | "SAFETY"
  | "MORALE"
  | "TECHNOLOGY";

export type SuggestionPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

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
  status: SuggestionStatus;
  priority: SuggestionPriority;
  category: SuggestionCategory;
  isAnonymous: boolean;
  employeeId: string;
  organizationId: string;
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
  category: SuggestionCategory;
  priority?: SuggestionPriority;
  isAnonymous?: boolean;
}

export interface ReviewPayload {
  statusChanged: SuggestionStatus;
  note?: string;
}

function buildQuery(params: Record<string, string | number | undefined>) {
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");
  return q ? `?${q}` : "";
}

export const SimsService = {
  async submit(data: CreateSuggestionPayload, token: string): Promise<Suggestion> {
    const res = await fetch(`${API_URL}/sims`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    });
    return handleResponse<Suggestion>(res);
  },

  async getMine(token: string): Promise<Suggestion[]> {
    const res = await fetch(`${API_URL}/sims/me`, { headers: authHeaders(token) });
    return handleResponse<Suggestion[]>(res);
  },

  async getDepartment(
    token: string,
    params: { status?: SuggestionStatus; category?: SuggestionCategory; priority?: SuggestionPriority; page?: number; limit?: number },
  ): Promise<PaginatedSuggestions> {
    const res = await fetch(`${API_URL}/sims/department${buildQuery(params)}`, {
      headers: authHeaders(token),
    });
    return handleResponse<PaginatedSuggestions>(res);
  },

  async getAll(
    token: string,
    params: { status?: SuggestionStatus; category?: SuggestionCategory; priority?: SuggestionPriority; departmentId?: string; page?: number; limit?: number },
  ): Promise<PaginatedSuggestions> {
    const res = await fetch(`${API_URL}/sims${buildQuery(params)}`, {
      headers: authHeaders(token),
    });
    return handleResponse<PaginatedSuggestions>(res);
  },

  async getById(id: string, token: string): Promise<Suggestion> {
    const res = await fetch(`${API_URL}/sims/${id}`, { headers: authHeaders(token) });
    return handleResponse<Suggestion>(res);
  },

  async review(id: string, data: ReviewPayload, token: string): Promise<SuggestionReview> {
    const res = await fetch(`${API_URL}/sims/${id}/review`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    });
    return handleResponse<SuggestionReview>(res);
  },
};
