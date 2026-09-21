import { TenancyModule } from 'src/tenancy/tenancy.module';
import { ConfigModule } from '@nestjs/config';
import { Module } from '@nestjs/common';
import { DwmsController } from './dwms.controller';
import { DwmsService } from './dwms.service';
import { DwmsOverdueAlertService } from './overdue-alert.service';
import { DwmsTaskInstanceSchedulerService } from './task-instance-scheduler.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { AuthModule } from 'src/auth/auth.module';
import { NotificationsModule } from 'src/notifications/notifications.module';

@Module({
  imports: [TenancyModule, ConfigModule, PrismaModule, AuthModule, NotificationsModule],
  controllers: [DwmsController],
  providers: [
    DwmsService,
    DwmsOverdueAlertService,
    DwmsTaskInstanceSchedulerService,
  ],
  exports: [DwmsService],
})
export class DwmsModule {}
