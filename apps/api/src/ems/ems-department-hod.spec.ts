import 'reflect-metadata';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { departmentHodChoices, saveDepartmentBranchHod } from './ems-department-hod';
import { UpdateDepartmentBranchHodDto } from './dto/department-hod.dto';
import { loadPeopleLinks } from './ems-people-links';

jest.mock('./ems-people-links', () => ({ loadPeopleLinks: jest.fn() }));

const person = (id: string, branch: string, extra: object = {}) => ({ target: `employee:${id}`, employeeId: id, name: `Person ${id}`,
  designation: 'Manager', employeeCode: id.toUpperCase(), department: 'Production', branch, ...extra });

function fixture() {
  const state = { assignments: [] as any[] };
  const employees = [
    { id: 'e1', departmentId: 'prod', plantBranch: 'North' }, { id: 'e2', departmentId: 'prod', plantBranch: 'North' },
    { id: 'e3', departmentId: 'prod', plantBranch: ' north ' }, { id: 'e4', departmentId: 'other', plantBranch: 'South' },
  ];
  const options = [person('e1', 'North'), person('e2', 'North'), person('e3', 'north'), person('e4', 'South'),
    { target: 'record:r1', recordId: 'r1', batchId: 'b1', name: 'Pending Person', designation: 'Lead', employeeCode: '', department: 'Production', branch: 'North' }];
  (loadPeopleLinks as jest.Mock).mockImplementation(async () => ({
    employees, departments: [{ id: 'prod', name: 'Production' }, { id: 'other', name: 'Other' }], assignments: state.assignments,
    records: [], allOptions: options, hodDirectory: [], recordedSuggestions: new Map([[JSON.stringify(['prod', 'north']), [options[1]]]]),
  }));
  const db: any = {
    $transaction: jest.fn(async (cb: any) => cb(db)),
    $queryRaw: jest.fn(async () => []),
    emsDepartmentHod: { upsert: jest.fn(async ({ create, update }: any) => {
      const current = state.assignments.find(a => a.departmentId === create.departmentId && a.branchKey === create.branchKey);
      if (current) Object.assign(current, update); else state.assignments.push({ id: 'h1', ...create });
    }) },
  };
  return { db, state };
}

describe('Departments: choose a HOD for one department and branch', () => {
  it('offers registered employees only, names the branch by its most used spelling, and suggests recorded HODs', async () => {
    const { db } = fixture();
    const result = await departmentHodChoices(db, 'one', 'prod', { branch: 'north' });
    expect(result.hodOptions.every(p => p.target.startsWith('employee:'))).toBe(true);
    expect(result).toMatchObject({ departmentName: 'Production', branchKey: 'north', branchLabel: 'North', hasHodAssignment: false, hod: { state: 'UNASSIGNED' } });
    expect(result.recordedHodSuggestions.map(p => p.target)).toEqual(['employee:e2']);
    expect(result.hodVersion).toBe(JSON.stringify([JSON.stringify(['prod', 'north']), null]));
  });

  it('refuses an untidy branch, a branch the department does not have, and another company’s department', async () => {
    const { db } = fixture();
    await expect(departmentHodChoices(db, 'one', 'prod', { branch: ' North' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(departmentHodChoices(db, 'one', 'prod', { branch: ['north'] })).rejects.toBeInstanceOf(BadRequestException);
    await expect(departmentHodChoices(db, 'one', 'prod', { branch: 'south' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(departmentHodChoices(db, 'one', 'elsewhere', { branch: 'north' })).rejects.toThrow('Department not found');
    await expect(departmentHodChoices(db, '', 'prod', { branch: 'north' })).rejects.toThrow('Company context');
  });

  it('saves an employee under the company lock, then keeps the revision for the same choice and bumps it for a new one', async () => {
    const { db, state } = fixture();
    let view = await departmentHodChoices(db, 'one', 'prod', { branch: 'north' });
    view = await saveDepartmentBranchHod(db, 'one', 'prod', { branch: 'north', target: 'employee:e1', expectedVersion: view.hodVersion }, 'hr-user');
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    expect(state.assignments[0]).toMatchObject({ departmentId: 'prod', branchKey: 'north', branchLabel: 'North', employeeId: 'e1',
      pendingRecordId: null, isUnassigned: false, revision: 1, updatedByUserId: 'hr-user' });
    expect(view).toMatchObject({ hasHodAssignment: true, hod: { state: 'ASSIGNED', target: 'employee:e1' } });
    view = await saveDepartmentBranchHod(db, 'one', 'prod', { branch: 'north', target: 'employee:e1', expectedVersion: view.hodVersion }, 'hr-user');
    expect(state.assignments[0].revision).toBe(1);
    await saveDepartmentBranchHod(db, 'one', 'prod', { branch: 'north', target: 'NONE', expectedVersion: view.hodVersion }, 'hr-user');
    expect(state.assignments[0]).toMatchObject({ employeeId: null, isUnassigned: true, revision: 2 });
  });

  it('refuses a stale version, import records, unknown people and a missing reviewer', async () => {
    const { db, state } = fixture();
    const { hodVersion } = await departmentHodChoices(db, 'one', 'prod', { branch: 'north' });
    await expect(saveDepartmentBranchHod(db, 'one', 'prod', { branch: 'north', target: 'employee:e1', expectedVersion: 'old' }, 'hr')).rejects.toBeInstanceOf(ConflictException);
    await expect(saveDepartmentBranchHod(db, 'one', 'prod', { branch: 'north', target: 'record:r1', expectedVersion: hodVersion }, 'hr')).rejects.toThrow(/existing employee/);
    await expect(saveDepartmentBranchHod(db, 'one', 'prod', { branch: 'north', target: 'employee:nobody', expectedVersion: hodVersion }, 'hr')).rejects.toThrow(/existing employee/);
    await expect(saveDepartmentBranchHod(db, 'one', 'prod', { branch: 'north', target: 'employee:e1', expectedVersion: hodVersion }, '')).rejects.toThrow(/authenticated/);
    expect(state.assignments).toEqual([]);
  });

  it('validates the request body', () => {
    const check = (body: object) => validateSync(plainToInstance(UpdateDepartmentBranchHodDto, body)).length;
    expect(check({ branch: 'north', target: 'employee:e1', expectedVersion: 'v' })).toBe(0);
    expect(check({ branch: '', target: 'NONE', expectedVersion: 'v' })).toBe(0);
    expect(check({ branch: 'north', target: 'record:r1', expectedVersion: 'v' })).toBeGreaterThan(0);
    expect(check({ branch: 'north', target: 'BOARD', expectedVersion: 'v' })).toBeGreaterThan(0);
  });
});
