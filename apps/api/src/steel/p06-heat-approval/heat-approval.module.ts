import { Module } from '@nestjs/common';
import { HeatApprovalService } from './heat-approval.service';
import { HeatApprovalController } from './heat-approval.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ModuleGuard } from 'src/auth/guards/module.guard';

@Module({
  imports: [PrismaModule],
  controllers: [HeatApprovalController],
  providers: [HeatApprovalService, ModuleGuard],
})
export class HeatApprovalModule {}
