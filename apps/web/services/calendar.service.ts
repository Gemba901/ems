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
  visitId?: string | null;
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
  totalReschedules: number;
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

export type EventColor =
  | "TOMATO" | "FLAMINGO" | "TANGERINE" | "BANANA" | "SAGE" | "BASIL"
  | "PEACOCK" | "BLUEBERRY" | "LAVENDER" | "GRAPE" | "GRAPHITE";

export type EventVisibility = "PRIVATE" | "ORG_WIDE";

export type InvitationStatus = "PENDING" | "ACCEPTED" | "DECLINED";
export type EventRecurrencePattern = "DAILY" | "WEEKLY" | "MONTHLY";

export interface HolisticCalendarEvent {
  id: string;
  title: string;
  description: string | null;
  label: string | null;
  color: EventColor;
  visibility: EventVisibility;
  startAt: string;
  endAt: string;
  allDay: boolean;
  isRecurring: boolean;
  recurrencePattern: EventRecurrencePattern | null;
  recurrenceInterval: number;
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
  events: HolisticCalendarEvent[];
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
  label?: string;
  color?: EventColor;
  visibility?: EventVisibility;
  startAt: string;
  endAt: string;
  allDay?: boolean;
  isRecurring?: boolean;
  recurrencePattern?: EventRecurrencePattern;
  recurrenceInterval?: number;
  recurrenceEndAt?: string;
  inviteeIds?: string[];
}

export interface UpdateCalendarEventPayload {
  title?: string;
  description?: string;
  label?: string;
  color?: EventColor;
  visibility?: EventVisibility;
  startAt?: string;
  endAt?: string;
  allDay?: boolean;
  addInviteeIds?: string[];
  removeInviteeIds?: string[];
  updateMode?: "THIS_ONLY" | "ALL_IN_SERIES";
}

export const EVENT_COLORS: EventColor[] = [
  "TOMATO", "FLAMINGO", "TANGERINE", "BANANA", "SAGE", "BASIL",
  "PEACOCK", "BLUEBERRY", "LAVENDER", "GRAPE", "GRAPHITE",
];

