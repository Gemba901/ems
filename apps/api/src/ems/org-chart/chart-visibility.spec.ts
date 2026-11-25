import { EmsOrgChartService } from './org-chart.service';
import { Role } from 'src/common/enum/role.enum';
const row = (id: string, status: string, manager: string | null = null) => ({
  id,
  firstName: id,
  lastName: 'Person',
  middleName: null,
  employeeCode: 'E-' + id,
  employmentStatus: status,
  reportingManagerId: manager,
  departmentId: null,
  plantBranch: null,
  jobTitle: 'Technician',
  reportsToBoard: false,
  reportingBody: null,
  avatarUrl: null,
  shift: 'Private shift',
  phone: 'private phone',
});
describe('chart employment visibility', () => {
  function setup() {
    const all = [row('one', 'PROBATION', 'two'), row('two', 'SUSPENDED')];
    const tx = {
      $executeRaw: jest.fn(),
      employee: {
        findMany: jest.fn(async ({ where }) =>
          where.employmentStatus
            ? all.filter((p) =>
                where.employmentStatus.in.includes(p.employmentStatus),
              )
            : all,
        ),
      },
      department: { findMany: jest.fn(async () => []) },
    };
    return {
      tx,
      service: new EmsOrgChartService({
        $transaction: jest.fn((fn) => fn(tx)),
      } as any),
    };
  }
  it.each([undefined, Role.EMPLOYEE, Role.HOD])(
    'keeps %s chart reads current-only and removes precise status and shifts',
    async (role) => {
      const { service } = setup();
      const data = await service.read('company', role);
      expect(data.people).toHaveLength(1);
      expect(data.people[0]).toMatchObject({
        id: 'one',
        status: null,
        active: true,
        managerId: null,
      });
      expect(data.capabilities).toEqual({
        employmentDetails: false,
        inactivePeople: false,
      });
      expect(JSON.stringify(data)).not.toMatch(
        /PROBATION|SUSPENDED|Private shift|private phone|MANAGER_INACTIVE/,
      );
      expect(data.issues).toContainEqual({
        employeeId: 'one',
        kind: 'MANAGER_UNAVAILABLE',
      });
    },
  );
  it.each([Role.ADMIN, Role.SUPER_ADMIN, Role.HR, Role.MANAGEMENT])(
    'keeps employment filters for %s without adding shifts or contacts',
    async (role) => {
      const { service } = setup();
      const data = await service.read('company', role);
      expect(data.people.map((p) => p.status)).toEqual([
        'PROBATION',
        'SUSPENDED',
      ]);
      expect(data.capabilities.inactivePeople).toBe(true);
      expect(JSON.stringify(data)).not.toMatch(/Private shift|private phone/);
    },
  );
});
