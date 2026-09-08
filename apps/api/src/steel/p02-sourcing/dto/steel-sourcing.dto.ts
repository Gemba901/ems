import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsNumber,
  Min,
  IsArray,
  IsDateString,
  IsBoolean,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  SteelMaterialType,
  SupplierApprovalStatus,
  SupplierRiskLevel,
  SteelSourcingStage,
  SteelSourcingStatus,
  SteelSourcingMaterialSource,
} from 'db';

// P02-A01 — Review material requirement from production plan
export class CreateSteelSourcingOrderDto {
  @IsUUID()
  @IsNotEmpty({
    message: 'A released production plan is required to start sourcing',
  })
  planId!: string;

  @IsString()
  @IsOptional()
  materialRequirementNotes?: string;

  @IsDateString()
  @IsOptional()
  requiredByDate?: string;
}

// P02-A02 — Identify material type needed
export class IdentifySteelMaterialTypeDto {
  @IsEnum(SteelMaterialType, { message: 'Invalid material type' })
  materialType!: SteelMaterialType;

  @IsString()
  @IsOptional()
  materialTypeNotes?: string;
}

// P02-A03 — Select material source: existing stock or an external supplier.
// Supplier fields are required only when source === EXTERNAL_SUPPLIER
// (validated in the service, since they're conditional on `source`).
export class SelectMaterialSourceDto {
  @IsEnum(SteelSourcingMaterialSource, { message: 'Invalid material source' })
  source!: SteelSourcingMaterialSource;

  @IsUUID()
  @IsOptional()
  supplierId?: string;

  @IsBoolean()
  @IsOptional()
  supplierApprovalConfirmed?: boolean;

  @IsString()
  @IsOptional()
  supplierCheckNotes?: string;

  @IsString()
  @IsOptional()
  stockFulfillmentNotes?: string;
}

// P02-A04 — Check supplier quality and rejection history
export class ReviewSteelSupplierRiskDto {
  @IsEnum(SupplierRiskLevel, { message: 'Invalid supplier risk level' })
  supplierRiskLevel!: SupplierRiskLevel;

  @IsString()
  @IsOptional()
  rejectionRateNotes?: string;

  @IsString()
  @IsOptional()
  complaintHistoryNotes?: string;
}

// P02-A05 — Collect price and availability confirmation
export class SteelSourcingQuotationItemDto {
  @IsUUID()
  @IsNotEmpty()
  supplierId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01, { message: 'Price must be greater than zero' })
  price!: number;

  @IsString()
  @IsOptional()
  currency?: string = 'USD';

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  quantityAvailable?: number;

  @IsDateString()
  @IsOptional()
  deliveryDate?: string;

  @IsString()
  @IsOptional()
  paymentTerms?: string;

  @IsString()
  @IsOptional()
  qualityRiskNotes?: string;
}

export class CollectSteelQuotationsDto {
  @IsArray()
  quotations!: SteelSourcingQuotationItemDto[];
}

// P02-A06 — Compare supplier options using QCD logic
export class SelectSteelSupplierDto {
  @IsUUID()
  @IsNotEmpty({ message: 'A selected supplier is required' })
  selectedSupplierId!: string;

  @IsString()
  @IsOptional()
  qcdComparisonNotes?: string;
}

// P02-A07 — Confirm technical specification and documents required
export class ConfirmSteelSourcingSpecDto {
  @IsString()
  @IsOptional()
  specificationRequirementNotes?: string;

  @IsBoolean()
  @IsOptional()
  certificateRequired?: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  documentsRequired?: string[];
}

// P02-A08 — Create purchase order
export class CreateSteelPurchaseOrderDto {
  @IsString()
  @IsNotEmpty({ message: 'PO number is required' })
  poNumber!: string;

  @IsString()
  @IsOptional()
  poItem?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001, { message: 'PO quantity must be greater than zero' })
  poQuantity!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  poPrice!: number;

  @IsString()
  @IsOptional()
  poCurrency?: string = 'USD';

  @IsString()
  @IsOptional()
  poDeliveryTerms?: string;
}

