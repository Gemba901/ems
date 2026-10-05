import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, WorkSprintStatus, WorkTaskStatus } from 'db';
import type { AccessTokenPayload } from 'src/auth/access-token-payload';
import { PrismaService } from 'src/prisma/prisma.service';
import { Page, pageArgs } from '../dto/common.dto';
import { CreateSprintDto, SprintQueryDto, UpdateSprintDto } from '../dto/sprint.dto';
import { WorkAccessService, WorkActor } from '../work-access.service';
import { fromDbDate, toDbDate } from '../work-date';
import { WorkErrorCode, isUniqueViolation, workBadRequest, workConflict } from '../work-errors';
import { EMPLOYEE_SUMMARY_SELECT, toEmployeeSummary } from '../work-people';
import { SprintCompletionSnapshot, buildSprintSnapshot, completionPercent } from './sprint-snapshot';

const SPRINT_SELECT = {
    id: true,
    projectId: true,
    name: true,
    goal: true,
    startDate: true,
    endDate: true,
    status: true,
    startedAt: true,
    completedAt: true,
    completionSnapshot: true,
    createdAt: true,
    updatedAt: true,
} satisfies Prisma.WorkSprintSelect;

type SprintRow = Prisma.WorkSprintGetPayload<{ select: typeof SPRINT_SELECT }>;

export type SprintView = {
    id: string;
    projectId: string;
    name: string;
    goal: string | null;
    startDate: string;
    endDate: string;
    status: WorkSprintStatus;
    startedAt: Date | null;
    completedAt: Date | null;
    taskCounts: { total: number; done: number; percent: number };
};

export type SprintDetail = SprintView & { completionSnapshot: SprintCompletionSnapshot | null };

@Injectable()
export class SprintsService {
    constructor(private prisma: PrismaService, private access: WorkAccessService) {}

    async list(user: AccessTokenPayload, projectId: string, query: SprintQueryDto): Promise<Page<SprintView>> {
        const actor = await this.access.resolveActor(user);
        await this.access.getProjectAccess(actor, projectId);

        const where: Prisma.WorkSprintWhereInput = { projectId, ...(query.status && { status: query.status }) };
        const [sprints, total] = await this.prisma.$transaction([
            this.prisma.workSprint.findMany({
                where,
                select: SPRINT_SELECT,
                orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
                ...pageArgs(query),
            }),
            this.prisma.workSprint.count({ where }),
        ]);

        const live = await this.liveCounts(sprints.filter((s) => s.status !== WorkSprintStatus.COMPLETED).map((s) => s.id));
        const items = sprints.map((s) => this.toView(s, live.get(s.id)));
        return { items, page: query.page, pageSize: query.pageSize, total };
    }

    async get(user: AccessTokenPayload, sprintId: string): Promise<SprintDetail> {
        const actor = await this.access.resolveActor(user);
        const sprint = await this.loadSprint(actor, sprintId, false);
        return this.toDetail(sprint);
    }

    async create(user: AccessTokenPayload, projectId: string, dto: CreateSprintDto): Promise<SprintDetail> {
        const actor = await this.access.resolveActor(user);
        await this.access.assertCanManageProject(actor, projectId);
        this.assertDateOrder(dto.startDate, dto.endDate);

        const sprint = await this.prisma.workSprint.create({
            data: {
                projectId,
                name: dto.name,
                goal: dto.goal || null,
                startDate: toDbDate(dto.startDate),
                endDate: toDbDate(dto.endDate),
                createdById: actor.employeeId,
            },
            select: SPRINT_SELECT,
        });
        return this.toDetail(sprint);
    }

    // Only PLANNED sprints are editable; the status condition on the write closes the race with start.
    async update(user: AccessTokenPayload, sprintId: string, dto: UpdateSprintDto): Promise<SprintDetail> {
        const actor = await this.access.resolveActor(user);
        const sprint = await this.loadSprint(actor, sprintId, true);
        if (sprint.status !== WorkSprintStatus.PLANNED) throw this.notPlanned();

        const startDate = dto.startDate ?? fromDbDate(sprint.startDate);
        const endDate = dto.endDate ?? fromDbDate(sprint.endDate);
        this.assertDateOrder(startDate, endDate);

        const { count } = await this.prisma.workSprint.updateMany({
            where: { id: sprintId, status: WorkSprintStatus.PLANNED },
            data: {
                ...(dto.name !== undefined && { name: dto.name }),
                ...(dto.goal !== undefined && { goal: dto.goal || null }),
                startDate: toDbDate(startDate),
                endDate: toDbDate(endDate),
            },
        });
        if (count === 0) throw this.notPlanned();
        return this.reload(sprintId);
    }

    // The partial unique index allows one ACTIVE sprint per project, so a concurrent start fails with P2002.
    async start(user: AccessTokenPayload, sprintId: string): Promise<SprintDetail> {
        const actor = await this.access.resolveActor(user);
        const sprint = await this.loadSprint(actor, sprintId, true);
        if (sprint.status !== WorkSprintStatus.PLANNED) throw this.notPlanned();

        try {
            const { count } = await this.prisma.workSprint.updateMany({
                where: { id: sprintId, status: WorkSprintStatus.PLANNED },
                data: { status: WorkSprintStatus.ACTIVE, startedAt: new Date() },
            });
            if (count === 0) throw this.notPlanned();
        } catch (error) {
            if (isUniqueViolation(error)) {
                throw workConflict(WorkErrorCode.SPRINT_ALREADY_ACTIVE, 'This project already has an active sprint; complete it first');
            }
            throw error;
        }
        return this.reload(sprintId);
    }

