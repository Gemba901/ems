import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, WorkSprintStatus, WorkTaskStatus } from 'db';
import type { AccessTokenPayload } from 'src/auth/access-token-payload';
import { PrismaService } from 'src/prisma/prisma.service';
import { Page, PageQueryDto, pageArgs } from '../dto/common.dto';
import { CreateCommentDto, CreateTaskDto, MyTasksQueryDto, ProjectTaskQueryDto, UpdateTaskDto } from '../dto/task.dto';
import { ProjectAccess, WorkAccessService, WorkActor } from '../work-access.service';
import { fromDbDate, toDbDate } from '../work-date';
import { WorkErrorCode, workBadRequest } from '../work-errors';
import { EMPLOYEE_SUMMARY_SELECT, EmployeeSummary, toEmployeeSummary } from '../work-people';

const TASK_SELECT = {
    id: true,
    projectId: true,
    title: true,
    description: true,
    status: true,
    dueDate: true,
    completedAt: true,
    createdAt: true,
    updatedAt: true,
    project: { select: { id: true, name: true } },
    assignee: { select: EMPLOYEE_SUMMARY_SELECT },
    createdBy: { select: EMPLOYEE_SUMMARY_SELECT },
    sprint: { select: { id: true, name: true, status: true } },
    _count: { select: { comments: true } },
} satisfies Prisma.WorkTaskSelect;

// Overdue and soonest-due first, undated last; createdAt/id keep pages stable.
const TASK_ORDER: Prisma.WorkTaskOrderByWithRelationInput[] = [
    { dueDate: { sort: 'asc', nulls: 'last' } },
    { createdAt: 'asc' },
    { id: 'asc' },
];

export type TaskView = {
    id: string;
    project: { id: string; name: string };
    title: string;
    description: string | null;
    status: WorkTaskStatus;
    dueDate: string | null;
    completedAt: Date | null;
    assignee: EmployeeSummary | null;
    sprint: { id: string; name: string; status: WorkSprintStatus } | null;
    createdBy: EmployeeSummary | null;
    commentCount: number;
    createdAt: Date;
    updatedAt: Date;
};

export type CommentView = { id: string; body: string; author: EmployeeSummary | null; createdAt: Date };

function toTaskView(task: Prisma.WorkTaskGetPayload<{ select: typeof TASK_SELECT }>): TaskView {
    return {
        id: task.id,
        project: task.project,
        title: task.title,
        description: task.description,
        status: task.status,
        dueDate: task.dueDate ? fromDbDate(task.dueDate) : null,
        completedAt: task.completedAt,
        assignee: toEmployeeSummary(task.assignee),
        sprint: task.sprint,
        createdBy: toEmployeeSummary(task.createdBy),
        commentCount: task._count.comments,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
    };
}

@Injectable()
export class TasksService {
    constructor(private prisma: PrismaService, private access: WorkAccessService) {}

    // Tasks assigned to the caller across all their projects; unfinished unless includeDone.
    async myTasks(user: AccessTokenPayload, query: MyTasksQueryDto): Promise<Page<TaskView>> {
        const actor = await this.access.resolveActor(user);
        const where: Prisma.WorkTaskWhereInput = {
            assigneeId: actor.employeeId,
            project: { organizationId: actor.organizationId },
            ...(!query.includeDone && { status: { not: WorkTaskStatus.DONE } }),
        };
        return this.page(where, query);
    }

    async listForProject(user: AccessTokenPayload, projectId: string, query: ProjectTaskQueryDto): Promise<Page<TaskView>> {
        const actor = await this.access.resolveActor(user);
        await this.access.getProjectAccess(actor, projectId);

        const where: Prisma.WorkTaskWhereInput = {
            projectId,
            ...(query.view === 'unscheduled' && { sprintId: null }),
            ...(query.view !== 'all' && query.view !== 'unscheduled' && { sprintId: query.view }),
            ...(query.status && { status: query.status }),
        };
        return this.page(where, query);
    }

    async create(user: AccessTokenPayload, projectId: string, dto: CreateTaskDto): Promise<TaskView> {
        const actor = await this.access.resolveActor(user);
        const access = await this.access.getProjectAccess(actor, projectId);

        if (dto.assigneeId) await this.access.assertProjectMember(projectId, dto.assigneeId);
        if (dto.sprintId) await this.assertCanSchedule(access, dto.sprintId);

        const task = await this.prisma.workTask.create({
            data: {
                projectId,
                title: dto.title,
                description: dto.description || null,
                assigneeId: dto.assigneeId ?? null,
                status: dto.status ?? WorkTaskStatus.TODO,
                completedAt: dto.status === WorkTaskStatus.DONE ? new Date() : null,
                dueDate: dto.dueDate ? toDbDate(dto.dueDate) : null,
                sprintId: dto.sprintId ?? null,
                createdById: actor.employeeId,
            },
            select: TASK_SELECT,
        });
        return toTaskView(task);
    }

    async get(user: AccessTokenPayload, taskId: string): Promise<TaskView> {
        const actor = await this.access.resolveActor(user);
        await this.loadTask(actor, taskId);
        const task = await this.prisma.workTask.findUniqueOrThrow({ where: { id: taskId }, select: TASK_SELECT });
        return toTaskView(task);
    }

