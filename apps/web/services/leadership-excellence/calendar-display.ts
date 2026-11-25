const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** Display a date-only value without changing its saved date or time zone. */
export function calendarDateLabel(value?: string | null): string {
  if (!value) return "—";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    return value;
  return dateFormat.format(date);
}

/** Keep custom period names while displaying generated ISO date labels readably. */
export function calendarPeriodLabel(period: {
  label?: string;
  start: string;
  end: string;
}): string {
  const label = period.label ||
    (period.start === period.end ? period.start : `${period.start} – ${period.end}`);
  return label.replace(/\b\d{4}-\d{2}-\d{2}\b/g, calendarDateLabel);
}
