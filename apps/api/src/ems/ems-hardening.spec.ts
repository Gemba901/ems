import { createHash } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { Prisma } from 'db';
import { EmsService } from './ems.service';

// Real service + helpers, with a rollback-capable in-memory database. These are
// regression/query-count checks, not a live PostgreSQL concurrency benchmark.
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

describe('batched account validation and unchanged findings', () => {
  it('validates 300 distinct rows with one account lookup; revalidation writes no unchanged rows', async () => {
    const f = fixture();
    f.state().rows = Array.from({length: 300}, (_, i) => {
      const name = createHash('sha256').update(String(i)).digest('hex').replace(/[0-9]/g, n => String.fromCharCode(107 + Number(n)));
      return f.row(`row-${i}`, {rowNumber: i + 2, firstName: name.slice(0, 16), middleName: null, lastName: name.slice(16, 32), mobileNumber: `0${712340000 + i}`});
    });
    await expect(f.service.validateOnboardingBatchAck('org', 'batch')).resolves.toEqual({id: 'batch'});
    expect(f.state().rows.every(r => r.status === 'READY')).toBe(true);
    expect(f.db.$queryRaw.mock.calls.filter((c: any[]) => c[0][0].includes('SELECT id, phone, email'))).toHaveLength(1);
    expect(f.db.emsOnboardingRecord.update).toHaveBeenCalledTimes(300);
    f.db.emsOnboardingRecord.update.mockClear();
    f.db.$queryRaw.mockClear();
    await f.service.validateOnboardingBatchAck('org', 'batch');
    expect(f.db.emsOnboardingRecord.update).not.toHaveBeenCalled();
    expect(f.db.$queryRaw.mock.calls.filter((c: any[]) => c[0][0].includes('SELECT id, phone, email'))).toHaveLength(1);
  });

  it('keeps each phone candidate set separate and still flags ambiguous local/account variants', async () => {
    const f = fixture();
    f.state().rows.push(f.row('b', {firstName: 'Peter', lastName: 'Other', mobileNumber: '0712345679'}));
    f.state().users.push({id: 'local', phone: '0712345678', email: null},
      {id: 'international', phone: '+254 (712) 345-679', email: null});
    await f.service.validateOnboardingBatchAck('org', 'batch');
    expect(f.state().rows[0].status).toBe('NEEDS_FIXING');
    expect(f.state().rows[0].validationErrors).toEqual([expect.objectContaining({field: 'mobileNumber', message: expect.stringContaining('ambiguous')})]);
    expect(f.state().rows[1].status).toBe('READY');
  });

  it('still blocks two existing accounts for the same international number', async () => {
    const f = fixture();
    f.state().users.push({id: 'u1', phone: '+254712345678', email: null}, {id: 'u2', phone: '254712345678', email: null});
    await f.service.validateOnboardingBatchAck('org', 'batch');
    expect(f.state().rows[0].validationErrors).toEqual([expect.objectContaining({field: 'mobileNumber', message: expect.stringContaining('ambiguous')})]);
  });

  it('does not query accounts for invalid, excluded or internally duplicated phones', async () => {
    const f = fixture();
    f.state().rows.push(f.row('b'), f.row('bad', {mobileNumber: 'wrong'}), f.row('out', {status: 'EXCLUDED'}));
    f.state().rows[1].mobileNumber = f.state().rows[0].mobileNumber;
    await f.service.validateOnboardingBatchAck('org', 'batch');
    expect(f.db.$queryRaw.mock.calls.some((c: any[]) => c[0][0].includes('SELECT id, phone, email'))).toBe(false);
  });

  it('compares JSON findings independently of JSONB object-key order', async () => {
    const f = fixture();
    f.state().rows[0].workEmail = '';
    await f.service.validateOnboardingBatchAck('org', 'batch');
    f.state().rows[0].validationErrors = f.state().rows[0].validationErrors.map((v: any) => Object.fromEntries(Object.entries(v).reverse()));
    f.db.emsOnboardingRecord.update.mockClear();
    await f.service.validateOnboardingBatchAck('org', 'batch');
    expect(f.db.emsOnboardingRecord.update).not.toHaveBeenCalled();
    f.state().rows[0].workEmail = 'restored@example.test';
    await f.service.validateOnboardingBatchAck('org', 'batch');
    expect(f.state().rows[0]).toMatchObject({status: 'READY', validationErrors: null});
    expect(f.db.emsOnboardingRecord.update).toHaveBeenCalledTimes(1);
  });

  it('reads fresh accounts on every validation rather than caching them across requests', async () => {
    const f = fixture();
    await f.service.validateOnboardingBatchAck('org', 'batch');
    f.state().users.push({id: 'new-legacy', phone: '0712345678', email: null});
    await f.service.validateOnboardingBatchAck('org', 'batch');
    expect(f.state().rows[0].status).toBe('NEEDS_FIXING');
  });

  it('bounds account-query parameter counts without losing phones at chunk boundaries', async () => {
    const f = fixture();
    const phones = Array.from({length: 600}, (_, i) => `${254712340000 + i}`);
    f.state().users.push({id: 'last', phone: phones[599], email: null});
    const result = await (f.service as any).onboardingAccountCandidates(f.db, phones);
    const calls = f.db.$queryRaw.mock.calls;
    expect(calls.length).toBeGreaterThan(1);
    for (const call of calls) {
      const chunk = call[1];
      expect(Array.isArray(chunk) ? chunk.length : chunk.values.length).toBeLessThanOrEqual(1000);
    }
    expect(result.get(phones[599])).toEqual([{id: 'last', phone: phones[599], email: null}]);
  });
});

