import { Module } from '@nestjs/common';
import { TenancyModule } from 'src/tenancy/tenancy.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { AuthModule } from 'src/auth/auth.module';
import { ModuleGuard } from 'src/auth/guards/module.guard';
import { PerformancePlanningController } from './performance-planning.controller';
import { PerformancePlanningService } from './performance-planning.service';

@Module({
  imports: [TenancyModule, PrismaModule, AuthModule],
  controllers: [PerformancePlanningController],
  providers: [PerformancePlanningService, ModuleGuard],
  exports: [PerformancePlanningService],
})
export class PerformancePlanningModule {}
