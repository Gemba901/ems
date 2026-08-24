import { Module } from '@nestjs/common';
import { ConfigController } from './config.controller';
import { ConfigService } from './config.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ModuleGuard } from 'src/auth/guards/module.guard';

@Module({
  imports: [PrismaModule],
  controllers: [ConfigController],
  providers: [ConfigService, ModuleGuard],
})
export class SteelConfigModule {}
