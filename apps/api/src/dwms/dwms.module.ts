import { Module } from '@nestjs/common';
import { DwmsController } from './dwms.controller';
import { DwmsService } from './dwms.service';
import { DwmsEscalationService } from './escalation.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { AuthModule } from 'src/auth/auth.module';
import { NotificationsModule } from 'src/notifications/notifications.module';

@Module({
  imports: [PrismaModule, AuthModule, NotificationsModule],
  controllers: [DwmsController],
  providers: [DwmsService, DwmsEscalationService],
  exports: [DwmsService],
})
export class DwmsModule {}
