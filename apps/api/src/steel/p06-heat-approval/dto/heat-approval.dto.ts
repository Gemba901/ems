import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsNumber,
  Min,
  IsBoolean,
  IsUUID,
  IsDateString,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SteelHeatApprovalStage, SteelHeatApprovalStatus } from 'db';

// P06-A01 — Take liquid steel sample (create endpoint)
export class TakeSampleDto {
  @IsUUID()
  @IsNotEmpty({
    message:
      'A melting record handed over to refining is required to start heat approval',
  })
  meltingId!: string;

  @IsString()
  @IsOptional()
  sampleRef?: string;

  @IsDateString()
  @IsOptional()
  sampleTakenAt?: string;
}

// P06-A02 — Analyze sample in spectrometer/lab
export class AnalyzeSampleDto {
  @IsObject()
  @IsNotEmpty({ message: 'Chemistry composition results are required' })
  chemistryComposition!: Record<string, number>;

  @IsString()
  @IsOptional()
  labRef?: string;
}

// P06-A03 — Compare chemistry with required grade
export class CompareChemistryDto {
  @IsString()
  @IsOptional()
  requiredGrade?: string;

  @IsBoolean()
  chemistryMatchesGrade!: boolean;

  @IsString()
  @IsOptional()
  chemistryDeviationNotes?: string;
}

// P06-A04 — Decide correction requirement
export class DecideCorrectionDto {
  @IsBoolean()
  correctionRequired!: boolean;

  @IsString()
  @IsOptional()
  correctionReason?: string;
}

// P06-A05 — Add alloy, carbon raiser, lime, or correction material (conditional)
export class AddCorrectionMaterialDto {
  @IsBoolean()
  @IsOptional()
  correctionNotApplicable?: boolean;

  @IsOptional()
  correctionMaterials?: Array<{
    material: string;
    quantity: number;
    unit?: string;
  }>;
}

// P06-A06 — Re-test chemistry if required (conditional)
export class RetestChemistryDto {
  @IsBoolean()
  @IsOptional()
  retestNotApplicable?: boolean;

  @IsObject()
  @IsOptional()
  retestChemistryComposition?: Record<string, number>;

  // When a correction was required, explicitly false signals the re-test
  // still does not meet the required grade — the record loops back to
  // A04_DECIDE_CORRECTION for another correction attempt (capped; see
  // heat-approval.service.ts). Omitted/true means the re-test passed.
  @IsBoolean()
  @IsOptional()
  retestMatchesGrade?: boolean;
}

// P06-A07 — Check liquid steel temperature
export class CheckTemperatureDto {
  @Type(() => Number)
  @IsNumber()
  liquidTemperatureCelsius!: number;
}

// P06-A08 — Check ladle readiness and lining condition
export class CheckLadleReadinessDto {
  @IsString()
  @IsOptional()
  ladleId?: string;

  @IsString()
  @IsNotEmpty({ message: 'Ladle lining condition is required' })
  ladleLiningCondition!: string;

  @IsBoolean()
  ladleReady!: boolean;
}

// P06-A09 — Approve chemistry and temperature (irreversible authority gate)
export class ApproveChemistryTemperatureDto {
  @IsBoolean()
  chemistryTemperatureApproved!: boolean;

  @IsString()
  @IsOptional()
  approvalNotes?: string;
}

// P06-A10 — Create or confirm heat number
export class ConfirmHeatNumberDto {
  @IsString()
  @IsOptional()
  heatNumber?: string;
}

// P06-A11 — Give tapping approval
export class TappingApprovalDto {
  @IsBoolean()
  tappingApproved!: boolean;
}

// P06-A12 — Tap liquid steel into ladle
export class TapToLadleDto {
  @IsDateString()
  @IsOptional()
  tapStartTime?: string;

  @IsDateString()
  @IsOptional()
  tapEndTime?: string;

  @IsString()
  @IsOptional()
  tapOperator?: string;
}

// P06-A13 — Release approved heat to casting (irreversible)
export class ReleaseToCastingDto {
  @IsString()
  @IsOptional()
  notes?: string;
}

// Manual override for exceptional cases (e.g. putting a heat approval record ON_HOLD or CANCELLED)
export class UpdateHeatApprovalStatusDto {
  @IsEnum(SteelHeatApprovalStatus, { message: 'Invalid status' })
  status!: SteelHeatApprovalStatus;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class QueryHeatApprovalsDto {
  @IsUUID()
  @IsOptional()
  meltingId?: string;

  @IsEnum(SteelHeatApprovalStage)
  @IsOptional()
  stage?: SteelHeatApprovalStage;

  @IsEnum(SteelHeatApprovalStatus)
  @IsOptional()
  status?: SteelHeatApprovalStatus;

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
