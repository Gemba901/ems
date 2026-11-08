// Area 02.03 owns these types until the module owner publishes the Area 02
// section of common/contracts.ts. Consumers use the exported calendar service.
export const FREQUENCIES = [
  "daily",
  "weekly",
  "fortnightly",
  "twice-monthly",
  "monthly",
  "quarterly",
  "half-yearly",
  "yearly",
] as const;
export type Frequency = (typeof FREQUENCIES)[number];
export const RESPONSIBILITIES = [
  "DEPARTMENT_HOD",
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
  name: string;
  start: string;
  end: string;
  timeZone: string;
  country: string;
  workdays: number[];
  exceptions: CalendarException[];
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
}
export interface ApprovedCalendarSnapshot {
  format: 1;
  rules: CalendarRules;
  // Materialised on approval: later code changes cannot alter old periods.
  periods: Record<Frequency, CalendarPeriod[]>;
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
