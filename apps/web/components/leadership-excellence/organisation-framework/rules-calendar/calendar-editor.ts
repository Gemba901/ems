import type {
  CalendarRules,
  CalendarException,
  Frequency,
  Responsibility,
} from "./calendar-model";
import {
  enabledFrequencies,
  customInterval,
  periodFrequencies,
  FREQUENCIES,
} from "./calendar-model";
import { cycleDateIssue, validCycleDate } from "./cycle-dates";
import type { HolidaySuggestion } from "@/services/leadership-excellence/rules-calendar.service";

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  daily: "Daily",
  weekly: "Weekly",
  fortnightly: "Every two weeks · 14 days",
  "twice-monthly": "Twice monthly",
  monthly: "Monthly",
  "every-two-months": "Every two months",
  custom: "Custom interval",
  quarterly: "Quarterly",
  "half-yearly": "Half-yearly",
  yearly: "Yearly",
};
export const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
export const RESPONSIBILITY_LABELS: Record<Responsibility, string> = {
  DEPARTMENT_SUPERVISOR: "Supervisor of the plan’s department",
  DEPARTMENT_HOD: "HOD of the plan’s department",
  LINE_MANAGER: "Line manager of the plan / KPI assignee",
  PLAN_OWNER: "Person already confirmed as plan owner",
  PLAN_ASSIGNEE: "Employee assigned to the plan / KPI",
  AUTHORISED_APPROVER: "Authorised approver selected during planning",
  SELECT_IN_PLAN: "Choose a person during planning",
};
export const RESPONSIBILITY_HELP = {
  owner:
    "Accountable for coordinating and delivering the plan. A rule suggests who should be confirmed during planning.",
  provider:
    "Enters the results and supporting evidence for the relevant plan or KPI.",
  verifier:
    "Checks the submitted results. Planning must check conflicts with the data provider.",
  approver:
    "Authorises the plan. The selected person must already have the required approval permissions.",
};
export function responsibilityChoices(
  key: keyof CalendarRules["responsibilities"],
  current: Responsibility,
): [string, string][] {
  const choices = Object.entries(RESPONSIBILITY_LABELS).filter(
    ([value]) => key !== "owner" || value !== "PLAN_OWNER",
  );
  if (!choices.some(([v]) => v === current))
    choices.unshift([
      current,
      "Choose another rule — an owner cannot select themselves",
    ]);
  return choices;
}
export function displayDate(date: string) {
  if (!validCycleDate(date)) return date || "Choose a date";
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}
export const addDays = (date: string, n: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400000)
    .toISOString()
    .slice(0, 10);
export function suggestedCycleEnd(start: string) {
  if (!validCycleDate(start)) return "";
  return `${start.slice(0, 4)}-12-31`;
}

