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
            create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'kz-new', ...data })),
            update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...kaizen, ...data })),
            delete: jest.fn().mockResolvedValue(kaizen),
        },
        employee: {
            findFirst: jest.fn().mockResolvedValue(employee),
            findMany: jest.fn().mockResolvedValue([]),
            count: jest.fn().mockImplementation(({ where }) => Promise.resolve(where.id.in.length)),
        },
        userOrganization: { findMany: jest.fn().mockResolvedValue(roles.map((name) => ({ role: { name } }))) },
        kaizenReview: { create: jest.fn() },
        $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((fn: (tx: typeof prisma) => unknown) => fn(prisma));
    const notifications = { createMany: jest.fn() };
    const service = new KaizenService(prisma as never, notifications as never);
    return { service, prisma, notifications };
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
