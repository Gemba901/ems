import { BadRequestException } from '@nestjs/common';
import { EscalationContactRule, RoleName, TaskPermissionRole } from 'db';
import { UserPayload } from './base.service';
import { DwmsSettingsService } from './settings.service';

export abstract class DwmsDirectoryService extends DwmsSettingsService {
  async listUsers(user: UserPayload) {
    const employee = await this.getEmployee(user.userId, user.organizationId);

    // List all users in same organization
    const users = await this.prisma.employee.findMany({
      where: { organizationId: user.organizationId },
      include: {
        user: {
          include: {
            organizations: {
              where: { organizationId: user.organizationId },
              include: { role: true },
            },
          },
        },
      },
    });

    return {
      count: users.length,
      users: users.map((u) => ({
        id: u.id,
        name: `${u.firstName} ${u.lastName}`,
        email: u.email,
        designation: u.jobTitle ?? 'Employee',
      })),
    };
  }

  async listReportees(user: UserPayload) {
    const employee = await this.getEmployee(user.userId, user.organizationId);
    const role = this.getDwmsRole(user.roleLevel);

    let allowedEmployees: any[] = [];

    if (role === 'MANAGEMENT') {
      // Management / Super Admin / HR can assign to anyone
      allowedEmployees = await this.prisma.employee.findMany({
        where: { organizationId: user.organizationId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          jobTitle: true,
        },
      });
    } else if (role === 'HOD') {
      // HOD can assign to other HODs, department members, or recursive reportees
      const reportees = await this.listReporteesRecursive(employee.id);

      const departmentAndHods = await this.prisma.employee.findMany({
        where: {
          organizationId: user.organizationId,
          OR: [
            employee.departmentId
              ? { departmentId: employee.departmentId }
              : undefined,
            {
              user: {
                organizations: {
                  some: {
                    organizationId: user.organizationId,
                    role: { name: RoleName.HOD },
                  },
                },
              },
            },
          ].filter(
            (cond): cond is Exclude<typeof cond, undefined> =>
              cond !== undefined,
          ),
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          jobTitle: true,
        },
      });

      const uniqueMap = new Map<string, any>();
      departmentAndHods.forEach((emp) => uniqueMap.set(emp.id, emp));
      reportees.forEach((emp) =>
        uniqueMap.set(emp.id, {
          id: emp.id,
          firstName: emp.firstName,
          lastName: emp.lastName,
          email: emp.email,
          jobTitle: emp.jobTitle,
        }),
      );
      uniqueMap.delete(employee.id);

      allowedEmployees = Array.from(uniqueMap.values());
    } else {
      // Operator/Manager can assign to recursive reportees
      const reportees = await this.listReporteesRecursive(employee.id);
      allowedEmployees = reportees.map((emp) => ({
        id: emp.id,
        firstName: emp.firstName,
        lastName: emp.lastName,
        email: emp.email,
        jobTitle: emp.jobTitle,
      }));
    }

    return {
      count: allowedEmployees.length,
      users: allowedEmployees.map((u) => ({
        id: u.id,
        name: `${u.firstName} ${u.lastName}`,
        email: u.email,
        designation: u.jobTitle ?? 'Employee',
      })),
    };
  }

