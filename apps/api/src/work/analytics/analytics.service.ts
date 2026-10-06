import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EmploymentStatus, LeaveStatus, Prisma, WorkProjectStatus, WorkSprintStatus, WorkTaskStatus } from 'db';
import type { AccessTokenPayload } from 'src/auth/access-token-payload';
import { Role } from 'src/common/enum/role.enum';
import { PrismaService } from 'src/prisma/prisma.service';
import { AnalyticsQueryDto, AnalyticsScope } from '../dto/analytics.dto';
import { ORG_ANALYTICS_ROLES } from '../work-access.policy';
import { WorkAccessService, WorkActor } from '../work-access.service';
import { addDays, daysBetween, fromDbDate, localDateIn, toDbDate, zonedInstant } from '../work-date';
import { WorkErrorCode, workBadRequest } from '../work-errors';
import { EMPLOYEE_SUMMARY_SELECT, EmployeeSummary, toEmployeeSummary } from '../work-people';
import { AttendanceTotals, StatsEmployee, StatsRecord, TrendPoint, attendanceStats, leaveDateSets } from './attendance-stats';
import { WorkCalendar, WorkScheduleService } from '../work-schedule';

const MAX_RANGE_DAYS = 366;

// Employees still on the books; leavers drop out of department and organisation figures.
export const CURRENT_EMPLOYMENT: EmploymentStatus[] = [EmploymentStatus.ACTIVE, EmploymentStatus.PROBATION];

type Subject =
    | { scope: 'personal'; employee: EmployeeSummary }
    | { scope: 'department'; department: { id: string; name: string } }
    | { scope: 'organisation' };

export type OnTimeCounts = { onTime: number; late: number; noDeadline: number };

export type ProjectAnalytics = {
    // Tasks finished in the range, judged against their due date.
    tasksCompleted: OnTimeCounts;
    // Open tasks whose due date has passed, as of today.
    tasksOverdue: number;
    tasksOpen: number;
    sprintsCompleted: OnTimeCounts;
    projectsCompleted: OnTimeCounts & { items: ProjectOutcome[] };
    // Active projects already past their target date, as of today.
    projectsOverdue: ProjectOutcome[];
};

export type ProjectOutcome = { id: string; name: string; targetDate: string | null; completedOn: string | null; daysLate: number };

export type BreakdownRow = { id: string; name: string; headcount: number; attendance: AttendanceTotals; tasksCompleted: OnTimeCounts; tasksOverdue: number };

export type AnalyticsView = {
    scope: AnalyticsScope;
    subject: Subject;
    from: string;
    to: string;
    today: string;
    headcount: number;
    attendance: AttendanceTotals & { trend: TrendPoint[] };
    projects: ProjectAnalytics;
    // Per employee for personal-team views and departments; per department for the organisation.
    breakdown: BreakdownRow[];
};

type ScopeEmployee = { id: string; firstName: string; lastName: string; dateJoined: Date | null; departmentId: string | null };

@Injectable()
export class AnalyticsService {
    constructor(
        private prisma: PrismaService,
        private access: WorkAccessService,
        private schedules: WorkScheduleService,
    ) {}

    async get(user: AccessTokenPayload, query: AnalyticsQueryDto): Promise<AnalyticsView> {
        const actor = await this.access.resolveActor(user);
        const today = localDateIn(new Date(), actor.timeZone);
        const from = query.from ?? `${today.slice(0, 8)}01`;
        const to = query.to ?? today;
        if (to < from) throw workBadRequest(WorkErrorCode.DATE_RANGE_INVALID, '`to` cannot be before `from`');
        if (daysBetween(from, to) >= MAX_RANGE_DAYS) {
            throw workBadRequest(WorkErrorCode.DATE_RANGE_TOO_LONG, `The range can be at most ${MAX_RANGE_DAYS} days`);
        }

        const { subject, employees } = await this.resolveScope(actor, query);
        const ids = employees.map((e) => e.id);
        const attendanceTo = to < today ? to : today;

        const [calendar, records, leaves] = await Promise.all([
            this.schedules.calendar(actor.organizationId, from, to),
            this.prisma.attendanceRecord.findMany({
                where: { organizationId: actor.organizationId, employeeId: { in: ids }, workDate: { gte: toDbDate(from), lte: toDbDate(to) } },
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
                    startDate: { lte: toDbDate(to) },
                    endDate: { gte: toDbDate(from) },
                },
                select: { employeeId: true, startDate: true, endDate: true },
            }),
        ]);

