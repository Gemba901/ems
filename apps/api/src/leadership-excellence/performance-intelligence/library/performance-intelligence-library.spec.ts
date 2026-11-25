import 'reflect-metadata';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import {
  GUARDS_METADATA,
  HEADERS_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { ModuleType } from 'db';
import type { AccessTokenPayload } from '../../../auth/access-token-payload';
import { MODULE_KEY } from '../../../auth/decorators/module.decorator';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { ModuleGuard } from '../../../auth/guards/module.guard';
import { RolesGuard } from '../../../auth/guards/roles.guard';
import { Role } from '../../../common/enum/role.enum';
import { TenantGuard } from '../../../tenancy/tenant.guard';
import { TENANT_REQUIRED_KEY } from '../../../tenancy/tenant-route.decorator';
import { TrustedTenantContextGuard } from '../../../tenancy/trusted-tenant-context.guard';
import { emptyPlanningState } from '../../performance-planning/planning.seed';
import type { PlanningState } from '../../performance-planning/planning.types';
import { PerformanceIntelligenceLibraryController } from './performance-intelligence-library.controller';
import {
  libraryToday,
  PerformanceIntelligenceLibraryService,
} from './performance-intelligence-library.service';

const user: AccessTokenPayload = {
  tokenType: 'ACCESS',
  userId: 'hr',
  organizationId: 'one',
  roleId: 4,
  roleLevel: Role.HR,
  email: null,
  isAdminOrg: false,
};

function fixture() {
  const rows = new Map<string, { revision: number; state: PlanningState }>();
  const memberships = new Map([
    ['one/hr', { user: { name: 'HR editor' }, role: { name: 'HR' } }],
    [
      'two/hr',
      { user: { name: 'Second company editor' }, role: { name: 'HR' } },
    ],
    [
      'one/manager',
      { user: { name: 'Manager' }, role: { name: 'MANAGEMENT' } },
    ],
    [
      'one/employee',
      { user: { name: 'Employee' }, role: { name: 'EMPLOYEE' } },
    ],
  ]);
  const calls: string[] = [];
  const db = {
    organization: {
      findUnique: jest.fn(async () => ({ timeZone: 'Asia/Calcutta' })),
    },
    userOrganization: {
      findUnique: jest.fn(
        async ({
          where,
        }: {
          where: {
            userId_organizationId: { userId: string; organizationId: string };
          };
        }) => {
          const key = where.userId_organizationId;
          return memberships.get(`${key.organizationId}/${key.userId}`) || null;
        },
      ),
      findMany: jest.fn(
        async ({ where }: { where: { organizationId: string } }) =>
          where.organizationId === 'one'
            ? [{ user: { id: 'manager', name: 'Manager' } }]
            : [],
      ),
    },
    lexPlanningWorkspace: {
      findUnique: jest.fn(
        async ({ where }: { where: { organizationId: string } }) => {
          calls.push('read');
          return structuredClone(rows.get(where.organizationId) || null);
        },
      ),
      upsert: jest.fn(
        async ({
          where,
          create,
        }: {
          where: { organizationId: string };
          create: { state: PlanningState };
        }) => {
          if (!rows.has(where.organizationId))
            rows.set(where.organizationId, {
              revision: 0,
              state: structuredClone(create.state),
            });
          calls.push('upsert');
        },
      ),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { organizationId: string; revision: number };
          data: { state: PlanningState };
        }) => {
          const row = rows.get(where.organizationId);
          if (row?.revision !== where.revision) return { count: 0 };
          rows.set(where.organizationId, {
            revision: row.revision + 1,
            state: structuredClone(data.state),
          });
          calls.push('update');
          return { count: 1 };
        },
      ),
    },
    $queryRaw: jest.fn(async (..._args: unknown[]) => {
      calls.push('lock');
    }),
    $transaction: jest.fn(),
  };
  let queue = Promise.resolve();
  db.$transaction.mockImplementation(
    (callback: (tx: typeof db) => Promise<unknown>) => {
      const run = queue.then(() => callback(db));
      queue = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
  );
  return {
    db,
    rows,
    calls,
    memberships,
    service: new PerformanceIntelligenceLibraryService(db as never),
  };
}

