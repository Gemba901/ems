import { createDuplicateIndex, DuplicatePerson, DuplicateReviewReceipt } from './onboarding-duplicates';

const person = (id: string, changes: Partial<DuplicatePerson> = {}): DuplicatePerson => ({
  organizationId: 'org', kind: 'IMPORT', id, batchId: 'batch', firstName: 'Grace', middleName: 'Muthoni',
  lastName: 'Wanjiru', employeeCode: `EMP-${id}`, canonicalPhone: null, department: 'Administration',
  designation: 'Director', branch: 'Nairobi', ...changes,
});
const subject = person('subject');
const review = (others: DuplicatePerson[], current = subject, receipt?: unknown) =>
  createDuplicateIndex('org', [current, ...others]).review(current, receipt);
const acknowledge = (token: string | null): DuplicateReviewReceipt => ({
  version: 1, token: token!, confirmedByUserId: 'hr-user', confirmedAt: '2026-10-14T12:00:00.000Z',
});

describe('onboarding duplicate-person review', () => {
  it('does not match a record against itself', () => {
    expect(review([])).toMatchObject({ token: null, hardConflicts: [], possibleMatches: [], blocked: false });
  });

  it('flags matching names even with different codes, mobiles, departments and titles', () => {
    const result = review([person('other', { canonicalPhone: '254700000002', department: 'Production', designation: 'Operator' })]);
    expect(result.hardConflicts).toHaveLength(0);
    expect(result.possibleMatches).toHaveLength(1);
    expect(result).toMatchObject({ requiresReview: true, reviewed: false, blocked: true });
  });

  it.each([
    ['reordered names', { firstName: 'WANJIRU', middleName: ' grace ', lastName: 'Muthoni' }, 'SAME_NAME'],
    ['omitted middle name', { middleName: null }, 'PARTIAL_NAME'],
    ['spelling difference', { lastName: 'Wanjiku' }, 'SIMILAR_NAME'],
    ['trailing typo', { lastName: 'WanjikuQ' }, 'SIMILAR_NAME'],
    ['transposed letters', { lastName: 'Wanijru' }, 'SIMILAR_NAME'],
    ['accent and case', { firstName: 'GRÁCE' }, 'SAME_NAME'],
  ] as const)('reviews %s without treating it as proof of identity', (_label, changes, reason) => {
    const result = review([person('other', changes)]);
    expect(result.hardConflicts).toHaveLength(0);
    expect(result.possibleMatches[0].reasons).toContain(reason);
    expect(result.reviewed).toBe(false);
  });

  it('does not flag only a shared surname, department or designation', () => {
    expect(review([person('other', { firstName: 'Esther', middleName: null })]).possibleMatches).toEqual([]);
  });

  it('reviews a compound first name entered with a space or hyphen', () => {
    const current = person('subject', { firstName: 'Mary-Jane', middleName: null, lastName: 'Otieno' });
    const other = person('other', { firstName: 'MaryJane', middleName: null, lastName: 'Otieno' });
    expect(review([other], current).possibleMatches[0].reasons).toContain('NAME_FORMAT');
  });

  it('does not flag an initials-only match', () => {
    expect(review([person('other', { firstName: 'G', middleName: 'M', lastName: 'Wanjiru' })]).possibleMatches).toEqual([]);
  });

  it('includes multiple possible people across batches and registered employees', () => {
    const result = review([person('pending', { batchId: 'another-batch' }), person('employee', { kind: 'EMPLOYEE', batchId: null })]);
    expect(result.possibleMatches.map(match => match.key).sort()).toEqual(['employee:employee', 'record:pending']);
    expect(result.possibleMatches.find(match => match.kind === 'EMPLOYEE')?.employeeId).toBe('employee');
    expect(result.possibleMatches.find(match => match.kind === 'IMPORT')?.batchId).toBe('another-batch');
  });

  it('ignores other organisations, excluded records and cancelled imports', () => {
    expect(review([
      person('foreign', { organizationId: 'other-org' }),
      person('excluded', { excluded: true }), person('cancelled', { cancelled: true }),
    ]).possibleMatches).toEqual([]);
    expect(() => createDuplicateIndex('org', []).review(person('wrong', { organizationId: 'wrong' }))).toThrow('organisation mismatch');
  });

  it('blocks an employee-code collision even with wholly different names', () => {
    const result = review([person('other', { firstName: 'Dennis', middleName: null, lastName: 'Kamau', employeeCode: ' emp SUBJECT ' })]);
    expect(result.hardConflicts[0].reasons).toContain('EMPLOYEE_CODE');
    expect(result.possibleMatches).toHaveLength(0);
    expect(review([person('other', { employeeCode: subject.employeeCode })], subject, acknowledge(result.token)).blocked).toBe(true);
  });

  it('blocks a canonical mobile collision regardless of name or code', () => {
    const current = person('subject', { canonicalPhone: '+254712345678' });
    const other = person('other', { firstName: 'Dennis', middleName: null, lastName: 'Kamau', canonicalPhone: '254712345678' });
    const first = review([other], current);
    const result = review([other], current, acknowledge(first.token));
    expect(result.hardConflicts[0].reasons).toEqual(['PERSONAL_MOBILE']);
    expect(result).toMatchObject({ reviewed: false, blocked: true });
  });

  it('accepts a server-issued current review receipt for distinct people', () => {
    const others = [person('other')];
    const result = review(others, subject, acknowledge(review(others).token));
    expect(result).toMatchObject({ reviewed: true, requiresReview: false, blocked: false });
    expect(result.possibleMatches).toHaveLength(1);
  });

  it.each([
    ['subject mobile', person('subject', { canonicalPhone: '254712345678' }), [person('other')]],
    ['subject name', person('subject', { lastName: 'Wanjiku' }), [person('other')]],
    ['candidate identity', subject, [person('other', { employeeCode: 'EMP-CHANGED' })]],
    ['candidate supporting details', subject, [person('other', { department: 'Production' })]],
    ['new candidate', subject, [person('other'), person('new')]],
  ])('requires review again after a change to %s', (_label, current, others) => {
    const receipt = acknowledge(review([person('other')]).token);
    expect(review(others as DuplicatePerson[], current as DuplicatePerson, receipt)).toMatchObject({ reviewed: false, requiresReview: true, blocked: true });
  });

  it('keeps confirmation when an unchanged candidate registers', () => {
    const imported = person('other');
    const receipt = acknowledge(review([imported]).token);
    const employee = person('registered', { kind: 'EMPLOYEE', originRecordId: 'other', employeeCode: imported.employeeCode });
    const result = review([imported, employee], subject, receipt);
    expect(result).toMatchObject({ reviewed: true, blocked: false });
    expect(result.possibleMatches).toHaveLength(1);
    expect(result.possibleMatches[0].employeeId).toBe('registered');
  });

  it('uses the current employee name over historical import text', () => {
    const imported = person('other');
    const employee = person('registered', {
      kind: 'EMPLOYEE', originRecordId: 'other', employeeCode: imported.employeeCode,
      firstName: 'Esther', middleName: null, lastName: 'Kamau',
    });
    expect(review([employee, imported]).possibleMatches).toEqual([]);
    expect(review([imported, employee]).possibleMatches).toEqual([]);
  });

  it('does not invalidate a receipt just because database ordering changes', () => {
    const a = person('a'), b = person('b');
    const receipt = acknowledge(review([a, b]).token);
    expect(review([b, a], subject, receipt).reviewed).toBe(true);
  });

  it('rejects malformed receipts and clears review state when no matches remain', () => {
    const receipt = acknowledge(review([person('other')]).token);
    expect(review([person('other')], subject, { ...receipt, confirmedByUserId: '' }).reviewed).toBe(false);
    expect(review([person('other')], subject, { ...receipt, confirmedAt: 'not a date' }).reviewed).toBe(false);
    expect(review([], subject, receipt)).toMatchObject({ reviewed: false, requiresReview: false, blocked: false, token: null });
  });
});
