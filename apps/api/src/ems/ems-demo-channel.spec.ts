import 'reflect-metadata';
import { BadRequestException, ConflictException, ExecutionContext, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GUARDS_METADATA, PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { Role } from 'src/common/enum/role.enum';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { ROLES_KEY } from 'src/auth/decorators/roles.decorator';
import { createDuplicateIndex } from './onboarding-duplicates';
import { EmsService } from './ems.service';
import { EmsController } from './ems.controller';
import { EmsDemoToolsGuard } from './ems-demo-tools.guard';

const orgId = 'org-demo';
const context = (handler: Function, roleLevel?: Role) => ({
  getHandler: () => handler,
  getClass: () => EmsController,
  switchToHttp: () => ({ getRequest: () => ({ user: roleLevel !== undefined ? { roleLevel, organizationId: orgId } : undefined }) }),
}) as unknown as ExecutionContext;

// This fixture models commit/rollback. It does not replace a PostgreSQL concurrency test.
function channelFixture(channel: string | null = 'EMAIL') {
  let state = {
    channel,
    batches: [
      { id: 'draft', organizationId: orgId, status: 'DRAFT', checked: false },
      { id: 'ready', organizationId: orgId, status: 'READY', checked: false },
      { id: 'partial', organizationId: orgId, status: 'PARTIALLY_REGISTERED', checked: false },
      { id: 'done', organizationId: orgId, status: 'REGISTERED', checked: false },
      { id: 'cancelled', organizationId: orgId, status: 'CANCELLED', checked: false },
      { id: 'other-org', organizationId: 'other', status: 'DRAFT', checked: false },
    ],
  };
  let working: typeof state;
  const events: string[] = [];
  const tx = {
    $queryRaw: jest.fn(async (..._args: any[]) => { events.push('lock'); return [{ id: orgId }]; }),
    organization: {
      findUnique: jest.fn(async () => ({ communicationChannel: working.channel })),
      update: jest.fn(async ({ data }: any) => { events.push('channel'); working.channel = data.communicationChannel; return {}; }),
    },
    emsOnboardingBatch: {
      findMany: jest.fn(async ({ where }: any) => working.batches.filter(b =>
        b.organizationId === where.organizationId && !where.status.notIn.includes(b.status)).map(b => ({ id: b.id }))),
    },
  };
  const prisma = {
    $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => {
      working = JSON.parse(JSON.stringify(state));
      const result = await callback(tx);
      state = working;
      return result;
    }),
  };
  const service = new EmsService(prisma as never);
  const validate = jest.spyOn(service as any, 'validateOnboardingBatchLocked').mockImplementation(async (...args: any[]) => {
    expect(args[0]).toBe(tx);
    expect(args[1]).toBe(orgId);
    events.push(args[2]);
    working.batches.find(b => b.id === args[2])!.checked = true;
  });
  const publicValidate = jest.spyOn(service, 'validateOnboardingBatch');
  return { service, prisma, tx, validate, publicValidate, events, state: () => state };
}

