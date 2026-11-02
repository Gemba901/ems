import { Module } from '@nestjs/common';
import { TenancyModule } from 'src/tenancy/tenancy.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { AuthModule } from 'src/auth/auth.module';
import { ModuleGuard } from 'src/auth/guards/module.guard';
import { OrganisationFrameworkController } from './organisation-framework.controller';
import { OrganisationFrameworkService } from './organisation-framework.service';

@Module({
  imports: [TenancyModule, PrismaModule, AuthModule],
  controllers: [OrganisationFrameworkController],
  providers: [OrganisationFrameworkService, ModuleGuard],
  exports: [OrganisationFrameworkService],
})
export class OrganisationFrameworkModule {}