  private async listManagementEmployees(organizationId: string) {
    const employees = await this.prisma.employee.findMany({
      where: {
        organizationId,
        user: {
          organizations: {
            some: {
              organizationId,
              role: {
                name: {
                  in: [
                    RoleName.SUPER_ADMIN,
                    RoleName.ADMIN,
                    RoleName.MANAGEMENT,
                    RoleName.HR,
                  ],
                },
              },
            },
          },
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        jobTitle: true,
      },
    });

    return employees;
  }

  async listApproverCandidates(user: UserPayload, assignedToId: string) {
    const employee = await this.getEmployee(user.userId, user.organizationId);
    if (!assignedToId) {
      throw new BadRequestException('assignedToId is required');
    }

    const assignee = await this.prisma.employee.findFirst({
      where: { id: assignedToId, organizationId: user.organizationId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        jobTitle: true,
        reportingManagerId: true,
        departmentId: true,
      },
    });

    if (!assignee) {
      throw new BadRequestException(
        'Assignee not found in the current organization',
      );
    }

    const creator = await this.prisma.employee.findFirst({
      where: { userId: user.userId, organizationId: user.organizationId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        jobTitle: true,
        reportingManagerId: true,
        departmentId: true,
      },
    });

    const config = await this.prisma.dwmsPermissionConfig.findUnique({
      where: { organizationId: user.organizationId },
      select: {
        approverRoles: true,
        approverCustomEmployeeIds: true,
      },
    });

    const allowed = new Map<
      string,
      { id: string; name: string; email: string | null; designation: string }
    >();
    const addEmployee = (
      e:
        | {
            id: string;
            firstName: string;
            lastName: string;
            email: string | null;
            jobTitle?: string | null;
          }
        | null
        | undefined,
    ) => {
      if (!e) return;
      if (e.id === assignee.id) return;
      allowed.set(e.id, {
        id: e.id,
        name: `${e.firstName} ${e.lastName}`.trim(),
        email: e.email,
        designation: e.jobTitle ?? 'Employee',
      });
    };

    const addMany = (
      list: Array<{
        id: string;
        firstName: string;
        lastName: string;
        email: string | null;
        jobTitle?: string | null;
      }>,
    ) => {
      list.forEach(addEmployee);
    };

    const approverRoles = config?.approverRoles?.length
      ? config.approverRoles
      : [TaskPermissionRole.OWNER];

    if (approverRoles.includes(TaskPermissionRole.ANYONE)) {
      const all = await this.prisma.employee.findMany({
        where: { organizationId: user.organizationId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          jobTitle: true,
        },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      });
      addMany(all);
    }

    if (approverRoles.includes(TaskPermissionRole.OWNER)) {
      addEmployee(creator);
    }

    if (approverRoles.includes(TaskPermissionRole.DIRECT_MANAGER)) {
      if (assignee.reportingManagerId) {
        const manager = await this.prisma.employee.findUnique({
          where: { id: assignee.reportingManagerId },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            jobTitle: true,
          },
        });
        addEmployee(manager);
      }
    }

    if (approverRoles.includes(TaskPermissionRole.HIGHER_LEVEL_MANAGERS)) {
      if (assignee.reportingManagerId) {
        const directManager = await this.prisma.employee.findUnique({
          where: { id: assignee.reportingManagerId },
          select: {
            id: true,
            reportingManagerId: true,
            firstName: true,
            lastName: true,
            email: true,
            jobTitle: true,
          },
        });
        if (directManager?.reportingManagerId) {
          const higherManager = await this.prisma.employee.findUnique({
            where: { id: directManager.reportingManagerId },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              jobTitle: true,
            },
          });
          addEmployee(higherManager);
        }
      }
    }

    if (approverRoles.includes(TaskPermissionRole.HOD)) {
      if (assignee.departmentId) {
        const hod = await this.prisma.employee.findFirst({
          where: {
            organizationId: user.organizationId,
            departmentId: assignee.departmentId,
            user: {
              organizations: {
                some: {
                  organizationId: user.organizationId,
                  role: {
                    name: RoleName.HOD,
                  },
                },
              },
            },
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            jobTitle: true,
          },
        });
        addEmployee(hod);
      }
    }

    if (approverRoles.includes(TaskPermissionRole.MANAGEMENT)) {
      addMany(await this.listManagementEmployees(user.organizationId));
    }

