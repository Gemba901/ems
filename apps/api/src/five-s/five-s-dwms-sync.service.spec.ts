import { DwmsTaskStatusChange } from 'src/dwms/services/dwms-task-events.service';
import { FiveSDwmsSyncService } from './five-s-dwms-sync.service';

const ROUTINE = {
    id: 'routine-1',
    title: 'Wipe press bed',
    checkLocation: 'Press 3',
    instructions: 'Use the blue cloth',
    frequency: 'WEEKLY',
    responsibleId: 'emp-1',
    // A Wednesday
    startDate: new Date('2026-10-07T00:00:00Z'),
    isActive: true,
    area: { name: 'Press Line', departmentId: 'dept-1', isActive: true },
};

const ACTION = {
    id: 'action-1',
    reference: '5S-A-0004',
    finding: 'Oil on the floor',
    dueDate: new Date('2026-11-10T00:00:00Z'),
    status: 'OPEN',
    area: { name: 'Press Line', departmentId: 'dept-1' },
    correctiveActions: [
        { id: 'step-1', sortOrder: 1, description: 'Fix leak', ownerId: 'emp-1', dueDate: new Date('2026-11-01T00:00:00Z'), completedAt: null },
        { id: 'step-2', sortOrder: 2, description: 'Clean floor', ownerId: 'emp-2', dueDate: null, completedAt: null },
        { id: 'step-3', sortOrder: 3, description: 'Label tray', ownerId: null, dueDate: null, completedAt: null },
        { id: 'step-4', sortOrder: 4, description: 'Order tray', ownerId: 'emp-1', dueDate: null, completedAt: new Date() },
    ],
};

function change(overrides: Partial<DwmsTaskStatusChange> = {}): DwmsTaskStatusChange {
    return {
        taskInstanceId: 'inst-1',
        taskId: 'task-1',
        sourceModule: 'FIVE_S_ROUTINE',
        sourceId: 'routine-1',
        sourceParentId: 'routine-1',
        ownerId: 'emp-1',
        // DWMS moved the Wednesday 2026-10-21 occurrence to Thursday (office closed)
        scheduledFor: new Date('2026-10-22T00:00:00Z'),
        fromStatus: 'PENDING',
        toStatus: 'DONE',
        actorId: 'emp-1',
        note: null,
        ...overrides,
    };
}

function setup({
    routine = ROUTINE as unknown,
    action = ACTION as unknown,
    step = null as unknown,
    previousOutcome = null as string | null,
    modules = ['FIVE_S', 'DWMS'],
    existingAlert = null as unknown,
    recorderManagerId = 'emp-manager' as string | null,
} = {}) {
    const prisma = {
        fiveSRoutine: { findUnique: jest.fn().mockResolvedValue(routine), findMany: jest.fn().mockResolvedValue([]) },
        fiveSAction: { findUnique: jest.fn().mockResolvedValue(action), findMany: jest.fn().mockResolvedValue([]) },
        fiveSRoutineCompletion: {
            upsert: jest.fn(),
            findUnique: jest.fn().mockResolvedValue(previousOutcome ? { outcome: previousOutcome } : null),
        },
        organization: { findUnique: jest.fn().mockResolvedValue({ modules }), findMany: jest.fn().mockResolvedValue([{ id: 'org-1' }]) },
        employee: { findUnique: jest.fn().mockResolvedValue({ reportingManagerId: recorderManagerId }) },
        alert: {
            findUnique: jest.fn().mockResolvedValue(existingAlert),
            create: jest.fn().mockResolvedValue({ id: 'alert-new' }),
            update: jest.fn().mockResolvedValue({ id: 'alert-old' }),
        },
        fiveSCorrectiveAction: { findUnique: jest.fn().mockResolvedValue(step), update: jest.fn() },
        fiveSActionEvent: { create: jest.fn() },
        $transaction: jest.fn().mockResolvedValue([]),
    };
    const bridge = {
        upsertFromSource: jest.fn(),
        deactivateFromSource: jest.fn(),
        syncParentFromSource: jest.fn(),
        reopenFromSource: jest.fn(),
        recordOccurrenceFromSource: jest.fn(),
    };
    const events = { onStatusChange: jest.fn() };
    const notifications = { create: jest.fn() };
    const sync = new FiveSDwmsSyncService(prisma as never, bridge as never, events as never, notifications as never);
    return { sync, prisma, bridge, events, notifications };
}

