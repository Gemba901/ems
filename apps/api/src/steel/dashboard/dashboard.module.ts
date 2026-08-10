import { Module } from '@nestjs/common';
import { SteelDashboardService } from './dashboard.service';
import { SteelDashboardController } from './dashboard.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ModuleGuard } from 'src/auth/guards/module.guard';

@Module({
  imports: [PrismaModule],
  controllers: [SteelDashboardController],
  providers: [SteelDashboardService, ModuleGuard],
})
export class SteelDashboardModule {}
