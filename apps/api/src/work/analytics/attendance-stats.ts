import { AttendanceLocationCheck } from 'db';
import { WorkCalendar, attendanceDays } from '../work-schedule';
import { eachDate } from '../work-date';

// One employee's attendance inputs for a date range.
export type StatsEmployee = {
    id: string;
    joinedOn: string | null;
    // Dates covered by approved leave.
    leaveDates: Set<string>;
};

export type StatsRecord = {
    employeeId: string;
    workDate: string;
    clockInAt: Date;
    clockOutAt: Date | null;
    scheduledStartAt: Date | null;
    scheduledEndAt: Date | null;
    scheduledBreakMinutes: number | null;
    lateGraceMinutes: number | null;
    locationCheck?: AttendanceLocationCheck | null;
};

export type AttendanceTotals = {
    // Working days the employees were expected in (not holidays, days off, leave or before joining).
    expectedDays: number;
    presentDays: number;
    onTimeDays: number;
    lateDays: number;
    earlyLeaveDays: number;
    absentDays: number;
    leaveDays: number;
    // Attendance on holidays and non-working days; not counted in expectedDays.
    offDayWorkDays: number;
    // Days (any day) with a clock-in flagged outside the employee's approved places.
    outsideLocationDays: number;
    averageLateMinutes: number;
    workedMinutes: number;
    // Percentages of expectedDays / presentDays, rounded; null when there is nothing to divide.
    attendanceRate: number | null;
    punctualityRate: number | null;
};

export type TrendPoint = { date: string; expected: number; present: number; onTime: number; late: number; absent: number };

type Accumulator = Omit<AttendanceTotals, 'averageLateMinutes' | 'attendanceRate' | 'punctualityRate'> & { lateMinutes: number };

function emptyAccumulator(): Accumulator {
    return {
        expectedDays: 0,
        presentDays: 0,
        onTimeDays: 0,
        lateDays: 0,
        earlyLeaveDays: 0,
        absentDays: 0,
        leaveDays: 0,
        offDayWorkDays: 0,
        outsideLocationDays: 0,
        workedMinutes: 0,
        lateMinutes: 0,
    };
}

function finish(acc: Accumulator): AttendanceTotals {
    const { lateMinutes, ...rest } = acc;
    return {
        ...rest,
        averageLateMinutes: acc.lateDays ? Math.round(lateMinutes / acc.lateDays) : 0,
        attendanceRate: acc.expectedDays ? Math.round((acc.presentDays / acc.expectedDays) * 100) : null,
        punctualityRate: acc.presentDays ? Math.round((acc.onTimeDays / acc.presentDays) * 100) : null,
    };
}

// Attendance over [from, to], where `to` should already be clamped to today. Today is
// never counted absent: the day isn't over. Absence before an employee joined isn't counted.
export function attendanceStats(
    employees: StatsEmployee[],
    records: StatsRecord[],
    calendar: WorkCalendar,
    from: string,
    to: string,
    today: string,
): { totals: AttendanceTotals; trend: TrendPoint[]; byEmployee: Map<string, AttendanceTotals> } {
    // A day with several clock-in sessions counts once.
    const days = attendanceDays(records);

    const total = emptyAccumulator();
    const perEmployee = new Map<string, Accumulator>();
    const trend: TrendPoint[] = [];
    const dates = to < from ? [] : eachDate(from, to);

    for (const date of dates) {
        const point: TrendPoint = { date, expected: 0, present: 0, onTime: 0, late: 0, absent: 0 };
        const working = calendar.dayType(date) === 'WORKING';

        for (const employee of employees) {
            if (employee.joinedOn && date < employee.joinedOn) continue;
            const acc = perEmployee.get(employee.id) ?? emptyAccumulator();
            perEmployee.set(employee.id, acc);
            const day = days.get(`${employee.id}|${date}`);

            const add = (fn: (a: Accumulator) => void) => {
                fn(acc);
                fn(total);
            };

            if (day) add((a) => (a.workedMinutes += Math.round(day.workedSeconds / 60)));
            if (day?.sessions.some((s) => s.locationCheck === AttendanceLocationCheck.OUTSIDE)) add((a) => a.outsideLocationDays++);

            if (!working) {
                if (day) add((a) => a.offDayWorkDays++);
                continue;
            }
            if (employee.leaveDates.has(date)) {
                add((a) => a.leaveDays++);
                if (day) add((a) => a.offDayWorkDays++);
                continue;
            }
            if (!day) {
                if (date < today) {
                    add((a) => {
                        a.expectedDays++;
                        a.absentDays++;
                    });
                    point.expected++;
                    point.absent++;
                }
                continue;
            }

            add((a) => {
                a.expectedDays++;
                a.presentDays++;
                if (day.lateMinutes > 0) {
                    a.lateDays++;
                    a.lateMinutes += day.lateMinutes;
                } else {
                    a.onTimeDays++;
                }
                if (day.earlyLeaveMinutes > 0) a.earlyLeaveDays++;
            });
            point.expected++;
            point.present++;
            if (day.lateMinutes > 0) point.late++;
            else point.onTime++;
        }
        trend.push(point);
    }

    const byEmployee = new Map<string, AttendanceTotals>();
    for (const [id, acc] of perEmployee) byEmployee.set(id, finish(acc));
    return { totals: finish(total), trend, byEmployee };
}

// Approved leave rows -> per-employee sets of covered dates within [from, to].
export function leaveDateSets(
    leaves: { employeeId: string; startDate: Date; endDate: Date }[],
    from: string,
    to: string,
): Map<string, Set<string>> {
    const sets = new Map<string, Set<string>>();
    for (const leave of leaves) {
        const start = leave.startDate.toISOString().slice(0, 10);
        const end = leave.endDate.toISOString().slice(0, 10);
        const lo = start > from ? start : from;
        const hi = end < to ? end : to;
        if (hi < lo) continue;
        const set = sets.get(leave.employeeId) ?? new Set<string>();
        for (const d of eachDate(lo, hi)) set.add(d);
        sets.set(leave.employeeId, set);
    }
    return sets;
}
