import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, WorkProjectRole } from 'db';
import type { AccessTokenPayload } from 'src/auth/access-token-payload';
import { PrismaService } from 'src/prisma/prisma.service';
import { PeopleQueryDto } from '../dto/people.dto';
import { WorkAccessService } from '../work-access.service';
import { EMPLOYEE_SUMMARY_SELECT, EmployeeSummary, toEmployeeSummary } from '../work-people';

const PEOPLE_LIMIT = 20;

@Injectable()
export class PeopleService {
    constructor(private prisma: PrismaService, private access: WorkAccessService) {}

    // Name lookup for member, assignee and team-attendance pickers. Returns only id and name,
    // and only to callers who can add people to something: project creators, managers of
    // at least one project, and attendance managers.
    async search(user: AccessTokenPayload, query: PeopleQueryDto): Promise<EmployeeSummary[]> {
        const actor = await this.access.resolveActor(user);
        if (!this.access.canCreateProjects(actor) && !this.access.canManageAttendance(actor)) {
            const managesProject = await this.prisma.workProjectMember.findFirst({
                where: {
                    employeeId: actor.employeeId,
                    role: WorkProjectRole.MANAGER,
                    project: { organizationId: actor.organizationId },
                },
                select: { projectId: true },
            });
            if (!managesProject) throw new ForbiddenException('You cannot look up employees');
        }

        const terms = (query.search ?? '').split(/\s+/).filter(Boolean).slice(0, 4);
        const where: Prisma.EmployeeWhereInput = {
            organizationId: actor.organizationId,
            AND: terms.map((term) => ({
                OR: [
                    { firstName: { contains: term, mode: 'insensitive' } },
                    { lastName: { contains: term, mode: 'insensitive' } },
                ],
            })),
        };
        const employees = await this.prisma.employee.findMany({
            where,
            select: EMPLOYEE_SUMMARY_SELECT,
            orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { id: 'asc' }],
            take: PEOPLE_LIMIT,
        });
        return employees.map((e) => toEmployeeSummary(e));
    }
}