    // Any project member may edit the task; moving it between sprints needs a project manager.
    async update(user: AccessTokenPayload, taskId: string, dto: UpdateTaskDto): Promise<TaskView> {
        const actor = await this.access.resolveActor(user);
        const { task, access } = await this.loadTask(actor, taskId);
        const data: Prisma.WorkTaskUncheckedUpdateInput = {};

        if (dto.title !== undefined) data.title = dto.title;
        if (dto.description !== undefined) data.description = dto.description || null;
        if (dto.status !== undefined && dto.status !== task.status) {
            data.status = dto.status;
            // Drives on-time reporting; cleared again if the task is reopened.
            data.completedAt = dto.status === WorkTaskStatus.DONE ? new Date() : null;
        }
        if (dto.dueDate !== undefined) data.dueDate = dto.dueDate === null ? null : toDbDate(dto.dueDate);

        if (dto.assigneeId !== undefined && dto.assigneeId !== task.assigneeId) {
            if (dto.assigneeId !== null) await this.access.assertProjectMember(task.projectId, dto.assigneeId);
            data.assigneeId = dto.assigneeId;
        }

        if (dto.sprintId !== undefined && dto.sprintId !== task.sprintId) {
            if (dto.sprintId === null) this.assertCanManage(access);
            else await this.assertCanSchedule(access, dto.sprintId);
            data.sprintId = dto.sprintId;
        }

        // A completed sprint's record is frozen, so reopening its finished task moves it to the backlog.
        const reopening = task.status === WorkTaskStatus.DONE && dto.status !== undefined && dto.status !== WorkTaskStatus.DONE;
        if (reopening && dto.sprintId === undefined && task.sprint?.status === WorkSprintStatus.COMPLETED) {
            data.sprintId = null;
        }

        const updated = await this.prisma.workTask.update({ where: { id: taskId }, data, select: TASK_SELECT });
        return toTaskView(updated);
    }

    async listComments(user: AccessTokenPayload, taskId: string, query: PageQueryDto): Promise<Page<CommentView>> {
        const actor = await this.access.resolveActor(user);
        await this.loadTask(actor, taskId);

        const [comments, total] = await this.prisma.$transaction([
            this.prisma.workTaskComment.findMany({
                where: { taskId },
                select: { id: true, body: true, createdAt: true, author: { select: EMPLOYEE_SUMMARY_SELECT } },
                orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
                ...pageArgs(query),
            }),
            this.prisma.workTaskComment.count({ where: { taskId } }),
        ]);
        const items = comments.map((c) => ({ id: c.id, body: c.body, author: toEmployeeSummary(c.author), createdAt: c.createdAt }));
        return { items, page: query.page, pageSize: query.pageSize, total };
    }

    async addComment(user: AccessTokenPayload, taskId: string, dto: CreateCommentDto): Promise<CommentView> {
        const actor = await this.access.resolveActor(user);
        await this.loadTask(actor, taskId);

        const comment = await this.prisma.workTaskComment.create({
            data: { taskId, authorId: actor.employeeId, body: dto.body },
            select: { id: true, body: true, createdAt: true, author: { select: EMPLOYEE_SUMMARY_SELECT } },
        });
        return { id: comment.id, body: comment.body, author: toEmployeeSummary(comment.author), createdAt: comment.createdAt };
    }

    // 404 for tasks in other organizations or in projects the caller cannot see.
    private async loadTask(actor: WorkActor, taskId: string) {
        const task = await this.prisma.workTask.findFirst({
            where: { id: taskId, project: { organizationId: actor.organizationId } },
            select: { id: true, projectId: true, status: true, assigneeId: true, sprintId: true, sprint: { select: { status: true } } },
        });
        if (!task) throw new NotFoundException('Task not found');

        try {
            const access = await this.access.getProjectAccess(actor, task.projectId);
            return { task, access };
        } catch (error) {
            if (error instanceof NotFoundException) throw new NotFoundException('Task not found');
            throw error;
        }
    }

    private assertCanManage(access: ProjectAccess): void {
        if (!access.canManage) throw new ForbiddenException('Only project managers can change a task’s sprint');
    }

    private async assertCanSchedule(access: ProjectAccess, sprintId: string): Promise<void> {
        this.assertCanManage(access);
        const sprint = await this.prisma.workSprint.findFirst({
            where: {
                id: sprintId,
                projectId: access.projectId,
                status: { in: [WorkSprintStatus.PLANNED, WorkSprintStatus.ACTIVE] },
            },
            select: { id: true },
        });
        if (!sprint) {
            throw workBadRequest(WorkErrorCode.SPRINT_NOT_ASSIGNABLE, 'Tasks can only be added to a planned or active sprint in the same project');
        }
    }

    private async page(where: Prisma.WorkTaskWhereInput, query: PageQueryDto): Promise<Page<TaskView>> {
        const [tasks, total] = await this.prisma.$transaction([
            this.prisma.workTask.findMany({ where, select: TASK_SELECT, orderBy: TASK_ORDER, ...pageArgs(query) }),
            this.prisma.workTask.count({ where }),
        ]);
        return { items: tasks.map(toTaskView), page: query.page, pageSize: query.pageSize, total };
    }
}
