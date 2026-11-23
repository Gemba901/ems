import {
  Controller,
  Get,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ModuleType } from "db";
import { TenantRequired } from "src/tenancy/tenant-route.decorator";
import { TrustedTenantContextGuard } from "src/tenancy/trusted-tenant-context.guard";
import { TenantGuard } from "src/tenancy/tenant.guard";
import type { TenantRequest } from "src/tenancy/tenant-context";
import { JwtAuthGuard } from "src/auth/guards/jwt-auth.guard";
import { RolesGuard } from "src/auth/guards/roles.guard";
import { ModuleGuard } from "src/auth/guards/module.guard";
import { Roles } from "src/auth/decorators/roles.decorator";
import { RequiresModule } from "src/auth/decorators/module.decorator";
import { LEX_ALL } from "../../common/lex-roles";
import { OrganogramService } from "./organogram.service";

/** GET /leadership-excellence/organisation-framework/organogram: the company's structure (read-only, everyone in LEX). */
@TenantRequired()
@Controller("leadership-excellence/organisation-framework/organogram")
@UseGuards(
  TrustedTenantContextGuard,
  JwtAuthGuard,
  TenantGuard,
  RolesGuard,
  ModuleGuard,
)
@RequiresModule(ModuleType.LEADERSHIP_EXCELLENCE)
@Roles(...LEX_ALL)
export class OrganogramController {
  constructor(private readonly organogram: OrganogramService) {}

  @Get()
  structure(@Req() request: TenantRequest) {
    const organizationId = request.tenant?.organizationId;
    if (!organizationId || !request.user?.userId)
      throw new UnauthorizedException("Company context is required");
    return this.organogram.getView(organizationId, request.user.userId);
  }
}
