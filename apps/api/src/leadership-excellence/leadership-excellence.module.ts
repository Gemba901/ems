import { Module } from '@nestjs/common';
import { StrategicDirectionModule } from './strategic-direction/strategic-direction.module';
import { OrganisationFrameworkModule } from './organisation-framework/organisation-framework.module';
import { PerformancePlanningModule } from './performance-planning/performance-planning.module';
import { ExecutionModule } from './execution/execution.module';
import { MonitoringControlModule } from './monitoring-control/monitoring-control.module';
import { ReviewsDevelopmentModule } from './reviews-development/reviews-development.module';
import { PerformanceIntelligenceModule } from './performance-intelligence/performance-intelligence.module';

@Module({
  imports: [
    StrategicDirectionModule,        // 01
    OrganisationFrameworkModule,     // 02
    PerformancePlanningModule,       // 03
    ExecutionModule,                 // 04
    MonitoringControlModule,         // 05
    ReviewsDevelopmentModule,        // 06
    PerformanceIntelligenceModule,   // 07
  ],
})
export class LeadershipExcellenceModule {}
