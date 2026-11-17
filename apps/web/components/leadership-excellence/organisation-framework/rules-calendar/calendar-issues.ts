import {
  customInterval,
  enabledFrequencies,
  periodFrequencies,
  FREQUENCIES,
  type CalendarRules,
} from "./calendar-model";
import { validCycleDate, cycleDateIssue } from "./cycle-dates";
import { audienceIssue } from "./calendar-audience";
import { exceptionIssue, displayDate } from "./calendar-editor";

export interface CalendarIssue {
  field: string;
  step: 0 | 1 | 2;
  message: string;
  date?: string;
}
export const fieldId = (key: string) => `calendar-field-${key}`;

/** Explicit field identities for correction links; the API remains authoritative. */
export function calendarIssues(
  r: CalendarRules,
  requireName = false,
): CalendarIssue[] {
  const issues: CalendarIssue[] = [];
  const add = (field: string, step: 0 | 1, message: string, date?: string) =>
    issues.push({ field, step, message, ...(date ? { date } : {}) });
  if (requireName && !r.name.trim())
    add("name", 0, "Enter a calendar name before approval.");
  if (!validCycleDate(r.start))
    add("start", 0, "Enter a valid cycle start date.");
  else if (!validCycleDate(r.end))
    add("end", 0, "Enter a valid cycle end date.");
  else {
    const message = cycleDateIssue(r.start, r.end);
    if (message) add("end", 0, message);
  }
  if (!r.timeZone.trim())
    add("timeZone", 0, "Choose the time zone used for deadlines.");
  else {
    try {
      new Intl.DateTimeFormat("en", { timeZone: r.timeZone }).format();
    } catch {
      add("timeZone", 0, "Choose a valid time zone from the list.");
    }
  }
  if (!r.workdays.length)
    add("workdays", 0, "Choose at least one regular working day.");
  const used = periodFrequencies(r),
    c = customInterval(r);
  if (!enabledFrequencies(r).length)
    add("enabledFrequencies", 1, "Choose at least one reporting frequency.");
  if (
    used.includes("weekly") &&
    (!Number.isInteger(r.weekStart) || r.weekStart < 0 || r.weekStart > 6)
  )
    add("weekStart", 1, "Choose the day each weekly period starts.");
  if (used.includes("fortnightly") && !validCycleDate(r.fortnightAnchor))
    add("fortnightAnchor", 1, "Choose a valid start for the 14-day periods.");
  if (
    used.includes("every-two-months") &&
    r.twoMonthAnchor &&
    (!validCycleDate(r.twoMonthAnchor) || !r.twoMonthAnchor.endsWith("-01"))
  )
    add("twoMonthAnchor", 1, "Choose a valid starting month and year.");
  if (
    used.includes("twice-monthly") &&
    (!Number.isInteger(r.splitDay) || r.splitDay < 1 || r.splitDay > 27)
  )
    add("splitDay", 1, "Choose a monthly split from the 1st to the 27th.");
  if (used.includes("custom")) {
    if (!Number.isInteger(c.every) || c.every < 1 || c.every > 365)
      add("customEvery", 1, "Enter a whole number from 1 to 365.");
    if (!["DAYS", "WEEKS", "MONTHS"].includes(c.unit))
      add("customUnit", 1, "Choose calendar days, weeks or months.");
    if (
      !validCycleDate(c.anchor) ||
      (c.unit === "MONTHS" && !c.anchor.endsWith("-01"))
    )
      add(
        "customAnchor",
        1,
        c.unit === "MONTHS"
          ? "Choose a valid starting month and year."
          : "Choose a valid starting date.",
      );
  }
  for (const [field, title] of [
    ["submissionDays", "Submission"],
    ["verificationDays", "Verification"],
    ["reviewDays", "Review"],
  ] as const) {
    if (!Number.isInteger(r[field]) || r[field] < 0 || r[field] > 60)
      add(
        field,
        1,
        `${title} allowance must be a whole number from 0 to 60 days.`,
      );
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.submissionTime))
    add("submissionTime", 1, "Choose a valid time for submitting results.");
  if (!FREQUENCIES.includes(r.reviewFrequency))
    add("reviewFrequency", 1, "Choose a performance-review frequency.");
  const seen = new Set<string>();
  for (const e of r.exceptions) {
    const problem = exceptionIssue(r, e.date);
    if (problem) add("exceptionDate", 0, problem, e.date);
    else if (seen.has(e.date))
      add(
        "exceptionDate",
        0,
        `Remove the duplicate entry for ${displayDate(e.date)}.`,
        e.date,
      );
    else if (!e.reason.trim())
      add(
        "exceptionReason",
        0,
        `Enter a reason for ${displayDate(e.date)}.`,
        e.date,
      );
    seen.add(e.date);
  }
  if (r.responsibilities.owner === "PLAN_OWNER")
    add(
      "owner",
      1,
      "Choose how to find the plan owner. The owner cannot be their own selection rule.",
    );
  if (!r.directions.length)
    add("directions", 1, "Make at least one measurement type available.");
  if (requireName) {
    const message = audienceIssue(r.audience);
    if (message)
      add(
        r.audience?.kind === "DEPARTMENTS"
          ? "audienceDepartments"
          : r.audience?.kind === "PEOPLE" && !r.audience.label.trim()
            ? "audienceLabel"
            : r.audience?.kind === "PEOPLE"
              ? "audiencePeople"
              : "audience",
        0,
        message,
      );
    if (
      (r.holidayOmissions ?? []).some(
        (h) => !validCycleDate(h.date) || !h.reason.trim() || !h.name.trim(),
      )
    )
      add(
        "holidayOmissions",
        0,
        "Review omitted holidays: each needs a valid date, name and reason.",
      );
  }
  return issues;
}

/** Server-only problems stay near approval; they must never jump to an unrelated date. */
export function serverIssue(message: string): CalendarIssue {
  if (/time\s?zone|IANA/i.test(message))
    return {
      field: "timeZone",
      step: 0,
      message: "Choose a valid time zone from the list.",
    };
  if (/assignment|department|employee|membership|overlap/i.test(message))
    return { field: "audience", step: 0, message };
  return { field: "approval", step: 2, message };
}
