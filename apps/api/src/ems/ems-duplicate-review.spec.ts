import 'reflect-metadata';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Prisma } from 'db';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Role } from 'src/common/enum/role.enum';
import { EmsController } from './ems.controller';
import { EmsService } from './ems.service';
import { normalisePhone, storedPhone } from './onboarding-phone';
import { duplicateImportPerson } from './onboarding-duplicate-context';

// Exercises real service methods and real phone/name/hierarchy helpers against an
// in-memory transactional fixture. PostgreSQL concurrency still requires local testing.
function fixture() {
  const batch = (id = 'batch', changes: any = {}) => ({ id, organizationId: 'org', status: 'DRAFT',
    defaultPhoneCountry: 'KE', label: id, sourceFileName: `${id}.xlsx`, ...changes });
  const row = (id = 'a', changes: any = {}) => ({ id, batchId: 'batch', organizationId: 'org', rowNumber: 1,
    firstName: 'Grace', middleName: 'Muthoni', lastName: 'Wanjiru', employeeCode: `EMP-${id}`,
    mobileNumber: id === 'a' ? '0712345678' : '0712345679', whatsappNumber: null,
    workEmail: `${id}@example.test`, currentDepartment: 'Administration', jobDesignation: 'Director',
    plantBranchCode: 'Nairobi', beesAccessLevel: 'Employee', gender: 'Female', nationality: 'Kenyan',
    reportingToName: null, reportingToDesignation: 'Board', reportingToBoard: true,
    reportingToEmployeeId: null, reportingToRecordId: null, employeeId: null,
    status: 'DRAFT', validationErrors: null, duplicateReviewReceipt: null, updatedAt: new Date('2026-10-14T12:00:00Z'), ...changes });
  let state = { batches: [batch()], rows: [row()], employees: [] as any[], users: [] as any[] };
  const same = (value: any, query: any) => typeof query === 'object' && query !== null
    ? (!query.in || query.in.includes(value)) && (!query.notIn || !query.notIn.includes(value)) && (query.not === undefined || value !== query.not)
    : value instanceof Date && query instanceof Date ? value.getTime() === query.getTime() : value === query;
  const matches = (value: any, where: any = {}) => Object.entries(where).every(([key, query]) =>
    query === undefined || key === 'batch' ? query === undefined || matches(state.batches.find(b => b.id === value.batchId), query)
      : same(value?.[key], query));
  const rows = (where: any) => state.rows.filter(r => matches(r, where));
  // DbNull is Prisma's JSON write marker; database reads return JavaScript null.
  const storedRecordData = (data: any) => ({
    ...data,
    ...(data.validationErrors === Prisma.DbNull ? { validationErrors: null } : {}),
    ...(data.duplicateReviewReceipt === Prisma.DbNull ? { duplicateReviewReceipt: null } : {}),
  });
  const db: any = {
    emsDepartmentHod: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    $queryRaw: jest.fn(async () => []),
    organization: { findUnique: jest.fn(async () => ({ communicationChannel: 'EMAIL' })) },
    department: { findMany: jest.fn(async () => [{ id: 'dept', name: 'Administration' }]) },
    role: { findMany: jest.fn(async () => [{ id: 'role', name: 'EMPLOYEE' }]) },
    employee: {
      findMany: jest.fn(async ({where}: any) => state.employees.filter(e => matches(e, where)).map(e => ({...e,
        department: {name: 'Administration'}, emsOnboardingRecord: state.rows.find(r => r.employeeId === e.id) ?? e.emsOnboardingRecord ?? null}))),
      findFirst: jest.fn(async ({where}: any) => state.employees.find(e => matches(e, where)) ?? null),
      create: jest.fn(async ({data}: any) => { const e = {...data, id: `employee-${state.employees.length + 1}`}; state.employees.push(e); return e; }),
      updateMany: jest.fn(async () => ({count: 0})),
    },
    user: { create: jest.fn(async ({data}: any) => { const u = {...data, id: `user-${state.users.length + 1}`}; state.users.push(u); return u; }) },
    userOrganization: { upsert: jest.fn(async () => ({})) },
    emsOnboardingBatch: {
      findFirst: jest.fn(async ({where}: any) => { const b = state.batches.find(b => matches(b, where)); return b ? structuredClone({...b, records: state.rows.filter(r => r.batchId === b.id), uploadedBy: null}) : null; }),
      update: jest.fn(async ({where, data}: any) => Object.assign(state.batches.find(b => matches(b, where))!, data)),
      updateMany: jest.fn(async ({where, data}: any) => { const bs = state.batches.filter(b => matches(b, where)); bs.forEach(b => Object.assign(b, data)); return {count: bs.length}; }),
    },
    emsOnboardingRecord: {
      findFirst: jest.fn(async ({where}: any) => { const r = rows(where)[0]; return r ? structuredClone({...r, batch: state.batches.find(b => b.id === r.batchId)}) : null; }),
      findMany: jest.fn(async ({where}: any) => rows(where).map(r => structuredClone({...r, batch: state.batches.find(b => b.id === r.batchId)}))),
      update: jest.fn(async ({where, data}: any) => Object.assign(rows(where)[0], storedRecordData(data))),
      updateMany: jest.fn(async ({where, data}: any) => { const rs = rows(where); rs.forEach(r => Object.assign(r, storedRecordData(data))); return {count: rs.length}; }),
      createMany: jest.fn(async ({data}: any) => { data.forEach((d: any, i: number) => state.rows.push(row(`added-${i}`, storedRecordData(d)))); return {count: data.length}; }),
    },
  };
  db.$transaction = jest.fn(async (callback: any) => { const before = structuredClone(state); try { return await callback(db); } catch (error) { state = before; throw error; } });
  const service = new EmsService(db);
  const get = () => service.getOnboardingBatch('org', 'batch');
  const validate = () => service.validateOnboardingBatch('org', 'batch');
  return { db, service, get, validate, row, batch, state: () => state };
}

