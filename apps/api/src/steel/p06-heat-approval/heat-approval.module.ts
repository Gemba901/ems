import { TenancyModule } from 'src/tenancy/tenancy.module';
import { ConfigModule } from '@nestjs/config';
import { Module } from '@nestjs/common';
import { HeatApprovalService } from './heat-approval.service';
import { HeatApprovalController } from './heat-approval.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ModuleGuard } from 'src/auth/guards/module.guard';

@Module({
  imports: [TenancyModule, ConfigModule, PrismaModule],
  controllers: [HeatApprovalController],
  providers: [HeatApprovalService, ModuleGuard],
})
export class HeatApprovalModule {}