        const leaveSets = leaveDateSets(leaves, from, to);
        const statsEmployees: StatsEmployee[] = employees.map((e) => ({
            id: e.id,
            joinedOn: e.dateJoined ? fromDbDate(e.dateJoined) : null,
            leaveDates: leaveSets.get(e.id) ?? new Set(),
        }));
        const statsRecords: StatsRecord[] = records.map((r) => ({ ...r, workDate: fromDbDate(r.workDate) }));
        const stats = attendanceStats(
            statsEmployees,
            statsRecords,
            calendar,
            from,
            attendanceTo,
            today,
        );

        const projects = await this.projectAnalytics(actor, subject, ids, from, to, today);
        const taskBreakdown = subject.scope === 'personal' ? null : await this.taskBreakdown(actor, ids, from, to, today);

        let breakdown: BreakdownRow[] = [];
        if (subject.scope === 'department' && taskBreakdown) {
            breakdown = employees.map((e) => ({
                id: e.id,
                name: toEmployeeSummary(e).name,
                headcount: 1,
                attendance: stats.byEmployee.get(e.id) ?? attendanceStats([], [], calendar, from, attendanceTo, today).totals,
                tasksCompleted: taskBreakdown.completed.get(e.id) ?? { onTime: 0, late: 0, noDeadline: 0 },
                tasksOverdue: taskBreakdown.overdue.get(e.id) ?? 0,
            }));
        } else if (subject.scope === 'organisation' && taskBreakdown) {
            breakdown = await this.departmentBreakdown(actor, employees, statsEmployees, statsRecords, calendar, from, attendanceTo, today, taskBreakdown);
        }
        breakdown.sort((a, b) => a.name.localeCompare(b.name));

