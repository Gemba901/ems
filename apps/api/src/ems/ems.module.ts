import { TenancyModule } from 'src/tenancy/tenancy.module';
import { ConfigModule } from '@nestjs/config';
import { Module } from '@nestjs/common';
import { EmsService } from './ems.service';
import { EmsController } from './ems.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ModuleGuard } from 'src/auth/guards/module.guard';
import { DwmsModule } from 'src/dwms/dwms.module';

@Module({
  imports: [TenancyModule, ConfigModule, PrismaModule, DwmsModule],
  providers: [EmsService, ModuleGuard],
  controllers: [EmsController],
})
export class EmsModule {}
