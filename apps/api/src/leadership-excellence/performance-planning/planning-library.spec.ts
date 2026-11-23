import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import {
  GUARDS_METADATA,
  PATH_METADATA,
  PIPES_METADATA,
} from '@nestjs/common/constants';
import { ModuleType } from 'db';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { ModuleGuard } from '../../auth/guards/module.guard';
import { MODULE_KEY } from '../../auth/decorators/module.decorator';
import { TenantGuard } from '../../tenancy/tenant.guard';
import { TrustedTenantContextGuard } from '../../tenancy/trusted-tenant-context.guard';
import { TENANT_REQUIRED_KEY } from '../../tenancy/tenant-route.decorator';
import { PlanningLibraryQueryDto } from './dto/planning-library-query.dto';
import { PerformancePlanningController } from './performance-planning.controller';
import { PlanningLibraryService } from './planning-library.service';

function fixture() {
  const row = {
    id: 'department-goal:OPX-2027-OBJ02-PRD-G01',
    title: 'Reduce changeover time to 30 minutes.',
    pillar: 'OPX',
    category: null,
    department: 'Production',
    sourceCode: 'OPX-2027-OBJ02-PRD-G01',
    sourceSheet: 'Department Goals',
    sourceRow: 12,
    ownerRole: 'Production manager',
    parentObjectiveCode: 'OPX-2027-OBJ02',
    parentObjectiveTitle: 'Improve delivery reliability.',
    fields: {
      title: 'Reduce changeover time to 30 minutes.',
      measure: 'Average changeover time',
      baseline: null,
      target: 0,
      unit: 'minutes',
      approach: 'Prepare materials before changeovers.',
      relevance: 'More time available to produce customer orders.',
    },
    notes: ['Illustrative example; review values for your organisation.'],
    version: 1,
  };
  const db = {
    lexPlanningLibraryTemplate: {
      findMany: jest.fn().mockResolvedValue([row]),
      create: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    lexPlanningWorkspace: { upsert: jest.fn() },
    organization: { findUnique: jest.fn() },
  };
  const service = new PlanningLibraryService(db as never);
  const controller = new PerformancePlanningController(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    service,
  );
  return { row, db, service, controller };
}

describe('shared planning library', () => {
  it('reads active templates from the database in stable workbook order', async () => {
    const { db, service } = fixture();
    const result = await service.list('department-goal');
    expect(db.lexPlanningLibraryTemplate.findMany).toHaveBeenCalledWith({
      where: { kind: 'department-goal', active: true },
      orderBy: [{ sourceRow: 'asc' }, { id: 'asc' }],
      select: expect.objectContaining({
        fields: true,
        notes: true,
        version: true,
      }),
    });
    expect(result[0]).toMatchObject({
      kind: 'department-goal',
      sourceCode: 'OPX-2027-OBJ02-PRD-G01',
      department: 'Production',
      version: 1,
      fields: { baseline: null, target: 0 },
    });
    expect(result[0]).not.toHaveProperty('category');
    expect(result[0]).not.toHaveProperty('organizationId');
  });

  it('uses the same global library for separate authorised organisation requests without writes', async () => {
    const { db, controller } = fixture();
    // Organisation authorisation happens in the controller guards. The library
    // read intentionally receives no organisation ID and never copies a catalogue.
    const firstOrganisation = await controller.libraryTemplates({
      kind: 'department-goal',
    });
    const secondOrganisation = await controller.libraryTemplates({
      kind: 'department-goal',
    });
    expect(firstOrganisation).toEqual(secondOrganisation);
    expect(db.lexPlanningLibraryTemplate.findMany.mock.calls[0]).toEqual(
      db.lexPlanningLibraryTemplate.findMany.mock.calls[1],
    );
    expect(db.organization.findUnique).not.toHaveBeenCalled();
    expect(db.lexPlanningLibraryTemplate.create).not.toHaveBeenCalled();
    expect(db.lexPlanningLibraryTemplate.upsert).not.toHaveBeenCalled();
    expect(db.lexPlanningLibraryTemplate.update).not.toHaveBeenCalled();
    expect(db.lexPlanningWorkspace.upsert).not.toHaveBeenCalled();
  });

  it('excludes identities, actual parent links and approvals even if accidentally stored in template fields', async () => {
    const { row, service } = fixture();
    Object.assign(row.fields, {
      id: 'another-record',
      code: 'COPY-ME',
      ownerId: 'foreign-owner',
      organizationId: 'foreign-org',
      departmentIds: ['foreign-dept'],
      parent: { documentId: 'foreign-plan', goalId: 'foreign-goal' },
      sources: [{ documentId: 'foreign-plan', findingId: 'foreign-finding' }],
      status: 'APPROVED',
      approvedBy: 'foreign-approver',
      history: [{ action: 'APPROVE' }],
    });
    const [template] = await service.list('department-goal');
    for (const key of [
      'id',
      'code',
      'ownerId',
      'organizationId',
      'departmentIds',
      'parent',
      'sources',
      'status',
      'approvedBy',
      'history',
    ]) {
      expect(template.fields).not.toHaveProperty(key);
    }
    expect(template.fields.title).toBe(row.fields.title);
    expect(template.parentObjectiveCode).toBe('OPX-2027-OBJ02');
  });

  it('returns independent content copies and preserves source values for subsequent readers', async () => {
    const { row, service } = fixture();
    Object.assign(row.fields, { alignments: ['D'] });
    const [first] = await service.list('objective');
    first.fields.title = 'A local edit';
    (first.fields.alignments as string[]).push('Q');
    first.notes.push('My own note');
    const [second] = await service.list('objective');
    expect(second.fields.title).toBe(row.fields.title);
    expect(second.fields.alignments).toEqual(['D']);
    expect(second.notes).toEqual(row.notes);
    expect(second.notes).toHaveLength(1);
  });

  it('returns an empty list when no active records exist and never falls back to bundled examples', async () => {
    const { db, service } = fixture();
    db.lexPlanningLibraryTemplate.findMany.mockResolvedValue([]);
    await expect(service.list('finding')).resolves.toEqual([]);
    db.lexPlanningLibraryTemplate.findMany.mockRejectedValue(
      new Error('Database unavailable'),
    );
    await expect(service.list('finding')).rejects.toThrow(
      'Database unavailable',
    );
    expect(db.lexPlanningLibraryTemplate.create).not.toHaveBeenCalled();
    expect(db.lexPlanningLibraryTemplate.upsert).not.toHaveBeenCalled();
  });
});

describe('planning library route contract', () => {
  const pipes = Reflect.getMetadata(
    PIPES_METADATA,
    PerformancePlanningController,
  ) as ValidationPipe[];
  const pipe = pipes[0];
  const validate = (value: unknown) =>
    pipe.transform(value, { type: 'query', metatype: PlanningLibraryQueryDto });

  it.each(['finding', 'objective', 'department-goal'])(
    'accepts the %s library kind',
    async (kind) => {
      await expect(validate({ kind })).resolves.toMatchObject({ kind });
    },
  );

  it.each([
    {},
    { kind: '' },
    { kind: 'individual-goal' },
    { kind: ['finding', 'objective'] },
    { kind: 'finding', organizationId: 'another-org' },
    { kind: 'finding', active: false },
  ])('rejects invalid or unsupported query fields: %j', async (query) => {
    await expect(validate(query)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('retains authentication, tenant, role and Leadership Excellence module guards', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      PerformancePlanningController,
    );
    expect(guards).toEqual(
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
    expect(
      Reflect.getMetadata(
        MODULE_KEY,
        PerformancePlanningController.prototype.libraryTemplates,
      ),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(
        PATH_METADATA,
        PerformancePlanningController.prototype.libraryTemplates,
      ),
    ).toBe('library-templates');
  });
});
