import 'reflect-metadata';
import { departmentDirectory, departmentPeople } from './ems-department-directory';
import { EmsDepartmentDirectoryController } from './ems-department-directory.controller';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { GUARDS_METADATA } from '@nestjs/common/constants';

function fixture() {
  const person = { id: 'hod', organizationId: 'one', firstName: 'Jane', middleName: null, lastName: 'Test', employeeCode: 'E1', jobTitle: 'Manager', employmentStatus: 'ACTIVE' };
  const assignment = { id: 'assignment', branchKey: 'north', branchLabel: 'North', isUnassigned: false, employeeId: 'hod', pendingRecordId: null, revision: 1, employee: person, pendingRecord: null };
  const departments = [{ id: 'production', name: 'Production', hodAssignments: [assignment] }, { id: 'empty', name: 'Empty', hodAssignments: [] }];
  const groups = [
    { departmentId: 'production', plantBranch: 'North', employmentStatus: 'ACTIVE', _count: { _all: 4 } },
    { departmentId: 'production', plantBranch: ' north ', employmentStatus: 'PROBATION', _count: { _all: 1 } },
    { departmentId: 'production', plantBranch: null, employmentStatus: 'RETIRED', _count: { _all: 2 } },
    { departmentId: null, plantBranch: 'North', employmentStatus: 'ACTIVE', _count: { _all: 1 } },
    { departmentId: 'foreign', plantBranch: 'North', employmentStatus: 'ACTIVE', _count: { _all: 1 } },
  ];
  const db: any = {
    department: { findMany: jest.fn(async () => departments), findFirst: jest.fn(async () => ({ id: 'production', name: 'Production' })) },
    employee: { groupBy: jest.fn(async () => groups), count: jest.fn(async () => 7), findMany: jest.fn(async () => [person]) },
    $transaction: jest.fn(async cb => cb(db)),
  };
  return { db, person, assignment, departments, groups };
}

describe('EMS department directory', () => {
  it('counts active/probation together, preserves empty departments and includes unassigned employees separately', async () => {
    const f = fixture(); const result = await departmentDirectory(f.db, 'one');
    expect(result.counts).toEqual({ total: 9, active: 7, inactive: 2, unassigned: 2 });
    expect(result.departments[0]).toMatchObject({ total: 7, active: 5, inactive: 2 });
    expect(result.departments[0].branches.find(b => b.key === 'north')).toMatchObject({ total: 5, hod: { state: 'ASSIGNED', person: { id: 'hod' } } });
    expect(result.departments[1]).toMatchObject({ total: 0, branches: [] });
    expect(f.db.department.findMany.mock.calls[0][0].where).toEqual({ organizationId: 'one' });
    expect(f.db.employee.groupBy.mock.calls[0][0].where).toEqual({ organizationId: 'one' });
  });
  it('shows confirmed HOD scopes even without employees in that branch', async () => {
    const f = fixture(); f.assignment.branchKey = 'south'; f.assignment.branchLabel = 'South';
    const result = await departmentDirectory(f.db, 'one');
    expect(result.departments[0].branches.find(b => b.key === 'south')).toMatchObject({ total: 0, hod: { state: 'ASSIGNED' } });
    expect(result.departments[0].branches.find(b => b.key === 'north')?.hod.state).toBe('NOT_RECORDED');
  });
  it('never exposes an inconsistent cross-company HOD relation', async () => {
    const f = fixture(); f.person.organizationId = 'other';
    const result = await departmentDirectory(f.db, 'one');
    expect(result.departments[0].branches.find(b => b.key === 'north')?.hod).toEqual({ state: 'NEEDS_ATTENTION', person: null });
  });
  it('shows an inactive confirmed HOD as needing review', async () => {
    const f = fixture(); f.person.employmentStatus = 'TERMINATED';
    const result = await departmentDirectory(f.db, 'one');
    expect(result.departments[0].branches.find(b => b.key === 'north')?.hod.state).toBe('NEEDS_ATTENTION');
  });
  it('distinguishes a pending import HOD from an explicit unassigned decision', async () => {
    const f = fixture(); const assignment: any = f.assignment;
    assignment.employee = null; assignment.pendingRecordId = 'record';
    assignment.pendingRecord = { id: 'record', organizationId: 'one', batchId: 'batch', status: 'READY', firstName: 'Future', lastName: 'Hod', employeeCode: 'R1', jobDesignation: 'Lead', batch: { status: 'READY' } };
    let result = await departmentDirectory(f.db, 'one');
    expect(result.departments[0].branches.find(b => b.key === 'north')?.hod).toMatchObject({ state: 'PENDING', person: { id: null, name: 'Future Hod' } });
    assignment.pendingRecord.batch.status = 'CANCELLED';
    result = await departmentDirectory(f.db, 'one');
    expect(result.departments[0].branches.find(b => b.key === 'north')?.hod).toEqual({ state: 'NEEDS_ATTENTION', person: null });
    assignment.isUnassigned = true;
    result = await departmentDirectory(f.db, 'one');
    expect(result.departments[0].branches.find(b => b.key === 'north')?.hod.state).toBe('UNASSIGNED');
  });
  it('rejects missing company context before any database query', async () => {
    const { db } = fixture();
    await expect(departmentDirectory(db, '')).rejects.toThrow('Company context');
    await expect(departmentPeople(db, '', 'production', {})).rejects.toThrow('Company context');
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('rejects a department absent from the current company before reading people', async () => {
    const { db } = fixture(); db.department.findFirst.mockResolvedValueOnce(null);
    await expect(departmentPeople(db, 'one', 'foreign', {})).rejects.toThrow('Department not found');
    expect(db.department.findFirst).toHaveBeenCalledWith({ where: { id: 'foreign', organizationId: 'one' }, select: { id: true, name: true } });
    expect(db.employee.findMany).not.toHaveBeenCalled();
  });
  it('paginates people and applies all filters within the company and department', async () => {
    const { db } = fixture();
    db.employee.groupBy.mockResolvedValueOnce([{ plantBranch: 'North' }, { plantBranch: ' north ' }]);
    const result = await departmentPeople(db, 'one', 'production', { page: '2', branch: 'north', activity: 'ACTIVE', search: 'Jane Test' });
    expect(db.employee.findMany.mock.calls[0][0]).toMatchObject({ skip: 25, take: 25, where: { organizationId: 'one', departmentId: 'production', employmentStatus: { in: ['ACTIVE', 'PROBATION'] }, OR: [{ plantBranch: 'North' }, { plantBranch: ' north ' }] } });
    expect(result.data[0]).not.toHaveProperty('organizationId');
    expect(result.data[0]).not.toHaveProperty('phone');
    expect(result.pagination).toEqual({ page: 2, limit: 25, total: 7, pages: 1 });
  });
  it.each([{ page: '0' }, { page: ['1'] }, { search: {} }, { activity: 'ALL' }, { branch: ['north'] }])('rejects malformed query %j', async query => {
    const { db } = fixture(); await expect(departmentPeople(db, 'one', 'production', query)).rejects.toThrow();
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('an unknown selected branch yields no people instead of dropping the filter', async () => {
    const { db } = fixture(); const result = await departmentPeople(db, 'one', 'production', { branch: 'unknown' });
    expect(result.data).toEqual([]); expect(db.employee.findMany).not.toHaveBeenCalled();
  });
  it('requires role checks and trusted context on the controller', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, EmsDepartmentDirectoryController)).toContain(RolesGuard);
    const { db } = fixture(); const controller = new EmsDepartmentDirectoryController(db);
    expect(() => controller.list({} as any)).toThrow('Company context');
  });
});
