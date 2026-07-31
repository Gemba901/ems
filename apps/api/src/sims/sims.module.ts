import { Module } from '@nestjs/common';
import { SimsController } from './sims.controller';
import { SimsService } from './sims.service';
import { SimsReminderService } from './sims.reminder.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { ModuleGuard } from 'src/auth/guards/module.guard';
import { KaizenModule } from 'src/kaizen/kaizen.module';

@Module({
  imports: [PrismaModule, NotificationsModule, KaizenModule],
  controllers: [SimsController],
  providers: [SimsService, SimsReminderService, ModuleGuard],
})
export class SimsModule {}
