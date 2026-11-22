import { Module } from '@nestjs/common';
import { TenancyModule } from 'src/tenancy/tenancy.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { AuthModule } from 'src/auth/auth.module';
import { ModuleGuard } from 'src/auth/guards/module.guard';
import { ExecutionController } from './execution.controller';
import { ExecutionService } from './execution.service';

@Module({
  imports: [TenancyModule, PrismaModule, AuthModule],
  controllers: [ExecutionController],
  providers: [ExecutionService, ModuleGuard],
  exports: [ExecutionService],
})
export class ExecutionModule {}
