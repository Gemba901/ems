import { Module } from '@nestjs/common';
import { MaterialIntakeService } from './material-intake.service';
import { MaterialIntakeController } from './material-intake.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ModuleGuard } from 'src/auth/guards/module.guard';

@Module({
  imports: [PrismaModule],
  controllers: [MaterialIntakeController],
  providers: [MaterialIntakeService, ModuleGuard],
})
export class MaterialIntakeModule {}