it('uses actual batch-country parsing and never guesses a country for legacy stored phones', () => {
  expect(normalisePhone('0712 345 678', 'KE')).toBe('254712345678');
  expect(normalisePhone('+254 712 345678', 'GB')).toBe('254712345678');
  expect(normalisePhone('0712345678', null)).toBeNull();
  expect(storedPhone('0712345678')).toBeNull();
  expect(storedPhone('+254 (712) 345-678')).toBe('254712345678');
  expect(duplicateImportPerson(fixture().row(), 'org', 'KE').canonicalPhone).toBe('254712345678');
});

it('validates same-name different-code/mobile rows as requiring review, not automatic identities', async () => {
  const f = fixture(); f.state().rows.push(f.row('b'));
  const batch = await f.validate();
  expect(batch.records.map(r => r.status)).toEqual(['NEEDS_FIXING', 'NEEDS_FIXING']);
  expect(batch.records[0].duplicateReview).toMatchObject({requiresReview: true, hardConflicts: []});
  expect(batch.records[0].validationErrors).toEqual([expect.objectContaining({field: 'duplicateReview'})]);
  expect(f.db.employee.create).not.toHaveBeenCalled();
});

it('finds same-name candidates in other active imports and excludes other organisations/cancelled/excluded records', async () => {
  const f = fixture(); f.state().batches.push(f.batch('other'), f.batch('cancelled', {status: 'CANCELLED'}), f.batch('foreign', {organizationId: 'foreign'}));
  f.state().rows.push(f.row('b', {batchId: 'other'}), f.row('c', {batchId: 'cancelled'}), f.row('d', {batchId: 'foreign', organizationId: 'foreign'}), f.row('e', {status: 'EXCLUDED'}));
  expect((await f.validate()).records[0].duplicateReview?.possibleMatches.map(m => m.recordId)).toEqual(['b']);
});

it('recognises current registered employee names across differing codes and phones', async () => {
  const f = fixture(); f.state().employees.push({id: 'existing', organizationId: 'org', firstName: 'Grace', middleName: 'Muthoni', lastName: 'Wanjiru', employeeCode: 'EMP-OTHER', phone: '254712345679', jobTitle: 'Manager'});
  const row = (await f.validate()).records[0];
  expect(row.duplicateReview?.possibleMatches[0]).toMatchObject({employeeId: 'existing', kind: 'EMPLOYEE'});
});

