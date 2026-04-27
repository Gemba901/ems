import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';


@Injectable()
export class EmployeeService {
    constructor (private prisma: PrismaService) {}

    async onboardEmployee(data: any, organizationId: string) {
        const orConditions: any[] = [{ email: data.email }];
        if (data.phone) orConditions.push({ phone: data.phone });

        const existing = await this.prisma.employee.findFirst({
            where: { OR: orConditions },
        });
        if (existing) throw new BadRequestException('Employee with this email or phone already exists');

        const result = await this.prisma.$transaction(async (tx) => {
            const newUser = await tx.user.create({
                data: {
                    email: data.email,
                    phone: data.phone ?? `no-phone-${Date.now()}`,
                    name: `${data.firstName} ${data.lastName}`,
                    roleId: Number(data.roleId),
                    organizationId,
                },
            });

            const newEmployee = await tx.employee.create({
                data: {
                    firstName: data.firstName,
                    lastName: data.lastName,
                    email: data.email,
                    phone: data.phone ?? null,
                    departmentId: data.departmentId ?? null,
                    organizationId,
                    userId: newUser.id,
                },
                include: {
                    department: true,
                    user: { include: { role: true } },
                },
            });

            return newEmployee;
        });

        return result;
    }

    async getDepartmentsByOrganization(organizationId: string) {
        return this.prisma.department.findMany({
            where: { organizationId },
            orderBy: { name: 'asc' },
        });
    }

    // get the employee record that belongs to the logged-in user
    async getMyEmployeeProfile(userId: string) {
        const employee = await this.prisma.employee.findUnique({
            where: { userId },
            include: {
                department: true,
                user: { include: { role: true } },
            }
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
                user: { include: { role: true } },
            }
        })
        if (!employee) throw new BadRequestException('Employee not found');
        return employee;
    }

    // get all employees in an organization with pagination
    async getEmployeesByOrganization(organizationId: string, skip: number = 0, take: number = 10) {
        const employees = await this.prisma.employee.findMany({
            where: { organizationId },
            include: {
                department: true,
                user: true,
            },
            skip,
            take,
        })
        return employees;
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
        if (organizationId) {
            query.organizationId = organizationId;
        }

        const employees = await this.prisma.employee.findMany({
            where: query,
            include: {
                department: true,
                user: true,
            },
            skip,
            take,
        })
        return employees;
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

        // also update the user record if email or phone is updated
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

    // delete employee
    async deleteEmployee(id: string) {
        const employee = await this.prisma.employee.findUnique({ where: { id } });
        if (!employee) throw new BadRequestException('Employee not found');

        // use a transaction to delete employee and user together
        await this.prisma.$transaction(async (tx) => {
            await tx.employee.delete({ where: { id } });
            await tx.user.delete({ where: { id: employee.userId! } });
        });

        return { message: 'Employee deleted successfully' };
    }

}
