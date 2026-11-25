import 'reflect-metadata';
import { ConflictException } from '@nestjs/common';
import {
  GUARDS_METADATA,
  HEADERS_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { ModuleType } from 'db';
import type { AccessTokenPayload } from '../../auth/access-token-payload';
import { MODULE_KEY } from '../../auth/decorators/module.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ModuleGuard } from '../../auth/guards/module.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Role } from '../../common/enum/role.enum';
import { TenantGuard } from '../../tenancy/tenant.guard';
import { TENANT_REQUIRED_KEY } from '../../tenancy/tenant-route.decorator';
import { TrustedTenantContextGuard } from '../../tenancy/trusted-tenant-context.guard';
import { PerformancePlanningController } from './performance-planning.controller';
import { PerformancePlanningService } from './performance-planning.service';
import { emptyPlanningState } from './planning.seed';
import type { PlanningState } from './planning.types';

const user: AccessTokenPayload = {
  tokenType: 'ACCESS',
  userId: 'catalogue-reader',
  organizationId: 'org-one',
  roleId: 6,
  roleLevel: Role.EMPLOYEE,
  email: null,
  isAdminOrg: false,
};

function fixture() {
  const state = emptyPlanningState();
  state.definitions.push({
    ...state.definitions[0],
    id: 'tenant-kpi',
    code: 'KPI-0001',
    name: 'Tenant measure',
    source: 'CUSTOM',
    adaptedFromId: state.definitions[0].id,
  });
  const row = { revision: 12, state };
  const db = {
    organization: {
      findUnique: jest.fn().mockResolvedValue({ timeZone: 'Asia/Calcutta' }),
    },
    lexPlanningWorkspace: {
      findUnique: jest
        .fn()
        .mockImplementation(
          ({ where }: { where: { organizationId: string } }) =>
            Promise.resolve(where.organizationId === 'org-one' ? row : null),
        ),
      upsert: jest.fn(),
      updateMany: jest.fn(),
    },
    lexExecutionWorkspace: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  const refs = { get: jest.fn() };
  const service = new PerformancePlanningService(db as never, refs as never);
  const controller = new PerformancePlanningController(
    service,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { row, db, refs, service, controller };
}

describe('planning definition catalogue', () => {
  afterEach(() => jest.useRealTimers());

  it('reads only the authenticated tenant catalogue without other workspace dependencies', async () => {
    const { db, refs, controller } = fixture();
    const first = await controller.definitionCatalogue(user);
    const second = await controller.definitionCatalogue({
      ...user,
      organizationId: 'org-two',
    });

    expect(db.lexPlanningWorkspace.findUnique).toHaveBeenNthCalledWith(1, {
      where: { organizationId: 'org-one' },
      select: { revision: true, state: true },
    });
    expect(db.lexPlanningWorkspace.findUnique).toHaveBeenNthCalledWith(2, {
      where: { organizationId: 'org-two' },
      select: { revision: true, state: true },
    });
    expect(db.organization.findUnique).toHaveBeenNthCalledWith(1, {
      where: { id: 'org-one' },
      select: { timeZone: true },
    });
    expect(db.organization.findUnique).toHaveBeenNthCalledWith(2, {
      where: { id: 'org-two' },
      select: { timeZone: true },
    });
    expect(first).toMatchObject({
      revision: 12,
      definitions: expect.arrayContaining([
        expect.objectContaining({ id: 'tenant-kpi', source: 'CUSTOM' }),
      ]),
    });
    expect(second.definitions.some((entry) => entry.id === 'tenant-kpi')).toBe(
      false,
    );
    expect(refs.get).not.toHaveBeenCalled();
    expect(db.lexExecutionWorkspace.findUnique).not.toHaveBeenCalled();
    expect(db.lexPlanningWorkspace.upsert).not.toHaveBeenCalled();
    expect(db.lexPlanningWorkspace.updateMany).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('returns only definitions and KRAs, without plans, targets or approval claims', async () => {
    const { db, row, service } = fixture();
    db.lexPlanningWorkspace.findUnique.mockResolvedValueOnce({
      ...row,
      state: {
        ...row.state,
        documents: [
          {
            id: 'private-plan',
            status: 'DRAFT',
            data: {
              title: 'Confidential draft',
              assignments: [
                { target: 999, ownerId: 'private-owner', frequency: 'MONTHLY' },
              ],
            },
          },
        ],
      },
    });

    const result = await service.getDefinitionCatalogue(user);
    expect(result).toEqual({
      revision: row.revision,
      kras: row.state.kras,
      definitions: row.state.definitions,
    });
    expect(
      result.definitions.every((entry) => !('approvalVersion' in entry)),
    ).toBe(true);
    expect(result.definitions.every((entry) => !('approved' in entry))).toBe(
      true,
    );
  });

  it('returns fresh, labelled reference examples without creating an absent workspace', async () => {
    const { db, service } = fixture();
    const otherUser = { ...user, organizationId: 'org-without-workspace' };
    const first = await service.getDefinitionCatalogue(otherUser);
    expect(first).toEqual({
      revision: 0,
      kras: emptyPlanningState().kras,
      definitions: emptyPlanningState().definitions,
    });
    expect(
      first.definitions.every((entry) => entry.source === 'REFERENCE'),
    ).toBe(true);
    first.kras[0].name = 'Changed response';
    first.definitions[0].meaning = 'Changed response';
    const next = await service.getDefinitionCatalogue(otherUser);
    expect(next.kras).toEqual(emptyPlanningState().kras);
    expect(next.definitions).toEqual(emptyPlanningState().definitions);
    expect(db.lexPlanningWorkspace.upsert).not.toHaveBeenCalled();
    expect(db.lexPlanningWorkspace.updateMany).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('isolates returned catalogue changes from stored state', async () => {
    const { row, service } = fixture();
    const original = structuredClone(row);
    const result = await service.getDefinitionCatalogue(user);
    result.kras[0].name = 'Changed response';
    result.definitions[0].meaning = 'Changed response';
    result.definitions.pop();
    expect(row).toEqual(original);
  });

  it('projects a scheduled approval at the organisation date boundary without a save or exposing its next draft', async () => {
    jest.useFakeTimers().setSystemTime(Date.parse('2026-11-30T18:29:00Z'));
    const { row, db, refs, service } = fixture();
    addApprovedLibrary(row.state);
    const stored = structuredClone(row);
    const previous = await service.getDefinitionCatalogue(user);
    expect(
      previous.definitions.find((item) => item.id === 'tenant-kpi')!.meaning,
    ).toBe('Approved v1');
    // The organisation reaches 1 December while UTC is still 30 November.
    jest.setSystemTime(Date.parse('2026-11-30T18:30:00Z'));
    const active = await service.getDefinitionCatalogue(user);
    expect(
      active.definitions.find((item) => item.id === 'tenant-kpi')!.meaning,
    ).toBe('Approved v2');
    expect(active.revision).toBe(stored.revision);
    expect(JSON.stringify(active)).not.toContain('Private v3 draft');
    expect(row).toEqual(stored);
    expect(refs.get).not.toHaveBeenCalled();
    expect(db.lexPlanningWorkspace.updateMany).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it.each(['Stale provider v1', 'Concurrent provider v3'])(
    'uses the same workspace approval snapshot despite %s references',
    async (providerMeaning) => {
      jest.useFakeTimers().setSystemTime(Date.parse('2026-12-01T10:00:00Z'));
      const { row, refs, service } = fixture();
      addApprovedLibrary(row.state);
      const stored = structuredClone(row);
      refs.get.mockResolvedValue({
        references: {
          timeZone: 'Asia/Calcutta',
          library: {
            kras: [{ ...row.state.kras[0], name: 'Racing provider KRA' }],
            definitions: [
              { ...row.state.definitions.at(-1)!, meaning: providerMeaning },
            ],
          },
        },
        actor: { userId: user.userId, role: user.roleLevel },
      });
      const source = await service.getExecutionSource(user);
      expect(source.revision).toBe(stored.revision);
      expect(
        source.state.definitions.find((item) => item.id === 'tenant-kpi')!
          .meaning,
      ).toBe('Approved v2');
      expect(source.state.kras[0].name).toBe(stored.state.kras[0].name);
      expect(source.state.definitionLibrary).toEqual(
        stored.state.definitionLibrary,
      );
      expect(row).toEqual(stored);
    },
  );

  it('retains the external approved provider fallback for legacy states without library metadata', async () => {
    const { row, refs, service } = fixture();
    refs.get.mockResolvedValue({
      references: {
        library: {
          kras: [],
          definitions: [
            {
              ...row.state.definitions.at(-1)!,
              meaning: 'Legacy provider definition',
            },
          ],
        },
      },
      actor: { userId: user.userId, role: user.roleLevel },
    });
    const source = await service.getExecutionSource(user);
    expect(
      source.state.definitions.find((item) => item.id === 'tenant-kpi')!
        .meaning,
    ).toBe('Legacy provider definition');
    expect(row.state.definitionLibrary).toBeUndefined();
  });

  it('rejects unsupported stored state instead of replacing it with examples', async () => {
    const { db, service } = fixture();
    db.lexPlanningWorkspace.findUnique.mockResolvedValueOnce({
      revision: 12,
      state: { schema: 2, documents: [] },
    });
    await expect(service.getDefinitionCatalogue(user)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(db.lexPlanningWorkspace.upsert).not.toHaveBeenCalled();
  });

  it('retains the existing authentication, tenant, role and module guards and disables caching', () => {
    const handler = PerformancePlanningController.prototype.definitionCatalogue;
    expect(
      Reflect.getMetadata(GUARDS_METADATA, PerformancePlanningController),
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
      Reflect.getMetadata(TENANT_REQUIRED_KEY, PerformancePlanningController),
    ).toBe(true);
    expect(Reflect.getMetadata(MODULE_KEY, PerformancePlanningController)).toBe(
      ModuleType.LEADERSHIP_EXCELLENCE,
    );
    expect(Reflect.getMetadata(MODULE_KEY, handler)).toBeUndefined();
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
      'definition-catalogue',
    );
    expect(Reflect.getMetadata(HEADERS_METADATA, handler)).toContainEqual({
      name: 'Cache-Control',
      value: 'no-store',
    });
  });
});

function addApprovedLibrary(state: PlanningState) {
  const definition = state.definitions.find(
    (item) => item.id === 'tenant-kpi',
  )!;
  definition.meaning = 'Approved v1';
  const kra = state.kras.find((item) => item.id === definition.kraId)!;
  state.definitionLibrary = {
    schema: 1,
    records: [
      {
        definitionId: definition.id,
        draft: { ...definition, meaning: 'Private v3 draft' },
        status: 'DRAFT',
        approverId: 'manager',
        revisionReason: 'Next improvement',
        effectiveDate: '2026-12-02',
        history: [],
        versions: [
          {
            version: 1,
            definition: structuredClone(definition),
            kra: structuredClone(kra),
            effectiveDate: '2026-11-01',
            approvedAt: '2026-11-01T00:00:00Z',
            approvedBy: 'manager',
            approvedByName: 'Manager',
            approvedByRole: 'MANAGEMENT',
            reason: '',
          },
          {
            version: 2,
            definition: { ...definition, meaning: 'Approved v2' },
            kra: structuredClone(kra),
            effectiveDate: '2026-12-01',
            approvedAt: '2026-11-23T00:00:00Z',
            approvedBy: 'manager',
            approvedByName: 'Manager',
            approvedByRole: 'MANAGEMENT',
            reason: 'Revised definition',
          },
        ],
      },
    ],
  };
}
