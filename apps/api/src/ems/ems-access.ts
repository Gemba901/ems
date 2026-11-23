import { BadRequestException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from 'db';
import { PrismaService } from 'src/prisma/prisma.service';
import { ASSIGNABLE_ROLES, ACCESS_ROLE_LABELS, canChangeAccess, type OnboardingAccountRole } from './onboarding-access';
import { retryOnboardingTransaction } from './onboarding-transaction';

/**
 * Company access in EMS. A person's access is their company role (UserOrganization → Role). Everyone imported
 * registers as Employee; the sheet's value becomes a suggestion an Admin approves or declines. Every change and
 * decision is recorded in EmsAccessChange (who, from → to, when, why). Only Admins act; HR can look.
 */
export type AccessDecision = 'APPROVE' | 'DECLINE';
type Actor = { userId?: string; role?: string | null };
type Skip = { employeeId: string; name: string; reason: string };

const MAX_PEOPLE = 200;
const roleLabel = (role?: string | null) => (role && ACCESS_ROLE_LABELS[role as OnboardingAccountRole]) || (role === 'SUPER_ADMIN' ? 'Super Admin' : role ?? 'No access');
const fullName = (p: { firstName?: string | null; lastName?: string | null; employeeCode?: string | null }) =>
  [p.firstName, p.lastName].map(v => v?.trim()).filter(Boolean).join(' ') || p.employeeCode?.trim() || 'Unnamed employee';

const personSelect = (organizationId: string) => ({
  id: true, firstName: true, lastName: true, employeeCode: true, userId: true, jobTitle: true, beesAccessLevel: true,
  suggestedAccess: true, suggestedAccessState: true, accessRevision: true,
  department: { select: { name: true } },
  user: { select: { organizations: { where: { organizationId }, select: { role: { select: { name: true } } } } } },
}) satisfies Prisma.EmployeeSelect;
type Person = Prisma.EmployeeGetPayload<{ select: ReturnType<typeof personSelect> }>;
const currentRole = (person: Person) => person.user?.organizations[0]?.role.name ?? null;

function cleanReason(reason: unknown, fallback?: string) {
  const text = typeof reason === 'string' ? reason.trim() : '';
  if (!text && fallback) return fallback;
  if (text.length < 3 || text.length > 500) throw new BadRequestException('Give a reason of 3–500 characters.');
  return text;
}

function cleanIds(ids: unknown): string[] {
  const list = Array.isArray(ids) ? [...new Set(ids.filter((id): id is string => typeof id === 'string' && !!id.trim()))] : [];
  if (!list.length) throw new BadRequestException('Choose at least one employee.');
  if (list.length > MAX_PEOPLE) throw new BadRequestException(`Choose at most ${MAX_PEOPLE} employees at a time.`);
  return list;
}

function requireAdmin(actor: Actor) {
  if (!actor.userId) throw new UnauthorizedException();
  if (!canChangeAccess(actor.role)) throw new ForbiddenException('Only an Admin can change access.');
}

/** The Access card on a profile: current role, the import's suggestion, and the history. */
export async function employeeAccess(prisma: PrismaService, organizationId: string, employeeId: string, viewerRole?: string | null) {
  const person = await prisma.employee.findFirst({ where: { id: employeeId, organizationId }, select: personSelect(organizationId) });
  if (!person) throw new NotFoundException('Employee not found');
  const history = await prisma.emsAccessChange.findMany({
    where: { organizationId, employeeId }, orderBy: { changedAt: 'desc' }, take: 21,
    select: { id: true, kind: true, fromRole: true, toRole: true, suggestedRole: true, reason: true, actorName: true, actorUserId: true, changedAt: true },
  });
  return {
    employeeId, role: currentRole(person), accountLinked: !!person.user?.organizations.length,
    sheetValue: person.beesAccessLevel, suggestedAccess: person.suggestedAccess, suggestedAccessState: person.suggestedAccessState,
    revision: person.accessRevision, canChange: canChangeAccess(viewerRole),
    history: history.slice(0, 20), hasMoreHistory: history.length > 20,
  };
}

/** People an import suggested for access above Employee, still waiting for an Admin. Optionally one import only. */
export async function accessSuggestions(prisma: PrismaService, organizationId: string, query: { batchId?: string }, viewerRole?: string | null) {
  const where: Prisma.EmployeeWhereInput = { organizationId, suggestedAccessState: 'PENDING',
    ...(query.batchId ? { emsOnboardingRecord: { batchId: query.batchId } } : {}) };
  const people = await prisma.employee.findMany({ where, select: personSelect(organizationId), orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }], take: 500 });
  return {
    canDecide: canChangeAccess(viewerRole),
    suggestions: people.map(person => ({
      employeeId: person.id, name: fullName(person), employeeCode: person.employeeCode, department: person.department?.name ?? null,
      jobTitle: person.jobTitle, role: currentRole(person), accountLinked: !!person.user?.organizations.length,
      suggestedAccess: person.suggestedAccess, sheetValue: person.beesAccessLevel, revision: person.accessRevision,
    })),
  };
}

type Plan = { person: Person; to: OnboardingAccountRole | null; kind: 'CHANGED' | 'APPROVED' | 'DECLINED' };

/**
 * Change access for one or more people (Change access), or approve/decline their suggestions.
 * One transaction, with the company locked so two Admins can't both remove "the other" Admin.
 * People who can't be changed are skipped with a reason; the rest are saved.
 */
