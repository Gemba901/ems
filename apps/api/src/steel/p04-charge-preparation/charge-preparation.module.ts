import { Module } from '@nestjs/common';
import { ChargePreparationService } from './charge-preparation.service';
import { ChargePreparationController } from './charge-preparation.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ModuleGuard } from 'src/auth/guards/module.guard';

@Module({
  imports: [PrismaModule],
  controllers: [ChargePreparationController],
  providers: [ChargePreparationService, ModuleGuard],
})
export class ChargePreparationModule {}
