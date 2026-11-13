import { BadRequestException } from '@nestjs/common';
import type {
  Frequency,
  PlanningCalendar,
  TargetPeriod,
} from './planning.types';

const DAY = 86_400_000;
export const MAX_TARGET_PERIODS = 732;
export const TARGET_PERIOD_LIMIT_MESSAGE =
  'This assignment would create more than 732 target periods. Use a shorter assignment period or a less frequent reporting schedule.';
const FREQUENCIES: Frequency[] = [
  'DAILY',
  'WEEKLY',
  'FORTNIGHTLY',
  'TWICE_MONTHLY',
  'MONTHLY',
  'QUARTERLY',
  'HALF_YEARLY',
  'YEARLY',
];
const realDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
};
const addDays = (value: string, days: number) =>
  new Date(Date.parse(`${value}T00:00:00Z`) + days * DAY)
    .toISOString()
    .slice(0, 10);
const monthEnd = (year: number, month: number) =>
  new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10);

/** A snapshot is validated before it can generate targets or be pinned in a plan. */
export function validatePlanningCalendar(calendar: PlanningCalendar): void {
  if (!calendar.id || !['AREA_02', 'WORK_SETTINGS'].includes(calendar.source))
    throw new BadRequestException('The reporting calendar source is invalid.');
  if (
    !Array.isArray(calendar.workingDays) ||
    calendar.workingDays.some(
      (day) => !Number.isInteger(day) || day < 0 || day > 6,
    ) ||
    !Array.isArray(calendar.holidays) ||
    calendar.holidays.some((date) => !realDate(date))
  )
    throw new BadRequestException(
      'The reporting calendar contains invalid working days or holidays.',
    );
  if (
    !Number.isInteger(calendar.weekStart) ||
    calendar.weekStart < 0 ||
    calendar.weekStart > 6
  )
    throw new BadRequestException(
      'Choose a week start from Sunday to Saturday.',
    );
  if (!realDate(calendar.fortnightAnchor))
    throw new BadRequestException(
      'Choose a valid first date for the 14-day reporting cycle.',
    );
  if (
    !Number.isInteger(calendar.twiceMonthlySplit) ||
    calendar.twiceMonthlySplit < 1 ||
    calendar.twiceMonthlySplit > 27
  )
    throw new BadRequestException(
      'The first twice-monthly period must end between day 1 and day 27.',
    );
  if (
    !Number.isInteger(calendar.submissionDueDays) ||
    calendar.submissionDueDays < 0 ||
    calendar.submissionDueDays > 365
  )
    throw new BadRequestException(
      'The submission deadline must be 0 to 365 days after the reporting period.',
    );
  if (
    (calendar.startDate && !realDate(calendar.startDate)) ||
    (calendar.endDate && !realDate(calendar.endDate)) ||
    (calendar.startDate &&
      calendar.endDate &&
      calendar.startDate > calendar.endDate)
  )
    throw new BadRequestException('The reporting calendar dates are invalid.');
  try {
    new Intl.DateTimeFormat('en', { timeZone: calendar.timeZone }).format(
      new Date(),
    );
  } catch {
    throw new BadRequestException(
      'The organisation reporting time zone is invalid.',
    );
  }
}

/**
 * Calendar identity, version, time zone, working days and holidays are server-owned.
 * Until Area 02 provides an approved calendar, the approver may confirm the four
 * reporting rules on each assignment. The resulting snapshot is retained with it.
 */
