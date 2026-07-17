import { Module } from '@nestjs/common';
import { SteelService } from './steel.service';
import { SteelController } from './steel.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ModuleGuard } from 'src/auth/guards/module.guard';

@Module({
  imports: [PrismaModule],
  controllers: [SteelController],
  providers: [SteelService, ModuleGuard],
})
export class SteelModule {}
