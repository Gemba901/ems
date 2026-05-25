import { apiClient } from "@/lib/api-client";
const API_URL = process.env.NEXT_PUBLIC_API_URL;

function authHeaders(token: string) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Request failed with status ${res.status}`);
  }
  return res.json();
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type VisitStatus = "TENTATIVE" | "CONFIRMED" | "CANCELLED" | "COMPLETED";
export type RequestStatus = "PENDING" | "APPROVED" | "REJECTED";
export type CalendarBlockType = "HOLIDAY" | "BUSY_DAY";

export interface CalendarBlock {
  id: string;
  date: string; // YYYY-MM-DD
  type: CalendarBlockType;
  label: string | null;
}

export interface CalendarVisit {
  id: string;
  type: "VISIT";
  date: string; // YYYY-MM-DD
  startTime: string | null;
  endTime: string | null;
  status: VisitStatus;
  isOwn: boolean;
  // Only present for own visits or SUPER_ADMIN
  title?: string;
  clientOrgId?: string;
  clientOrgName?: string;
  notes?: string;
  internalNotes?: string;
}

export interface CalendarRequest {
  id: string;
  type: "REQUEST";
  date: string; // YYYY-MM-DD
  preferredTime: string | null;
  status: RequestStatus;
  organizationId?: string;
  organizationName?: string;
  message?: string;
  responseNote?: string;
  isOwn: boolean;
}

export type CalendarEntry = CalendarVisit | CalendarRequest;

export interface ClientOrg {
  id: string;
  name: string;
  logoUrl: string | null;
}

export interface AdminOrg {
  id: string;
  name: string;
  logoUrl: string | null;
  isAdminOrg: true;
}

export interface VisitRequest {
  id: string;
  requestedDate: string;
  preferredTime: string | null;
  message: string | null;
  status: RequestStatus;
  responseNote: string | null;
  createdAt: string;
  organization: { id: string; name: string; logoUrl: string | null };
  createdBy: { id: string; name: string };
}

export interface CreateVisitPayload {
  title: string;
  clientOrgId: string;
  date: string;
  startTime?: string;
  endTime?: string;
  status?: VisitStatus;
  notes?: string;
  internalNotes?: string;
}

export interface UpdateVisitPayload {
  title?: string;
  clientOrgId?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  status?: VisitStatus;
  notes?: string;
  internalNotes?: string;
}

// ── Status helpers ────────────────────────────────────────────────────────────

export const VISIT_STATUS_LABELS: Record<VisitStatus, string> = {
  TENTATIVE: "Tentative",
  CONFIRMED: "Confirmed",
  CANCELLED: "Cancelled",
  COMPLETED: "Completed",
};

export const VISIT_STATUS_COLOR: Record<VisitStatus, string> = {
  TENTATIVE: "bg-amber-100 text-amber-700 border-amber-200",
  CONFIRMED: "bg-emerald-100 text-emerald-700 border-emerald-200",
  CANCELLED: "bg-slate-100 text-slate-500 border-slate-200",
  COMPLETED: "bg-blue-100 text-blue-700 border-blue-200",
};

export const VISIT_DOT_COLOR: Record<VisitStatus, string> = {
  TENTATIVE: "bg-amber-400",
  CONFIRMED: "bg-emerald-500",
  CANCELLED: "bg-slate-300",
  COMPLETED: "bg-blue-400",
};

export const REQUEST_STATUS_COLOR: Record<RequestStatus, string> = {
  PENDING:  "bg-amber-100 text-amber-700",
  APPROVED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-red-100 text-red-700",
};

// ── API calls ─────────────────────────────────────────────────────────────────

export const CalendarService = {
  async getMonthVisits(
    year: number,
    month: number,
    token: string,
    filterOrgId?: string,
  ): Promise<{ visits: CalendarVisit[]; requests: CalendarRequest[]; blocks: CalendarBlock[] }> {
    const params = new URLSearchParams({ year: String(year), month: String(month) });
    if (filterOrgId) params.set("clientOrgId", filterOrgId);
    const res = await apiClient(`${API_URL}/calendar/visits?${params}`, {
      headers: authHeaders(token),
    }, token);
    return handleResponse(res);
  },

  async createVisit(data: CreateVisitPayload, token: string): Promise<CalendarVisit> {
    const res = await apiClient(`${API_URL}/calendar/visits`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    }, token);
    return handleResponse(res);
  },

  async updateVisit(id: string, data: UpdateVisitPayload, token: string): Promise<CalendarVisit> {
    const res = await apiClient(`${API_URL}/calendar/visits/${id}`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    }, token);
    return handleResponse(res);
  },

  async deleteVisit(id: string, token: string): Promise<void> {
    const res = await apiClient(`${API_URL}/calendar/visits/${id}`, {
      method: "DELETE",
      headers: authHeaders(token),
    }, token);
    await handleResponse(res);
  },

  async getRequests(token: string): Promise<VisitRequest[]> {
    const res = await apiClient(`${API_URL}/calendar/requests`, { headers: authHeaders(token) }, token);
    return handleResponse(res);
  },

  async createRequest(
    data: { requestedDate: string; preferredTime?: string; message?: string },
    token: string,
  ): Promise<VisitRequest> {
    const res = await apiClient(`${API_URL}/calendar/requests`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    }, token);
    return handleResponse(res);
  },

  async respondToRequest(
    id: string,
    data: { status: RequestStatus; responseNote?: string },
    token: string,
  ): Promise<VisitRequest> {
    const res = await apiClient(`${API_URL}/calendar/requests/${id}/respond`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    }, token);
    return handleResponse(res);
  },

  async getClientOrganizations(token: string): Promise<ClientOrg[]> {
    const res = await apiClient(`${API_URL}/calendar/organizations`, { headers: authHeaders(token) }, token);
    return handleResponse(res);
  },

  async getAdminOrg(token: string): Promise<AdminOrg | null> {
    const res = await apiClient(`${API_URL}/calendar/admin-org`, { headers: authHeaders(token) }, token);
    return handleResponse(res);
  },

  async createBlock(
    data: { date: string; type: CalendarBlockType; label?: string },
    token: string,
  ): Promise<CalendarBlock> {
    const res = await apiClient(`${API_URL}/calendar/blocks`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    }, token);
    return handleResponse(res);
  },

  async deleteBlock(id: string, token: string): Promise<void> {
    const res = await apiClient(`${API_URL}/calendar/blocks/${id}`, {
      method: "DELETE",
      headers: authHeaders(token),
    }, token);
    await handleResponse(res);
  },
};