    if (approverRoles.includes(TaskPermissionRole.CUSTOM)) {
      const customIds = config?.approverCustomEmployeeIds ?? [];
      if (customIds.length > 0) {
        const customEmployees = await this.prisma.employee.findMany({
          where: { id: { in: customIds }, organizationId: user.organizationId },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            jobTitle: true,
          },
          orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        });
        addMany(customEmployees);
      }
    }

    return {
      count: allowed.size,
      users: Array.from(allowed.values()).sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    };
  }

  async listOverdueAlertCandidates(user: UserPayload, assignedToId: string) {
    await this.getEmployee(user.userId, user.organizationId);
    if (!assignedToId) {
      throw new BadRequestException('assignedToId is required');
    }

    const assignee = await this.prisma.employee.findFirst({
      where: { id: assignedToId, organizationId: user.organizationId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        jobTitle: true,
        reportingManagerId: true,
        departmentId: true,
      },
    });

    if (!assignee) {
      throw new BadRequestException(
        'Assignee not found in the current organization',
      );
    }

    const config = await this.prisma.dwmsPermissionConfig.findUnique({
      where: { organizationId: user.organizationId },
      select: {
        escalationContactRules: true,
        customEscalationContactIds: true,
      },
    });

    const allowed = new Map<
      string,
      { id: string; name: string; email: string | null; designation: string }
    >();
    const addEmployee = (
      e:
        | {
            id: string;
            firstName: string;
            lastName: string;
            email: string | null;
            jobTitle?: string | null;
          }
        | null
        | undefined,
    ) => {
      if (!e) return;
      if (e.id === assignee.id) return;
      allowed.set(e.id, {
        id: e.id,
        name: `${e.firstName} ${e.lastName}`.trim(),
        email: e.email,
        designation: e.jobTitle ?? 'Employee',
      });
    };

    const addMany = (
      list: Array<{
        id: string;
        firstName: string;
        lastName: string;
        email: string | null;
        jobTitle?: string | null;
      }>,
    ) => {
      list.forEach(addEmployee);
    };

    const escalationRules = config?.escalationContactRules?.length
      ? config.escalationContactRules
      : ['ASSIGNER'];

    if (escalationRules.includes('ASSIGNER')) {
      const assigner = await this.prisma.employee.findFirst({
        where: { userId: user.userId, organizationId: user.organizationId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          jobTitle: true,
        },
      });
      addEmployee(assigner);
    }

    if (escalationRules.includes('MANAGER') && assignee.reportingManagerId) {
      let managerId: string | null = assignee.reportingManagerId;
      const visited = new Set<string>();

      while (managerId && !visited.has(managerId)) {
        visited.add(managerId);
        const manager = await this.prisma.employee.findUnique({
          where: { id: managerId },
          select: {
            id: true,
            reportingManagerId: true,
            firstName: true,
            lastName: true,
            email: true,
            jobTitle: true,
          },
        });

        if (!manager) break;
        addEmployee(manager);
        managerId = manager.reportingManagerId;
      }
    }

    if (
      escalationRules.includes('HIGHER_LEVEL_MANAGERS') &&
      assignee.reportingManagerId
    ) {
      const directManager = await this.prisma.employee.findUnique({
        where: { id: assignee.reportingManagerId },
        select: { id: true, reportingManagerId: true },
      });
      if (directManager?.reportingManagerId) {
        const higherManager = await this.prisma.employee.findUnique({
          where: { id: directManager.reportingManagerId },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            jobTitle: true,
          },
        });
        addEmployee(higherManager);
      }
    }

    if (escalationRules.includes('HOD') && assignee.departmentId) {
      const hod = await this.prisma.employee.findFirst({
        where: {
          organizationId: user.organizationId,
          departmentId: assignee.departmentId,
          user: {
            organizations: {
              some: {
                organizationId: user.organizationId,
                role: {
                  name: RoleName.HOD,
                },
              },
            },
          },
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          jobTitle: true,
        },
      });
      addEmployee(hod);
    }

    if (escalationRules.includes('CUSTOM')) {
      const customIds = config?.customEscalationContactIds ?? [];
      if (customIds.length > 0) {
        const customEmployees = await this.prisma.employee.findMany({
          where: { id: { in: customIds }, organizationId: user.organizationId },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            jobTitle: true,
          },
          orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        });
        addMany(customEmployees);
      }
    }

    return {
      count: allowed.size,
      users: Array.from(allowed.values()).sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    };
  }

  protected async listReporteesRecursive(managerId: string) {
    const seen = new Set<string>();
    const result: any[] = [];
    let queue = [managerId];

    while (queue.length > 0) {
      const batch = await this.prisma.employee.findMany({
        where: { reportingManagerId: { in: queue } },
        include: {
          user: {
            include: {
              organizations: {
                include: { role: true },
              },
            },
          },
        },
      });

      const nextQueue: string[] = [];

      for (const u of batch) {
        if (seen.has(u.id)) continue;
        seen.add(u.id);
        result.push(u);
        nextQueue.push(u.id);
      }

      queue = nextQueue;
    }

    return result;
  }
}
