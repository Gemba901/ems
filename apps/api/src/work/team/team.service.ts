import { Injectable, NotFoundException } from '@nestjs/common';
import { AttendanceLocationCheck, EmploymentStatus, LeaveStatus, WorkTaskStatus } from 'db';
import type { AccessTokenPayload } from 'src/auth/access-token-payload';
import { PrismaService } from 'src/prisma/prisma.service';
import { AnalyticsScope } from '../dto/analytics.dto';
import { AnalyticsService } from '../analytics/analytics.service';
import { AttendanceTotals, attendanceStats, leaveDateSets } from '../analytics/attendance-stats';
import { WORK_SETTINGS_ROLES } from '../work-access.policy';
import { WorkAccessService, WorkActor } from '../work-access.service';
import { DayType, WorkScheduleService, punctuality } from '../work-schedule';
import { addDays, fromDbDate, localDateIn, toDbDate } from '../work-date';

// What the Team Workspace UI needs to know about the caller to show the right sections.
export type WorkContext = {
    employeeId: string;
    department: { id: string; name: string } | null;
    directReportCount: number;
    canManageAttendance: boolean;
    canEditSettings: boolean;
    analyticsScopes: AnalyticsScope[];
    // For department analytics pickers; empty unless the caller can choose any department.
    departments: { id: string; name: string }[];
};

export type TodayStatus = 'CLOCKED_IN' | 'CLOCKED_OUT' | 'ON_LEAVE' | 'NOT_IN' | 'DAY_OFF' | 'HOLIDAY';

export type TeamMemberView = {
    id: string;
    name: string;
    jobTitle: string | null;
    email: string | null;
    avatarUrl: string | null;
    department: { id: string; name: string } | null;
    employmentStatus: EmploymentStatus;
    today: {
        status: TodayStatus;
        dayType: DayType;
        clockInAt: Date | null;
        clockOutAt: Date | null;
        lateMinutes: number;
    };
    // Month to date.
    attendance: AttendanceTotals;
    tasks: { open: number; overdue: number };
    // Approved leave in progress or starting within two weeks.
    leave: { type: string; startDate: string; endDate: string }[];
};

export type TeamMemberDetail = TeamMemberView & {
    openTasks: { id: string; title: string; status: WorkTaskStatus; dueDate: string | null; project: { id: string; name: string } }[];
    recentAttendance: {
        id: string;
        workDate: string;
        clockInAt: Date;
        clockOutAt: Date | null;
        lateMinutes: number;
        earlyLeaveMinutes: number;
        locationCheck: AttendanceLocationCheck | null;
        checkedPlaceName: string | null;
        distanceMeters: number | null;
    }[];
};

const MEMBER_SELECT = {
    id: true,
    firstName: true,
    lastName: true,
    jobTitle: true,
    email: true,
    avatarUrl: true,
    dateJoined: true,
    employmentStatus: true,
    department: { select: { id: true, name: true } },
} as const;

// Direct reports only: the people whose reporting manager is the caller.
@Injectable()
export class TeamService {
    constructor(
        private prisma: PrismaService,
        private access: WorkAccessService,
        private schedules: WorkScheduleService,
        private analytics: AnalyticsService,
    ) {}

    async context(user: AccessTokenPayload): Promise<WorkContext> {
        const actor = await this.access.resolveActor(user);
        const [me, directReportCount, analyticsScopes] = await Promise.all([
            this.prisma.employee.findUniqueOrThrow({
                where: { id: actor.employeeId },
                select: { department: { select: { id: true, name: true } } },
            }),
            this.prisma.employee.count({ where: { reportingManagerId: actor.employeeId, organizationId: actor.organizationId } }),
            this.analytics.allowedScopes(actor),
        ]);
        const departments = analyticsScopes.includes('organisation')
            ? await this.prisma.department.findMany({
                  where: { organizationId: actor.organizationId },
                  select: { id: true, name: true },
                  orderBy: { name: 'asc' },
              })
            : [];
        return {
            employeeId: actor.employeeId,
            department: me.department,
            directReportCount,
            canManageAttendance: this.access.canManageAttendance(actor),
            canEditSettings: WORK_SETTINGS_ROLES.includes(actor.role),
            analyticsScopes,
            departments,
        };
    }