export const EVENT_COLOR_CONFIG: Record<EventColor, { label: string; dot: string; badge: string; border: string; solid: string }> = {
  TOMATO:    { label: "Tomato",    dot: "bg-red-500",     badge: "bg-red-100 text-red-700",         border: "border-red-200",     solid: "bg-red-500 text-white" },
  FLAMINGO:  { label: "Flamingo",  dot: "bg-pink-400",    badge: "bg-pink-100 text-pink-700",       border: "border-pink-200",    solid: "bg-pink-400 text-white" },
  TANGERINE: { label: "Tangerine", dot: "bg-orange-500",  badge: "bg-orange-100 text-orange-700",   border: "border-orange-200",  solid: "bg-orange-500 text-white" },
  BANANA:    { label: "Banana",    dot: "bg-yellow-400",  badge: "bg-yellow-100 text-yellow-700",   border: "border-yellow-200",  solid: "bg-yellow-400 text-slate-900" },
  SAGE:      { label: "Sage",      dot: "bg-green-300",   badge: "bg-green-50 text-green-700",      border: "border-green-200",   solid: "bg-green-300 text-green-900" },
  BASIL:     { label: "Basil",     dot: "bg-emerald-700", badge: "bg-emerald-100 text-emerald-800", border: "border-emerald-300", solid: "bg-emerald-700 text-white" },
  PEACOCK:   { label: "Peacock",   dot: "bg-cyan-600",    badge: "bg-cyan-100 text-cyan-700",       border: "border-cyan-200",    solid: "bg-cyan-600 text-white" },
  BLUEBERRY: { label: "Blueberry", dot: "bg-blue-600",    badge: "bg-blue-100 text-blue-700",       border: "border-blue-200",    solid: "bg-blue-600 text-white" },
  LAVENDER:  { label: "Lavender",  dot: "bg-violet-300",  badge: "bg-violet-50 text-violet-700",    border: "border-violet-200",  solid: "bg-violet-300 text-violet-900" },
  GRAPE:     { label: "Grape",     dot: "bg-purple-600",  badge: "bg-purple-100 text-purple-700",   border: "border-purple-200",  solid: "bg-purple-600 text-white" },
  GRAPHITE:  { label: "Graphite",  dot: "bg-slate-500",   badge: "bg-slate-200 text-slate-700",     border: "border-slate-300",   solid: "bg-slate-500 text-white" },
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

// ── Visit Month Plan Types ────────────────────────────────────────────────────

export interface VisitPlanSlot {
  id: string;
  planId: string;
  slotIndex: number;
  date: string | null;  // ISO string from API
  agenda: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VisitMonthPlan {
  id: string;
  clientOrgId: string;
  year: number;
  month: number;
  plannedDays: number;
  createdAt: string;
  updatedAt: string;
  slots: VisitPlanSlot[];
  clientOrg?: { id: string; name: string; logoUrl: string | null };
}

// ── Unified agenda ────────────────────────────────────────────────────────────

export type AgendaItemKind = "EVENT" | "VISIT" | "REQUEST" | "BLOCK";

export interface AgendaItem {
  id: string;
  kind: AgendaItemKind;
  title: string;
  startAt: string; // ISO
  endAt: string;   // ISO
  allDay: boolean;
  color: EventColor | string;
  detail: HolisticCalendarEvent | CalendarVisit | CalendarRequest | CalendarBlock;
}

export interface AgendaResponse {
  employeeId: string;
  pendingInvitationsCount: number;
  busyDates: string[];
  items: AgendaItem[];
}

export const CalendarService = {
  async getMonthVisits(
    year: number,
    month: number,
    token: string,
    filterOrgId?: string,
  ): Promise<{ visits: CalendarVisit[]; requests: CalendarRequest[]; blocks: CalendarBlock[]; busyDates: string[] }> {
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

  // ── Visit Month Plans ──────────────────────────────────────────────────────

  async getVisitMonthPlan(clientOrgId: string, year: number, month: number, token: string): Promise<VisitMonthPlan | null> {
    const params = new URLSearchParams({ clientOrgId, year: String(year), month: String(month) });
    const res = await apiClient(`${API_URL}/calendar/visit-plans?${params}`, { headers: authHeaders(token) }, token);
    return handleResponse(res);
  },

  async getAllVisitMonthPlans(year: number, month: number, token: string): Promise<VisitMonthPlan[]> {
    const params = new URLSearchParams({ year: String(year), month: String(month) });
    const res = await apiClient(`${API_URL}/calendar/visit-plans/all?${params}`, { headers: authHeaders(token) }, token);
    return handleResponse(res);
  },

  async upsertVisitMonthPlan(
    data: { clientOrgId: string; year: number; month: number; plannedDays: number },
    token: string,
  ): Promise<VisitMonthPlan> {
    const res = await apiClient(`${API_URL}/calendar/visit-plans`, {
      method: "PUT",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    }, token);
    return handleResponse(res);
  },

  async updateVisitPlanSlot(
    planId: string,
    slotIndex: number,
    data: { date?: string; agenda?: string },
    token: string,
  ): Promise<VisitPlanSlot> {
    const res = await apiClient(`${API_URL}/calendar/visit-plans/${planId}/slots/${slotIndex}`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(data),
    }, token);
    return handleResponse(res);
  },

  getIcalUrl(year: number, month?: number): string {
    const base = `${API_URL}/calendar/export/ical?year=${year}`;
    return month ? `${base}&month=${month}` : base;
  },

  // ── Unified agenda ───────────────────────────────────────────────────────────

  async getAgenda(year: number, month: number, token: string): Promise<AgendaResponse> {
    const params = new URLSearchParams({ year: String(year), month: String(month) });
    const res = await apiClient(`${API_URL}/calendar/agenda?${params}`, { headers: authHeaders(token) }, token);
    return handleResponse(res);
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

  async updateEvent(
    id: string,
    data: UpdateCalendarEventPayload,
    token: string,
  ): Promise<HolisticCalendarEvent | { updated: "series" }> {
    const res = await apiClient(`${API_URL}/calendar/events/${id}`, {
      method: "PATCH",
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
        label: string | null;
        color: EventColor;
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
