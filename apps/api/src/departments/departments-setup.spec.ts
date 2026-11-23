import 'reflect-metadata';
import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { DepartmentsService } from './departments.service';
import { DepartmentsController } from './departments.controller';
import { PrismaService } from '../prisma/prisma.service';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role } from '../common/enum/role.enum';
import type { TenantRequest } from '../tenancy/tenant-context';

function fixture() {
  const rows = [{ id: 'one', name: 'Production', organizationId: 'org' }, { id: 'other', name: 'Quality', organizationId: 'other-org' }];
  const events: string[] = [];
  const department = {
    findMany: jest.fn(async ({ where }) => { events.push('read'); return rows.filter(row => row.organizationId === where.organizationId && row.id !== where.id?.not); }),
    findFirst: jest.fn(async ({ where }) => rows.find(row => row.id === where.id && row.organizationId === where.organizationId) ?? null),
    createMany: jest.fn(async ({ data }) => { events.push('write'); rows.push(...data.map((row: typeof rows[number], i: number) => ({ ...row, id: `new-${rows.length + i}` }))); return { count: data.length }; }),
    create: jest.fn(async ({ data }) => { rows.push({ id: 'single', ...data }); return data; }),
    update: jest.fn(async ({ where, data }) => { const row = rows.find(r => r.id === where.id)!; Object.assign(row, data); return row; }),
  };
  const tx = { department, $queryRaw: jest.fn(async () => { events.push('lock'); return []; }) };
  const prisma = { $transaction: jest.fn(async (work: (client: typeof tx) => unknown) => work(tx)), department };
  return { rows, events, tx, prisma, service: new DepartmentsService(prisma as unknown as PrismaService) };
}

describe('Department setup', () => {
  it('creates only missing names, normalizes whitespace, and deduplicates casing', async () => {
    const f = fixture();
    await expect(f.service.createDepartments([' production ', 'Quality', 'Quality', 'Human   Resources', 'human resources'], 'org')).resolves.toEqual({ created: ['Quality', 'human resources'], existing: ['Production'] });
    expect(f.prisma.department.createMany).toHaveBeenCalledWith({ data: [{ name: 'Quality', organizationId: 'org' }, { name: 'human resources', organizationId: 'org' }] });
    expect(f.events).toEqual(['lock', 'read', 'write']);
  });
  it('reuses a completed save when a client retries after losing the response', async () => {
    const f = fixture();
    await f.service.createDepartments(['Quality'], 'org');
    await expect(f.service.createDepartments(['Quality'], 'org')).resolves.toEqual({ created: [], existing: ['Quality'] });
    expect(f.prisma.department.createMany).toHaveBeenCalledTimes(1);
  });
  it.each([undefined, null, {}, 'Quality', [], [''], ['N/A'], ['None'], [42], ['x'.repeat(161)], Array(101).fill('Quality')])('rejects invalid input %# without opening a transaction', async value => {
    const f = fixture();
    await expect(f.service.createDepartments(value, 'org')).rejects.toBeInstanceOf(BadRequestException);
    expect(f.prisma.$transaction).not.toHaveBeenCalled();
  });
  it('validates the entire list before saving any name', async () => {
    const f = fixture();
    await expect(f.service.createDepartments(['Quality', 'N/A'], 'org')).rejects.toBeInstanceOf(BadRequestException);
    expect(f.prisma.department.createMany).not.toHaveBeenCalled();
  });
  it('refuses to pick between duplicate existing departments', async () => {
    const f = fixture(); f.rows.push({ id: 'duplicate', name: 'PRODUCTION', organizationId: 'org' });
    await expect(f.service.createDepartments(['Quality', 'Production'], 'org')).rejects.toBeInstanceOf(ConflictException);
    expect(f.prisma.department.createMany).not.toHaveBeenCalled();
  });
  it('refuses names the importer would confuse instead of silently merging them', async () => {
    const f = fixture();
    await expect(f.service.createDepartments(['R&D', 'RD'], 'org')).rejects.toBeInstanceOf(ConflictException);
    expect(f.prisma.department.createMany).not.toHaveBeenCalled();
  });
  it('flags the current importer limitation without restricting the legacy single-create API', async () => {
    const f = fixture();
    await expect(f.service.createDepartments(['财务'], 'org')).rejects.toBeInstanceOf(BadRequestException);
    await expect(f.service.createDepartment('财务', 'org')).resolves.toMatchObject({ name: '财务' });
  });
  it('rejects single-create duplicates and retains the legacy return shape', async () => {
    const f = fixture();
    await expect(f.service.createDepartment(' PRODUCTION ', 'org')).rejects.toBeInstanceOf(ConflictException);
    await expect(f.service.createDepartment(' Quality ', 'org')).resolves.toEqual({ name: 'Quality', organizationId: 'org' });
    expect(f.tx.$queryRaw).toHaveBeenCalledTimes(2);
  });
  it('refuses a rename to an existing department name', async () => {
    const f = fixture(); f.rows.push({ id: 'two', name: 'Quality', organizationId: 'org' });
    await expect(f.service.updateDepartment('two', 'Production', 'org')).rejects.toBeInstanceOf(ConflictException);
    expect(f.prisma.department.update).not.toHaveBeenCalled();
  });
  it('allows display-only changes to the same department', async () => {
    const f = fixture();
    await expect(f.service.updateDepartment('one', 'PRODUCTION', 'org')).resolves.toMatchObject({ id: 'one', name: 'PRODUCTION' });
  });
  it('propagates a database failure instead of reporting success', async () => {
    const f = fixture(); f.prisma.department.createMany.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(f.service.createDepartments(['Quality'], 'org')).rejects.toThrow('database unavailable');
  });
  it('fails closed without a company', async () => {
    const f = fixture();
    await expect(f.service.createDepartments(['Quality'], '')).rejects.toBeInstanceOf(BadRequestException);
    expect(f.prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('Department setup controller contract', () => {
  const req = { tenant: { organizationId: 'org' } } as TenantRequest;
  it('takes company context from the trusted request, never the payload', async () => {
    const f = fixture(), controller = new DepartmentsController(f.service);
    await controller.createDepartment({ names: ['Quality'], organizationId: 'other-org', isPlatformTeam: true } as never, req);
    expect(f.prisma.department.createMany).toHaveBeenCalledWith({ data: [{ name: 'Quality', organizationId: 'org' }] });
  });
  it('rejects conflicting single and bulk payloads', () => {
    const f = fixture(), controller = new DepartmentsController(f.service);
    expect(() => controller.createDepartment({ name: 'Quality', names: ['Finance'] }, req)).toThrow(BadRequestException);
    expect(f.prisma.$transaction).not.toHaveBeenCalled();
  });
  it('rejects bulk creation without trusted company context', () => {
    const f = fixture(), controller = new DepartmentsController(f.service);
    expect(() => controller.createDepartment({ names: ['Finance'] }, {} as TenantRequest)).toThrow(UnauthorizedException);
  });
  it.each([Role.ADMIN, Role.SUPER_ADMIN, Role.HR, Role.MANAGEMENT, Role.HOD, Role.EMPLOYEE])('retains the existing create permissions for %s', role => {
    const controller = new DepartmentsController(fixture().service);
    const context = { getClass: () => DepartmentsController, getHandler: () => controller.createDepartment, switchToHttp: () => ({ getRequest: () => ({ user: { roleLevel: role } }) }) } as unknown as ExecutionContext;
    expect(new RolesGuard(new Reflector()).canActivate(context)).toBe([Role.ADMIN, Role.SUPER_ADMIN].includes(role));
  });
});
