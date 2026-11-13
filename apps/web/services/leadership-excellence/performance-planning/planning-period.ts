export const PLANNING_DATE_MIN = "2000-01-01";
export const PLANNING_DATE_MAX = "2200-12-31";

export interface PlanningPeriodBounds {
  startDate: string;
  endDate: string;
}

function validDate(value: string): boolean {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value < PLANNING_DATE_MIN ||
    value > PLANNING_DATE_MAX
  )
    return false;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value
  );
}

/** Never normalise an invalid calendar date into a different day or year. */
export function planningPeriodValidation(from: string, to: string): string[] {
  const errors: string[] = [];
  const validFrom = validDate(from),
    validTo = validDate(to);
  if (!validFrom)
    errors.push(
      "Choose a valid From date between 1 January 2000 and 31 December 2200.",
    );
  if (!validTo)
    errors.push(
      "Choose a valid To date between 1 January 2000 and 31 December 2200.",
    );
  if (validFrom && validTo && to < from)
    errors.push("The To date must be on or after the From date.");
  return errors;
}

/** Keep existing annual records under their original year key. */
export function planningPeriodKey(from: string, to: string): string | null {
  if (planningPeriodValidation(from, to).length) return null;
  const year = from.slice(0, 4);
  return from === `${year}-01-01` && to === `${year}-12-31`
    ? year
    : `${from}..${to}`;
}

/** Interpret a legacy year or an explicit period without assuming a calendar year. */
export function planningPeriodBounds(
  cycle: string,
): PlanningPeriodBounds | null {
  const dates = /^\d{4}$/.test(cycle)
    ? [`${cycle}-01-01`, `${cycle}-12-31`]
    : /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/.exec(cycle)?.slice(1);
  if (!dates || planningPeriodValidation(dates[0], dates[1]).length)
    return null;
  return { startDate: dates[0], endDate: dates[1] };
}

const dateLabel = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function planningPeriodLabel(cycle: string): string {
  const bounds = planningPeriodBounds(cycle);
  if (!bounds) return "Invalid planning period";
  const key = planningPeriodKey(bounds.startDate, bounds.endDate);
  if (key && /^\d{4}$/.test(key)) return key;
  return `${dateLabel.format(new Date(`${bounds.startDate}T00:00:00Z`))} – ${dateLabel.format(new Date(`${bounds.endDate}T00:00:00Z`))}`;
}
