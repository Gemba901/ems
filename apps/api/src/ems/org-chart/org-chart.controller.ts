import {
  Controller,
  Get,
  Req,
  UseGuards,
  UnauthorizedException,
} from "@nestjs/common";
import { TrustedTenantContextGuard } from "src/tenancy/trusted-tenant-context.guard";
import { TenantGuard } from "src/tenancy/tenant.guard";
import { TenantRequired } from "src/tenancy/tenant-route.decorator";
import type { TenantRequest } from "src/tenancy/tenant-context";
import { JwtAuthGuard } from "src/auth/guards/jwt-auth.guard";
import { ModuleGuard } from "src/auth/guards/module.guard";
import { RequiresModule } from "src/auth/decorators/module.decorator";
import { ModuleType } from "db";
import { EmsOrgChartService } from "./org-chart.service";
@Controller("ems/organisation/chart")
@TenantRequired()
@UseGuards(TrustedTenantContextGuard, JwtAuthGuard, TenantGuard, ModuleGuard)
@RequiresModule(ModuleType.EMS)
export class EmsOrgChartController {
  constructor(private readonly chart: EmsOrgChartService) {}
  @Get()
  read(@Req() request: TenantRequest) {
    if (!request.tenant?.organizationId)
      throw new UnauthorizedException("Company context is required");
    return this.chart.read(request.tenant.organizationId);
  }
}
