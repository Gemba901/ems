import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from 'db';
import { PrismaService } from 'src/prisma/prisma.service';
import { branchKey, personName } from './onboarding-people-links';
import { ACTIVE_EMPLOYMENT_STATUSES, INACTIVE_EMPLOYMENT_STATUSES, isActiveEmployment } from './employment-status';

const personSelect = { id: true, organizationId: true, firstName: true, middleName: true, lastName: true, employeeCode: true, jobTitle: true, employmentStatus: true } satisfies Prisma.EmployeeSelect;
const hodSelect = {
  id: true, branchKey: true, branchLabel: true, isUnassigned: true, employeeId: true, pendingRecordId: true, revision: true,
  employee: { select: personSelect },
  pendingRecord: { select: { id: true, organizationId: true, batchId: true, status: true, firstName: true, middleName: true, lastName: true, employeeCode: true, jobDesignation: true, batch: { select: { status: true } } } },
} satisfies Prisma.EmsDepartmentHodSelect;
type Hod = Prisma.EmsDepartmentHodGetPayload<{ select: typeof hodSelect }>;

function requireCompany(organizationId: string) {
  if (!organizationId) throw new BadRequestException('Company context is required');
}
function hodSummary(row: Hod | undefined, organizationId: string) {
  if (!row) return { state: 'NOT_RECORDED' as const, person: null };
  if (row.isUnassigned) return { state: 'UNASSIGNED' as const, person: null };
  const person = row.employee;
  if (person && person.organizationId === organizationId) return {
    state: isActiveEmployment(person.employmentStatus) ? 'ASSIGNED' as const : 'NEEDS_ATTENTION' as const,
    person: { id: person.id, name: personName(person), employeeCode: person.employeeCode, jobTitle: person.jobTitle },
  };
  const pending = row.pendingRecord;
  if (pending && pending.organizationId === organizationId && pending.status !== 'EXCLUDED' && pending.status !== 'REGISTERED' && pending.batch.status !== 'CANCELLED') return {
    state: 'PENDING' as const,
    person: { id: null, name: personName(pending), employeeCode: pending.employeeCode, jobTitle: pending.jobDesignation },
  };
  return { state: 'NEEDS_ATTENTION' as const, person: null };
}

/** Current department/branch evidence only: this does not infer structural units or positions. */
export async function departmentDirectory(db: PrismaService, organizationId: string) {
  requireCompany(organizationId);
  return db.$transaction(async tx => {
    const departments = await tx.department.findMany({ where: { organizationId }, orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true, hodAssignments: { select: hodSelect } } });
    const groups = await tx.employee.groupBy({ by: ['departmentId', 'plantBranch', 'employmentStatus'], where: { organizationId }, _count: { _all: true } });
    const knownIds = new Set(departments.map(d => d.id));
    const counts = { total: 0, active: 0, inactive: 0, unassigned: 0 };
    const rows = new Map(departments.map(d => [d.id, { id: d.id, name: d.name, total: 0, active: 0, inactive: 0,
      branches: new Map<string, { key: string; label: string; total: number; active: number; inactive: number; hod: ReturnType<typeof hodSummary> }>() }]));
    const branch = (departmentId: string, key: string, label: string) => {
      const row = rows.get(departmentId)!;
      let value = row.branches.get(key);
      if (!value) { value = { key, label: label.trim() || 'Branch not recorded', total: 0, active: 0, inactive: 0, hod: hodSummary(undefined, organizationId) }; row.branches.set(key, value); }
      return value;
    };
    for (const group of groups) {
      const size = group._count._all, active = isActiveEmployment(group.employmentStatus);
      counts.total += size; counts[active ? 'active' : 'inactive'] += size;
      if (!group.departmentId || !knownIds.has(group.departmentId)) { counts.unassigned += size; continue; }
      const row = rows.get(group.departmentId)!;
      row.total += size; row[active ? 'active' : 'inactive'] += size;
      const entry = branch(group.departmentId, branchKey(group.plantBranch), group.plantBranch ?? '');
      entry.total += size; entry[active ? 'active' : 'inactive'] += size;
    }
    for (const department of departments) for (const assignment of department.hodAssignments) {
      branch(department.id, assignment.branchKey, assignment.branchLabel).hod = hodSummary(assignment, organizationId);
    }
    return { source: 'EMS' as const, asOf: new Date().toISOString(), counts, departments: [...rows.values()].map(row => ({ ...row,
      branches: [...row.branches.values()].sort((a, b) => a.label.localeCompare(b.label) || a.key.localeCompare(b.key)),
    })) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export type DepartmentPeopleQuery = { page?: unknown; search?: unknown; branch?: unknown; activity?: unknown };
function textQuery(value: unknown, max: number, name: string) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > max) throw new BadRequestException(`Invalid ${name}`);
  return value.trim();
}
export async function departmentPeople(db: PrismaService, organizationId: string, departmentId: string, query: DepartmentPeopleQuery) {
  requireCompany(organizationId);
  const search = textQuery(query.search, 120, 'search');
  const selectedBranch = textQuery(query.branch, 200, 'branch');
  const activity = textQuery(query.activity, 20, 'activity');
  if (activity && !['ACTIVE', 'INACTIVE'].includes(activity)) throw new BadRequestException('Invalid activity');
  const rawPage = query.page ?? '1';
  if (typeof rawPage !== 'string' || !/^[1-9]\d{0,5}$/.test(rawPage)) throw new BadRequestException('Invalid page');
  const page = Number(rawPage), limit = 25;
  return db.$transaction(async tx => {
    const department = await tx.department.findFirst({ where: { id: departmentId, organizationId }, select: { id: true, name: true } });
    if (!department) throw new NotFoundException('Department not found');
    const where: Prisma.EmployeeWhereInput = { organizationId, departmentId };
    if (activity) where.employmentStatus = { in: activity === 'ACTIVE' ? ACTIVE_EMPLOYMENT_STATUSES : INACTIVE_EMPLOYMENT_STATUSES };
    if (search) where.AND = search.split(/\s+/).map(term => ({ OR: ['firstName', 'middleName', 'lastName', 'employeeCode', 'jobTitle'].map(field => ({ [field]: { contains: term, mode: 'insensitive' } })) }));
    if (selectedBranch !== undefined) {
      // Match existing spelling variants using the SAME key as confirmed HOD scopes.
      const variants = await tx.employee.groupBy({ by: ['plantBranch'], where: { organizationId, departmentId } });
      const matching = variants.filter(row => branchKey(row.plantBranch) === selectedBranch).map(row => row.plantBranch);
      if (!matching.length) return { department, data: [], pagination: { page, limit, total: 0, pages: 0 } };
      where.OR = matching.map(plantBranch => ({ plantBranch }));
    }
    const total = await tx.employee.count({ where });
    const people = await tx.employee.findMany({ where, select: { ...personSelect, plantBranch: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }, { id: 'asc' }], skip: (page - 1) * limit, take: limit });
    return { department, data: people.map(({ organizationId: _org, ...person }) => person), pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
