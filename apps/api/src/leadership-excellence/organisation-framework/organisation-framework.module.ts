import { EmsDirectoryModule } from 'src/ems/directory/ems-directory.module';
import { RulesCalendarModule } from "./rules-calendar/rules-calendar.module";
import { Module } from "@nestjs/common";
import { TenancyModule } from "src/tenancy/tenancy.module";
import { PrismaModule } from "src/prisma/prisma.module";
import { AuthModule } from "src/auth/auth.module";
import { ModuleGuard } from "src/auth/guards/module.guard";
import { OrganisationFrameworkController } from "./organisation-framework.controller";
import { OrganisationFrameworkService } from "./organisation-framework.service";
import { OrganogramController } from "./organogram/organogram.controller";
import { OrganogramService } from "./organogram/organogram.service";
import { EmsStructureSource } from "./ems/ems-structure.source";
import { ORGANISATION_STRUCTURE_SOURCE } from "./organogram/organisation-structure.contract";
import { PositionChartController } from "./positions/position-chart.controller";
import { PositionChartService } from "./positions/position-chart.service";
import { EmsPositionsSource } from "./ems/ems-positions.source";
import { POSITION_CHART_SOURCE } from "./positions/position-chart.contract";

@Module({
  imports: [EmsDirectoryModule, RulesCalendarModule, TenancyModule, PrismaModule, AuthModule],
  controllers: [OrganisationFrameworkController, OrganogramController, PositionChartController],
  providers: [
    OrganisationFrameworkService,
    ModuleGuard,
    OrganogramService,
    // EMS owns people and HOD records; LEX owns the unit presentation.
    {
      provide: ORGANISATION_STRUCTURE_SOURCE,
      useClass: EmsStructureSource,
    },
    PositionChartService,
    // Employee-backed chart until EMS supplies recorded positions.
    {
      provide: POSITION_CHART_SOURCE,
      useClass: EmsPositionsSource,
    },
  ],
  exports: [
    RulesCalendarModule,
    OrganisationFrameworkService,
    OrganogramService,
    PositionChartService,
  ],
})
export class OrganisationFrameworkModule {}
