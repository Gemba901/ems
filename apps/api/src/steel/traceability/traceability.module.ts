import { Module } from '@nestjs/common';
import { TraceabilityService } from './traceability.service';
import { TraceabilityController } from './traceability.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ModuleGuard } from 'src/auth/guards/module.guard';

@Module({
  imports: [PrismaModule],
  controllers: [TraceabilityController],
  providers: [TraceabilityService, ModuleGuard],
})
export class TraceabilityModule {}
