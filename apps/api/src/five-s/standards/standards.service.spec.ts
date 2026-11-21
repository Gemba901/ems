import { BadRequestException } from '@nestjs/common';
import { StandardsService } from './standards.service';

const ACTOR = { employeeId: 'emp-hod', organizationId: 'org-1' };
const AREA = { id: 'area-1', name: 'Press Line', departmentId: 'dept-1', ownerId: 'emp-owner' };

function setup({ kaizen = null as unknown, sga = null as unknown } = {}) {
    const prisma = {
        kaizen: { findFirst: jest.fn().mockResolvedValue(kaizen) },
        sga: { findFirst: jest.fn().mockResolvedValue(sga) },
        fiveSStandard: { create: jest.fn().mockResolvedValue({ id: 'std-1' }) },
        fiveSChangeLog: { create: jest.fn() },
        $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((fn: (tx: typeof prisma) => unknown) => fn(prisma));
    const access = {
        resolveActor: jest.fn().mockResolvedValue(ACTOR),
        areaOrThrow: jest.fn().mockResolvedValue(AREA),
        canMaintainAreaStandards: jest.fn().mockReturnValue(true),
        assertCompanyEmployees: jest.fn(),
    };
    const service = new StandardsService(prisma as never, access as never);
    return { service, prisma };
}

const CLOSED_KAIZEN = {
    id: 'kz-1',
    title: 'Drip tray under press 3',
    status: 'VERIFIED_CLOSED',
    actionTaken: 'Fitted a drip tray and a weekly wipe-down',
    resultSaving: 'No more oil on the floor',
    conditionDescription: 'Oil under press 3',
};

describe('StandardsService: Standardise a closed Kaizen or SGA (join 12)', () => {
    it('prefills a standard from a closed Kaizen with the method that worked', async () => {
        const { service } = setup({ kaizen: CLOSED_KAIZEN });
        await expect(service.sourcePrefill({} as never, { kaizenId: 'kz-1' })).resolves.toEqual({
            kind: 'KAIZEN',
            id: 'kz-1',
            title: 'Drip tray under press 3',
            instructions: 'Fitted a drip tray and a weekly wipe-down\n\nResult: No more oil on the floor',
            changeNote: 'First issue, standardised from Kaizen "Drip tray under press 3"',
        });
    });

    it('prefills from a closed SGA using its implementation summary', async () => {
        const { service } = setup({
            sga: { id: 'sga-1', title: 'Stop filler jams', status: 'VERIFIED_CLOSED', implementationSummary: 'New guide rails', problemDescription: 'Jams' },
        });
        const prefill = await service.sourcePrefill({} as never, { sgaId: 'sga-1' });
        expect(prefill).toMatchObject({ kind: 'SGA', title: 'Stop filler jams', instructions: 'New guide rails' });
    });

    it('stores the typed link on the new draft', async () => {
        const { service, prisma } = setup({ kaizen: CLOSED_KAIZEN });
        await service.create({} as never, { areaId: 'area-1', title: 'Drip tray check', instructions: 'Empty the tray', sourceKaizenId: 'kz-1' });

        expect(prisma.fiveSStandard.create.mock.calls[0][0].data).toMatchObject({ sourceKaizenId: 'kz-1', sourceSgaId: null, status: 'DRAFT' });
    });

    it('refuses an improvement that is not verified and closed, or two sources at once', async () => {
        const open = setup({ kaizen: { ...CLOSED_KAIZEN, status: 'IN_IMPLEMENTATION' } });
        await expect(open.service.create({} as never, { areaId: 'area-1', title: 'Drip tray', instructions: 'Empty it', sourceKaizenId: 'kz-1' })).rejects.toBeInstanceOf(
            BadRequestException,
        );
        expect(open.prisma.fiveSStandard.create).not.toHaveBeenCalled();

        await expect(setup().service.sourcePrefill({} as never, { kaizenId: 'kz-1', sgaId: 'sga-1' })).rejects.toBeInstanceOf(BadRequestException);
    });
});
