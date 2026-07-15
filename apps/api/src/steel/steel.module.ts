import { Module } from '@nestjs/common';
import { SteelService } from './steel.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ModuleGuard } from 'src/auth/guards/module.guard';

@Module({
  imports: [PrismaModule],
  controllers: [],
  providers: [SteelService, ModuleGuard],
})
export class SteelModule {}