it.each(['mobileNumber', 'employeeCode'])('hard-blocks cross-import %s conflicts and refuses an HR override', async field => {
  const f = fixture(); f.state().batches.push(f.batch('other'));
  f.state().rows.push(f.row('b', {batchId: 'other', firstName: 'Dennis', middleName: null, lastName: 'Kamau', [field]: f.state().rows[0][field as keyof ReturnType<typeof f.row>]}));
  const row = (await f.validate()).records[0];
  expect(row.duplicateReview?.hardConflicts).toHaveLength(1);
  await expect(f.service.confirmOnboardingDifferentPerson('org', 'a', 'hr', row.duplicateReview!.token!)).rejects.toBeInstanceOf(BadRequestException);
  expect(f.state().rows[0].duplicateReviewReceipt).toBeNull();
});

it('persists an attributed confirmation, revalidates and removes only the duplicate review issue', async () => {
  const f = fixture(); f.state().rows.push(f.row('b'));
  const token = (await f.validate()).records[0].duplicateReview!.token!;
  const result = await f.service.confirmOnboardingDifferentPerson('org', 'a', 'hr-user', token);
  expect(result.records[0]).toMatchObject({status: 'READY', duplicateReview: {reviewed: true, requiresReview: false}});
  expect(f.state().rows[0].duplicateReviewReceipt).toMatchObject({version: 1, token, confirmedByUserId: 'hr-user', confirmedAt: expect.any(String)});
  expect(result.records[0]).not.toHaveProperty('duplicateReviewReceipt');
  expect(result.records[1].status).toBe('NEEDS_FIXING');
});

it('does not make a record ready when an unrelated required field is still missing', async () => {
  const f = fixture(); f.state().rows[0].workEmail = ''; f.state().rows.push(f.row('b'));
  const token = (await f.validate()).records[0].duplicateReview!.token!;
  const result = await f.service.confirmOnboardingDifferentPerson('org', 'a', 'hr', token);
  expect(result.records[0]).toMatchObject({status: 'NEEDS_FIXING', duplicateReview: {reviewed: true}});
  expect(result.records[0].validationErrors).toEqual([expect.objectContaining({field: 'workEmail'})]);
});

it('rejects a stale confirmation after another candidate arrives', async () => {
  const f = fixture(); f.state().rows.push(f.row('b'));
  const token = (await f.validate()).records[0].duplicateReview!.token!;
  f.state().rows.push(f.row('c', {mobileNumber: '0712345680'}));
  await expect(f.service.confirmOnboardingDifferentPerson('org', 'a', 'hr', token)).rejects.toBeInstanceOf(ConflictException);
  expect(f.state().rows[0].duplicateReviewReceipt).toBeNull();
});

it('rechecks receipts on reads and preserves unrelated errors', async () => {
  const f = fixture(); f.state().rows.push(f.row('b'));
  const token = (await f.validate()).records[0].duplicateReview!.token!;
  await f.service.confirmOnboardingDifferentPerson('org', 'a', 'hr', token);
  f.state().rows[1].lastName = 'Wanjiku';
  const result = await f.get();
  expect(result.records[0]).toMatchObject({status: 'NEEDS_FIXING', duplicateReview: {requiresReview: true}});
});

it('ignores forged receipts/status/employee IDs in add and edit payloads', async () => {
  const f = fixture();
  await f.service.addOnboardingRecords('org', 'batch', {records: [{...f.row('new'), status: 'REGISTERED', employeeId: 'fake', duplicateReviewReceipt: {token: 'forged'}}]} as never);
  const inserted = f.db.emsOnboardingRecord.createMany.mock.calls[0][0].data[0];
  expect(inserted.status).toBe('DRAFT');
  expect(inserted.duplicateReviewReceipt).toBe(Prisma.DbNull);
  expect(inserted).not.toHaveProperty('employeeId');
  const created = f.state().rows.find(r => r.id === 'added-0')!;
  expect(created).toMatchObject({status: 'DRAFT', employeeId: null, duplicateReviewReceipt: null});
  await f.service.updateOnboardingRecord('org', 'a', {duplicateReviewReceipt: {token: 'forged'}, status: 'REGISTERED', employeeId: 'fake', firstName: 'Samuel', lastName: 'Kiprono', middleName: ''} as never);
  expect(f.state().rows[0]).toMatchObject({status: 'READY', employeeId: null, duplicateReviewReceipt: null});
});

