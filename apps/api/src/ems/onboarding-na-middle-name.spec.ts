import { middleNameOrNull, personFullName } from './onboarding-text';
import { resolveReporting } from './onboarding-hierarchy';
import { personName } from './onboarding-people-links';

describe('an N/A middle name means no middle name', () => {
  it('is left out of full names', () => {
    expect(personFullName({ firstName: 'Daniel', middleName: 'N/A', lastName: 'Ochieng' })).toBe('Daniel Ochieng');
    expect(personFullName({ firstName: 'Daniel', middleName: ' n/a ', lastName: 'Ochieng' })).toBe('Daniel Ochieng');
    expect(personFullName({ firstName: 'Peter', middleName: 'Chebet', lastName: 'Muthoni' })).toBe('Peter Chebet Muthoni');
    expect(personName({ firstName: 'Grace', middleName: 'NA', lastName: 'Achieng' })).toBe('Grace Achieng');
  });

  it('is stored as no middle name', () => {
    expect(middleNameOrNull('N/A')).toBeNull();
    expect(middleNameOrNull('')).toBeNull();
    expect(middleNameOrNull(' Chebet ')).toBe('Chebet');
  });

  it('lets reporting match a manager whose middle name is N/A', () => {
    const row = (id: string, extra: object) => ({ id, status: 'READY', rowNumber: 1, reportingToName: null, reportingToDesignation: 'Board', ...extra });
    const manager = row('mgr', { firstName: 'Daniel', middleName: 'N/A', lastName: 'Ochieng', jobDesignation: 'Production Manager' });
    const staff = row('staff', { firstName: 'Jane', middleName: 'Njeri', lastName: 'Achieng', jobDesignation: 'Machine Operator',
      reportingToName: 'Daniel Ochieng', reportingToDesignation: 'Production Manager' });
    const result = resolveReporting([manager, staff] as never, []).byRecord.staff;
    expect(result.error).toBeNull();
    expect(result.target).toBe('record:mgr');
  });

  it('still asks when a real middle name is left out', () => {
    const row = (id: string, extra: object) => ({ id, status: 'READY', rowNumber: 1, reportingToName: null, reportingToDesignation: 'Board', ...extra });
    const manager = row('mgr', { firstName: 'Peter', middleName: 'Chebet', lastName: 'Muthoni', jobDesignation: 'Production Supervisor' });
    const staff = row('staff', { firstName: 'Jane', lastName: 'Achieng', jobDesignation: 'Machine Operator',
      reportingToName: 'Peter Muthoni', reportingToDesignation: 'Production Supervisor' });
    expect(resolveReporting([manager, staff] as never, []).byRecord.staff.target).toBeNull();
  });
});
