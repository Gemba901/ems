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
import { DirectoryService } from './directory/directory.service';
import {
  MONITORING_EXECUTION_SOURCE,
  MONITORING_PLANNING_SOURCE,
  UnavailableExecutionSource,
  UnavailablePlanningSource,
} from './monitoring-control.sources';
import { SampleCallerInterceptor } from './monitoring-control.sample-interceptor';
import {
  SampleMonitoringSource,
  sampleDataEnabled,
} from './monitoring-control.sample-source';

// DEV ONLY: LEX05_SAMPLE_DATA=true serves sample Area 03/04 data (never in production).
const sample = sampleDataEnabled();

@Module({
  // Later, once 03 and 04 export their providers: PerformancePlanningModule,
  // ExecutionModule. Imports only point upstream.
  imports: [TenancyModule, PrismaModule, AuthModule],
  controllers: [MonitoringControlController],
  providers: [
    MonitoringControlService,
    VerificationService,
    PerformanceService,
    AlertsService,
    DirectoryService,
    ModuleGuard,
    // TEMPORARY: swap useClass / useExisting for the real Area 03 / 04 providers.
    SampleMonitoringSource,
    SampleCallerInterceptor,
    sample
      ? {
          provide: MONITORING_PLANNING_SOURCE,
          useExisting: SampleMonitoringSource,
        }
      : {
          provide: MONITORING_PLANNING_SOURCE,
          useClass: UnavailablePlanningSource,
        },
    sample
      ? {
          provide: MONITORING_EXECUTION_SOURCE,
          useExisting: SampleMonitoringSource,
        }
      : {
          provide: MONITORING_EXECUTION_SOURCE,
          useClass: UnavailableExecutionSource,
        },
  ],
  exports: [MonitoringControlService],
})
export class MonitoringControlModule {}
