import { Module } from '@nestjs/common';
import { EmsService } from './ems.service';
import { EmsController } from './ems.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ModuleGuard } from 'src/auth/guards/module.guard';

@Module({
  imports: [PrismaModule],
  providers: [EmsService, ModuleGuard],
  controllers: [EmsController],
})
export class EmsModule {}
