import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from 'db';
import { PrismaService } from 'src/prisma/prisma.service';
import { loadPeopleLinks } from './ems-people-links';
import { branchKey, peopleIndex, scopeKey } from './onboarding-people-links';
import { retryOnboardingTransaction } from './onboarding-transaction';

/**
 * Organisation → Departments: choose the HOD of one department at one branch.
 * Registered employees only (import records are chosen during onboarding). Same rules as the profile's
 * "Change department HOD": a version check, the company's reporting lock, and a revision bump only when the choice changes.
 */
export type DepartmentHodQuery = { branch?: unknown };
export type DepartmentHodChange = { branch: string; target: string; expectedVersion: string };

function requireCompany(organizationId: string) {
  if (!organizationId) throw new BadRequestException('Company context is required');
}
/** The branch arrives as the directory's key (already tidied); anything else is refused. "" is "Branch not recorded". */
function branchParam(value: unknown) {
  if (typeof value !== 'string' || value.length > 200 || branchKey(value) !== value) throw new BadRequestException('Invalid branch');
  return value;
}
const currentTarget = (a: { isUnassigned: boolean; employeeId: string | null; pendingRecordId: string | null } | undefined) =>
  !a || a.isUnassigned ? null : a.employeeId ? `employee:${a.employeeId}` : a.pendingRecordId ? `record:${a.pendingRecordId}` : '__missing__';
const versionOf = (departmentId: string, key: string, a: { id: string; revision: number } | undefined) =>
  JSON.stringify([scopeKey(departmentId, key), a ? `${a.id}:${a.revision}` : null]);

async function branchScope(tx: Prisma.TransactionClient, organizationId: string, departmentId: string, key: string) {
  const context = await loadPeopleLinks(tx, organizationId);
  const department = context.departments.find(d => d.id === departmentId);
  if (!department) throw new NotFoundException('Department not found');
  const assignment = context.assignments.find(a => a.departmentId === departmentId && a.branchKey === key);
  const spellings = new Map<string, number>();
  for (const e of context.employees) if (e.departmentId === departmentId && branchKey(e.plantBranch) === key) {
    const text = e.plantBranch?.trim() ?? '';
    if (text) spellings.set(text, (spellings.get(text) ?? 0) + 1);
  }
  const people = context.employees.some(e => e.departmentId === departmentId && branchKey(e.plantBranch) === key);
  // Only branches the directory shows: people recorded there, or a saved HOD choice.
  if (!assignment && !people) throw new NotFoundException('This branch has no people or HOD in this department');
  const label = assignment?.branchLabel?.trim() || [...spellings].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || '';
  return { context, department, assignment, label, options: context.allOptions.filter(p => p.target.startsWith('employee:')) };
}

async function choices(tx: Prisma.TransactionClient, organizationId: string, departmentId: string, key: string) {
  const { context, department, assignment, label, options } = await branchScope(tx, organizationId, departmentId, key);
  const hod = peopleIndex(context.allOptions, context.records).resolve(currentTarget(assignment), 'Department HOD');
  return { departmentId, departmentName: department.name, branchKey: key, branchLabel: label, hasHodAssignment: !!assignment, hod,
    hodDirectory: context.hodDirectory, recordedHodSuggestions: context.recordedSuggestions.get(scopeKey(departmentId, key)) ?? [],
    hodOptions: options, hodVersion: versionOf(departmentId, key, assignment) };
}

export async function departmentHodChoices(db: PrismaService, organizationId: string, departmentId: string, query: DepartmentHodQuery) {
  requireCompany(organizationId);
  const key = branchParam(query.branch);
  return db.$transaction(tx => choices(tx, organizationId, departmentId, key),
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 20000 });
}

export async function saveDepartmentBranchHod(db: PrismaService, organizationId: string, departmentId: string, change: DepartmentHodChange, userId: string) {
  requireCompany(organizationId);
  if (!userId) throw new BadRequestException('An authenticated HR reviewer is required');
  const key = branchParam(change.branch), target = change.target;
  if (target !== 'NONE' && !/^employee:[A-Za-z0-9_-]+$/.test(target)) throw new BadRequestException('Choose an existing employee, or Not assigned');
  return retryOnboardingTransaction(() => db.$transaction(async tx => {
    // The same company lock EmsService.lockReporting takes before any HOD or reporting change.
    await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${organizationId} FOR NO KEY UPDATE`;
    const { context, assignment, label, options } = await branchScope(tx, organizationId, departmentId, key);
    if (versionOf(departmentId, key, assignment) !== change.expectedVersion)
      throw new ConflictException('The HOD for this department and branch changed. Refresh and review it again.');
    if (target !== 'NONE' && !options.some(p => p.target === target))
      throw new BadRequestException('Choose an existing employee in this company, or Not assigned');
    const resolved = peopleIndex(context.allOptions, context.records).resolve(target, 'Department HOD');
    if (resolved.error) throw new BadRequestException(resolved.error);
    const sameChoice = !!assignment && assignment.isUnassigned === (target === 'NONE') && (target === 'NONE' || currentTarget(assignment) === target);
    const selection = { employeeId: target === 'NONE' ? null : target.slice(9), pendingRecordId: null, isUnassigned: target === 'NONE',
      branchLabel: label, updatedByUserId: userId, revision: assignment ? assignment.revision + (sameChoice ? 0 : 1) : 1 };
    await tx.emsDepartmentHod.upsert({ where: { departmentId_branchKey: { departmentId, branchKey: key } },
      create: { ...selection, departmentId, branchKey: key }, update: selection });
    return choices(tx, organizationId, departmentId, key);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 }));
}