it('does not accept a foreign-org confirmation or inactive row', async () => {
  const f = fixture();
  await expect(f.service.confirmOnboardingDifferentPerson('foreign', 'a', 'hr', 'a'.repeat(64))).rejects.toBeInstanceOf(NotFoundException);
  f.state().rows[0].status = 'EXCLUDED';
  await expect(f.service.confirmOnboardingDifferentPerson('org', 'a', 'hr', 'a'.repeat(64))).rejects.toBeInstanceOf(BadRequestException);
});

it('rolls back the receipt if validation fails', async () => {
  const f = fixture(); f.state().rows.push(f.row('b'));
  const token = (await f.validate()).records[0].duplicateReview!.token!;
  f.db.department.findMany.mockRejectedValueOnce(new Error('Database unavailable'));
  await expect(f.service.confirmOnboardingDifferentPerson('org', 'a', 'hr', token)).rejects.toThrow('Database unavailable');
  expect(f.state().rows[0].duplicateReviewReceipt).toBeNull();
});

it('registers confirmed different people and skips them on repeat registration', async () => {
  const f = fixture(); f.state().rows.push(f.row('b'));
  const result = await f.validate();
  for (const r of result.records) await f.service.confirmOnboardingDifferentPerson('org', r.id, 'hr', r.duplicateReview!.token!);
  const registration = await f.service.registerOnboardingBatch('org', 'batch');
  expect(registration).toMatchObject({registered: 2, failed: 0});
  expect(f.state().employees).toHaveLength(2); expect(f.state().users).toHaveLength(2);
  await expect(f.service.registerOnboardingBatch('org', 'batch')).rejects.toThrow('No records are ready');
  expect(f.state().employees).toHaveLength(2); expect(f.state().users).toHaveLength(2);
});

it('refuses a newly arrived match between preflight and the locked registration check', async () => {
  const f = fixture(); await f.validate();
  const real = f.db.$transaction.getMockImplementation()!;
  let added = false;
  f.db.$transaction.mockImplementation(async (callback: any) => {
    if (!added) { added = true; f.state().batches.push(f.batch('other')); f.state().rows.push(f.row('b', {batchId: 'other'})); }
    return real(callback);
  });
  const result = await f.service.registerOnboardingBatch('org', 'batch');
  expect(result).toMatchObject({registered: 0, failed: 1});
  expect(result.batch.records[0]).toMatchObject({status: 'NEEDS_FIXING', duplicateReview: {requiresReview: true}});
  expect(f.db.employee.create).not.toHaveBeenCalled(); expect(f.db.user.create).not.toHaveBeenCalled();
});

it('allows registration after a cross-import duplicate is excluded without demanding redundant validation', async () => {
  const f = fixture(); f.state().batches.push(f.batch('other')); f.state().rows.push(f.row('b', {batchId: 'other'}));
  await f.validate(); f.state().rows[1].status = 'EXCLUDED';
  expect((await f.get()).records[0].status).toBe('READY');
  expect(await f.service.registerOnboardingBatch('org', 'batch')).toMatchObject({registered: 1, failed: 0});
});

it('keeps raw Draft rows unvalidated and does not register them', async () => {
  const f = fixture(); expect((await f.get()).records[0].status).toBe('DRAFT');
  await expect(f.service.registerOnboardingBatch('org', 'batch')).rejects.toThrow('No records are ready');
});

it('preserves legacy ambiguous-phone blocking independently of soft-name review', async () => {
  const f = fixture(); f.state().employees.push({id: 'legacy', organizationId: 'org', firstName: 'Dennis', lastName: 'Kamau', phone: '0712345678'});
  const result = await f.validate();
  expect(result.records[0].validationErrors).toEqual([expect.objectContaining({field: 'mobileNumber', message: expect.stringContaining('without a clear country code')})]);
});

it('limits the new confirmation endpoint to HR/Admin roles using the existing guard', () => {
  const guard = new RolesGuard(new Reflector());
  for (const roleLevel of [Role.HR, Role.ADMIN, Role.SUPER_ADMIN, Role.EMPLOYEE]) {
    const context: any = {getHandler: () => EmsController.prototype.confirmOnboardingDifferentPerson, getClass: () => EmsController,
      switchToHttp: () => ({getRequest: () => ({user: {roleLevel}})})};
    expect(guard.canActivate(context)).toBe(roleLevel !== Role.EMPLOYEE);
  }
});


