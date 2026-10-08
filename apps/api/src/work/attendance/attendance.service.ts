import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AttendanceLocationCheck, AttendanceLocationStatus, Prisma, WorkPlaceKind } from 'db';
import type { AccessTokenPayload } from 'src/auth/access-token-payload';
import { PrismaService } from 'src/prisma/prisma.service';
import { Page, pageArgs } from '../dto/common.dto';
import {
    AttendanceRangeQueryDto,
    ClockInDto,
    ClockOutDto,
    CorrectAttendanceDto,
    TeamAttendanceQueryDto,
} from '../dto/attendance.dto';
import { LocationsService } from '../locations/locations.service';
import { WorkAccessService, WorkActor } from '../work-access.service';
import { fromDbDate, localDateIn, monthRange, toDbDate } from '../work-date';
import { WorkErrorCode, isUniqueViolation, workBadRequest, workConflict } from '../work-errors';
import { EMPLOYEE_SUMMARY_SELECT, EmployeeSummary, toEmployeeSummary } from '../work-people';
import { checkLocation } from '../work-location';
import { DayType, WorkScheduleService, punctuality } from '../work-schedule';

// Everything a list or status response may show. Coordinates (the employee's and the
// checked place's) and the missing-location reason are deliberately absent; they are only
// returned by the location endpoint. The check result, place name and distance are shown.
const RECORD_SELECT = {
    id: true,
    employeeId: true,
    workDate: true,
    timezoneAtClockIn: true,
    clockInAt: true,
    clockOutAt: true,
    locationStatus: true,
    version: true,
    lastCorrectedAt: true,
    scheduledStartAt: true,
    scheduledEndAt: true,
    lateGraceMinutes: true,
    locationCheck: true,
    checkedPlaceKind: true,
    checkedPlaceName: true,
    distanceMeters: true,
    // Not shown; lets a retry recognise the record its own first attempt created.
    clockInRequestId: true,
} satisfies Prisma.AttendanceRecordSelect;

type RecordRow = Prisma.AttendanceRecordGetPayload<{ select: typeof RECORD_SELECT }>;

export type AttendanceView = {
    id: string;
    employeeId: string;
    workDate: string;
    timezoneAtClockIn: string;
    clockInAt: Date;
    clockOutAt: Date | null;
    isOpen: boolean;
    durationSeconds: number | null;
    locationStatus: AttendanceLocationStatus;
    edited: boolean;
    lastCorrectedAt: Date | null;
    version: number;
    // Against the schedule saved at clock-in; scheduledStartAt is null on unscheduled days.
    scheduledStartAt: Date | null;
    scheduledEndAt: Date | null;
    lateMinutes: number;
    earlyLeaveMinutes: number;
    // Null on records from before location checks existed.
    locationCheck: AttendanceLocationCheck | null;
    checkedPlaceKind: WorkPlaceKind | null;
    checkedPlaceName: string | null;
    distanceMeters: number | null;
};

export type AttendanceStatusView = {
    serverNow: Date;
    today: string;
    timeZone: string;
    openRecord: AttendanceView | null;
    todayRecord: AttendanceView | null;
    todaySchedule: {
        dayType: DayType;
        holidayName: string | null;
        startsAt: Date | null;
        endsAt: Date | null;
        lateAfter: Date | null;
    };
};

function toView(record: RecordRow): AttendanceView {
    const { lateMinutes, earlyLeaveMinutes } = punctuality(record);
    return {
        id: record.id,
        employeeId: record.employeeId,
        workDate: fromDbDate(record.workDate),
        timezoneAtClockIn: record.timezoneAtClockIn,
        clockInAt: record.clockInAt,
        clockOutAt: record.clockOutAt,
        isOpen: record.clockOutAt === null,
        durationSeconds: record.clockOutAt
            ? Math.floor((record.clockOutAt.getTime() - record.clockInAt.getTime()) / 1000)
            : null,
        locationStatus: record.locationStatus,
        edited: record.lastCorrectedAt !== null,
        lastCorrectedAt: record.lastCorrectedAt,
        version: record.version,
        scheduledStartAt: record.scheduledStartAt,
        scheduledEndAt: record.scheduledEndAt,
        lateMinutes,
        earlyLeaveMinutes,
        locationCheck: record.locationCheck,
        checkedPlaceKind: record.checkedPlaceKind,
        checkedPlaceName: record.checkedPlaceName,
        distanceMeters: record.distanceMeters,
    };
}

