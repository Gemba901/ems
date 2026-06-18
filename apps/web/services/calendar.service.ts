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
export type RecurrencePattern = "WEEKLY" | "BIWEEKLY" | "MONTHLY";

export interface CalendarBlock {
  id: string;
  date: string; // YYYY-MM-DD
  type: CalendarBlockType;
  label: string | null;
}

export interface VisitAttendee {
  id: string;
  employeeId: string;
  name: string;
  jobTitle: string | null;
  avatarUrl: string | null;
  role: string | null;
}

export interface CalendarVisit {
  id: string;
  type: "VISIT";
  date: string; // YYYY-MM-DD
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  status: VisitStatus;
  isOwn: boolean;
  title?: string;
  clientOrgId?: string;
  clientOrgName?: string;
  notes?: string;
  internalNotes?: string;
  completionNote?: string;
  recurrencePattern?: RecurrencePattern;
  recurrenceGroupId?: string;
  attendees?: VisitAttendee[];
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

export interface OrgEmployee {
  id: string;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
  avatarUrl: string | null;
}

export interface UpcomingVisit {
  id: string;
  title: string;
  date: string;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  status: VisitStatus;
  clientOrgName: string;
  clientOrgId: string;
}

export interface AnalyticsMonth {
  month: number;
  total: number;
  tentative: number;
  confirmed: number;
  completed: number;
  cancelled: number;
}

export interface AnalyticsOrgRow {
  orgId: string;
  orgName: string;
  total: number;
  completed: number;
}

export interface CalendarAnalytics {
  year: number;
  totalVisits: number;
  completedVisits: number;
  pendingRequests: number;
  byMonth: AnalyticsMonth[];
  byOrg?: AnalyticsOrgRow[];
}

export interface CreateVisitPayload {
  title: string;
  clientOrgId: string;
  date: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  status?: VisitStatus;
  notes?: string;
  internalNotes?: string;
  completionNote?: string;
  recurrencePattern?: RecurrencePattern;
  recurrenceEndDate?: string;
}

export interface UpdateVisitPayload {
  title?: string;
  clientOrgId?: string;
  date?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  status?: VisitStatus;
  notes?: string;
  internalNotes?: string;
  completionNote?: string;
}

// ── Holistic Calendar Types ───────────────────────────────────────────────────

export type CalendarEventType =
  | "PERSONAL_EVENT" | "PERSONAL_REMINDER" | "BIRTHDAY" | "PERSONAL_TRAINING"
  | "COMPANY_TRAINING" | "COMPANY_EVENT" | "COMPANY_HOLIDAY"
  | "MEETING" | "AUDIT" | "TRAINING_SESSION";

export type InvitationStatus = "PENDING" | "ACCEPTED" | "DECLINED";
export type EventRecurrencePattern = "DAILY" | "WEEKLY" | "MONTHLY";

export interface HolisticCalendarEvent {
  id: string;
  title: string;
  description: string | null;
  type: CalendarEventType;
  startAt: string;
  endAt: string;
  allDay: boolean;
  isRecurring: boolean;
  recurrencePattern: EventRecurrencePattern | null;
  recurrenceEndAt: string | null;
  parentEventId: string | null;
  isOwner: boolean;
  myInvitationStatus: InvitationStatus | null;
  createdBy: { id: string; name: string; avatarUrl: string | null } | null;
  invitations: { id: string; status: InvitationStatus; invitee: { id: string; name: string; avatarUrl: string | null } }[];
  participants: { id: string; name: string; avatarUrl: string | null }[];
}

export interface CalendarEventsResponse {
  employeeId: string;
  pendingInvitationsCount: number;
  personal: HolisticCalendarEvent[];
  company: HolisticCalendarEvent[];
  training: HolisticCalendarEvent[];
}

export interface OrgEmployeeForInvite {
  id: string;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
  avatarUrl: string | null;
  department: { name: string } | null;
}

export interface CreateCalendarEventPayload {
  title: string;
  description?: string;
  type: CalendarEventType;
  startAt: string;
  endAt: string;
  allDay?: boolean;
  isRecurring?: boolean;
  recurrencePattern?: EventRecurrencePattern;
  recurrenceEndAt?: string;
  inviteeIds?: string[];
  participantIds?: string[];
}

export const EVENT_TYPE_CONFIG: Record<CalendarEventType, { label: string; dot: string; badge: string; border: string }> = {
  PERSONAL_EVENT:    { label: "Personal Event",    dot: "bg-indigo-500",  badge: "bg-indigo-100 text-indigo-700",   border: "border-indigo-200" },
  PERSONAL_REMINDER: { label: "Reminder",          dot: "bg-amber-400",   badge: "bg-amber-100 text-amber-700",     border: "border-amber-200" },
  BIRTHDAY:          { label: "Birthday",          dot: "bg-rose-400",    badge: "bg-rose-100 text-rose-700",       border: "border-rose-200" },
  PERSONAL_TRAINING: { label: "Personal Training", dot: "bg-cyan-500",    badge: "bg-cyan-100 text-cyan-700",       border: "border-cyan-200" },
  COMPANY_TRAINING:  { label: "Company Training",  dot: "bg-orange-500",  badge: "bg-orange-100 text-orange-700",   border: "border-orange-200" },
  COMPANY_EVENT:     { label: "Company Event",     dot: "bg-blue-500",    badge: "bg-blue-100 text-blue-700",       border: "border-blue-200" },
  COMPANY_HOLIDAY:   { label: "Holiday",           dot: "bg-red-500",     badge: "bg-red-100 text-red-700",         border: "border-red-200" },
  MEETING:           { label: "Meeting",           dot: "bg-violet-500",  badge: "bg-violet-100 text-violet-700",   border: "border-violet-200" },
  AUDIT:             { label: "Audit",             dot: "bg-slate-600",   badge: "bg-slate-200 text-slate-700",     border: "border-slate-300" },
  TRAINING_SESSION:  { label: "Training Session",  dot: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-700", border: "border-emerald-200" },
};

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

export const RECURRENCE_LABELS: Record<RecurrencePattern, string> = {
  WEEKLY:   "Weekly",
  BIWEEKLY: "Every 2 weeks",
  MONTHLY:  "Monthly",
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

  async addAttendee(visitId: string, data: { employeeId: string; role?: string }, token: string): Promise<VisitAttendee> {
    const res = await apiClient(`${API_URL}/calendar/visits/${visitId}/attendees`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    }, token);
    return handleResponse(res);
  },

  async removeAttendee(visitId: string, employeeId: string, token: string): Promise<void> {
    const res = await apiClient(`${API_URL}/calendar/visits/${visitId}/attendees/${employeeId}`, {
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

  async getOrgEmployees(orgId: string, token: string): Promise<OrgEmployee[]> {
    const res = await apiClient(`${API_URL}/calendar/organizations/${orgId}/employees`, {
      headers: authHeaders(token),
    }, token);
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

  async getUpcomingVisits(token: string, limit = 5): Promise<UpcomingVisit[]> {
    const res = await apiClient(`${API_URL}/calendar/upcoming?limit=${limit}`, {
      headers: authHeaders(token),
    }, token);
    return handleResponse(res);
  },

  async getAnalytics(year: number, token: string): Promise<CalendarAnalytics> {
    const res = await apiClient(`${API_URL}/calendar/analytics?year=${year}`, {
      headers: authHeaders(token),
    }, token);
    return handleResponse(res);
  },

  getIcalUrl(year: number, month?: number): string {
    const base = `${API_URL}/calendar/export/ical?year=${year}`;
    return month ? `${base}&month=${month}` : base;
  },

  // ── Holistic Calendar ────────────────────────────────────────────────────────

  async getEvents(year: number, month: number, token: string): Promise<CalendarEventsResponse> {
    const params = new URLSearchParams({ year: String(year), month: String(month) });
    const res = await apiClient(`${API_URL}/calendar/events?${params}`, { headers: authHeaders(token) }, token);
    return handleResponse(res);
  },

  async createEvent(
    data: CreateCalendarEventPayload,
    token: string,
  ): Promise<{ event: HolisticCalendarEvent; onLeaveWarnings: { employeeId: string; name: string }[] }> {
    const res = await apiClient(`${API_URL}/calendar/events`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    }, token);
    return handleResponse(res);
  },

  async deleteEvent(id: string, token: string, deleteMode?: "THIS_ONLY" | "ALL_IN_SERIES"): Promise<void> {
    const params = deleteMode ? `?deleteMode=${deleteMode}` : "";
    const res = await apiClient(`${API_URL}/calendar/events/${id}${params}`, {
      method: "DELETE",
      headers: authHeaders(token),
    }, token);
    await handleResponse(res);
  },

  async respondToInvitation(eventId: string, status: "ACCEPTED" | "DECLINED", token: string): Promise<void> {
    const res = await apiClient(`${API_URL}/calendar/events/${eventId}/respond`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ status }),
    }, token);
    await handleResponse(res);
  },

  async checkAvailability(
    employeeId: string,
    startAt: string,
    endAt: string,
    token: string,
  ): Promise<{ available: boolean; leave: { type: string; startDate: string; endDate: string } | null }> {
    const params = new URLSearchParams({ employeeId, startAt, endAt });
    const res = await apiClient(`${API_URL}/calendar/availability?${params}`, { headers: authHeaders(token) }, token);
    return handleResponse(res);
  },

  async getOrgEmployeesForInvite(token: string): Promise<OrgEmployeeForInvite[]> {
    const res = await apiClient(`${API_URL}/calendar/org-employees`, { headers: authHeaders(token) }, token);
    return handleResponse(res);
  },

  async getEmployeeEventStats(employeeId: string, token: string): Promise<{
    accepted: number; declined: number; pending: number; total: number;
  }> {
    const res = await apiClient(`${API_URL}/calendar/employees/${employeeId}/stats`, {
      headers: authHeaders(token),
    }, token);
    return handleResponse(res);
  },

  async getEmployeeInvitationLog(
    employeeId: string,
    token: string,
    page = 1,
    limit = 10,
  ): Promise<{
    invitations: {
      id: string;
      status: InvitationStatus;
      respondedAt: string | null;
      createdAt: string;
      event: {
        id: string;
        title: string;
        type: CalendarEventType;
        startAt: string;
        endAt: string;
        createdBy: { id: string; firstName: string; lastName: string };
      };
    }[];
    total: number;
    page: number;
    limit: number;
  }> {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    const res = await apiClient(
      `${API_URL}/calendar/employees/${employeeId}/invitation-log?${params}`,
      { headers: authHeaders(token) },
      token,
    );
    return handleResponse(res);
  },
};