        const { trend, totals } = stats;
        return {
            scope: query.scope,
            subject,
            from,
            to,
            today,
            headcount: employees.length,
            attendance: { ...totals, trend },
            projects,
            breakdown,
        };
    }

    // Which analytics scopes the caller may open, for the UI.
    async allowedScopes(actor: WorkActor): Promise<AnalyticsScope[]> {
        if (ORG_ANALYTICS_ROLES.includes(actor.role)) return ['personal', 'department', 'organisation'];
        if (actor.role === Role.HOD && (await this.ownDepartmentId(actor))) return ['personal', 'department'];
        return ['personal'];
    }

    private async resolveScope(actor: WorkActor, query: AnalyticsQueryDto): Promise<{ subject: Subject; employees: ScopeEmployee[] }> {
        const select = { ...EMPLOYEE_SUMMARY_SELECT, dateJoined: true, departmentId: true } as const;
        const orgWide = ORG_ANALYTICS_ROLES.includes(actor.role);

        if (query.scope === 'personal') {
            const employeeId = query.employeeId ?? actor.employeeId;
            if (employeeId !== actor.employeeId && !this.access.canManageAttendance(actor)) {
                if (!(await this.access.isReportingManagerOf(actor, employeeId))) throw new NotFoundException('Employee not found');
            }
            const employee = await this.prisma.employee.findFirst({
                where: { id: employeeId, organizationId: actor.organizationId },
                select,
            });
            if (!employee) throw new NotFoundException('Employee not found');
            return { subject: { scope: 'personal', employee: toEmployeeSummary(employee) }, employees: [employee] };
        }

        if (query.scope === 'department') {
            let departmentId = query.departmentId;
            if (!orgWide) {
                if (actor.role !== Role.HOD) throw new ForbiddenException('You cannot view department analytics');
                const own = await this.ownDepartmentId(actor);
                if (!own || (departmentId && departmentId !== own)) throw new ForbiddenException('You can only view your own department');
                departmentId = own;
            }
            departmentId ??= (await this.ownDepartmentId(actor)) ?? undefined;
            if (!departmentId) throw workBadRequest(WorkErrorCode.DEPARTMENT_REQUIRED, 'Choose a department');

            const department = await this.prisma.department.findFirst({
                where: { id: departmentId, organizationId: actor.organizationId },
                select: { id: true, name: true },
            });
            if (!department) throw new NotFoundException('Department not found');
            const employees = await this.prisma.employee.findMany({
                where: { organizationId: actor.organizationId, departmentId, employmentStatus: { in: CURRENT_EMPLOYMENT } },
                select,
            });
            return { subject: { scope: 'department', department }, employees };
        }

        if (!orgWide) throw new ForbiddenException('You cannot view organisation analytics');
        const employees = await this.prisma.employee.findMany({
            where: { organizationId: actor.organizationId, employmentStatus: { in: CURRENT_EMPLOYMENT } },
            select,
        });
        return { subject: { scope: 'organisation' }, employees };
    }

    private async ownDepartmentId(actor: WorkActor): Promise<string | null> {
        const me = await this.prisma.employee.findUnique({ where: { id: actor.employeeId }, select: { departmentId: true } });
        return me?.departmentId ?? null;
    }

    // Personal and department figures follow the people (assigned tasks, sprints they lead or
    // belong to, projects they're members of); organisation figures cover everything.
    private async projectAnalytics(
        actor: WorkActor,
        subject: Subject,
        ids: string[],
        from: string,
        to: string,
        today: string,
    ): Promise<ProjectAnalytics> {
        const org = actor.organizationId;
        const all = subject.scope === 'organisation';
        const range = { gte: zonedInstant(from, '00:00', actor.timeZone), lt: zonedInstant(addDays(to, 1), '00:00', actor.timeZone) };

        const taskScope: Prisma.WorkTaskWhereInput = all ? { project: { organizationId: org } } : { project: { organizationId: org }, assigneeId: { in: ids } };
        const sprintScope: Prisma.WorkSprintWhereInput = all
            ? { project: { organizationId: org } }
            : { project: { organizationId: org }, OR: [{ leadId: { in: ids } }, { members: { some: { employeeId: { in: ids } } } }] };
        const projectScope: Prisma.WorkProjectWhereInput = all
            ? { organizationId: org }
            : { organizationId: org, members: { some: { employeeId: { in: ids } } } };

        const [doneTasks, tasksOverdue, tasksOpen, sprints, completedProjects, overdueProjects] = await Promise.all([
            this.prisma.workTask.findMany({
                where: { ...taskScope, status: WorkTaskStatus.DONE, completedAt: range },
                select: { dueDate: true, completedAt: true },
            }),
            this.prisma.workTask.count({ where: { ...taskScope, status: { not: WorkTaskStatus.DONE }, dueDate: { lt: toDbDate(today) } } }),
            this.prisma.workTask.count({ where: { ...taskScope, status: { not: WorkTaskStatus.DONE } } }),
            this.prisma.workSprint.findMany({
                where: { ...sprintScope, status: WorkSprintStatus.COMPLETED, completedAt: range },
                select: { endDate: true, completedAt: true },
            }),
            this.prisma.workProject.findMany({
                where: { ...projectScope, status: WorkProjectStatus.COMPLETED, completedAt: range },
                select: { id: true, name: true, targetDate: true, completedAt: true },
                orderBy: { completedAt: 'desc' },
            }),
            this.prisma.workProject.findMany({
                where: { ...projectScope, status: WorkProjectStatus.ACTIVE, targetDate: { lt: toDbDate(today) } },
                select: { id: true, name: true, targetDate: true, completedAt: true },
                orderBy: { targetDate: 'asc' },
            }),
        ]);

        const tz = actor.timeZone;
        const tasksCompleted = countOnTime(doneTasks.map((t) => [t.dueDate, t.completedAt!]), tz);
        const sprintsCompleted = countOnTime(sprints.map((s) => [s.endDate, s.completedAt!]), tz);
        const projectItems = completedProjects.map((p) => outcome(p, tz, today));

        return {
            tasksCompleted,
            tasksOverdue,
            tasksOpen,
            sprintsCompleted,
            projectsCompleted: { ...countOnTime(completedProjects.map((p) => [p.targetDate, p.completedAt!]), tz), items: projectItems },
            projectsOverdue: overdueProjects.map((p) => outcome(p, tz, today)),
        };
    }

    // Per-assignee completed and overdue task counts, for the department and organisation breakdowns.
    private async taskBreakdown(actor: WorkActor, ids: string[], from: string, to: string, today: string) {
        const range = { gte: zonedInstant(from, '00:00', actor.timeZone), lt: zonedInstant(addDays(to, 1), '00:00', actor.timeZone) };
        const scope = { project: { organizationId: actor.organizationId }, assigneeId: { in: ids } };
        const [done, overdue] = await Promise.all([
            this.prisma.workTask.findMany({
                where: { ...scope, status: WorkTaskStatus.DONE, completedAt: range },
                select: { assigneeId: true, dueDate: true, completedAt: true },
            }),
            this.prisma.workTask.groupBy({
                by: ['assigneeId'],
                where: { ...scope, status: { not: WorkTaskStatus.DONE }, dueDate: { lt: toDbDate(today) } },
                _count: { _all: true },
            }),
        ]);

        const completed = new Map<string, OnTimeCounts>();
        for (const t of done) {
            const entry = completed.get(t.assigneeId!) ?? { onTime: 0, late: 0, noDeadline: 0 };
            addOnTime(entry, t.dueDate, t.completedAt!, actor.timeZone);
            completed.set(t.assigneeId!, entry);
        }
        return { completed, overdue: new Map(overdue.map((g) => [g.assigneeId!, g._count._all])) };
    }

    private async departmentBreakdown(
        actor: WorkActor,
        employees: ScopeEmployee[],
        statsEmployees: StatsEmployee[],
        records: StatsRecord[],
        calendar: WorkCalendar,
        from: string,
        to: string,
        today: string,
        tasks: { completed: Map<string, OnTimeCounts>; overdue: Map<string, number> },
    ): Promise<BreakdownRow[]> {
        const departments = await this.prisma.department.findMany({
            where: { organizationId: actor.organizationId },
            select: { id: true, name: true },
        });
        const names = new Map(departments.map((d) => [d.id, d.name]));
        const groups = new Map<string, ScopeEmployee[]>();
        for (const e of employees) {
            const key = e.departmentId ?? '';
            groups.set(key, [...(groups.get(key) ?? []), e]);
        }

        const statsById = new Map(statsEmployees.map((s) => [s.id, s]));
        const rows: BreakdownRow[] = [];
        for (const [departmentId, members] of groups) {
            const memberIds = new Set(members.map((m) => m.id));
            const { totals } = attendanceStats(
                members.map((m) => statsById.get(m.id)!),
                records.filter((r) => memberIds.has(r.employeeId)),
                calendar,
                from,
                to,
                today,
            );
            const completed: OnTimeCounts = { onTime: 0, late: 0, noDeadline: 0 };
            let overdue = 0;
            for (const id of memberIds) {
                const c = tasks.completed.get(id);
                if (c) {
                    completed.onTime += c.onTime;
                    completed.late += c.late;
                    completed.noDeadline += c.noDeadline;
                }
                overdue += tasks.overdue.get(id) ?? 0;
            }
            rows.push({
                id: departmentId || 'none',
                name: names.get(departmentId) ?? 'No department',
                headcount: members.length,
                attendance: totals,
                tasksCompleted: completed,
                tasksOverdue: overdue,
            });
        }
        return rows;
    }
}

// On time when finished on or before the deadline's date in the organization's time zone.
function addOnTime(counts: OnTimeCounts, deadline: Date | null, finishedAt: Date, timeZone: string): void {
    if (!deadline) counts.noDeadline++;
    else if (localDateIn(finishedAt, timeZone) <= fromDbDate(deadline)) counts.onTime++;
    else counts.late++;
}

function countOnTime(rows: [Date | null, Date][], timeZone: string): OnTimeCounts {
    const counts = { onTime: 0, late: 0, noDeadline: 0 };
    for (const [deadline, finishedAt] of rows) addOnTime(counts, deadline, finishedAt, timeZone);
    return counts;
}

function outcome(
    project: { id: string; name: string; targetDate: Date | null; completedAt: Date | null },
    timeZone: string,
    today: string,
): ProjectOutcome {
    const targetDate = project.targetDate ? fromDbDate(project.targetDate) : null;
    const completedOn = project.completedAt ? localDateIn(project.completedAt, timeZone) : null;
    const end = completedOn ?? today;
    return { id: project.id, name: project.name, targetDate, completedOn, daysLate: targetDate ? Math.max(0, daysBetween(targetDate, end)) : 0 };
}
