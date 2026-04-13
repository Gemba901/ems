import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';


@Injectable()
export class EmployeeService {
    constructor (private prisma: PrismaService) {}

    async onboardEmployee(data: any, organizationId: string) {
        const existing = await this.prisma.employee.findFirst({
            where: {
                OR: [
                    { email: data.email },
                    { phone: data.phone }
                ]
            }
        })

    if (existing) throw new BadRequestException('Employee with this email or phone already exists');

    // use a transaction to create user and employee together

    const result = await this.prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
            data: {
                email: data.email,
                phone: data.phone,
                name: `${data.firstName} ${data.lastName}`,
                roleId: data.roleId,
                organizationId: data.organizationId,
            }
        });

        const newEmployee = await tx.employee.create({
            data: {
                firstName: data.firstName,
                lastName: data.lastName,
                email: data.email,
                departmentId: data.departmentId,
                organizationId: data.organizationId,
                userId: newUser.id,
            }
        });

        return { user: newUser, employee: newEmployee };
    });

    return result;
    }
}
