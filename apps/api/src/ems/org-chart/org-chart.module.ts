import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "src/prisma/prisma.module";
import { TenancyModule } from "src/tenancy/tenancy.module";
import { ModuleGuard } from "src/auth/guards/module.guard";
import { EmsOrgChartController } from "./org-chart.controller";
import { EmsOrgChartService } from "./org-chart.service";
@Module({
  imports: [ConfigModule, PrismaModule, TenancyModule],
  controllers: [EmsOrgChartController],
  providers: [EmsOrgChartService, ModuleGuard],
  exports: [EmsOrgChartService],
})
export class EmsOrgChartModule {}
