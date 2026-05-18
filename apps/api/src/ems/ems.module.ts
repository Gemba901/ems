import { Module } from '@nestjs/common';
import { EmsService } from './ems.service';
import { EmsController } from './ems.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [EmsService],
  controllers: [EmsController],
})
export class EmsModule {}
