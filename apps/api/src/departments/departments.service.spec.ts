import 'reflect-metadata';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { DepartmentsService } from './departments.service';
import { PrismaService } from '../prisma/prisma.service';

describe('Department isolation', () => {
  const own = { id: 'dept-one', organizationId: 'org-one', name: 'Finance', _count: { employees: 0, suggestions: 0 } };
  const other = { ...own, id: 'dept-two', organizationId: 'org-two' };
  let department: { findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock; update: jest.Mock; delete: jest.Mock };
  let service: DepartmentsService;
  beforeEach(() => {
    department = {
      // Return records according to the supplied filters, including a real
      // other-company fixture so omitting the organization filter fails tests.
      findFirst: jest.fn().mockImplementation(async ({ where }) =>
        [own, other].find(row => row.id === where.id &&
          (where.organizationId === undefined || row.organizationId === where.organizationId)) ?? null),
      findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(),
    };
    service = new DepartmentsService({ department } as unknown as PrismaService);
  });

  it('reads its own department', async () => {
    await expect(service.getDepartmentById(own.id, own.organizationId)).resolves.toEqual(own);
  });

  it.each(['dept-two', 'missing'])('hides inaccessible department %s for reads and writes', async (id) => {
    await expect(service.getDepartmentById(id, 'org-one')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.updateDepartment(id, 'Changed', 'org-one')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.deleteDepartment(id, 'org-one')).rejects.toBeInstanceOf(NotFoundException);
    expect(department.update).not.toHaveBeenCalled();
    expect(department.delete).not.toHaveBeenCalled();
  });

  it('retains organization filters on the actual update and delete', async () => {
    await service.updateDepartment(own.id, ' Renamed ', own.organizationId);
    await service.deleteDepartment(own.id, own.organizationId);
    expect(department.update).toHaveBeenCalledWith({ where: { id: own.id, organizationId: own.organizationId }, data: { name: 'Renamed' } });
    expect(department.delete).toHaveBeenCalledWith({ where: { id: own.id, organizationId: own.organizationId } });
  });

  it.each(['employees', 'suggestions'])('preserves the deletion conflict for linked %s', async (relation) => {
    department.findFirst.mockResolvedValue({ ...own, _count: { ...own._count, [relation]: 1 } });
    await expect(service.deleteDepartment(own.id, own.organizationId)).rejects.toBeInstanceOf(ConflictException);
    expect(department.delete).not.toHaveBeenCalled();
  });

  it('scopes creation and listing', async () => {
    await service.createDepartment('Finance', own.organizationId);
    await service.getDepartments(own.organizationId);
    expect(department.create).toHaveBeenCalledWith({ data: { name: 'Finance', organizationId: own.organizationId } });
    expect(department.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: own.organizationId } }));
  });
});
