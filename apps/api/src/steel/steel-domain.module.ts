import { Module } from '@nestjs/common';
import { SteelModule } from './p01-demand-planning/steel.module';
import { SteelSourcingModule } from './p02-sourcing/steel-sourcing.module';
import { MaterialIntakeModule } from './p03-material-intake/material-intake.module';
import { ChargePreparationModule } from './p04-charge-preparation/charge-preparation.module';

/**
 * Steel is the parent business domain; P01 (demand & production planning),
 * P02 (sourcing/procurement), P03 (material intake & receiving) and P04
 * (raw material preparation, sorting, cutting and charge planning) are its
 * processes, composed here.
 */
@Module({
  imports: [
    SteelModule,
    SteelSourcingModule,
    MaterialIntakeModule,
    ChargePreparationModule,
  ],
})
export class SteelDomainModule {}
