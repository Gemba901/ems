import { RulesCalendarModule } from './rules-calendar/rules-calendar.module'; // LEX 02.03
import { Module } from '@nestjs/common';
import { TenancyModule } from 'src/tenancy/tenancy.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { AuthModule } from 'src/auth/auth.module';
import { ModuleGuard } from 'src/auth/guards/module.guard';
import { OrganisationFrameworkController } from './organisation-framework.controller';
import { OrganisationFrameworkService } from './organisation-framework.service';

@Module({
  imports: [
    RulesCalendarModule, // LEX 02.03
TenancyModule, PrismaModule, AuthModule],
  controllers: [OrganisationFrameworkController],
  providers: [OrganisationFrameworkService, ModuleGuard],
  exports: [
    RulesCalendarModule, // LEX 02.03
OrganisationFrameworkService],
})
export class OrganisationFrameworkModule {}
