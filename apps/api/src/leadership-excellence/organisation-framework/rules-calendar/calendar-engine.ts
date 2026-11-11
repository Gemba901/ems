import { periodFrequencies } from "./calendar-model";
import { audienceIssue } from "./calendar-audience";
import {
  CalendarPeriod,
  CalendarRules,
  FREQUENCIES,
  enabledFrequencies,
  customInterval,
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

export function calendarErrors(r: CalendarRules, requireName = true): string[] {
  const errors: string[] = [];
  if (requireName && audienceIssue(r.audience))
    errors.push(audienceIssue(r.audience));
  if (requireName && !r.name.trim())
    errors.push("Give this performance cycle a name.");
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
      "Choose at least one normal working day. Add individual dates for shutdowns.",
    );
  if (
    periodFrequencies(r).includes("fortnightly") &&
    !validDate(r.fortnightAnchor)
  )
    errors.push("Choose a valid anchor date for the repeating 14-day periods.");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.submissionTime))
    errors.push("Choose a valid submission time.");
  const enabled = enabledFrequencies(r);
  if (!enabled.length) errors.push("Choose at least one reporting frequency.");
  if (!FREQUENCIES.includes(r.reviewFrequency))
    errors.push("Choose a supported performance-review frequency.");
  if (
    periodFrequencies(r).includes("every-two-months") &&
    (!validDate(r.twoMonthAnchor ?? monthStart(r.start)) ||
      !(r.twoMonthAnchor ?? monthStart(r.start)).endsWith("-01"))
  )
    errors.push("Choose the first month for the two-month periods.");
  if (periodFrequencies(r).includes("custom")) {
    const c = customInterval(r);
    if (
      !validDate(c.anchor) ||
      (c.unit === "MONTHS" && !c.anchor.endsWith("-01"))
    )
      errors.push(
        "Choose a valid custom anchor (first day of the month for month intervals).",
      );
    if (
      !Number.isInteger(c.every) ||
      c.every < 1 ||
      c.every > 365 ||
      !["DAYS", "WEEKS", "MONTHS"].includes(c.unit)
    )
      errors.push(
        "Choose a custom interval from 1 to 365 days, weeks or months.",
      );
  }
  for (const h of r.holidayOmissions ?? []) {
    if (!validDate(h.date) || !h.name.trim() || !h.reason.trim())
      errors.push("Give each omitted holiday a valid date, name and reason.");
  }
  const seen = new Set<string>();
  for (const e of r.exceptions) {
    if (!validDate(e.date)) errors.push("A calendar date is invalid.");
    else if (validDate(r.start) && e.date < r.start)
      errors.push(
        `Calendar entry ${e.date} falls before this cycle starts on ${r.start}. Edit or remove it.`,
      );
    else if (validDate(r.end) && e.date > addDays(r.end, 120))
      errors.push(
        `Calendar entry ${e.date} is after the last supported deadline date (${addDays(r.end, 120)}). Edit or remove it.`,
      );
    if (!e.reason.trim())
      errors.push(`Add a reason for ${e.date || "each calendar entry"}.`);
    if (seen.has(e.date)) errors.push(`Keep only one entry for ${e.date}.`);
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

export function allowanceDeadline(
  r: CalendarRules,
  base: string,
  days: number,
  type: "CALENDAR" | "WORKING",
  roll: "NONE" | "NEXT_WORKING",
  label: string,
): string {
  if (!validDate(base))
    throw new Error(`Choose a valid ${label.toLowerCase()} starting date.`);
  let day = base;
  let remaining = days;
  while (remaining > 0) {
    if (diff(base, day) >= 120)
      throw new Error(
        `${label}: no deadline could be found within 120 days. Review working days and the allowance.`,
      );
    day = addDays(day, 1);
    if (type === "CALENDAR" || dayStatus(r, day).working) remaining--;
  }
  while (roll === "NEXT_WORKING" && !dayStatus(r, day).working) {
    if (diff(base, day) >= 120)
      throw new Error(
        `${label}: no working deadline could be found within 120 days.`,
      );
    day = addDays(day, 1);
  }
  if (validDate(r.end) && day > addDays(r.end, 120))
    throw new Error(
      `${label}: the deadline is outside the supported 120 days after cycle end. Reduce the allowance or revise the cycle.`,
    );
  return day;
}
// Execution supplies the actual submission's civil date in the calendar time zone.
// A preview deliberately has no receipt date; it must not invent a verification date.
export function verificationDeadline(
  r: CalendarRules,
  submissionDue: string,
  submittedOn?: string,
): string | null {
  const base =
    r.verificationBasis === "ACTUAL_SUBMISSION" ? submittedOn : submissionDue;
  return base
    ? allowanceDeadline(
        r,
        base,
        r.verificationDays,
        r.verificationDayType ?? "CALENDAR",
        r.verificationRoll ?? "NONE",
        "Verification",
      )
    : null;
}
export function reviewPeriods(r: CalendarRules) {
  return buildPeriods(r, r.reviewFrequency).map((p) => ({
    start: p.start,
    end: p.end,
    completeBy: p.scheduled
      ? allowanceDeadline(
          r,
          p.end,
          r.reviewDays,
          r.reviewDayType ?? "CALENDAR",
          r.reviewRoll ?? "NONE",
          "Review",
        )
      : null,
  }));
}

export function makePeriods(
  r: CalendarRules,
  frequency: Frequency,
): CalendarPeriod[] {
  if (
    !FREQUENCIES.includes(frequency) ||
    !enabledFrequencies(r).includes(frequency)
  )
    throw new Error("Choose an enabled reporting frequency.");
  return buildPeriods(r, frequency);
}
function buildPeriods(
  r: CalendarRules,
  frequency: Frequency,
): CalendarPeriod[] {
  const errors = calendarErrors(r, false);
  if (errors.length) throw new Error(errors.join(" "));
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
  const custom = customInterval(r);
  if (
    frequency === "every-two-months" ||
    (frequency === "custom" && custom.unit === "MONTHS")
  ) {
    const anchor =
      frequency === "every-two-months"
        ? (r.twoMonthAnchor ?? monthStart(r.start))
        : custom.anchor;
    const months = frequency === "every-two-months" ? 2 : custom.every;
    const gap =
      (Number(r.start.slice(0, 4)) - Number(anchor.slice(0, 4))) * 12 +
      Number(r.start.slice(5, 7)) -
      Number(anchor.slice(5, 7));
    cursor = addMonths(anchor, Math.floor(gap / months) * months);
  } else if (frequency === "custom") {
    const length = custom.every * (custom.unit === "WEEKS" ? 7 : 1);
    cursor = addDays(
      custom.anchor,
      Math.floor(diff(custom.anchor, r.start) / length) * length,
    );
  }
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
    else if (frequency === "custom")
      last =
        custom.unit === "MONTHS"
          ? addDays(addMonths(cursor, custom.every), -1)
          : addDays(
              cursor,
              custom.every * (custom.unit === "WEEKS" ? 7 : 1) - 1,
            );
    else
      last = addDays(
        addMonths(
          cursor,
          {
            monthly: 1,
            "every-two-months": 2,
            quarterly: 3,
            "half-yearly": 6,
            yearly: 12,
          }[frequency],
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
    const due = workingDays
      ? allowanceDeadline(
          r,
          end,
          r.submissionDays,
          r.submissionDayType,
          r.submissionRoll,
          "Submission",
        )
      : null;
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
      verifyBy: due ? verificationDeadline(r, due) : null,
      ...(due && r.verificationBasis === "ACTUAL_SUBMISSION"
        ? { verificationPendingSubmission: true }
        : {}),
    });
    cursor = addDays(last, 1);
  }
  return periods;
}

