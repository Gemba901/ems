import { NotFoundException } from '@nestjs/common';
import { EmsService } from './ems.service';

describe('EMS employee import provenance', () => {
  function fixture(source: unknown = null) {
    const employee = { id: 'employee', employeeCode: 'EMP-012', firstName: 'Test', lastName: 'Person' };
    const db = {
      employee: { findFirst: jest.fn().mockResolvedValue(employee) },
      emsOnboardingRecord: { findFirst: jest.fn().mockResolvedValue(source) },
    };
    return { db, employee, service: new EmsService(db as never) };
  }

  it('returns the source batch and imported row with the existing employee code', async () => {
    const registeredAt = new Date('2026-10-14T12:00:00Z');
    const importedAt = new Date('2026-10-13T08:00:00Z');
    const f = fixture({ id: 'source-row', rowNumber: 8, registeredAt, batch: { id: 'batch', label: 'October intake', sourceFileName: 'employees.xlsx', createdAt: importedAt } });
    const result = await f.service.getEmployeeById('employee', 'org');
    expect(result.employee.employeeCode).toBe('EMP-012');
    expect(result.sourceImport).toEqual({ recordId: 'source-row', importedAt, batchId: 'batch', label: 'October intake', sourceFileName: 'employees.xlsx', rowNumber: 8, registeredAt });
    expect(result.completion).toEqual(expect.objectContaining({ overall: expect.any(Number), groups: expect.any(Object) }));
  });

  it('scopes both employee lookup and the source record/batch to the organisation', async () => {
    const f = fixture();
    await f.service.getEmployeeById('employee', 'org');
    expect(f.db.employee.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'employee', organizationId: 'org' } }));
    expect(f.db.emsOnboardingRecord.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { employeeId: 'employee', organizationId: 'org', status: 'REGISTERED', batch: { organizationId: 'org' } },
    }));
  });

  it('returns null when no import provenance is recorded', async () => {
    const f = fixture();
    const result = await f.service.getEmployeeById('employee', 'org');
    expect(result.sourceImport).toBeNull();
    expect(result.employee).toBe(f.employee);
  });

  it('does not look up provenance for a missing or inaccessible employee', async () => {
    const f = fixture();
    f.db.employee.findFirst.mockResolvedValueOnce(null);
    await expect(f.service.getEmployeeById('employee', 'other-org')).rejects.toBeInstanceOf(NotFoundException);
    expect(f.db.emsOnboardingRecord.findFirst).not.toHaveBeenCalled();
  });

  it('propagates a failed source lookup instead of claiming there was no import', async () => {
    const f = fixture();
    f.db.emsOnboardingRecord.findFirst.mockRejectedValueOnce(new Error('Database unavailable'));
    await expect(f.service.getEmployeeById('employee', 'org')).rejects.toThrow('Database unavailable');
  });
});