export function resolveAssignmentCalendar(
  serverCalendar: PlanningCalendar | undefined,
  supplied?: unknown,
): PlanningCalendar | undefined {
  if (!serverCalendar) return undefined;
  const calendar = structuredClone(serverCalendar);
  if (supplied != null) {
    if (typeof supplied !== 'object' || Array.isArray(supplied))
      throw new BadRequestException(
        'The reporting calendar settings are invalid.',
      );
    const overrides = supplied as Record<string, unknown>;
    for (const key of [
      'weekStart',
      'fortnightAnchor',
      'twiceMonthlySplit',
      'submissionDueDays',
    ] as const) {
      if (overrides[key] === undefined) continue;
      const value = overrides[key];
      if (calendar.source === 'AREA_02' && value !== calendar[key])
        throw new BadRequestException(
          'Reporting rules come from the approved Area 02 calendar.',
        );
      if (key === 'fortnightAnchor') calendar.fortnightAnchor = String(value);
      else {
        if (typeof value !== 'number')
          throw new BadRequestException(
            'Reporting rule values must be whole numbers.',
          );
        calendar[key] = value;
      }
    }
  }
  validatePlanningCalendar(calendar);
  return calendar;
}

/** Date-only periods; deadlines use organisation-local calendar dates, never UTC instants. */
export function calendarPeriods(
  start: string,
  end: string,
  frequency: Frequency,
  calendar?: PlanningCalendar,
): TargetPeriod[] {
  if (
    !realDate(start) ||
    !realDate(end) ||
    start > end ||
    !FREQUENCIES.includes(frequency)
  )
    return [];
  if (calendar) {
    validatePlanningCalendar(calendar);
    if (
      (calendar.startDate && start < calendar.startDate) ||
      (calendar.endDate && end > calendar.endDate)
    )
      throw new BadRequestException(
        'Assignment dates must stay inside the approved reporting calendar.',
      );
  }
  const workingDays = new Set(calendar?.workingDays ?? [0, 1, 2, 3, 4, 5, 6]);
  const holidays = new Set(calendar?.holidays ?? []);
  const rows: TargetPeriod[] = [];
  let current = start;
  while (current <= end) {
    if (rows.length >= MAX_TARGET_PERIODS)
      throw new BadRequestException(TARGET_PERIOD_LIMIT_MESSAGE);
    const date = new Date(`${current}T00:00:00Z`);
    const year = date.getUTCFullYear(),
      month = date.getUTCMonth();
    let until = current;
    if (frequency === 'WEEKLY') {
      const offset = calendar
        ? (date.getUTCDay() - calendar.weekStart + 7) % 7
        : 0;
      until = addDays(current, 6 - offset);
    } else if (frequency === 'FORTNIGHTLY') {
      const offset = calendar
        ? ((((Date.parse(current) - Date.parse(calendar.fortnightAnchor)) /
            DAY) %
            14) +
            14) %
          14
        : 0;
      until = addDays(current, 13 - offset);
    } else if (frequency === 'TWICE_MONTHLY') {
      const split = calendar?.twiceMonthlySplit ?? 15;
      until =
        date.getUTCDate() <= split
          ? `${year}-${String(month + 1).padStart(2, '0')}-${String(split).padStart(2, '0')}`
          : monthEnd(year, month);
    } else if (frequency === 'MONTHLY') until = monthEnd(year, month);
    else if (frequency === 'QUARTERLY')
      until = monthEnd(year, Math.floor(month / 3) * 3 + 2);
    else if (frequency === 'HALF_YEARLY')
      until = monthEnd(year, month < 6 ? 5 : 11);
    else if (frequency === 'YEARLY') until = `${year}-12-31`;
    until = until > end ? end : until;
    let scheduled = false;
    for (let d = current; d <= until; d = addDays(d, 1)) {
      if (
        workingDays.has(new Date(`${d}T00:00:00Z`).getUTCDay()) &&
        !holidays.has(d)
      ) {
        scheduled = true;
        break;
      }
    }
    rows.push({
      id: `${current}/${until}`,
      label: current === until ? current : `${current} – ${until}`,
      start: current,
      end: until,
      target: null,
      upper: null,
      ...(calendar
        ? {
            scheduled,
            submissionDate: scheduled
              ? addDays(until, calendar.submissionDueDays)
              : undefined,
          }
        : {}),
    });
    current = addDays(until, 1);
  }
  return rows;
}
