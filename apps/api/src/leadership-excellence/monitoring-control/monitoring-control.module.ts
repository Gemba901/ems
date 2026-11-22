import { Module } from '@nestjs/common';
import { TenancyModule } from 'src/tenancy/tenancy.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { AuthModule } from 'src/auth/auth.module';
import { ModuleGuard } from 'src/auth/guards/module.guard';
import { MonitoringControlController } from './monitoring-control.controller';
import { MonitoringControlService } from './monitoring-control.service';

@Module({
  imports: [TenancyModule, PrismaModule, AuthModule],
  controllers: [MonitoringControlController],
  providers: [MonitoringControlService, ModuleGuard],
  exports: [MonitoringControlService],
})
export class MonitoringControlModule {}
