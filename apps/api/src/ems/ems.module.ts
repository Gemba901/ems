import { TenancyModule } from 'src/tenancy/tenancy.module';
import { ConfigModule } from '@nestjs/config';
import { Module } from '@nestjs/common';
import { EmsService } from './ems.service';
import { EmsController } from './ems.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ModuleGuard } from 'src/auth/guards/module.guard';
import { DwmsModule } from 'src/dwms/dwms.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { EmsInvitationsService } from './ems-invitations';
import { EmsInvitationsController } from './ems-invitations.controller';
import { RateLimitModule } from 'src/common/rate-limit/rate-limit.module';

@Module({
  imports: [TenancyModule, ConfigModule, PrismaModule, DwmsModule, NotificationsModule, RateLimitModule],
  providers: [EmsService, EmsInvitationsService, ModuleGuard],
  controllers: [EmsController, EmsInvitationsController],
})
export class EmsModule {}
