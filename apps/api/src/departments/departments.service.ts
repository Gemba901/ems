import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class DepartmentsService {
    constructor(private prisma: PrismaService) {}   
    
    // create a new department in an organization
    async createDepartment(name: string, organizationId: string) {
        return this.prisma.department.create({
            data: {
                name,
                organizationId,
            }
        })
    }

    // get all departments in an organization with employee count
    async getDepartments(organizationId: string) {
        return this.prisma.department.findMany({
            where: { organizationId },
            include: {
                _count: {
                    select: { employees: true }
                }
            }
        })
    }

    // get a single department by id with employee count
    async getDepartmentById(id: string) {
        return this.prisma.department.findUnique({
            where: { id },
            include: {
                _count: {
                    select: { employees: true }
                }
            }
        })
    }
}
