import { RecurrenceUnit, TaskFrequency } from 'db';

export const WEEKDAY_CODES = [
  'SUN',
  'MON',
  'TUE',
  'WED',
  'THU',
  'FRI',
  'SAT',
] as const;

export type WeekdayCode = (typeof WEEKDAY_CODES)[number];

export type StructuredRecurrence = {
  unit: RecurrenceUnit;
  interval: number;
  weekdays: number[];
  dayOfMonth: number | null;
  startsOn: Date;
};

export type StructuredRecurrenceInput = {
  startsOn: string;
  unit: RecurrenceUnit;
  interval: number;
  weekdays?: string[];
  dayOfMonth?: number;
};

export function parseStructuredRecurrence(
  input: StructuredRecurrenceInput,
): StructuredRecurrence {
  const startsOn = parseDateOnly(input.startsOn.slice(0, 10));
  if (!startsOn) throw new Error('Recurrence start date must be valid');
  if (
    !Number.isInteger(input.interval) ||
    input.interval < 1 ||
    input.interval > 99
  ) {
    throw new Error('Recurrence interval must be between 1 and 99');
  }

  const weekdays = (input.weekdays ?? []).map((day) =>
    weekdayCodeToNumber(day as WeekdayCode),
  );
  if (weekdays.some((day) => day < 0)) {
    throw new Error('Recurrence contains an invalid weekday');
  }
  const uniqueWeekdays = [...new Set(weekdays)].sort((a, b) => a - b);

  if (input.unit === RecurrenceUnit.DAY) {
    if (uniqueWeekdays.length || input.dayOfMonth !== undefined) {
      throw new Error(
        'Daily recurrence cannot include weekdays or a month date',
      );
    }
  } else if (input.unit === RecurrenceUnit.WEEK) {
    if (!uniqueWeekdays.length || input.dayOfMonth !== undefined) {
      throw new Error('Weekly recurrence requires at least one weekday');
    }
  } else if (input.unit === RecurrenceUnit.MONTH) {
    if (
      uniqueWeekdays.length ||
      !Number.isInteger(input.dayOfMonth) ||
      input.dayOfMonth! < 1 ||
      input.dayOfMonth! > 31
    ) {
      throw new Error('Monthly recurrence requires a date between 1 and 31');
    }
  } else {
    throw new Error('Only day, week, and month recurrence is supported');
  }

  return {
    unit: input.unit,
    interval: input.interval,
    weekdays: uniqueWeekdays,
    dayOfMonth: input.dayOfMonth ?? null,
    startsOn,
  };
}

export function weekdayCodeToNumber(value: WeekdayCode): number {
  return WEEKDAY_CODES.indexOf(value);
}

export function recurrenceFrequency(
  unit: RecurrenceUnit,
  interval: number,
): TaskFrequency {
  if (unit === RecurrenceUnit.DAY) return TaskFrequency.DAILY;
  if (unit === RecurrenceUnit.WEEK) return TaskFrequency.WEEKLY;
  return interval === 3 ? TaskFrequency.QUARTERLY : TaskFrequency.MONTHLY;
}

export function structuredRecurrenceLabel(rule: StructuredRecurrence): string {
  const every = rule.interval === 1 ? 'Every' : `Every ${rule.interval}`;
  if (rule.unit === RecurrenceUnit.DAY) {
    return rule.interval === 1 ? 'Every day' : `${every} days`;
  }
  if (rule.unit === RecurrenceUnit.WEEK) {
    const days = rule.weekdays
      .map((day) => WEEKDAY_CODES[day])
      .filter(Boolean)
      .map((day) => day[0] + day.slice(1).toLowerCase());
    const prefix = rule.interval === 1 ? 'Every' : `${every} weeks on`;
    return `${prefix} ${days.join(', ')}`;
  }
  const day = rule.dayOfMonth ?? 1;
  const suffix =
    day >= 11 && day <= 13
      ? 'th'
      : day % 10 === 1
        ? 'st'
        : day % 10 === 2
          ? 'nd'
          : day % 10 === 3
            ? 'rd'
            : 'th';
  return rule.interval === 1
    ? `Every month on the ${rule.dayOfMonth}${suffix}`
    : `${every} months on the ${rule.dayOfMonth}${suffix}`;
}

