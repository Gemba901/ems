import { Module } from '@nestjs/common';
import { SteelModule } from './p01-demand-planning/steel.module';
import { SteelSourcingModule } from './p02-sourcing/steel-sourcing.module';
import { MaterialIntakeModule } from './p03-material-intake/material-intake.module';
import { ChargePreparationModule } from './p04-charge-preparation/charge-preparation.module';
import { SteelDashboardModule } from './dashboard/dashboard.module';

/**
 * Steel is the parent business domain; P01 (demand & production planning),
 * P02 (sourcing/procurement), P03 (material intake & receiving) and P04
 * (raw material preparation, sorting, cutting and charge planning) are its
 * processes, composed here. SteelDashboardModule is a read-only aggregation
 * layer on top of them (recent activity feed for the Steel home page) — it
 * owns no transactional logic of its own.
 */
@Module({
  imports: [
    SteelModule,
    SteelSourcingModule,
    MaterialIntakeModule,
    ChargePreparationModule,
    SteelDashboardModule,
  ],
})
export class SteelDomainModule {}