function registrationFixture(lockedChannels: (string | null)[] = ['EMAIL', 'EMAIL']) {
  const records = ['one', 'two'].map((id, i) => ({
    id, status: 'READY', employeeCode: id, firstName: 'Demo', lastName: id,
    mobileNumber: `+25471234567${8 + i}`, beesAccessLevel: 'Employee',
    currentDepartment: 'Quality', jobDesignation: 'Inspector', reportingToDesignation: 'Board',
    reportingToBoard: true, workEmail: `${id}@example.test`,
  }));
  const batch = { id: 'batch', organizationId: orgId, status: 'READY', defaultPhoneCountry: 'KE', records };
  const events: string[] = [];
  const tx = {
    $queryRaw: jest.fn(async () => { events.push('lock'); return []; }),
    organization: { findUnique: jest.fn(async () => { events.push('channel-check'); return { communicationChannel: lockedChannels.shift() ?? null }; }) },
    emsOnboardingBatch: { findFirst: jest.fn(async () => batch) },
    user: { create: jest.fn(async () => ({ id: 'new-user' })) },
    userOrganization: { upsert: jest.fn(async () => ({})) },
    emsDepartmentHod: { findMany: jest.fn().mockResolvedValue([]) },
    department: { findMany: jest.fn().mockResolvedValue([]) },
    employee: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn(async () => ({ id: `employee-${events.push('employee-create')}` })) },
    emsOnboardingRecord: { update: jest.fn(async ({ where, data }: any) => { Object.assign(records.find(r => r.id === where.id)!, data); return {}; }) },
  };
  const prisma = {
    $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    organization: { findUnique: jest.fn(async () => ({ communicationChannel: 'EMAIL' as string | null })) },
    department: { findMany: jest.fn(async () => []) },
    role: { findMany: jest.fn(async () => [{ id: 'role-employee', name: 'EMPLOYEE' }]) },
    emsOnboardingBatch: { findFirst: jest.fn(async () => batch), updateMany: jest.fn(async () => ({ count: 1 })) },
    emsOnboardingRecord: {
      updateMany: jest.fn(async () => ({ count: 1 })),
      findMany: jest.fn(async () => records.map(r => ({ status: r.status }))),
    },
  };
  const service = new EmsService(prisma as never);
  // Duplicate integration has its own suite; this fixture isolates channel interruption.
  jest.spyOn(service as any, 'duplicateContext').mockResolvedValue(createDuplicateIndex(orgId, []));
  jest.spyOn(service as any, 'reportingHierarchy').mockResolvedValue({
    orderedIds: records.map(r => r.id),
    byRecord: Object.fromEntries(records.map(r => [r.id, { target: 'BOARD', error: null }])),
  });
  jest.spyOn(service as any, 'checkOnboardingIdentity').mockResolvedValue(null);
  jest.spyOn(service as any, 'resolvePendingAssignments').mockResolvedValue(undefined);
  jest.spyOn(service, 'getOnboardingBatch').mockResolvedValue(batch as never);
  return { service, prisma, tx, events, records };
}

