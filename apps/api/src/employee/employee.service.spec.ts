import 'reflect-metadata';
import { EmployeeService } from './employee.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { ForbiddenException } from '@nestjs/common';

// These tests inspect the database boundary as well as rejection behavior.
describe('Employee company isolation', () => {
  const employee = { id: 'employee-one', userId: 'user-one', organizationId: 'org-one' };
  let db: any;
  let auth: any;
  let service: EmployeeService;
  beforeEach(() => {
    db = {
      employee: { findFirst: jest.fn().mockResolvedValue(employee), findMany: jest.fn(), count: jest.fn(), update: jest.fn() },
      department: { findFirst: jest.fn().mockResolvedValue(null) },
      user: { update: jest.fn() },
      userOrganization: { count: jest.fn().mockResolvedValue(2) },
      $transaction: jest.fn(),
    };
    auth = { generateTempPassword: jest.fn() };
    service = new EmployeeService(db as PrismaService, auth as AuthService);
  });

  it('scopes record lookup and excludes password hashes and other memberships', async () => {
    await service.getEmployeeById(employee.id, employee.organizationId);
    expect(db.employee.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: employee.id, organizationId: employee.organizationId },
      include: expect.objectContaining({ user: {
        omit: { password: true },
        include: { organizations: { where: { organizationId: employee.organizationId }, include: { role: true } } },
      } }),
    }));
  });

  it('rejects unknown or foreign employee IDs before mutation', async () => {
    db.employee.findFirst.mockResolvedValue(null);
    await expect(service.getEmployeeById('foreign', 'org-one')).rejects.toThrow();
    await expect(service.updateEmployee('foreign', { firstName: 'New' }, 'org-one')).rejects.toThrow();
    await expect(service.deleteEmployee('foreign', 'org-one')).rejects.toThrow();
    await expect(service.updateAvatar('foreign', 'url', 'org-one', 'user-one', 'ADMIN')).rejects.toThrow();
    expect(db.employee.update).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
    for (const [args] of db.employee.findFirst.mock.calls) expect(args.where.organizationId).toBe('org-one');
  });

  it('rejects assigning an employee to a foreign department', async () => {
    await expect(service.updateEmployee(employee.id, { departmentId: 'foreign' }, 'org-one')).rejects.toThrow();
    expect(db.department.findFirst).toHaveBeenCalledWith({ where: { id: 'foreign', organizationId: 'org-one' }, select: { id: true } });
    expect(db.employee.update).not.toHaveBeenCalled();
  });

  it('updates company contact data without overwriting the shared login identity', async () => {
    await service.updateEmployee(employee.id, { email: 'new@example.com' }, 'org-one');
    expect(db.employee.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: employee.id, organizationId: 'org-one' } }));
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('does not let a company administrator reset a shared account', async () => {
    await expect(service.resetEmployeePassword(employee.id, 'org-one')).rejects.toBeInstanceOf(ForbiddenException);
    expect(auth.generateTempPassword).not.toHaveBeenCalled();
  });

  it('does not let an employee change a colleague avatar', async () => {
    await expect(service.updateAvatar(employee.id, 'url', 'org-one', 'another-user', 'EMPLOYEE')).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.employee.update).not.toHaveBeenCalled();
  });

  it('scopes department list and count to the company', async () => {
    await service.getEmployeesByDepartment('dept-one', 'org-one');
    await service.countEmployeesByDepartment('dept-one', 'org-one');
    expect(db.employee.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { departmentId: 'dept-one', organizationId: 'org-one' } }));
    expect(db.employee.count).toHaveBeenCalledWith({ where: { departmentId: 'dept-one', organizationId: 'org-one' } });
  });
});
