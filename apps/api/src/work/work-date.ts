// Date-only helpers for attendance work days, due dates and sprint dates.
// Postgres @db.Date values come back from Prisma as UTC midnight, so always use
// UTC methods here; local-time methods would shift the day by the server's zone.

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

// Calendar date (YYYY-MM-DD) of an instant in the given IANA time zone.
export function localDateIn(instant: Date, timeZone: string): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(instant);

    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value;
    return `${get('year')}-${get('month')}-${get('day')}`;
}

// True only for a real calendar date in YYYY-MM-DD form (rejects 2026-02-30).
export function isDateOnly(value: unknown): value is string {
    if (typeof value !== 'string' || !DATE_ONLY.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// YYYY-MM-DD -> Date at UTC midnight, the shape Prisma expects for @db.Date.
export function toDbDate(value: string): Date {
    if (!isDateOnly(value)) throw new Error(`Invalid date: ${value}`);
    return new Date(`${value}T00:00:00Z`);
}

// @db.Date value -> YYYY-MM-DD for API responses.
export function fromDbDate(date: Date): string {
    return date.toISOString().slice(0, 10);
}

// First and last day of the month containing the given date.
export function monthRange(value: string): { from: string; to: string } {
    const date = toDbDate(value);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    return {
        from: fromDbDate(new Date(Date.UTC(year, month, 1))),
        to: fromDbDate(new Date(Date.UTC(year, month + 1, 0))),
    };
}

// YYYY-MM-DD shifted by a number of days.
export function addDays(value: string, days: number): string {
    const date = toDbDate(value);
    date.setUTCDate(date.getUTCDate() + days);
    return fromDbDate(date);
}

// 0 = Sunday … 6 = Saturday, matching LeaveSettings.workingDays and Date#getDay.
export function weekdayOf(value: string): number {
    return toDbDate(value).getUTCDay();
}

// Every date from `from` to `to`, inclusive.
export function eachDate(from: string, to: string): string[] {
    const dates: string[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) dates.push(d);
    return dates;
}

// Whole days from `from` to `to` (0 when equal, negative when `to` is earlier).
export function daysBetween(from: string, to: string): number {
    return Math.round((toDbDate(to).getTime() - toDbDate(from).getTime()) / 86_400_000);
}

// Offset of `timeZone` from UTC at `instant`, in minutes.
function zoneOffsetMinutes(instant: Date, timeZone: string): number {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    }).formatToParts(instant);
    const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
    return Math.round((asUtc - instant.getTime()) / 60_000);
}

// The instant at which the wall clock in `timeZone` reads `time` (HH:mm) on `date`.
export function zonedInstant(date: string, time: string, timeZone: string): Date {
    const [h, m] = time.split(':').map(Number);
    const wall = toDbDate(date).getTime() + (h * 60 + m) * 60_000;
    // Two passes settle the offset around daylight-saving changes.
    let instant = wall - zoneOffsetMinutes(new Date(wall), timeZone) * 60_000;
    instant = wall - zoneOffsetMinutes(new Date(instant), timeZone) * 60_000;
    return new Date(instant);
}
