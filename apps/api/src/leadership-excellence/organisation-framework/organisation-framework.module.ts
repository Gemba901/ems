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

@Module({
  imports: [RulesCalendarModule, TenancyModule, PrismaModule, AuthModule],
  controllers: [OrganisationFrameworkController, OrganogramController],
  providers: [
    OrganisationFrameworkService,
    ModuleGuard,
    OrganogramService,
    // 02.01's structure source. TEMPORARY: core records until the EMS service is on this branch; then bind EMS's service here.
    {
      provide: ORGANISATION_STRUCTURE_SOURCE,
      useClass: CoreRecordsStructureSource,
    },
  ],
  exports: [
    RulesCalendarModule,
    OrganisationFrameworkService,
    OrganogramService,
  ],
})
export class OrganisationFrameworkModule {}
