import { addMonths, auditDueState, isRoutineOccurrence, routineOccurrences } from './five-s-schedule';

describe('5S schedules', () => {
    it('clamps monthly dates to the end of shorter months', () => {
        expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
        expect(addMonths('2026-01-31', 2)).toBe('2026-03-31');
        expect(addMonths('2026-11-15', 3)).toBe('2027-02-15');
    });

    it('reports audit due state from the latest submitted audit', () => {
        expect(auditDueState(null, 'MONTHLY', '2026-10-16')).toEqual({ state: 'NEVER_AUDITED', nextDueDate: null });
        expect(auditDueState('2026-09-10', 'MONTHLY', '2026-10-16')).toEqual({ state: 'OVERDUE', nextDueDate: '2026-10-10' });
        expect(auditDueState('2026-09-20', 'MONTHLY', '2026-10-16')).toEqual({ state: 'DUE_SOON', nextDueDate: '2026-10-20' });
        expect(auditDueState('2026-10-14', 'WEEKLY', '2026-10-16').state).toBe('DUE_SOON');
        expect(auditDueState('2026-10-01', 'QUARTERLY', '2026-10-16')).toEqual({ state: 'ON_TRACK', nextDueDate: '2027-01-01' });
    });

    it('lists daily, weekly and monthly routine occurrences', () => {
        expect(routineOccurrences('2026-10-14', 'DAILY', '2026-10-10', '2026-10-16')).toEqual(['2026-10-14', '2026-10-15', '2026-10-16']);
        // 2026-10-05 is a Monday.
        expect(routineOccurrences('2026-10-05', 'WEEKLY', '2026-10-07', '2026-10-27')).toEqual(['2026-10-12', '2026-10-19', '2026-10-26']);
        expect(routineOccurrences('2026-10-05', 'WEEKLY', '2026-10-12', '2026-10-12')).toEqual(['2026-10-12']);
        expect(routineOccurrences('2026-01-31', 'MONTHLY', '2026-02-01', '2026-04-30')).toEqual(['2026-02-28', '2026-03-31', '2026-04-30']);
        expect(routineOccurrences('2026-10-16', 'DAILY', '2026-10-01', '2026-10-15')).toEqual([]);
    });

    it('recognises valid occurrence dates only', () => {
        expect(isRoutineOccurrence('2026-10-05', 'WEEKLY', '2026-10-19')).toBe(true);
        expect(isRoutineOccurrence('2026-10-05', 'WEEKLY', '2026-10-20')).toBe(false);
        expect(isRoutineOccurrence('2026-10-05', 'DAILY', '2026-10-04')).toBe(false);
    });
});
