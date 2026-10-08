import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { WorkProjectRole } from 'db';
import type { AccessTokenPayload } from 'src/auth/access-token-payload';
import { Role } from 'src/common/enum/role.enum';
import { PrismaService } from 'src/prisma/prisma.service';
import { WorkErrorCode, workBadRequest } from './work-errors';
import { ATTENDANCE_MANAGER_ROLES, ORG_PROJECT_ADMIN_ROLES, PROJECT_CREATOR_ROLES } from './work-access.policy';

export type WorkActor = {
    employeeId: string;
    organizationId: string;
    role: Role;
    timeZone: string;
};

export type ProjectAccess = {
    projectId: string;
    isMember: boolean;
    canManage: boolean;
};

@Injectable()
export class WorkAccessService {
    constructor(private prisma: PrismaService) {}

    // The caller's identity always comes from the token, never from a request body.
    async resolveActor(user: AccessTokenPayload): Promise<WorkActor> {
        const employee = await this.prisma.employee.findFirst({
            where: { userId: user.userId, organizationId: user.organizationId },
            select: { id: true, organization: { select: { timeZone: true } } },
        });
        if (!employee) throw new ForbiddenException('No employee profile linked to your account');

        return {
            employeeId: employee.id,
            organizationId: user.organizationId,
            role: user.roleLevel,
            timeZone: employee.organization.timeZone,
        };
    }

    canCreateProjects(actor: WorkActor): boolean {
        return PROJECT_CREATOR_ROLES.includes(actor.role);
    }

    isOrgProjectAdmin(actor: WorkActor): boolean {
        return ORG_PROJECT_ADMIN_ROLES.includes(actor.role);
    }

    canManageAttendance(actor: WorkActor): boolean {
        return ATTENDANCE_MANAGER_ROLES.includes(actor.role);
    }

    assertAttendanceManager(actor: WorkActor): void {
        if (!this.canManageAttendance(actor)) throw new ForbiddenException('You cannot manage attendance');
    }

    // 404 (not 403) when the project is in another org or the caller can't see it,
    // so we never reveal that a resource exists.
    async getProjectAccess(actor: WorkActor, projectId: string): Promise<ProjectAccess> {
        const project = await this.prisma.workProject.findFirst({
            where: { id: projectId, organizationId: actor.organizationId },
            select: {
                id: true,
                members: { where: { employeeId: actor.employeeId }, select: { role: true } },
            },
        });

        const membership = project?.members[0];
        const orgAdmin = this.isOrgProjectAdmin(actor);
        if (!project || (!membership && !orgAdmin)) throw new NotFoundException('Project not found');

        return {
            projectId: project.id,
            isMember: !!membership,
            canManage: orgAdmin || membership?.role === WorkProjectRole.MANAGER,
        };
    }

    async assertCanManageProject(actor: WorkActor, projectId: string): Promise<ProjectAccess> {
        const access = await this.getProjectAccess(actor, projectId);
        if (!access.canManage) throw new ForbiddenException('Only project managers can do this');
        return access;
    }

    // Employees whose reporting manager is the caller (direct reports only, not the whole chain).
    async directReportIds(actor: WorkActor): Promise<string[]> {
        const reports = await this.prisma.employee.findMany({
            where: { reportingManagerId: actor.employeeId, organizationId: actor.organizationId },
            select: { id: true },
        });
        return reports.map((r) => r.id);
    }

    async isReportingManagerOf(actor: WorkActor, employeeId: string): Promise<boolean> {
        const count = await this.prisma.employee.count({
            where: { id: employeeId, reportingManagerId: actor.employeeId, organizationId: actor.organizationId },
        });
        return count > 0;
    }

    async assertCompanyEmployees(organizationId: string, employeeIds: string[]): Promise<void> {
        const ids = [...new Set(employeeIds)];
        if (ids.length === 0) return;

        const count = await this.prisma.employee.count({ where: { id: { in: ids }, organizationId } });
        if (count !== ids.length) {
            throw workBadRequest(WorkErrorCode.EMPLOYEE_NOT_IN_COMPANY, 'One or more employees are not in your company');
        }
    }

    async assertProjectMember(projectId: string, employeeId: string): Promise<void> {
        const member = await this.prisma.workProjectMember.findUnique({
            where: { projectId_employeeId: { projectId, employeeId } },
            select: { employeeId: true },
        });
        if (!member) {
            throw workBadRequest(WorkErrorCode.ASSIGNEE_NOT_MEMBER, 'The assignee must be a member of this project');
        }
    }
}
