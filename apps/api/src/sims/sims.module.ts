import { Module } from '@nestjs/common';
import { SimsController } from './sims.controller';
import { SimsService } from './sims.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { NotificationsModule } from 'src/notifications/notifications.module';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [SimsController],
  providers: [SimsService],
})
export class SimsModule {}
