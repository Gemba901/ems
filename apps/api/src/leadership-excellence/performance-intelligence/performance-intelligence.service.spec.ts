import { ConflictException } from '@nestjs/common';
import { emptyExecutionState } from '../execution/execution.projection';
import type { ExecutionView } from '../execution/execution.types';
import type { PlanningView } from '../performance-planning/planning.types';
import { PerformanceIntelligenceService } from './performance-intelligence.service';
import type { AccessTokenPayload } from '../../auth/access-token-payload';
import { Role } from '../../common/enum/role.enum';

jest.mock('../execution/execution.service', () => ({
  ExecutionService: class {},
}));
jest.mock('../performance-planning/performance-planning.service', () => ({
  PerformancePlanningService: class {},
}));

const user: AccessTokenPayload = {
  tokenType: 'ACCESS',
  userId: 'user-a',
  organizationId: 'tenant-a',
  roleId: 1,
  roleLevel: Role.EMPLOYEE,
  email: null,
  isAdminOrg: false,
};
const actor = {
  userId: 'user-a',
  employeeId: 'employee-a',
  departmentId: 'dept-a',
  name: 'Employee A',
  role: 'EMPLOYEE',
};
function setup() {
  const view: ExecutionView = {
    ...emptyExecutionState(),
    revision: 2,
    planningRevision: 3,
    today: '2026-11-23',
    actor,
    canViewDepartment: false,
    references: { departments: [], people: [] },
    goals: [],
    assignments: [],
    actions: [],
  };
  const plan: PlanningView = {
    revision: 3,
    actor,
    documents: [],
    kras: [],
    definitions: [],
    sharedActions: [],
    references: { departments: [], people: [], pillars: [], teams: [] },
  };
  const execution = { getWorkspace: jest.fn().mockResolvedValue(view) };
  const planning = { getWorkspace: jest.fn().mockResolvedValue(plan) };
  const service = new PerformanceIntelligenceService(
    execution as never,
    planning as never,
  );
  return { view, plan, execution, planning, service };
}

describe('Area 07 read-only report service', () => {
  test('passes the same authenticated tenant/user to both authorised source services', async () => {
    const { service, execution, planning } = setup();
    const report = await service.getReport(user, { cycle: '2026' });
    expect(execution.getWorkspace).toHaveBeenCalledWith(user);
    expect(planning.getWorkspace).toHaveBeenCalledWith(user);
    expect(report.filters).toEqual({ cycle: '2026', scope: 'MY' });
    const other = { ...user, organizationId: 'tenant-b', userId: 'user-b' };
    await service.getReport(other);
    expect(execution.getWorkspace).toHaveBeenLastCalledWith(other);
    expect(planning.getWorkspace).toHaveBeenLastCalledWith(other);
    expect(Object.keys(execution)).toEqual(['getWorkspace']);
    expect(Object.keys(planning)).toEqual(['getWorkspace']);
  });

  test('retries a concurrent approval once and refuses mixed planning revisions', async () => {
    const { service, plan, planning } = setup();
    planning.getWorkspace
      .mockResolvedValueOnce({ ...plan, revision: 2 })
      .mockResolvedValueOnce(plan);
    expect((await service.getReport(user)).revisions.planning).toBe(3);
    expect(planning.getWorkspace).toHaveBeenCalledTimes(2);
    planning.getWorkspace.mockResolvedValue({ ...plan, revision: 9 });
    await expect(service.getReport(user)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  test('exports through the same filtered report rather than retrieving a second source dataset', async () => {
    const { service, execution, planning } = setup();
    const filters = { startDate: '2026-01-01', endDate: '2026-12-31' };
    const spy = jest.spyOn(service, 'getReport');
    const csv = await service.exportCsv(user, filters);
    expect(spy).toHaveBeenCalledWith(user, filters);
    expect(csv).toContain('"Filter: startDate","2026-01-01"');
    expect(execution.getWorkspace).toHaveBeenCalledTimes(1);
    expect(planning.getWorkspace).toHaveBeenCalledTimes(1);
  });

  test('propagates source permission and tenant failures instead of exporting partial or broad data', async () => {
    const { service, execution } = setup();
    execution.getWorkspace.mockRejectedValue(
      new Error('Tenant not authorised'),
    );
    await expect(service.exportCsv(user)).rejects.toThrow(
      'Tenant not authorised',
    );
  });
});
