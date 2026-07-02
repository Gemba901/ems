import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
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

    // rename a department (always allowed regardless of employee count)
    async updateDepartment(id: string, name: string, organizationId: string) {
        if (!name?.trim()) {
            throw new BadRequestException('Department name is required');
        }
        const dept = await this.prisma.department.findUnique({ where: { id } });
        if (!dept || dept.organizationId !== organizationId) {
            throw new NotFoundException('Department not found');
        }
        return this.prisma.department.update({
            where: { id },
            data: { name: name.trim() },
        });
    }

    // delete a department — only if it has zero employees
    async deleteDepartment(id: string, organizationId: string) {
        const dept = await this.prisma.department.findUnique({
            where: { id },
            include: {
                _count: { select: { employees: true, suggestions: true } },
            },
        });
        if (!dept || dept.organizationId !== organizationId) {
            throw new NotFoundException('Department not found');
        }
        if (dept._count.employees > 0) {
            throw new ConflictException('Cannot delete: this department still has employees assigned');
        }
        if (dept._count.suggestions > 0) {
            throw new ConflictException('Cannot delete: this department has suggestions linked to it');
        }
        return this.prisma.department.delete({ where: { id } });
    }
}
