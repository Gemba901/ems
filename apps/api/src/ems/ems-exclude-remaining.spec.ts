import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { Prisma } from 'db';
import { PrismaService } from 'src/prisma/prisma.service';
import { EmsService } from './ems.service';
import { ExcludeRemainingOnboardingRecordsDto } from './dto/onboarding.dto';
import { buildExcludeRemainingPreview, excludeRemainingToken } from './onboarding-exclude-remaining';

// In-memory doubles. Batch revalidation is replaced by its status rule; it is covered by other suites.
function setup() {
  const rec = (id: string, status: string, extra: any = {}) => ({ id, batchId: 'batch', organizationId: 'org', status,
    firstName: id[0].toUpperCase() + id.slice(1), lastName: 'Test', employeeCode: id.toUpperCase(), exclusionReason: null, validationErrors: null, ...extra });
  const state: any = {
    batch: { id: 'batch', organizationId: 'org', status: 'PARTIALLY_REGISTERED' },
    records: [rec('ann', 'REGISTERED', { employeeId: 'employee-ann' }), rec('peter', 'NEEDS_FIXING'), rec('mary', 'READY'),
      rec('joy', 'DRAFT'), rec('old', 'EXCLUDED', { exclusionReason: 'Earlier reason' })],
    employees: [{ id: 'employee-ann', organizationId: 'org', firstName: 'Ann', lastName: 'Akinyi',
      pendingReportingRecordId: 'peter', pendingFirstRelieverRecordId: 'mary', pendingSecondRelieverRecordId: null }],
    hods: [{ pendingRecordId: 'joy', branchLabel: 'Nairobi', department: { name: 'Production' } }],
  };
  const inList = (value: any, query: any) => typeof query === 'object' && query !== null
    ? (!query.in || query.in.includes(value)) && (!query.notIn || !query.notIn.includes(value)) : value === query;
  const matches = (row: any, where: any) => Object.entries(where).every(([key, query]) => inList(row[key], query));
  const prisma: any = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn(),
    emsOnboardingBatch: {
      findFirst: jest.fn(async ({ where }: any) => matches(state.batch, where)
        ? { ...state.batch, records: state.records.map((r: any) => ({ ...r })),
            _count: { records: state.records.filter((r: any) => r.status === 'REGISTERED').length } } : null),
      update: jest.fn(async ({ data }: any) => Object.assign(state.batch, data)),
    },
    emsOnboardingRecord: {
      findFirst: jest.fn(async ({ where }: any) => state.records.find((r: any) => matches(r, where)) ?? null),
      update: jest.fn(async ({ where, data }: any) => Object.assign(state.records.find((r: any) => r.id === where.id), data)),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const rows = state.records.filter((r: any) => matches(r, where));
        rows.forEach((r: any) => Object.assign(r, data, data.validationErrors === Prisma.DbNull ? { validationErrors: null } : {}));
        return { count: rows.length };
      }),
      count: jest.fn(async ({ where }: any) => state.records.filter((r: any) => matches(r, where)).length),
    },
    employee: { findMany: jest.fn(async ({ where }: any) => state.employees.filter((e: any) => e.organizationId === where.organizationId)) },
    emsDepartmentHod: { findMany: jest.fn(async () => state.hods) },
  };
  prisma.$transaction.mockImplementation(async (callback: any) => callback(prisma));
  const service = new EmsService(prisma as unknown as PrismaService);
  jest.spyOn(service as any, 'lockReporting').mockResolvedValue(undefined);
  const revalidate = jest.spyOn(service as any, 'validateOnboardingBatchLocked').mockImplementation(async () => {
    if (state.batch.status === 'CANCELLED') throw new BadRequestException('This import is cancelled');
    const pending = state.records.filter((r: any) => !['REGISTERED', 'EXCLUDED'].includes(r.status)).length;
    const registered = state.records.some((r: any) => r.status === 'REGISTERED');
    state.batch.status = registered ? (pending ? 'PARTIALLY_REGISTERED' : 'REGISTERED') : 'DRAFT';
  });
  jest.spyOn(service, 'getOnboardingBatch').mockImplementation(async () => ({ ...state.batch, records: state.records }) as never);
  return { service, prisma, state, revalidate };
}

