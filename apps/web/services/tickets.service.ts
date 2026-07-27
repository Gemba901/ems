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

export type TicketType = "SYSTEM_TICKET" | "COMPANY_TICKET";
export type TicketStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "ARCHIVED";

export interface TicketEmployee {
  id: string;
  firstName: string;
  lastName: string;
  department?: { id: string; name: string } | null;
}

export interface TicketUpdate {
  id: string;
  ticketId: string;
  updatedById: string;
  statusChanged: TicketStatus | null;
  typeChanged: TicketType | null;
  note: string | null;
  createdAt: string;
  updatedBy: { id: string; firstName: string; lastName: string };
}

export interface Ticket {
  id: string;
  organizationId: string;
  raisedById: string;
  type: TicketType;
  module: string;
  subject: string;
  message: string;
  department: string | null;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
  raisedBy: TicketEmployee;
}

export interface TicketDetail extends Ticket {
  updates: TicketUpdate[];
}

export interface CreateTicketPayload {
  module: string;
  subject: string;
  message: string;
  department: string;
}

export interface UpdateTicketPayload {
  typeChanged?: TicketType;
  statusChanged?: TicketStatus;
  note?: string;
}

export const TICKET_MODULES = ["SIMS", "LEAVE", "ATTENDANCE", "HR", "EMS", "DWMS", "CALENDAR", "OTHER"] as const;

export const TicketsService = {
  async create(data: CreateTicketPayload, token: string): Promise<Ticket> {
    const res = await apiClient(`${API_URL}/tickets`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ ...data, type: "COMPANY_TICKET" }),
    }, token);
    return handleResponse<Ticket>(res);
  },

  async getMine(token: string): Promise<Ticket[]> {
    const res = await apiClient(`${API_URL}/tickets/mine`, { headers: authHeaders(token) }, token);
    return handleResponse<Ticket[]>(res);
  },

  async getCompanyTickets(token: string): Promise<Ticket[]> {
    const res = await apiClient(`${API_URL}/tickets/company`, { headers: authHeaders(token) }, token);
    return handleResponse<Ticket[]>(res);
  },

  async getSystemTickets(token: string): Promise<Ticket[]> {
    const res = await apiClient(`${API_URL}/tickets/system`, { headers: authHeaders(token) }, token);
    return handleResponse<Ticket[]>(res);
  },

  async getById(id: string, token: string): Promise<TicketDetail> {
    const res = await apiClient(`${API_URL}/tickets/${id}`, { headers: authHeaders(token) }, token);
    return handleResponse<TicketDetail>(res);
  },

  async update(id: string, data: UpdateTicketPayload, token: string): Promise<Ticket> {
    const res = await apiClient(`${API_URL}/tickets/${id}`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    }, token);
    return handleResponse<Ticket>(res);
  },
};
