import { TenancyModule } from 'src/tenancy/tenancy.module';
import { ConfigModule } from '@nestjs/config';
import { Module } from '@nestjs/common';
import { MaterialIntakeService } from './material-intake.service';
import { MaterialIntakeController } from './material-intake.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ModuleGuard } from 'src/auth/guards/module.guard';

@Module({
  imports: [TenancyModule, ConfigModule, PrismaModule],
  controllers: [MaterialIntakeController],
  providers: [MaterialIntakeService, ModuleGuard],
})
export class MaterialIntakeModule {}