describe('FiveSDwmsSyncService: 5S -> DWMS', () => {
    it('turns a weekly routine into a recurring task on the start weekday', async () => {
        const { sync, bridge } = setup();
        await sync.syncRoutine('routine-1', 'emp-hod');

        expect(bridge.upsertFromSource.mock.calls[0][0]).toMatchObject({
            sourceModule: 'FIVE_S_ROUTINE',
            sourceId: 'routine-1',
            ownerId: 'emp-1',
            title: '5S check: Wipe press bed',
            description: 'Where: Press 3\nUse the blue cloth',
            assignedById: 'emp-hod',
            frequency: 'WEEKLY',
            recurrenceUnit: 'WEEK',
            recurrenceInterval: 1,
            recurrenceWeekdays: [3],
            recurrenceStartsOn: ROUTINE.startDate,
        });
    });

    it('deactivates the task of an inactive or unassigned routine', async () => {
        const { sync, bridge } = setup({ routine: { ...ROUTINE, responsibleId: null } });
        await sync.syncRoutine('routine-1', 'emp-hod');

        expect(bridge.upsertFromSource).not.toHaveBeenCalled();
        expect(bridge.deactivateFromSource).toHaveBeenCalledWith({ sourceModule: 'FIVE_S_ROUTINE', sourceId: 'routine-1' });
    });

    it('never fails the 5S save when DWMS sync throws', async () => {
        const { sync, bridge } = setup();
        bridge.upsertFromSource.mockRejectedValue(new Error('db down'));
        await expect(sync.syncRoutine('routine-1', 'emp-hod')).resolves.toBeUndefined();
    });

    it('closes the DWMS instance for a check recorded on the 5S page', async () => {
        const { sync, bridge } = setup();
        await sync.recordRoutineOccurrence(ROUTINE as never, '2026-10-21', 'DONE_WITH_EXCEPTION', 'No cloth', 'emp-1');

        expect(bridge.recordOccurrenceFromSource).toHaveBeenCalledWith(
            { sourceModule: 'FIVE_S_ROUTINE', sourceId: 'routine-1' },
            {
                occurrenceDate: new Date('2026-10-21T00:00:00Z'),
                nextOccurrenceDate: new Date('2026-10-28T00:00:00Z'),
                status: 'PARTLY_DONE',
                actorId: 'emp-1',
                note: 'No cloth',
            },
        );
    });

    it('syncs open owned steps, closes finished ones and skips unowned ones', async () => {
        const { sync, bridge } = setup();
        await sync.syncActionSteps('action-1', 'emp-hod');

        const [parent, inputs, closedIds] = bridge.syncParentFromSource.mock.calls[0];
        expect(parent).toEqual({ sourceModule: 'FIVE_S_STEP', sourceParentId: 'action-1' });
        expect(inputs.map((i: { sourceId: string }) => i.sourceId)).toEqual(['step-1', 'step-2']);
        expect(inputs[0]).toMatchObject({ ownerId: 'emp-1', dueDate: new Date('2026-11-01T00:00:00Z'), frequency: 'PLANNED' });
        // No due date of its own: falls back to the plan's
        expect(inputs[1]).toMatchObject({ ownerId: 'emp-2', dueDate: ACTION.dueDate, title: '5S action: Clean floor' });
        expect(closedIds).toEqual(['step-4']);
    });
});