describe('atomic changes and validation', () => {
  it.each(['save', 'exclude', 'include', 'country'])('rolls back %s when validation fails technically', async operation => {
    const f = fixture();
    if (operation === 'include') Object.assign(f.state().rows[0], {status: 'EXCLUDED', exclusionReason: 'Old reason'});
    const before = structuredClone(f.state());
    jest.spyOn(f.service as any, 'validateOnboardingBatchLocked').mockRejectedValue(new Error('Database unavailable'));
    const run = operation === 'save' ? () => f.service.updateOnboardingRecord('org', 'a', {firstName: 'Changed'})
      : operation === 'exclude' ? () => f.service.excludeOnboardingRecord('org', 'a', {reason: 'Not employed'})
      : operation === 'include' ? () => f.service.includeOnboardingRecord('org', 'a')
      : () => f.service.updateOnboardingBatchCountry('org', 'batch', {defaultPhoneCountry: 'GB'});
    await expect(run()).rejects.toThrow('Database unavailable');
    expect(f.state()).toEqual(before);
  });

  it('acknowledges only a committed upload and does not build unused full detail', async () => {
    const f = fixture();
    const detail = jest.spyOn(f.service, 'getOnboardingBatch');
    await expect(f.service.addOnboardingRecordsAck('org', 'batch', {records: [{firstName: 'New'}]} as any)).resolves.toEqual({id: 'batch'});
    expect(detail).not.toHaveBeenCalled();
    const error = Object.assign(new Error('Commit failed'), {code: 'P2028'});
    f.db.$transaction.mockRejectedValueOnce(error);
    await expect(f.service.addOnboardingRecordsAck('org', 'batch', {records: []})).rejects.toBe(error);
    expect(detail).not.toHaveBeenCalled();
  });

  it('retries a rolled-back upload without duplicating the rows', async () => {
    const f = fixture();
    const transaction = f.db.$transaction.getMockImplementation();
    let first = true;
    f.db.$transaction.mockImplementation((run: any) => transaction(async (tx: any) => {
      const value = await run(tx);
      if (first) {first = false; throw {code: 'P2034'};}
      return value;
    }));
    await f.service.addOnboardingRecordsAck('org', 'batch', {records: [{firstName: 'New'}]} as any);
    expect(f.state().rows.filter(r => r.id === 'added-0')).toHaveLength(1);
    expect(f.db.$transaction).toHaveBeenCalledTimes(2);
  });
});

