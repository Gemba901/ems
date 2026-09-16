import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { UploadsModule } from '../uploads/uploads.module';
import { ScheduledJobsService } from './scheduled-jobs.service';
import { ReadinessService } from './readiness.service';
import { OperationsController } from './operations.controller';
@Global()
@Module({
  imports: [ConfigModule, PrismaModule, TenancyModule, UploadsModule],
  providers: [ScheduledJobsService, ReadinessService],
  controllers: [OperationsController],
  exports: [ScheduledJobsService],
})
export class OperationsModule {}
