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
        $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((fn: (tx: typeof prisma) => unknown) => fn(prisma));
    const notifications = { createMany: jest.fn() };
    const service = new SgaService(prisma as never, notifications as never);
    return { service, prisma };
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
