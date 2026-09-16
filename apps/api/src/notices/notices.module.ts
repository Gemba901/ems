import { TenancyModule } from 'src/tenancy/tenancy.module';
import { ConfigModule } from '@nestjs/config';
import { Module } from '@nestjs/common';
import { NoticesController } from './notices.controller';
import { NoticesService } from './notices.service';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
    imports: [TenancyModule, ConfigModule, PrismaModule],
    controllers: [NoticesController],
    providers: [NoticesService],
})
export class NoticesModule {}