describe('FiveSDwmsSyncService: backfill', () => {
    it('syncs every active routine and open action in organizations using 5S and DWMS', async () => {
        const { sync, prisma } = setup();
        prisma.fiveSRoutine.findMany.mockResolvedValue([{ id: 'routine-1', createdById: 'emp-hod' }]);
        prisma.fiveSAction.findMany.mockResolvedValue([{ id: 'action-1', createdById: 'emp-hod' }]);
        const syncRoutine = jest.spyOn(sync, 'syncRoutine');
        const syncActionSteps = jest.spyOn(sync, 'syncActionSteps');

        await expect(sync.backfill()).resolves.toEqual({ routines: 1, actions: 1 });

        expect(prisma.organization.findMany.mock.calls[0][0].where).toEqual({
            status: 'ACTIVE',
            modules: { hasEvery: ['FIVE_S', 'DWMS'] },
        });
        expect(prisma.fiveSRoutine.findMany.mock.calls[0][0].where).toEqual({
            organizationId: { in: ['org-1'] },
            isActive: true,
            responsibleId: { not: null },
        });
        expect(prisma.fiveSAction.findMany.mock.calls[0][0].where).toEqual({
            organizationId: { in: ['org-1'] },
            status: { not: 'VERIFIED' },
        });
        expect(syncRoutine).toHaveBeenCalledWith('routine-1', 'emp-hod');
        expect(syncActionSteps).toHaveBeenCalledWith('action-1', 'emp-hod');
    });
});

describe('FiveSDwmsSyncService: DWMS -> 5S', () => {
    it('subscribes to routine and step changes', () => {
        const { sync, events } = setup();
        sync.onModuleInit();
        expect(events.onStatusChange.mock.calls.map((c) => c[0])).toEqual(['FIVE_S_ROUTINE', 'FIVE_S_STEP']);
    });

    it('records the check against the 5S occurrence even when DWMS moved the day', async () => {
        const { sync, prisma } = setup();
        await sync.recordRoutineFromDwms(change());

        const { where, create } = prisma.fiveSRoutineCompletion.upsert.mock.calls[0][0];
        expect(where).toEqual({ routineId_scheduledDate: { routineId: 'routine-1', scheduledDate: new Date('2026-10-21T00:00:00Z') } });
        expect(create).toMatchObject({ outcome: 'DONE', exception: null, completedById: 'emp-1' });
    });

    it('maps partly done to done with exception and ignores in-progress', async () => {
        const { sync, prisma } = setup();
        await sync.recordRoutineFromDwms(change({ toStatus: 'PARTLY_DONE', note: 'Ran out of cloth' }));
        expect(prisma.fiveSRoutineCompletion.upsert.mock.calls[0][0].update).toMatchObject({
            outcome: 'DONE_WITH_EXCEPTION',
            exception: 'Ran out of cloth',
        });

        await sync.recordRoutineFromDwms(change({ toStatus: 'IN_PROGRESS' }));
        expect(prisma.fiveSRoutineCompletion.upsert).toHaveBeenCalledTimes(1);
    });

    it('ticks off an open step finished in DWMS', async () => {
        const { sync, prisma } = setup({
            step: { id: 'step-1', actionId: 'action-1', description: 'Fix leak', completedAt: null, action: { status: 'OPEN' } },
        });
        await sync.completeStepFromDwms(change({ sourceModule: 'FIVE_S_STEP', sourceId: 'step-1', actorId: null }));

        expect(prisma.fiveSCorrectiveAction.update.mock.calls[0][0]).toMatchObject({
            where: { id: 'step-1' },
            data: { completedById: 'emp-1' },
        });
        expect(prisma.fiveSActionEvent.create.mock.calls[0][0].data).toMatchObject({ actionId: 'action-1', type: 'UPDATED' });
    });

    it('leaves a step alone once the plan is awaiting verification', async () => {
        const { sync, prisma } = setup({
            step: { id: 'step-1', actionId: 'action-1', description: 'Fix leak', completedAt: null, action: { status: 'AWAITING_VERIFICATION' } },
        });
        await sync.completeStepFromDwms(change({ sourceModule: 'FIVE_S_STEP', sourceId: 'step-1' }));
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });
});

