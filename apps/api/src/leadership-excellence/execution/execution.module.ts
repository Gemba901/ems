import { Module } from '@nestjs/common';
import { TenancyModule } from '../../tenancy/tenancy.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../../auth/auth.module';
import { ModuleGuard } from '../../auth/guards/module.guard';
import { PerformancePlanningModule } from '../performance-planning/performance-planning.module';
import { ExecutionController } from './execution.controller';
import { ExecutionService } from './execution.service';

@Module({
  imports: [TenancyModule, PrismaModule, AuthModule, PerformancePlanningModule],
  controllers: [ExecutionController],
  providers: [ExecutionService, ModuleGuard],
  exports: [ExecutionService],
})
export class ExecutionModule {}
