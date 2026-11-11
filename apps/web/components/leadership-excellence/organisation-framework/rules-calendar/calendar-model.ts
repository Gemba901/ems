import type { CalendarAudience } from "./calendar-audience.types";
// Area 02.03 owns these types until the module owner publishes the Area 02
// section of common/contracts.ts. Consumers use the exported calendar service.
export const FREQUENCIES = [
  "daily",
  "weekly",
  "fortnightly",
  "twice-monthly",
  "monthly",
  "every-two-months",
  "custom",
  "quarterly",
  "half-yearly",
  "yearly",
] as const;
export type Frequency = (typeof FREQUENCIES)[number];
export const RESPONSIBILITIES = [
  "DEPARTMENT_HOD",
  "DEPARTMENT_SUPERVISOR",
  "LINE_MANAGER",
  "PLAN_OWNER",
  "PLAN_ASSIGNEE",
  "AUTHORISED_APPROVER",
  "SELECT_IN_PLAN",
] as const;
export type Responsibility = (typeof RESPONSIBILITIES)[number];
export const DIRECTIONS = [
  "higher",
  "lower",
  "range",
  "milestone",
  "zero-target",
] as const;
export interface CalendarException {
  date: string;
  kind: "NON_WORKING" | "WORKING";
  reason: string;
  source: "MANUAL" | "HOLIDAY_SUGGESTION";
}
export interface CalendarRules {
  audience?: CalendarAudience;
  name: string;
  start: string;
  end: string;
  timeZone: string;
  country: string;
  workdays: number[];
  exceptions: CalendarException[];
  // Missing on earlier drafts: retain the original eight frequencies.
  enabledFrequencies?: Frequency[];
  customInterval?: {
    every: number;
    unit: "DAYS" | "WEEKS" | "MONTHS";
    anchor: string;
  };
  twoMonthAnchor?: string;
  verificationBasis?: "SUBMISSION_DEADLINE" | "ACTUAL_SUBMISSION";
  verificationDayType?: "CALENDAR" | "WORKING";
  verificationRoll?: "NONE" | "NEXT_WORKING";
  reviewDayType?: "CALENDAR" | "WORKING";
  reviewRoll?: "NONE" | "NEXT_WORKING";
  holidayOmissions?: {
    date: string;
    name: string;
    country: string;
    reason: string;
  }[];
  weekStart: number;
  fortnightAnchor: string;
  splitDay: number;
  submissionDays: number;
  submissionDayType: "CALENDAR" | "WORKING";
  submissionRoll: "NONE" | "NEXT_WORKING";
  submissionTime: string;
  verificationDays: number;
  reviewFrequency: Frequency;
  reviewDays: number;
  responsibilities: {
    owner: Responsibility;
    provider: Responsibility;
    verifier: Responsibility;
    approver: Responsibility;
  };
  directions: (typeof DIRECTIONS)[number][];
}
export interface CalendarPeriod {
  key: string;
  frequency: Frequency;
  start: string;
  end: string;
  naturalStart: string;
  naturalEnd: string;
  partial: boolean;
  workingDays: number;
  scheduled: boolean;
  reasons: string[];
  // Civil date/time in timeZone, deliberately not an invented UTC timestamp.
  submitBy: { date: string; time: string; timeZone: string } | null;
  verifyBy: string | null;
  verificationPendingSubmission?: boolean;
}
export interface ApprovedCalendarSnapshot {
  format: 1 | 2;
  warnings?: string[];
  rules: CalendarRules;
  // Materialised on approval: later code changes cannot alter old periods.
  periods: Partial<Record<Frequency, CalendarPeriod[]>>;
  reviews: { start: string; end: string; completeBy: string | null }[];
}
export interface ApprovedPerformanceCalendar extends ApprovedCalendarSnapshot {
  calendarId: string;
  organizationId: string;
  version: number;
  approvedAt: string;
  approvedByUserId: string;
}

export function initialRules(
  year: number,
  timeZone = "Africa/Nairobi",
): CalendarRules {
  return {
    name: "",
    start: `${year}-01-01`,
    end: `${year}-12-31`,
    timeZone,
    country: "",
    workdays: [1, 2, 3, 4, 5],
    exceptions: [],
    enabledFrequencies: ["monthly", "quarterly"],
    verificationBasis: "SUBMISSION_DEADLINE",
    verificationDayType: "CALENDAR",
    verificationRoll: "NONE",
    reviewDayType: "CALENDAR",
    reviewRoll: "NONE",
    weekStart: 1,
    fortnightAnchor: `${year}-01-01`,
    splitDay: 15,
    submissionDays: 1,
    submissionDayType: "CALENDAR",
    submissionRoll: "NONE",
    submissionTime: "17:00",
    verificationDays: 2,
    reviewFrequency: "monthly",
    reviewDays: 7,
    responsibilities: {
      owner: "DEPARTMENT_HOD",
      provider: "PLAN_ASSIGNEE",
      verifier: "LINE_MANAGER",
      approver: "AUTHORISED_APPROVER",
    },
    directions: [...DIRECTIONS],
  };
}

export function enabledFrequencies(rules: CalendarRules): Frequency[] {
  return (
    rules.enabledFrequencies ??
    FREQUENCIES.filter((f) => f !== "custom" && f !== "every-two-months")
  );
}
export function customInterval(rules: CalendarRules) {
  return (
    rules.customInterval ?? {
      every: 1,
      unit: "MONTHS" as const,
      anchor: `${rules.start.slice(0, 7)}-01`,
    }
  );
}

/** Period definitions shared by reporting and reviews; availability for reporting stays separate. */
export function periodFrequencies(rules: CalendarRules): Frequency[] {
  return [...new Set([...enabledFrequencies(rules), rules.reviewFrequency])];
}
