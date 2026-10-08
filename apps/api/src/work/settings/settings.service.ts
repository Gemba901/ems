import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import Holidays from 'date-holidays';
import { Prisma, WorkHolidaySource } from 'db';
import type { AccessTokenPayload } from 'src/auth/access-token-payload';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateHolidayDto, HolidayQueryDto, UpdateHolidayDto, UpdateWorkSettingsDto } from '../dto/settings.dto';
import { WorkAccessService, WorkActor } from '../work-access.service';
import { WORK_SETTINGS_ROLES } from '../work-access.policy';
import { fromDbDate, localDateIn, toDbDate, weekdayOf } from '../work-date';
import { WorkErrorCode, isUniqueViolation, workBadRequest, workConflict } from '../work-errors';
import { WorkSchedule, WorkScheduleService, minutesOf, scheduledMinutes } from '../work-schedule';

export type WorkSettingsView = WorkSchedule & {
    timeZone: string;
    scheduledMinutesPerDay: number;
    canEdit: boolean;
};

export type HolidayView = {
    id: string;
    date: string;
    weekday: number;
    name: string;
    source: WorkHolidaySource;
    isActive: boolean;
};

export type HolidayYearView = {
    year: number;
    country: string | null;
    items: HolidayView[];
    // Extra days off created by the "observe on next working day" rule.
    observedDays: { date: string; name: string }[];
};

const HOLIDAY_SELECT = { id: true, date: true, name: true, source: true, isActive: true } satisfies Prisma.WorkHolidaySelect;

function toHolidayView(row: Prisma.WorkHolidayGetPayload<{ select: typeof HOLIDAY_SELECT }>): HolidayView {
    const date = fromDbDate(row.date);
    return { id: row.id, date, weekday: weekdayOf(date), name: row.name, source: row.source, isActive: row.isActive };
}

// Public holidays (type "public" only; bank, school and observance days are left out) for a
// country and year, keyed by date. The library's own substitute days are skipped: the
// organization's observeOnNextWorkingDay rule decides that, against its own working days.
export function publicHolidaysFor(country: string, year: number): Map<string, string> {
    const calendar = new Holidays(country, { languages: ['en'], types: ['public'] });
    const days = new Map<string, string>();
    for (const h of calendar.getHolidays(year, 'en') || []) {
        if (h.type !== 'public' || h.substitute) continue;
        const date = h.date.slice(0, 10);
        days.set(date, days.has(date) ? `${days.get(date)} / ${h.name}` : h.name);
    }
    return days;
}

export function isSupportedCountry(country: string): boolean {
    return Object.prototype.hasOwnProperty.call(new Holidays().getCountries('en'), country);
}

@Injectable()
export class SettingsService {
    constructor(
        private prisma: PrismaService,
        private access: WorkAccessService,
        private schedules: WorkScheduleService,
    ) {}

    async get(user: AccessTokenPayload): Promise<WorkSettingsView> {
        const actor = await this.access.resolveActor(user);
        return this.view(actor);
    }

