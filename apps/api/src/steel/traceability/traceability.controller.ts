import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { TraceabilityService } from './traceability.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { ModuleGuard } from 'src/auth/guards/module.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { RequiresModule } from 'src/auth/decorators/module.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { Role } from 'src/common/enum/role.enum';
import { ModuleType } from 'db';

type AuthUser = { userId: string; organizationId: string; roleLevel: string };

// Same role scope as the rest of P01-P06 day-to-day access — this only
// surfaces data already visible through those processes' own endpoints.
const TRACEABILITY_ROLES = [
  Role.SUPER_ADMIN,
  Role.ADMIN,
  Role.MANAGEMENT,
  Role.HOD,
];

/** Read-only cross-process traceability for the Steel domain. */
@Controller('steel/traceability')
@UseGuards(JwtAuthGuard, RolesGuard, ModuleGuard)
@RequiresModule(ModuleType.STEEL)
@Roles(...TRACEABILITY_ROLES)
export class TraceabilityController {
  constructor(private traceabilityService: TraceabilityService) {}

  /**
   * GET /steel/traceability/heat/:heatNumber — resolves the full upstream
   * chain (P06 heat approval -> P05 melting -> P04 charge preparation ->
   * P03 material intakes -> P02 sourcing orders -> P01 production plans)
   * for a confirmed heat number.
   */
  @Get('heat/:heatNumber')
  getHeatTraceability(
    @Param('heatNumber') heatNumber: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.traceabilityService.getHeatTraceability(
      heatNumber,
      user.organizationId,
    );
  }
}
