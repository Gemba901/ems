import { Module } from '@nestjs/common';
import { TenancyModule } from 'src/tenancy/tenancy.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { AuthModule } from 'src/auth/auth.module';
import { ModuleGuard } from 'src/auth/guards/module.guard';
import { MonitoringControlController } from './monitoring-control.controller';
import { MonitoringControlService } from './monitoring-control.service';
import { VerificationService } from './verification/verification.service';
import { PerformanceService } from './performance/performance.service';
import { AlertsService } from './alerts/alerts.service';
import { AlertsSyncJob } from './alerts/alerts-sync.job';
import { DirectoryService } from './directory/directory.service';
import {
  MONITORING_EXECUTION_SOURCE,
  MONITORING_PLANNING_SOURCE,
} from './monitoring-control.sources';
import { MonitoringExecutionSource } from './monitoring-control.execution-source';
import { PerformancePlanningModule } from '../performance-planning/performance-planning.module';
import { ExecutionModule } from '../execution/execution.module';

@Module({
  // Imports only point upstream (03 plans, 04 execution).
  imports: [
    TenancyModule,
    PrismaModule,
    AuthModule,
    PerformancePlanningModule,
    ExecutionModule,
  ],
  controllers: [MonitoringControlController],
  providers: [
    MonitoringControlService,
    VerificationService,
    PerformanceService,
    AlertsService,
    AlertsSyncJob,
    DirectoryService,
    ModuleGuard,
    MonitoringExecutionSource,
    {
      provide: MONITORING_PLANNING_SOURCE,
      useExisting: MonitoringExecutionSource,
    },
    {
      provide: MONITORING_EXECUTION_SOURCE,
      useExisting: MonitoringExecutionSource,
    },
  ],
  exports: [MonitoringControlService],
})
export class MonitoringControlModule {}