// P02-A09 — Confirm delivery schedule with supplier
export class ConfirmSteelDeliveryScheduleDto {
  @IsDateString()
  @IsOptional()
  confirmedDispatchDate?: string;

  @IsDateString()
  @IsOptional()
  confirmedArrivalDate?: string;

  @IsString()
  @IsOptional()
  vehicleContainerInfo?: string;
}

// P02-A10 — Prepare import/local logistics if applicable
export class PrepareSteelImportLogisticsDto {
  @IsString()
  @IsOptional()
  billOfLading?: string;

  @IsString()
  @IsOptional()
  countryOfOrigin?: string;

  @IsString()
  @IsOptional()
  portClearanceStatus?: string;

  @IsString()
  @IsOptional()
  importLogisticsNotes?: string;
}

// P02-A11 — Inform raw material intake team
export class InformSteelIntakeTeamDto {
  @IsString()
  @IsOptional()
  intakeNotifyNotes?: string;
}

// P02-A12 — Close sourcing handover to intake
export class CloseSteelSourcingHandoverDto {
  @IsString()
  @IsOptional()
  handoverNotes?: string;
}

export class UpdateSteelSourcingStatusDto {
  @IsEnum(SteelSourcingStatus, { message: 'Invalid status' })
  status!: SteelSourcingStatus;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class QuerySteelSourcingOrdersDto {
  @IsUUID()
  @IsOptional()
  planId?: string;

  @IsEnum(SteelSourcingStage)
  @IsOptional()
  stage?: SteelSourcingStage;

  @IsEnum(SteelSourcingStatus)
  @IsOptional()
  status?: SteelSourcingStatus;

  @IsEnum(SteelMaterialType)
  @IsOptional()
  materialType?: SteelMaterialType;

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

// ── Supplier master (needed to populate P02-A03 supplier selection) ──

export class CreateSupplierDto {
  @IsString()
  @IsNotEmpty({ message: 'Supplier name is required' })
  name!: string;

  @IsString()
  @IsOptional()
  code?: string;

  @IsArray()
  @IsEnum(SteelMaterialType, { each: true })
  @IsOptional()
  materialTypes?: SteelMaterialType[];

  @IsEnum(SupplierApprovalStatus)
  @IsOptional()
  approvalStatus?: SupplierApprovalStatus;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  qualityScore?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  deliveryScore?: number;

  @IsString()
  @IsOptional()
  contactPerson?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  country?: string;

  @IsBoolean()
  @IsOptional()
  isImportSource?: boolean;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateSupplierDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  code?: string;

  @IsArray()
  @IsEnum(SteelMaterialType, { each: true })
  @IsOptional()
  materialTypes?: SteelMaterialType[];

  @IsEnum(SupplierApprovalStatus)
  @IsOptional()
  approvalStatus?: SupplierApprovalStatus;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  qualityScore?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  deliveryScore?: number;

  @IsString()
  @IsOptional()
  contactPerson?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  country?: string;

  @IsBoolean()
  @IsOptional()
  isImportSource?: boolean;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class QuerySuppliersDto {
  @IsEnum(SteelMaterialType)
  @IsOptional()
  materialType?: SteelMaterialType;

  @IsEnum(SupplierApprovalStatus)
  @IsOptional()
  approvalStatus?: SupplierApprovalStatus;

  @IsString()
  @IsOptional()
  search?: string;

  // P02-A03 supplier selection always wants active suppliers only; Configuration-
  // style admin screens pass this to see the full list including deactivated ones.
  @IsOptional()
  includeInactive?: string;
}

// Records a document already uploaded to S3 (via the generic
// /uploads/presigned-url flow) against a sourcing order and stage.
export class CreateSteelSourcingAttachmentDto {
  @IsEnum(SteelSourcingStage)
  @IsNotEmpty({ message: 'Stage is required' })
  stage!: SteelSourcingStage;

  @IsString()
  @IsNotEmpty({ message: 'File name is required' })
  fileName!: string;

  @IsString()
  @IsNotEmpty({ message: 'File URL is required' })
  fileUrl!: string;
}
