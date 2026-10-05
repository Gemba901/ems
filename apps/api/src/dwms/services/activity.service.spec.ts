import { ActivityScope, ActivityStatus, TaskFrequency, TaskStatus } from 'db';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
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

  it('persists 500 ingestion row payloads atomically before returning', async () => {
    const queued = {
      id: 'ingestion-1',
      organizationId: 'org-1',
      uploadedById: 'uploader',
      fileName: 'activities.csv',
      status: 'QUEUED',
      totalRows: 500,
      successfulRows: 0,
      failedRows: 0,
      attempts: 0,
      availableAt: new Date(),
      createdAt: new Date(),
      completedAt: null,
      uploadedBy: {
        id: 'uploader',
        firstName: 'Upload',
        lastName: 'Owner',
        email: 'owner@example.com',
      },
    };
    const tx = {
      activityIngestion: {
        create: jest.fn().mockResolvedValue(queued),
        findUniqueOrThrow: jest.fn().mockResolvedValue(queued),
      },
      activityIngestionRow: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const enqueuePrisma = {
      employee: { findFirst: jest.fn().mockResolvedValue({ id: 'uploader' }) },
      $transaction: jest.fn((work) => work(tx)),
    };
    const enqueueService = new DwmsService(
      enqueuePrisma as never,
      notifications as never,
    );

    const rows = Array.from({ length: 500 }, (_, index) => ({
      rowNumber: index + 2,
      activity: { ...activity, code: `ORG-${index + 1}` },
    }));
    const result = await enqueueService.ingestActivities(
      { userId: 'user-1', organizationId: 'org-1', roleLevel: 'ADMIN' },
      { fileName: 'activities.csv', rows },
    );

    expect(result.ingestion).toMatchObject({
      id: 'ingestion-1',
      status: 'QUEUED',
    });
    const createRows = tx.activityIngestionRow.createMany.mock.calls[0][0].data;
    expect(createRows).toHaveLength(500);
    expect(createRows[0]).toEqual(
      expect.objectContaining({
        ingestionId: 'ingestion-1',
        rowNumber: 2,
        status: 'QUEUED',
        payload: rows[0],
        targetActivityId: expect.any(String),
      }),
    );
  });
});

describe('DWMS activity content editing', () => {
  const existingActivity: any = {
    id: 'activity-1',
    organizationId: 'org-1',
    status: ActivityStatus.ACTIVE,
    name: 'Daily workplace check',
    code: 'ORG-001',
    workMethod: 'Old SOP',
    purpose: null,
    startTrigger: null,
    completionOutput: 'Old output',
    evidenceRequired: 'Old checklist',
    remarks: 'Old remarks',
    parentActivityId: 'parent-1',
    parentActivity: { id: 'parent-1', name: 'Parent', status: ActivityStatus.ACTIVE },
  };

  function createEditService(activity = existingActivity) {
    const tx = {
      activity: {
        update: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ ...activity, ...data }),
        ),
      },
      task: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      taskInstance: { updateMany: jest.fn().mockResolvedValue({ count: 6 }) },
    };
    const prisma = {
      employee: { findFirst: jest.fn().mockResolvedValue({ id: 'editor-1' }) },
      organization: {
        findUnique: jest.fn().mockResolvedValue({ timeZone: 'Asia/Kolkata' }),
      },
      activity: { findFirst: jest.fn().mockResolvedValue(activity) },
      $transaction: jest.fn((work) => work(tx)),
    };
    return {
      service: new DwmsService(prisma as never, { createMany: jest.fn() } as never),
      prisma,
      tx,
    };
  }

  const editor = {
    userId: 'user-1',
    organizationId: 'org-1',
    roleLevel: 'ADMIN',
  };

  it('updates activity content and only untouched future pending snapshots', async () => {
    const { service, tx } = createEditService();

    const result = await service.updateActivity(editor, 'activity-1', {
      workMethod: ' New SOP ',
      purpose: ' Prevent defects ',
      startTrigger: ' Shift start ',
      completionOutput: ' Signed checklist ',
      evidenceRequired: ' Inspection report ',
      remarks: ' Escalate abnormalities ',
    });

    expect(tx.activity.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'activity-1' },
        data: expect.objectContaining({
          workMethod: 'New SOP',
          completionOutput: 'Signed checklist',
          evidenceRequired: 'Inspection report',
        }),
      }),
    );
    expect(tx.task.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { activityId: 'activity-1', isAdhoc: false },
        data: expect.objectContaining({
          description: expect.stringContaining('Expected output:\nSigned checklist'),
          requiresCompletionDocument: true,
          completionDocumentName: 'Inspection report',
        }),
      }),
    );
    expect(tx.taskInstance.updateMany).toHaveBeenCalledWith({
      where: {
        task: { activityId: 'activity-1', isAdhoc: false },
        scheduledFor: { gte: expect.any(Date) },
        status: TaskStatus.PENDING,
        completionPercent: 0,
      },
      data: expect.objectContaining({
        requiresDocumentSnapshot: true,
        documentNameSnapshot: 'Inspection report',
      }),
    });
    expect(result).toMatchObject({
      updatedTaskDefinitions: 2,
      updatedFutureTasks: 6,
      activity: { parentActivityId: 'parent-1' },
    });
  });

  it('does not allow HOD users to edit activity content', async () => {
    const { service, prisma } = createEditService();

    await expect(
      service.updateActivity(
        { ...editor, roleLevel: 'HOD' },
        'activity-1',
        { workMethod: 'New SOP' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.activity.findFirst).not.toHaveBeenCalled();
  });

  it('keeps archived activities read-only', async () => {
    const { service } = createEditService({
      ...existingActivity,
      status: ActivityStatus.ARCHIVED,
    });

    await expect(
      service.updateActivity(editor, 'activity-1', { workMethod: 'New SOP' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
