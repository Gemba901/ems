import {
  CalendarPeriod,
  CalendarRules,
  FREQUENCIES,
  Frequency,
  ApprovedCalendarSnapshot,
} from "./calendar-model";

import { cycleDateIssue, validCycleDate as validDate } from "./cycle-dates";
export { validCycleDate as validDate } from "./cycle-dates";

const DAY = 86400000;
export const addDays = (value: string, days: number) =>
  new Date(Date.parse(`${value}T00:00:00Z`) + days * DAY)
    .toISOString()
    .slice(0, 10);
const weekday = (value: string) => new Date(`${value}T00:00:00Z`).getUTCDay();
const diff = (a: string, b: string) =>
  (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY;
const monthStart = (value: string) => `${value.slice(0, 7)}-01`;
const addMonths = (value: string, months: number) => {
  const d = new Date(`${monthStart(value)}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
};
const monthEnd = (value: string) => addDays(addMonths(value, 1), -1);

export function calendarErrors(r: CalendarRules): string[] {
  const errors: string[] = [];
  if (!r.name.trim()) errors.push("Give this performance cycle a name.");
  const dateIssue = cycleDateIssue(r.start, r.end);
  if (dateIssue) errors.push(dateIssue);
  try {
    new Intl.DateTimeFormat("en", { timeZone: r.timeZone }).format();
  } catch {
    errors.push("Choose a valid IANA time zone.");
  }
  if (!r.timeZone.trim())
    errors.push("Choose the time zone used for deadlines.");
  if (!r.workdays.length)
    errors.push(
      "Choose at least one normal working day. Use exceptions for shutdown dates.",
    );
  if (!validDate(r.fortnightAnchor))
    errors.push("Choose a valid anchor date for the repeating 14-day periods.");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.submissionTime))
    errors.push("Choose a valid submission time.");
  const seen = new Set<string>();
  for (const e of r.exceptions) {
    if (!validDate(e.date)) errors.push("An exception has an invalid date.");
    else if (validDate(r.start) && e.date < r.start)
      errors.push(
        `Exception ${e.date} falls before this cycle starts on ${r.start}. Edit or remove it.`,
      );
    else if (validDate(r.end) && e.date > addDays(r.end, 120))
      errors.push(
        `Exception ${e.date} is after the last supported deadline date (${addDays(r.end, 120)}). Edit or remove it.`,
      );
    if (!e.reason.trim())
      errors.push(`Add a reason for ${e.date || "each exception"}.`);
    if (seen.has(e.date)) errors.push(`Keep only one exception for ${e.date}.`);
    seen.add(e.date);
  }
  if (r.responsibilities.owner === "PLAN_OWNER")
    errors.push(
      "Choose how to find the plan owner. The plan owner cannot be their own selection rule.",
    );
  if (!r.directions.length)
    errors.push("Make at least one measurement type available.");
  return [...new Set(errors)];
}

export function dayStatus(
  r: CalendarRules,
  day: string,
): { working: boolean; reason: string } {
  const exception = r.exceptions.find((e) => e.date === day);
  if (exception)
    return { working: exception.kind === "WORKING", reason: exception.reason };
  return r.workdays.includes(weekday(day))
    ? { working: true, reason: "" }
    : { working: false, reason: "Outside normal working week" };
}

function deadline(r: CalendarRules, end: string): string {
  let day = end;
  let remaining = r.submissionDays;
  // Bounded even for a long shutdown; fail explicitly rather than hang.
  for (let count = 0; remaining > 0; count++) {
    if (count >= 120)
      throw new Error(
        "No submission date could be found within 120 days. Review the shutdown dates or deadline allowance.",
      );
    day = addDays(day, 1);
    if (r.submissionDayType === "CALENDAR" || dayStatus(r, day).working)
      remaining--;
  }
  if (r.submissionRoll === "NEXT_WORKING") {
    for (let count = 0; !dayStatus(r, day).working; count++) {
      if (count >= 120 || diff(end, day) >= 120)
        throw new Error(
          "No working submission date could be found within 120 days.",
        );
      day = addDays(day, 1);
    }
  }
  return day;
}

export function makePeriods(
  r: CalendarRules,
  frequency: Frequency,
): CalendarPeriod[] {
  const errors = calendarErrors(r);
  if (errors.length) throw new Error(errors.join(" "));
  if (!FREQUENCIES.includes(frequency))
    throw new Error("Choose a supported reporting frequency.");
  let cursor = r.start;
  if (frequency === "weekly")
    cursor = addDays(r.start, -((weekday(r.start) - r.weekStart + 7) % 7));
  if (frequency === "fortnightly")
    cursor = addDays(
      r.fortnightAnchor,
      Math.floor(diff(r.fortnightAnchor, r.start) / 14) * 14,
    );
  if (
    ["monthly", "quarterly", "half-yearly", "yearly", "twice-monthly"].includes(
      frequency,
    )
  )
    cursor = monthStart(r.start);
  if (frequency === "twice-monthly" && Number(r.start.slice(-2)) > r.splitDay)
    cursor = `${r.start.slice(0, 7)}-${String(r.splitDay + 1).padStart(2, "0")}`;
  const periods: CalendarPeriod[] = [];
  while (cursor <= r.end) {
    let last: string;
    if (frequency === "daily") last = cursor;
    else if (frequency === "weekly" || frequency === "fortnightly")
      last = addDays(cursor, frequency === "weekly" ? 6 : 13);
    else if (frequency === "twice-monthly")
      last = cursor.endsWith("-01")
        ? `${cursor.slice(0, 7)}-${String(r.splitDay).padStart(2, "0")}`
        : monthEnd(cursor);
    else
      last = addDays(
        addMonths(
          cursor,
          { monthly: 1, quarterly: 3, "half-yearly": 6, yearly: 12 }[frequency],
        ),
        -1,
      );
    const start = cursor < r.start ? r.start : cursor;
    const end = last > r.end ? r.end : last;
    let workingDays = 0;
    const reasons = new Set<string>();
    for (let day = start; day <= end; day = addDays(day, 1)) {
      const status = dayStatus(r, day);
      if (status.working) workingDays++;
      if (status.reason) reasons.add(`${day}: ${status.reason}`);
    }
    const due = workingDays ? deadline(r, end) : null;
    periods.push({
      key: `${frequency}:${cursor}:${last}`,
      frequency,
      start,
      end,
      naturalStart: cursor,
      naturalEnd: last,
      partial: cursor !== start || last !== end,
      workingDays,
      scheduled: workingDays > 0,
      reasons: [...reasons],
      submitBy: due
        ? { date: due, time: r.submissionTime, timeZone: r.timeZone }
        : null,
      verifyBy: due ? addDays(due, r.verificationDays) : null,
    });
    cursor = addDays(last, 1);
  }
  return periods;
}

export function approvalSnapshot(
  rules: CalendarRules,
): ApprovedCalendarSnapshot {
  const periods = Object.fromEntries(
    FREQUENCIES.map((f) => [f, makePeriods(rules, f)]),
  ) as ApprovedCalendarSnapshot["periods"];
  return {
    format: 1,
    rules: structuredClone(rules),
    periods,
    reviews: periods[rules.reviewFrequency].map((p) => ({
      start: p.start,
      end: p.end,
      completeBy: p.scheduled ? addDays(p.end, rules.reviewDays) : null,
    })),
  };
}
