import { PlanningPeopleService } from './planning-people.service';
import type {
  OrganisationStructure,
  OrganisationUnit,
  StructurePerson,
} from '../common/contracts';
import type { PlanningPersonMetadata } from './planning-people.contracts';

const unit = (
  id: string,
  overrides: Partial<OrganisationUnit> = {},
): OrganisationUnit => ({
  id,
  parentId: 'company',
  type: 'DEPARTMENT',
  name: 'Production',
  departmentId: 'dept-1',
  branch: null,
  lead: null,
  people: { total: 0, active: 0, probation: 0, inactive: 0 },
  ...overrides,
});
const member = (
  id: string,
  overrides: Partial<StructurePerson> = {},
): StructurePerson => ({
  id,
  unitId: 'section-north',
  name: id,
  jobTitle: 'Operator',
  avatarUrl: null,
  active: true,
  probation: false,
  ...overrides,
});
const identity = (
  id: string,
  overrides: Partial<PlanningPersonMetadata> = {},
): PlanningPersonMetadata => ({
  id,
  departmentId: 'dept-1',
  userId: `user-${id}`,
  role: 'EMPLOYEE',
  section: ' Packaging  A ',
  updatedAt: '2026-11-01T10:00:00.000Z',
  ...overrides,
});
function fixture() {
  const data: OrganisationStructure = {
    company: { id: 'org-1', name: 'Test company' },
    source: {
      kind: 'CORE_RECORDS',
      label: 'Shared core directory',
      loadedAt: '2026-11-21T10:00:00Z',
    },
    multiBranch: true,
    units: [
      unit('company', {
        type: 'COMPANY',
        name: 'Test company',
        parentId: null,
        departmentId: null,
      }),
      unit('dept-north', { branch: 'North' }),
      unit('dept-south', { branch: 'South' }),
      unit('section-north', {
        type: 'SECTION',
        name: 'Packaging A',
        parentId: 'dept-north',
      }),
      unit('section-south', {
        type: 'SECTION',
        name: 'Packaging A',
        parentId: 'dept-south',
      }),
      unit('empty-dept', {
        departmentId: 'dept-empty',
        name: 'Empty department',
      }),
    ],
    members: [
      member('active'),
      member('probation', {
        active: false,
        probation: true,
        unitId: 'section-south',
      }),
      member('no-account'),
      member('inactive', { active: false }),
    ],
    people: {
      total: 4,
      active: 3,
      probation: 1,
      inactive: 1,
      withoutDepartment: 0,
    },
    checks: [],
  };
  const records = [
    identity('active'),
    identity('probation'),
    identity('no-account', { userId: null }),
    identity('inactive'),
  ];
  const structure = {
    getStructure: jest.fn().mockImplementation(async () => data),
  };
  const metadata = {
    getPeopleMetadata: jest
      .fn()
      .mockImplementation(async (_org: string, ids: string[]) =>
        records.filter((person) => ids.includes(person.id)),
      ),
    getAccountName: jest.fn().mockResolvedValue('Account name'),
    getTimeZone: jest.fn().mockResolvedValue('Africa/Nairobi'),
    findEligibleEmployee: jest
      .fn()
      .mockResolvedValue({
        id: 'active',
        departmentId: 'dept-1',
        reportingManagerId: 'hod',
      }),
  };
  const service = new PlanningPeopleService(structure, metadata);
  return { service, data, structure, metadata, records };
}

