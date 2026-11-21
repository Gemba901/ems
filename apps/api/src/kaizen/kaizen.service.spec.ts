import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { KaizenService, KaizenWithInclude, getKaizenDraftMissingItems } from './kaizen.service';

const ORG = 'org-1';
const RAISER = { id: 'emp-raiser', departmentId: 'dept-1', organizationId: ORG };
const OTHER = { id: 'emp-other', departmentId: 'dept-1', organizationId: ORG };

function draft(overrides: Partial<KaizenWithInclude> = {}): KaizenWithInclude {
    return {
        id: 'kz-1',
        organizationId: ORG,
        employeeId: RAISER.id,
        departmentId: 'dept-1',
        status: 'DRAFT',
        trigger: 'SAFETY',
        triggerOther: null,
        title: 'Label the spill kit',
        conditionDescription: 'Spill kit is hard to find during an incident',
        startDate: new Date('2026-09-01'),
        targetCompletionDate: new Date('2026-09-10'),
        kaizenOwnerId: RAISER.id,
        requiredMaterials: 'Sign and paint',
        qcdsmtImpacts: [{ category: 'SAFETY' }],
        teamMembers: [],
        ...overrides,
    } as unknown as KaizenWithInclude;
}

function setup(kaizen: KaizenWithInclude, { employee = RAISER, roles = ['EMPLOYEE'] } = {}) {
    const prisma = {
        kaizen: {
            findFirst: jest.fn().mockResolvedValue(kaizen),
            findUnique: jest.fn().mockResolvedValue(kaizen),
            create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'kz-new', ...data })),
            update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...kaizen, ...data })),
            delete: jest.fn().mockResolvedValue(kaizen),
        },
        employee: {
            findFirst: jest.fn().mockResolvedValue(employee),
            findUnique: jest.fn().mockResolvedValue({ firstName: 'Ann', lastName: 'Wanjiru' }),
            findMany: jest.fn().mockResolvedValue([]),
            count: jest.fn().mockImplementation(({ where }) => Promise.resolve(where.id.in.length)),
        },
        userOrganization: { findMany: jest.fn().mockResolvedValue(roles.map((name) => ({ role: { name } }))) },
        kaizenReview: { create: jest.fn() },
        kaizenVerification: { upsert: jest.fn() },
        department: { findFirst: jest.fn().mockResolvedValue(null) },
        organization: { findUnique: jest.fn().mockResolvedValue(null) },
        steeringCommitteeMember: { findMany: jest.fn().mockResolvedValue([]) },
        suggestion: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() },
        $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((fn: (tx: typeof prisma) => unknown) => fn(prisma));
    const notifications = { create: jest.fn(), createMany: jest.fn() };
    const bridge = {
        syncParentFromSource: jest.fn(),
        closeFromSource: jest.fn(),
        reopenFromSource: jest.fn(),
    };
    const sga = { createSgaForEmployee: jest.fn().mockResolvedValue({ id: 'sga-new', employeeId: RAISER.id }) };
    const taskEvents = { onStatusChange: jest.fn() };
    const service = new KaizenService(prisma as never, notifications as never, bridge as never, sga as never, taskEvents as never);
    return { service, prisma, notifications, bridge, sga, taskEvents };
}

describe('getKaizenDraftMissingItems', () => {
    it('returns nothing for a complete draft', () => {
        expect(getKaizenDraftMissingItems(draft())).toEqual([]);
    });

    it('lists each missing item with the wizard step to fix it on', () => {
        const missing = getKaizenDraftMissingItems(
            draft({ trigger: 'OTHER', conditionDescription: '', qcdsmtImpacts: [], requiredMaterials: null } as never),
        );
        expect(missing.map((m) => [m.key, m.step])).toEqual([
            ['triggerOther', 1],
            ['conditionDescription', 1],
            ['impacts', 2],
            ['requiredMaterials', 3],
        ]);
    });
});