describe('registration interruption and repeat protection', () => {
  it('retries an aborted registration without duplicate users or employees', async () => {
    const f = fixture();
    await f.service.validateOnboardingBatchAck('org', 'batch');
    const transaction = f.db.$transaction.getMockImplementation();
    let first = true;
    f.db.$transaction.mockImplementation((run: any, options: any) => transaction(async (tx: any) => {
      const value = await run(tx);
      if (first && options?.isolationLevel === 'Serializable') {first = false; throw {code: 'P2034'};}
      return value;
    }));
    await expect(f.service.registerOnboardingBatch('org', 'batch')).resolves.toMatchObject({registered: 1, failed: 0});
    expect(f.state().employees).toHaveLength(1);
    expect(f.state().users).toHaveLength(1);
    expect(f.state().rows[0].status).toBe('REGISTERED');
  });

  it('preserves committed people and does not label an unexpected DB failure as Needs fixing', async () => {
    const f = fixture();
    f.state().rows.push(f.row('b', {firstName: 'Peter', lastName: 'Other'}));
    await f.service.validateOnboardingBatchAck('org', 'batch');
    const create = f.db.employee.create.getMockImplementation();
    f.db.employee.create.mockImplementationOnce(create).mockRejectedValueOnce(new Error('Connection lost'));
    let error: any;
    try { await f.service.registerOnboardingBatch('org', 'batch'); } catch (caught) {error = caught;}
    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toMatchObject({registered: 1, failed: 0});
    expect(f.state().employees).toHaveLength(1);
    expect(f.state().users).toHaveLength(1);
    expect(f.state().rows.map(r => r.status)).toEqual(['REGISTERED', 'READY']);
    expect(f.db.emsOnboardingRecord.updateMany).not.toHaveBeenCalled();
  });

  it.each(['REGISTERED', 'EXCLUDED'])('skips a candidate changed to %s by another request before the lock', async status => {
    const f = fixture();
    await f.service.validateOnboardingBatchAck('org', 'batch');
    const transaction = f.db.$transaction.getMockImplementation();
    let changed = false;
    f.db.$transaction.mockImplementation((run: any) => {
      if (!changed) {changed = true; f.state().rows[0].status = status;}
      return transaction(run);
    });
    await expect(f.service.registerOnboardingBatch('org', 'batch')).resolves.toMatchObject({registered: 0, failed: 0});
    expect(f.db.employee.create).not.toHaveBeenCalled();
    expect(f.db.user.create).not.toHaveBeenCalled();
    expect(f.state().rows[0].status).toBe(status);
  });
});

