import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationsService } from 'src/notifications/notifications.service';
import { DwmsDashboardService } from './services/dashboard.service';
import { DwmsTaskEvents } from './services/dwms-task-events.service';

export { UserPayload } from './services/base.service';

@Injectable()
export class DwmsService extends DwmsDashboardService {
  constructor(
    prisma: PrismaService,
    notifications: NotificationsService,
    @Optional() taskEvents?: DwmsTaskEvents,
  ) {
    super(prisma, notifications, taskEvents);
  }
}
