import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsNumber,
  Min,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { HeatChargeMaterialCategory, HeatCycleEventType } from 'db';

// Material charging (P05-A06 Load Charge and P05-A10 Record Additions) —
// one row per material charged into the heat, supporting multiple materials
// per heat rather than a single aggregate weight.
export class AddHeatMaterialChargeDto {
  @IsString()
  @IsNotEmpty({ message: 'Material is required' })
  material!: string;

  @IsEnum(HeatChargeMaterialCategory)
  materialCategory!: HeatChargeMaterialCategory;

  @IsString()
  @IsOptional()
  grade?: string;

  @IsString()
  @IsOptional()
  batchRef?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  plannedQuantity?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'Actual quantity must be non-negative' })
  actualQuantity!: number;

  @IsString()
  @IsNotEmpty({ message: 'Unit is required' })
  unit!: string;

  @IsDateString()
  @IsOptional()
  chargedAt?: string;
}

export class QueryHeatMaterialChargesDto {
  @IsEnum(HeatChargeMaterialCategory)
  @IsOptional()
  materialCategory?: HeatChargeMaterialCategory;
}

// Heat-cycle event log (P05-A07 onward) — temperature readings, alarms,
// delays, interventions, additions. The business has not defined a hard
// chronological-integrity rule (e.g. rejecting a backdated event), so
// occurredAt is accepted as given rather than enforced against prior events;
// flagged for confirmation if strict ordering is required.
export class RecordHeatCycleEventDto {
  @IsEnum(HeatCycleEventType)
  eventType!: HeatCycleEventType;

  @IsDateString()
  @IsOptional()
  occurredAt?: string;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  temperatureCelsius?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  quantity?: number;

  @IsString()
  @IsOptional()
  unit?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class QueryHeatCycleEventsDto {
  @IsEnum(HeatCycleEventType)
  @IsOptional()
  eventType?: HeatCycleEventType;
}
