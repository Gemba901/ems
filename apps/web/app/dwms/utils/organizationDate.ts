export function getOrganizationDateKey(
  value: Date,
  timeZone?: string | null,
) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone || undefined,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(value);
    const partMap = new Map(parts.map((part) => [part.type, part.value]));
    return `${partMap.get("year")}-${partMap.get("month")}-${partMap.get("day")}`;
  } catch {
    return null;
  }
}

export function formatOrganizationDate(
  value: string | Date | null | undefined,
  timeZone?: string | null,
  options: Intl.DateTimeFormatOptions = {},
) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone || undefined,
      ...options,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-US", options).format(date);
  }
}

export function isTodayInOrganizationTimeZone(
  value: string | Date | null | undefined,
  timeZone?: string | null,
) {
  if (!value) return false;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return (
    getOrganizationDateKey(date, timeZone) ===
    getOrganizationDateKey(new Date(), timeZone)
  );
}