describe('Area 07 shared planning library service', () => {
  it('reads reference examples without writing or creating a workspace', async () => {
    const { service, db } = fixture();
    const view = await service.getLibrary(user);
    expect(view.revision).toBe(0);
    expect(view.entries).toHaveLength(emptyPlanningState().definitions.length);
    expect(view.entries.every((entry) => entry.status === 'REFERENCE')).toBe(
      true,
    );
    expect(view.approvers).toEqual([{ id: 'manager', name: 'Manager' }]);
    expect(db.lexPlanningWorkspace.upsert).not.toHaveBeenCalled();
    expect(db.lexPlanningWorkspace.updateMany).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.userOrganization.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'one',
          role: { name: { in: ['SUPER_ADMIN', 'ADMIN', 'MANAGEMENT'] } },
        },
      }),
    );
  });

  it('isolates tenant drafts and uses authenticated membership names/roles instead of payload claims', async () => {
    const { service, rows, db } = fixture();
    const view = await service.command(user, {
      expectedRevision: 0,
      action: 'SAVE_DRAFT',
      payload: {
        name: 'Company One private draft',
        actorId: 'spoof',
        actorRole: 'ADMIN',
        organizationId: 'two',
      },
    });
    expect(view.revision).toBe(1);
    expect(
      view.entries.find((entry) => entry.definition.id === view.focusId)!
        .history[0],
    ).toMatchObject({ actorId: 'hr', actorName: 'HR editor', actorRole: 'HR' });
    expect(rows.get('two')).toBeUndefined();
    const other = await service.getLibrary({ ...user, organizationId: 'two' });
    expect(
      other.entries.some((entry) => entry.definition.id === view.focusId),
    ).toBe(false);
    await expect(
      service.command(
        { ...user, organizationId: 'two' },
        {
          expectedRevision: 0,
          action: 'SUBMIT',
          definitionId: view.focusId,
          payload: { approverId: 'manager' },
        },
      ),
    ).rejects.toThrow('not found in this organisation');
    expect(db.lexPlanningWorkspace.updateMany).toHaveBeenCalledTimes(1);
  });

  it('denies missing organisation membership and rejects a stale management token after role removal', async () => {
    const { service, db } = fixture();
    await expect(
      service.getLibrary({ ...user, organizationId: 'foreign' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.lexPlanningWorkspace.findUnique).not.toHaveBeenCalled();
    await expect(
      service.command(
        { ...user, userId: 'employee', roleLevel: Role.MANAGEMENT },
        { expectedRevision: 0, action: 'SAVE_DRAFT', payload: {} },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.lexPlanningWorkspace.updateMany).not.toHaveBeenCalled();
  });

  it('rechecks the shared workspace revision after acquiring the planning lock', async () => {
    const { service, db, rows, calls } = fixture();
    rows.set('one', { revision: 5, state: emptyPlanningState() });
    db.$queryRaw.mockImplementationOnce(async () => {
      calls.push('lock');
      rows.get('one')!.revision = 6;
    });
    await expect(
      service.command(user, {
        expectedRevision: 5,
        action: 'SAVE_DRAFT',
        payload: {},
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(calls).toEqual(['upsert', 'lock', 'read']);
    expect(db.lexPlanningWorkspace.updateMany).not.toHaveBeenCalled();
    expect(db.$queryRaw.mock.calls[0][1]).toBe('one');
  });

  it('permits only one of two concurrent writers using the same revision', async () => {
    const { service, rows } = fixture();
    const results = await Promise.allSettled([
      service.command(user, {
        expectedRevision: 0,
        action: 'SAVE_DRAFT',
        payload: { name: 'First' },
      }),
      service.command(user, {
        expectedRevision: 0,
        action: 'SAVE_DRAFT',
        payload: { name: 'Second' },
      }),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const rejected = results.find(
      (result) => result.status === 'rejected',
    ) as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(ConflictException);
    expect(rows.get('one')!.revision).toBe(1);
    expect(rows.get('one')!.state.definitionLibrary!.records).toHaveLength(1);
  });

  it('also enforces compare-and-swap persistence and never returns success for a lost write', async () => {
    const { service, db } = fixture();
    db.lexPlanningWorkspace.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      service.command(user, {
        expectedRevision: 0,
        action: 'SAVE_DRAFT',
        payload: {},
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('reads approved definitions in the organisation date and leaves unsupported states intact', async () => {
    const { service, rows } = fixture();
    expect(
      libraryToday('Asia/Calcutta', new Date('2026-11-23T20:00:00Z')),
    ).toBe('2026-11-24');
    rows.set('one', {
      revision: 0,
      state: { ...emptyPlanningState(), schema: 2 } as unknown as PlanningState,
    });
    await expect(service.getLibrary(user)).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(
      service.getApprovedPlanningLibrary('one'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(rows.get('one')!.state.schema).toBe(2);
  });

  it('retains authentication, tenant, role and module guards on both endpoints and disables caching', () => {
    expect(
      Reflect.getMetadata(
        GUARDS_METADATA,
        PerformanceIntelligenceLibraryController,
      ),
    ).toEqual(
      expect.arrayContaining([
        TrustedTenantContextGuard,
        JwtAuthGuard,
        TenantGuard,
        RolesGuard,
        ModuleGuard,
      ]),
    );
    expect(
      Reflect.getMetadata(
        TENANT_REQUIRED_KEY,
        PerformanceIntelligenceLibraryController,
      ),
    ).toBe(true);
    expect(
      Reflect.getMetadata(MODULE_KEY, PerformanceIntelligenceLibraryController),
    ).toBe(ModuleType.LEADERSHIP_EXCELLENCE);
    expect(
      Reflect.getMetadata(
        PATH_METADATA,
        PerformanceIntelligenceLibraryController,
      ),
    ).toBe('leadership-excellence/performance-intelligence/library');
    for (const handler of [
      PerformanceIntelligenceLibraryController.prototype.library,
      PerformanceIntelligenceLibraryController.prototype.command,
    ])
      expect(Reflect.getMetadata(HEADERS_METADATA, handler)).toContainEqual({
        name: 'Cache-Control',
        value: 'no-store',
      });
  });
});
