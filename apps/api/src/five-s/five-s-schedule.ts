import { FiveSAuditFrequency, FiveSRoutineFrequency } from 'db';
import { addDays, daysBetween, toDbDate, fromDbDate } from 'src/work/work-date';

// All dates here are YYYY-MM-DD calendar dates in the company's time zone.

export type AuditDueState = 'NEVER_AUDITED' | 'OVERDUE' | 'DUE_SOON' | 'ON_TRACK';

export const AUDIT_DUE_SOON_DAYS = 7;

export function addMonths(value: string, months: number): string {
    const date = toDbDate(value);
    const day = date.getUTCDate();
    const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
    const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(day, lastDay));
    return fromDbDate(target);
}

export function nextAuditDue(lastAuditDate: string, frequency: FiveSAuditFrequency): string {
    switch (frequency) {
        case FiveSAuditFrequency.WEEKLY:
            return addDays(lastAuditDate, 7);
        case FiveSAuditFrequency.FORTNIGHTLY:
            return addDays(lastAuditDate, 14);
        case FiveSAuditFrequency.MONTHLY:
            return addMonths(lastAuditDate, 1);
        case FiveSAuditFrequency.QUARTERLY:
            return addMonths(lastAuditDate, 3);
    }
}

export function auditDueState(
    lastAuditDate: string | null,
    frequency: FiveSAuditFrequency,
    today: string,
): { state: AuditDueState; nextDueDate: string | null } {
    if (!lastAuditDate) return { state: 'NEVER_AUDITED', nextDueDate: null };
    const nextDueDate = nextAuditDue(lastAuditDate, frequency);
    const daysLeft = daysBetween(today, nextDueDate);
    if (daysLeft < 0) return { state: 'OVERDUE', nextDueDate };
    if (daysLeft <= AUDIT_DUE_SOON_DAYS) return { state: 'DUE_SOON', nextDueDate };
    return { state: 'ON_TRACK', nextDueDate };
}

// Scheduled occurrences of a routine between `from` and `to` (inclusive), never before its start.
// Weekly routines repeat on the start date's weekday; monthly ones on its day of month,
// moved to the last day in shorter months.
export function routineOccurrences(
    startDate: string,
    frequency: FiveSRoutineFrequency,
    from: string,
    to: string,
): string[] {
    const first = from > startDate ? from : startDate;
    if (first > to) return [];
    const dates: string[] = [];

    if (frequency === FiveSRoutineFrequency.DAILY) {
        for (let d = first; d <= to; d = addDays(d, 1)) dates.push(d);
        return dates;
    }

    if (frequency === FiveSRoutineFrequency.WEEKLY) {
        const offset = ((daysBetween(startDate, first) % 7) + 7) % 7;
        for (let d = offset === 0 ? first : addDays(first, 7 - offset); d <= to; d = addDays(d, 7)) dates.push(d);
        return dates;
    }

    for (let i = 0; ; i++) {
        const d = addMonths(startDate, i);
        if (d > to) break;
        if (d >= first) dates.push(d);
    }
    return dates;
}

export function isRoutineOccurrence(startDate: string, frequency: FiveSRoutineFrequency, date: string): boolean {
    return routineOccurrences(startDate, frequency, date, date).length === 1;
}
