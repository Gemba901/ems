import { TenancyModule } from 'src/tenancy/tenancy.module';
import { ConfigModule } from '@nestjs/config';
import { Module } from '@nestjs/common';
import { KaizenController } from './kaizen.controller';
import { KaizenService } from './kaizen.service';
import { AuthModule } from 'src/auth/auth.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { ModuleGuard } from 'src/auth/guards/module.guard';


@Module({
  imports: [TenancyModule, ConfigModule, PrismaModule, AuthModule, NotificationsModule],
  controllers: [KaizenController],
  providers: [KaizenService, ModuleGuard],
  exports: [KaizenService],
})
export class KaizenModule {}
