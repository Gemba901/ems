import { calendarDateLabel } from "../calendar-display";
import type {
  Frequency,
  PlanningCalendar,
  PlanningDocument,
  PlanningReferences,
} from "./types";

export const planningFrequencies: [Frequency, string][] = [
  ["DAILY", "Daily"],
  ["WEEKLY", "Weekly"],
  ["FORTNIGHTLY", "Every two weeks (14 days)"],
  ["TWICE_MONTHLY", "Twice monthly"],
  ["MONTHLY", "Monthly"],
  ["EVERY_TWO_MONTHS", "Every two months"],
  ["QUARTERLY", "Quarterly"],
  ["HALF_YEARLY", "Half-yearly"],
  ["YEARLY", "Yearly"],
  ["CUSTOM", "Custom interval"],
];

/** An older saved choice remains visible without enabling it for new records. */
export function calendarFrequencyChoices(
  calendar?: PlanningCalendar,
  purpose: "reporting" | "review" = "reporting",
) {
  const published =
    calendar?.source === "AREA_02" ? calendar.frequencies : undefined;
  const enabled =
    published && purpose === "review" && calendar?.area02?.reviewFrequency
      ? [...new Set([...published, calendar.area02.reviewFrequency])]
      : published;
  return planningFrequencies.filter(([frequency]) =>
    enabled
      ? enabled.includes(frequency)
      : frequency !== "CUSTOM" && frequency !== "EVERY_TWO_MONTHS",
  );
}

export function calendarIdentity(
  calendar?: Pick<PlanningCalendar, "id" | "version">,
) {
  return calendar
    ? JSON.stringify([calendar.id, String(calendar.version)])
    : "";
}

/** Existing plans keep their publication; connected new plans require a selection. */
export function savedPlanningCalendar(
  document: PlanningDocument | undefined,
  references: PlanningReferences,
) {
  return (
    document?.data.calendar ||
    [...(document?.versions || [])]
      .sort((a, b) => b.version - a.version)
      .find((version) => version.calendar)?.calendar ||
    (references.calendars === undefined ? references.calendar : undefined)
  );
}

/** Calendar limits intersect the existing plan/goal dates; values are never rewritten. */
export function calendarDateBounds(
  calendar: PlanningCalendar | undefined,
  startDate = "",
  endDate = "",
) {
  return {
    startDate:
      [startDate, calendar?.startDate || ""].filter(Boolean).sort().at(-1) ||
      "",
    endDate: [endDate, calendar?.endDate || ""].filter(Boolean).sort()[0] || "",
  };
}

export function calendarDateIssue(
  calendar: PlanningCalendar | undefined,
  start: string,
  end: string,
) {
  if (!calendar || !start || !end) return "";
  return (Boolean(calendar.startDate) && start < calendar.startDate) ||
    (Boolean(calendar.endDate) && end > calendar.endDate)
    ? `The selected calendar covers ${calendarDateLabel(calendar.startDate)} to ${calendarDateLabel(calendar.endDate)}. Adjust the dates or explicitly choose another approved calendar.`
    : "";
}