export function isStructuredOccurrenceDate(
  rule: StructuredRecurrence,
  value: Date,
): boolean {
  const date = toUtcDateOnly(value);
  const start = toUtcDateOnly(rule.startsOn);
  if (date < start) return false;

  const dayDifference = Math.floor(
    (date.getTime() - start.getTime()) / 86_400_000,
  );
  if (rule.unit === RecurrenceUnit.DAY) {
    return dayDifference % rule.interval === 0;
  }

  if (rule.unit === RecurrenceUnit.WEEK) {
    const startMonday = addUtcDays(start, -((start.getUTCDay() + 6) % 7));
    const dateMonday = addUtcDays(date, -((date.getUTCDay() + 6) % 7));
    const weekDifference = Math.floor(
      (dateMonday.getTime() - startMonday.getTime()) / (7 * 86_400_000),
    );
    return (
      weekDifference % rule.interval === 0 &&
      rule.weekdays.includes(date.getUTCDay())
    );
  }

  const monthDifference =
    (date.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    date.getUTCMonth() -
    start.getUTCMonth();
  if (monthDifference < 0 || monthDifference % rule.interval !== 0) {
    return false;
  }
  const requestedDay = rule.dayOfMonth ?? start.getUTCDate();
  const lastDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return date.getUTCDate() === Math.min(requestedDay, lastDay);
}

export async function moveOccurrenceToNextOpenDate(
  value: Date,
  isOpen: (date: Date) => boolean | Promise<boolean>,
): Promise<Date | null> {
  const adjusted = toUtcDateOnly(value);
  for (let offset = 0; offset <= 370; offset += 1) {
    if (await isOpen(adjusted)) return toUtcDateOnly(adjusted);
    adjusted.setUTCDate(adjusted.getUTCDate() + 1);
  }
  return null;
}

const allowedTaskFrequencies = new Set<TaskFrequency>([
  TaskFrequency.DAILY,
  TaskFrequency.WEEKLY,
  TaskFrequency.MONTHLY,
  TaskFrequency.QUARTERLY,
  TaskFrequency.YEARLY,
  TaskFrequency.PLANNED,
]);

export function parseTaskFrequency(
  value: string | null | undefined,
): TaskFrequency | null {
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

  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

export function toUtcDateOnly(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
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

export function addFrequencyInterval(
  value: Date,
  frequency: TaskFrequency,
): Date {
  const next = new Date(value);

  switch (frequency) {
    case TaskFrequency.DAILY:
      next.setUTCDate(next.getUTCDate() + 1);
      break;
    case TaskFrequency.WEEKLY:
      next.setUTCDate(next.getUTCDate() + 7);
      break;
    case TaskFrequency.MONTHLY: {
      const day = next.getUTCDate();
      next.setUTCDate(1);
      next.setUTCMonth(next.getUTCMonth() + 1);
      const lastDay = new Date(
        Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
      ).getUTCDate();
      next.setUTCDate(Math.min(day, lastDay));
      break;
    }
    case TaskFrequency.QUARTERLY: {
      const day = next.getUTCDate();
      next.setUTCDate(1);
      next.setUTCMonth(next.getUTCMonth() + 3);
      const lastDay = new Date(
        Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
      ).getUTCDate();
      next.setUTCDate(Math.min(day, lastDay));
      break;
    }
    case TaskFrequency.YEARLY: {
      const day = next.getUTCDate();
      next.setUTCDate(1);
      next.setUTCMonth(next.getUTCMonth() + 12);
      const lastDay = new Date(
        Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
      ).getUTCDate();
      next.setUTCDate(Math.min(day, lastDay));
      break;
    }
    default:
      next.setUTCDate(next.getUTCDate() + 1);
      break;
  }

  return toUtcDateOnly(next);
}

export function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
