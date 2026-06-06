import { Module } from '@nestjs/common';
import { LeaveService } from './leave.service';
import { LeaveController } from './leave.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ModuleGuard } from 'src/auth/guards/module.guard';
import { NotificationsModule } from 'src/notifications/notifications.module';

@Module({
    imports: [PrismaModule, NotificationsModule],
    providers: [LeaveService, ModuleGuard],
    controllers: [LeaveController],
})
export class LeaveModule {}
