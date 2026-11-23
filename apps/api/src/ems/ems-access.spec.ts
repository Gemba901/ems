import 'reflect-metadata';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PrismaService } from 'src/prisma/prisma.service';
import { Role } from 'src/common/enum/role.enum';
import { ROLES_KEY } from 'src/auth/decorators/roles.decorator';
import { accessSuggestions, changeAccess, decideAccessSuggestions, employeeAccess, suggestAccess } from './ems-access';
import { EmsAccessController } from './ems-access.controller';
import { ChangeAccessDto, DecideAccessSuggestionsDto } from './dto/access.dto';
import { suggestedAccessRole } from './onboarding-access';

const ROLES = ['SUPER_ADMIN', 'ADMIN', 'MANAGEMENT', 'HR', 'HOD', 'EMPLOYEE'].map((name, i) => ({ id: i + 1, name }));
type P = { id: string; userId: string | null; role: string | null; suggestedAccess?: string | null; suggestedAccessState?: string | null; accessRevision?: number; organizationId?: string };

function setup(people: P[]) {
  const state = {
    people: people.map(p => ({ organizationId: 'org', suggestedAccess: null, suggestedAccessState: null, accessRevision: 0, ...p })),
    changes: [] as any[],
  };
  const shape = (p: any) => ({
    id: p.id, firstName: p.id, lastName: 'Test', employeeCode: p.id.toUpperCase(), userId: p.userId, jobTitle: null, beesAccessLevel: p.suggestedAccess ?? null,
    suggestedAccess: p.suggestedAccess, suggestedAccessState: p.suggestedAccessState, accessRevision: p.accessRevision, department: null,
    user: p.userId ? { organizations: p.role ? [{ role: { name: p.role } }] : [] } : null,
  });
  const prisma: any = {
    role: { findMany: jest.fn(async () => ROLES) },
    $queryRaw: jest.fn(async () => []),
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
    user: { findUnique: jest.fn(async () => ({ name: 'Ada Admin' })) },
    employee: {
      findMany: jest.fn(async ({ where }: any) => state.people.filter(p => p.organizationId === where.organizationId
        && (!where.id || where.id.in.includes(p.id)) && (!where.suggestedAccessState || p.suggestedAccessState === where.suggestedAccessState)).map(shape)),
      findFirst: jest.fn(async ({ where }: any) => { const p = state.people.find(p => p.id === where.id && p.organizationId === where.organizationId); return p ? shape(p) : null; }),
      update: jest.fn(async ({ where, data }: any) => {
        const p = state.people.find(p => p.id === where.id)!;
        p.accessRevision += data.accessRevision.increment;
        if (data.suggestedAccessState) p.suggestedAccessState = data.suggestedAccessState;
        if (data.suggestedAccess) p.suggestedAccess = data.suggestedAccess;
        return p;
      }),
    },
    userOrganization: {
      findMany: jest.fn(async ({ where }: any) => state.people.filter(p => p.organizationId === where.organizationId && p.userId && p.role === where.role.name).map(p => ({ userId: p.userId }))),
      update: jest.fn(async ({ where, data }: any) => {
        const p = state.people.find(p => p.userId === where.userId_organizationId.userId)!;
        p.role = ROLES.find(r => r.id === data.roleId)!.name;
      }),
    },
    emsAccessChange: {
      create: jest.fn(async ({ data }: any) => { state.changes.push(data); return data; }),
      findMany: jest.fn(async ({ where }: any) => [...state.changes].reverse().filter((c: any) =>
        (!where?.employeeId || (typeof where.employeeId === 'string' ? c.employeeId === where.employeeId : where.employeeId.in.includes(c.employeeId)))
        && (!where?.kind || where.kind.in.includes(c.kind)))),
    },
  };
  return { prisma: prisma as PrismaService & typeof prisma, state, role: (id: string) => state.people.find(p => p.id === id)!.role };
}
const admin = { userId: 'u-admin', role: Role.ADMIN };

