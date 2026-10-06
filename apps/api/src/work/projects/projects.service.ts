import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, WorkProjectRole, WorkProjectStatus, WorkSprintStatus, WorkTaskStatus } from 'db';
import type { AccessTokenPayload } from 'src/auth/access-token-payload';
import { PrismaService } from 'src/prisma/prisma.service';
import { Page, PageQueryDto, pageArgs } from '../dto/common.dto';
import { CreateProjectDto, ProjectMemberDto, UpdateProjectDto } from '../dto/project.dto';
import { WorkAccessService } from '../work-access.service';
import { fromDbDate, toDbDate } from '../work-date';
import { WorkErrorCode, workBadRequest, workConflict } from '../work-errors';
import { EMPLOYEE_SUMMARY_SELECT, EmployeeSummary, toEmployeeSummary } from '../work-people';

export type ProjectSummary = {
    id: string;
    name: string;
    description: string | null;
    status: WorkProjectStatus;
    targetDate: string | null;
    completedAt: Date | null;
    // Several sprints can run at once; oldest-started first.
    activeSprints: { id: string; name: string }[];
    taskCounts: { total: number; done: number };
    memberCount: number;
    myRole: WorkProjectRole | null;
    canManage: boolean;
    createdAt: Date;
    updatedAt: Date;
};

export type ProjectDetail = ProjectSummary & {
    createdBy: EmployeeSummary | null;
    members: { employee: EmployeeSummary; role: WorkProjectRole; joinedAt: Date }[];
};

const PROJECT_SELECT = {
    id: true,
    name: true,
    description: true,
    status: true,
    targetDate: true,
    completedAt: true,
    createdAt: true,
    updatedAt: true,
    sprints: {
        where: { status: WorkSprintStatus.ACTIVE },
        select: { id: true, name: true },
        orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
    },
    _count: { select: { members: true } },
} satisfies Prisma.WorkProjectSelect;

@Injectable()
export class ProjectsService {
    constructor(private prisma: PrismaService, private access: WorkAccessService) {}

    // Members see their projects; org project admins see every project in the organization.
    async list(user: AccessTokenPayload, query: PageQueryDto): Promise<Page<ProjectSummary>> {
        const actor = await this.access.resolveActor(user);
        const orgAdmin = this.access.isOrgProjectAdmin(actor);
        const where: Prisma.WorkProjectWhereInput = {
            organizationId: actor.organizationId,
            ...(orgAdmin ? {} : { members: { some: { employeeId: actor.employeeId } } }),
        };

        const [projects, total] = await this.prisma.$transaction([
            this.prisma.workProject.findMany({
                where,
                select: {
                    ...PROJECT_SELECT,
                    members: { where: { employeeId: actor.employeeId }, select: { role: true } },
                },
                orderBy: [{ name: 'asc' }, { id: 'asc' }],
                ...pageArgs(query),
            }),
            this.prisma.workProject.count({ where }),
        ]);

        const counts = await this.taskCounts(projects.map((p) => p.id));
        const items = projects.map((p) => {
            const myRole = p.members[0]?.role ?? null;
            return this.toSummary(p, counts.get(p.id), myRole, orgAdmin || myRole === WorkProjectRole.MANAGER);
        });
        return { items, page: query.page, pageSize: query.pageSize, total };
    }

    // The creator is always a MANAGER, whatever role the body gave them.
    async create(user: AccessTokenPayload, dto: CreateProjectDto): Promise<ProjectDetail> {
        const actor = await this.access.resolveActor(user);
        if (!this.access.canCreateProjects(actor)) throw new ForbiddenException('You cannot create projects');

        const members = this.withCreatorAsManager(dto.members ?? [], actor.employeeId);
        await this.access.assertCompanyEmployees(actor.organizationId, members.map((m) => m.employeeId));

        const project = await this.prisma.workProject.create({
            data: {
                organizationId: actor.organizationId,
                name: dto.name,
                description: dto.description || null,
                targetDate: dto.targetDate ? toDbDate(dto.targetDate) : null,
                createdById: actor.employeeId,
                members: { createMany: { data: members } },
            },
            select: { id: true },
        });
        return this.get(user, project.id);
    }

    async get(user: AccessTokenPayload, projectId: string): Promise<ProjectDetail> {
        const actor = await this.access.resolveActor(user);
        const access = await this.access.getProjectAccess(actor, projectId);

        const project = await this.prisma.workProject.findFirstOrThrow({
            where: { id: projectId, organizationId: actor.organizationId },
            select: {
                ...PROJECT_SELECT,
                createdBy: { select: EMPLOYEE_SUMMARY_SELECT },
                members: {
                    select: { role: true, joinedAt: true, employee: { select: EMPLOYEE_SUMMARY_SELECT } },
                    orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
                },
            },
        });

        const counts = await this.taskCounts([project.id]);
        const myRole = project.members.find((m) => m.employee.id === actor.employeeId)?.role ?? null;
        return {
            ...this.toSummary(project, counts.get(project.id), myRole, access.canManage),
            createdBy: toEmployeeSummary(project.createdBy),
            members: project.members.map((m) => ({ employee: toEmployeeSummary(m.employee), role: m.role, joinedAt: m.joinedAt })),
        };
    }

