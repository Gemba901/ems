import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { addDays, fromDbDate, toDbDate, weekdayOf, zonedInstant } from './work-date';

// The organization's working pattern. Times are HH:mm in the organization's time zone;
// working days come from LeaveSettings so Leave and Attendance always agree.
export type WorkSchedule = {
    workStartTime: string;
    workEndTime: string;
    lateGraceMinutes: number;
    lunchBreakEnabled: boolean;
    lunchStartTime: string | null;
    lunchEndTime: string | null;
    holidayCountry: string | null;
    observeOnNextWorkingDay: boolean;
    workingDays: number[];
};

export const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5];

export const DEFAULT_SCHEDULE: WorkSchedule = {
    workStartTime: '09:00',
    workEndTime: '17:00',
    lateGraceMinutes: 0,
    lunchBreakEnabled: false,
    lunchStartTime: null,
    lunchEndTime: null,
    holidayCountry: null,
    observeOnNextWorkingDay: true,
    workingDays: DEFAULT_WORKING_DAYS,
};

export type DayType = 'WORKING' | 'NON_WORKING' | 'HOLIDAY';

// Written onto an attendance record at clock-in; all null on a day that was not scheduled.
export type ScheduleSnapshot = {
    scheduledStartAt: Date | null;
    scheduledEndAt: Date | null;
    scheduledBreakMinutes: number | null;
    lateGraceMinutes: number | null;
};

export function minutesOf(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
}

export function breakMinutes(schedule: WorkSchedule): number {
    if (!schedule.lunchBreakEnabled || !schedule.lunchStartTime || !schedule.lunchEndTime) return 0;
    return minutesOf(schedule.lunchEndTime) - minutesOf(schedule.lunchStartTime);
}

// Scheduled working minutes in one day, net of lunch.
export function scheduledMinutes(schedule: WorkSchedule): number {
    return minutesOf(schedule.workEndTime) - minutesOf(schedule.workStartTime) - breakMinutes(schedule);
}

// Days off from active holidays. When observeOnNextWorkingDay is on, a holiday that falls on a
// non-working day is also given on the next working day that isn't already a holiday
// (e.g. a Sunday holiday is observed on Monday; a Sat+Sun pair on Monday and Tuesday).
export function holidayCalendar(
    holidays: { date: string; name: string }[],
    workingDays: number[],
    observeOnNextWorkingDay: boolean,
): Map<string, string> {
    const days = new Map<string, string>();
    const sorted = [...holidays].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    for (const h of sorted) days.set(h.date, days.has(h.date) ? `${days.get(h.date)} / ${h.name}` : h.name);

    const working = new Set(workingDays);
    if (!observeOnNextWorkingDay || working.size === 0) return days;

    for (const h of sorted) {
        if (working.has(weekdayOf(h.date))) continue;
        let d = addDays(h.date, 1);
        for (let i = 0; i < 14 && (!working.has(weekdayOf(d)) || days.has(d)); i++) d = addDays(d, 1);
        if (!days.has(d)) days.set(d, `${h.name} (observed)`);
    }
    return days;
}

export class WorkCalendar {
    private working: Set<number>;

    constructor(
        public schedule: WorkSchedule,
        public holidays: Map<string, string>,
    ) {
        this.working = new Set(schedule.workingDays);
    }

    dayType(date: string): DayType {
        if (this.holidays.has(date)) return 'HOLIDAY';
        return this.working.has(weekdayOf(date)) ? 'WORKING' : 'NON_WORKING';
    }

    holidayName(date: string): string | null {
        return this.holidays.get(date) ?? null;
    }

    snapshotFor(date: string, timeZone: string): ScheduleSnapshot {
        if (this.dayType(date) !== 'WORKING') {
            return { scheduledStartAt: null, scheduledEndAt: null, scheduledBreakMinutes: null, lateGraceMinutes: null };
        }
        return {
            scheduledStartAt: zonedInstant(date, this.schedule.workStartTime, timeZone),
            scheduledEndAt: zonedInstant(date, this.schedule.workEndTime, timeZone),
            scheduledBreakMinutes: breakMinutes(this.schedule),
            lateGraceMinutes: this.schedule.lateGraceMinutes,
        };
    }
}

// Punctuality of one record against the schedule saved on it. Lateness counts from the
// scheduled start, but only once it exceeds the grace period.
export function punctuality(record: {
    clockInAt: Date;
    clockOutAt: Date | null;
    scheduledStartAt: Date | null;
    scheduledEndAt: Date | null;
    lateGraceMinutes: number | null;
}): { scheduled: boolean; lateMinutes: number; earlyLeaveMinutes: number } {
    if (!record.scheduledStartAt || !record.scheduledEndAt) return { scheduled: false, lateMinutes: 0, earlyLeaveMinutes: 0 };

    const late = (record.clockInAt.getTime() - record.scheduledStartAt.getTime()) / 60_000;
    const early = record.clockOutAt ? (record.scheduledEndAt.getTime() - record.clockOutAt.getTime()) / 60_000 : 0;
    return {
        scheduled: true,
        lateMinutes: late > (record.lateGraceMinutes ?? 0) ? Math.ceil(late) : 0,
        earlyLeaveMinutes: early >= 1 ? Math.floor(early) : 0,
    };
}

@Injectable()
export class WorkScheduleService {
    constructor(private prisma: PrismaService) {}

    async getSchedule(organizationId: string): Promise<WorkSchedule> {
        const [settings, leave] = await Promise.all([
            this.prisma.workSettings.findUnique({ where: { organizationId } }),
            this.prisma.leaveSettings.findUnique({ where: { organizationId }, select: { workingDays: true } }),
        ]);
        const workingDays = leave?.workingDays.length ? leave.workingDays : DEFAULT_WORKING_DAYS;
        if (!settings) return { ...DEFAULT_SCHEDULE, workingDays };
        return {
            workStartTime: settings.workStartTime,
            workEndTime: settings.workEndTime,
            lateGraceMinutes: settings.lateGraceMinutes,
            lunchBreakEnabled: settings.lunchBreakEnabled,
            lunchStartTime: settings.lunchStartTime,
            lunchEndTime: settings.lunchEndTime,
            holidayCountry: settings.holidayCountry,
            observeOnNextWorkingDay: settings.observeOnNextWorkingDay,
            workingDays: [...workingDays].sort(),
        };
    }

    // Holidays are read from two weeks earlier so one falling just before `from` can still
    // be observed inside the range.
    async calendar(organizationId: string, from: string, to: string): Promise<WorkCalendar> {
        const schedule = await this.getSchedule(organizationId);
        const rows = await this.prisma.workHoliday.findMany({
            where: { organizationId, isActive: true, date: { gte: toDbDate(addDays(from, -14)), lte: toDbDate(to) } },
            select: { date: true, name: true },
        });
        const holidays = holidayCalendar(
            rows.map((r) => ({ date: fromDbDate(r.date), name: r.name })),
            schedule.workingDays,
            schedule.observeOnNextWorkingDay,
        );
        return new WorkCalendar(schedule, holidays);
    }
}
