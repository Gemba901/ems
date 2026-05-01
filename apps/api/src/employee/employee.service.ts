import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';


@Injectable()
export class EmployeeService {
    constructor (private prisma: PrismaService) {}

    async onboardEmployee(data: any, organizationId: string) {
        // Reject if this email or phone already belongs to an employee in THIS org
        const orConditions: any[] = [{ email: data.email, organizationId }];
        if (data.phone) orConditions.push({ phone: data.phone, organizationId });

        const existingInOrg = await this.prisma.employee.findFirst({
            where: { OR: orConditions },
        });
        if (existingInOrg) throw new BadRequestException('An employee with this email or phone already exists in this organization');

        // Check if a user account already exists (in any org) by email or phone
        const userConditions: any[] = [{ email: data.email }];
        if (data.phone) userConditions.push({ phone: data.phone });

        const existingUser = await this.prisma.user.findFirst({
            where: { OR: userConditions },
        });

        const result = await this.prisma.$transaction(async (tx) => {
            let userId: string;

            if (existingUser) {
                // Reuse the existing user account — just add a new org membership
                userId = existingUser.id;

                const alreadyMember = await tx.userOrganization.findUnique({
                    where: { userId_organizationId: { userId, organizationId } },
                });
                if (alreadyMember) throw new BadRequestException('This user is already a member of this organization');

                await tx.userOrganization.create({
                    data: { userId, organizationId, roleId: Number(data.roleId) },
                });
            } else {
                // Brand-new user
                const newUser = await tx.user.create({
                    data: {
                        email: data.email,
                        phone: data.phone ?? `no-phone-${Date.now()}`,
                        name: `${data.firstName} ${data.lastName}`,
                    },
                });
                userId = newUser.id;

                await tx.userOrganization.create({
                    data: { userId, organizationId, roleId: Number(data.roleId) },
                });
            }

            return tx.employee.create({
                data: {
                    firstName: data.firstName,
                    lastName: data.lastName,
                    email: data.email,
                    phone: data.phone ?? null,
                    departmentId: data.departmentId ?? null,
                    organizationId,
                    userId,
                },
                include: {
                    department: true,
                    user: {
                        include: {
                            organizations: {
                                where: { organizationId },
                                include: { role: true },
                            },
                        },
                    },
                },
            });
        });

        return result;
    }

    async getDepartmentsByOrganization(organizationId: string) {
        return this.prisma.department.findMany({
            where: { organizationId },
            orderBy: { name: 'asc' },
        });
    }

    // get the employee record that belongs to the logged-in user within their current org
    async getMyEmployeeProfile(userId: string, organizationId: string) {
        const employee = await this.prisma.employee.findFirst({
            where: { userId, organizationId },
            include: {
                department: true,
                user: {
                    include: {
                        organizations: {
                            where: { organizationId },
                            include: { role: true },
                        },
                    },
                },
            },
        });
        if (!employee) throw new BadRequestException('Employee profile not found for this user');
        return employee;
    }

    // get employee details by id
    async getEmployeeById(id: string) {
        const employee = await this.prisma.employee.findUnique({
            where: { id },
            include: {
                department: true,
                user: {
                    include: {
                        organizations: { include: { role: true } },
                    },
                },
            },
        });
        if (!employee) throw new BadRequestException('Employee not found');
        return employee;
    }

    // get all employees in an organization with pagination
    async getEmployeesByOrganization(organizationId: string, skip: number = 0, take: number = 10) {
        return this.prisma.employee.findMany({
            where: { organizationId },
            include: {
                department: true,
                user: true,
            },
            skip,
            take,
        });
    }

    // count total employees in an organization
    async countEmployeesByOrganization(organizationId: string): Promise<number> {
        return this.prisma.employee.count({
            where: { organizationId }
        });
    }

    // get employees in a specific department with pagination
    async getEmployeesByDepartment(departmentId: string, organizationId?: string, skip: number = 0, take: number = 10) {
        const query: any = { departmentId };
        if (organizationId) query.organizationId = organizationId;

        return this.prisma.employee.findMany({
            where: query,
            include: {
                department: true,
                user: true,
            },
            skip,
            take,
        });
    }

    // count total employees in a department
    async countEmployeesByDepartment(departmentId: string): Promise<number> {
        return this.prisma.employee.count({
            where: { departmentId }
        });
    }

    // update employee details
    async updateEmployee(id: string, data: any) {
        const employee = await this.prisma.employee.findUnique({ where: { id } });
        if (!employee) throw new BadRequestException('Employee not found');

        const updatedEmployee = await this.prisma.employee.update({
            where: { id },
            data: {
                firstName: data.firstName,
                lastName: data.lastName,
                email: data.email,
                departmentId: data.departmentId,
            }
        });

        if (data.email || data.phone) {
            await this.prisma.user.update({
                where: { id: employee.userId! },
                data: {
                    email: data.email,
                    phone: data.phone,
                }
            });
        }

        return updatedEmployee;
    }

    // delete employee — removes org membership; deletes user only if they have no remaining memberships
    async deleteEmployee(id: string) {
        const employee = await this.prisma.employee.findUnique({ where: { id } });
        if (!employee) throw new BadRequestException('Employee not found');

        await this.prisma.$transaction(async (tx) => {
            if (employee.userId) {
                await tx.userOrganization.deleteMany({
                    where: { userId: employee.userId, organizationId: employee.organizationId },
                });
            }

            await tx.employee.delete({ where: { id } });

            if (employee.userId) {
                const remaining = await tx.userOrganization.count({
                    where: { userId: employee.userId },
                });
                if (remaining === 0) {
                    await tx.user.delete({ where: { id: employee.userId } });
                }
            }
        });

        return { message: 'Employee deleted successfully' };
    }
}
