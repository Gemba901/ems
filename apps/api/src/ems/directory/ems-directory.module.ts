import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { EmsDirectoryService } from './ems-directory.service';

/** Import this small module from LEX, Kaizen, SGA, DWMS or another EMS area.
 * No dependency on those consumers, registration, email, or their permissions. */
@Module({
  imports: [PrismaModule],
  providers: [EmsDirectoryService],
  exports: [EmsDirectoryService],
})
export class EmsDirectoryModule {}
