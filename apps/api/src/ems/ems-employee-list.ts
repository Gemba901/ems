import { BadRequestException } from '@nestjs/common';
import type { Prisma } from 'db';
import type { QueryEmsEmployeesDto } from './dto/ems.dto';
import { ACTIVE_EMPLOYMENT_STATUSES, INACTIVE_EMPLOYMENT_STATUSES, isActiveEmployment } from './employment-status';

// A source is an actual registration link in this organisation, not a name match.
export function registeredSourceWhere(organizationId: string): Prisma.EmsOnboardingRecordWhereInput {
  return { organizationId, status: 'REGISTERED', batch: { is: { organizationId } } };
}

export function employeeListWhere(organizationId: string, query: QueryEmsEmployeesDto): Prisma.EmployeeWhereInput {
  const { departmentId, employmentStatus, activityState, source, importBatchId } = query;
  const where: Prisma.EmployeeWhereInput = { organizationId };
  const extra: Prisma.EmployeeWhereInput[] = [];
  if (departmentId) where.departmentId = departmentId;
  // Access: the person's company role; "Suggestion waiting" = an import or HR suggestion an Admin hasn't decided.
  if (query.access === 'SUGGESTION_WAITING') where.suggestedAccessState = 'PENDING';
  else if (query.access === 'NO_ACCOUNT') extra.push({ OR: [{ userId: null }, { user: { is: { organizations: { none: { organizationId } } } } }] });
  else if (query.access) extra.push({ user: { is: { organizations: { some: { organizationId, role: { name: query.access } } } } } });
  if (query.jobTitle?.trim()) extra.push(query.jobTitle === 'NONE' ? { OR: [{ jobTitle: null }, { jobTitle: '' }] }
    : { jobTitle: { equals: query.jobTitle.trim(), mode: 'insensitive' } });
  if (query.employmentType) where.employmentType = query.employmentType;
  if (query.shift?.trim()) where.shift = { equals: query.shift.trim(), mode: 'insensitive' };
  if (query.reportsTo) where.reportingManagerId = query.reportsTo;
  // Branch, job title and shift match whatever case they were typed in; "NONE" = not recorded.
  if (query.branch) extra.push(query.branch === 'NONE' ? { OR: [{ plantBranch: null }, { plantBranch: '' }] }
    : { plantBranch: { equals: query.branch.trim(), mode: 'insensitive' } });
  if (query.invitation) Object.assign(where, invitationWhere(query.invitation, new Date()));
  if (activityState) where.employmentStatus = { in: activityState === 'ACTIVE' ? ACTIVE_EMPLOYMENT_STATUSES : INACTIVE_EMPLOYMENT_STATUSES };
  if (employmentStatus) {
    if (activityState && (isActiveEmployment(employmentStatus) ? 'ACTIVE' : 'INACTIVE') !== activityState)
      throw new BadRequestException('The detailed status does not belong to the selected active/inactive group.');
    where.employmentStatus = employmentStatus;
  }
  if (source === 'UNLINKED' && importBatchId)
    throw new BadRequestException('Choose either an import batch or No linked import.');
  if (source === 'UNLINKED') where.emsOnboardingRecord = { isNot: registeredSourceWhere(organizationId) };
  else if (source === 'IMPORTED' || importBatchId)
    where.emsOnboardingRecord = { is: { ...registeredSourceWhere(organizationId), ...(importBatchId ? { batchId: importBatchId } : {}) } };

  // Every word must match a name part or code. Escape PostgreSQL LIKE wildcards
  // so an entered underscore or percent sign is searched literally.
  // Job titles count too, so "supervisor" finds every supervisor (ranked after name and code matches).
  const words = query.search?.trim().split(/\s+/).filter(Boolean) ?? [];
  const search = words.map(word => {
    const contains = word.replace(/[\\%_]/g, '\\$&');
    return { OR: ['firstName', 'middleName', 'lastName', 'employeeCode', 'jobTitle'].map(field => ({ [field]: { contains, mode: 'insensitive' } })) };
  });
  if (search.length || extra.length) where.AND = [...search, ...extra];
  return where;
}

export function employeeNameOrder(descending = false): Prisma.EmployeeOrderByWithRelationInput[] {
  const direction = descending ? 'desc' : 'asc';
  return [{ firstName: direction }, { lastName: direction }, { middleName: direction }, { id: 'asc' }];
}

