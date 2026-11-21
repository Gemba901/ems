// 02.03's shapes live in common/contracts.ts (Area 02 section), the only place other areas import them from.
// They are re-exported here under their original names so Area 02's own files keep their imports.
import {
  CALENDAR_FREQUENCIES as FREQUENCIES,
  CALENDAR_TARGET_DIRECTIONS as DIRECTIONS,
  type CalendarFrequency as Frequency,
  type CalendarRules,
} from "../../common/contracts";
export { FREQUENCIES, DIRECTIONS };
export { CALENDAR_RESPONSIBILITIES as RESPONSIBILITIES } from "../../common/contracts";
export type { Frequency, CalendarRules };
export type {
  CalendarResponsibility as Responsibility,
  CalendarException,
  CalendarPeriod,
  ApprovedCalendarSnapshot,
  ApprovedPerformanceCalendar,
} from "../../common/contracts";

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
