import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import * as XLSX from 'xlsx';

type EmployeeImportRow = {
    rowNumber: number;
    employeeCode?: string;
    firstName: string;
    middleName?: string;
    lastName: string;
    fullName?: string;
    email: string;
    personalEmail?: string;
    phone?: string;
    department?: string;
    section?: string;
    workStation?: string;
    jobTitle?: string;
    gender?: string;
    dateOfBirth?: Date;
    nationalId?: string;
    employmentStatus?: string;
    dateJoined?: Date;
    skillLevel?: string;
    trainingNeeded?: boolean;
    jobDescription?: string;
    homeAddress?: string;
};

type ImportIssue = { row: number; message: string };

const EMPTY_VALUES = new Set(['', 'no information available', 'not applicable', 'n/a', 'na', 'none', '-']);

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
            include: { _count: { select: { employees: true } } },
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
                committeeMembers: {
                    include: { committee: true },
                },
            },
        });
        if (!employee) throw new BadRequestException('Employee not found');
        return employee;
    }

    // get all employees in an organization with pagination, optional search and department filter
    async getEmployeesByOrganization(
        organizationId: string,
        skip: number = 0,
        take: number = 10,
        search?: string,
        departmentId?: string,
    ) {
        const where: any = { organizationId };
        if (departmentId) where.departmentId = departmentId;
        if (search) {
            where.OR = [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName:  { contains: search, mode: 'insensitive' } },
                { email:     { contains: search, mode: 'insensitive' } },
            ];
        }
        return this.prisma.employee.findMany({
            where,
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
            orderBy: { firstName: 'asc' },
            skip,
            take,
        });
    }

    // count employees in an organization, respecting the same filters as getEmployeesByOrganization
    async countEmployeesByOrganization(
        organizationId: string,
        search?: string,
        departmentId?: string,
    ): Promise<number> {
        const where: any = { organizationId };
        if (departmentId) where.departmentId = departmentId;
        if (search) {
            where.OR = [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName:  { contains: search, mode: 'insensitive' } },
                { email:     { contains: search, mode: 'insensitive' } },
            ];
        }
        return this.prisma.employee.count({ where });
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

    // aggregate workforce stats for the HR reports page
    async getOrganizationStats(organizationId: string) {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const [total, withActiveAccounts, recentlyAdded, departments, roleGroups, recentEmployees] = await Promise.all([
            this.prisma.employee.count({ where: { organizationId } }),
            // Only count employees whose linked user has actually set a password
            this.prisma.employee.count({
                where: { organizationId, user: { password: { not: null } } },
            }),
            this.prisma.employee.count({ where: { organizationId, createdAt: { gte: thirtyDaysAgo } } }),
            this.prisma.department.findMany({
                where: { organizationId },
                include: { _count: { select: { employees: true } } },
                orderBy: { name: 'asc' },
            }),
            this.prisma.userOrganization.groupBy({
                by: ['roleId'],
                where: { organizationId },
                _count: { roleId: true },
            }),
            this.prisma.employee.findMany({
                where: { organizationId },
                orderBy: { createdAt: 'desc' },
                take: 10,
                include: {
                    department: { select: { name: true } },
                    user: { select: { password: true } },
                },
            }),
        ]);

        const roles = roleGroups.length
            ? await this.prisma.role.findMany({ where: { id: { in: roleGroups.map(r => r.roleId) } } })
            : [];

        return {
            total,
            withAccounts: withActiveAccounts,
            withoutAccounts: total - withActiveAccounts,
            recentlyAdded,
            byDepartment: departments
                .map(d => ({ name: d.name, count: d._count.employees }))
                .filter(d => d.count > 0)
                .sort((a, b) => b.count - a.count),
            byRole: roleGroups
                .map(r => ({
                    name: roles.find(role => role.id === r.roleId)?.name ?? 'Unknown',
                    count: r._count.roleId,
                }))
                .sort((a, b) => b.count - a.count),
            recentEmployees: recentEmployees.map(e => ({
                id: e.id,
                firstName: e.firstName,
                lastName: e.lastName,
                email: e.email,
                department: e.department?.name ?? null,
                createdAt: e.createdAt.toISOString(),
                hasActiveAccount: e.user?.password != null,
            })),
        };
    }

    // admin updates their org's theme color
    async updateCompanyTheme(organizationId: string, primaryColor: string) {
        return (this.prisma.organization as any).update({
            where: { id: organizationId },
            data: { primaryColor },
            select: { id: true, primaryColor: true },
        });
    }

    // update an employee's role within their organization
    async updateEmployeeRole(id: string, roleId: number, organizationId: string) {
        const employee = await this.prisma.employee.findUnique({ where: { id } });
        if (!employee) throw new BadRequestException('Employee not found');
        if (employee.organizationId !== organizationId) throw new ForbiddenException('Cannot manage employees from another organization');
        if (!employee.userId) throw new BadRequestException('Employee has no linked user account');

        // Prevent assigning SUPER_ADMIN (id=1)
        if (roleId === 1) throw new ForbiddenException('Cannot assign SUPER_ADMIN role');

        const role = await this.prisma.role.findUnique({ where: { id: roleId } });
        if (!role) throw new BadRequestException('Invalid role');

        await this.prisma.userOrganization.update({
            where: { userId_organizationId: { userId: employee.userId, organizationId } },
            data: { roleId },
        });

        return { message: `Role updated to ${role.name}` };
    }

    // admin resets an employee's password
    async resetEmployeePassword(id: string, newPassword: string, organizationId: string) {
        const employee = await this.prisma.employee.findUnique({ where: { id } });
        if (!employee) throw new BadRequestException('Employee not found');
        if (employee.organizationId !== organizationId) throw new ForbiddenException('Cannot manage employees from another organization');
        if (!employee.userId) throw new BadRequestException('Employee has no linked user account');

        const hashed = await bcrypt.hash(newPassword, 10);
        await this.prisma.user.update({ where: { id: employee.userId }, data: { password: hashed } });

        return { message: 'Password reset successfully' };
    }

    // update employee avatar URL
    async updateAvatar(id: string, avatarUrl: string) {
        const employee = await this.prisma.employee.findUnique({ where: { id } });
        if (!employee) throw new BadRequestException('Employee not found');

        return (this.prisma.employee as any).update({
            where: { id },
            data: { avatarUrl },
            include: { department: true, user: { include: { organizations: { include: { role: true } } } } },
        });
    }

    async importEmployeesFromWorkbook(
        buffer: Buffer,
        organizationId: string,
        currentUserId?: string,
        dryRun = false,
    ) {
        const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
        if (!org) throw new BadRequestException('Organization not found');

        const rows = this.parseEmployeeWorkbook(buffer);
        if (rows.rows.length === 0) {
            throw new BadRequestException('No employee rows were found in the workbook');
        }

        const employeeRole = await this.prisma.role.findUnique({ where: { name: 'EMPLOYEE' } });
        if (!employeeRole) throw new BadRequestException('EMPLOYEE role is not configured');

        const currentEmployee = currentUserId
            ? await this.prisma.employee.findFirst({ where: { userId: currentUserId, organizationId } })
            : null;

        const existingEmployees = await this.prisma.employee.findMany({
            where: { organizationId },
            include: { user: { include: { organizations: { where: { organizationId } } } } },
        });

        const matchedExistingIds = new Set<string>();
        const seenKeys = new Set<string>();
        const issues: ImportIssue[] = [...rows.issues];
        const normalizedRows: EmployeeImportRow[] = [];

        for (const row of rows.rows) {
            const key = this.importRowKey(row);
            if (!key) {
                issues.push({ row: row.rowNumber, message: 'A company email, personal email, phone, or employee code is required' });
                continue;
            }
            if (seenKeys.has(key)) {
                issues.push({ row: row.rowNumber, message: `Duplicate employee key in workbook: ${key}` });
                continue;
            }
            seenKeys.add(key);
            normalizedRows.push(row);
        }

        for (const row of normalizedRows) {
            const match = this.findEmployeeImportMatch(row, existingEmployees, matchedExistingIds);
            if (match) matchedExistingIds.add(match.id);
        }

        const toDelete = existingEmployees.filter((employee) => {
            if (matchedExistingIds.has(employee.id)) return false;
            if (currentEmployee?.id === employee.id) return false;
            return true;
        });

        const summary = {
            organizationId,
            organizationName: org.name,
            rowsRead: rows.rows.length,
            validRows: normalizedRows.length,
            invalidRows: issues.length,
            created: normalizedRows.length - matchedExistingIds.size,
            updated: matchedExistingIds.size,
            deleted: toDelete.length,
            preserved: currentEmployee && !matchedExistingIds.has(currentEmployee.id) ? 1 : 0,
            dryRun,
            issues,
        };

        if (dryRun) return summary;
        if (issues.length > 0) {
            throw new BadRequestException({ message: 'Import has validation issues. Run a dry run to review them.', summary });
        }

        await this.prisma.$transaction(async (tx) => {
            const departmentMap = new Map<string, string>();
            const existingDepartments = await tx.department.findMany({ where: { organizationId } });
            for (const department of existingDepartments) {
                departmentMap.set(this.normalizeKey(department.name), department.id);
            }

            for (const row of normalizedRows) {
                const departmentId = row.department
                    ? await this.getOrCreateDepartment(tx, organizationId, row.department, departmentMap)
                    : null;

                const existing = this.findEmployeeImportMatch(row, existingEmployees, matchedExistingIds, true);
                const user = await this.getOrCreateImportUser(tx, row, organizationId, employeeRole.id);

                const employeeData = {
                    firstName: row.firstName,
                    lastName: row.lastName,
                    email: row.email,
                    phone: row.phone ?? null,
                    departmentId,
                    organizationId,
                    userId: user.id,
                    employeeCode: row.employeeCode ?? null,
                    gender: this.toGender(row.gender) as any,
                    dateOfBirth: row.dateOfBirth ?? null,
                    nationalId: row.nationalId ?? null,
                    employmentStatus: this.toEmploymentStatus(row.employmentStatus) as any,
                    jobTitle: row.jobTitle ?? null,
                    dateJoined: row.dateJoined ?? null,
                    workStation: row.workStation ?? row.section ?? null,
                    jobDescription: row.jobDescription ?? null,
                    homeAddress: row.homeAddress ?? null,
                    skillLevel: this.toSkillLevel(row.skillLevel) as any,
                    trainingNeeded: row.trainingNeeded ?? null,
                };

                if (existing) {
                    await tx.employee.update({
                        where: { id: existing.id },
                        data: employeeData,
                    });
                } else {
                    await tx.employee.create({ data: employeeData });
                }
            }

            for (const employee of toDelete) {
                await this.deleteEmployeeInTransaction(tx, employee.id);
            }
        });

        return summary;
    }

    // delete employee — removes org membership; deletes user only if they have no remaining memberships
    async deleteEmployee(id: string) {
        const employee = await this.prisma.employee.findUnique({ where: { id } });
        if (!employee) throw new BadRequestException('Employee not found');

        await this.prisma.$transaction(async (tx) => {
            await this.deleteEmployeeInTransaction(tx, id);
        });

        return { message: 'Employee deleted successfully' };
    }

    private parseEmployeeWorkbook(buffer: Buffer): { rows: EmployeeImportRow[]; issues: ImportIssue[] } {
        const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
        const sheetName =
            workbook.SheetNames.find((name) => this.normalizeKey(name) === 'employee master') ??
            workbook.SheetNames.find((name) => this.normalizeKey(name) === 'employee data') ??
            workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) throw new BadRequestException('Workbook does not contain a readable sheet');

        const matrix = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: null, raw: true });
        const headerIndex = matrix.findIndex((row) =>
            row.some((cell) => this.normalizeKey(cell) === 'first name') &&
            row.some((cell) => ['employee code', 'email address', 'company email'].includes(this.normalizeKey(cell))),
        );
        if (headerIndex === -1) {
            throw new BadRequestException('Could not find the employee header row in the workbook');
        }

        const headerMap = new Map<string, number>();
        matrix[headerIndex].forEach((cell, index) => {
            const key = this.normalizeKey(cell);
            if (key) headerMap.set(key, index);
        });

        const issues: ImportIssue[] = [];
        const rows: EmployeeImportRow[] = [];

        for (let i = headerIndex + 1; i < matrix.length; i++) {
            const source = matrix[i];
            if (!source?.some((value) => !this.isBlank(value))) continue;
            if (this.normalizeKey(this.valueAt(source, headerMap, ['sr no', '#'])) === 'auto serial number for this employee row') continue;
            if (this.normalizeKey(this.valueAt(source, headerMap, ['sr no', '#'])) === 'example') continue;

            const firstName = this.cleanString(this.valueAt(source, headerMap, ['first name']));
            const middleName = this.cleanString(this.valueAt(source, headerMap, ['middle name']));
            const lastName = this.cleanString(this.valueAt(source, headerMap, ['last name surname', 'last name']));
            const fullName = this.cleanString(this.valueAt(source, headerMap, ['employee full name', 'name']));
            const companyEmail = this.cleanEmail(this.valueAt(source, headerMap, ['company email', 'email address', 'email']));
            const personalEmail = this.cleanEmail(this.valueAt(source, headerMap, ['personal email']));
            const phone = this.cleanPhone(this.valueAt(source, headerMap, ['mobile number', 'phone number', 'phone']));
            const rowNumber = i + 1;

            const names = this.resolveNames(firstName, middleName, lastName, fullName);
            const email = companyEmail || personalEmail || this.generatedImportEmail(source, headerMap, names, rowNumber);

            if (!names.firstName || !names.lastName) {
                issues.push({ row: rowNumber, message: 'First name and last name are required' });
                continue;
            }

            rows.push({
                rowNumber,
                employeeCode: this.cleanString(this.valueAt(source, headerMap, ['employee code'])),
                firstName: names.firstName,
                middleName,
                lastName: names.lastName,
                fullName,
                email,
                personalEmail,
                phone,
                department: this.cleanString(this.valueAt(source, headerMap, ['department'])),
                section: this.cleanString(this.valueAt(source, headerMap, ['section area', 'sub section line'])),
                workStation: this.cleanString(this.valueAt(source, headerMap, ['work location'])),
                jobTitle: this.cleanString(this.valueAt(source, headerMap, ['designation', 'role job title'])),
                gender: this.cleanString(this.valueAt(source, headerMap, ['gender'])),
                dateOfBirth: this.toDate(this.valueAt(source, headerMap, ['date of birth'])),
                nationalId: this.cleanString(this.valueAt(source, headerMap, ['national id passport no', 'national id'])),
                employmentStatus: this.cleanString(this.valueAt(source, headerMap, ['employment status', 'employee status'])),
                dateJoined: this.toDate(this.valueAt(source, headerMap, ['date of joining', 'date joined'])),
                skillLevel: this.cleanString(this.valueAt(source, headerMap, ['skill level'])),
                trainingNeeded: this.toBoolean(this.valueAt(source, headerMap, ['training needed'])),
                jobDescription: this.cleanString(this.valueAt(source, headerMap, ['primary work role'])),
                homeAddress: this.cleanString(this.valueAt(source, headerMap, ['address'])),
            });
        }

        return { rows, issues };
    }

    private async getOrCreateImportUser(tx: any, row: EmployeeImportRow, organizationId: string, roleId: number) {
        const userWhere: any[] = [{ email: row.email }];
        if (row.phone) userWhere.push({ phone: row.phone });
        let user = await tx.user.findFirst({ where: { OR: userWhere } });

        if (!user) {
            user = await tx.user.create({
                data: {
                    email: row.email,
                    phone: row.phone ?? `no-phone-${row.employeeCode ?? row.rowNumber}-${Date.now()}`,
                    name: `${row.firstName} ${row.lastName}`,
                },
            });
        } else {
            await tx.user.update({
                where: { id: user.id },
                data: {
                    email: row.email,
                    ...(row.phone ? { phone: row.phone } : {}),
                    name: `${row.firstName} ${row.lastName}`,
                },
            });
        }

        await tx.userOrganization.upsert({
            where: { userId_organizationId: { userId: user.id, organizationId } },
            update: {},
            create: { userId: user.id, organizationId, roleId },
        });

        return user;
    }

    private async getOrCreateDepartment(tx: any, organizationId: string, name: string, departmentMap: Map<string, string>) {
        const key = this.normalizeKey(name);
        const existing = departmentMap.get(key);
        if (existing) return existing;
        const department = await tx.department.create({ data: { name: name.trim(), organizationId } });
        departmentMap.set(key, department.id);
        return department.id;
    }

    private async deleteEmployeeInTransaction(tx: any, id: string) {
        const employee = await tx.employee.findUnique({ where: { id } });
        if (!employee) return;

        await tx.notification.deleteMany({ where: { employeeId: id } });
        await tx.steeringCommitteeMember.deleteMany({ where: { employeeId: id } });
        await tx.suggestionReview.deleteMany({ where: { reviewerId: id } });
        await tx.suggestionReview.deleteMany({ where: { suggestion: { employeeId: id } } });
        await tx.suggestion.deleteMany({ where: { employeeId: id } });
        await tx.suggestion.updateMany({ where: { hodId: id }, data: { hodId: null } });

        if (employee.userId) {
            await tx.userOrganization.deleteMany({
                where: { userId: employee.userId, organizationId: employee.organizationId },
            });
        }

        await tx.employee.delete({ where: { id } });

        if (employee.userId) {
            const remaining = await tx.userOrganization.count({ where: { userId: employee.userId } });
            if (remaining === 0) {
                await tx.refreshToken.deleteMany({ where: { userId: employee.userId } });
                await tx.calendarBlock.deleteMany({ where: { createdById: employee.userId } });
                await tx.visitRequest.deleteMany({ where: { createdById: employee.userId } });
                await tx.consultancyVisit.deleteMany({ where: { createdById: employee.userId } });
                await tx.user.delete({ where: { id: employee.userId } });
            }
        }
    }

    private findEmployeeImportMatch(
        row: EmployeeImportRow,
        employees: any[],
        matchedIds: Set<string>,
        allowMatched = false,
    ) {
        const candidates = employees.filter((employee) => allowMatched || !matchedIds.has(employee.id));
        return candidates.find((employee) => row.employeeCode && employee.employeeCode === row.employeeCode)
            ?? candidates.find((employee) => this.normalizeEmail(employee.email) === this.normalizeEmail(row.email))
            ?? candidates.find((employee) => row.phone && this.normalizePhone(employee.phone) === this.normalizePhone(row.phone));
    }

    private importRowKey(row: EmployeeImportRow) {
        return row.employeeCode
            ? `code:${this.normalizeKey(row.employeeCode)}`
            : row.email
                ? `email:${this.normalizeEmail(row.email)}`
                : row.phone
                    ? `phone:${this.normalizePhone(row.phone)}`
                    : '';
    }

    private valueAt(row: any[], headerMap: Map<string, number>, names: string[]) {
        for (const name of names) {
            const index = headerMap.get(this.normalizeKey(name));
            if (index !== undefined) return row[index];
        }
        return null;
    }

    private resolveNames(firstName?: string, middleName?: string, lastName?: string, fullName?: string) {
        if (firstName && lastName) return { firstName, lastName };
        const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
        if (!firstName && parts.length > 0) firstName = parts[0];
        if (!lastName && parts.length > 1) lastName = parts.slice(1).join(' ');
        if (!lastName && middleName) lastName = middleName;
        return { firstName: firstName ?? '', lastName: lastName ?? '' };
    }

    private generatedImportEmail(row: any[], headerMap: Map<string, number>, names: { firstName: string; lastName: string }, rowNumber: number) {
        const code = this.cleanString(this.valueAt(row, headerMap, ['employee code']));
        if (code) return `${this.normalizeKey(code).replace(/\s+/g, '-')}@employee.import.local`;
        const slug = `${names.firstName}.${names.lastName}`.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '');
        return `${slug || `row-${rowNumber}`}@employee.import.local`;
    }

    private cleanString(value: any): string | undefined {
        if (this.isBlank(value)) return undefined;
        const text = String(value).trim();
        if (EMPTY_VALUES.has(text.toLowerCase())) return undefined;
        return text;
    }

    private cleanEmail(value: any): string | undefined {
        const text = this.cleanString(value);
        if (!text) return undefined;
        const normalized = text.toLowerCase();
        if (!normalized.includes('@')) return undefined;
        return normalized;
    }

    private cleanPhone(value: any): string | undefined {
        const text = this.cleanString(value);
        if (!text) return undefined;
        const normalized = text.replace(/[^\d+]/g, '');
        return normalized || undefined;
    }

    private normalizeEmail(value: any) {
        return String(value ?? '').trim().toLowerCase();
    }

    private normalizePhone(value: any) {
        return String(value ?? '').replace(/[^\d+]/g, '');
    }

    private normalizeKey(value: any) {
        return String(value ?? '')
            .replace(/★/g, '')
            .replace(/\s*\/\s*/g, ' ')
            .replace(/[\n\r]+/g, ' ')
            .replace(/\([^)]*\)/g, '')
            .replace(/[^a-zA-Z0-9]+/g, ' ')
            .trim()
            .toLowerCase();
    }

    private isBlank(value: any) {
        return value === null || value === undefined || String(value).trim() === '';
    }

    private toDate(value: any): Date | undefined {
        if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
        const text = this.cleanString(value);
        if (!text) return undefined;
        const parsed = new Date(text);
        return Number.isNaN(parsed.getTime()) ? undefined : parsed;
    }

    private toBoolean(value: any): boolean | undefined {
        const text = this.cleanString(value)?.toLowerCase();
        if (!text) return undefined;
        if (['yes', 'true', '1'].includes(text)) return true;
        if (['no', 'false', '0'].includes(text)) return false;
        return undefined;
    }

    private toGender(value?: string) {
        const key = this.normalizeKey(value);
        if (key === 'male') return 'MALE';
        if (key === 'female') return 'FEMALE';
        if (key) return 'OTHER';
        return null;
    }

    private toEmploymentStatus(value?: string) {
        const key = this.normalizeKey(value);
        const map: Record<string, string> = {
            active: 'ACTIVE',
            probation: 'PROBATION',
            resigned: 'RESIGNED',
            terminated: 'TERMINATED',
            retired: 'RETIRED',
            suspended: 'SUSPENDED',
            absconded: 'ABSCONDED',
            'contract ended': 'CONTRACT_ENDED',
        };
        return map[key] ?? 'ACTIVE';
    }

    private toSkillLevel(value?: string) {
        const key = this.normalizeKey(value);
        if (key.includes('level 1')) return 'LEVEL_1';
        if (key.includes('level 2')) return 'LEVEL_2';
        if (key.includes('level 3')) return 'LEVEL_3';
        if (key.includes('level 4')) return 'LEVEL_4';
        return null;
    }
}