@Injectable()
export class AttendanceService {
    constructor(
        private prisma: PrismaService,
        private access: WorkAccessService,
        private schedules: WorkScheduleService,
        private locations: LocationsService,
    ) {}

    // Today is the organization-local date; an open record from an earlier day is reported too,
    // since nothing closes records automatically at midnight.
    async status(user: AccessTokenPayload): Promise<AttendanceStatusView> {
        const actor = await this.access.resolveActor(user);
        const serverNow = new Date();
        const today = localDateIn(serverNow, actor.timeZone);

        const [openRecord, todayRecord, calendar] = await Promise.all([
            this.findOpen(actor),
            this.findForDay(actor, today),
            this.schedules.calendar(actor.organizationId, today, today),
        ]);
        const plan = calendar.snapshotFor(today, actor.timeZone);
        return {
            serverNow,
            today,
            timeZone: actor.timeZone,
            openRecord: openRecord && toView(openRecord),
            todayRecord: todayRecord && toView(todayRecord),
            todaySchedule: {
                dayType: calendar.dayType(today),
                holidayName: calendar.holidayName(today),
                startsAt: plan.scheduledStartAt,
                endsAt: plan.scheduledEndAt,
                lateAfter: plan.scheduledStartAt && new Date(plan.scheduledStartAt.getTime() + plan.lateGraceMinutes! * 60_000),
            },
        };
    }

    async listMine(user: AccessTokenPayload, query: AttendanceRangeQueryDto): Promise<Page<AttendanceView>> {
        const actor = await this.access.resolveActor(user);
        const where: Prisma.AttendanceRecordWhereInput = {
            organizationId: actor.organizationId,
            employeeId: actor.employeeId,
            workDate: this.dateRange(actor, query),
        };

        const [records, total] = await this.prisma.$transaction([
            this.prisma.attendanceRecord.findMany({
                where,
                select: RECORD_SELECT,
                orderBy: [{ workDate: 'desc' }, { id: 'asc' }],
                ...pageArgs(query),
            }),
            this.prisma.attendanceRecord.count({ where }),
        ]);
        return { items: records.map(toView), page: query.page, pageSize: query.pageSize, total };
    }

    // Idempotent on requestId: a retry returns the record the first attempt created.
    async clockIn(user: AccessTokenPayload, dto: ClockInDto): Promise<AttendanceView> {
        const actor = await this.access.resolveActor(user);
        const location = this.locationFields(dto);

        const now = new Date();
        const workDate = localDateIn(now, actor.timeZone);
        const existing = await this.resolveClockInConflict(actor, dto.requestId, workDate);
        if (existing) return toView(existing);

        // Snapshot today's schedule so later settings changes never rewrite this record's punctuality.
        const calendar = await this.schedules.calendar(actor.organizationId, workDate, workDate);
        const schedule = calendar.snapshotFor(workDate, actor.timeZone);
        // Checked once against the places allowed now and saved; an OUTSIDE result is allowed but flagged.
        const { arrangement, places } = await this.locations.placesFor(actor.organizationId, actor.employeeId);
        const check = checkLocation(dto.location ?? null, places);

        try {
            const record = await this.prisma.attendanceRecord.create({
                data: {
                    organizationId: actor.organizationId,
                    employeeId: actor.employeeId,
                    workDate: toDbDate(workDate),
                    timezoneAtClockIn: actor.timeZone,
                    clockInAt: now,
                    clockInRequestId: dto.requestId,
                    ...schedule,
                    ...location,
                    ...check,
                    arrangementAtClockIn: arrangement,
                },
                select: RECORD_SELECT,
            });
            return toView(record);
        } catch (error) {
            // A concurrent request won the race; answer as if we had arrived second.
            if (!isUniqueViolation(error)) throw error;
            const winner = await this.resolveClockInConflict(actor, dto.requestId, workDate);
            if (winner) return toView(winner);
            throw error;
        }
    }

