import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { OnboardingGuard } from './onboarding.guard';
import { OnboardingWorker } from './onboarding.worker';
import { WorkspaceDomainService } from './workspace-domain.service';
@Module({
  imports: [ConfigModule, PrismaModule, NotificationsModule],
  controllers: [OnboardingController],
  providers: [
    OnboardingService,
    OnboardingGuard,
    OnboardingWorker,
    WorkspaceDomainService,
  ],
})
export class OnboardingModule {}
