import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsNumber,
  Min,
  IsBoolean,
  IsUUID,
  IsArray,
  ArrayNotEmpty,
  IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SteelChargeStage, SteelChargeStatus } from 'db';

// P04-A01 — Review production plan and material requirement
export class CreateChargePreparationDto {
  @IsUUID()
  @IsNotEmpty({
    message: 'A production plan is required to start charge preparation',
  })
  planId!: string;

  @IsBoolean()
  @IsOptional()
  stockAvailabilityConfirmed?: boolean;

  @IsString()
  @IsOptional()
  requirementNotes?: string;
}

// P04-A02 — Select raw material lots for preparation
export class SelectMaterialLotsDto {
  @IsArray()
  @ArrayNotEmpty({ message: 'At least one material lot must be selected' })
  @IsUUID('4', { each: true })
  intakeIds!: string[];

  @IsString()
  @IsOptional()
  lotSelectionNotes?: string;
}

// P04-A03 — Sort scrap by grade and usability
export class RecordScrapSortingDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.001, { message: 'Sorted weight must be greater than zero' })
  sortedWeightTonnes!: number;

  @IsString()
  @IsOptional()
  rejectedItemsNotes?: string;

  @IsString()
  @IsOptional()
  scrapGradeNotes?: string;
}

// P04-A04 — Cut oversized scrap if needed
export class RecordScrapCuttingDto {
  @IsBoolean()
  cuttingRequired!: boolean;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  cuttingTimeMinutes?: number;

  @IsString()
  @IsOptional()
  cuttingPowerOrGasUsed?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  cutQuantityTonnes?: number;
}

// P04-A05 — Remove contaminants and unsafe items
export class RecordContaminantRemovalDto {
  @IsBoolean()
  contaminantsRemoved!: boolean;

  @IsString()
  @IsOptional()
  removedItemsNotes?: string;

  @IsString()
  @IsOptional()
  contaminationIssueNotes?: string;
}

// P04-A06 — Prepare additives and alloys
export class PrepareAdditivesDto {
  @IsArray()
  @IsOptional()
  additivesPrepared?: Array<{
    itemName: string;
    quantity: number;
    lot?: string;
    issueRecord?: string;
  }>;

  @IsString()
  @IsOptional()
  additivesNotes?: string;
}

// P04-A07 — Check internal return scrap availability
export class RecordReturnScrapCheckDto {
  @IsBoolean()
  returnScrapAvailable!: boolean;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  returnScrapQtyTonnes?: number;

  @IsString()
  @IsOptional()
  returnScrapSource?: string;

  @IsString()
  @IsOptional()
  returnScrapGrade?: string;

  @IsString()
  @IsOptional()
  returnScrapContaminationNotes?: string;
}

// P04-A08 — Prepare furnace charge recipe
export class PrepareChargeRecipeDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.001, { message: 'Scrap weight must be greater than zero' })
  recipeScrapWeightTonnes!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  recipeDriWeightTonnes?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  recipeAlloyWeightTonnes?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  recipeAdditiveWeightTonnes?: number;

  @IsOptional()
  targetChemistry?: Record<string, unknown>;

  @IsString()
  @IsOptional()
  recipeNotes?: string;
}

// P04-A09 — Stage material near furnace charging area
export class StageChargeMaterialDto {
  @IsString()
  @IsNotEmpty({ message: 'Staging location is required' })
  stagingLocation!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001, { message: 'Staged weight must be greater than zero' })
  stagedWeightTonnes!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  stagingSequence?: number;
}

// P04-A10 — Verify actual material against charge recipe
export class VerifyChargeMaterialDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.001, { message: 'Actual weight must be greater than zero' })
  actualWeightTonnes!: number;

  @IsString()
  @IsOptional()
  actualGrade?: string;

  @IsBoolean()
  @IsOptional()
  varianceApproved?: boolean;

  @IsString()
  @IsOptional()
  verificationNotes?: string;
}

// P04-A11 — Create and release Charge ID
export class ReleaseChargeDto {
  @IsString()
  @IsOptional()
  releaseNotes?: string;
}

// P04-A12 — Close preparation handover to furnace
export class CloseFurnaceHandoverDto {
  @IsBoolean()
  furnaceReadinessConfirmed!: boolean;

  @IsString()
  @IsOptional()
  plannedHeatReference?: string;

  @IsString()
  @IsOptional()
  handoverNotes?: string;
}

// Manual override for exceptional cases (e.g. putting a charge prep ON_HOLD or CANCELLED)
export class UpdateChargePreparationStatusDto {
  @IsEnum(SteelChargeStatus, { message: 'Invalid status' })
  status!: SteelChargeStatus;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class QueryChargePreparationsDto {
  @IsUUID()
  @IsOptional()
  planId?: string;

  @IsEnum(SteelChargeStage)
  @IsOptional()
  stage?: SteelChargeStage;

  @IsEnum(SteelChargeStatus)
  @IsOptional()
  status?: SteelChargeStatus;

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