/** Only a year-only edit shifts an existing range; month/day edits retain its end. */
export function shiftCycleEndYear(
  previousStart: string,
  end: string,
  nextStart: string,
) {
  if (
    ![previousStart, end, nextStart].every(validCycleDate) ||
    previousStart.slice(5) !== nextStart.slice(5)
  )
    return null;
  const delta =
    Number(nextStart.slice(0, 4)) - Number(previousStart.slice(0, 4));
  if (!delta) return null;
  const year = Number(end.slice(0, 4)) + delta;
  if (year < 1900 || year > 2199) return null;
  const month = Number(end.slice(5, 7));
  const day = Math.min(
    Number(end.slice(8)),
    new Date(Date.UTC(year, month, 0)).getUTCDate(),
  );
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function exceptionIssue(rules: CalendarRules, date: string) {
  if (!validCycleDate(date)) return "Choose a valid date.";
  if (validCycleDate(rules.start) && date < rules.start)
    return `${displayDate(date)} falls before this cycle starts on ${displayDate(rules.start)}. Edit or remove this calendar entry.`;
  if (validCycleDate(rules.end) && date > addDays(rules.end, 120))
    return `${displayDate(date)} is after the last supported deadline date (${displayDate(addDays(rules.end, 120))}). Edit or remove this calendar entry.`;
  return "";
}
export function previewIssue(rules: CalendarRules) {
  const dates = cycleDateIssue(rules.start, rules.end);
  if (dates) return dates;
  const enabled = enabledFrequencies(rules);
  if (!enabled.length) return "Choose at least one reporting frequency.";
  if (!FREQUENCIES.includes(rules.reviewFrequency))
    return "Choose a supported performance-review frequency.";
  if (
    periodFrequencies(rules).includes("fortnightly") &&
    !validCycleDate(rules.fortnightAnchor)
  )
    return "Choose a valid 14-day anchor.";
  if (
    periodFrequencies(rules).includes("every-two-months") &&
    rules.twoMonthAnchor &&
    (!validCycleDate(rules.twoMonthAnchor) ||
      !rules.twoMonthAnchor.endsWith("-01"))
  )
    return "Choose a valid two-month anchor on the first day of the month.";
  if (periodFrequencies(rules).includes("custom")) {
    const c = customInterval(rules);
    if (
      !validCycleDate(c.anchor) ||
      (c.unit === "MONTHS" && !c.anchor.endsWith("-01"))
    )
      return "Choose a valid custom anchor (day 1 for month intervals).";
    if (!Number.isInteger(c.every) || c.every < 1 || c.every > 365)
      return "Choose a custom interval from 1 to 365.";
  }
  for (const [value, label] of [
    [rules.submissionDays, "Submission"],
    [rules.verificationDays, "Verification"],
    [rules.reviewDays, "Review"],
  ] as const) {
    if (!Number.isInteger(value) || value < 0 || value > 60)
      return `${label} allowance must be a whole number from 0 to 60 days.`;
  }
  if (
    periodFrequencies(rules).includes("twice-monthly") &&
    (!Number.isInteger(rules.splitDay) ||
      rules.splitDay < 1 ||
      rules.splitDay > 27)
  )
    return "Choose a twice-monthly split day from 1 to 27.";
  const bad = rules.exceptions.find((e) => exceptionIssue(rules, e.date));
  return bad ? exceptionIssue(rules, bad.date) : "";
}
export function cycleYears(start: string, end: string) {
  if (cycleDateIssue(start, end)) return [];
  return Array.from(
    { length: Number(end.slice(0, 4)) - Number(start.slice(0, 4)) + 1 },
    (_, i) => Number(start.slice(0, 4)) + i,
  );
}
export function mergeSuggestions(
  groups: HolidaySuggestion[][],
  start: string,
  end: string,
) {
  const dates = new Map<string, HolidaySuggestion>();
  for (const h of groups.flat()) {
    if (h.date < start || h.date > end) continue;
    const previous = dates.get(h.date);
    if (!previous) dates.set(h.date, { ...h });
    else if (previous.reason !== h.reason) {
      previous.reason = `${previous.reason}; ${h.reason}`.slice(0, 200);
      previous.note = [previous.note, h.note].filter(Boolean).join(" ");
    }
  }
  return [...dates.values()].sort((a, b) => a.date.localeCompare(b.date));
}
export function acceptedExceptions(
  existing: CalendarException[],
  suggestions: HolidaySuggestion[],
  selected: string[],
  country?: string,
) {
  const result = [...existing];
  for (const h of suggestions)
    if (selected.includes(h.date) && !result.some((e) => e.date === h.date))
      result.push({
        date: h.date,
        reason: h.reason,
        kind: "NON_WORKING",
        source: "HOLIDAY_SUGGESTION",
        ...(h.category ? { category: h.category } : {}),
        ...(h.originalDate ? { originalDate: h.originalDate } : {}),
        ...(country ? { holidayCountry: country } : {}),
      });
  return result.sort((a, b) => a.date.localeCompare(b.date));
}
export function cycleMonths(start: string, end: string) {
  if (cycleDateIssue(start, end)) return [];
  const months: string[] = [];
  const cursor = new Date(`${start.slice(0, 7)}-01T00:00:00Z`);
  while (cursor.toISOString().slice(0, 7) <= end.slice(0, 7)) {
    months.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
export function dateEntry(value: string) {
  return validCycleDate(value)
    ? `${Number(value.slice(8))} ${MONTH_NAMES[Number(value.slice(5, 7)) - 1]} ${value.slice(0, 4)}`
    : value;
}
export function parseDateEntry(value: string): string | null {
  const text = value.trim();
  if (validCycleDate(text)) return text;
  const parts = /^(\d{1,2})[ -]+([a-z]+)[ ,/-]+(\d{4})$/i.exec(text);
  if (!parts) return null;
  const names = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const month = names.findIndex((m, i) =>
    [m.toLowerCase(), MONTH_NAMES[i].toLowerCase()].includes(
      parts[2].toLowerCase(),
    ),
  );
  if (month < 0) return null;
  const date = `${parts[3]}-${String(month + 1).padStart(2, "0")}-${parts[1].padStart(2, "0")}`;
  return validCycleDate(date) ? date : null;
}
export function displayMonth(month: string) {
  return validCycleDate(`${month}-01`)
    ? `${MONTH_NAMES[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`
    : month;
}
export function previewCorrection(
  message: string,
  rules?: CalendarRules,
): {
  step: number;
  field: string;
  label: string;
} {
  if (
    /verification|submission|review|frequency|anchor|interval|measurement|owner|split|week.*start/i.test(
      message,
    )
  )
    return {
      step: 1,
      field: /custom/i.test(message)
        ? rules && customInterval(rules).unit === "MONTHS"
          ? "Starting month · year"
          : "Custom starting date"
        : /two-month.*anchor/i.test(message)
          ? "First month · year"
          : /anchor/i.test(message)
            ? "14-day anchor"
            : /week.*start/i.test(message)
              ? "Weekly period starts on"
              : /split/i.test(message)
                ? "First period ends on this date each month"
                : "",
      label: "Review periods & responsibilities",
    };
  if (/name/i.test(message))
    return { step: 0, field: "Calendar name", label: "Enter calendar name" };
  return {
    step: 0,
    field: /special|exception|holiday|calendar entry/i.test(message)
      ? "Date"
      : "Cycle starts",
    label: "Review cycle & working days",
  };
}

/** Only the known Kenyan 10 October name correction; not a global update detector. */
export function holidayNameUpdate(
  country: string,
  entry: CalendarException,
): string | null {
  if (
    country !== "KE" ||
    entry.date < "2024-04-26" ||
    !["10-10", "10-11"].includes(entry.date.slice(5))
  )
    return null;
  if (!/\b(Moi|Huduma|Utamaduni) Day\b/i.test(entry.reason)) return null;
  return entry.reason.replace(
    /\b(Moi|Huduma|Utamaduni) Day\b/gi,
    "Mazingira Day",
  );
}

export function calendarNoteGroups(notes: string[]) {
  const groups = new Map<string, string[]>();
  for (const note of notes) {
    const match = /^(\d{4}-\d{2}-\d{2}):\s*(.*)$/.exec(note);
    const reason = match?.[2] ?? note;
    const date = match?.[1] ?? "";
    const dates = groups.get(reason) ?? [];
    if (!dates.includes(date)) dates.push(date);
    groups.set(reason, dates);
  }
  return [...groups].map(([reason, dates]) => ({ reason, dates }));
}
