import { attendanceStats, leaveDateSets } from './analytics/attendance-stats';
import { zonedInstant } from './work-date';
import { DEFAULT_SCHEDULE, WorkCalendar, holidayCalendar, punctuality, scheduledMinutes } from './work-schedule';

const TZ = 'Africa/Nairobi';

describe('holidayCalendar', () => {
    it('observes a weekend holiday on the next free working day', () => {
        // 2026-12-12 is a Saturday, 2026-12-13 a Sunday.
        const days = holidayCalendar(
            [
                { date: '2026-12-12', name: 'Jamhuri Day' },
                { date: '2026-12-13', name: 'Extra' },
            ],
            [1, 2, 3, 4, 5],
            true,
        );
        expect(days.get('2026-12-14')).toBe('Jamhuri Day (observed)');
        expect(days.get('2026-12-15')).toBe('Extra (observed)');
    });

    it('does not shift holidays when observance is off', () => {
        const days = holidayCalendar([{ date: '2026-12-12', name: 'Jamhuri Day' }], [1, 2, 3, 4, 5], false);
        expect([...days.keys()]).toEqual(['2026-12-12']);
    });
});

describe('punctuality', () => {
    const start = zonedInstant('2026-10-06', '09:00', TZ);
    const end = zonedInstant('2026-10-06', '17:00', TZ);
    const at = (minutes: number) => new Date(start.getTime() + minutes * 60_000);

    it('counts lateness from the scheduled start once past the grace period', () => {
        const base = { clockOutAt: null, scheduledStartAt: start, scheduledEndAt: end, lateGraceMinutes: 10 };
        expect(punctuality({ ...base, clockInAt: at(10) }).lateMinutes).toBe(0);
        expect(punctuality({ ...base, clockInAt: at(11) }).lateMinutes).toBe(11);
    });

    it('reports early leave and ignores unscheduled days', () => {
        const record = { clockInAt: at(0), clockOutAt: at(7 * 60), scheduledStartAt: start, scheduledEndAt: end, lateGraceMinutes: 0 };
        expect(punctuality(record).earlyLeaveMinutes).toBe(60);
        expect(punctuality({ ...record, scheduledStartAt: null, scheduledEndAt: null })).toEqual({
            scheduled: false,
            lateMinutes: 0,
            earlyLeaveMinutes: 0,
        });
    });

    it('nets lunch out of scheduled minutes', () => {
        expect(scheduledMinutes({ ...DEFAULT_SCHEDULE, lunchBreakEnabled: true, lunchStartTime: '13:00', lunchEndTime: '14:00' })).toBe(420);
    });
});

describe('attendanceStats', () => {
    // Mon 5 Oct – Fri 9 Oct 2026, with a company holiday on Wednesday.
    const calendar = new WorkCalendar(DEFAULT_SCHEDULE, new Map([['2026-10-07', 'Company day']]));
    const snapshot = (date: string) => ({
        scheduledStartAt: zonedInstant(date, '09:00', TZ),
        scheduledEndAt: zonedInstant(date, '17:00', TZ),
        scheduledBreakMinutes: 0,
        lateGraceMinutes: 0,
    });

    it('counts present, late, absent and leave, never today as absent', () => {
        const leave = leaveDateSets([{ employeeId: 'a', startDate: new Date('2026-10-08T00:00:00Z'), endDate: new Date('2026-10-08T00:00:00Z') }], '2026-10-05', '2026-10-09');
        const records = [
            { employeeId: 'a', workDate: '2026-10-05', clockInAt: zonedInstant('2026-10-05', '08:55', TZ), clockOutAt: null, ...snapshot('2026-10-05') },
            { employeeId: 'a', workDate: '2026-10-06', clockInAt: zonedInstant('2026-10-06', '09:30', TZ), clockOutAt: null, ...snapshot('2026-10-06') },
        ];
        const { totals, trend } = attendanceStats(
            [{ id: 'a', joinedOn: null, leaveDates: leave.get('a') ?? new Set() }],
            records,
            calendar,
            '2026-10-05',
            '2026-10-09',
            '2026-10-09',
        );
        // Mon on time, Tue late, Wed holiday, Thu leave, Fri is today with no record.
        expect(totals).toMatchObject({ expectedDays: 2, presentDays: 2, onTimeDays: 1, lateDays: 1, absentDays: 0, leaveDays: 1, averageLateMinutes: 30 });
        expect(totals.punctualityRate).toBe(50);
        expect(trend).toHaveLength(5);
    });

    it('does not count days before an employee joined', () => {
        const { totals } = attendanceStats([{ id: 'b', joinedOn: '2026-10-09', leaveDates: new Set() }], [], calendar, '2026-10-05', '2026-10-09', '2026-10-10');
        expect(totals).toMatchObject({ expectedDays: 1, absentDays: 1, attendanceRate: 0 });
    });
});
