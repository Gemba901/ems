import { ActivityScope, TaskFrequency } from 'db';
import { DwmsService } from '../dwms.service';

describe('DWMS scoped activity ingestion', () => {
  const prisma = {
    employee: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    activity: {
      findFirst: jest.fn(),
    },
    department: {
      findMany: jest.fn(),
    },
  };
  const notifications = { createMany: jest.fn() };
  let service: DwmsService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.employee.findFirst.mockResolvedValue({ id: 'uploader' });
    prisma.activity.findFirst.mockResolvedValue(null);
    prisma.employee.findMany.mockResolvedValue([
      { id: 'employee-1', employeeCode: 'EMP-001' },
      { id: 'employee-2', employeeCode: 'EMP-002' },
    ]);
    service = new DwmsService(prisma as never, notifications as never);
  });

  const activity = {
    scope: ActivityScope.ORGANISATION,
    scopeTarget: 'NA',
    code: 'ORG-001',
    name: 'Daily workplace check',
    workMethod: 'Follow the approved checklist',
    frequency: TaskFrequency.DAILY,
    completionDeadline: 0.5,
    completionOutput: 'Completed checklist',
    remarks: 'Report abnormalities',
  };

  it('previews an organisation row without writing and reports active matches', async () => {
    const result = await service.previewActivityIngestion(
      { userId: 'user-1', organizationId: 'org-1', roleLevel: 'ADMIN' },
      { rows: [{ rowNumber: 2, activity }] },
    );

    expect(result).toMatchObject({ count: 1, valid: 1, failed: 0 });
    expect(result.results[0]).toMatchObject({
      valid: true,
      matchedEmployees: 2,
      scope: ActivityScope.ORGANISATION,
    });
    expect(notifications.createMany).not.toHaveBeenCalled();
  });

  it('rejects parent codes outside Employee scope during preview', async () => {
    const result = await service.previewActivityIngestion(
      { userId: 'user-1', organizationId: 'org-1', roleLevel: 'ADMIN' },
      {
        rows: [
          {
            rowNumber: 2,
            parentActivityCode: 'PARENT-1',
            activity,
          },
        ],
      },
    );

    expect(result).toMatchObject({ count: 1, valid: 0, failed: 1 });
    expect(result.results[0].message).toContain('Employee scope');
  });

  it('allows a job title with no current active employee', async () => {
    prisma.employee.findMany.mockResolvedValue([]);
    const result = await service.previewActivityIngestion(
      { userId: 'user-1', organizationId: 'org-1', roleLevel: 'ADMIN' },
      {
        rows: [
          {
            rowNumber: 2,
            activity: {
              ...activity,
              code: 'JOB-001',
              scope: ActivityScope.JOB_TITLE,
              scopeTarget: 'Shift Supervisor',
            },
          },
        ],
      },
    );

    expect(result).toMatchObject({ valid: 1, failed: 0 });
    expect(result.results[0].matchedEmployees).toBe(0);
  });
});
