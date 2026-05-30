import { Module } from '@nestjs/common';
import { CalendarService } from './calendar.service';
import { CalendarController } from './calendar.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { NotificationsModule } from 'src/notifications/notifications.module';

@Module({
  imports: [PrismaModule, NotificationsModule],
  providers: [CalendarService],
  controllers: [CalendarController],
})
export class CalendarModule {}
