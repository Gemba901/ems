import { Module } from '@nestjs/common';
import { SteelModule } from './p01-demand-planning/steel.module';
import { SteelSourcingModule } from './p02-sourcing/steel-sourcing.module';
import { MaterialIntakeModule } from './p03-material-intake/material-intake.module';

/**
 * Steel is the parent business domain; P01 (demand & production planning),
 * P02 (sourcing/procurement) and P03 (material intake & receiving) are its
 * processes, composed here.
 */
@Module({
  imports: [SteelModule, SteelSourcingModule, MaterialIntakeModule],
})
export class SteelDomainModule {}
