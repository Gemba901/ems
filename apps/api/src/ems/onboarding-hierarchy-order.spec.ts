import { resolveReporting, ReportingRow, ReportingEmployee } from './onboarding-hierarchy';

const person = (id: string, rowNumber: number, name: string, changes: Partial<ReportingRow> = {}): ReportingRow => ({
  id, batchId: 'batch', rowNumber, status: 'READY', firstName: name, lastName: 'Person',
  employeeCode: name, jobDesignation: 'Manager', ...changes,
});
const codes = (rows: ReportingRow[], employees: ReportingEmployee[] = []) => {
  const byId = new Map(rows.map(r => [r.id, r.employeeCode]));
  return resolveReporting(rows, employees).orderedIds.map(id => byId.get(id));
};

describe('stable source-based hierarchy ordering', () => {
  it.each([false, true])('keeps broken branches stable across new IDs and fetch order (reverse %s)', reverse => {
    const make = (a: string, b: string) => [
      person('reportA', 1, 'Njeri', { reportingToRecordId: a }),
      person(a, 9, 'Samuel'),
      person('reportB', 3, 'Daisy', { reportingToRecordId: b }),
      person(b, 8, 'Esther'),
    ];
    const first = make('aaa', 'zzz'), second = make('zzz', 'aaa');
    if (reverse) second.reverse();
    expect(codes(first)).toEqual(['Samuel', 'Njeri', 'Esther', 'Daisy']);
    expect(codes(second)).toEqual(codes(first));
    expect(resolveReporting(second, []).byRecord.reportA.errorScope).toBe('UPSTREAM');
  });

  it('keeps unknown employee-root branches stable when employee IDs/order change', () => {
    const make = (a: string, b: string) => {
      const rows = [person('ra', 1, 'Ann', { reportingToEmployeeId: a }), person('rb', 2, 'Ben', { reportingToEmployeeId: b })];
      const employees = [{ id: a, firstName: 'Unknown', lastName: 'Alpha', jobTitle: 'Manager' },
        { id: b, firstName: 'Unknown', lastName: 'Beta', jobTitle: 'Manager' }];
      return { rows, employees };
    };
    const a = make('z', 'a'), b = make('a', 'z');
    expect(codes(a.rows, a.employees)).toEqual(['Ann', 'Ben']);
    expect(codes(b.rows.reverse(), b.employees.reverse())).toEqual(['Ann', 'Ben']);
  });

  it('orders a cycle consistently without claiming its members form a valid chain', () => {
    const make = (a: string, b: string) => [
      person(a, 1, 'Alpha', { reportingToRecordId: b }),
      person(b, 2, 'Beta', { reportingToRecordId: a }),
      person('tail', 3, 'Tail', { reportingToRecordId: a }),
    ];
    const first = make('a', 'z'), second = make('z', 'a').reverse();
    expect(codes(second)).toEqual(codes(first));
    for (const resolution of Object.values(resolveReporting(second, []).byRecord)) {
      expect(resolution.error).toContain('Circular');
      expect(resolution.depth).toBeNull();
      expect(resolution.warning).toBeNull();
    }
  });

  it('preserves valid Board hierarchy levels and puts excluded records last', () => {
    const rows = [person('child', 1, 'Child', { reportingToRecordId: 'root' }),
      person('root', 8, 'Root', { reportingToBoard: true }),
      person('bad', 2, 'Broken'), person('out', 0, 'Excluded', { status: 'EXCLUDED' })];
    expect(codes(rows)).toEqual(['Root', 'Child', 'Broken', 'Excluded']);
  });

  it('uses person details when source rows are absent or equal, rather than generated IDs', () => {
    const a = [person('z', 1, 'Alpha'), person('a', 1, 'Beta')];
    expect(codes(a.reverse())).toEqual(['Alpha', 'Beta']);
    const b = [person('new-a', 1, 'Beta'), person('new-z', 1, 'Alpha')].map(r => ({ ...r, rowNumber: null }));
    expect(codes(b)).toEqual(['Alpha', 'Beta']);
  });
});