it('undoes a confirmation and requires review again without deleting either person', async () => {
  const f = fixture(); f.state().rows.push(f.row('b'));
  const token = (await f.validate()).records[0].duplicateReview!.token!;
  await f.service.confirmOnboardingDifferentPerson('org', 'a', 'hr', token);
  const result = await f.service.undoOnboardingDifferentPerson('org', 'a', 'hr', token);
  expect(result.records[0]).toMatchObject({status: 'NEEDS_FIXING', duplicateReview: {reviewed: false, requiresReview: true}});
  expect(f.state().rows[0].duplicateReviewReceipt).toBeNull();
  expect(f.state().rows).toHaveLength(2);
  expect(f.state().employees).toHaveLength(0);
});

it.each(['REGISTERED', 'EXCLUDED'])('does not undo a confirmation on a %s record', async status => {
  const f = fixture(); f.state().rows[0].status = status;
  await expect(f.service.undoOnboardingDifferentPerson('org', 'a', 'hr', 'a'.repeat(64))).rejects.toBeInstanceOf(BadRequestException);
  expect(f.db.emsOnboardingRecord.update).not.toHaveBeenCalled();
});

it('rejects stale or foreign-organisation undo requests', async () => {
  const f = fixture(); f.state().rows.push(f.row('b'));
  const token = (await f.validate()).records[0].duplicateReview!.token!;
  await f.service.confirmOnboardingDifferentPerson('org', 'a', 'hr', token);
  await expect(f.service.undoOnboardingDifferentPerson('other-org', 'a', 'hr', token)).rejects.toBeInstanceOf(NotFoundException);
  await expect(f.service.undoOnboardingDifferentPerson('org', 'a', 'hr', '0'.repeat(64))).rejects.toBeInstanceOf(ConflictException);
  expect(f.state().rows[0].duplicateReviewReceipt).toMatchObject({token});
});

it('rolls back undo if revalidation fails', async () => {
  const f = fixture(); f.state().rows.push(f.row('b'));
  const token = (await f.validate()).records[0].duplicateReview!.token!;
  await f.service.confirmOnboardingDifferentPerson('org', 'a', 'hr', token);
  f.db.department.findMany.mockRejectedValueOnce(new Error('Database unavailable'));
  await expect(f.service.undoOnboardingDifferentPerson('org', 'a', 'hr', token)).rejects.toThrow('Database unavailable');
  expect(f.state().rows[0].duplicateReviewReceipt).toMatchObject({token});
});

it('requires a fresh review after a matching registered employee changes surname', async () => {
  const f = fixture();
  f.state().employees.push({id: 'existing', organizationId: 'org', firstName: 'Grace', middleName: 'Muthoni', lastName: 'Wanjiru', employeeCode: 'EMP-OTHER', phone: '254712345679', jobTitle: 'Manager'});
  const token = (await f.validate()).records[0].duplicateReview!.token!;
  await f.service.confirmOnboardingDifferentPerson('org', 'a', 'hr', token);
  f.state().employees[0].lastName = 'Wanjiku';
  expect((await f.get()).records[0]).toMatchObject({status: 'NEEDS_FIXING', duplicateReview: {requiresReview: true, reviewed: false}});
});

it('does not demand review when a profile edit removes the only matching person', async () => {
  const f = fixture();
  f.state().employees.push({id: 'existing', organizationId: 'org', firstName: 'Grace', middleName: 'Muthoni', lastName: 'Wanjiru', employeeCode: 'EMP-OTHER', phone: '254712345679'});
  await f.validate();
  Object.assign(f.state().employees[0], {firstName: 'Dennis', middleName: null, lastName: 'Kamau'});
  expect((await f.get()).records[0]).toMatchObject({status: 'READY', duplicateReview: {requiresReview: false, possibleMatches: []}});
});

it('limits undo to the same HR/Admin roles as confirmation', () => {
  const guard = new RolesGuard(new Reflector());
  for (const roleLevel of [Role.HR, Role.ADMIN, Role.SUPER_ADMIN, Role.EMPLOYEE]) {
    const context: any = {getHandler: () => EmsController.prototype.undoOnboardingDifferentPerson, getClass: () => EmsController,
      switchToHttp: () => ({getRequest: () => ({user: {roleLevel}})})};
    expect(guard.canActivate(context)).toBe(roleLevel !== Role.EMPLOYEE);
  }
});
