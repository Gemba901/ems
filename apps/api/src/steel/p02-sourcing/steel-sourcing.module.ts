import { Module } from '@nestjs/common';
import { SteelSourcingService } from './steel-sourcing.service';
import { SteelSourcingController } from './steel-sourcing.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ModuleGuard } from 'src/auth/guards/module.guard';

@Module({
  imports: [PrismaModule],
  controllers: [SteelSourcingController],
  providers: [SteelSourcingService, ModuleGuard],
})
export class SteelSourcingModule {}