    // `members`, when present, replaces the whole list. Removing someone who still has
    // tasks assigned in this project is refused so ownership never changes silently.
    async update(user: AccessTokenPayload, projectId: string, dto: UpdateProjectDto): Promise<ProjectDetail> {
        const actor = await this.access.resolveActor(user);
        await this.access.assertCanManageProject(actor, projectId);

        const members = dto.members?.map((m) => ({ employeeId: m.employeeId, role: m.role ?? WorkProjectRole.MEMBER }));
        if (members) {
            if (!members.some((m) => m.role === WorkProjectRole.MANAGER)) {
                throw workBadRequest(WorkErrorCode.PROJECT_NEEDS_MANAGER, 'A project needs at least one manager');
            }
            await this.access.assertCompanyEmployees(actor.organizationId, members.map((m) => m.employeeId));
        }

        // Completing twice keeps the first completedAt, so on-time reporting is stable.
        if (dto.status !== undefined) {
            const current = await this.prisma.workProject.findUniqueOrThrow({ where: { id: projectId }, select: { status: true } });
            if (current.status === dto.status) dto = { ...dto, status: undefined };
        }

        await this.prisma.$transaction(async (tx) => {
            await tx.workProject.update({
                where: { id: projectId },
                data: {
                    ...(dto.name != null && { name: dto.name }),
                    ...(dto.description !== undefined && { description: dto.description || null }),
                    ...(dto.targetDate !== undefined && { targetDate: dto.targetDate && toDbDate(dto.targetDate) }),
                    ...(dto.status === WorkProjectStatus.COMPLETED && { status: dto.status, completedAt: new Date() }),
                    ...(dto.status === WorkProjectStatus.ACTIVE && { status: dto.status, completedAt: null }),
                },
            });
            if (members) await this.replaceMembers(tx, projectId, members);
        });

        return this.get(user, projectId);
    }

    private async replaceMembers(
        tx: Prisma.TransactionClient,
        projectId: string,
        members: { employeeId: string; role: WorkProjectRole }[],
    ): Promise<void> {
        const keep = members.map((m) => m.employeeId);
        const current = await tx.workProjectMember.findMany({ where: { projectId }, select: { employeeId: true, role: true } });
        const removed = current.filter((m) => !keep.includes(m.employeeId)).map((m) => m.employeeId);

        if (removed.length) {
            const assigned = await tx.workTask.findMany({
                where: { projectId, assigneeId: { in: removed } },
                select: { id: true, title: true, assigneeId: true },
                orderBy: { createdAt: 'asc' },
                take: 50,
            });
            if (assigned.length) {
                throw workConflict(
                    WorkErrorCode.MEMBER_HAS_ASSIGNED_TASKS,
                    'Reassign or unassign these tasks before removing their assignees from the project',
                    { tasks: assigned },
                );
            }
            await tx.workProjectMember.deleteMany({ where: { projectId, employeeId: { in: removed } } });
            // Completed sprints keep the team they finished with.
            const open = { projectId, status: { not: WorkSprintStatus.COMPLETED } };
            await tx.workSprintMember.deleteMany({ where: { sprint: open, employeeId: { in: removed } } });
            await tx.workSprint.updateMany({ where: { ...open, leadId: { in: removed } }, data: { leadId: null } });
        }

        const currentRoles = new Map(current.map((m) => [m.employeeId, m.role]));
        const added = members.filter((m) => !currentRoles.has(m.employeeId));
        if (added.length) {
            await tx.workProjectMember.createMany({ data: added.map((m) => ({ projectId, ...m })), skipDuplicates: true });
        }
        for (const m of members) {
            const role = currentRoles.get(m.employeeId);
            if (role && role !== m.role) {
                await tx.workProjectMember.update({
                    where: { projectId_employeeId: { projectId, employeeId: m.employeeId } },
                    data: { role: m.role },
                });
            }
        }
    }

    private withCreatorAsManager(members: ProjectMemberDto[], creatorId: string) {
        const others = members
            .filter((m) => m.employeeId !== creatorId)
            .map((m) => ({ employeeId: m.employeeId, role: m.role ?? WorkProjectRole.MEMBER }));
        return [{ employeeId: creatorId, role: WorkProjectRole.MANAGER }, ...others];
    }

    private async taskCounts(projectIds: string[]): Promise<Map<string, { total: number; done: number }>> {
        const counts = new Map<string, { total: number; done: number }>();
        if (!projectIds.length) return counts;

        const groups = await this.prisma.workTask.groupBy({
            by: ['projectId', 'status'],
            where: { projectId: { in: projectIds } },
            _count: { _all: true },
        });
        for (const g of groups) {
            const entry = counts.get(g.projectId) ?? { total: 0, done: 0 };
            entry.total += g._count._all;
            if (g.status === WorkTaskStatus.DONE) entry.done += g._count._all;
            counts.set(g.projectId, entry);
        }
        return counts;
    }

    private toSummary(
        project: Prisma.WorkProjectGetPayload<{ select: typeof PROJECT_SELECT }>,
        counts: { total: number; done: number } | undefined,
        myRole: WorkProjectRole | null,
        canManage: boolean,
    ): ProjectSummary {
        return {
            id: project.id,
            name: project.name,
            description: project.description,
            status: project.status,
            targetDate: project.targetDate ? fromDbDate(project.targetDate) : null,
            completedAt: project.completedAt,
            activeSprints: project.sprints,
            taskCounts: counts ?? { total: 0, done: 0 },
            memberCount: project._count.members,
            myRole,
            canManage,
            createdAt: project.createdAt,
            updatedAt: project.updatedAt,
        };
    }
}
