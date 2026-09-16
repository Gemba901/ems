import { TenancyModule } from 'src/tenancy/tenancy.module';
import { ConfigModule } from '@nestjs/config';
import { Module } from '@nestjs/common';
import { SteelService } from './steel.service';
import { SteelController } from './steel.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ModuleGuard } from 'src/auth/guards/module.guard';

@Module({
  imports: [TenancyModule, ConfigModule, PrismaModule],
  controllers: [SteelController],
  providers: [SteelService, ModuleGuard],
})
export class SteelModule {}
