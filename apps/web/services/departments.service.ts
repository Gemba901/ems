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

export interface DepartmentWithCount {
  id: string;
  name: string;
  organizationId: string;
  isPlatformTeam: boolean;
  _count: { employees: number };
}

export const DepartmentsService = {
  async getAll(token: string): Promise<DepartmentWithCount[]> {
    const res = await apiClient(`${API_URL}/departments`, { headers: authHeaders(token) }, token);
    return handleResponse<DepartmentWithCount[]>(res);
  },
};