describe('planning shared people directory', () => {
  test('uses original IDs, deduplicates branch occurrences and retains eligible staff without accounts', async () => {
    const { service, structure, metadata, data } = fixture();
    data.members.push(member('active', { unitId: 'section-south' }));
    const result = await service.getDirectory('org-1');
    expect(structure.getStructure).toHaveBeenCalledWith('org-1');
    expect(metadata.getPeopleMetadata).toHaveBeenCalledWith('org-1', [
      'active',
      'no-account',
      'probation',
    ]);
    expect(result.departments).toEqual([
      { id: 'dept-empty', name: 'Empty department' },
      { id: 'dept-1', name: 'Production' },
    ]);
    expect(result.people.map((person) => person.id)).toEqual([
      'active',
      'no-account',
      'probation',
    ]);
    expect(
      result.people.every((person) => person.departmentId === 'dept-1'),
    ).toBe(true);
    expect(
      result.people.find((person) => person.id === 'no-account'),
    ).toMatchObject({ userId: null, role: 'EMPLOYEE' });
    expect(result.teams).toEqual([
      {
        id: 'dept-1:Packaging  A',
        name: 'Packaging  A',
        departmentId: 'dept-1',
        memberIds: ['active', 'no-account', 'probation'],
      },
    ]);
  });

  test('reads display names and titles from the shared provider without inferring roles from them', async () => {
    const { service, data, records } = fixture();
    data.members[0].name = 'Asha Jane Patel';
    data.members[0].jobTitle = 'Managing Director';
    records[0].role = 'EMPLOYEE';
    data.units[1].lead = {
      employeeId: 'active',
      name: 'Asha Jane Patel',
      jobTitle: 'Managing Director',
      avatarUrl: null,
      basis: 'INFERRED_FROM_REPORTING',
    };
    const result = await service.getDirectory('org-1');
    expect(
      result.people.find((person) => person.id === 'active'),
    ).toMatchObject({
      name: 'Asha Jane Patel',
      position: 'Managing Director',
      role: 'EMPLOYEE',
    });
  });

  test('does not include people removed from the identity source or extra unrelated identities', async () => {
    const { service, metadata } = fixture();
    metadata.getPeopleMetadata.mockResolvedValue([
      identity('active'),
      identity('foreign'),
    ]);
    const result = await service.getDirectory('org-1');
    expect(result.people.map((person) => person.id)).toEqual(['active']);
    expect(result.teams[0].memberIds).toEqual(['active']);
  });

  test('rejects a department transfer instead of combining a new role with an old department', async () => {
    const { service, records } = fixture();
    records[0].departmentId = 'dept-empty';
    records[0].role = 'HOD';
    await expect(service.getDirectory('org-1')).rejects.toThrow(
      'employee department changed',
    );
  });

  test('retains employees with no department without making up a team', async () => {
    const { service, data, records } = fixture();
    data.members[0].unitId = 'company';
    records[0].departmentId = null;
    const result = await service.getDirectory('org-1');
    expect(
      result.people.find((person) => person.id === 'active')?.departmentId,
    ).toBeNull();
    expect(result.teams[0].memberIds).not.toContain('active');
  });

  test.each(['foreign-company', 'sample'] as const)(
    'rejects %s structure data before requesting account metadata',
    async (kind) => {
      const { service, data, metadata } = fixture();
      if (kind === 'foreign-company') data.company.id = 'org-2';
      else data.source.kind = 'SAMPLE';
      await expect(service.getDirectory('org-1')).rejects.toThrow(
        'live records for this company',
      );
      await expect(service.departmentExists('org-1', 'dept-1')).rejects.toThrow(
        'live records for this company',
      );
      expect(metadata.getPeopleMetadata).not.toHaveBeenCalled();
    },
  );

  test('supports an empty directory without fabricating a source update date', async () => {
    const { service, data } = fixture();
    data.units = [];
    data.members = [];
    const result = await service.getDirectory('org-1');
    expect(result).toMatchObject({
      departments: [],
      people: [],
      teams: [],
      sourceUpdatedAt: undefined,
    });
    expect(result.refreshedAt).toBeDefined();
  });

  test('uses record update dates rather than the structure fetch time', async () => {
    const { service, records } = fixture();
    records[1].updatedAt = '2026-11-03T12:00:00Z';
    const result = await service.getDirectory('org-1');
    expect(result.sourceUpdatedAt).toBe('2026-11-03T12:00:00.000Z');
    expect(result.source).toContain('Shared core directory');
  });

  test('only accepts stable department identities and passes scoped identity lookups to the source', async () => {
    const { service, metadata } = fixture();
    await expect(service.departmentExists('org-1', 'dept-1')).resolves.toBe(
      true,
    );
    await expect(service.departmentExists('org-1', 'dept-north')).resolves.toBe(
      false,
    );
    await expect(service.departmentExists('org-1', 'missing')).resolves.toBe(
      false,
    );
    await expect(
      service.findEligibleEmployee('org-1', 'active'),
    ).resolves.toMatchObject({ reportingManagerId: 'hod' });
    expect(metadata.findEligibleEmployee).toHaveBeenCalledWith(
      'org-1',
      'active',
    );
    await expect(service.getAccountName('org-1', 'user-active')).resolves.toBe(
      'Account name',
    );
    expect(metadata.getAccountName).toHaveBeenCalledWith(
      'org-1',
      'user-active',
    );
    await expect(service.getTimeZone('org-1')).resolves.toBe('Africa/Nairobi');
  });
});
