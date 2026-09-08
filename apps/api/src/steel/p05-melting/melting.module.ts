import { Module } from '@nestjs/common';
import { MeltingService } from './melting.service';
import { MeltingController } from './melting.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ModuleGuard } from 'src/auth/guards/module.guard';

@Module({
  imports: [PrismaModule],
  controllers: [MeltingController],
  providers: [MeltingService, ModuleGuard],
})
export class MeltingModule {}
