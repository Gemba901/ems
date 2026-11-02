import { Module } from '@nestjs/common';
import { TenancyModule } from 'src/tenancy/tenancy.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { AuthModule } from 'src/auth/auth.module';
import { ModuleGuard } from 'src/auth/guards/module.guard';
import { PerformanceIntelligenceController } from './performance-intelligence.controller';
import { PerformanceIntelligenceService } from './performance-intelligence.service';

@Module({
  imports: [TenancyModule, PrismaModule, AuthModule],
  controllers: [PerformanceIntelligenceController],
  providers: [PerformanceIntelligenceService, ModuleGuard],
  exports: [PerformanceIntelligenceService],
})
export class PerformanceIntelligenceModule {}
