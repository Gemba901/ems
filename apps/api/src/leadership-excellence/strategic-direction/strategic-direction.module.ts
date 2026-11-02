import { Module } from '@nestjs/common';
import { TenancyModule } from 'src/tenancy/tenancy.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { AuthModule } from 'src/auth/auth.module';
import { ModuleGuard } from 'src/auth/guards/module.guard';
import { StrategicDirectionController } from './strategic-direction.controller';
import { StrategicDirectionService } from './strategic-direction.service';

@Module({
  imports: [TenancyModule, PrismaModule, AuthModule],
  controllers: [StrategicDirectionController],
  providers: [StrategicDirectionService, ModuleGuard],
  exports: [StrategicDirectionService],
})
export class StrategicDirectionModule {}
