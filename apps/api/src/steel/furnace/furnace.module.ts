import { Module } from '@nestjs/common';
import { FurnaceService } from './furnace.service';
import { FurnaceController } from './furnace.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ModuleGuard } from 'src/auth/guards/module.guard';

@Module({
  imports: [PrismaModule],
  controllers: [FurnaceController],
  providers: [FurnaceService, ModuleGuard],
})
export class FurnaceModule {}
