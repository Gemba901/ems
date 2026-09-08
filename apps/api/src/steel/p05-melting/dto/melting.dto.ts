import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsNumber,
  Min,
  IsBoolean,
  IsUUID,
  IsInt,
  IsDateString,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SteelMeltingStage, SteelMeltingStatus } from 'db';

// P05-A01 — Confirm furnace availability (create endpoint)
export class ConfirmFurnaceAvailabilityDto {
  @IsUUID()
  @IsNotEmpty({
    message: 'A closed charge preparation is required to start melting',
  })
  chargePreparationId!: string;

  @IsString()
  @IsOptional()
  furnaceId?: string;

  @IsUUID()
  @IsOptional()
  furnaceRefId?: string;

  @IsString()
  @IsOptional()
  plannedHeatRef?: string;

  @IsString()
  @IsOptional()
  operatorName?: string;

  @IsString()
  @IsOptional()
  shift?: string;
}

// P05-A02 — Furnace lining check
export class FurnaceLiningCheckDto {
  @IsString()
  @IsOptional()
  liningCampaignId?: string;

  @IsUUID()
  @IsOptional()
  liningRefId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  liningHeatCount?: number;

  @IsString()
  @IsNotEmpty({ message: 'Lining visual condition is required' })
  liningVisualCondition!: string;

  // Required only when re-submitting a stage that already has a logged
  // activity (i.e. this melting record has moved past A02). See
  // MeltingService.assertStageTransitionOrReedit.
  @IsString()
  @IsOptional()
  reason?: string;
}

// P05-A03 — Furnace systems check
export class FurnaceSystemsCheckDto {
  @IsBoolean()
  waterPressureFlowOk!: boolean;

  @IsBoolean()
  powerSystemOk!: boolean;

  @IsBoolean()
  hydraulicSystemOk!: boolean;

  @IsBoolean()
  alarmsOk!: boolean;

  @IsString()
  @IsOptional()
  reason?: string;
}

// P05-A04 — Previous heat readiness
export class PreviousHeatReadinessDto {
  @IsString()
  @IsOptional()
  previousHeatRef?: string;

  @IsString()
  @IsOptional()
  slagCleaningStatus?: string;

  @IsString()
  @IsOptional()
  readinessDelayReason?: string;

  @IsString()
  @IsOptional()
  reason?: string;
}

// P05-A05 — Verify charge recipe
export class VerifyChargeRecipeDto {
  @IsString()
  @IsOptional()
  materialLotRef?: string;

  @IsBoolean()
  actualWeightVsRecipeOk!: boolean;

  @IsString()
  @IsOptional()
  reason?: string;
}

// P05-A06 — Load charge
export class LoadChargeDto {
  @IsDateString()
  @IsOptional()
  loadingTime?: string;

  @IsString()
  @IsOptional()
  loadingEquipment?: string;

  @IsString()
  @IsOptional()
  chargeSequence?: string;

  @IsString()
  @IsOptional()
  reason?: string;
}

// P05-A07 — Start melting
export class StartMeltingDto {
  @IsDateString()
  @IsOptional()
  meltingStartTime?: string;

  @IsString()
  @IsOptional()
  meltingFurnaceId?: string;

  @IsString()
  @IsOptional()
  meltingOperator?: string;

  @IsString()
  @IsOptional()
  meltingChargeId?: string;

  @IsString()
  @IsOptional()
  reason?: string;
}

// P05-A08 — Monitor power
export class MonitorPowerDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  powerKwh?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  powerElapsedMinutes?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  powerTonnage?: number;

  @IsString()
  @IsOptional()
  powerInterruptions?: string;

  @IsString()
  @IsOptional()
  reason?: string;
}

// P05-A09 — Monitor temperature
export class MonitorTemperatureDto {
  @Type(() => Number)
  @IsNumber()
  temperatureCelsius!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  temperatureElapsedMinutes?: number;

  @IsString()
  @IsOptional()
  temperatureDelayReason?: string;

  @IsString()
  @IsOptional()
  reason?: string;
}

// P05-A10 — Record additions (optional/conditional — zero additions allowed)
export class RecordAdditionsDto {
  @IsArray()
  @IsOptional()
  additions?: Array<{
    itemName: string;
    quantity: number;
    reason?: string;
    approved?: boolean;
  }>;

  // Named editReason (not reason) to avoid clashing with the per-addition
  // item `reason` field above.
  @IsString()
  @IsOptional()
  editReason?: string;
}

// P05-A11 — Remove slag (optional/conditional — "not applicable" allowed)
export class RemoveSlagDto {
  @IsBoolean()
  @IsOptional()
  slagNotApplicable?: boolean;

  @IsDateString()
  @IsOptional()
  slagRemovalTime?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  slagQuantityEstimate?: number;

  @IsString()
  @IsOptional()
  slagIssueFound?: string;

  @IsString()
  @IsOptional()
  reason?: string;
}

// P05-A12 — Record melt output
export class RecordMeltOutputDto {
  @IsString()
  @IsOptional()
  outputChargeId?: string;

  @IsString()
  @IsOptional()
  outputFurnaceId?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  outputMeltTimeMinutes?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  outputEnergyTotalKwh?: number;

  @IsString()
  @IsOptional()
  outputAdditionsSummary?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001, { message: 'Output weight must be greater than zero' })
  outputWeightTonnes!: number;

  @IsString()
  @IsOptional()
  reason?: string;
}

// P05-A13 — Confirm liquid ready
export class ConfirmLiquidReadyDto {
  @IsBoolean()
  liquidReady!: boolean;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  liquidTemperatureCelsius?: number;

  @IsBoolean()
  liquidOperatorConfirmed!: boolean;

  @IsString()
  @IsOptional()
  reason?: string;
}

// P05-A14 — Refining handover (irreversible)
export class RefiningHandoverDto {
  @IsString()
  @IsOptional()
  notes?: string;
}

// Manual override for exceptional cases (e.g. putting a melting record ON_HOLD or CANCELLED)
export class UpdateMeltingStatusDto {
  @IsEnum(SteelMeltingStatus, { message: 'Invalid status' })
  status!: SteelMeltingStatus;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class QueryMeltingsDto {
  @IsUUID()
  @IsOptional()
  chargePreparationId?: string;

  @IsEnum(SteelMeltingStage)
  @IsOptional()
  stage?: SteelMeltingStage;

  @IsEnum(SteelMeltingStatus)
  @IsOptional()
  status?: SteelMeltingStatus;

  @IsString()
  @IsOptional()
  search?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @IsOptional()
  page: number = 1;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @IsOptional()
  limit: number = 10;
}