    // One transaction: freeze the snapshot, mark COMPLETED, then move unfinished tasks to the backlog.
    async complete(user: AccessTokenPayload, sprintId: string): Promise<SprintDetail> {
        const actor = await this.access.resolveActor(user);
        await this.loadSprint(actor, sprintId, true);

        await this.prisma.$transaction(async (tx) => {
            // Row-locks the sprint while it is ACTIVE; a concurrent completer waits, then matches nothing.
            const { count } = await tx.workSprint.updateMany({
                where: { id: sprintId, status: WorkSprintStatus.ACTIVE },
                data: { updatedAt: new Date() },
            });
            if (count === 0) throw workConflict(WorkErrorCode.SPRINT_NOT_ACTIVE, 'Only an active sprint can be completed');

            const tasks = await tx.workTask.findMany({
                where: { sprintId },
                select: { id: true, title: true, status: true, assignee: { select: EMPLOYEE_SUMMARY_SELECT } },
                orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            });
            const completedAt = new Date();
            const snapshot = buildSprintSnapshot(
                completedAt,
                tasks.map((t) => ({ ...t, assignee: toEmployeeSummary(t.assignee) })),
            );

            await tx.workSprint.update({
                where: { id: sprintId },
                data: { status: WorkSprintStatus.COMPLETED, completedAt, completionSnapshot: snapshot },
            });
            await tx.workTask.updateMany({
                where: { sprintId, status: { not: WorkTaskStatus.DONE } },
                data: { sprintId: null },
            });
        });
        return this.reload(sprintId);
    }

    // 404 for sprints in other organizations or projects the caller cannot see.
    private async loadSprint(actor: WorkActor, sprintId: string, mustManage: boolean): Promise<SprintRow> {
        const sprint = await this.prisma.workSprint.findFirst({
            where: { id: sprintId, project: { organizationId: actor.organizationId } },
            select: SPRINT_SELECT,
        });
        if (!sprint) throw new NotFoundException('Sprint not found');

        try {
            if (mustManage) await this.access.assertCanManageProject(actor, sprint.projectId);
            else await this.access.getProjectAccess(actor, sprint.projectId);
        } catch (error) {
            if (error instanceof NotFoundException) throw new NotFoundException('Sprint not found');
            throw error;
        }
        return sprint;
    }

    private async reload(sprintId: string): Promise<SprintDetail> {
        const sprint = await this.prisma.workSprint.findUniqueOrThrow({ where: { id: sprintId }, select: SPRINT_SELECT });
        return this.toDetail(sprint);
    }

    private async toDetail(sprint: SprintRow): Promise<SprintDetail> {
        const live = sprint.status === WorkSprintStatus.COMPLETED ? new Map() : await this.liveCounts([sprint.id]);
        return { ...this.toView(sprint, live.get(sprint.id)), completionSnapshot: this.snapshotOf(sprint) };
    }

    // Completed sprints report their frozen snapshot; others count their current tasks.
    private toView(sprint: SprintRow, live: { total: number; done: number } | undefined): SprintView {
        const snapshot = this.snapshotOf(sprint);
        const counts = snapshot
            ? { total: snapshot.totalCount, done: snapshot.completedCount }
            : (live ?? { total: 0, done: 0 });
        return {
            id: sprint.id,
            projectId: sprint.projectId,
            name: sprint.name,
            goal: sprint.goal,
            startDate: fromDbDate(sprint.startDate),
            endDate: fromDbDate(sprint.endDate),
            status: sprint.status,
            startedAt: sprint.startedAt,
            completedAt: sprint.completedAt,
            taskCounts: {
                ...counts,
                percent: completionPercent({ totalCount: counts.total, completedCount: counts.done }),
            },
        };
    }

    private snapshotOf(sprint: SprintRow): SprintCompletionSnapshot | null {
        if (sprint.status !== WorkSprintStatus.COMPLETED || !sprint.completionSnapshot) return null;
        return sprint.completionSnapshot as unknown as SprintCompletionSnapshot;
    }

    private async liveCounts(sprintIds: string[]): Promise<Map<string, { total: number; done: number }>> {
        const counts = new Map<string, { total: number; done: number }>();
        if (!sprintIds.length) return counts;

        const groups = await this.prisma.workTask.groupBy({
            by: ['sprintId', 'status'],
            where: { sprintId: { in: sprintIds } },
            _count: { _all: true },
        });
        for (const g of groups) {
            if (!g.sprintId) continue;
            const entry = counts.get(g.sprintId) ?? { total: 0, done: 0 };
            entry.total += g._count._all;
            if (g.status === WorkTaskStatus.DONE) entry.done += g._count._all;
            counts.set(g.sprintId, entry);
        }
        return counts;
    }

    private assertDateOrder(startDate: string, endDate: string): void {
        if (endDate < startDate) {
            throw workBadRequest(WorkErrorCode.SPRINT_DATES_INVALID, 'The end date cannot be before the start date');
        }
    }

    private notPlanned() {
        return workConflict(WorkErrorCode.SPRINT_NOT_PLANNED, 'Only a planned sprint can be changed or started');
    }
}
