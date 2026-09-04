import { TaskFrequency } from 'db';

const allowedTaskFrequencies = new Set<TaskFrequency>([
  TaskFrequency.DAILY,
  TaskFrequency.WEEKLY,
  TaskFrequency.MONTHLY,
  TaskFrequency.QUARTERLY,
  TaskFrequency.YEARLY,
  TaskFrequency.PLANNED,
]);

export function parseTaskFrequency(value: string | null | undefined): TaskFrequency | null {
  if (!value) {
    return null;
  }

  const normalized = value.toUpperCase() as TaskFrequency;
  return allowedTaskFrequencies.has(normalized) ? normalized : null;
}

export function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month, day));

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

export function toUtcDateOnly(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export function getUtcDateInTimeZone(value: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const partMap = new Map(parts.map((part) => [part.type, part.value]));
  return new Date(
    Date.UTC(
      Number(partMap.get('year')),
      Number(partMap.get('month')) - 1,
      Number(partMap.get('day')),
    ),
  );
}

export function getCurrentUtcDateInTimeZone(timeZone: string): Date {
  return getUtcDateInTimeZone(new Date(), timeZone);
}

export function addUtcDays(value: Date, days: number): Date {
  const result = toUtcDateOnly(value);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function getOrganizationDateRange(
  value: Date,
  timeZone: string,
  days: number,
) {
  const scheduleEnd = getUtcDateInTimeZone(value, timeZone);
  const scheduleStart = addUtcDays(scheduleEnd, -Math.max(0, days - 1));

  return {
    scheduleStart,
    scheduleEnd,
    instantStart: startOfDayInTimeZone(scheduleStart, timeZone),
    instantEnd: endOfDayInTimeZone(scheduleEnd, timeZone),
  };
}

export function parseTimeZone(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
    return value;
  } catch {
    return null;
  }
}

function getTimeZoneOffsetMs(value: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(value);

  const partMap = new Map(parts.map((part) => [part.type, part.value]));
  const zonedAsUtc = Date.UTC(
    Number(partMap.get('year')),
    Number(partMap.get('month')) - 1,
    Number(partMap.get('day')),
    Number(partMap.get('hour')),
    Number(partMap.get('minute')),
    Number(partMap.get('second')),
    value.getUTCMilliseconds(),
  );

  return zonedAsUtc - value.getTime();
}

export function startOfDayInTimeZone(value: Date, timeZone: string): Date {
    const localStartAsUtc = Date.UTC(
      value.getUTCFullYear(),
      value.getUTCMonth(),
      value.getUTCDate(),
      0,
      0,
      0,
      0,
    );
    const firstPass = new Date(
      localStartAsUtc - getTimeZoneOffsetMs(new Date(localStartAsUtc), timeZone),
    );
    const offset = getTimeZoneOffsetMs(firstPass, timeZone);
    return new Date(localStartAsUtc - offset);
}

export function endOfDayInTimeZone(value: Date, timeZone: string): Date {
    const localEndAsUtc = Date.UTC(
      value.getUTCFullYear(),
      value.getUTCMonth(),
      value.getUTCDate(),
      23,
      59,
      59,
      999,
    );
    const firstPass = new Date(
      localEndAsUtc - getTimeZoneOffsetMs(new Date(localEndAsUtc), timeZone),
    );
    const offset = getTimeZoneOffsetMs(firstPass, timeZone);
    return new Date(localEndAsUtc - offset);
}


export function addFrequencyInterval(value: Date, frequency: TaskFrequency): Date {
  const next = new Date(value);

  switch (frequency) {
    case TaskFrequency.DAILY:
      next.setUTCDate(next.getUTCDate() + 1);
      break;
    case TaskFrequency.WEEKLY:
      next.setUTCDate(next.getUTCDate() + 7);
      break;
    case TaskFrequency.MONTHLY:
      next.setUTCMonth(next.getUTCMonth() + 1);
      break;
    case TaskFrequency.QUARTERLY:
      next.setUTCMonth(next.getUTCMonth() + 3);
      break;
    case TaskFrequency.YEARLY:
      next.setUTCFullYear(next.getUTCFullYear() + 1);
      break;
    default:
      next.setUTCDate(next.getUTCDate() + 1);
      break;
  }

  return toUtcDateOnly(next);
}

export function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
