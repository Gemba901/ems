import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ModuleType, NotificationType } from 'db';
import { PrismaService } from 'src/prisma/prisma.service';

export const AUTO_CLOCK_OUT_GRACE_MS = 30 * 60_000;

@Injectable()
export class AttendanceAutoClockOutService {
    private readonly logger = new Logger(AttendanceAutoClockOutService.name);
    private running = false;

    constructor(private readonly prisma: PrismaService) {}

    @Cron(CronExpression.EVERY_MINUTE)
    async tick() {
        if (this.running) return;
        this.running = true;
        try {
            await this.processDue();
        } catch {
            this.logger.error('Automatic attendance clock-out scan failed; will retry next minute');
        } finally {
            this.running = false;
        }
    }

    async processDue(now = new Date()): Promise<number> {
        const records = await this.prisma.attendanceRecord.findMany({
            where: {
                clockOutAt: null,
                scheduledEndAt: { lte: new Date(now.getTime() - AUTO_CLOCK_OUT_GRACE_MS) },
                organization: { modules: { has: ModuleType.WORK } },
            },
            select: { id: true, employeeId: true, organizationId: true, version: true, scheduledEndAt: true, clockInAt: true, timezoneAtClockIn: true },
            orderBy: [{ scheduledEndAt: 'asc' }, { id: 'asc' }],
            take: 100,
        });
        let closed = 0;
        for (const record of records) {
            // A late clock-in after the cutoff closes at its start, never before it.
            const clockOutAt = new Date(Math.max(record.clockInAt.getTime(), record.scheduledEndAt!.getTime() + AUTO_CLOCK_OUT_GRACE_MS));
            try {
                const changed = await this.prisma.$transaction(async (tx) => {
                    // Manual clock-out/corrections and other API replicas may win first.
                    const result = await tx.attendanceRecord.updateMany({
                        where: { id: record.id, organizationId: record.organizationId, clockOutAt: null, version: record.version },
                        data: { clockOutAt, autoClockedOutAt: now, version: { increment: 1 } },
                    });
                    if (!result.count) return false;
                    const time = new Intl.DateTimeFormat('en-GB', {
                        timeZone: record.timezoneAtClockIn,
                        dateStyle: 'medium',
                        timeStyle: 'short',
                    }).format(clockOutAt);
                    // Store the notification atomically: a failed write rolls back the
                    // clock-out, and a retry cannot create a duplicate notification.
                    await tx.notification.create({
                        data: {
                            employeeId: record.employeeId,
                            type: NotificationType.INFO,
                            module: 'WORK',
                            title: 'You were automatically clocked out',
                            message: `Your attendance session was automatically closed at ${time} (${record.timezoneAtClockIn}) because it was still open 30 minutes after your scheduled finish. Contact HR if the recorded time needs correcting.`,
                            actionUrl: '/work/attendance',
                            metadata: { attendanceRecordId: record.id, clockOutAt: clockOutAt.toISOString(), reason: 'SCHEDULE_END_PLUS_30_MINUTES' },
                        },
                    });
                    return true;
                });
                if (changed) closed++;
            } catch {
                this.logger.error('Automatic attendance clock-out failed for a record; will retry next minute');
            }
        }
        return closed;
    }
}
