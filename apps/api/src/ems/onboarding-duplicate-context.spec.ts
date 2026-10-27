import { refreshedDuplicateRecord } from './onboarding-duplicate-context';
import { peopleLinkFindings } from './onboarding-people-links';

const noDuplicates = { hardConflicts: [], possibleMatches: [], requiresReview: false } as never;
const warning = { field: 'extraFields', column: 33, message: 'Date of birth (column AG): …', severity: 'warning' };

describe('refreshing duplicate findings on load', () => {
  it('keeps a Ready record Ready when its only finding is a warning', () => {
    const record = refreshedDuplicateRecord({ status: 'READY', validationErrors: [warning] }, noDuplicates);
    expect(record.status).toBe('READY');
    expect(record.validationErrors).toEqual([warning]);
  });

  it('still makes a Ready record Needs fixing when a duplicate appears', () => {
    const review = { hardConflicts: [{ reasons: ['EMPLOYEE_CODE'] }], possibleMatches: [], requiresReview: false } as never;
    const record = refreshedDuplicateRecord({ status: 'READY', validationErrors: [warning] }, review);
    expect(record.status).toBe('NEEDS_FIXING');
  });
});

describe('people-link findings', () => {
  it('a reliever that cannot be linked is a warning; the HOD still blocks', () => {
    const failed = { target: null, state: 'NEEDS_ATTENTION', person: null, error: 'Multiple people have this name.', warning: null };
    const fine = { target: null, state: 'UNASSIGNED', person: null, error: null, warning: null };
    const findings = peopleLinkFindings({ hod: failed, first: failed, second: fine } as never);
    expect(findings).toEqual([
      { field: 'hodName', message: 'Multiple people have this name.', code: 'PEOPLE_LINK' },
      { field: 'reliever1Name', message: 'Multiple people have this name.', code: 'PEOPLE_LINK', severity: 'warning' },
    ]);
  });
});