// Rank in the database before pagination. The groups are disjoint, so crossing
// a group boundary cannot repeat or skip an employee. Every group is intersected
// with employeeListWhere by the caller, retaining organisation and source filters.
export function employeeSearchGroups(search: string): Prisma.EmployeeWhereInput[] {
  const words = search.trim().split(/\s+/).filter(Boolean);
  const phrase = words.join(' ');
  const fields = ['firstName', 'middleName', 'lastName', 'employeeCode'] as const;
  type Field = typeof fields[number];
  const literal = (value: string) => value.replace(/[\\%_]/g, '\\$&');
  const comparison = (field: Field, value: Prisma.StringFilter<'Employee'>): Prisma.EmployeeWhereInput => {
    const condition: Prisma.EmployeeWhereInput = { [field]: value };
    // SQL NOT(NULL) is NULL, not true. Guard nullable fields so negating the
    // higher-ranked groups does not drop employees with no middle name/code.
    return field === 'middleName' || field === 'employeeCode'
      ? { AND: [{ [field]: { not: null } }, condition] } : condition;
  };
  const equals = (word: string): Prisma.EmployeeWhereInput => ({
    OR: fields.map(field => comparison(field, { equals: word, mode: 'insensitive' })),
  });
  const exact: Prisma.EmployeeWhereInput = {
    OR: [equals(phrase), { AND: words.map(equals) }],
  };
  // Someone whose first name starts with the text comes before someone whose surname does ("ke": Kevin before Akinyi Kemunto).
  const firstStarts = (word: string): Prisma.EmployeeWhereInput => ({ OR: [
    { firstName: { startsWith: literal(word), mode: 'insensitive' } },
    ...[' ', '-', "'", '’'].map(boundary => ({ firstName: { contains: boundary + literal(word), mode: 'insensitive' as const } })),
  ] });
  const prefix: Prisma.EmployeeWhereInput = { AND: words.map(word => ({
    OR: fields.flatMap(field => [
      comparison(field, { startsWith: literal(word), mode: 'insensitive' }),
      // Name parts within a compound field count as prefixes too. Codes only
      // use the start of the whole code; a code suffix remains a contains match.
      ...(field === 'employeeCode' ? [] : [' ', '-', "'", '’', '\t', '\n', '\r'].map(boundary =>
        comparison(field, { contains: boundary + literal(word), mode: 'insensitive' }))),
    ]),
  })) };
  const firstPrefix: Prisma.EmployeeWhereInput = { AND: [prefix, firstStarts(words[0] ?? '')] };
  return [exact, { AND: [{ NOT: exact }, firstPrefix] }, { AND: [{ NOT: exact }, { NOT: firstPrefix }, prefix] }, { AND: [{ NOT: exact }, { NOT: prefix }] }];
}

export const EMPLOYEE_SOURCE_SELECT = {
  id: true, organizationId: true, status: true, rowNumber: true, registeredAt: true,
  batch: { select: { id: true, organizationId: true, label: true, sourceFileName: true, createdAt: true } },
} satisfies Prisma.EmsOnboardingRecordSelect;

type SourceRecord = Prisma.EmsOnboardingRecordGetPayload<{ select: typeof EMPLOYEE_SOURCE_SELECT }>;
export function employeeImportSource(record: SourceRecord | null, organizationId: string) {
  if (!record || record.organizationId !== organizationId || record.batch.organizationId !== organizationId || record.status !== 'REGISTERED') return null;
  return { recordId: record.id, batchId: record.batch.id, importedAt: record.batch.createdAt,
    label: record.batch.label, sourceFileName: record.batch.sourceFileName,
    rowNumber: record.rowNumber, registeredAt: record.registeredAt };
}

/**
 * Invitation filter on the employee list. Pending = a link sent and still valid; Accepted = signed up
 * (or told to sign in with an existing password); Needs attention = failed, skipped, cancelled,
 * expired, or a shared contact that needs in-person setup.
 */
export function invitationWhere(filter: string, now: Date): Prisma.EmployeeWhereInput {
  if (filter === 'NOT_INVITED') return { emsInvitation: { is: null } };
  if (filter === 'PENDING') return { emsInvitation: { is: { status: { in: ['SENT', 'SHARED'] }, expiresAt: { gt: now } } } };
  if (filter === 'ACCEPTED') return { emsInvitation: { is: { OR: [{ status: 'ACCEPTED' }, { status: 'NOTICE_SENT', kind: 'ACCESS_NOTICE', skipReason: null }] } } };
  if (filter === 'ATTENTION') return { emsInvitation: { is: { OR: [
    { status: { in: ['FAILED', 'SKIPPED', 'CANCELLED'] } },
    { status: { in: ['SENT', 'SHARED'] }, expiresAt: { lte: now } },
    { status: 'NOTICE_SENT', kind: 'CONTACT_NOTICE' },
    { status: 'NOTICE_SENT', kind: 'ACCESS_NOTICE', skipReason: { not: null } },
  ] } } };
  throw new BadRequestException('Unknown invitation filter');
}

type OptionsDb = Pick<Prisma.TransactionClient, 'employee'>;
/** Values to offer in the Employees list filters, with how many people have each (case-insensitive, most common first). */
export async function employeeFilterOptions(db: OptionsDb, organizationId: string) {
  const people = await db.employee.findMany({
    where: { organizationId },
    select: { jobTitle: true, plantBranch: true, shift: true, reportingManagerId: true,
      department: { select: { id: true, name: true } } },
  });
  const tally = (values: (string | null | undefined)[]) => {
    const groups = new Map<string, { value: string; count: number }>();
    for (const raw of values) {
      const value = raw?.trim(); if (!value) continue;
      const key = value.toLowerCase();
      const group = groups.get(key) ?? { value, count: 0 }; group.count++; groups.set(key, group);
    }
    return [...groups.values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  };
  const departments = new Map<string, { id: string; name: string; count: number }>();
  for (const p of people) if (p.department) {
    const d = departments.get(p.department.id) ?? { ...p.department, count: 0 }; d.count++; departments.set(d.id, d);
  }
  const managerCounts = new Map<string, number>();
  for (const p of people) if (p.reportingManagerId) managerCounts.set(p.reportingManagerId, (managerCounts.get(p.reportingManagerId) ?? 0) + 1);
  const managers = managerCounts.size ? await db.employee.findMany({
    where: { organizationId, id: { in: [...managerCounts.keys()] } },
    select: { id: true, firstName: true, lastName: true, jobTitle: true },
  }) : [];
  return {
    departments: [...departments.values()].sort((a, b) => a.name.localeCompare(b.name)),
    jobTitles: tally(people.map(p => p.jobTitle)),
    branches: tally(people.map(p => p.plantBranch)),
    shifts: tally(people.map(p => p.shift)),
    managers: managers.map(m => ({ id: m.id, name: [m.firstName, m.lastName].filter(Boolean).join(' '), jobTitle: m.jobTitle, count: managerCounts.get(m.id) ?? 0 }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