describe('FiveSDwmsSyncService: routine exception -> DWMS abnormality (join 11)', () => {
    const EXCEPTION_ROUTINE = {
        id: 'routine-1',
        title: 'Wipe press bed',
        checkLocation: 'Press 3',
        organizationId: 'org-1',
        area: { name: 'Press Line', ownerId: 'emp-owner', departmentId: 'dept-1' },
    };

    it('raises an abnormality against the area owner on the first exception', async () => {
        const { sync, prisma, notifications } = setup({ routine: EXCEPTION_ROUTINE });
        await sync.raiseRoutineException('routine-1', '2026-10-21', 'No cloth', 'emp-1');

        const { data } = prisma.alert.create.mock.calls[0][0];
        expect(data).toMatchObject({
            type: 'PROCESS_DEVIATION',
            isAbnormality: true,
            raisedById: 'emp-1',
            againstUserId: 'emp-owner',
            departmentId: 'dept-1',
            deduplicationKey: 'five-s:routine-exception:routine-1',
            comments: { create: { authorId: 'emp-1', comment: 'Check of 2026-10-21: No cloth' } },
        });
        expect(notifications.create).toHaveBeenCalledWith(expect.objectContaining({ employeeId: 'emp-owner', actionUrl: '/dwms/alerts/alert-new' }));
    });

    it('raises a repeat exception again on the same abnormality', async () => {
        const { sync, prisma } = setup({ routine: EXCEPTION_ROUTINE, existingAlert: { id: 'alert-old' } });
        await sync.raiseRoutineException('routine-1', '2026-10-28', null, 'emp-1');

        expect(prisma.alert.create).not.toHaveBeenCalled();
        expect(prisma.alert.update.mock.calls[0][0]).toMatchObject({
            where: { id: 'alert-old' },
            data: {
                raiseCount: { increment: 1 },
                occurrences: { create: { raisedById: 'emp-1' } },
                comments: { create: { comment: 'Check of 2026-10-28: done with an exception' } },
            },
        });
    });

    it("goes to the recorder's manager when the area owner recorded it, and skips without DWMS", async () => {
        const own = setup({ routine: EXCEPTION_ROUTINE });
        await own.sync.raiseRoutineException('routine-1', '2026-10-21', 'No cloth', 'emp-owner');
        expect(own.prisma.alert.create.mock.calls[0][0].data.againstUserId).toBe('emp-manager');

        const off = setup({ routine: EXCEPTION_ROUTINE, modules: ['FIVE_S'] });
        await off.sync.raiseRoutineException('routine-1', '2026-10-21', 'No cloth', 'emp-1');
        expect(off.prisma.alert.create).not.toHaveBeenCalled();
    });

    it('raises from a DWMS partly-done only when the result changes into an exception', async () => {
        const fresh = setup();
        const raise = jest.spyOn(fresh.sync, 'raiseRoutineException').mockResolvedValue(undefined);
        await fresh.sync.recordRoutineFromDwms(change({ toStatus: 'PARTLY_DONE', note: 'No cloth' }));
        expect(raise).toHaveBeenCalledWith('routine-1', '2026-10-21', 'No cloth', 'emp-1');

        const again = setup({ previousOutcome: 'DONE_WITH_EXCEPTION' });
        const raiseAgain = jest.spyOn(again.sync, 'raiseRoutineException').mockResolvedValue(undefined);
        await again.sync.recordRoutineFromDwms(change({ toStatus: 'PARTLY_DONE', note: 'No cloth' }));
        expect(raiseAgain).not.toHaveBeenCalled();
    });
});