/** Advisory only: a review may intentionally consider incomplete reporting periods. */
export function reviewWarnings(
  r: CalendarRules,
  periods: Partial<Record<Frequency, CalendarPeriod[]>>,
  reviews = reviewPeriods(r),
): string[] {
  if (r.verificationBasis === "ACTUAL_SUBMISSION")
    return [
      "Review dates stay fixed. Verification dates depend on actual submission; late results may not be verified before a review.",
    ];
  const conflicts = reviews.filter(
    (review) =>
      review.completeBy &&
      Object.values(periods)
        .flat()
        .some(
          (p) =>
            p &&
            p.end <= review.end &&
            p.end >= review.start &&
            p.verifyBy &&
            p.verifyBy > review.completeBy!,
        ),
  );
  return conflicts.length
    ? [
        `${conflicts.length} review period(s) may finish before all reporting periods ending in that review period are verified. Check the reporting and review allowances; review dates do not wait for verification.`,
      ]
    : [];
}

export function approvalSnapshot(
  rules: CalendarRules,
): ApprovedCalendarSnapshot {
  const errors = calendarErrors(rules);
  if (errors.length) throw new Error(errors.join(" "));
  const periods = Object.fromEntries(
    enabledFrequencies(rules).map((f) => [f, makePeriods(rules, f)]),
  );
  return {
    format: 2,
    rules: structuredClone(rules),
    periods,
    reviews: reviewPeriods(rules),
    warnings: reviewWarnings(rules, periods),
  };
}