    async list(user: AccessTokenPayload): Promise<TeamMemberView[]> {
        const actor = await this.access.resolveActor(user);
        const reports = await this.prisma.employee.findMany({
            where: { reportingManagerId: actor.employeeId, organizationId: actor.organizationId },
            select: MEMBER_SELECT,
            orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { id: 'asc' }],
        });
        return this.buildViews(actor, reports);
    }

    async get(user: AccessTokenPayload, employeeId: string): Promise<TeamMemberDetail> {
        const actor = await this.access.resolveActor(user);
        const employee = await this.prisma.employee.findFirst({
            where: { id: employeeId, reportingManagerId: actor.employeeId, organizationId: actor.organizationId },
            select: MEMBER_SELECT,
        });
        if (!employee) throw new NotFoundException('Employee not found in your team');

        const today = localDateIn(new Date(), actor.timeZone);
        const [[view], openTasks, recent] = await Promise.all([
            this.buildViews(actor, [employee]),
            this.prisma.workTask.findMany({
                where: { assigneeId: employeeId, status: { not: WorkTaskStatus.DONE }, project: { organizationId: actor.organizationId } },
                select: { id: true, title: true, status: true, dueDate: true, project: { select: { id: true, name: true } } },
                orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
                take: 25,
            }),
            this.prisma.attendanceRecord.findMany({
                where: { employeeId, organizationId: actor.organizationId, workDate: { gte: toDbDate(addDays(today, -13)) } },
                select: {
                    id: true,
                    workDate: true,
                    clockInAt: true,
                    clockOutAt: true,
                    scheduledStartAt: true,
                    scheduledEndAt: true,
                    lateGraceMinutes: true,
                    locationCheck: true,
                    checkedPlaceName: true,
                    distanceMeters: true,
                },
                orderBy: [{ workDate: 'desc' }, { clockInAt: 'desc' }],
            }),
        ]);

        return {
            ...view,
            openTasks: openTasks.map((t) => ({ ...t, dueDate: t.dueDate ? fromDbDate(t.dueDate) : null })),
            recentAttendance: recent.map((r) => ({
                id: r.id,
                workDate: fromDbDate(r.workDate),
                clockInAt: r.clockInAt,
                clockOutAt: r.clockOutAt,
                locationCheck: r.locationCheck,
                checkedPlaceName: r.checkedPlaceName,
                distanceMeters: r.distanceMeters,
                ...punctualityOf(r),
            })),
        };
    }

    private async buildViews(
        actor: WorkActor,
        employees: { id: string; firstName: string; lastName: string; jobTitle: string | null; email: string | null; avatarUrl: string | null; dateJoined: Date | null; employmentStatus: EmploymentStatus; department: { id: string; name: string } | null }[],
    ): Promise<TeamMemberView[]> {
        if (!employees.length) return [];
        const ids = employees.map((e) => e.id);
        const today = localDateIn(new Date(), actor.timeZone);
        const monthStart = `${today.slice(0, 8)}01`;
        const leaveHorizon = addDays(today, 14);

        const [calendar, records, leaves, openTasks, overdueTasks] = await Promise.all([
            this.schedules.calendar(actor.organizationId, monthStart, today),
            this.prisma.attendanceRecord.findMany({
                where: { organizationId: actor.organizationId, employeeId: { in: ids }, workDate: { gte: toDbDate(monthStart), lte: toDbDate(today) } },
                select: {
                    employeeId: true,
                    workDate: true,
                    clockInAt: true,
                    clockOutAt: true,
                    scheduledStartAt: true,
                    scheduledEndAt: true,
                    scheduledBreakMinutes: true,
                    lateGraceMinutes: true,
                    locationCheck: true,
                },
            }),
            this.prisma.leaveRequest.findMany({
                where: {
                    organizationId: actor.organizationId,
                    employeeId: { in: ids },
                    status: LeaveStatus.APPROVED,
                    startDate: { lte: toDbDate(leaveHorizon) },
                    endDate: { gte: toDbDate(monthStart) },
                },
                select: { employeeId: true, type: true, startDate: true, endDate: true },
                orderBy: { startDate: 'asc' },
            }),
            this.prisma.workTask.groupBy({
                by: ['assigneeId'],
                where: { assigneeId: { in: ids }, status: { not: WorkTaskStatus.DONE }, project: { organizationId: actor.organizationId } },
                _count: { _all: true },
            }),
            this.prisma.workTask.groupBy({
                by: ['assigneeId'],
                where: {
                    assigneeId: { in: ids },
                    status: { not: WorkTaskStatus.DONE },
                    dueDate: { lt: toDbDate(today) },
                    project: { organizationId: actor.organizationId },
                },
                _count: { _all: true },
            }),
        ]);

        const statsRecords = records.map((r) => ({ ...r, workDate: fromDbDate(r.workDate) }));
        const leaveSets = leaveDateSets(leaves, monthStart, today);
        const { byEmployee } = attendanceStats(
            employees.map((e) => ({
                id: e.id,
                joinedOn: e.dateJoined ? fromDbDate(e.dateJoined) : null,
                leaveDates: leaveSets.get(e.id) ?? new Set(),
            })),
            statsRecords,
            calendar,
            monthStart,
            today,
            today,
        );
        const empty = attendanceStats([], [], calendar, monthStart, today, today).totals;
        const open = new Map(openTasks.map((g) => [g.assigneeId, g._count._all]));
        const overdue = new Map(overdueTasks.map((g) => [g.assigneeId, g._count._all]));
        const dayType = calendar.dayType(today);

        return employees.map((e) => {
            const todays = statsRecords
                .filter((r) => r.employeeId === e.id && r.workDate === today)
                .sort((a, b) => a.clockInAt.getTime() - b.clockInAt.getTime());
            const first = todays[0];
            const latest = todays[todays.length - 1];
            const onLeave = leaveSets.get(e.id)?.has(today) ?? false;

            let status: TodayStatus;
            if (latest && !latest.clockOutAt) status = 'CLOCKED_IN';
            else if (latest) status = 'CLOCKED_OUT';
            else if (onLeave) status = 'ON_LEAVE';
            else if (dayType === 'HOLIDAY') status = 'HOLIDAY';
            else if (dayType === 'NON_WORKING') status = 'DAY_OFF';
            else status = 'NOT_IN';

            return {
                id: e.id,
                name: `${e.firstName} ${e.lastName}`.trim(),
                jobTitle: e.jobTitle,
                email: e.email,
                avatarUrl: e.avatarUrl,
                department: e.department,
                employmentStatus: e.employmentStatus,
                today: {
                    status,
                    dayType,
                    clockInAt: first?.clockInAt ?? null,
                    clockOutAt: latest?.clockOutAt ?? null,
                    lateMinutes: first ? punctuality(first).lateMinutes : 0,
                },
                attendance: byEmployee.get(e.id) ?? empty,
                tasks: { open: open.get(e.id) ?? 0, overdue: overdue.get(e.id) ?? 0 },
                leave: leaves
                    .filter((l) => l.employeeId === e.id && fromDbDate(l.endDate) >= today)
                    .map((l) => ({ type: l.type, startDate: fromDbDate(l.startDate), endDate: fromDbDate(l.endDate) })),
            };
        });
    }
}

function punctualityOf(record: Parameters<typeof punctuality>[0]) {
    const { lateMinutes, earlyLeaveMinutes } = punctuality(record);
    return { lateMinutes, earlyLeaveMinutes };
}
