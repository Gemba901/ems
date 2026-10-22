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
  if (departmentId) where.departmentId = departmentId;
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
  const words = query.search?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (words.length) where.AND = words.map(word => {
    const contains = word.replace(/[\\%_]/g, '\\$&');
    return { OR: ['firstName', 'middleName', 'lastName', 'employeeCode'].map(field => ({ [field]: { contains, mode: 'insensitive' } })) };
  });
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
  const prefix: Prisma.EmployeeWhereInput = { AND: words.map(word => ({
    OR: fields.flatMap(field => [
      comparison(field, { startsWith: literal(word), mode: 'insensitive' }),
      // Name parts within a compound field count as prefixes too. Codes only
      // use the start of the whole code; a code suffix remains a contains match.
      ...(field === 'employeeCode' ? [] : [' ', '-', "'", '’', '\t', '\n', '\r'].map(boundary =>
        comparison(field, { contains: boundary + literal(word), mode: 'insensitive' }))),
    ]),
  })) };
  return [exact, { AND: [{ NOT: exact }, prefix] }, { AND: [{ NOT: exact }, { NOT: prefix }] }];
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
