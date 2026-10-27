import { Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { AttendanceAutoClockOutService } from './attendance-auto-clock-out.service';

const end = new Date('2026-10-21T14:00:00Z'); // 17:00 in Nairobi
const cutoff = new Date('2026-10-21T14:30:00Z');
const now = new Date('2026-10-21T14:45:00Z');
const record = {
    id: 'attendance',
    employeeId: 'employee',
    organizationId: 'org',
    version: 2,
    scheduledEndAt: end,
    clockInAt: new Date('2026-10-21T06:00:00Z'),
    timezoneAtClockIn: 'Africa/Nairobi',
};

function setup(count = 1) {
    const tx = {
        attendanceRecord: { updateMany: jest.fn().mockResolvedValue({ count }) },
        notification: { create: jest.fn().mockResolvedValue({}) },
    };
    const db = {
        attendanceRecord: { findMany: jest.fn().mockResolvedValue([record]), fields: { scheduledEndAt: 'scheduledEndAt-ref' } },
        $transaction: jest.fn((fn: (client: unknown) => unknown) => fn(tx)),
    };
    return { service: new AttendanceAutoClockOutService(db as unknown as PrismaService), db, tx };
}

describe('automatic clock-out', () => {
    beforeEach(() => jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined));
    afterEach(() => jest.restoreAllMocks());

    it('scans only overdue open sessions that began before the scheduled finish, in enabled organizations', async () => {
        const { service, db } = setup();
        db.attendanceRecord.findMany.mockResolvedValue([]);
        expect(await service.processDue(cutoff)).toBe(0);
        expect(db.attendanceRecord.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    clockOutAt: null,
                    scheduledEndAt: { lte: end },
                    clockInAt: { lt: 'scheduledEndAt-ref' },
                    organization: { modules: { has: 'WORK' } },
                },
                take: 100,
            }),
        );
    });

    it('uses the snapshotted cutoff even when the worker catches up later and creates an in-app notification', async () => {
        const { service, tx } = setup();
        expect(await service.processDue(now)).toBe(1);
        expect(tx.attendanceRecord.updateMany).toHaveBeenCalledWith({
            where: { id: record.id, organizationId: record.organizationId, clockOutAt: null, version: 2 },
            data: { clockOutAt: cutoff, autoClockedOutAt: now, version: { increment: 1 } },
        });
        expect(tx.notification.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                employeeId: record.employeeId,
                module: 'WORK',
                type: 'INFO',
                actionUrl: '/work/attendance',
                message: expect.stringContaining('17:30'),
                metadata: expect.objectContaining({ attendanceRecordId: record.id, clockOutAt: cutoff.toISOString() }),
            }),
        });
    });

    it('does not notify when a manual clock-out, correction or another worker wins', async () => {
        const { service, tx } = setup(0);
        expect(await service.processDue(now)).toBe(0);
        expect(tx.notification.create).not.toHaveBeenCalled();
    });

    it('never places a late clock-in session clock-out before its start', async () => {
        const { service, db, tx } = setup();
        const late = new Date('2026-10-21T14:40:00Z');
        db.attendanceRecord.findMany.mockResolvedValue([{ ...record, clockInAt: late }]);
        await service.processDue(now);
        expect(tx.attendanceRecord.updateMany.mock.calls[0][0].data.clockOutAt).toEqual(late);
    });

    it('keeps the notification write inside the transaction and retries a failed record on the next scan', async () => {
        const { service, db, tx } = setup();
        tx.notification.create.mockRejectedValueOnce(new Error('storage unavailable'));
        expect(await service.processDue(now)).toBe(0);
        expect(await service.processDue(now)).toBe(1);
        expect(db.$transaction).toHaveBeenCalledTimes(2);
    });

    it('does not run overlapping scans within one instance and releases its lock after failure', async () => {
        const { service } = setup();
        let reject!: (error: Error) => void;
        const process = jest
            .spyOn(service, 'processDue')
            .mockImplementationOnce(
                () =>
                    new Promise((_, fail) => {
                        reject = fail;
                    }),
            )
            .mockResolvedValue(0);
        const first = service.tick();
        await service.tick();
        expect(process).toHaveBeenCalledTimes(1);
        reject(new Error('scan failed'));
        await first;
        await service.tick();
        expect(process).toHaveBeenCalledTimes(2);
    });
});
