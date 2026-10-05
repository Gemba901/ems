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