describe('Exclude remaining records — preview', () => {
  it('counts what is excluded and kept, and lists pending links to excluded people', async () => {
    const { service } = setup();
    const preview = await service.previewExcludeRemainingOnboardingRecords('org', 'batch');
    expect(preview).toMatchObject({ registered: 1, alreadyExcluded: 1, toExclude: 3,
      byStatus: { READY: 1, NEEDS_FIXING: 1, DRAFT: 1 }, affectedLinkCount: 3 });
    expect(preview.affectedLinks).toEqual(expect.arrayContaining([
      { kind: 'REPORTING', subject: 'Ann Akinyi', pendingName: 'Peter Test' },
      { kind: 'FIRST_RELIEVER', subject: 'Ann Akinyi', pendingName: 'Mary Test' },
      { kind: 'DEPARTMENT_HOD', subject: 'Production · Nairobi', pendingName: 'Joy Test' },
    ]));
    expect(preview.token).toBe(excludeRemainingToken('batch', ['joy', 'mary', 'peter']));
  });

  it('only searches pending links in the requesting organization', async () => {
    const { service, prisma } = setup();
    await service.previewExcludeRemainingOnboardingRecords('org', 'batch');
    expect(prisma.employee.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org' }) }));
    expect(prisma.emsOnboardingBatch.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'batch', organizationId: 'org' } }));
  });

  it('points to Cancel when nobody is registered yet', async () => {
    const { service, state } = setup();
    state.records[0].status = 'READY';
    await expect(service.previewExcludeRemainingOnboardingRecords('org', 'batch')).rejects.toThrow('Cancel the import instead');
  });

  it('refuses when nothing remains, a cancelled import, or another organization', async () => {
    const ctx = setup();
    ctx.state.records.forEach((r: any) => { if (r.status !== 'REGISTERED') r.status = 'EXCLUDED'; });
    await expect(ctx.service.previewExcludeRemainingOnboardingRecords('org', 'batch')).rejects.toThrow('already registered or excluded');
    const cancelled = setup(); cancelled.state.batch.status = 'CANCELLED';
    await expect(cancelled.service.previewExcludeRemainingOnboardingRecords('org', 'batch')).rejects.toThrow('cancelled');
    const foreign = setup();
    await expect(foreign.service.previewExcludeRemainingOnboardingRecords('other-org', 'batch')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('ignores over-fetched links that do not point at a record being excluded', () => {
    const preview = buildExcludeRemainingPreview('batch', [{ id: 'a', status: 'REGISTERED' }, { id: 'b', status: 'DRAFT' }],
      [{ id: 'e', firstName: 'Eve', pendingReportingRecordId: 'elsewhere', pendingFirstRelieverRecordId: 'a' }], [{ pendingRecordId: 'zzz' }]);
    expect(preview.affectedLinkCount).toBe(0);
  });
});

describe('Exclude remaining records — confirm', () => {
  it('excludes only unregistered records, keeps registered and earlier exclusions, and closes the import', async () => {
    const { service, state, revalidate } = setup();
    const { token } = await service.previewExcludeRemainingOnboardingRecords('org', 'batch');
    await service.excludeRemainingOnboardingRecords('org', 'batch', { reason: '  Demo cleanup  ', expectedToken: token });
    const by = (id: string) => state.records.find((r: any) => r.id === id);
    expect(by('ann')).toMatchObject({ status: 'REGISTERED', employeeId: 'employee-ann' });
    expect(by('old')).toMatchObject({ status: 'EXCLUDED', exclusionReason: 'Earlier reason' });
    for (const id of ['peter', 'mary', 'joy']) expect(by(id)).toMatchObject({ status: 'EXCLUDED', exclusionReason: 'Demo cleanup', validationErrors: null });
    expect(state.batch.status).toBe('REGISTERED');
    expect(revalidate).toHaveBeenCalledWith(expect.anything(), 'org', 'batch');
    // Pending links are kept; they show Needs attention, as with a single exclusion.
    expect(state.employees[0]).toMatchObject({ pendingReportingRecordId: 'peter', pendingFirstRelieverRecordId: 'mary' });
  });

  it('rejects a stale review without excluding anything', async () => {
    const { service, state, prisma } = setup();
    const { token } = await service.previewExcludeRemainingOnboardingRecords('org', 'batch');
    state.records.push({ id: 'late', batchId: 'batch', organizationId: 'org', status: 'DRAFT', firstName: 'Late' });
    await expect(service.excludeRemainingOnboardingRecords('org', 'batch', { reason: 'Demo cleanup', expectedToken: token }))
      .rejects.toBeInstanceOf(ConflictException);
    expect(prisma.emsOnboardingRecord.updateMany).not.toHaveBeenCalled();
    expect(state.records.filter((r: any) => r.status === 'EXCLUDED')).toHaveLength(1);
  });

  it.each([['missing', undefined], ['spaces', '    '], ['too short', 'Demo'], ['too long', 'x'.repeat(301)]])(
    'rejects a %s reason before touching records', async (_, reason) => {
      const { service, prisma } = setup();
      const { token } = await service.previewExcludeRemainingOnboardingRecords('org', 'batch');
      await expect(service.excludeRemainingOnboardingRecords('org', 'batch', { reason, expectedToken: token } as any))
        .rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.emsOnboardingRecord.updateMany).not.toHaveBeenCalled();
    });

  it('lets HR put one record back afterwards, reopening the import', async () => {
    const { service, state } = setup();
    const { token } = await service.previewExcludeRemainingOnboardingRecords('org', 'batch');
    await service.excludeRemainingOnboardingRecords('org', 'batch', { reason: 'Demo cleanup', expectedToken: token });
    await service.includeOnboardingRecord('org', 'mary');
    expect(state.records.find((r: any) => r.id === 'mary')).toMatchObject({ status: 'DRAFT', exclusionReason: null });
    expect(state.batch.status).toBe('PARTIALLY_REGISTERED');
  });
});

