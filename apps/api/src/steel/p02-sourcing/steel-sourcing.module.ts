import { TenancyModule } from 'src/tenancy/tenancy.module';
import { ConfigModule } from '@nestjs/config';
import { Module } from '@nestjs/common';
import { SteelSourcingService } from './steel-sourcing.service';
import { SteelSourcingController } from './steel-sourcing.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ModuleGuard } from 'src/auth/guards/module.guard';

@Module({
  imports: [TenancyModule, ConfigModule, PrismaModule],
  controllers: [SteelSourcingController],
  providers: [SteelSourcingService, ModuleGuard],
})
export class SteelSourcingModule {}
