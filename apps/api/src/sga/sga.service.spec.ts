import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { SgaService, SgaWithInclude, getDraftMissingItems } from './sga.service';

const ORG = 'org-1';
const RAISER = { id: 'emp-raiser', departmentId: 'dept-1', organizationId: ORG };
const OTHER = { id: 'emp-other', departmentId: 'dept-1', organizationId: ORG };

function draft(overrides: Partial<SgaWithInclude> = {}): SgaWithInclude {
    return {
        id: 'sga-1',
        organizationId: ORG,
        employeeId: RAISER.id,
        status: 'DRAFT',
        title: 'Reduce filler jams',
        problemDescription: 'Line 3 filler jams several times a shift',
        startingReason: 'QUALITY_PROBLEM_OR_IMPROVEMENT',
        startingReasonOther: null,
        mainDepartmentId: 'dept-1',
        startDate: new Date('2026-09-01'),
        targetCompletionDate: new Date('2026-12-01'),
        ownerId: RAISER.id,
        meetingFrequency: 'WEEKLY',
        qcdsmtImpacts: [{ category: 'QUALITY' }],
        ...overrides,
    } as unknown as SgaWithInclude;
}

function setup(sga: SgaWithInclude, { employee = RAISER, roles = ['EMPLOYEE'] } = {}) {
    const prisma = {
        sga: {
            findFirst: jest.fn().mockResolvedValue(sga),
            update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...sga, ...data })),
            delete: jest.fn().mockResolvedValue(sga),
        },
        employee: { findFirst: jest.fn().mockResolvedValue(employee), findMany: jest.fn().mockResolvedValue([]) },
        userOrganization: { findMany: jest.fn().mockResolvedValue(roles.map((name) => ({ role: { name } }))) },
        department: { findFirst: jest.fn().mockResolvedValue({ id: 'dept-1' }), count: jest.fn() },
        sgaReview: { create: jest.fn() },
        sgaActionItem: { findUnique: jest.fn(), update: jest.fn(), deleteMany: jest.fn(), createMany: jest.fn() },
        $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((fn: (tx: typeof prisma) => unknown) => fn(prisma));
    const notifications = { createMany: jest.fn() };
    const bridge = {
        upsertFromSource: jest.fn(),
        syncParentFromSource: jest.fn(),
        closeFromSource: jest.fn(),
        reopenFromSource: jest.fn(),
        deactivateFromSource: jest.fn(),
    };
    const taskEvents = { onStatusChange: jest.fn() };
    const service = new SgaService(prisma as never, notifications as never, bridge as never, taskEvents as never);
    return { service, prisma, bridge, taskEvents };
}

describe('getDraftMissingItems', () => {
    it('returns nothing for a complete draft', () => {
        expect(getDraftMissingItems(draft())).toEqual([]);
    });

    it('lists each missing item with the wizard step to fix it on', () => {
        const missing = getDraftMissingItems(
            draft({ startingReason: 'OTHER', mainDepartmentId: null, qcdsmtImpacts: [], ownerId: null } as never),
        );
        expect(missing.map((m) => [m.key, m.step])).toEqual([
            ['startingReasonOther', 1],
            ['mainDepartmentId', 1],
            ['impacts', 2],
            ['ownerId', 3],
        ]);
    });
});

