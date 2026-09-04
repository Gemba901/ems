export function getOrganizationDateKey(
  value: Date,
  timeZone?: string | null,
) {
  const resolvedTimeZone = getSafeTimeZone(timeZone);
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: resolvedTimeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(value);
    const partMap = new Map(parts.map((part) => [part.type, part.value]));
    return `${partMap.get("year")}-${partMap.get("month")}-${partMap.get("day")}`;
  } catch {
    return value.toISOString().slice(0, 10);
  }
}

export function getSafeTimeZone(timeZone?: string | null) {
  if (timeZone) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
      return timeZone;
    } catch {
      // Fall through to a deterministic value; never inherit browser timezone.
    }
  }
  return "UTC";
}

export function getOrganizationTodayKey(timeZone?: string | null) {
  return getOrganizationDateKey(new Date(), timeZone);
}

export function addDaysToDateKey(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function formatOrganizationDateKey(
  value: string | null | undefined,
  options: Intl.DateTimeFormatOptions = {},
) {
  const dateKey = value?.slice(0, 10);
  if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    ...options,
  }).format(date);
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
      timeZone: getSafeTimeZone(timeZone),
      ...options,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      ...options,
    }).format(date);
  }
}

function getTimeZoneOffsetMs(value: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(value);
  const partMap = new Map(parts.map((part) => [part.type, part.value]));
  return Date.UTC(
    Number(partMap.get("year")),
    Number(partMap.get("month")) - 1,
    Number(partMap.get("day")),
    Number(partMap.get("hour")),
    Number(partMap.get("minute")),
    Number(partMap.get("second")),
    value.getUTCMilliseconds(),
  ) - value.getTime();
}

export function startOfOrganizationDay(
  dateKeyValue: string | Date,
  timeZone?: string | null,
) {
  const dateKey =
    typeof dateKeyValue === "string"
      ? dateKeyValue.slice(0, 10)
      : dateKeyValue.toISOString().slice(0, 10);
  const localStartAsUtc = Date.parse(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(localStartAsUtc)) return null;
  const resolvedTimeZone = getSafeTimeZone(timeZone);
  const firstPass = new Date(
    localStartAsUtc -
      getTimeZoneOffsetMs(new Date(localStartAsUtc), resolvedTimeZone),
  );
  return new Date(
    localStartAsUtc - getTimeZoneOffsetMs(firstPass, resolvedTimeZone),
  );
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
