import { TenancyModule } from 'src/tenancy/tenancy.module';
import { ConfigModule } from '@nestjs/config';
import { Module } from '@nestjs/common';
import { ChargePreparationService } from './charge-preparation.service';
import { ChargePreparationController } from './charge-preparation.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ModuleGuard } from 'src/auth/guards/module.guard';

@Module({
  imports: [TenancyModule, ConfigModule, PrismaModule],
  controllers: [ChargePreparationController],
  providers: [ChargePreparationService, ModuleGuard],
})
export class ChargePreparationModule {}
