import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from 'src/auth/auth.module';
import { DwmsModule } from 'src/dwms/dwms.module';
import { KaizenModule } from 'src/kaizen/kaizen.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { ModuleGuard } from 'src/auth/guards/module.guard';
import { PrismaModule } from 'src/prisma/prisma.module';
import { SgaModule } from 'src/sga/sga.module';
import { TenancyModule } from 'src/tenancy/tenancy.module';
import { ActionsController } from './actions/actions.controller';
import { ActionsService } from './actions/actions.service';
import { AnalyticsController } from './analytics/analytics.controller';
import { AnalyticsService } from './analytics/analytics.service';
import { AreasController } from './areas/areas.controller';
import { AreasService } from './areas/areas.service';
import { AuditsController } from './audits/audits.controller';
import { AuditsService } from './audits/audits.service';
import { FiveSAccessService } from './five-s-access.service';
import { FiveSDwmsBackfillService } from './five-s-dwms-backfill.service';
import { FiveSDwmsSyncService } from './five-s-dwms-sync.service';
import { OverviewController } from './overview/overview.controller';
import { OverviewService } from './overview/overview.service';
import { RedTagsController } from './red-tags/red-tags.controller';
import { RedTagsService } from './red-tags/red-tags.service';
import { RoutinesController } from './routines/routines.controller';
import { RoutinesService } from './routines/routines.service';
import { FiveSSettingsController } from './settings/settings.controller';
import { FiveSSettingsService } from './settings/settings.service';
import { StandardsController } from './standards/standards.controller';
import { StandardsService } from './standards/standards.service';

// 5S Workplace Organisation (20 Keys, Key 1: Cleaning and Organising to Make Work Easy).
@Module({
    imports: [TenancyModule, ConfigModule, PrismaModule, AuthModule, DwmsModule, KaizenModule, SgaModule, NotificationsModule],
    controllers: [
        OverviewController,
        AnalyticsController,
        AreasController,
        AuditsController,
        ActionsController,
        RedTagsController,
        StandardsController,
        RoutinesController,
        FiveSSettingsController,
    ],
    providers: [
        ModuleGuard,
        FiveSAccessService,
        FiveSDwmsSyncService,
        FiveSDwmsBackfillService,
        OverviewService,
        AnalyticsService,
        AreasService,
        AuditsService,
        ActionsService,
        RedTagsService,
        StandardsService,
        RoutinesService,
        FiveSSettingsService,
    ],
})
export class FiveSModule {}
