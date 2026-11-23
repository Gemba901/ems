import { apiClient } from "@/lib/api-client";
import type {
  AlertStatusFilter,
  AssignmentDetail,
  AssignmentSummary,
  Directory,
  HistoryRow,
  MonitoringAlert,
  MonitoringFilters,
  QueueRow,
  RowFailure,
  TrackedAction,
} from "@/components/leadership-excellence/monitoring-control/types";

// Area 05 · Monitoring & Control: calls to /leadership-excellence/monitoring-control/*.
const BASE = "/api/leadership-excellence/monitoring-control";

/** An API error that may list which rows failed (verify / return are all-or-nothing). */
export class MonitoringError extends Error {
  constructor(message: string, readonly failures: RowFailure[] = []) {
    super(message);
  }
}

async function call<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const response = await apiClient(`${BASE}${path}`, init, token);
  const value = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = Array.isArray(value.message) ? value.message.join(" ") : value.message || "Something went wrong. Try again.";
    throw new MonitoringError(message, Array.isArray(value.failures) ? value.failures : []);
  }
  return value as T;
}

const post = <T>(path: string, token: string, body: unknown) =>
  call<T>(path, token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const query = (filters: MonitoringFilters = {}) => {
  const q = new URLSearchParams();
  if (filters.departmentId) q.set("departmentId", filters.departmentId);
  if (filters.month) q.set("month", filters.month);
  const s = q.toString();
  return s ? `?${s}` : "";
};

/** Names for employee and department ids, plus the caller's employee id. */
export const getDirectory = (token: string, signal?: AbortSignal) => call<Directory>("/directory", token, { signal });

// ---- 05.01 · Verify results ----
export const getVerificationQueue = (token: string, filters: MonitoringFilters, signal?: AbortSignal) =>
  call<QueueRow[]>(`/verification/queue${query(filters)}`, token, { signal });

export const getVerificationHistory = (token: string, filters: MonitoringFilters, signal?: AbortSignal) =>
  call<HistoryRow[]>(`/verification/history${query(filters)}`, token, { signal });

export const verifyResults = (token: string, submissionIds: string[], note?: string) =>
  post<{ verified: number }>("/verification/verify", token, { submissionIds, note: note || undefined });

export const returnResults = (token: string, submissionIds: string[], reason: string) =>
  post<{ returned: number }>("/verification/return", token, { submissionIds, reason });

// ---- 05.02 · Performance & gaps ----
export const getPerformance = (token: string, filters: MonitoringFilters, signal?: AbortSignal) =>
  call<AssignmentSummary[]>(`/performance${query(filters)}`, token, { signal });

export const getPerformanceDetail = (token: string, assignmentId: string, signal?: AbortSignal) =>
  call<AssignmentDetail>(`/performance/${encodeURIComponent(assignmentId)}`, token, { signal });

// ---- 05.03 · Alerts & follow-up ----
export const getAlerts = (token: string, status: AlertStatusFilter, signal?: AbortSignal) =>
  call<MonitoringAlert[]>(`/alerts?status=${status}`, token, { signal });

export const getLinkableActions = (token: string, signal?: AbortSignal) =>
  call<TrackedAction[]>("/alerts/linkable-actions", token, { signal });

export const acknowledgeAlert = (token: string, id: string, note: string) =>
  post<MonitoringAlert>(`/alerts/${id}/acknowledge`, token, { note });

export const escalateAlert = (token: string, id: string, note: string) =>
  post<MonitoringAlert>(`/alerts/${id}/escalate`, token, { note });

export const linkFollowUp = (token: string, id: string, actionId: string, note: string) =>
  post<MonitoringAlert>(`/alerts/${id}/follow-up`, token, { actionId, note });
