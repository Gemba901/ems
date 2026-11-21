import { DwmsTaskBridge, DwmsTaskSourceInput } from './dwms-task-bridge.service';

const OWNER = {
  firstName: 'Ann',
  lastName: 'Wanjiru',
  departmentId: 'dept-1',
  organizationId: 'org-1',
  organization: { modules: ['DWMS'], status: 'ACTIVE' },
};

const input: DwmsTaskSourceInput = {
  sourceModule: 'SGA',
  sourceId: 'act-1',
  sourceParentId: 'sga-1',
  sourceRef: 'SGA · Reduce filler jams',
  ownerId: 'emp-1',
  title: 'SGA action: Replace rail',
  frequency: 'PLANNED',
  dueDate: new Date('2026-11-05T10:30:00Z'),
};

function existingTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-1',
    sourceModule: 'SGA',
    sourceId: 'act-1',
    sourceParentId: 'sga-1',
    sourceRef: input.sourceRef,
    title: input.title,
    description: null,
    ownerId: 'emp-1',
    isActive: true,
    status: 'PENDING',
    frequency: 'PLANNED',
    dueDate: new Date('2026-11-05T00:00:00Z'),
    recurrenceUnit: null,
    recurrenceInterval: null,
    recurrenceWeekdays: [],
    recurrenceDayOfMonth: null,
    recurrenceStartsOn: null,
    owner: { organizationId: 'org-1', organization: { timeZone: 'Africa/Nairobi' } },
    ...overrides,
  };
}

function setup({ owner = OWNER as unknown, task = null as unknown, tasks = [] as unknown[], openInstances = [] as unknown[] } = {}) {
  const prisma = {
    employee: { findUnique: jest.fn().mockResolvedValue(owner) },
    task: {
      findUnique: jest.fn().mockResolvedValue(task),
      findUniqueOrThrow: jest.fn(),
      findMany: jest.fn().mockResolvedValue(tasks),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'task-new', ...data })),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...(task as object), ...data })),
    },
    taskInstance: {
      findMany: jest.fn().mockResolvedValue(openInstances),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    taskInstanceEvent: { createMany: jest.fn() },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  const dwms = { refreshTaskInstances: jest.fn().mockResolvedValue(1) };
  const bridge = new DwmsTaskBridge(prisma as never, dwms as never);
  return { bridge, prisma, dwms };
}