describe('KaizenService drafts', () => {
    it('starts a new draft today, owned by the raiser', async () => {
        const { service, prisma } = setup(draft());
        await service.createKaizen('user-1', {}, ORG);

        const { data } = prisma.kaizen.create.mock.calls[0][0];
        expect(data.status).toBe('DRAFT');
        expect(data.kaizenOwnerId).toBe(RAISER.id);
        expect(data.startDate).toBeInstanceOf(Date);
        expect(data.conditionDescription).toBe('');
    });

    it('saves a partial draft without overwriting unsent fields', async () => {
        const { service, prisma } = setup(draft());
        await service.updateBasicInfo('kz-1', 'user-1', { kaizenOwnerId: OTHER.id }, ORG);

        const { data } = prisma.kaizen.update.mock.calls[0][0];
        expect(data.kaizenOwnerId).toBe(OTHER.id);
        expect(data.title).toBeUndefined();
        expect(data.startDate).toBeUndefined();
        expect(data.targetCompletionDate).toBeUndefined();
    });

    it('checks the 30-day window against the saved start date', async () => {
        const { service } = setup(draft());
        await expect(
            service.updateBasicInfo('kz-1', 'user-1', { targetCompletionDate: '2026-11-01' }, ORG),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('keeps the saved reason when the step is saved without one', async () => {
        const { service, prisma } = setup(draft());
        await service.updateReason('kz-1', 'user-1', {}, ORG);
        expect(prisma.kaizen.update.mock.calls[0][0].data).toEqual({});
    });

    it('only notifies people newly added to the team', async () => {
        const { service, notifications } = setup(draft({ teamMembers: [{ id: 'emp-a' }] } as never));
        await service.updateBasicInfo('kz-1', 'user-1', { teamMemberIds: ['emp-a', 'emp-b'] }, ORG);

        const sent = notifications.createMany.mock.calls[0][0];
        expect(sent.map((n: { employeeId: string }) => n.employeeId)).toEqual(['emp-b']);
    });

    it('returns the missing list when submitting an incomplete draft', async () => {
        const { service, prisma } = setup(draft({ title: null, qcdsmtImpacts: [] } as never));
        const error = await service.submitForHodPreReview('kz-1', 'user-1', ORG).catch((e) => e);

        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as BadRequestException).getResponse()).toMatchObject({
            missing: [expect.objectContaining({ key: 'title' }), expect.objectContaining({ key: 'impacts' })],
        });
        expect(prisma.kaizen.update).not.toHaveBeenCalled();
    });

    it('submits a complete draft for HOD review', async () => {
        const { service, prisma } = setup(draft());
        await service.submitForHodPreReview('kz-1', 'user-1', ORG);
        expect(prisma.kaizen.update.mock.calls[0][0].data.status).toBe('PENDING_HOD_PRE_REVIEW');
    });

    it('lets the raiser delete their draft', async () => {
        const { service, prisma } = setup(draft());
        await expect(service.deleteKaizen('kz-1', 'user-1', ORG)).resolves.toEqual({ id: 'kz-1' });
        expect(prisma.kaizen.delete).toHaveBeenCalledWith({ where: { id: 'kz-1' } });
    });

    it("forbids deleting someone else's draft", async () => {
        const { service, prisma } = setup(draft(), { employee: OTHER });
        await expect(service.deleteKaizen('kz-1', 'user-2', ORG)).rejects.toBeInstanceOf(ForbiddenException);
        expect(prisma.kaizen.delete).not.toHaveBeenCalled();
    });

    it('lets an admin delete any draft', async () => {
        const { service } = setup(draft(), { employee: OTHER, roles: ['ADMIN'] });
        await expect(service.deleteKaizen('kz-1', 'user-2', ORG)).resolves.toEqual({ id: 'kz-1' });
    });

    it('refuses to delete a submitted kaizen', async () => {
        const { service, prisma } = setup(draft({ status: 'PENDING_HOD_PRE_REVIEW' } as never));
        await expect(service.deleteKaizen('kz-1', 'user-1', ORG)).rejects.toBeInstanceOf(BadRequestException);
        expect(prisma.kaizen.delete).not.toHaveBeenCalled();
    });
});

describe('KaizenService DWMS tasks', () => {
    const HOD = { ...OTHER, id: 'emp-hod' };

    it('gives the owner and each team member an implementation task once approved', async () => {
        const kaizen = draft({ status: 'PENDING_HOD_PRE_REVIEW', teamMembers: [{ id: 'emp-team' }, { id: RAISER.id }] } as never);
        const { service, bridge } = setup(kaizen, { employee: HOD, roles: ['HOD'] });
        await service.submitHodPreReview('kz-1', 'user-1', { decision: 'APPROVE' } as never, ORG);

        const [parent, inputs] = bridge.syncParentFromSource.mock.calls[0];
        expect(parent).toEqual({ sourceModule: 'KAIZEN', sourceParentId: 'kz-1' });
        expect(inputs).toEqual([
            expect.objectContaining({
                sourceId: `kz-1:${RAISER.id}`,
                ownerId: RAISER.id,
                title: 'Implement kaizen: Label the spill kit',
                frequency: 'PLANNED',
                dueDate: new Date('2026-09-10'),
                assignedById: HOD.id,
            }),
            expect.objectContaining({ sourceId: 'kz-1:emp-team', ownerId: 'emp-team', title: 'Kaizen team: Label the spill kit' }),
        ]);
    });

    it('creates no tasks when the HOD does not approve', async () => {
        const { service, bridge } = setup(draft({ status: 'PENDING_HOD_PRE_REVIEW' } as never), { employee: HOD, roles: ['HOD'] });
        await service.submitHodPreReview('kz-1', 'user-1', { decision: 'MOVE_TO_SGA' } as never, ORG);
        expect(bridge.syncParentFromSource).not.toHaveBeenCalled();
    });

    it('closes the implementation tasks when the owner submits for verification', async () => {
        const { service, bridge } = setup(draft({ status: 'IN_IMPLEMENTATION', actionTaken: 'Done' } as never));
        await service.submitForVerification('kz-1', 'user-1', ORG);
        expect(bridge.closeFromSource).toHaveBeenCalledWith({ sourceModule: 'KAIZEN', sourceParentId: 'kz-1' });
    });

    it('does not fail the approval when the DWMS sync fails', async () => {
        const { service, bridge } = setup(draft({ status: 'PENDING_HOD_PRE_REVIEW' } as never), { employee: HOD, roles: ['HOD'] });
        bridge.syncParentFromSource.mockRejectedValue(new Error('db down'));
        jest.spyOn((service as any).logger, 'error').mockImplementation(() => undefined);
        await expect(
            service.submitHodPreReview('kz-1', 'user-1', { decision: 'APPROVE' } as never, ORG),
        ).resolves.toBeDefined();
    });
});

describe('KaizenService move to SGA (join 6)', () => {
    const HOD = { ...OTHER, id: 'emp-hod' };
    const pending = () => draft({ status: 'PENDING_HOD_PRE_REVIEW', conditionEvidenceUrls: ['before.jpg'] } as never);

    it('raises a draft SGA for the kaizen owner and links it', async () => {
        const { service, prisma, sga, notifications } = setup(pending(), { employee: HOD, roles: ['HOD'] });
        await service.submitHodPreReview('kz-1', 'user-1', { decision: 'MOVE_TO_SGA', remarks: 'Needs a team' } as never, ORG);

        expect(sga.createSgaForEmployee).toHaveBeenCalledWith(
            RAISER.id,
            {
                startingReason: 'DAILY_KAIZEN_UPGRADED_TO_SGA',
                title: 'Label the spill kit',
                problemDescription: 'Spill kit is hard to find during an incident',
                mainDepartmentId: 'dept-1',
                beforeFileUrls: ['before.jpg'],
            },
            ORG,
        );
        expect(prisma.kaizen.update.mock.calls[0][0].data).toMatchObject({ status: 'MOVED_TO_SGA', linkedSgaId: 'sga-new' });
        expect(notifications.create).toHaveBeenCalledWith(expect.objectContaining({ employeeId: RAISER.id, actionUrl: '/sga/sga-new' }));
    });

    it('hands the source suggestion on to the SGA', async () => {
        const { service, prisma } = setup(
            draft({ status: 'PENDING_HOD_PRE_REVIEW', sourceSuggestion: { id: 'sug-1', title: 'Spill kit', status: 'APPROVED_FOR_IMPLEMENTATION' } } as never),
            { employee: HOD, roles: ['HOD'] },
        );
        prisma.suggestion.findFirst.mockResolvedValue({ id: 'sug-1' });
        await service.submitHodPreReview('kz-1', 'user-1', { decision: 'MOVE_TO_SGA' } as never, ORG);

        expect(prisma.suggestion.update).toHaveBeenCalledWith({
            where: { id: 'sug-1' },
            data: { linkedSgaId: 'sga-new', implementationStatus: 'SHIFTED_TO_SGA' },
        });
    });

    it('raises no SGA for other decisions or a kaizen already linked to one', async () => {
        const approve = setup(pending(), { employee: HOD, roles: ['HOD'] });
        await approve.service.submitHodPreReview('kz-1', 'user-1', { decision: 'APPROVE' } as never, ORG);
        expect(approve.sga.createSgaForEmployee).not.toHaveBeenCalled();

        const linked = setup(draft({ status: 'PENDING_HOD_PRE_REVIEW', linkedSgaId: 'sga-old' } as never), { employee: HOD, roles: ['HOD'] });
        await linked.service.submitHodPreReview('kz-1', 'user-1', { decision: 'MOVE_TO_SGA' } as never, ORG);
        expect(linked.sga.createSgaForEmployee).not.toHaveBeenCalled();
    });
});

describe('KaizenService implementation tasks done in DWMS', () => {
    function change(ownerId: string, toStatus = 'DONE', fromStatus = 'PENDING') {
        return { sourceModule: 'KAIZEN', sourceId: `kz-1:${ownerId}`, sourceParentId: 'kz-1', ownerId, toStatus, fromStatus } as never;
    }

    it('subscribes to kaizen implementation tasks', () => {
        const { service, taskEvents } = setup(draft());
        service.onModuleInit();
        expect(taskEvents.onStatusChange).toHaveBeenCalledWith('KAIZEN', expect.any(Function));
    });

    it("prompts the owner to record part 9 and submit when their own task is done", async () => {
        const { service, notifications } = setup(draft({ id: 'kz-1', status: 'IN_IMPLEMENTATION', actionTaken: null } as never));
        await service.implementationTaskDoneInDwms(change(RAISER.id));

        expect(notifications.create).toHaveBeenCalledWith(
            expect.objectContaining({
                employeeId: RAISER.id,
                type: 'ACTION_REQUIRED',
                actionUrl: '/kaizen/kz-1',
                message: expect.stringContaining('Record the action taken'),
            }),
        );
    });

    it("tells the owner when a team member's task is done", async () => {
        const { service, notifications } = setup(draft({ id: 'kz-1', status: 'IN_IMPLEMENTATION' } as never));
        await service.implementationTaskDoneInDwms(change('emp-member'));

        expect(notifications.create).toHaveBeenCalledWith(
            expect.objectContaining({ employeeId: RAISER.id, type: 'INFO', message: expect.stringContaining('Ann Wanjiru finished their part') }),
        );
    });

    it('does nothing outside implementation or for a status other than done', async () => {
        const verifying = setup(draft({ id: 'kz-1', status: 'PENDING_VERIFICATION' } as never));
        await verifying.service.implementationTaskDoneInDwms(change(RAISER.id));
        expect(verifying.notifications.create).not.toHaveBeenCalled();

        const implementing = setup(draft({ id: 'kz-1', status: 'IN_IMPLEMENTATION' } as never));
        await implementing.service.implementationTaskDoneInDwms(change(RAISER.id, 'PARTLY_DONE'));
        await implementing.service.implementationTaskDoneInDwms(change(RAISER.id, 'DONE', 'DONE'));
        expect(implementing.notifications.create).not.toHaveBeenCalled();
    });
});
