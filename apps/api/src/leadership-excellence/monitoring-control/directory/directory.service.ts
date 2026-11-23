import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import type { AccessTokenPayload } from 'src/auth/access-token-payload';
import { loadActor } from '../monitoring-scope';

/** Display names for the ids the Area 05 screens show. Read-only, own company only. */
@Injectable()
export class DirectoryService {
  constructor(private readonly prisma: PrismaService) {}

  async get(user: AccessTokenPayload) {
    const organizationId = user.organizationId;
    const [actor, employees, departments] = await Promise.all([
      loadActor(this.prisma, user),
      this.prisma.employee.findMany({
        where: { organizationId },
        select: { id: true, firstName: true, lastName: true },
      }),
      this.prisma.department.findMany({
        where: { organizationId },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    return {
      me: actor.employeeId,
      people: Object.fromEntries(
        employees.map((e) => [e.id, `${e.firstName} ${e.lastName}`.trim()]),
      ),
      departments: departments.map((d) => ({ id: d.id, name: d.name })),
    };
  }
}
