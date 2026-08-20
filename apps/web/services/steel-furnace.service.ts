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

export type FurnaceStatus = "READY" | "MAINTENANCE" | "DOWN" | "RETIRED";
export type FurnaceLiningStatus = "ACTIVE" | "RETIRED";

export interface FurnaceLining {
  id: string;
  furnaceId: string;
  installedAt: string;
  material: string | null;
  heatsCompleted: number;
  condition: string | null;
  thicknessRemainingMm: number | null;
  inspectionNotes: string | null;
  status: FurnaceLiningStatus;
  retiredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Furnace {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  status: FurnaceStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  // getAll returns just the current active lining (if any); getById returns full history.
  linings: FurnaceLining[];
}

export interface CreateFurnacePayload {
  code: string;
  name: string;
  status?: FurnaceStatus;
  notes?: string;
}

export interface UpdateFurnacePayload {
  name?: string;
  status?: FurnaceStatus;
  notes?: string;
}

export interface CreateFurnaceLiningPayload {
  installedAt?: string;
  material?: string;
  condition?: string;
  thicknessRemainingMm?: number;
  inspectionNotes?: string;
}

export interface UpdateFurnaceLiningConditionPayload {
  condition?: string;
  thicknessRemainingMm?: number;
  inspectionNotes?: string;
}

export const FurnaceService = {
  async create(data: CreateFurnacePayload, token: string): Promise<Furnace> {
    const res = await apiClient(`${API_URL}/steel/furnaces`, {
      method: "POST", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<Furnace>(res);
  },

  async getAll(token: string, params: { status?: FurnaceStatus; search?: string } = {}): Promise<Furnace[]> {
    const q = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join("&");
    const res = await apiClient(`${API_URL}/steel/furnaces${q ? `?${q}` : ""}`, { headers: authHeaders(token) }, token);
    return handleResponse<Furnace[]>(res);
  },

  async getById(id: string, token: string): Promise<Furnace> {
    const res = await apiClient(`${API_URL}/steel/furnaces/${id}`, { headers: authHeaders(token) }, token);
    return handleResponse<Furnace>(res);
  },

  async update(id: string, data: UpdateFurnacePayload, token: string): Promise<Furnace> {
    const res = await apiClient(`${API_URL}/steel/furnaces/${id}`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<Furnace>(res);
  },

  async getLinings(furnaceId: string, token: string): Promise<FurnaceLining[]> {
    const res = await apiClient(`${API_URL}/steel/furnaces/${furnaceId}/linings`, { headers: authHeaders(token) }, token);
    return handleResponse<FurnaceLining[]>(res);
  },

  async addLining(furnaceId: string, data: CreateFurnaceLiningPayload, token: string): Promise<FurnaceLining> {
    const res = await apiClient(`${API_URL}/steel/furnaces/${furnaceId}/linings`, {
      method: "POST", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<FurnaceLining>(res);
  },

  async updateLiningCondition(liningId: string, data: UpdateFurnaceLiningConditionPayload, token: string): Promise<FurnaceLining> {
    const res = await apiClient(`${API_URL}/steel/furnaces/linings/${liningId}/condition`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify(data),
    }, token);
    return handleResponse<FurnaceLining>(res);
  },

  async retireLining(liningId: string, notes: string | undefined, token: string): Promise<FurnaceLining> {
    const res = await apiClient(`${API_URL}/steel/furnaces/linings/${liningId}/retire`, {
      method: "PATCH", headers: authHeaders(token), body: JSON.stringify({ notes }),
    }, token);
    return handleResponse<FurnaceLining>(res);
  },
};
