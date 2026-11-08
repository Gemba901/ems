import type {
  CalendarRules,
  CalendarException,
  Frequency,
  Responsibility,
} from "./calendar-model";
import { cycleDateIssue, validCycleDate } from "./cycle-dates";
import type { HolidaySuggestion } from "@/services/leadership-excellence/rules-calendar.service";

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  daily: "Daily",
  weekly: "Weekly",
  fortnightly: "Every two weeks · 14 days",
  "twice-monthly": "Twice monthly",
  monthly: "Monthly",
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
  const [year, month, day] = start.split("-").map(Number);
  // The anniversary of 29 February is 1 March in a non-leap year.
  const anniversary = new Date(Date.UTC(year + 1, month - 1, day));
  return new Date(anniversary.getTime() - 86400000).toISOString().slice(0, 10);
}
export function exceptionIssue(rules: CalendarRules, date: string) {
  if (!validCycleDate(date)) return "Choose a valid exception date.";
  if (validCycleDate(rules.start) && date < rules.start)
    return `${displayDate(date)} falls before this cycle starts on ${displayDate(rules.start)}. Edit or remove this exception.`;
  if (validCycleDate(rules.end) && date > addDays(rules.end, 120))
    return `${displayDate(date)} is after the last supported deadline date (${displayDate(addDays(rules.end, 120))}). Edit or remove this exception.`;
  return "";
}
export function previewIssue(rules: CalendarRules) {
  const dates = cycleDateIssue(rules.start, rules.end);
  if (dates) return dates;
  if (!rules.name.trim()) return "Give this cycle a name before previewing.";
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
) {
  const result = [...existing];
  for (const h of suggestions)
    if (selected.includes(h.date) && !result.some((e) => e.date === h.date))
      result.push({
        date: h.date,
        reason: h.reason,
        kind: "NON_WORKING",
        source: "HOLIDAY_SUGGESTION",
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