describe('Excluded records are read-only', () => {
  it('refuses to save edits to an excluded record and leaves it unchanged', async () => {
    const { service, state, prisma } = setup();
    await expect(service.updateOnboardingRecord('org', 'old', { firstName: 'Changed' } as any))
      .rejects.toThrow('Put it back in before editing');
    expect(state.records.find((r: any) => r.id === 'old')).toMatchObject({ status: 'EXCLUDED', firstName: 'Old', exclusionReason: 'Earlier reason' });
    expect(prisma.emsOnboardingRecord.update).not.toHaveBeenCalled();
  });

  it('allows editing again once the record is put back in', async () => {
    const { service, state } = setup();
    await service.includeOnboardingRecord('org', 'old');
    await service.updateOnboardingRecord('org', 'old', { firstName: 'Changed' } as any);
    expect(state.records.find((r: any) => r.id === 'old')).toMatchObject({ status: 'DRAFT', firstName: 'Changed' });
  });
});

describe('Cancel refusal messages', () => {
  it('explains the partially registered case and points to Exclude remaining', async () => {
    const { service, state } = setup();
    await expect(service.cancelOnboardingBatch('org', 'batch')).rejects.toThrow(
      'Cannot cancel — 1 employee(s) from this import are already registered. Open the import and use "Exclude remaining records" to stop the other 3; registered employees are kept.');
    expect(state.batch.status).toBe('PARTIALLY_REGISTERED');
  });

  it('explains that a fully registered import has nothing left to cancel', async () => {
    const { service, state } = setup();
    state.records.forEach((r: any) => { if (r.status !== 'REGISTERED') r.status = 'EXCLUDED'; });
    await expect(service.cancelOnboardingBatch('org', 'batch')).rejects.toThrow('nothing left to cancel');
  });
});

describe('ExcludeRemainingOnboardingRecordsDto', () => {
  const token = 'a'.repeat(64);
  it.each([['short reason', { reason: 'Demo', expectedToken: token }], ['missing token', { reason: 'Demo cleanup' }],
    ['malformed token', { reason: 'Demo cleanup', expectedToken: 'abc' }]])('rejects a %s', (_, body) => {
    expect(validateSync(plainToInstance(ExcludeRemainingOnboardingRecordsDto, body)).length).toBeGreaterThan(0);
  });
  it('accepts a trimmed reason and a preview token', () => {
    const dto = plainToInstance(ExcludeRemainingOnboardingRecordsDto, { reason: '  Demo cleanup  ', expectedToken: token });
    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.reason).toBe('Demo cleanup');
  });
});