// G1b: reductions are measured per phase, never by caching across requests.
describe('shared onboarding read phases', () => {
  it('loads employees/departments once for a detail snapshot without leaking internal account fields', async () => {
    const f = fixture();
    f.state().employees.push({id:'employee',organizationId:'org',firstName:'Other',lastName:'Person',
      employeeCode:'OTHER',phone:'254799999999',email:'private@example.test',userId:'private-user'});
    const result = await f.get();
    expect(f.db.employee.findMany).toHaveBeenCalledTimes(1);
    expect(f.db.department.findMany).toHaveBeenCalledTimes(1);
    expect(result.peopleLinks.options).toEqual(expect.arrayContaining([expect.objectContaining({target:'employee:employee'})]));
    expect(JSON.stringify(result.peopleLinks)).not.toContain('private@example.test');
    expect(JSON.stringify(result.peopleLinks)).not.toContain('private-user');
    expect(result).not.toHaveProperty('employees');
  });

  it('loads employees/departments once per validation, then freshly for its post-commit response', async () => {
    const f = fixture();
    await f.validate();
    expect(f.db.employee.findMany).toHaveBeenCalledTimes(2);
    expect(f.db.department.findMany).toHaveBeenCalledTimes(2);
    for (const [args] of f.db.employee.findMany.mock.calls) expect(args.where).toEqual({organizationId:'org'});
  });

  it('revalidates 300 rows using one employee read and one department read per phase', async () => {
    const f = fixture();
    f.state().rows = Array.from({length:300}, (_, i) => f.row(`r${i}`, {
      firstName:`Name${i}`, lastName:`Surname${i}`, middleName:null, mobileNumber:`0${712340000+i}`,rowNumber:i+2,
    }));
    await f.service.validateOnboardingBatchAck('org','batch');
    expect(f.db.employee.findMany).toHaveBeenCalledTimes(1);
    expect(f.db.department.findMany).toHaveBeenCalledTimes(1);
    f.db.employee.findMany.mockClear(); f.db.department.findMany.mockClear(); f.db.emsOnboardingRecord.update.mockClear();
    await f.service.validateOnboardingBatchAck('org','batch');
    expect(f.db.employee.findMany).toHaveBeenCalledTimes(1);
    expect(f.db.department.findMany).toHaveBeenCalledTimes(1);
    expect(f.db.emsOnboardingRecord.update).not.toHaveBeenCalled();
  });

  it('sees a newly created conflicting employee on the next detail request', async () => {
    const f = fixture();
    expect((await f.get()).records[0].duplicateReview!.hardConflicts).toHaveLength(0);
    f.state().employees.push({id:'conflict',organizationId:'org',employeeCode:'EMP-a',firstName:'Different',lastName:'Person',phone:'254799999999'});
    expect((await f.get()).records[0].duplicateReview!.hardConflicts).toEqual(expect.arrayContaining([expect.objectContaining({employeeId:'conflict',reasons:expect.arrayContaining(['EMPLOYEE_CODE'])})]));
  });

  it('does not reuse employee data from a validation transaction in its subsequent detail snapshot', async () => {
    const f = fixture(), transaction = f.db.$transaction.getMockImplementation();
    let completed = 0;
    f.db.$transaction.mockImplementation(async (run:any) => {
      const result = await transaction(run);
      if (++completed === 1) f.state().employees.push({id:'late',organizationId:'org',employeeCode:'EMP-a',firstName:'Different',lastName:'Person'});
      return result;
    });
    const result = await f.validate();
    expect(result.records[0].duplicateReview!.hardConflicts.some((p:any)=>p.employeeId==='late')).toBe(true);
  });

  it('loads fresh employee data when an aborted validation transaction retries', async () => {
    const f = fixture(), transaction = f.db.$transaction.getMockImplementation();
    let first = true;
    f.db.$transaction.mockImplementation(async (run:any) => {
      try {
        return await transaction(async (tx:any) => {
          const result = await run(tx);
          if (first) { first=false; throw {code:'P2034'}; }
          return result;
        });
      } catch (error) {
        f.state().employees.push({id:'conflict',organizationId:'org',employeeCode:'EMP-a',firstName:'Other',lastName:'Person'});
        throw error;
      }
    });
    await f.service.validateOnboardingBatchAck('org','batch');
    expect(f.db.employee.findMany).toHaveBeenCalledTimes(2);
    expect(f.state().rows[0].status).toBe('NEEDS_FIXING');
    expect(f.state().rows[0].validationErrors.some((e:any)=>e.field==='employeeCode')).toBe(true);
  });

  it('loads the edited record for validation rather than the earlier editor snapshot', async () => {
    const f = fixture();
    await f.service.updateOnboardingRecord('org','a',{firstName:'Changed',currentDepartment:'Unknown'});
    expect(f.state().rows[0].firstName).toBe('Changed');
    expect(f.state().rows[0].status).toBe('NEEDS_FIXING');
    expect(f.state().rows[0].validationErrors.some((e:any)=>e.field==='currentDepartment')).toBe(true);
  });
});
