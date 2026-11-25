import { Module } from '@nestjs/common';
import { AuthModule } from '../../../auth/auth.module';
import { ModuleGuard } from '../../../auth/guards/module.guard';
import { PrismaModule } from '../../../prisma/prisma.module';
import { TenancyModule } from '../../../tenancy/tenancy.module';
import { PerformanceIntelligenceLibraryController } from './performance-intelligence-library.controller';
import { PerformanceIntelligenceLibraryService } from './performance-intelligence-library.service';

@Module({
  imports: [AuthModule, PrismaModule, TenancyModule],
  controllers: [PerformanceIntelligenceLibraryController],
  providers: [PerformanceIntelligenceLibraryService, ModuleGuard],
  exports: [PerformanceIntelligenceLibraryService],
})
export class PerformanceIntelligenceLibraryModule {}
