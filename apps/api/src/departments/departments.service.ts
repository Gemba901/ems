import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import type { Prisma } from 'db';
import { cleanDepartmentName, departmentNameIssue, departmentNameKey, departmentImportKey, MAX_DEPARTMENTS_PER_SETUP } from './department-names';

@Injectable()
export class DepartmentsService {
    constructor(private prisma: PrismaService) {}

    private name(value: unknown): string {
        const issue = departmentNameIssue(value);
        if (issue) throw new BadRequestException(issue);
        return cleanDepartmentName(value as string);
    }

    // One short lock for department-name writes in this company only. The single
    // create and rename paths participate too; a retry cannot create a second copy.
    private write<T>(organizationId: string, work: (tx: Prisma.TransactionClient) => Promise<T>) {
        if (!organizationId) throw new BadRequestException('Company context is required.');
        return this.prisma.$transaction(async tx => {
            // Cast void to text so Prisma can deserialize the PostgreSQL result.
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('department-names'), hashtext(${organizationId}))::text`;
            return work(tx);
        }, { maxWait: 5000, timeout: 10000 });
    }

    async createDepartment(value: unknown, organizationId: string) {
        const name = this.name(value);
        return this.write(organizationId, async tx => {
            const existing = await tx.department.findMany({ where: { organizationId }, select: { id: true, name: true } });
            if (existing.some(row => departmentNameKey(row.name) === departmentNameKey(name))) {
                throw new ConflictException('A department with this name already exists.');
            }
            return tx.department.create({ data: { name, organizationId } });
        });
    }

    async createDepartments(values: unknown, organizationId: string) {
        if (!Array.isArray(values) || values.length === 0 || values.length > MAX_DEPARTMENTS_PER_SETUP) {
            throw new BadRequestException('Provide between 1 and 100 department names.');
        }
        const names = [...new Map(values.map(value => {
            const name = this.name(value);
            return [departmentNameKey(name), name] as const;
        })).values()];
        if (names.some(name => !departmentImportKey(name))) throw new BadRequestException('The current employee importer needs department names containing A–Z letters or numbers.');
        return this.write(organizationId, async tx => {
            const rows = await tx.department.findMany({ where: { organizationId }, select: { id: true, name: true } });
            const byKey = new Map<string, typeof rows>();
            for (const row of rows) {
                const key = departmentNameKey(row.name);
                byKey.set(key, [...(byKey.get(key) ?? []), row]);
            }
            const created: string[] = [], existing: string[] = [];
            for (const name of names) {
                const collision = [...rows.map(row => row.name), ...names].find(other =>
                    departmentImportKey(other) === departmentImportKey(name) && departmentNameKey(other) !== departmentNameKey(name));
                if (collision) throw new ConflictException(`Employee imports cannot distinguish "${name}" from "${collision}". Use the same department name in the workbook and department list.`);
                const matches = byKey.get(departmentNameKey(name)) ?? [];
                if (matches.length > 1) throw new ConflictException(`More than one existing department is named "${name}". Resolve that duplicate before importing into it.`);
                if (matches.length === 1) existing.push(matches[0].name);
                else created.push(name);
            }
            if (created.length) await tx.department.createMany({ data: created.map(name => ({ name, organizationId })) });
            return { created, existing };
        });
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
    async getDepartmentById(id: string, organizationId: string) {
        const department = await this.prisma.department.findFirst({
            where: { id, organizationId },
            include: {
                _count: {
                    select: { employees: true }
                }
            }
        });
        if (!department) {
            throw new NotFoundException('Department not found');
        }
        return department;
    }

    // rename a department (always allowed regardless of employee count)
    async updateDepartment(id: string, value: unknown, organizationId: string) {
        const name = this.name(value);
        return this.write(organizationId, async tx => {
        const dept = await tx.department.findFirst({ where: { id, organizationId } });
        if (!dept || dept.organizationId !== organizationId) {
            throw new NotFoundException('Department not found');
        }
        const others = await tx.department.findMany({ where: { organizationId, id: { not: id } }, select: { id: true, name: true } });
        if (others.some(row => departmentNameKey(row.name) === departmentNameKey(name))) {
            throw new ConflictException('A department with this name already exists.');
        }
        return tx.department.update({
            where: { id, organizationId },
            data: { name },
        });
        });
    }

    // delete a department — only if it has zero employees
    async deleteDepartment(id: string, organizationId: string) {
        const dept = await this.prisma.department.findFirst({
            where: { id, organizationId },
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
        return this.prisma.department.delete({ where: { id, organizationId } });
    }
}
