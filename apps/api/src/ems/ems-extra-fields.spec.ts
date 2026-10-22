import { Role } from 'src/common/enum/role.enum';
import { EmsService } from './ems.service';
import { Prisma } from 'db';
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
  const matches = (value: any, where: any = {}): boolean => Object.entries(where).every(([key, query]) =>
    query === undefined || key === 'batch' ? query === undefined || matches(state.batches.find(b => b.id === value.batchId), query)
      : same(value?.[key], query));
  const rows = (where: any) => state.rows.filter(r => matches(r, where));
  // DbNull is Prisma's JSON write marker; database reads return JavaScript null.
  const storedRecordData = (data: any) => ({
    ...data,
    ...(data.validationErrors === Prisma.DbNull ? { validationErrors: null } : {}),
    ...(data.duplicateReviewReceipt === Prisma.DbNull ? { duplicateReviewReceipt: null } : {}),
    ...(data.extraFields === Prisma.DbNull ? {extraFields: null} : {}),
  });
  const db: any = {
    emsDepartmentHod: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    $queryRaw: jest.fn(async (sql: TemplateStringsArray, ...args: any[]) => {
      if (!sql[0].includes('SELECT id, phone, email')) return [];
      const flatten = (value: any): any[] => Array.isArray(value) ? value.flatMap(flatten)
        : value && typeof value === 'object' && 'values' in value ? flatten(value.values) : [value];
      const requested = new Set(args.flatMap(flatten));
      return state.users.filter(u => requested.has(u.phone.replace(/\D/g, '')));
    }),
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

const extras = () => [
  {column: 30, heading: 'Date of birth', originalValue: '1990-01-02', value: '1990-01-02', target: 'dateOfBirth'},
  {column: 31, heading: 'Uniform size', originalValue: 'M', value: 'M', target: null},
];
describe('additional information across the onboarding service', () => {
  it('saves the upload, validates, registers and exposes a separate profile snapshot', async () => {
    const f = fixture(); f.state().rows = [];
    await f.service.addOnboardingRecordsAck('org', 'batch', {records: [{...f.row('new'), extraFields: extras()}]} as never);
    expect(f.state().rows[0].extraFields).toEqual(extras());
    await f.validate(); expect(f.state().rows[0].status).toBe('READY');
    await f.service.registerOnboardingBatch('org', 'batch', Role.ADMIN);
    expect(f.state().employees[0]).toMatchObject({dateOfBirth: '1990-01-02T00:00:00.000Z', importedExtraFields: extras()});
    const result = await f.service.getEmployeeById(f.state().employees[0].id, 'org');
    expect(result.employee.importedExtraFields).toEqual(extras());
    expect(f.db.employee.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({where: {id: f.state().employees[0].id, organizationId: 'org'}, select: expect.objectContaining({importedExtraFields: true})}));
    await expect(f.service.registerOnboardingBatch('org', 'batch', Role.ADMIN)).rejects.toThrow('No records');
    expect(f.state().employees).toHaveLength(1);
  });
  it('keeps extras when a normal editor payload omits them', async () => {
    const f = fixture(); f.state().rows[0].extraFields = extras();
    await f.service.updateOnboardingRecord('org', 'a', {middleName: 'New'});
    expect(f.state().rows[0].extraFields).toEqual(extras());
  });
  it('accepts corrected values, retains originals and clears findings after correction', async () => {
    const f = fixture(); f.state().rows[0].extraFields = extras();
    const edited = extras(); edited[0] = {...edited[0], value: '2026-02-30', originalValue: 'forged', heading: 'forged'};
    await f.service.updateOnboardingRecord('org', 'a', {extraFields: edited} as never);
    expect(f.state().rows[0].status).toBe('NEEDS_FIXING');
    expect(f.state().rows[0].extraFields[0]).toMatchObject({heading: 'Date of birth', originalValue: '1990-01-02', value: '2026-02-30'});
    edited[0].value = '1990-01-03';
    await f.service.updateOnboardingRecord('org', 'a', {extraFields: edited} as never);
    expect(f.state().rows[0].status).toBe('READY');
    expect(f.state().rows[0].validationErrors ?? []).toEqual([]);
  });
  it('rechecks mapped values during registration even if persisted status is Ready', async () => {
    const f = fixture(); f.state().rows[0].extraFields = extras(); f.state().rows[0].extraFields[0].value = 'impossible'; f.state().rows[0].status = 'READY';
    await f.service.registerOnboardingBatch('org', 'batch', Role.ADMIN);
    expect(f.state().employees).toHaveLength(0);
    expect(f.state().rows[0].validationErrors[0]).toMatchObject({field: 'extraFields'});
  });
  it('refuses arbitrary assignment targets before writing any uploaded row', async () => {
    const f = fixture(); const value = extras(); value[0].target = 'organizationId';
    await expect(f.service.addOnboardingRecordsAck('org', 'batch', {records: [{extraFields: value}]} as never)).rejects.toThrow('supported profile');
    expect(f.db.emsOnboardingRecord.createMany).not.toHaveBeenCalled();
  });
  it('cannot change registered rows or cross organization boundaries', async () => {
    const f = fixture(); f.state().rows[0].extraFields = extras(); f.state().rows[0].status = 'REGISTERED';
    await expect(f.service.updateOnboardingRecord('org', 'a', {extraFields: extras()} as never)).rejects.toThrow('already been registered');
    await expect(f.service.updateOnboardingRecord('other-org', 'a', {extraFields: extras()} as never)).rejects.toThrow('not found');
  });
  it('keeps extras through exclude and put back', async () => {
    const f = fixture(); f.state().rows[0].extraFields = extras();
    await f.service.excludeOnboardingRecord('org', 'a', {reason: 'Test exclusion'});
    await f.service.includeOnboardingRecord('org', 'a');
    expect(f.state().rows[0].extraFields).toEqual(extras());
  });
});


describe('5S location category across the onboarding service', () => {
  it.each([['Store', 'STORE'], [' office ', 'OFFICE'], ['Production shop floor', 'PRODUCTION_SHOP_FLOOR']])('uploads, registers and reads %s as %s', async (value, expected) => {
    const f = fixture(); f.state().rows = [];
    await f.service.addOnboardingRecordsAck('org', 'batch', {records: [{...f.row('new'), fiveSLocationCategory: value, extraFields: extras()}]} as never);
    expect(f.state().rows[0].fiveSLocationCategory).toBe(value);
    await f.validate(); expect(f.state().rows[0].status).toBe('READY');
    await f.service.registerOnboardingBatch('org', 'batch', Role.ADMIN);
    expect(f.state().employees[0]).toMatchObject({fiveSLocationCategory: expected, importedExtraFields: extras()});
    const result = await f.service.getEmployeeById(f.state().employees[0].id, 'org');
    expect(result.employee.fiveSLocationCategory).toBe(expected);
    expect(f.db.employee.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({select: expect.objectContaining({fiveSLocationCategory: true})}));
  });
  it('blocks an unrecognised category and becomes Ready after correction without losing extras', async () => {
    const f = fixture(); f.state().rows[0].extraFields = extras();
    await f.service.updateOnboardingRecord('org', 'a', {fiveSLocationCategory: 'Warehouse'});
    expect(f.state().rows[0]).toMatchObject({status: 'NEEDS_FIXING', fiveSLocationCategory: 'Warehouse', extraFields: extras()});
    expect(f.state().rows[0].validationErrors).toContainEqual({field: 'fiveSLocationCategory', message: expect.stringContaining('Choose Store')});
    await f.service.updateOnboardingRecord('org', 'a', {fiveSLocationCategory: 'STORE'});
    expect(f.state().rows[0]).toMatchObject({status: 'READY', fiveSLocationCategory: 'STORE', extraFields: extras()});
  });
  it.each([undefined, '', 'N/A'])('does not make an omitted category %j mandatory at validation or registration', async value => {
    const f = fixture(); f.state().rows[0].fiveSLocationCategory = value;
    await f.validate(); expect(f.state().rows[0].status).toBe('READY');
    await f.service.registerOnboardingBatch('org', 'batch', Role.ADMIN);
    expect(f.state().employees[0].fiveSLocationCategory).toBeNull();
  });
  it('rechecks a stale Ready category before creating a user or employee', async () => {
    const f = fixture(); f.state().rows[0].status = 'READY'; f.state().rows[0].fiveSLocationCategory = 'invalid';
    await f.service.registerOnboardingBatch('org', 'batch', Role.ADMIN);
    expect(f.state().users).toHaveLength(0); expect(f.state().employees).toHaveLength(0);
    expect(f.state().rows[0].validationErrors).toEqual(expect.arrayContaining([expect.objectContaining({field: 'fiveSLocationCategory'})]));
  });
  it('preserves a saved category on unrelated edits, exclusion and put back; supports clearing', async () => {
    const f = fixture(); f.state().rows[0].fiveSLocationCategory = 'Office';
    await f.service.updateOnboardingRecord('org', 'a', {middleName: 'Changed'});
    await f.service.excludeOnboardingRecord('org', 'a', {reason: 'Test exclusion'});
    await f.service.includeOnboardingRecord('org', 'a');
    expect(f.state().rows[0].fiveSLocationCategory).toBe('Office');
    await f.service.updateOnboardingRecord('org', 'a', {fiveSLocationCategory: ''});
    expect(f.state().rows[0].fiveSLocationCategory ?? '').toBe('');
    expect(f.state().rows[0].status).toBe('READY');
  });
});