    // Only the record's owner can clock out; repeating it returns the closed record unchanged.
    async clockOut(user: AccessTokenPayload, recordId: string, dto: ClockOutDto): Promise<AttendanceView> {
        const actor = await this.access.resolveActor(user);
        const where = { id: recordId, organizationId: actor.organizationId, employeeId: actor.employeeId };

        const record = await this.prisma.attendanceRecord.findFirst({ where, select: RECORD_SELECT });
        if (!record) throw new NotFoundException('Attendance record not found');
        if (record.clockOutAt) return toView(record);

        await this.prisma.attendanceRecord.updateMany({
            where: { ...where, clockOutAt: null },
            data: { clockOutAt: new Date(), clockOutRequestId: dto.requestId, version: { increment: 1 } },
        });
        const closed = await this.prisma.attendanceRecord.findFirstOrThrow({ where, select: RECORD_SELECT });
        return toView(closed);
    }

    // HR, management and admins see everyone; a reporting manager sees their direct reports.
    // Project roles never grant this.
    async listTeam(
        user: AccessTokenPayload,
        query: TeamAttendanceQueryDto,
    ): Promise<Page<AttendanceView & { employee: EmployeeSummary }>> {
        const actor = await this.access.resolveActor(user);
        const employeeFilter = await this.teamFilter(actor, query.employeeId);

        const where: Prisma.AttendanceRecordWhereInput = {
            organizationId: actor.organizationId,
            workDate: this.dateRange(actor, query),
            employeeId: employeeFilter,
        };
        const [records, total] = await this.prisma.$transaction([
            this.prisma.attendanceRecord.findMany({
                where,
                select: { ...RECORD_SELECT, employee: { select: EMPLOYEE_SUMMARY_SELECT } },
                orderBy: [{ workDate: 'desc' }, { clockInAt: 'asc' }, { id: 'asc' }],
                ...pageArgs(query),
            }),
            this.prisma.attendanceRecord.count({ where }),
        ]);
        const items = records.map((r) => ({ ...toView(r), employee: toEmployeeSummary(r.employee) }));
        return { items, page: query.page, pageSize: query.pageSize, total };
    }

    // The only response that carries coordinates: the record's owner, their reporting manager
    // or an attendance manager. Includes the place it was checked against, for the map.
    async location(user: AccessTokenPayload, recordId: string) {
        const actor = await this.access.resolveActor(user);
        const record = await this.prisma.attendanceRecord.findFirst({
            where: await this.visibleRecord(actor, recordId),
            select: {
                id: true,
                locationStatus: true,
                latitude: true,
                longitude: true,
                accuracyMeters: true,
                locationCapturedAt: true,
                locationMissingReason: true,
                locationCheck: true,
                arrangementAtClockIn: true,
                checkedPlaceKind: true,
                checkedPlaceName: true,
                checkedPlaceLatitude: true,
                checkedPlaceLongitude: true,
                checkedPlaceRadiusMeters: true,
                distanceMeters: true,
            },
        });
        if (!record) throw new NotFoundException('Attendance record not found');

        const place =
            record.checkedPlaceKind && record.checkedPlaceName && record.checkedPlaceLatitude !== null && record.checkedPlaceLongitude !== null && record.checkedPlaceRadiusMeters !== null
                ? {
                      kind: record.checkedPlaceKind,
                      name: record.checkedPlaceName,
                      latitude: record.checkedPlaceLatitude,
                      longitude: record.checkedPlaceLongitude,
                      radiusMeters: record.checkedPlaceRadiusMeters,
                  }
                : null;
        return {
            recordId: record.id,
            locationStatus: record.locationStatus,
            latitude: record.latitude,
            longitude: record.longitude,
            accuracyMeters: record.accuracyMeters,
            capturedAt: record.locationCapturedAt,
            missingReason: record.locationMissingReason,
            locationCheck: record.locationCheck,
            arrangementAtClockIn: record.arrangementAtClockIn,
            checkedPlace: place,
            distanceMeters: record.distanceMeters,
        };
    }

    async listCorrections(user: AccessTokenPayload, recordId: string) {
        const actor = await this.access.resolveActor(user);
        const record = await this.prisma.attendanceRecord.findFirst({
            where: await this.visibleRecord(actor, recordId),
            select: { id: true },
        });
        if (!record) throw new NotFoundException('Attendance record not found');

        const corrections = await this.prisma.attendanceCorrection.findMany({
            where: { attendanceRecordId: record.id, organizationId: actor.organizationId },
            select: {
                id: true,
                previousClockInAt: true,
                previousClockOutAt: true,
                correctedClockInAt: true,
                correctedClockOutAt: true,
                reason: true,
                createdAt: true,
                actor: { select: EMPLOYEE_SUMMARY_SELECT },
            },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        });
        return corrections.map(({ actor: correctedBy, ...c }) => ({ ...c, correctedBy: toEmployeeSummary(correctedBy) }));
    }