describe('DwmsTaskBridge.upsertFromSource', () => {
  it('creates a source-linked task and puts it on the owner list straight away', async () => {
    const { bridge, prisma, dwms } = setup();
    await bridge.upsertFromSource(input);

    const { data } = prisma.task.create.mock.calls[0][0];
    expect(data).toMatchObject({
      sourceModule: 'SGA',
      sourceId: 'act-1',
      sourceParentId: 'sga-1',
      ownerName: 'Ann Wanjiru',
      departmentId: 'dept-1',
      priority: 'MEDIUM',
      dueDate: new Date('2026-11-05T00:00:00Z'),
      recurrenceUnit: null,
    });
    expect(dwms.refreshTaskInstances).toHaveBeenCalledWith('task-new', 'org-1');
  });

  it('does nothing for an organization without DWMS', async () => {
    const { bridge, prisma } = setup({ owner: { ...OWNER, organization: { modules: ['SGA'], status: 'ACTIVE' } } });
    await expect(bridge.upsertFromSource(input)).resolves.toBeNull();
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it('updates in place without touching instances when nothing about the schedule changed', async () => {
    const { bridge, prisma, dwms } = setup({ task: existingTask() });
    await bridge.upsertFromSource(input);

    expect(prisma.task.create).not.toHaveBeenCalled();
    expect(prisma.task.update.mock.calls[0][0].where).toEqual({ id: 'task-1' });
    expect(prisma.taskInstance.deleteMany).not.toHaveBeenCalled();
    expect(dwms.refreshTaskInstances).not.toHaveBeenCalled();
  });

  it('regenerates untouched instances when the owner or due date changes', async () => {
    const { bridge, prisma, dwms } = setup({ task: existingTask({ ownerId: 'emp-old' }) });
    await bridge.upsertFromSource(input);

    const { where } = prisma.taskInstance.deleteMany.mock.calls[0][0];
    expect(where).toMatchObject({ taskId: 'task-1', status: 'PENDING', completionPercent: 0 });
    expect(where.scheduledFor).toBeUndefined();
    expect(dwms.refreshTaskInstances).toHaveBeenCalledWith('task-1', 'org-1');
  });

  it('reactivates a deactivated task but leaves a closed one closed', async () => {
    const inactive = setup({ task: existingTask({ isActive: false }) });
    await inactive.bridge.upsertFromSource(input);
    expect(inactive.prisma.task.update.mock.calls[0][0].data.isActive).toBe(true);

    const closed = setup({ task: existingTask({ status: 'DONE', isActive: false }) });
    await closed.bridge.upsertFromSource(input);
    expect(closed.prisma.task.update.mock.calls[0][0].data.isActive).toBeUndefined();
    expect(closed.dwms.refreshTaskInstances).not.toHaveBeenCalled();
  });
});

describe('DwmsTaskBridge close / reopen / deactivate', () => {
  it('closes every open task of a parent and marks its open instances done', async () => {
    const { bridge, prisma } = setup({
      tasks: [existingTask()],
      openInstances: [{ id: 'inst-1', status: 'IN_PROGRESS' }],
    });
    await bridge.closeFromSource({ sourceModule: 'SGA', sourceParentId: 'sga-1' });

    expect(prisma.task.findMany.mock.calls[0][0].where).toMatchObject({ sourceModule: 'SGA', sourceParentId: 'sga-1' });
    expect(prisma.task.update.mock.calls[0][0].data).toEqual({ status: 'DONE', completionPercent: 100 });
    expect(prisma.taskInstance.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: { in: ['inst-1'] } },
      data: { status: 'DONE', completionPercent: 100 },
    });
    expect(prisma.taskInstanceEvent.createMany.mock.calls[0][0].data[0]).toMatchObject({
      taskInstanceId: 'inst-1',
      type: 'SOURCE_CLOSED',
      fromStatus: 'IN_PROGRESS',
    });
  });

  it('stops a recurring task generating when it is closed', async () => {
    const { bridge, prisma } = setup({ tasks: [existingTask({ frequency: 'WEEKLY' })] });
    await bridge.closeFromSource({ sourceModule: 'SGA_MEETING', sourceId: 'sga-1' });

    expect(prisma.task.update.mock.calls[0][0].data.isActive).toBe(false);
    expect(prisma.taskInstance.deleteMany.mock.calls[0][0].where.scheduledFor.gte).toBeInstanceOf(Date);
  });

  it('reopens only the instances the source closed', async () => {
    const { bridge, prisma, dwms } = setup({
      tasks: [existingTask({ status: 'DONE' })],
      openInstances: [{ id: 'inst-1' }],
    });
    await bridge.reopenFromSource({ sourceModule: 'SGA', sourceId: 'act-1' });

    expect(prisma.taskInstance.findMany.mock.calls[0][0].where.events).toEqual({ some: { type: 'SOURCE_CLOSED' } });
    expect(prisma.task.update.mock.calls[0][0].data).toEqual({ status: 'PENDING', completionPercent: 0, isActive: true });
    expect(dwms.refreshTaskInstances).toHaveBeenCalledWith('task-1', 'org-1');
  });

  it('deactivates the tasks of a parent except the ones still wanted', async () => {
    const { bridge, prisma } = setup({
      tasks: [existingTask()],
      openInstances: [{ id: 'inst-1', status: 'IN_PROGRESS' }],
    });
    await bridge.deactivateFromSource({ sourceModule: 'SGA', sourceParentId: 'sga-1' }, ['act-2']);

    expect(prisma.task.findMany.mock.calls[0][0].where).toMatchObject({
      sourceParentId: 'sga-1',
      isActive: true,
      sourceId: { notIn: ['act-2'] },
    });
    expect(prisma.task.update.mock.calls[0][0].data).toEqual({ isActive: false });
    expect(prisma.taskInstance.updateMany.mock.calls[0][0].data).toEqual({ status: 'NOT_APPLICABLE' });
  });
});
