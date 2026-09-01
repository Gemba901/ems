import { Module } from '@nestjs/common';
import { MasterDataService } from './master-data.service';
import { MasterDataController } from './master-data.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ModuleGuard } from 'src/auth/guards/module.guard';

@Module({
  imports: [PrismaModule],
  controllers: [MasterDataController],
  providers: [MasterDataService, ModuleGuard],
})
export class MasterDataModule {}