async function applyAccess(prisma: PrismaService, organizationId: string, actor: Actor, ids: string[], reason: string,
  expected: Record<string, number> | undefined, plan: (person: Person) => Plan | string): Promise<{ changed: number; changedIds: string[]; skipped: Skip[] }> {
  const roles = await prisma.role.findMany({ select: { id: true, name: true } });
  const roleIds = new Map(roles.map(role => [role.name as string, role.id]));
  return retryOnboardingTransaction(() => prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${organizationId} FOR NO KEY UPDATE`;
    const people = await tx.employee.findMany({ where: { organizationId, id: { in: ids } }, select: personSelect(organizationId) });
    const byId = new Map(people.map(person => [person.id, person]));
    // Company Admins left after this request; the last one can't be lowered.
    const admins = new Set((await tx.userOrganization.findMany({ where: { organizationId, role: { name: 'ADMIN' } }, select: { userId: true } })).map(m => m.userId));
    const actorName = (await tx.user.findUnique({ where: { id: actor.userId! }, select: { name: true } }))?.name ?? null;
    const done: string[] = [], skipped: Skip[] = [];
    for (const id of ids) {
      const person = byId.get(id);
      if (!person) { skipped.push({ employeeId: id, name: 'Unknown employee', reason: 'Not found in this company' }); continue; }
      const name = fullName(person);
      if (expected && expected[id] !== undefined && expected[id] !== person.accessRevision) {
        skipped.push({ employeeId: id, name, reason: 'Changed since you opened it. Reload and try again.' }); continue;
      }
      const step = plan(person);
      if (typeof step === 'string') { skipped.push({ employeeId: id, name, reason: step }); continue; }
      const from = currentRole(person);
      const changesRole = step.to !== null && step.to !== from;
      if (changesRole) {
        if (!person.userId || !from) { skipped.push({ employeeId: id, name, reason: 'No BEES account linked yet' }); continue; }
        if (person.userId === actor.userId) { skipped.push({ employeeId: id, name, reason: "You can't change your own access" }); continue; }
        if (from === 'SUPER_ADMIN') { skipped.push({ employeeId: id, name, reason: 'Super Admin access is managed outside EMS' }); continue; }
        if (from === 'ADMIN' && admins.size <= 1 && admins.has(person.userId)) {
          skipped.push({ employeeId: id, name, reason: 'The company must keep at least one Admin' }); continue;
        }
        const roleId = roleIds.get(step.to!);
        if (!roleId) throw new BadRequestException(`The ${roleLabel(step.to)} access level is not configured`);
        await tx.userOrganization.update({ where: { userId_organizationId: { userId: person.userId, organizationId } }, data: { roleId } });
        if (from === 'ADMIN') admins.delete(person.userId);
        if (step.to === 'ADMIN') admins.add(person.userId);
      }
      // A direct change to exactly the suggested level settles the suggestion too.
      const settles = step.kind !== 'CHANGED' ? step.kind : person.suggestedAccessState === 'PENDING' && step.to === person.suggestedAccess ? 'APPROVED' : null;
      await tx.employee.update({ where: { id }, data: { accessRevision: { increment: 1 }, ...(settles ? { suggestedAccessState: settles } : {}) } });
      await tx.emsAccessChange.create({ data: {
        organizationId, employeeId: id, subjectEmployeeId: id, userId: person.userId, kind: step.kind,
        fromRole: from as never, toRole: (step.to ?? from) as never, suggestedRole: step.kind === 'CHANGED' ? null : person.suggestedAccess,
        reason, actorUserId: actor.userId!, actorName,
      } });
      done.push(id);
    }
    return { changed: done.length, changedIds: done, skipped };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 }));
}

/** Change access (profile, or several people from the Employees list). Admins only; a reason is required. */
export async function changeAccess(prisma: PrismaService, organizationId: string, actor: Actor,
  dto: { employeeIds: string[]; role: string; reason: string; expectedRevisions?: Record<string, number> }) {
  requireAdmin(actor);
  const to = dto.role as OnboardingAccountRole;
  if (!ASSIGNABLE_ROLES.includes(to)) throw new BadRequestException('Choose Employee, Executive, HOD, HR or Admin.');
  const reason = cleanReason(dto.reason);
  return applyAccess(prisma, organizationId, actor, cleanIds(dto.employeeIds), reason, dto.expectedRevisions,
    person => currentRole(person) === to ? `Already ${roleLabel(to)}` : { person, to, kind: 'CHANGED' });
}

/** Approve (give the suggested access) or decline the import's suggestion. Admins only; the reason is optional. */
export async function decideAccessSuggestions(prisma: PrismaService, organizationId: string, actor: Actor,
  dto: { employeeIds: string[]; decision: AccessDecision; reason?: string; expectedRevisions?: Record<string, number> }) {
  requireAdmin(actor);
  if (dto.decision !== 'APPROVE' && dto.decision !== 'DECLINE') throw new BadRequestException('Choose approve or decline.');
  const reason = cleanReason(dto.reason, dto.decision === 'APPROVE' ? 'Approved the access suggested on import' : 'Declined the access suggested on import');
  return applyAccess(prisma, organizationId, actor, cleanIds(dto.employeeIds), reason, dto.expectedRevisions, person => {
    if (person.suggestedAccessState !== 'PENDING' || !person.suggestedAccess) return 'No suggestion waiting';
    if (dto.decision === 'DECLINE') return { person, to: null, kind: 'DECLINED' };
    if (!ASSIGNABLE_ROLES.includes(person.suggestedAccess as OnboardingAccountRole)) return 'This suggestion can’t be given in EMS';
    return { person, to: person.suggestedAccess as OnboardingAccountRole, kind: 'APPROVED' };
  });
}
