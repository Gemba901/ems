import type { CalendarException, CalendarRules } from "./calendar-model";

export function needsHolidayReason(entry: CalendarException) {
  return (
    entry.source === "HOLIDAY_SUGGESTION" &&
    entry.kind === "NON_WORKING" &&
    entry.category !== "OPTIONAL_CLOSURE"
  );
}

/** Saving must not silently remove a previously accepted holiday closure. */
export function holidayDecisionIssue(
  before: CalendarRules,
  after: CalendarRules,
) {
  for (const entry of before.exceptions) {
    if (!needsHolidayReason(entry)) continue;
    const kept = after.exceptions.find((e) => e.date === entry.date);
    if (kept?.kind === "NON_WORKING") continue;
    const country = entry.holidayCountry ?? before.country;
    if (
      !(after.holidayOmissions ?? []).some(
        (h) =>
          h.date === entry.date && h.country === country && h.reason.trim(),
      )
    )
      return `Give a reason for removing or changing the holiday “${entry.reason}” on ${entry.date}.`;
  }
  return "";
}

/** Editing a name cannot erase the accepted holiday's origin or classification. */
export function preserveHolidayOrigins(
  before: CalendarRules,
  after: CalendarRules,
): CalendarRules {
  return {
    ...after,
    exceptions: after.exceptions.map((entry) => {
      const original = before.exceptions.find(
        (e) => e.date === entry.date && e.source === "HOLIDAY_SUGGESTION",
      );
      return original
        ? {
            ...entry,
            source: original.source,
            category: original.category,
            originalDate: original.originalDate,
            holidayCountry: original.holidayCountry ?? before.country,
          }
        : entry;
    }),
  };
}
