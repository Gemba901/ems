import type {
  CalendarDirectory,
  CalendarComparison,
  AudiencePreview,
} from "@/components/leadership-excellence/organisation-framework/rules-calendar/calendar-audience.types";
import { apiClient } from "@/lib/api-client";
import type {
  ApprovedCalendarSnapshot,
  ApprovedPerformanceCalendar,
  CalendarException,
  CalendarPeriod,
  CalendarRules,
  Frequency,
} from "@/components/leadership-excellence/organisation-framework/rules-calendar/calendar-model";

export interface CalendarIndex {
  calendars: {
    id: string;
    name: string;
    status: string;
    currentVersion: number;
    updatedAt?: string;
    audienceLabel?: string;
    audienceKind?: "UNASSIGNED" | "COMPANY" | "DEPARTMENTS" | "PEOPLE";
    start?: string;
    end?: string;
  }[];
  capabilities: { edit: boolean; approve: boolean; read: boolean };
  scope: "COMPANY";
  branchCalendarsAvailable: false;
  assignmentModes?: string[];
}
export interface CalendarDetail {
  id: string;
  status: "DRAFT" | "IN_REVIEW" | "APPROVED";
  revision?: number;
  draft?: CalendarRules;
  revisionReason?: string;
  returnReason?: string;
  submittedByUserId?: string;
  updatedAt?: string;
  approved: {
    version: number;
    approvedAt: string;
    snapshot: ApprovedCalendarSnapshot;
  } | null;
  versions: { version: number; approvedAt: string }[];
}
export interface HolidaySuggestion extends CalendarException {
  category?: "PUBLIC_HOLIDAY" | "OBSERVED_PUBLIC_HOLIDAY" | "OPTIONAL_CLOSURE";
  originalDate?: string;
  note?: string;
}
export interface CalendarPreview {
  warnings?: string[];
  periods: CalendarPeriod[];
  reviews: { start: string; end: string; completeBy: string | null }[];
}
export interface CalendarHistory {
  action: string;
  revision: number;
  reason: string | null;
  createdAt: string;
  snapshot: CalendarRules;
}
export class CalendarRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "CalendarRequestError";
  }
}
const ROOT = "/api/leadership-excellence/organisation-framework/rules-calendar";
async function request<T>(
  token: string,
  path = "",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await apiClient(
    `${ROOT}${path}`,
    {
      signal,
      ...(body === undefined
        ? {}
        : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
    },
    token,
  );
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new CalendarRequestError(
      Array.isArray(data?.message)
        ? data.message.join("\n")
        : data?.message ||
            "The calendar request did not complete. Your changes have not been discarded.",
      response.status,
    );
  return data as T;
}
export const calendarsApi = {
  assignmentDirectory: (token: string, signal?: AbortSignal) =>
    request<CalendarDirectory>(
      token,
      "/assignment-directory",
      undefined,
      signal,
    ),
  assignmentPreview: (
    token: string,
    rules: CalendarRules,
    calendarId?: string,
    signal?: AbortSignal,
  ) =>
    request<AudiencePreview>(
      token,
      "/assignment-preview",
      { rules, ...(calendarId ? { calendarId } : {}) },
      signal,
    ),
  comparison: (token: string, month: string, signal?: AbortSignal) =>
    request<CalendarComparison>(
      token,
      `/comparison?month=${encodeURIComponent(month)}`,
      undefined,
      signal,
    ),
  list: (token: string, signal?: AbortSignal) =>
    request<CalendarIndex>(token, "", undefined, signal),
  read: (token: string, id: string, signal?: AbortSignal) =>
    request<CalendarDetail>(
      token,
      `/${encodeURIComponent(id)}`,
      undefined,
      signal,
    ),
  create: (token: string, rules: CalendarRules) =>
    request<{ id: string; revision: number }>(token, "", { rules }),
  mutate: (
    token: string,
    id: string,
    action: string,
    revision: number,
    rules?: CalendarRules,
    reason?: string,
  ) =>
    request<{ id?: string; revision?: number; deleted?: boolean }>(
      token,
      `/${encodeURIComponent(id)}/${action}`,
      {
        expectedRevision: revision,
        rules,
        reason,
      },
    ),
  preview: (
    token: string,
    rules: CalendarRules,
    frequency: Frequency,
    signal?: AbortSignal,
  ) =>
    request<CalendarPreview>(token, "/preview", { rules, frequency }, signal),
  countries: (token: string, signal?: AbortSignal) =>
    request<Record<string, string>>(token, "/countries", undefined, signal),
  holidays: (
    token: string,
    country: string,
    year: number,
    signal?: AbortSignal,
  ) =>
    request<{ notice: string; suggestions: HolidaySuggestion[] }>(
      token,
      `/holiday-suggestions?country=${encodeURIComponent(country)}&year=${year}`,
      undefined,
      signal,
    ),
  history: (token: string, id: string) =>
    request<CalendarHistory[]>(token, `/${encodeURIComponent(id)}/history`),
  version: (token: string, id: string, version: number, signal?: AbortSignal) =>
    request<ApprovedPerformanceCalendar>(
      token,
      `/${encodeURIComponent(id)}/versions/${version}`,
      undefined,
      signal,
    ),
};
