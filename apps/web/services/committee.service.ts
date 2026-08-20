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

export type CommitteeType =
  | "QUALITY"
  | "COST"
  | "DELIVERY"
  | "SAFETY"
  | "MORALE"
  | "TECHNOLOGY"
  | "GENERAL";

export interface CommitteeMember {
  committeeId: string;
  employeeId: string;
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    department: { id: string; name: string } | null;
  };
}

export interface SteeringCommittee {
  id: string;
  name: string;
  type: CommitteeType;
  organizationId: string;
  createdAt: string;
  members: CommitteeMember[];
}

export interface MyCommittee {
  id: string;
  name: string;
  type: CommitteeType;
}

export interface CreateCommitteePayload {
  name: string;
  type: CommitteeType;
}

export const CommitteeService = {
  async getMyCommittees(token: string): Promise<MyCommittee[]> {
    const res = await apiClient(`${API_URL}/committees/me`, {
      headers: authHeaders(token),
    }, token);
    return handleResponse<MyCommittee[]>(res);
  },

  async list(token: string): Promise<SteeringCommittee[]> {
    const res = await apiClient(`${API_URL}/committees`, {
      headers: authHeaders(token),
    }, token);
    return handleResponse<SteeringCommittee[]>(res);
  },

  async listRoutable(token: string): Promise<MyCommittee[]> {
    const res = await apiClient(`${API_URL}/committees/routable`, {
      headers: authHeaders(token),
    }, token);
    return handleResponse<MyCommittee[]>(res);
  },

  async create(data: CreateCommitteePayload, token: string): Promise<SteeringCommittee> {
    const res = await apiClient(`${API_URL}/committees`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    }, token);
    return handleResponse<SteeringCommittee>(res);
  },

  async getById(id: string, token: string): Promise<SteeringCommittee> {
    const res = await apiClient(`${API_URL}/committees/${id}`, {
      headers: authHeaders(token),
    }, token);
    return handleResponse<SteeringCommittee>(res);
  },

  async addMember(committeeId: string, employeeId: string, token: string): Promise<SteeringCommittee> {
    const res = await apiClient(`${API_URL}/committees/${committeeId}/members`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ employeeId }),
    }, token);
    return handleResponse<SteeringCommittee>(res);
  },

  async removeMember(committeeId: string, employeeId: string, token: string): Promise<SteeringCommittee> {
    const res = await apiClient(`${API_URL}/committees/${committeeId}/members/${employeeId}`, {
      method: "DELETE",
      headers: authHeaders(token),
    }, token);
    return handleResponse<SteeringCommittee>(res);
  },

  async deleteCommittee(id: string, token: string): Promise<{ message: string }> {
    const res = await apiClient(`${API_URL}/committees/${id}`, {
      method: "DELETE",
      headers: authHeaders(token),
    }, token);
    return handleResponse<{ message: string }>(res);
  },

  // The single committee SELECTED_FOR_SGA suggestions are forwarded to for this org
  async getDesignated(token: string): Promise<MyCommittee | null> {
    const res = await apiClient(`${API_URL}/committees/designated`, {
      headers: authHeaders(token),
    }, token);
    return handleResponse<MyCommittee | null>(res);
  },

  async setDesignated(committeeId: string, token: string): Promise<SteeringCommittee> {
    const res = await apiClient(`${API_URL}/committees/designated/${committeeId}`, {
      method: "PATCH",
      headers: authHeaders(token),
    }, token);
    return handleResponse<SteeringCommittee>(res);
  },
};
