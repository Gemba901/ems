import { Module } from '@nestjs/common';
import { SteelModule } from './p01-demand-planning/steel.module';
import { SteelSourcingModule } from './p02-sourcing/steel-sourcing.module';
import { MaterialIntakeModule } from './p03-material-intake/material-intake.module';
import { ChargePreparationModule } from './p04-charge-preparation/charge-preparation.module';
import { MeltingModule } from './p05-melting/melting.module';
import { HeatApprovalModule } from './p06-heat-approval/heat-approval.module';
import { TraceabilityModule } from './traceability/traceability.module';
import { SteelDashboardModule } from './dashboard/dashboard.module';

/**
 * Steel is the parent business domain; P01 (demand & production planning),
 * P02 (sourcing/procurement), P03 (material intake & receiving), P04
 * (raw material preparation, sorting, cutting and charge planning), P05
 * (melting) and P06 (heat approval — chemistry correction, approval, and
 * tapping) are its processes, composed here. SteelDashboardModule is a
 * read-only aggregation layer on top of them (recent activity feed for the
 * Steel home page) — it owns no transactional logic of its own.
 */
@Module({
  imports: [
    SteelModule,
    SteelSourcingModule,
    MaterialIntakeModule,
    ChargePreparationModule,
    MeltingModule,
    HeatApprovalModule,
    TraceabilityModule,
    SteelDashboardModule,
  ],
})
export class SteelDomainModule {}
