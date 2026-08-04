import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsNumber,
  Min,
  IsDateString,
  IsBoolean,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  SteelMaterialType,
  SteelIntakeStage,
  SteelIntakeStatus,
  MaterialAcceptanceDecision,
} from 'db';

// P03-A01 — Record truck/container arrival at gate
export class CreateMaterialIntakeDto {
  @IsUUID()
  @IsNotEmpty({
    message: 'A sourcing order is required to record a material intake',
  })
  sourcingOrderId!: string;

  @IsString()
  @IsNotEmpty({ message: 'Vehicle/container number is required' })
  vehicleNumber!: string;

  @IsString()
  @IsOptional()
  driverName?: string;

  @IsString()
  @IsOptional()
  transporterName?: string;

  @IsDateString()
  @IsOptional()
  arrivalDateTime?: string;

  @IsString()
  @IsOptional()
  gateEntryRef?: string;
}

// P03-A02 — Verify purchase order and delivery documents
export class VerifyMaterialIntakeDocumentsDto {
  @IsBoolean()
  purchaseOrderVerified!: boolean;

  @IsString()
  @IsOptional()
  deliveryDocumentRef?: string;

  @IsString()
  @IsOptional()
  documentVerificationNotes?: string;
}

// P03-A03 — Send vehicle to weighbridge for gross weight
export class RecordGrossWeightDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.001, { message: 'Gross weight must be greater than zero' })
  grossWeightTonnes!: number;
}

// P03-A04 — Perform basic safety and access check
export class RecordSafetyCheckDto {
  @IsBoolean()
  safetyCheckPassed!: boolean;

  @IsString()
  @IsOptional()
  safetyCheckNotes?: string;
}

// P03-A05 — Assign unloading or inspection area
export class AssignUnloadingAreaDto {
  @IsString()
  @IsNotEmpty({ message: 'Unloading area is required' })
  unloadingArea!: string;
}

// P03-A06–A09 — Visual inspection, hazard/contamination, radiation, certificate/heat/grade
export class RecordInspectionDto {
  @IsString()
  @IsOptional()
  visualInspectionNotes?: string;

  @IsBoolean()
  @IsOptional()
  hazardOrContaminationFound?: boolean;

  @IsString()
  @IsOptional()
  hazardNotes?: string;

  @IsBoolean()
  @IsOptional()
  radiationCheckRequired?: boolean;

  @IsBoolean()
  @IsOptional()
  radiationCheckPassed?: boolean;

  @IsEnum(SteelMaterialType, { message: 'Invalid material type' })
  @IsOptional()
  materialType?: SteelMaterialType;

  @IsString()
  @IsOptional()
  grade?: string;

  @IsString()
  @IsOptional()
  heatNumber?: string;

  @IsString()
  @IsOptional()
  certificateRef?: string;
}

// P03-A10 — Decide accept, hold, or reject material
export class RecordAcceptanceDecisionDto {
  @IsEnum(MaterialAcceptanceDecision, {
    message: 'Invalid acceptance decision',
  })
  decision!: MaterialAcceptanceDecision;

  @IsString()
  @IsOptional()
  decisionNotes?: string;
}

// P03-A11 — Unload approved material safely
export class RecordUnloadingDto {
  @IsDateString()
  @IsOptional()
  unloadedAt?: string;
}

// P03-A12 — Capture tare weight (net weight is computed server-side)
export class RecordNetWeightDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: 'Tare weight cannot be negative' })
  tareWeightTonnes!: number;

  @IsDateString()
  @IsOptional()
  weighedAt?: string;
}

// P03-A13 — Store material in correct yard location
export class AssignYardLocationDto {
  @IsString()
  @IsNotEmpty({ message: 'Yard location is required' })
  yardLocation!: string;
}

// P03-A14 — Update stock and release for preparation/use
export class ReleaseToStockDto {
  @IsString()
  @IsOptional()
  stockReleaseNotes?: string;
}

// Manual override for exceptional cases (e.g. putting an intake back ON_HOLD or CANCELLED)
export class UpdateMaterialIntakeStatusDto {
  @IsEnum(SteelIntakeStatus, { message: 'Invalid status' })
  status!: SteelIntakeStatus;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class QueryMaterialIntakesDto {
  @IsUUID()
  @IsOptional()
  sourcingOrderId?: string;

  @IsEnum(SteelIntakeStage)
  @IsOptional()
  stage?: SteelIntakeStage;

  @IsEnum(SteelIntakeStatus)
  @IsOptional()
  status?: SteelIntakeStatus;

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