describe('Change access', () => {
  it('changes the company role, bumps the revision and records who, from, to and why', async () => {
    const { prisma, state, role } = setup([{ id: 'a', userId: 'u-a', role: 'EMPLOYEE' }, { id: 'me', userId: 'u-admin', role: 'ADMIN' }]);
    const result = await changeAccess(prisma, 'org', admin, { employeeIds: ['a'], role: 'HOD', reason: 'Heads Stores', expectedRevisions: { a: 0 } });
    expect(result).toMatchObject({ changed: 1, skipped: [] });
    expect(role('a')).toBe('HOD');
    expect(state.people[0].accessRevision).toBe(1);
    expect(state.changes[0]).toMatchObject({ kind: 'CHANGED', fromRole: 'EMPLOYEE', toRole: 'HOD', reason: 'Heads Stores', actorUserId: 'u-admin', actorName: 'Ada Admin', employeeId: 'a' });
  });

  it('skips with a reason: yourself, the last Admin, no account, a Super Admin, unchanged, and a stale revision', async () => {
    const { prisma, role } = setup([
      { id: 'me', userId: 'u-admin', role: 'ADMIN' }, { id: 'other', userId: 'u-o', role: 'ADMIN' }, { id: 'none', userId: null, role: null },
      { id: 'sa', userId: 'u-sa', role: 'SUPER_ADMIN' }, { id: 'e', userId: 'u-e', role: 'EMPLOYEE', accessRevision: 3 },
    ]);
    const first = await changeAccess(prisma, 'org', admin, { employeeIds: ['me', 'other', 'none', 'sa', 'e'], role: 'EMPLOYEE', reason: 'Tidy up', expectedRevisions: { e: 2 } });
    expect(first.skipped.map(s => [s.employeeId, s.reason])).toEqual([
      ['me', "You can't change your own access"], ['none', 'No BEES account linked yet'], ['sa', 'Super Admin access is managed outside EMS'],
      ['e', 'Changed since you opened it. Reload and try again.'],
    ]);
    expect(role('other')).toBe('EMPLOYEE');
    // Now "me" is the only Admin; another Admin can't lower them either.
    const second = setup([{ id: 'only', userId: 'u-only', role: 'ADMIN' }, { id: 'x', userId: 'u-admin', role: 'HR' }]);
    const result = await changeAccess(second.prisma, 'org', admin, { employeeIds: ['only'], role: 'HR', reason: 'Moving' });
    expect(result.skipped[0].reason).toBe('The company must keep at least one Admin');
    expect(second.role('only')).toBe('ADMIN');
    const same = await changeAccess(second.prisma, 'org', admin, { employeeIds: ['x'], role: 'HR', reason: 'Again' });
    expect(same.skipped[0].reason).toBe('Already HR');
  });

  it('lowers several Admins in one go only while one remains', async () => {
    const { prisma, role } = setup([{ id: 'a1', userId: 'u1', role: 'ADMIN' }, { id: 'a2', userId: 'u2', role: 'ADMIN' }]);
    const result = await changeAccess(prisma, 'org', admin, { employeeIds: ['a1', 'a2'], role: 'EMPLOYEE', reason: 'Restructure' });
    expect([role('a1'), role('a2')]).toEqual(['EMPLOYEE', 'ADMIN']);
    expect(result.skipped).toEqual([{ employeeId: 'a2', name: 'a2 Test', reason: 'The company must keep at least one Admin' }]);
  });

  it('is for Admins only, needs a reason, and never gives Super Admin', async () => {
    const { prisma } = setup([{ id: 'a', userId: 'u-a', role: 'EMPLOYEE' }]);
    await expect(changeAccess(prisma, 'org', { userId: 'hr', role: Role.HR }, { employeeIds: ['a'], role: 'HOD', reason: 'x y z' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(changeAccess(prisma, 'org', admin, { employeeIds: ['a'], role: 'HOD', reason: ' ' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(changeAccess(prisma, 'org', admin, { employeeIds: ['a'], role: 'SUPER_ADMIN', reason: 'Because' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(changeAccess(prisma, 'org', admin, { employeeIds: [], role: 'HOD', reason: 'Because' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('settles a pending suggestion when the change gives exactly that access', async () => {
    const { prisma, state } = setup([{ id: 'a', userId: 'u-a', role: 'EMPLOYEE', suggestedAccess: 'HOD', suggestedAccessState: 'PENDING' }]);
    await changeAccess(prisma, 'org', admin, { employeeIds: ['a'], role: 'HOD', reason: 'Confirmed' });
    expect(state.people[0].suggestedAccessState).toBe('APPROVED');
  });
});

describe('Suggested access from imports', () => {
  it('lists pending suggestions and approves them, giving the suggested role', async () => {
    const { prisma, state, role } = setup([
      { id: 'h', userId: 'u-h', role: 'EMPLOYEE', suggestedAccess: 'HOD', suggestedAccessState: 'PENDING' },
      { id: 'n', userId: 'u-n', role: 'EMPLOYEE' },
    ]);
    const list = await accessSuggestions(prisma, 'org', {}, Role.HR);
    expect(list).toMatchObject({ canDecide: false, suggestions: [{ employeeId: 'h', suggestedAccess: 'HOD', role: 'EMPLOYEE' }] });
    const result = await decideAccessSuggestions(prisma, 'org', admin, { employeeIds: ['h', 'n'], decision: 'APPROVE' });
    expect(role('h')).toBe('HOD');
    expect(state.people[0].suggestedAccessState).toBe('APPROVED');
    expect(result.skipped).toEqual([{ employeeId: 'n', name: 'n Test', reason: 'No suggestion waiting' }]);
    expect(state.changes[0]).toMatchObject({ kind: 'APPROVED', fromRole: 'EMPLOYEE', toRole: 'HOD', suggestedRole: 'HOD', reason: 'Approved the access suggested on import' });
  });

  it('declines without changing the role, and keeps the suggestion until the account is linked', async () => {
    const { prisma, state, role } = setup([
      { id: 'd', userId: 'u-d', role: 'EMPLOYEE', suggestedAccess: 'ADMIN', suggestedAccessState: 'PENDING' },
      { id: 'p', userId: null, role: null, suggestedAccess: 'HR', suggestedAccessState: 'PENDING' },
    ]);
    await decideAccessSuggestions(prisma, 'org', admin, { employeeIds: ['d'], decision: 'DECLINE', reason: 'Not an Admin' });
    expect(role('d')).toBe('EMPLOYEE');
    expect(state.changes[0]).toMatchObject({ kind: 'DECLINED', fromRole: 'EMPLOYEE', toRole: 'EMPLOYEE', suggestedRole: 'ADMIN', reason: 'Not an Admin' });
    const approve = await decideAccessSuggestions(prisma, 'org', admin, { employeeIds: ['p'], decision: 'APPROVE' });
    expect(approve.skipped[0].reason).toBe('No BEES account linked yet');
    expect(state.people[1].suggestedAccessState).toBe('PENDING');
    await expect(decideAccessSuggestions(prisma, 'org', { userId: 'hr', role: Role.HR }, { employeeIds: ['p'], decision: 'DECLINE' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('shows a profile its role, suggestion and history; another company sees nothing', async () => {
    const { prisma } = setup([{ id: 'a', userId: 'u-a', role: 'EMPLOYEE', suggestedAccess: 'HOD', suggestedAccessState: 'PENDING' }]);
    await changeAccess(prisma, 'org', admin, { employeeIds: ['a'], role: 'HR', reason: 'Joins HR' });
    const view = await employeeAccess(prisma, 'org', 'a', Role.ADMIN);
    expect(view).toMatchObject({ role: 'HR', accountLinked: true, suggestedAccess: 'HOD', suggestedAccessState: 'PENDING', revision: 1, canChange: true });
    expect(view.history).toHaveLength(1);
    await expect(employeeAccess(prisma, 'other', 'a', Role.ADMIN)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('suggests only recognised levels above Employee', () => {
    expect(['Employee', 'Supervisor', 'Team Lead', '', 'SUPER_ADMIN'].map(suggestedAccessRole)).toEqual([undefined, undefined, undefined, undefined, undefined]);
    expect(['Exec', 'HOD', 'HR', 'Admin'].map(suggestedAccessRole)).toEqual(['MANAGEMENT', 'HOD', 'HR', 'ADMIN']);
  });

  it('routes: HR and Admins can look; only Admins change or decide; requests are checked', () => {
    expect(Reflect.getMetadata(ROLES_KEY, EmsAccessController)).toEqual([Role.SUPER_ADMIN, Role.ADMIN, Role.HR]);
    expect(Reflect.getMetadata(ROLES_KEY, EmsAccessController.prototype.change)).toEqual([Role.SUPER_ADMIN, Role.ADMIN]);
    expect(Reflect.getMetadata(ROLES_KEY, EmsAccessController.prototype.decide)).toEqual([Role.SUPER_ADMIN, Role.ADMIN]);
    const bad = (cls: any, body: object) => validateSync(plainToInstance(cls, body)).length;
    expect(bad(ChangeAccessDto, { employeeIds: ['a'], role: 'HOD', reason: 'Heads Stores' })).toBe(0);
    expect(bad(ChangeAccessDto, { employeeIds: ['a'], role: 'SUPER_ADMIN', reason: 'Heads Stores' })).toBeGreaterThan(0);
    expect(bad(ChangeAccessDto, { employeeIds: ['a'], role: 'HOD', reason: 'x' })).toBeGreaterThan(0);
    expect(bad(DecideAccessSuggestionsDto, { employeeIds: ['a'], decision: 'APPROVE' })).toBe(0);
    expect(bad(DecideAccessSuggestionsDto, { employeeIds: ['a'], decision: 'MAYBE' })).toBeGreaterThan(0);
  });
});

describe('HR suggests a change of access', () => {
  const hr = { userId: 'u-hr', role: Role.HR };
  it('records a pending suggestion with the reason, changes nothing yet, and an Admin can approve it', async () => {
    const { prisma, state, role } = setup([{ id: 'a', userId: 'u-a', role: 'EMPLOYEE' }]);
    const result = await suggestAccess(prisma, 'org', hr, { employeeIds: ['a'], role: 'HOD', reason: 'Runs the Stores team' });
    expect(result).toMatchObject({ changed: 1, skipped: [] });
    expect(role('a')).toBe('EMPLOYEE');
    expect(state.people[0]).toMatchObject({ suggestedAccess: 'HOD', suggestedAccessState: 'PENDING', accessRevision: 1 });
    expect(state.changes[0]).toMatchObject({ kind: 'SUGGESTED', fromRole: 'EMPLOYEE', suggestedRole: 'HOD', reason: 'Runs the Stores team', actorUserId: 'u-hr' });
    const list = await accessSuggestions(prisma, 'org', {}, Role.ADMIN);
    expect(list.suggestions[0]).toMatchObject({ employeeId: 'a', source: 'HR', suggestedBy: 'Ada Admin', suggestionReason: 'Runs the Stores team' });
    expect(await employeeAccess(prisma, 'org', 'a', Role.HR)).toMatchObject({ canChange: false, canSuggest: true, suggestedBy: { reason: 'Runs the Stores team' } });
    await decideAccessSuggestions(prisma, 'org', admin, { employeeIds: ['a'], decision: 'APPROVE' });
    expect(role('a')).toBe('HOD');
    expect((await accessSuggestions(prisma, 'org', {}, Role.ADMIN)).suggestions).toEqual([]);
  });
  it('shows an import suggestion as coming from the import', async () => {
    const { prisma } = setup([{ id: 'i', userId: 'u-i', role: 'EMPLOYEE', suggestedAccess: 'HR', suggestedAccessState: 'PENDING' }]);
    expect((await accessSuggestions(prisma, 'org', {}, Role.HR)).suggestions[0]).toMatchObject({ source: 'IMPORT', suggestedBy: null });
  });
  it('skips yourself, the same level and a Super Admin; employees cannot suggest; a reason is required', async () => {
    const { prisma } = setup([{ id: 'me', userId: 'u-hr', role: 'HR' }, { id: 'h', userId: 'u-h', role: 'HOD' }, { id: 'sa', userId: 'u-sa', role: 'SUPER_ADMIN' }]);
    const result = await suggestAccess(prisma, 'org', hr, { employeeIds: ['me', 'h', 'sa'], role: 'HOD', reason: 'Tidy up' });
    expect(result.skipped.map(s => s.reason)).toEqual(["You can't suggest your own access", 'Already HOD', 'Super Admin access is managed outside EMS']);
    await expect(suggestAccess(prisma, 'org', { userId: 'e', role: Role.EMPLOYEE }, { employeeIds: ['h'], role: 'HR', reason: 'Please' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(suggestAccess(prisma, 'org', hr, { employeeIds: ['h'], role: 'HR', reason: '' })).rejects.toBeInstanceOf(BadRequestException);
  });
  it('route: HR and Admins can suggest', () => {
    expect(Reflect.getMetadata(ROLES_KEY, EmsAccessController.prototype.suggest)).toBeUndefined();
    expect(Reflect.getMetadata(ROLES_KEY, EmsAccessController)).toEqual([Role.SUPER_ADMIN, Role.ADMIN, Role.HR]);
  });
});
