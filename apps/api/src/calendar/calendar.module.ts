import { Module } from '@nestjs/common';
import { CalendarService } from './calendar.service';
import { CalendarController } from './calendar.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { ModuleGuard } from 'src/auth/guards/module.guard';

@Module({
  imports: [PrismaModule, NotificationsModule],
  providers: [CalendarService, ModuleGuard],
  controllers: [CalendarController],
})
export class CalendarModule {}