    // Changes only the times; the employee, work date and location stay as recorded.
    // Every accepted correction appends a history row in the same transaction.
    async correct(user: AccessTokenPayload, recordId: string, dto: CorrectAttendanceDto): Promise<AttendanceView> {
        const actor = await this.access.resolveActor(user);
        this.access.assertAttendanceManager(actor);
        if (dto.clockInAt === undefined && dto.clockOutAt === undefined) {
            throw this.invalidCorrection('Provide a new clock-in or clock-out time');
        }

        return this.prisma.$transaction(async (tx) => {
            const record = await tx.attendanceRecord.findFirst({
                where: { id: recordId, organizationId: actor.organizationId },
                select: { ...RECORD_SELECT, organizationId: true },
            });
            if (!record) throw new NotFoundException('Attendance record not found');

            // Serializes corrections for one employee so two can't create an overlap together.
            await tx.$executeRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${record.employeeId}))) AS l`;

            if (record.version !== dto.expectedVersion) throw this.versionConflict(record.version);

            const now = new Date();
            const clockInAt = dto.clockInAt !== undefined ? new Date(dto.clockInAt) : record.clockInAt;
            const clockOutAt = dto.clockOutAt !== undefined ? new Date(dto.clockOutAt) : record.clockOutAt;

            if (clockInAt > now || (clockOutAt && clockOutAt > now)) {
                throw this.invalidCorrection('Corrected times cannot be in the future');
            }
            if (localDateIn(clockInAt, record.timezoneAtClockIn) !== fromDbDate(record.workDate)) {
                throw this.invalidCorrection('The clock-in time must stay on the original work date', {
                    workDate: fromDbDate(record.workDate),
                    timeZone: record.timezoneAtClockIn,
                });
            }
            if (clockOutAt && clockOutAt < clockInAt) {
                throw this.invalidCorrection('Clock-out cannot be before clock-in');
            }
            if (clockInAt.getTime() === record.clockInAt.getTime() && clockOutAt?.getTime() === record.clockOutAt?.getTime()) {
                throw this.invalidCorrection('The corrected times are the same as the current ones');
            }

            const overlapping = await tx.attendanceRecord.findFirst({
                where: {
                    organizationId: record.organizationId,
                    employeeId: record.employeeId,
                    id: { not: record.id },
                    ...(clockOutAt && { clockInAt: { lt: clockOutAt } }),
                    OR: [{ clockOutAt: null }, { clockOutAt: { gt: clockInAt } }],
                },
                select: { id: true, workDate: true },
            });
            if (overlapping) {
                throw workConflict(WorkErrorCode.ATTENDANCE_OVERLAP, 'The corrected times overlap another attendance record', {
                    recordId: overlapping.id,
                    workDate: fromDbDate(overlapping.workDate),
                });
            }

            const { count } = await tx.attendanceRecord.updateMany({
                where: { id: record.id, version: dto.expectedVersion },
                data: { clockInAt, clockOutAt, version: { increment: 1 }, lastCorrectedAt: now },
            });
            if (count === 0) throw this.versionConflict();

            await tx.attendanceCorrection.create({
                data: {
                    organizationId: record.organizationId,
                    attendanceRecordId: record.id,
                    actorId: actor.employeeId,
                    previousClockInAt: record.clockInAt,
                    previousClockOutAt: record.clockOutAt,
                    correctedClockInAt: clockInAt,
                    correctedClockOutAt: clockOutAt,
                    reason: dto.reason,
                },
            });

            const updated = await tx.attendanceRecord.findUniqueOrThrow({ where: { id: record.id }, select: RECORD_SELECT });
            return toView(updated);
        });
    }

    // Returns the record a retry should get back, or throws if the employee can't clock in.
    private async resolveClockInConflict(actor: WorkActor, requestId: string, workDate: string): Promise<RecordRow | null> {
        const replay = await this.prisma.attendanceRecord.findUnique({
            where: {
                organizationId_employeeId_clockInRequestId: {
                    organizationId: actor.organizationId,
                    employeeId: actor.employeeId,
                    clockInRequestId: requestId,
                },
            },
            select: RECORD_SELECT,
        });
        if (replay) return replay;

        // A concurrent first attempt may have committed since the lookup above.
        const open = await this.findOpen(actor);
        if (open?.clockInRequestId === requestId) return open;
        if (open) {
            throw workConflict(WorkErrorCode.ATTENDANCE_ALREADY_OPEN, 'You are already clocked in; clock out first', {
                recordId: open.id,
                workDate: fromDbDate(open.workDate),
            });
        }
        const today = await this.findForDay(actor, workDate);
        if (today?.clockInRequestId === requestId) return today;
        if (today) {
            throw workConflict(WorkErrorCode.ATTENDANCE_DAY_COMPLETED, 'You have already clocked in and out today', {
                recordId: today.id,
            });
        }
        return null;
    }

    private findOpen(actor: WorkActor): Promise<RecordRow | null> {
        return this.prisma.attendanceRecord.findFirst({
            where: { organizationId: actor.organizationId, employeeId: actor.employeeId, clockOutAt: null },
            select: RECORD_SELECT,
        });
    }

    private findForDay(actor: WorkActor, workDate: string): Promise<RecordRow | null> {
        return this.prisma.attendanceRecord.findUnique({
            where: {
                organizationId_employeeId_workDate: {
                    organizationId: actor.organizationId,
                    employeeId: actor.employeeId,
                    workDate: toDbDate(workDate),
                },
            },
            select: RECORD_SELECT,
        });
    }

    // Owners see their own records, reporting managers their direct reports', and
    // attendance managers everyone's in the organization.
    private async visibleRecord(actor: WorkActor, recordId: string): Promise<Prisma.AttendanceRecordWhereInput> {
        if (this.access.canManageAttendance(actor)) return { id: recordId, organizationId: actor.organizationId };
        return {
            id: recordId,
            organizationId: actor.organizationId,
            OR: [{ employeeId: actor.employeeId }, { employee: { reportingManagerId: actor.employeeId } }],
        };
    }

    // Which employees a team listing may include, or a 403 when the caller manages nobody.
    private async teamFilter(actor: WorkActor, employeeId?: string): Promise<Prisma.StringFilter | string | undefined> {
        if (this.access.canManageAttendance(actor)) return employeeId;

        const reports = await this.access.directReportIds(actor);
        if (reports.length === 0) throw new ForbiddenException('You cannot view team attendance');
        if (employeeId) {
            if (!reports.includes(employeeId)) throw new NotFoundException('Employee not found in your team');
            return employeeId;
        }
        return { in: reports };
    }

    private locationFields(dto: ClockInDto) {
        if (dto.locationStatus === AttendanceLocationStatus.CAPTURED) {
            if (!dto.location || dto.locationMissingReason !== undefined) {
                throw new BadRequestException('A captured location needs location and no locationMissingReason');
            }
            return {
                locationStatus: AttendanceLocationStatus.CAPTURED,
                latitude: dto.location.latitude,
                longitude: dto.location.longitude,
                accuracyMeters: dto.location.accuracyMeters,
                locationCapturedAt: new Date(dto.location.capturedAt),
            };
        }
        if (!dto.locationMissingReason || dto.location !== undefined) {
            throw new BadRequestException('A missing location needs locationMissingReason and no location');
        }
        return { locationStatus: AttendanceLocationStatus.MISSING, locationMissingReason: dto.locationMissingReason };
    }

    private dateRange(actor: WorkActor, query: AttendanceRangeQueryDto): Prisma.DateTimeFilter {
        const month = monthRange(localDateIn(new Date(), actor.timeZone));
        const from = query.from ?? (query.to ? monthRange(query.to).from : month.from);
        const to = query.to ?? (query.from ? monthRange(query.from).to : month.to);
        if (to < from) throw workBadRequest(WorkErrorCode.DATE_RANGE_INVALID, '`to` cannot be before `from`');
        return { gte: toDbDate(from), lte: toDbDate(to) };
    }

    private invalidCorrection(message: string, details?: Record<string, unknown>) {
        return workBadRequest(WorkErrorCode.ATTENDANCE_CORRECTION_INVALID, message, details);
    }

    private versionConflict(currentVersion?: number) {
        return workConflict(
            WorkErrorCode.VERSION_CONFLICT,
            'This record was changed by someone else; reload it and try again',
            currentVersion === undefined ? undefined : { currentVersion },
        );
    }
}
