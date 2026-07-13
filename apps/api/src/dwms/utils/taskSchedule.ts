import { TaskFrequency } from 'db';

const allowedTaskFrequencies = new Set<TaskFrequency>([
  TaskFrequency.DAILY,
  TaskFrequency.WEEKLY,
  TaskFrequency.MONTHLY,
  TaskFrequency.QUARTERLY,
  TaskFrequency.YEARLY,
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

export function endOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 23, 59, 59, 999));
}

export function isBeforeUtcDate(value: Date, reference: Date): boolean {
  return toUtcDateOnly(value).getTime() < toUtcDateOnly(reference).getTime();
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
