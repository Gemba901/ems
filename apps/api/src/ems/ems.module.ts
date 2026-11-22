import { EmsDirectoryModule } from './directory/ems-directory.module';
import { EmsRegistrationService } from './ems-registration.service';
import { EmsDepartmentDirectoryController } from './ems-department-directory.controller';
import { EmsAccessController } from './ems-access.controller';
import { EmsAccountLinksService } from './ems-account-links';
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
import { EmsOrgChartModule } from './org-chart/org-chart.module';

@Module({
  imports: [
    EmsDirectoryModule,
    TenancyModule,
    ConfigModule,
    PrismaModule,
    DwmsModule,
    NotificationsModule,
    RateLimitModule,
    EmsOrgChartModule,
  ],
  providers: [
    EmsRegistrationService,
    EmsService,
    EmsInvitationsService,
    EmsAccountLinksService,
    ModuleGuard,
  ],
  controllers: [
    EmsController,
    EmsInvitationsController,
    EmsDepartmentDirectoryController,
    EmsAccessController,
  ],
  exports: [EmsDirectoryModule],
})
export class EmsModule {}
