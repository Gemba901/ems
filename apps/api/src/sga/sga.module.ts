import { TenancyModule } from 'src/tenancy/tenancy.module';
import { ConfigModule } from '@nestjs/config';
import { Module } from '@nestjs/common';
import { SgaController } from './sga.controller';
import { SgaService } from './sga.service';
import { AuthModule } from 'src/auth/auth.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { ModuleGuard } from 'src/auth/guards/module.guard';
import { DwmsModule } from 'src/dwms/dwms.module';


@Module({
  imports: [TenancyModule, ConfigModule, PrismaModule, AuthModule, NotificationsModule, DwmsModule],
  controllers: [SgaController],
  providers: [SgaService, ModuleGuard],
  exports: [SgaService],
})
export class SgaModule {}
