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

export type KaizenStatus =
  | "DRAFT"
  | "IN_PROGRESS"
  | "SUBMITTED_FOR_VERIFICATION"
  | "VERIFIED_CLOSED"
  | "FURTHER_IMPROVEMENT_REQUIRED"
  | "MOVED_TO_SGA";

export interface KaizenEmployee {
  id: string;
  firstName: string;
  lastName: string;
  department: { id: string; name: string } | null;
}

export interface KaizenReview {
  id: string;
  statusChanged: KaizenStatus;
  note: string | null;
  createdAt: string;
  reviewer: { id: string; firstName: string; lastName: string };
}

export interface Kaizen {
  id: string;
  organizationId: string;
  employeeId: string;
  departmentId: string;
  status: KaizenStatus;

  problem: string;
  beforePhotoUrl: string;
  improvementDescription: string | null;
  afterPhotoUrl: string | null;
  benefitAchieved: string | null;

  teamMembers: string | null;
  benefitCategory: string | null;
  beforeValue: string | null;
  afterValue: string | null;
  costSaving: string | null;
  comments: string | null;

  verifiedById: string | null;
  verificationComment: string | null;
  standardUpdated: boolean | null;
  linkedSgaId: string | null;

  createdAt: string;
  updatedAt: string;

  employee: KaizenEmployee;
  department: { id: string; name: string } | null;
  verifiedBy: { id: string; firstName: string; lastName: string } | null;
  reviews: KaizenReview[];
}

export interface CreateKaizenPayload {
  problem: string;
  beforePhotoUrl: string;
  teamMembers?: string;
  benefitCategory?: string;
  comments?: string;
  startImprovement?: boolean;
}

export interface UpdateKaizenPayload {
  improvementDescription?: string;
  afterPhotoUrl?: string;
  benefitAchieved?: string;
  beforeValue?: string;
  afterValue?: string;
  costSaving?: string;
  comments?: string;
  submitForVerification?: boolean;
}

export interface VerifyKaizenPayload {
  verificationComment?: string;
  standardUpdated?: boolean;
  disposition: "VERIFIED_CLOSED" | "FURTHER_IMPROVEMENT_REQUIRED" | "MOVED_TO_SGA";
}

export const KaizenService = {
  async create(data: CreateKaizenPayload, token: string): Promise<Kaizen> {
    const res = await apiClient(`${API_URL}/kaizen`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    }, token);
    return handleResponse<Kaizen>(res);
  },

  async getAll(token: string): Promise<Kaizen[]> {
    const res = await apiClient(`${API_URL}/kaizen`, { headers: authHeaders(token) }, token);
    return handleResponse<Kaizen[]>(res);
  },

  async getMine(token: string): Promise<Kaizen[]> {
    const res = await apiClient(`${API_URL}/kaizen/me`, { headers: authHeaders(token) }, token);
    return handleResponse<Kaizen[]>(res);
  },

  async getByDepartment(departmentId: string, token: string): Promise<Kaizen[]> {
    const res = await apiClient(`${API_URL}/kaizen/department/${departmentId}`, {
      headers: authHeaders(token),
    }, token);
    return handleResponse<Kaizen[]>(res);
  },

  async getById(id: string, token: string): Promise<Kaizen> {
    const res = await apiClient(`${API_URL}/kaizen/${id}`, { headers: authHeaders(token) }, token);
    return handleResponse<Kaizen>(res);
  },

  async getHistory(id: string, token: string): Promise<KaizenReview[]> {
    const res = await apiClient(`${API_URL}/kaizen/${id}/history`, { headers: authHeaders(token) }, token);
    return handleResponse<KaizenReview[]>(res);
  },

  async update(id: string, data: UpdateKaizenPayload, token: string): Promise<Kaizen> {
    const res = await apiClient(`${API_URL}/kaizen/${id}`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    }, token);
    return handleResponse<Kaizen>(res);
  },

  async verify(id: string, data: VerifyKaizenPayload, token: string): Promise<KaizenReview> {
    const res = await apiClient(`${API_URL}/kaizen/${id}/verify`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    }, token);
    return handleResponse<KaizenReview>(res);
  },
};
