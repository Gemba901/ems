import { Module } from '@nestjs/common';
import { TenancyModule } from '../../tenancy/tenancy.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../../auth/auth.module';
import { ModuleGuard } from '../../auth/guards/module.guard';
import { PerformancePlanningController } from './performance-planning.controller';
import { PerformancePlanningService } from './performance-planning.service';
import { PlanningReferencesService } from './planning-references.service';
import { PlanningEvidenceService } from './planning-evidence.service';
import { PlanningBackupService } from './planning-backup.service';
import { StrategicDirectionModule } from '../strategic-direction/strategic-direction.module';
import { OrganisationFrameworkModule } from '../organisation-framework/organisation-framework.module';
import { PerformanceIntelligenceModule } from '../performance-intelligence/performance-intelligence.module';
import { WorkScheduleService } from '../../work/work-schedule';

@Module({
  imports: [
    TenancyModule,
    PrismaModule,
    AuthModule,
    StrategicDirectionModule,
    OrganisationFrameworkModule,
    PerformanceIntelligenceModule,
  ],
  controllers: [PerformancePlanningController],
  providers: [
    PerformancePlanningService,
    PlanningReferencesService,
    PlanningEvidenceService,
    PlanningBackupService,
    WorkScheduleService,
    ModuleGuard,
  ],
  exports: [PerformancePlanningService],
})
export class PerformancePlanningModule {}