    // Merges the patch with the current settings and checks the result as a whole.
    // Changing the country re-imports public holidays from this year on.
    async update(user: AccessTokenPayload, dto: UpdateWorkSettingsDto): Promise<WorkSettingsView> {
        const actor = await this.access.resolveActor(user);
        this.assertCanEdit(actor);

        const current = await this.schedules.getSchedule(actor.organizationId);
        const next: WorkSchedule = {
            ...current,
            ...Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined)),
        };
        this.assertValid(next);
        if (next.holidayCountry && !isSupportedCountry(next.holidayCountry)) {
            throw workBadRequest(WorkErrorCode.HOLIDAY_COUNTRY_UNSUPPORTED, 'Public holidays are not available for that country');
        }

        const data = {
            workStartTime: next.workStartTime,
            workEndTime: next.workEndTime,
            lateGraceMinutes: next.lateGraceMinutes,
            lunchBreakEnabled: next.lunchBreakEnabled,
            lunchStartTime: next.lunchStartTime,
            lunchEndTime: next.lunchEndTime,
            holidayCountry: next.holidayCountry,
            observeOnNextWorkingDay: next.observeOnNextWorkingDay,
        };
        const countryChanged = next.holidayCountry !== current.holidayCountry;
        const thisYear = Number(localDateIn(new Date(), actor.timeZone).slice(0, 4));

        await this.prisma.$transaction(async (tx) => {
            await tx.workSettings.upsert({
                where: { organizationId: actor.organizationId },
                create: { organizationId: actor.organizationId, ...data },
                update: data,
            });
            if (dto.workingDays) {
                await tx.leaveSettings.upsert({
                    where: { organizationId: actor.organizationId },
                    create: { organizationId: actor.organizationId, workingDays: dto.workingDays },
                    update: { workingDays: dto.workingDays },
                });
            }
            // Past public holidays stay: they were the days off at the time.
            if (countryChanged) {
                await tx.workHoliday.deleteMany({
                    where: {
                        organizationId: actor.organizationId,
                        source: WorkHolidaySource.PUBLIC,
                        date: { gte: toDbDate(`${thisYear}-01-01`) },
                    },
                });
                if (next.holidayCountry) {
                    for (const year of [thisYear, thisYear + 1]) {
                        await this.importYear(tx, actor.organizationId, next.holidayCountry, year);
                    }
                }
            }
        });

        return this.view(actor);
    }

    countries(): { code: string; name: string }[] {
        const countries = new Holidays().getCountries('en') as Record<string, string>;
        return Object.entries(countries)
            .map(([code, name]) => ({ code, name }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    async listHolidays(user: AccessTokenPayload, query: HolidayQueryDto): Promise<HolidayYearView> {
        const actor = await this.access.resolveActor(user);
        const year = query.year ?? Number(localDateIn(new Date(), actor.timeZone).slice(0, 4));
        const from = `${year}-01-01`;
        const to = `${year}-12-31`;

        const [rows, calendar] = await Promise.all([
            this.prisma.workHoliday.findMany({
                where: { organizationId: actor.organizationId, date: { gte: toDbDate(from), lte: toDbDate(to) } },
                select: HOLIDAY_SELECT,
                orderBy: [{ date: 'asc' }, { source: 'asc' }],
            }),
            this.schedules.calendar(actor.organizationId, from, to),
        ]);
        const items = rows.map(toHolidayView);
        const holidayDates = new Set(items.filter((h) => h.isActive).map((h) => h.date));
        const observedDays = [...calendar.holidays.entries()]
            .filter(([date]) => date >= from && date <= to && !holidayDates.has(date))
            .map(([date, name]) => ({ date, name }))
            .sort((a, b) => (a.date < b.date ? -1 : 1));

        return { year, country: calendar.schedule.holidayCountry, items, observedDays };
    }

    async createHoliday(user: AccessTokenPayload, dto: CreateHolidayDto): Promise<HolidayView> {
        const actor = await this.access.resolveActor(user);
        this.assertCanEdit(actor);
        try {
            const row = await this.prisma.workHoliday.create({
                data: {
                    organizationId: actor.organizationId,
                    date: toDbDate(dto.date),
                    name: dto.name,
                    source: WorkHolidaySource.COMPANY,
                },
                select: HOLIDAY_SELECT,
            });
            return toHolidayView(row);
        } catch (error) {
            if (isUniqueViolation(error)) throw this.holidayExists();
            throw error;
        }
    }

    async updateHoliday(user: AccessTokenPayload, holidayId: string, dto: UpdateHolidayDto): Promise<HolidayView> {
        const actor = await this.access.resolveActor(user);
        this.assertCanEdit(actor);
        const holiday = await this.findHoliday(actor, holidayId);
        if (dto.date !== undefined && holiday.source === WorkHolidaySource.PUBLIC && dto.date !== fromDbDate(holiday.date)) {
            throw workBadRequest(WorkErrorCode.PUBLIC_HOLIDAY_LOCKED, 'A public holiday’s date cannot change; add a company holiday instead');
        }
        try {
            const row = await this.prisma.workHoliday.update({
                where: { id: holiday.id },
                data: {
                    ...(dto.date !== undefined && { date: toDbDate(dto.date) }),
                    ...(dto.name !== undefined && { name: dto.name }),
                    ...(dto.isActive !== undefined && { isActive: dto.isActive }),
                },
                select: HOLIDAY_SELECT,
            });
            return toHolidayView(row);
        } catch (error) {
            if (isUniqueViolation(error)) throw this.holidayExists();
            throw error;
        }
    }

    // Public holidays are switched off rather than deleted so a re-import can't bring them back.
    async deleteHoliday(user: AccessTokenPayload, holidayId: string): Promise<{ id: string }> {
        const actor = await this.access.resolveActor(user);
        this.assertCanEdit(actor);
        const holiday = await this.findHoliday(actor, holidayId);
        if (holiday.source === WorkHolidaySource.PUBLIC) {
            throw workBadRequest(WorkErrorCode.PUBLIC_HOLIDAY_LOCKED, 'Public holidays can be switched off but not deleted');
        }
        await this.prisma.workHoliday.delete({ where: { id: holiday.id } });
        return { id: holiday.id };
    }

    async importHolidays(user: AccessTokenPayload, year: number): Promise<HolidayYearView & { added: number }> {
        const actor = await this.access.resolveActor(user);
        this.assertCanEdit(actor);
        const { holidayCountry } = await this.schedules.getSchedule(actor.organizationId);
        if (!holidayCountry) {
            throw workBadRequest(WorkErrorCode.HOLIDAY_COUNTRY_MISSING, 'Choose a public holiday calendar in the settings first');
        }
        const added = await this.prisma.$transaction((tx) => this.importYear(tx, actor.organizationId, holidayCountry, year));
        return { ...(await this.listHolidays(user, { year })), added };
    }

    // Adds missing public holidays and refreshes names; leaves isActive as the company set it.
    private async importYear(tx: Prisma.TransactionClient, organizationId: string, country: string, year: number): Promise<number> {
        const days = publicHolidaysFor(country, year);
        const existing = await tx.workHoliday.findMany({
            where: {
                organizationId,
                source: WorkHolidaySource.PUBLIC,
                date: { gte: toDbDate(`${year}-01-01`), lte: toDbDate(`${year}-12-31`) },
            },
            select: { id: true, date: true, name: true },
        });
        const byDate = new Map(existing.map((h) => [fromDbDate(h.date), h]));

        let added = 0;
        for (const [date, name] of days) {
            const row = byDate.get(date);
            if (!row) {
                await tx.workHoliday.create({
                    data: { organizationId, date: toDbDate(date), name, source: WorkHolidaySource.PUBLIC },
                });
                added++;
            } else if (row.name !== name) {
                await tx.workHoliday.update({ where: { id: row.id }, data: { name } });
            }
        }
        return added;
    }

    private async view(actor: WorkActor): Promise<WorkSettingsView> {
        const schedule = await this.schedules.getSchedule(actor.organizationId);
        return {
            ...schedule,
            timeZone: actor.timeZone,
            scheduledMinutesPerDay: scheduledMinutes(schedule),
            canEdit: WORK_SETTINGS_ROLES.includes(actor.role),
        };
    }

    private async findHoliday(actor: WorkActor, holidayId: string) {
        const holiday = await this.prisma.workHoliday.findFirst({
            where: { id: holidayId, organizationId: actor.organizationId },
            select: { id: true, date: true, source: true },
        });
        if (!holiday) throw new NotFoundException('Holiday not found');
        return holiday;
    }

    private assertCanEdit(actor: WorkActor): void {
        if (!WORK_SETTINGS_ROLES.includes(actor.role)) throw new ForbiddenException('You cannot change work settings');
    }

    private assertValid(s: WorkSchedule): void {
        const invalid = (message: string) => workBadRequest(WorkErrorCode.SETTINGS_INVALID, message);
        if (minutesOf(s.workStartTime) >= minutesOf(s.workEndTime)) {
            throw invalid('The working day must end after it starts');
        }
        if (s.lunchBreakEnabled) {
            if (!s.lunchStartTime || !s.lunchEndTime) throw invalid('Set a start and end time for the lunch break');
            const [ls, le] = [minutesOf(s.lunchStartTime), minutesOf(s.lunchEndTime)];
            if (ls >= le) throw invalid('The lunch break must end after it starts');
            if (ls < minutesOf(s.workStartTime) || le > minutesOf(s.workEndTime)) {
                throw invalid('The lunch break must fall within working hours');
            }
        }
        if (s.workingDays.length === 0) throw invalid('Choose at least one working day');
    }

    private holidayExists() {
        return workConflict(WorkErrorCode.HOLIDAY_EXISTS, 'There is already a company holiday on that date');
    }
}
