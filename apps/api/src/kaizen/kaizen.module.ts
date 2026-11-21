import { TenancyModule } from 'src/tenancy/tenancy.module';
import { ConfigModule } from '@nestjs/config';
import { Module } from '@nestjs/common';
import { KaizenController } from './kaizen.controller';
import { KaizenService } from './kaizen.service';
import { AuthModule } from 'src/auth/auth.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { ModuleGuard } from 'src/auth/guards/module.guard';
import { DwmsModule } from 'src/dwms/dwms.module';
import { SgaModule } from 'src/sga/sga.module';
import { AlertImprovementsController } from './alert-improvements.controller';
import { AlertImprovementsService } from './alert-improvements.service';


@Module({
  imports: [TenancyModule, ConfigModule, PrismaModule, AuthModule, NotificationsModule, DwmsModule, SgaModule],
  controllers: [KaizenController, AlertImprovementsController],
  providers: [KaizenService, AlertImprovementsService, ModuleGuard],
  exports: [KaizenService],
})
export class KaizenModule {}
