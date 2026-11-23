import { EmsStructureSource } from './ems-structure.source';
import { EmsPositionsSource } from './ems-positions.source';
import { EmsCalendarPeopleSource } from './ems-calendar-people.source';
import { PositionChartService } from '../positions/position-chart.service';
import type {
  EmsDirectoryPerson,
  EmsOrganisationSnapshot,
} from 'src/ems/directory/ems-directory.contract';

const person = (
  id: string,
  extra: Partial<EmsDirectoryPerson> = {},
): EmsDirectoryPerson => ({
  id,
  name: id,
  employeeCode: id,
  jobTitle: 'Manager',
  departmentId: 'd',
  branch: 'Head Office',
  branchKey: 'headoffice',
  section: null,
  employmentStatus: 'ACTIVE',
  active: true,
  avatarUrl: null,
  reporting: { managerId: null, body: 'OWNER', state: 'BODY' },
  ...extra,
});
const snapshot = (): EmsOrganisationSnapshot => ({
  schemaVersion: 1,
  source: 'EMS',
  loadedAt: '2026-11-22T00:00:00Z',
  company: { id: 'a', name: 'A' },
  departments: [
    { id: 'd', name: 'Production' },
    { id: 'empty', name: 'Empty department' },
  ],
  people: [
    person('lead'),
    person('worker', {
      branch: 'Head-office (Line 1)',
      reporting: { managerId: 'lead', body: null, state: 'MANAGER' },
      jobTitle: 'Operator',
    }),
  ],
  hodAssignments: [],
  capabilities: { recordedPositions: false },
});

describe('EMS connections to LEX', () => {
  it('uses the saved HOD for the exact department and normalised branch, even when another employee leads the reporting chain', async () => {
    const data = snapshot();
    data.hodAssignments = [
      {
        departmentId: 'd',
        branchKey: 'headoffice',
        branchLabel: 'Head Office',
        state: 'ASSIGNED',
        person: {
          id: 'worker',
          name: 'Recorded HOD',
          employeeCode: 'H1',
          jobTitle: 'HOD',
          avatarUrl: null,
        },
      },
    ];
    const source = new EmsStructureSource({
      getOrganisation: jest.fn(async () => data),
    } as never);
    const result = await source.getStructure('a');
    const unit = result.units.find(
      (u) => u.type === 'DEPARTMENT' && u.departmentId === 'd',
    )!;
    expect(unit).toMatchObject({
      hodState: 'ASSIGNED',
      people: { total: 2 },
      lead: { employeeId: 'worker', basis: 'RECORDED_HOD' },
    });
    expect(result.units.filter((u) => u.type === 'BRANCH')).toHaveLength(1);
    expect(result.units.find((u) => u.departmentId === 'empty')).toBeDefined();
    expect(result.source.kind).toBe('EMS');
  });
  it.each([
    'PENDING',
    'UNASSIGNED',
    'NOT_RECORDED',
    'NEEDS_ATTENTION',
  ] as const)('never substitutes an inferred HOD for %s', async (state) => {
    const data = snapshot();
    if (state !== 'NOT_RECORDED')
      data.hodAssignments = [
        {
          departmentId: 'd',
          branchKey: 'headoffice',
          branchLabel: 'Head Office',
          state,
          person: null,
        },
      ];
    const result = await new EmsStructureSource({
      getOrganisation: async () => data,
    } as never).getStructure('a');
    const unit = result.units.find(
      (u) => u.type === 'DEPARTMENT' && u.departmentId === 'd',
    )!;
    expect(unit.hodState).toBe(state);
    expect(unit.lead).toBeNull();
    expect(
      result.checks.some((c) => c.unitId === unit.id && c.kind === 'NO_LEAD'),
    ).toBe(state !== 'UNASSIGNED');
  });
  it('shows a saved HOD scope with no employees and keeps another branch unassigned', async () => {
    const data = snapshot();
    data.hodAssignments = [
      {
        departmentId: 'd',
        branchKey: 'otherplant',
        branchLabel: 'Other Plant',
        state: 'ASSIGNED',
        person: {
          id: 'lead',
          name: 'Lead',
          employeeCode: 'L1',
          jobTitle: 'HOD',
          avatarUrl: null,
        },
      },
    ];
    const result = await new EmsStructureSource({
      getOrganisation: async () => data,
    } as never).getStructure('a');
    const units = result.units.filter((u) => u.departmentId === 'd');
    expect(units).toHaveLength(2);
    expect(units.find((u) => u.branch === 'Other Plant')).toMatchObject({
      people: { total: 0 },
      hodState: 'ASSIGNED',
    });
    expect(units.find((u) => u.branch !== 'Other Plant')?.lead).toBeNull();
  });
  it('does not treat an explicit reporting body as a missing manager; does report pending links', async () => {
    const data = snapshot();
    data.people = [
      person('owner'),
      person('pending', {
        reporting: { managerId: null, body: null, state: 'PENDING' },
      }),
    ];
    const source = new EmsPositionsSource({
      getDirectory: async () => data,
    } as never);
    const chart = await source.getPositions('a');
    expect(chart.positions.map((p) => p.holders[0].employeeId)).toEqual([
      'owner',
    ]);
    expect(
      chart.checks.find((c) => c.kind === 'MANAGER_MISSING')?.employeeIds,
    ).toEqual(['pending']);
    expect(chart.checks.some((c) => c.kind === 'NO_MANAGER')).toBe(false);
    expect(
      chart.positions.every((p) => p.basis === 'INFERRED_FROM_PEOPLE'),
    ).toBe(true);
  });
  it('forwards the real viewer to the single atomic EMS detail read', async () => {
    const getPerson = jest.fn(async () => ({
      tier: 'BASIC',
      employeeId: 'worker',
    }));
    const source = new EmsPositionsSource({ getPerson } as never);
    const service = new PositionChartService(source);
    expect(await service.getPerson('a', 'viewer', 'worker')).toMatchObject({
      tier: 'BASIC',
    });
    expect(getPerson).toHaveBeenCalledWith('a', 'viewer', 'worker');
  });
  it('passes the calendar transaction through unchanged and includes no HOD, reporting or profile details in calendar people', async () => {
    const data = snapshot();
    const readDirectory = jest.fn(async () => data);
    const tx = { transactionMarker: true };
    const result = await new EmsCalendarPeopleSource({
      readDirectory,
    } as never).read(tx as never, 'a');
    expect(readDirectory).toHaveBeenCalledWith(tx, 'a');
    expect(result).toMatchObject({
      source: 'EMS',
      departments: data.departments,
      loadedAt: data.loadedAt,
    });
    expect(Object.keys(result.people[0]).sort()).toEqual(
      [
        'id',
        'name',
        'code',
        'jobTitle',
        'departmentId',
        'branch',
        'active',
      ].sort(),
    );
  });
});