describe('EMS demo-only communication reset', () => {
  const previous = process.env.EMS_DEMO_TOOLS;
  beforeEach(() => { delete process.env.EMS_DEMO_TOOLS; });
  afterEach(() => { jest.restoreAllMocks(); });
  afterAll(() => {
    if (previous === undefined) delete process.env.EMS_DEMO_TOOLS;
    else process.env.EMS_DEMO_TOOLS = previous;
  });

  it.each([undefined, '', 'false', 'TRUE', '1'])('requires the exact enabled flag: %s', async value => {
    if (value !== undefined) process.env.EMS_DEMO_TOOLS = value;
    const f = channelFixture();
    await expect(f.service.resetCommunicationChannel(orgId)).rejects.toBeInstanceOf(NotFoundException);
    expect(f.prisma.$transaction).not.toHaveBeenCalled();
    expect(f.state().channel).toBe('EMAIL');
  });

  it.each(['EMAIL', 'WHATSAPP', null])('resets %s and checks only unfinished batches in the same organisation', async channel => {
    process.env.EMS_DEMO_TOOLS = 'true';
    const f = channelFixture(channel);
    await expect(f.service.resetCommunicationChannel(orgId)).resolves.toEqual({ communicationChannel: null });
    expect(f.state().channel).toBeNull();
    expect(f.state().batches.filter(b => b.checked).map(b => b.id)).toEqual(['draft', 'ready', 'partial']);
    expect(f.events).toEqual(['lock', 'channel', 'draft', 'ready', 'partial']);
    expect(f.tx.organization.findUnique).toHaveBeenCalledWith({ where: { id: orgId }, select: { communicationChannel: true } });
    expect(f.tx.organization.update).toHaveBeenCalledWith({ where: { id: orgId }, data: { communicationChannel: null } });
    expect(f.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 20000 });
    expect(f.publicValidate).not.toHaveBeenCalled();
    expect(f.tx.$queryRaw.mock.calls[0][1]).toBe(orgId);
  });

  it('rolls back the channel and earlier batch checks if a later check fails', async () => {
    process.env.EMS_DEMO_TOOLS = 'true';
    const f = channelFixture();
    const validate = f.validate.getMockImplementation()!;
    f.validate.mockImplementation(async (...args: any[]) => {
      if (args[2] === 'ready') throw new Error('validation unavailable');
      return validate(...args);
    });
    await expect(f.service.resetCommunicationChannel(orgId)).rejects.toThrow('validation unavailable');
    expect(f.state().channel).toBe('EMAIL');
    expect(f.state().batches.some(b => b.checked)).toBe(false);
  });

  it('returns not found for a missing organisation without updates', async () => {
    process.env.EMS_DEMO_TOOLS = 'true';
    const f = channelFixture();
    f.tx.organization.findUnique.mockResolvedValueOnce(null as never);
    await expect(f.service.resetCommunicationChannel(orgId)).rejects.toBeInstanceOf(NotFoundException);
    expect(f.tx.organization.update).not.toHaveBeenCalled();
    expect(f.validate).not.toHaveBeenCalled();
  });

  it('runs actual validation: clears obsolete contact findings, keeps personal errors, and leaves registered/excluded rows alone', async () => {
    process.env.EMS_DEMO_TOOLS = 'true';
    let channel: string | null = 'EMAIL';
    const records = ['unregistered', 'personal-error', 'registered', 'excluded'].map((id, i) => ({
      id, employeeCode: id, firstName: 'Demo', lastName: i === 1 ? null : 'Person',
      mobileNumber: `+25471234567${i + 5}`, currentDepartment: 'Quality', beesAccessLevel: 'Employee',
      jobDesignation: 'Inspector', reportingToDesignation: 'Board', reportingToBoard: true,
      workEmail: null, whatsappNumber: null,
      status: i < 2 ? 'NEEDS_FIXING' : i === 2 ? 'REGISTERED' : 'EXCLUDED',
      validationErrors: [{ field: 'workEmail', message: 'Required' }],
    }));
    const batch = { id: 'batch', organizationId: orgId, defaultPhoneCountry: 'KE', status: 'DRAFT', records };
    const db: any = {
      emsDepartmentHod: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(async callback => callback(db)), $queryRaw: jest.fn(async () => []),
      organization: {
        findUnique: jest.fn(async () => ({ communicationChannel: channel })),
        update: jest.fn(async ({ data }) => { channel = data.communicationChannel; return {}; }),
      },
      emsOnboardingBatch: {
        findMany: jest.fn(async () => [{ id: batch.id }]), findFirst: jest.fn(async () => batch),
        update: jest.fn(async () => ({})),
      },
      employee: { findMany: jest.fn(async () => []) },
      department: { findMany: jest.fn(async () => [{ name: 'Quality' }]) },
      emsOnboardingRecord: { update: jest.fn(async () => ({})) },
    };
    const service = new EmsService(db);
    jest.spyOn(service as any, 'checkOnboardingIdentity').mockResolvedValue(null);
    // Duplicate integration has its own suite; this fixture isolates channel interruption.
  jest.spyOn(service as any, 'duplicateContext').mockResolvedValue(createDuplicateIndex(orgId, []));
  jest.spyOn(service as any, 'reportingHierarchy').mockResolvedValue({
      options: [], byRecord: Object.fromEntries(records.map(r => [r.id, { target: 'BOARD', error: null }])),
    });
    await service.resetCommunicationChannel(orgId);
    const resetWrites = db.emsOnboardingRecord.update.mock.calls.map(([arg]: any[]) => arg);
    expect(resetWrites.map((arg: any) => arg.where.id)).toEqual(['unregistered', 'personal-error']);
    expect(resetWrites[0].data.status).toBe('READY');
    expect(resetWrites[1].data.validationErrors).toEqual([{ field: 'lastName', message: 'Required' }]);
    db.emsOnboardingRecord.update.mockClear();
    await service.updateCommunicationChannel(orgId, { communicationChannel: 'EMAIL' } as never);
    expect(db.emsOnboardingRecord.update.mock.calls[0][0].data.status).toBe('NEEDS_FIXING');
    expect(db.emsOnboardingRecord.update.mock.calls[0][0].data.validationErrors).toContainEqual(expect.objectContaining({ field: 'workEmail' }));
  });

  it('keeps ordinary channel changes available with the demo flag off and makes them atomic too', async () => {
    const f = channelFixture();
    await expect(f.service.updateCommunicationChannel(orgId, { communicationChannel: 'WHATSAPP' } as never))
      .resolves.toEqual({ communicationChannel: 'WHATSAPP' });
    expect(f.events).toEqual(['lock', 'channel', 'draft', 'ready', 'partial']);
  });

  it('leaves a repeated ordinary channel selection as a no-op', async () => {
    const f = channelFixture();
    await expect(f.service.updateCommunicationChannel(orgId, { communicationChannel: 'EMAIL' } as never))
      .resolves.toEqual({ communicationChannel: 'EMAIL' });
    expect(f.tx.organization.update).not.toHaveBeenCalled();
    expect(f.validate).not.toHaveBeenCalled();
  });

  it('rolls back an ordinary channel switch if revalidation fails', async () => {
    const f = channelFixture();
    f.validate.mockRejectedValueOnce(new Error('validation unavailable'));
    await expect(f.service.updateCommunicationChannel(orgId, { communicationChannel: 'WHATSAPP' } as never)).rejects.toThrow('validation unavailable');
    expect(f.state().channel).toBe('EMAIL');
  });

  it('checks demo availability before existing controller guards, without removing any', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, EmsController);
    expect(guards.map((g: Function) => g.name)).toEqual([
      'EmsDemoToolsGuard', 'TrustedTenantContextGuard', 'JwtAuthGuard', 'TenantGuard', 'RolesGuard', 'ModuleGuard',
    ]);
    const guard = new EmsDemoToolsGuard(new Reflector());
    expect(() => guard.canActivate(context(EmsController.prototype.resetCommunicationChannel, Role.HR))).toThrow(NotFoundException);
    for (const method of ['getCommunicationChannel', 'updateCommunicationChannel', 'getMyProfile'] as const) {
      expect(guard.canActivate(context(EmsController.prototype[method], Role.HR))).toBe(true);
    }
  });

  it.each([Role.ADMIN, Role.SUPER_ADMIN])('uses the unchanged shared role guard to allow %s when enabled', role => {
    process.env.EMS_DEMO_TOOLS = 'true';
    const ctx = context(EmsController.prototype.resetCommunicationChannel, role);
    expect(new EmsDemoToolsGuard(new Reflector()).canActivate(ctx)).toBe(true);
    expect(new RolesGuard(new Reflector()).canActivate(ctx)).toBe(true);
  });

  it.each([Role.HR, Role.EMPLOYEE, undefined])('uses the unchanged shared role guard to reject %s', role => {
    process.env.EMS_DEMO_TOOLS = 'true';
    expect(new RolesGuard(new Reflector()).canActivate(context(EmsController.prototype.resetCommunicationChannel, role))).toBe(false);
  });

  it('adds only DELETE and keeps HR access to ordinary channel reads and changes', () => {
    const handler = EmsController.prototype.resetCommunicationChannel;
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('onboarding/communication-channel');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.DELETE);
    expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([Role.SUPER_ADMIN, Role.ADMIN]);
    for (const method of ['getCommunicationChannel', 'updateCommunicationChannel'] as const) {
      expect(new RolesGuard(new Reflector()).canActivate(context(EmsController.prototype[method], Role.HR))).toBe(true);
    }
  });

  it('passes the authenticated organisation to the service', async () => {
    const resetCommunicationChannel = jest.fn(async () => ({ communicationChannel: null }));
    const controller = new EmsController({ resetCommunicationChannel } as unknown as EmsService);
    await controller.resetCommunicationChannel({ organizationId: orgId });
    expect(resetCommunicationChannel).toHaveBeenCalledWith(orgId);
  });

  it('still refuses registration at preflight if no channel is chosen', async () => {
    const f = registrationFixture();
    f.prisma.organization.findUnique.mockResolvedValueOnce({ communicationChannel: null });
    await expect(f.service.registerOnboardingBatch(orgId, 'batch')).rejects.toBeInstanceOf(BadRequestException);
    expect(f.prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([null, 'WHATSAPP'])('stops if the channel becomes %s after preflight, without changing personal validation', async channel => {
    const f = registrationFixture([channel]);
    await expect(f.service.registerOnboardingBatch(orgId, 'batch')).rejects.toBeInstanceOf(ConflictException);
    expect(f.events).toEqual(['lock', 'channel-check']);
    expect(f.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(f.tx.user.create).not.toHaveBeenCalled();
    expect(f.tx.userOrganization.upsert).not.toHaveBeenCalled();
    expect(f.tx.employee.create).not.toHaveBeenCalled();
    expect(f.prisma.emsOnboardingRecord.updateMany).not.toHaveBeenCalled();
    expect(f.records.every(r => r.status === 'READY')).toBe(true);
  });

  it('keeps already committed registrations and reports their count if a reset happens between people', async () => {
    const f = registrationFixture(['EMAIL', null]);
    let error: ConflictException | undefined;
    try { await f.service.registerOnboardingBatch(orgId, 'batch'); } catch (caught) { error = caught as ConflictException; }
    expect(error).toBeInstanceOf(ConflictException);
    expect(error!.getResponse()).toEqual(expect.objectContaining({ registered: 1, failed: 0, statusCode: 409 }));
    expect(f.records.map(r => r.status)).toEqual(['REGISTERED', 'READY']);
    expect(f.tx.employee.create).toHaveBeenCalledTimes(1);
    expect(f.prisma.emsOnboardingRecord.updateMany).not.toHaveBeenCalled();
    expect(f.prisma.emsOnboardingBatch.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'PARTIALLY_REGISTERED' } }));
  });

  it.each([
    ['P2034', undefined], ['P2028', undefined],
    ['P2010', '40001'], ['P2010', '40P01'], ['P2010', '55P03'],
  ])('does not label a %s/%s transaction failure as a personal error', async (code, sqlState) => {
    const f = registrationFixture();
    f.prisma.$transaction.mockRejectedValue(Object.assign(new Error('database operation failed'), { code, meta: { code: sqlState } }));
    await expect(f.service.registerOnboardingBatch(orgId, 'batch')).rejects.toBeInstanceOf(ConflictException);
    expect(f.prisma.$transaction).toHaveBeenCalledTimes(code === 'P2034' || ['40001', '40P01'].includes(sqlState ?? '') ? 3 : 1);
    expect(f.prisma.emsOnboardingRecord.updateMany).not.toHaveBeenCalled();
    expect(f.tx.employee.create).not.toHaveBeenCalled();
  });

  it('continues registering normally when the channel is unchanged', async () => {
    const f = registrationFixture();
    await expect(f.service.registerOnboardingBatch(orgId, 'batch')).resolves.toEqual(expect.objectContaining({ registered: 2, failed: 0 }));
    expect(f.tx.organization.findUnique).toHaveBeenCalledTimes(2);
    expect(f.tx.employee.create).toHaveBeenCalledTimes(2);
    expect(f.prisma.emsOnboardingRecord.updateMany).not.toHaveBeenCalled();
  });

  it('retains the existing personal-validation failure path', async () => {
    const f = registrationFixture();
    jest.spyOn(f.service as any, 'checkOnboardingIdentity').mockRejectedValue(new BadRequestException('Phone already used'));
    await expect(f.service.registerOnboardingBatch(orgId, 'batch')).resolves.toEqual(expect.objectContaining({ registered: 0, failed: 2 }));
    expect(f.prisma.emsOnboardingRecord.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: 'NEEDS_FIXING', validationErrors: [{ field: 'registration', message: 'Phone already used' }] },
    }));
  });
});
