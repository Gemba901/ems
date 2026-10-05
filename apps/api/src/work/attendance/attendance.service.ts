import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AttendanceLocationStatus, Prisma } from 'db';
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
import { WorkAccessService, WorkActor } from '../work-access.service';
import { fromDbDate, localDateIn, monthRange, toDbDate } from '../work-date';
import { WorkErrorCode, isUniqueViolation, workBadRequest, workConflict } from '../work-errors';
import { EMPLOYEE_SUMMARY_SELECT, EmployeeSummary, toEmployeeSummary } from '../work-people';

// Everything a list or status response may show. Coordinates and the missing-location
// reason are deliberately absent; they are only returned by the location endpoint.
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
};

export type AttendanceStatusView = {
    serverNow: Date;
    today: string;
    timeZone: string;
    openRecord: AttendanceView | null;
    todayRecord: AttendanceView | null;
};

function toView(record: RecordRow): AttendanceView {
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
    };
}

@Injectable()
export class AttendanceService {
    constructor(private prisma: PrismaService, private access: WorkAccessService) {}

    // Today is the organization-local date; an open record from an earlier day is reported too,
    // since nothing closes records automatically at midnight.
    async status(user: AccessTokenPayload): Promise<AttendanceStatusView> {
        const actor = await this.access.resolveActor(user);
        const serverNow = new Date();
        const today = localDateIn(serverNow, actor.timeZone);

        const [openRecord, todayRecord] = await Promise.all([
            this.findOpen(actor),
            this.findForDay(actor, today),
        ]);
        return {
            serverNow,
            today,
            timeZone: actor.timeZone,
            openRecord: openRecord && toView(openRecord),
            todayRecord: todayRecord && toView(todayRecord),
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

        try {
            const record = await this.prisma.attendanceRecord.create({
                data: {
                    organizationId: actor.organizationId,
                    employeeId: actor.employeeId,
                    workDate: toDbDate(workDate),
                    timezoneAtClockIn: actor.timeZone,
                    clockInAt: now,
                    clockInRequestId: dto.requestId,
                    ...location,
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

    // HR, management and admins only. Project roles never grant this.
    async listTeam(
        user: AccessTokenPayload,
        query: TeamAttendanceQueryDto,
    ): Promise<Page<AttendanceView & { employee: EmployeeSummary }>> {
        const actor = await this.access.resolveActor(user);
        this.access.assertAttendanceManager(actor);

        const where: Prisma.AttendanceRecordWhereInput = {
            organizationId: actor.organizationId,
            workDate: this.dateRange(actor, query),
            ...(query.employeeId && { employeeId: query.employeeId }),
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

    // The only response that carries coordinates: the record's owner or an attendance manager.
    async location(user: AccessTokenPayload, recordId: string) {
        const actor = await this.access.resolveActor(user);
        const record = await this.prisma.attendanceRecord.findFirst({
            where: this.visibleRecord(actor, recordId),
            select: {
                id: true,
                locationStatus: true,
                latitude: true,
                longitude: true,
                accuracyMeters: true,
                locationCapturedAt: true,
                locationMissingReason: true,
            },
        });
        if (!record) throw new NotFoundException('Attendance record not found');

        return {
            recordId: record.id,
            locationStatus: record.locationStatus,
            latitude: record.latitude,
            longitude: record.longitude,
            accuracyMeters: record.accuracyMeters,
            capturedAt: record.locationCapturedAt,
            missingReason: record.locationMissingReason,
        };
    }

    async listCorrections(user: AccessTokenPayload, recordId: string) {
        const actor = await this.access.resolveActor(user);
        const record = await this.prisma.attendanceRecord.findFirst({
            where: this.visibleRecord(actor, recordId),
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

        const open = await this.findOpen(actor);
        if (open) {
            throw workConflict(WorkErrorCode.ATTENDANCE_ALREADY_OPEN, 'You are already clocked in; clock out first', {
                recordId: open.id,
                workDate: fromDbDate(open.workDate),
            });
        }
        const today = await this.findForDay(actor, workDate);
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

    // Owners see their own records; attendance managers see everyone's in the organization.
    private visibleRecord(actor: WorkActor, recordId: string): Prisma.AttendanceRecordWhereInput {
        return {
            id: recordId,
            organizationId: actor.organizationId,
            ...(!this.access.canManageAttendance(actor) && { employeeId: actor.employeeId }),
        };
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