describe('SgaService drafts', () => {
    it('saves a partial draft without overwriting unsent fields', async () => {
        const { service, prisma } = setup(draft());
        await service.updateInfo('sga-1', 'user-1', { workArea: 'Line 3' }, ORG);

        const { data } = prisma.sga.update.mock.calls[0][0];
        expect(data.workArea).toBe('Line 3');
        expect(data.title).toBeUndefined();
        expect(data.startDate).toBeUndefined();
        expect(data.targetCompletionDate).toBeUndefined();
    });

    it('rejects a target date before the saved start date', async () => {
        const { service } = setup(draft());
        await expect(
            service.updateInfo('sga-1', 'user-1', { targetCompletionDate: '2026-08-01' }, ORG),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('returns the missing list when submitting an incomplete draft', async () => {
        const { service, prisma } = setup(draft({ ownerId: null, qcdsmtImpacts: [] } as never));
        const error = await service.submitForHodApproval('sga-1', 'user-1', ORG).catch((e) => e);

        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as BadRequestException).getResponse()).toMatchObject({
            missing: [expect.objectContaining({ key: 'impacts' }), expect.objectContaining({ key: 'ownerId' })],
        });
        expect(prisma.sga.update).not.toHaveBeenCalled();
    });

    it('submits a complete draft for HOD approval', async () => {
        const { service, prisma } = setup(draft());
        await service.submitForHodApproval('sga-1', 'user-1', ORG);
        expect(prisma.sga.update.mock.calls[0][0].data.status).toBe('PENDING_HOD_APPROVAL');
    });

    it('lets the raiser delete their draft', async () => {
        const { service, prisma } = setup(draft());
        await expect(service.deleteSga('sga-1', 'user-1', ORG)).resolves.toEqual({ id: 'sga-1' });
        expect(prisma.sga.delete).toHaveBeenCalledWith({ where: { id: 'sga-1' } });
    });

    it('forbids deleting someone else\'s draft', async () => {
        const { service, prisma } = setup(draft(), { employee: OTHER });
        await expect(service.deleteSga('sga-1', 'user-2', ORG)).rejects.toBeInstanceOf(ForbiddenException);
        expect(prisma.sga.delete).not.toHaveBeenCalled();
    });

    it('lets an admin delete any draft', async () => {
        const { service } = setup(draft(), { employee: OTHER, roles: ['ADMIN'] });
        await expect(service.deleteSga('sga-1', 'user-2', ORG)).resolves.toEqual({ id: 'sga-1' });
    });

    it('refuses to delete a submitted SGA', async () => {
        const { service, prisma } = setup(draft({ status: 'PENDING_HOD_APPROVAL' } as never));
        await expect(service.deleteSga('sga-1', 'user-1', ORG)).rejects.toBeInstanceOf(BadRequestException);
        expect(prisma.sga.delete).not.toHaveBeenCalled();
    });
});

describe('SgaService action items', () => {
    const action = {
        id: 'act-1',
        confirmedRootCause: 'Worn guide rail',
        improvementAction: 'Replace rail',
        responsiblePersonId: 'emp-resp',
        dueDate: null,
        status: 'IN_PROGRESS',
        completedAt: null,
    };
    const running = (overrides: Partial<SgaWithInclude> = {}) =>
        draft({ status: 'IN_PROGRESS', teamMembers: [], actionItems: [action], ...overrides } as never);

    it('lets the person responsible tick off their action and stamps completion', async () => {
        const { service, prisma } = setup(running(), { employee: { ...OTHER, id: 'emp-resp' } });
        await service.updateActionItemStatus('sga-1', 'act-1', 'user-1', { status: 'DONE' }, ORG);

        const { where, data } = prisma.sgaActionItem.update.mock.calls[0][0];
        expect(where).toEqual({ id: 'act-1' });
        expect(data.status).toBe('DONE');
        expect(data.completedAt).toBeInstanceOf(Date);
    });

    it('refuses someone outside the team who is not responsible', async () => {
        const { service } = setup(running(), { employee: OTHER });
        await expect(
            service.updateActionItemStatus('sga-1', 'act-1', 'user-1', { status: 'DONE' }, ORG),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses updates once the SGA has gone for verification', async () => {
        const { service } = setup(running({ status: 'PENDING_VERIFICATION' } as never), { employee: { ...OTHER, id: 'emp-resp' } });
        await expect(
            service.updateActionItemStatus('sga-1', 'act-1', 'user-1', { status: 'OPEN' }, ORG),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('keeps progress on existing items when the plan is re-saved', async () => {
        const { service, prisma } = setup(running());
        await service.updateActionPlan('sga-1', 'user-1', {
            actionItems: [
                { id: 'act-1', confirmedRootCause: 'Worn guide rail', improvementAction: 'Replace rail and add PM check' },
                { confirmedRootCause: 'No SOP', improvementAction: 'Write SOP' },
            ],
        }, ORG);

        const { data } = prisma.sgaActionItem.createMany.mock.calls[0][0];
        expect(data[0]).toMatchObject({ id: 'act-1', status: 'IN_PROGRESS', improvementAction: 'Replace rail and add PM check' });
        expect(data[1].id).toBeUndefined();
        expect(data[1].status).toBeUndefined();
    });

    it('puts each action with a responsible person on their DWMS list, closing done ones', async () => {
        const done = { ...action, id: 'act-2', status: 'DONE' };
        const unassigned = { ...action, id: 'act-3', responsiblePersonId: null };
        const { service, bridge } = setup(running({ actionItems: [action, done, unassigned] } as never));
        await service.updateActionPlan('sga-1', 'user-1', { actionItems: [] }, ORG);

        const [parent, inputs, closedIds] = bridge.syncParentFromSource.mock.calls[0];
        expect(parent).toEqual({ sourceModule: 'SGA', sourceParentId: 'sga-1' });
        expect(inputs).toHaveLength(1);
        expect(inputs[0]).toMatchObject({
            sourceId: 'act-1',
            ownerId: 'emp-resp',
            title: 'SGA action: Replace rail',
            frequency: 'PLANNED',
            // falls back to the SGA target date when the action has none
            dueDate: new Date('2026-12-01'),
        });
        expect(closedIds).toEqual(['act-2']);
    });

    it('closes the DWMS task when an action is ticked off and reopens it when unticked', async () => {
        const { service, bridge } = setup(running(), { employee: { ...OTHER, id: 'emp-resp' } });
        await service.updateActionItemStatus('sga-1', 'act-1', 'user-1', { status: 'DONE' }, ORG);
        expect(bridge.closeFromSource).toHaveBeenCalledWith({ sourceModule: 'SGA', sourceId: 'act-1' });

        const reopened = setup(running({ actionItems: [{ ...action, status: 'DONE' }] } as never), { employee: { ...OTHER, id: 'emp-resp' } });
        await reopened.service.updateActionItemStatus('sga-1', 'act-1', 'user-1', { status: 'IN_PROGRESS' }, ORG);
        expect(reopened.bridge.reopenFromSource).toHaveBeenCalledWith({ sourceModule: 'SGA', sourceId: 'act-1' });
    });

    it('does not fail the save when the DWMS sync fails', async () => {
        const { service, bridge } = setup(running());
        bridge.syncParentFromSource.mockRejectedValue(new Error('db down'));
        jest.spyOn((service as any).logger, 'error').mockImplementation(() => undefined);
        await expect(service.updateActionPlan('sga-1', 'user-1', { actionItems: [] }, ORG)).resolves.toBeDefined();
    });
});

describe('SgaService meeting task', () => {
    const pending = (overrides: Partial<SgaWithInclude> = {}) =>
        draft({ status: 'PENDING_HOD_APPROVAL', actionItems: [], meetingDay: 'TUESDAY', meetingTime: '09:00', ...overrides } as never);
    const HOD = { ...OTHER, id: 'emp-hod' };

    it('makes the meeting plan a recurring task for the owner on approval', async () => {
        const { service, bridge } = setup(pending(), { employee: HOD, roles: ['HOD'] });
        await service.submitHodApproval('sga-1', 'user-1', { decision: 'APPROVED' } as never, ORG);

        expect(bridge.upsertFromSource).toHaveBeenCalledWith(expect.objectContaining({
            sourceModule: 'SGA_MEETING',
            sourceId: 'sga-1',
            ownerId: RAISER.id,
            frequency: 'WEEKLY',
            recurrenceUnit: 'WEEK',
            recurrenceInterval: 1,
            recurrenceWeekdays: [2],
            description: 'Time: 09:00',
        }));
    });

    it('maps a biweekly plan to every second week', async () => {
        const { service, bridge } = setup(pending({ meetingFrequency: 'BIWEEKLY' } as never), { employee: HOD, roles: ['HOD'] });
        await service.submitHodApproval('sga-1', 'user-1', { decision: 'APPROVED' } as never, ORG);
        expect(bridge.upsertFromSource.mock.calls[0][0]).toMatchObject({ recurrenceUnit: 'WEEK', recurrenceInterval: 2 });
    });

    it('creates no meeting task for a custom plan or a rejected SGA', async () => {
        const custom = setup(pending({ meetingFrequency: 'CUSTOM' } as never), { employee: HOD, roles: ['HOD'] });
        await custom.service.submitHodApproval('sga-1', 'user-1', { decision: 'APPROVED' } as never, ORG);
        expect(custom.bridge.upsertFromSource).not.toHaveBeenCalled();

        const rejected = setup(pending(), { employee: HOD, roles: ['HOD'] });
        await rejected.service.submitHodApproval('sga-1', 'user-1', { decision: 'REJECTED' } as never, ORG);
        expect(rejected.bridge.upsertFromSource).not.toHaveBeenCalled();
    });
});

describe('SgaService action items from DWMS', () => {
    function change(toStatus: string) {
        return { sourceModule: 'SGA', sourceId: 'item-1', sourceParentId: 'sga-1', toStatus } as never;
    }

    function withItem(status: string, sgaStatus = 'IN_PROGRESS') {
        const ctx = setup(draft());
        ctx.prisma.sgaActionItem.findUnique.mockResolvedValue({ id: 'item-1', status, completedAt: null, sga: { status: sgaStatus } });
        return ctx;
    }

    it('subscribes to SGA action item tasks', () => {
        const { service, taskEvents } = setup(draft());
        service.onModuleInit();
        expect(taskEvents.onStatusChange).toHaveBeenCalledWith('SGA', expect.any(Function));
    });

    it('marks the item done when its task is ticked done, without echoing back to DWMS', async () => {
        const { service, prisma, bridge } = withItem('OPEN');
        await service.updateActionItemFromDwms(change('DONE'));

        const { where, data } = prisma.sgaActionItem.update.mock.calls[0][0];
        expect(where).toEqual({ id: 'item-1' });
        expect(data.status).toBe('DONE');
        expect(data.completedAt).toBeInstanceOf(Date);
        expect(bridge.closeFromSource).not.toHaveBeenCalled();
    });

    it('moves a partly done task to in progress and reopens a done item set back to pending', async () => {
        const partly = withItem('OPEN');
        await partly.service.updateActionItemFromDwms(change('PARTLY_DONE'));
        expect(partly.prisma.sgaActionItem.update.mock.calls[0][0].data).toEqual({ status: 'IN_PROGRESS', completedAt: null });

        const reopened = withItem('DONE');
        await reopened.service.updateActionItemFromDwms(change('PENDING'));
        expect(reopened.prisma.sgaActionItem.update.mock.calls[0][0].data).toEqual({ status: 'OPEN', completedAt: null });
    });

    it('leaves the item alone once the SGA is past implementation, or for a status with no meaning', async () => {
        const closed = withItem('OPEN', 'VERIFIED_CLOSED');
        await closed.service.updateActionItemFromDwms(change('DONE'));
        expect(closed.prisma.sgaActionItem.update).not.toHaveBeenCalled();

        const inProgress = withItem('IN_PROGRESS');
        await inProgress.service.updateActionItemFromDwms(change('PENDING'));
        await inProgress.service.updateActionItemFromDwms(change('NOT_APPLICABLE'));
        expect(inProgress.prisma.sgaActionItem.update).not.toHaveBeenCalled();
    });
});
