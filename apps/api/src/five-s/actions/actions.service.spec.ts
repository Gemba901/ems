import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { ActionsService } from './actions.service';

const ACTOR = { employeeId: 'emp-hod', organizationId: 'org-1' };

function action(overrides: Record<string, unknown> = {}) {
    return {
        id: 'action-1',
        reference: '5S-A-0004',
        source: 'AUDIT',
        audit: { id: 'audit-1', reference: '5S-AU-0002', auditDate: new Date('2026-10-20T00:00:00Z') },
        checkpointNo: 7,
        checkpointText: 'Floors are clean and dry',
        finding: 'Oil under press 3',
        ownerId: 'emp-owner',
        area: { id: 'area-1', name: 'Press Line', departmentId: 'dept-1', ownerId: 'emp-owner' },
        areaId: 'area-1',
        raisedKaizen: null,
        raisedSga: null,
        correctiveActions: [],
        ...overrides,
    };
}

function setup({ row = action() as unknown, coordinator = true, modules = ['FIVE_S', 'KAIZEN', 'SGA'] } = {}) {
    const prisma = {
        fiveSAction: { findFirst: jest.fn().mockResolvedValue(row) },
        organization: { findUnique: jest.fn().mockResolvedValue({ modules }) },
        fiveSActionEvent: { create: jest.fn() },
        fiveSAudit: { findMany: jest.fn().mockResolvedValue([]) },
        sga: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const access = {
        resolveActor: jest.fn().mockResolvedValue(ACTOR),
        visibleAreaWhere: jest.fn().mockReturnValue({}),
        canCoordinateArea: jest.fn().mockReturnValue(coordinator),
        assertCompanyEmployees: jest.fn(),
    };
    const kaizens = {
        createKaizenForEmployee: jest.fn().mockResolvedValue({ id: 'kz-1', kaizenOwner: { id: 'emp-owner', firstName: 'Ann', lastName: 'Wanjiru' } }),
    };
    const sgas = { createSgaForEmployee: jest.fn().mockResolvedValue({ id: 'sga-1' }) };
    const notifications = { create: jest.fn() };
    const service = new ActionsService(prisma as never, access as never, {} as never, kaizens as never, sgas as never, notifications as never);
    jest.spyOn(service, 'get').mockResolvedValue({} as never);
    return { service, prisma, kaizens, sgas, notifications };
}

describe('ActionsService.raiseKaizen (join 7)', () => {
    it('raises a Kaizen for the action owner, prefilled from the audit finding', async () => {
        const { service, prisma, kaizens, notifications } = setup();
        await service.raiseKaizen({} as never, 'action-1', {});

        expect(kaizens.createKaizenForEmployee).toHaveBeenCalledWith(
            'emp-owner',
            {
                trigger: 'AUDIT_OBSERVATION',
                conditionDescription: 'Press Line: Oil under press 3\nFound in 5S audit 5S-AU-0002, checkpoint 7 (Floors are clean and dry).',
                sourceFiveSActionId: 'action-1',
            },
            'org-1',
        );
        expect(prisma.fiveSActionEvent.create.mock.calls[0][0].data).toMatchObject({
            actionId: 'action-1',
            type: 'KAIZEN_RAISED',
            note: 'Raised a Kaizen for Ann Wanjiru',
        });
        expect(notifications.create).toHaveBeenCalledWith(expect.objectContaining({ employeeId: 'emp-owner', actionUrl: '/kaizen/kz-1' }));
    });

    it('uses a gemba walk trigger for a manual action and the picked owner', async () => {
        const { service, kaizens } = setup({ row: action({ source: 'MANUAL', audit: null }) });
        await service.raiseKaizen({} as never, 'action-1', { kaizenOwnerId: 'emp-other' });

        const [ownerId, dto] = kaizens.createKaizenForEmployee.mock.calls[0];
        expect(ownerId).toBe('emp-other');
        expect(dto).toMatchObject({ trigger: 'GEMBA_WALK_OBSERVATION', conditionDescription: 'Press Line: Oil under press 3\nFound in 5S action 5S-A-0004.' });
    });

    it('raises only one Kaizen per action', async () => {
        const { service, kaizens } = setup({ row: action({ raisedKaizen: { id: 'kz-0' } }) });
        await expect(service.raiseKaizen({} as never, 'action-1', {})).rejects.toBeInstanceOf(ConflictException);
        expect(kaizens.createKaizenForEmployee).not.toHaveBeenCalled();
    });

    it('refuses when Kaizen is off, there is no owner, or the actor has no rights', async () => {
        await expect(setup({ modules: ['FIVE_S'] }).service.raiseKaizen({} as never, 'action-1', {})).rejects.toBeInstanceOf(BadRequestException);
        await expect(setup({ row: action({ ownerId: null }) }).service.raiseKaizen({} as never, 'action-1', {})).rejects.toBeInstanceOf(BadRequestException);
        await expect(setup({ coordinator: false }).service.raiseKaizen({} as never, 'action-1', {})).rejects.toBeInstanceOf(ForbiddenException);
    });
});

function audits(failing: boolean[]) {
    return failing.map((fails, i) => ({
        id: `audit-${i}`,
        reference: `5S-AU-000${3 - i}`,
        auditDate: new Date(Date.UTC(2026, 9, 20 - i * 7)),
        responses: [{ locationCount: fails ? 2 : 0 }],
    }));
}

describe('ActionsService repeat findings -> SGA (join 8)', () => {
    it('is a repeat finding when the checkpoint failed in each of the last three audits', async () => {
        const { service, prisma } = setup();
        prisma.fiveSAudit.findMany.mockResolvedValue(audits([true, true, true]));
        const repeat = await service.repeatFinding(action() as never);

        expect(prisma.fiveSAudit.findMany.mock.calls[0][0]).toMatchObject({
            where: { areaId: 'area-1', status: 'SUBMITTED' },
            take: 3,
            select: { responses: { where: { checkpointNo: 7 } } },
        });
        expect(repeat).toEqual({
            audits: [
                { id: 'audit-0', reference: '5S-AU-0003', auditDate: '2026-10-20' },
                { id: 'audit-1', reference: '5S-AU-0002', auditDate: '2026-10-13' },
                { id: 'audit-2', reference: '5S-AU-0001', auditDate: '2026-10-06' },
            ],
            openSga: null,
        });
    });

    it('is not a repeat with a passing audit in between, too few audits, or a manual action', async () => {
        const passed = setup();
        passed.prisma.fiveSAudit.findMany.mockResolvedValue(audits([true, false, true]));
        await expect(passed.service.repeatFinding(action() as never)).resolves.toBeNull();

        const few = setup();
        few.prisma.fiveSAudit.findMany.mockResolvedValue(audits([true, true]));
        await expect(few.service.repeatFinding(action() as never)).resolves.toBeNull();

        const manual = setup();
        await expect(manual.service.repeatFinding(action({ source: 'MANUAL', checkpointNo: null }) as never)).resolves.toBeNull();
        expect(manual.prisma.fiveSAudit.findMany).not.toHaveBeenCalled();
    });

    it('raises an SGA for the area owner, prefilled from the repeat finding', async () => {
        const { service, prisma, sgas, notifications } = setup();
        prisma.fiveSAudit.findMany.mockResolvedValue(audits([true, true, true]));
        await service.raiseSga({} as never, 'action-1', {});

        expect(sgas.createSgaForEmployee).toHaveBeenCalledWith(
            'emp-owner',
            {
                startingReason: 'AUDIT_FINDING_OR_GEMBA_WALK_OBSERVATION',
                title: 'Press Line: Floors are clean and dry',
                problemDescription:
                    'Press Line: checkpoint 7 (Floors are clean and dry) failed in each of the last 3 5S audits (5S-AU-0003, 5S-AU-0002, 5S-AU-0001).\nLatest finding: Oil under press 3',
                mainDepartmentId: 'dept-1',
                workArea: 'Press Line',
                sourceFiveSActionId: 'action-1',
            },
            'org-1',
        );
        expect(prisma.fiveSActionEvent.create.mock.calls[0][0].data).toMatchObject({ actionId: 'action-1', type: 'SGA_RAISED' });
        expect(notifications.create).toHaveBeenCalledWith(expect.objectContaining({ employeeId: 'emp-owner', actionUrl: '/sga/sga-1' }));
    });

    it('refuses without a repeat, with an SGA already running, for non-coordinators, or without SGA', async () => {
        const notRepeat = setup();
        await expect(notRepeat.service.raiseSga({} as never, 'action-1', {})).rejects.toBeInstanceOf(BadRequestException);

        const running = setup();
        running.prisma.fiveSAudit.findMany.mockResolvedValue(audits([true, true, true]));
        running.prisma.sga.findFirst.mockResolvedValue({ id: 'sga-0', title: 'x', status: 'IN_PROGRESS' });
        await expect(running.service.raiseSga({} as never, 'action-1', {})).rejects.toBeInstanceOf(ConflictException);
        expect(running.sgas.createSgaForEmployee).not.toHaveBeenCalled();

        await expect(setup({ coordinator: false }).service.raiseSga({} as never, 'action-1', {})).rejects.toBeInstanceOf(ForbiddenException);
        await expect(setup({ modules: ['FIVE_S'] }).service.raiseSga({} as never, 'action-1', {})).rejects.toBeInstanceOf(BadRequestException);
    });
});
