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
import { CoreRecordsStructureSource } from "./organogram/core-records-structure.source";
import { ORGANISATION_STRUCTURE_SOURCE } from "./organogram/organisation-structure.contract";
import { PositionChartController } from "./positions/position-chart.controller";
import { PositionChartService } from "./positions/position-chart.service";
import { CoreRecordsPositionsSource } from "./positions/core-records-positions.source";
import { POSITION_CHART_SOURCE } from "./positions/position-chart.contract";

@Module({
  imports: [RulesCalendarModule, TenancyModule, PrismaModule, AuthModule],
  controllers: [OrganisationFrameworkController, OrganogramController, PositionChartController],
  providers: [
    OrganisationFrameworkService,
    ModuleGuard,
    OrganogramService,
    // 02.01's structure source. TEMPORARY: core records until the EMS service is on this branch; then bind EMS's service here.
    {
      provide: ORGANISATION_STRUCTURE_SOURCE,
      useClass: CoreRecordsStructureSource,
    },
    PositionChartService,
    // 02.02's positions source. TEMPORARY: worked out from core people records until EMS's service is on this branch.
    {
      provide: POSITION_CHART_SOURCE,
      useClass: CoreRecordsPositionsSource,
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
