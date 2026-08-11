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

export interface SteelRecentActivityItem {
  id: string;
  process: string;
  activity: string;
  reference: string;
  performedBy: string;
  notes: string | null;
  createdAt: string;
  href: string;
}

export const SteelDashboardService = {
  async getRecentActivity(token: string, limit?: number): Promise<SteelRecentActivityItem[]> {
    const query = limit ? `?limit=${limit}` : "";
    const res = await apiClient(`${API_URL}/steel/dashboard/recent-activity${query}`, {
      headers: authHeaders(token),
    }, token);
    return handleResponse<SteelRecentActivityItem[]>(res);
  },
};
