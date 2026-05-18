import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationsService } from 'src/notifications/notifications.service';
import { Role } from 'src/common/enum/role.enum';

// Remind HODs about suggestions that have been waiting longer than this.
const REMINDER_THRESHOLD_DAYS = 3;

@Injectable()
export class SimsReminderService {
  private readonly logger = new Logger(SimsReminderService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async remindHODsAboutPendingSuggestions() {
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - REMINDER_THRESHOLD_DAYS);

    // Find suggestions that have been in a reviewable state for too long
    const staleSuggestions = await this.prisma.suggestion.findMany({
      where: {
        status: { in: ['UNDER_REVIEW', 'ON_HOLD'] },
        updatedAt: { lt: thresholdDate },
      },
      select: {
        id: true,
        title: true,
        updatedAt: true,
        organizationId: true,
        employee: {
          select: { departmentId: true },
        },
      },
    });

    if (staleSuggestions.length === 0) return;

    this.logger.log(`Sending HOD reminders for ${staleSuggestions.length} stale suggestion(s)`);

    // Group by (organizationId, departmentId) to send one batched reminder per HOD
    const groupKey = (orgId: string, deptId: string) => `${orgId}::${deptId}`;
    const groups = new Map<string, { organizationId: string; departmentId: string; count: number; ids: string[] }>();

    for (const s of staleSuggestions) {
      if (!s.employee?.departmentId) continue;
      const key = groupKey(s.organizationId, s.employee.departmentId);
      const existing = groups.get(key);
      if (existing) {
        existing.count++;
        existing.ids.push(s.id);
      } else {
        groups.set(key, {
          organizationId: s.organizationId,
          departmentId: s.employee.departmentId,
          count: 1,
          ids: [s.id],
        });
      }
    }

    for (const group of groups.values()) {
      const hods = await this.prisma.employee.findMany({
        where: {
          departmentId: group.departmentId,
          organizationId: group.organizationId,
          user: {
            organizations: {
              some: {
                organizationId: group.organizationId,
                role: { name: Role.HOD },
              },
            },
          },
        },
        select: { id: true },
      });

      if (hods.length === 0) continue;

      const message =
        group.count === 1
          ? `You have 1 suggestion awaiting your review for more than ${REMINDER_THRESHOLD_DAYS} days.`
          : `You have ${group.count} suggestions awaiting your review for more than ${REMINDER_THRESHOLD_DAYS} days.`;

      await this.notifications.createMany(
        hods.map((hod) => ({
          employeeId: hod.id,
          type: 'REMINDER' as const,
          module: 'SIMS',
          title: 'Pending suggestions need your review',
          message,
          actionUrl: '/sims/queue',
          metadata: { suggestionIds: group.ids },
        })),
      );
    }
  }
}
