import { ConflictException, NotFoundException } from '@nestjs/common';
import { AlertImprovementsService } from './alert-improvements.service';

const USER = { userId: 'user-1', organizationId: 'org-1', roleLevel: 'HOD' };

function alert(overrides: Record<string, unknown> = {}) {
    return {
        id: 'alert-1',
        title: '5S routine exception: Wipe press bed',
        description: 'Press Line · Press 3: the check was done with an exception.',
        isAbnormality: true,
        raiseCount: 3,
        againstUserId: 'emp-owner',
        departmentId: 'dept-1',
        raisedKaizen: null,
        raisedSga: null,
        ...overrides,
    };
}

function setup(row: unknown = alert()) {
    const prisma = { alertComment: { create: jest.fn() } };
    const dwms = {
        getEmployee: jest.fn().mockResolvedValue({ id: 'emp-actor' }),
        findVisibleAlert: jest.fn().mockImplementation(async () => {
            if (!row) throw new NotFoundException('Alert not found');
            return row;
        }),
    };
    const kaizens = { createKaizenForEmployee: jest.fn().mockResolvedValue({ id: 'kz-1', title: 'x', status: 'DRAFT' }) };
    const sgas = { createSgaForEmployee: jest.fn().mockResolvedValue({ id: 'sga-1', title: 'x', status: 'DRAFT' }) };
    const notifications = { create: jest.fn() };
    const service = new AlertImprovementsService(prisma as never, dwms as never, kaizens as never, sgas as never, notifications as never);
    return { service, prisma, kaizens, sgas, notifications };
}

describe('AlertImprovementsService (join 10)', () => {
    it('raises a Kaizen from an abnormality for the person it is against', async () => {
        const { service, prisma, kaizens, notifications } = setup();
        const result = await service.raiseKaizen(USER, 'alert-1', {});

        expect(kaizens.createKaizenForEmployee).toHaveBeenCalledWith(
            'emp-owner',
            {
                trigger: 'ABNORMALITY_ACTION_REQUIRED',
                title: '5S routine exception: Wipe press bed',
                conditionDescription:
                    '5S routine exception: Wipe press bed\nPress Line · Press 3: the check was done with an exception.\nRaised 3 times in DWMS.',
                sourceAlertId: 'alert-1',
            },
            'org-1',
        );
        expect(prisma.alertComment.create).toHaveBeenCalledWith({
            data: { alertId: 'alert-1', authorId: 'emp-actor', comment: 'Raised a Kaizen to fix this abnormality.' },
        });
        expect(notifications.create).toHaveBeenCalledWith(expect.objectContaining({ employeeId: 'emp-owner', actionUrl: '/kaizen/kz-1' }));
        expect(result).toEqual({ kaizen: { id: 'kz-1', title: 'x', status: 'DRAFT' } });
    });

    it('raises an SGA from a plain alert with the picked owner and the alert department', async () => {
        const { service, sgas } = setup(alert({ isAbnormality: false, raiseCount: 1 }));
        await service.raiseSga(USER, 'alert-1', { ownerId: 'emp-lead' });

        expect(sgas.createSgaForEmployee).toHaveBeenCalledWith(
            'emp-lead',
            expect.objectContaining({
                startingReason: 'ALERT_OR_ABNORMALITY_REQUIRING_TEAM_PROJECT',
                problemDescription: '5S routine exception: Wipe press bed\nPress Line · Press 3: the check was done with an exception.',
                mainDepartmentId: 'dept-1',
                sourceAlertId: 'alert-1',
            }),
            'org-1',
        );
    });

    it('defaults to the actor for a general alert and does not notify them', async () => {
        const { service, kaizens, notifications } = setup(alert({ againstUserId: null, isAbnormality: false }));
        await service.raiseKaizen(USER, 'alert-1', {});

        expect(kaizens.createKaizenForEmployee.mock.calls[0][0]).toBe('emp-actor');
        expect(kaizens.createKaizenForEmployee.mock.calls[0][1].trigger).toBe('ALERT_ACTION_REQUIRED');
        expect(notifications.create).not.toHaveBeenCalled();
    });

    it('raises one improvement per alert, and none for an alert the user cannot see', async () => {
        const raised = setup(alert({ raisedSga: { id: 'sga-0' } }));
        await expect(raised.service.raiseKaizen(USER, 'alert-1', {})).rejects.toBeInstanceOf(ConflictException);
        expect(raised.kaizens.createKaizenForEmployee).not.toHaveBeenCalled();

        const hidden = setup(null);
        await expect(hidden.service.raiseSga(USER, 'alert-1', {})).rejects.toBeInstanceOf(NotFoundException);
    });
});
